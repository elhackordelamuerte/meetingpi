"""MeetingPi FastAPI application entry point."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.database import AsyncSessionLocal, Meeting, init_db
from routers import meetings, recordings, system
from services.summarizer import get_summarizer_service
from services.transcription import get_transcription_service

load_dotenv()

WHISPER_BIN: str = os.getenv("WHISPER_BIN", "/home/pi/whisper.cpp/main")
KEEP_AUDIO: bool = os.getenv("KEEP_AUDIO", "false").lower() == "true"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup: create DB tables and sanity-check whisper.cpp binary."""
    logger.info("MeetingPi starting up…")
    await init_db()
    logger.info("Database tables initialised")

    if not os.path.isfile(WHISPER_BIN):
        logger.warning(
            "whisper.cpp binary not found at %s — transcription will fail. "
            "Run scripts/setup.sh to install it.",
            WHISPER_BIN,
        )
    else:
        logger.info("whisper.cpp binary found: %s", WHISPER_BIN)

    yield

    logger.info("MeetingPi shutting down")


# ── App ───────────────────────────────────────────────────────────────────────


app = FastAPI(
    title="MeetingPi API",
    version="1.0.0",
    description="Local meeting transcription and summarisation API for Raspberry Pi",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Local network only — no internet exposure
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recordings.router)
app.include_router(meetings.router)
app.include_router(system.router)


@app.get("/")
async def root() -> dict[str, str]:
    """Root health check."""
    return {"status": "ok", "version": "1.0.0"}


# ── Background task ───────────────────────────────────────────────────────────


async def process_meeting(meeting_id: str) -> None:
    """
    Background task: transcribe audio then summarise.

    Uses its own DB session so it does not conflict with request sessions.
    """
    transcription_service = get_transcription_service()
    summarizer_service = get_summarizer_service()

    async with AsyncSessionLocal() as db:
        from sqlalchemy import select  # noqa: PLC0415

        result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
        meeting = result.scalar_one_or_none()

        if meeting is None:
            logger.error("process_meeting: meeting %s not found in DB", meeting_id)
            return

        try:
            # ── Step 1: Transcription ────────────────────────────────────────
            logger.info("--- [PIPELINE] STEP 1: TRANSCRIPTION START ---")
            logger.info("Meeting %s — audio path: %s", meeting_id, meeting.audio_path)
            meeting.status = "transcribing"
            await db.commit()

            if not meeting.audio_path:
                logger.error("Step 1 failed: No audio path found for meeting %s", meeting_id)
                raise RuntimeError("No audio path for meeting")

            if not os.path.exists(meeting.audio_path):
                logger.error("Step 1 failed: Audio file not found at %s", meeting.audio_path)
                raise RuntimeError(f"Audio file not found: {meeting.audio_path}")

            transcript = await transcription_service.transcribe(meeting.audio_path)
            meeting.transcript = transcript
            await db.commit()
            logger.info("--- [PIPELINE] STEP 1: DONE --- (%d characters)", len(transcript))

            # ── Step 2: Summarisation ────────────────────────────────────────
            logger.info("--- [PIPELINE] STEP 2: SUMMARIZATION START ---")
            meeting.status = "summarizing"
            await db.commit()

            try:
                summary = await summarizer_service.summarize(transcript)
                meeting.summary = summary
                await db.commit()
                logger.info("--- [PIPELINE] STEP 2: DONE ---")
            except Exception as e:
                logger.error("Step 2 failed: %s", e)
                raise

            # ── Step 3: Mark as done ─────────────────────────────────────────
            meeting.status = "done"
            logger.info("--- [PIPELINE] COMPLETE SUCCESS for meeting %s ---", meeting_id)

            # ── Step 4: Optionally delete audio file ─────────────────────────
            if not KEEP_AUDIO and meeting.audio_path and os.path.exists(meeting.audio_path):
                try:
                    os.remove(meeting.audio_path)
                    logger.info("Deleted audio file after processing: %s", meeting.audio_path)
                    meeting.audio_path = None
                except Exception as e:
                    logger.warning("Could not delete audio file %s: %s", meeting.audio_path, e)

        except Exception as exc:
            logger.error("--- [PIPELINE] FAILED at meeting %s ---", meeting_id)
            logger.error("Error details: %s", exc)
            meeting.status = "error"
            meeting.error_msg = str(exc)

        finally:
            await db.commit()
