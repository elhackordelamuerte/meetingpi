"""Router for recording lifecycle endpoints: start, stop, status."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import Meeting, get_db
from services.audio import AudioService, get_audio_service

from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/recordings", tags=["recordings"])

RECORDINGS_DIR: str = os.getenv("RECORDINGS_DIR", "/home/cmoi/meetingpi/recordings")


# ── Schemas ──────────────────────────────────────────────────────────────────


class StartRecordingRequest(BaseModel):
    title: Optional[str] = None


class RecordingStarted(BaseModel):
    meeting_id: str
    status: str
    started_at: datetime
    title: str


class RecordingStopped(BaseModel):
    meeting_id: str
    status: str
    duration_s: int


class RecordingStatus(BaseModel):
    is_recording: bool
    meeting_id: Optional[str]
    started_at: Optional[datetime]
    elapsed_s: Optional[int]


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post("/start", response_model=RecordingStarted)
async def start_recording(
    body: StartRecordingRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    audio_service: AudioService = Depends(get_audio_service),
) -> RecordingStarted:
    """Start a new recording session."""
    if audio_service.is_recording():
        raise HTTPException(status_code=400, detail="A recording is already in progress")

    meeting_id = str(uuid.uuid4())
    title = body.title or f"Réunion {datetime.now(tz=timezone.utc).strftime('%d/%m/%Y %H:%M')}"
    audio_path = os.path.join(RECORDINGS_DIR, f"{meeting_id}.wav")
    now = datetime.now(tz=timezone.utc)

    meeting = Meeting(
        id=meeting_id,
        title=title,
        started_at=now,
        status="recording",
        audio_path=audio_path,
        created_at=now,
    )
    db.add(meeting)
    await db.commit()

    await audio_service.start_recording(meeting_id=meeting_id, output_path=audio_path)

    return RecordingStarted(
        meeting_id=meeting_id,
        status="recording",
        started_at=now,
        title=title,
    )


@router.post("/stop", response_model=RecordingStopped)
async def stop_recording(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    audio_service: AudioService = Depends(get_audio_service),
) -> RecordingStopped:
    """Stop the current recording and trigger transcription pipeline."""
    if not audio_service.is_recording():
        raise HTTPException(status_code=400, detail="No recording in progress")

    result = await audio_service.stop_recording()
    meeting_id: str = str(result["meeting_id"])
    duration_s: int = int(result["duration_s"])

    from sqlalchemy import select

    stmt = select(Meeting).where(Meeting.id == meeting_id)
    row = await db.execute(stmt)
    meeting = row.scalar_one_or_none()

    if meeting is not None:
        meeting.ended_at = datetime.now(tz=timezone.utc)
        meeting.duration_s = duration_s
        meeting.status = "transcribing"
        await db.commit()

    # Import here to avoid circular imports at module level
    from main import process_meeting  # noqa: PLC0415

    background_tasks.add_task(process_meeting, meeting_id)

    return RecordingStopped(
        meeting_id=meeting_id,
        status="transcribing",
        duration_s=duration_s,
    )


@router.get("/status", response_model=RecordingStatus)
async def get_status(
    audio_service: AudioService = Depends(get_audio_service),
) -> RecordingStatus:
    """Return current recording state."""
    status = audio_service.get_status()
    return RecordingStatus(
        is_recording=bool(status["is_recording"]),
        meeting_id=status.get("meeting_id"),  # type: ignore[arg-type]
        started_at=status.get("started_at"),  # type: ignore[arg-type]
        elapsed_s=status.get("elapsed_s"),  # type: ignore[arg-type]
    )
