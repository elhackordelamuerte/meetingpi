"""Transcription service using whisper.cpp with optional ffmpeg segmentation."""

from __future__ import annotations

import asyncio
import os
import re
import tempfile
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

WHISPER_BIN: str = os.getenv("WHISPER_BIN", "/home/pi/whisper.cpp/main")
WHISPER_MODEL_PATH: str = os.getenv(
    "WHISPER_MODEL_PATH",
    "/home/pi/whisper.cpp/models/ggml-model-tiny.en.q5_1.bin",
)
WHISPER_THREADS: int = int(os.getenv("WHISPER_THREADS", "3"))
WHISPER_LANGUAGE: str = os.getenv("WHISPER_LANGUAGE", "fr")
SEGMENT_DURATION_S: int = 300  # 5 minutes per chunk
LONG_RECORDING_THRESHOLD_S: int = 1800  # 30 minutes

# Filler words to remove from transcripts (FR + EN)
_FILLER_PATTERN = re.compile(
    r"\b(um+|uh+|like|you know|euh+|donc voilà|voilà|hmm+|hm+|ah+|eh+)\b",
    re.IGNORECASE,
)


class TranscriptionService:
    """Handles audio transcription via whisper.cpp."""

    async def transcribe(self, audio_path: str) -> str:
        """
        Transcribe audio file.

        1. If duration > 30min, segment with ffmpeg into 5min chunks.
        2. Run whisper.cpp on each chunk.
        3. Concatenate results.
        4. Clean filler words.
        5. Return clean transcript.
        """
        duration = await _get_audio_duration(audio_path)

        if duration > LONG_RECORDING_THRESHOLD_S:
            segments = await self._segment_audio(audio_path)
        else:
            segments = [audio_path]

        parts: list[str] = []
        for segment_path in segments:
            text = await self._run_whisper(segment_path)
            parts.append(text)

        # Clean up temp segments (not the original file)
        if duration > LONG_RECORDING_THRESHOLD_S:
            for seg in segments:
                try:
                    os.remove(seg)
                    # Remove .txt companion file if created
                    txt_path = seg + ".txt"
                    if os.path.exists(txt_path):
                        os.remove(txt_path)
                except OSError:
                    pass

        raw_transcript = "\n".join(parts)
        return _clean_transcript(raw_transcript)

    async def _run_whisper(self, audio_path: str) -> str:
        """
        Run whisper.cpp binary on a single audio file.

        Whisper writes output to {audio_path}.txt.
        Timeout: 600s.
        """
        cmd = [
            WHISPER_BIN,
            "-m", WHISPER_MODEL_PATH,
            "-f", audio_path,
            "-otxt",
            "--language", WHISPER_LANGUAGE,
            "--threads", str(WHISPER_THREADS),
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(proc.communicate(), timeout=600)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise RuntimeError(f"Whisper timed out processing {audio_path}")

        if proc.returncode != 0:
            raise RuntimeError(
                f"Whisper exited with code {proc.returncode} for {audio_path}"
            )

        txt_path = audio_path + ".txt"
        if not os.path.exists(txt_path):
            raise RuntimeError(f"Whisper did not produce output file: {txt_path}")

        content = Path(txt_path).read_text(encoding="utf-8")
        try:
            os.remove(txt_path)
        except OSError:
            pass
        return content

    async def _segment_audio(self, audio_path: str) -> list[str]:
        """
        Split audio into 5-minute segments using ffmpeg.

        Returns list of segment file paths.
        """
        tmp_dir = tempfile.mkdtemp(prefix="meetingpi_seg_")
        pattern = os.path.join(tmp_dir, "seg_%03d.wav")

        cmd = [
            "ffmpeg",
            "-i", audio_path,
            "-f", "segment",
            "-segment_time", str(SEGMENT_DURATION_S),
            "-c", "copy",
            pattern,
            "-y",
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.communicate(), timeout=120)

        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg segmentation failed with code {proc.returncode}")

        segments = sorted(
            str(p) for p in Path(tmp_dir).glob("seg_*.wav")
        )
        if not segments:
            raise RuntimeError("ffmpeg produced no segments")
        return segments


async def _get_audio_duration(audio_path: str) -> float:
    """Return audio duration in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        audio_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
    try:
        return float(stdout.decode().strip())
    except (ValueError, AttributeError):
        return 0.0


def _clean_transcript(text: str) -> str:
    """
    Remove filler words and short lines from transcript.

    Removes:
    - Filler words (FR + EN): um, uh, like, you know, euh, donc, voilà, hmm...
    - Lines shorter than 15 characters (typically noise/empty headers)
    """
    cleaned_lines: list[str] = []
    for line in text.splitlines():
        line = _FILLER_PATTERN.sub("", line)
        # Collapse extra whitespace introduced by filler removal
        line = re.sub(r" {2,}", " ", line).strip()
        if len(line) >= 15:
            cleaned_lines.append(line)
    return "\n".join(cleaned_lines)


# Module-level singleton
_transcription_service = TranscriptionService()


def get_transcription_service() -> TranscriptionService:
    """FastAPI dependency that returns the TranscriptionService singleton."""
    return _transcription_service
