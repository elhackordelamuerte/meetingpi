"""Audio recording service using arecord (ALSA) subprocess."""

from __future__ import annotations

import os
import signal
import subprocess
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

AUDIO_DEVICE: str = os.getenv("AUDIO_DEVICE", "plughw:1,0")


class AudioService:
    """Singleton-compatible service managing arecord subprocess lifecycle."""

    def __init__(self) -> None:
        self._process: Optional[subprocess.Popen[bytes]] = None
        self._current_meeting_id: Optional[str] = None
        self._started_at: Optional[datetime] = None

    async def start_recording(self, meeting_id: str, output_path: str) -> None:
        """
        Start arecord in a subprocess at 16kHz mono S16_LE.

        Raises:
            RuntimeError: If a recording is already in progress.
        """
        if self.is_recording():
            raise RuntimeError(
                f"Recording already in progress for meeting {self._current_meeting_id}"
            )

        cmd = [
            "arecord",
            "-D", AUDIO_DEVICE,
            "-r", "16000",
            "-c", "1",
            "-t", "wav",
            "-f", "S16_LE",
            output_path,
        ]

        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        self._current_meeting_id = meeting_id
        self._started_at = datetime.now(tz=timezone.utc)

        # Give arecord 1s to fail fast (wrong device, busy, etc.)
        import time as _time
        _time.sleep(1)
        if self._process.poll() is not None:
            stderr_out = self._process.stderr.read().decode(errors="replace") if self._process.stderr else ""
            self._process = None
            self._current_meeting_id = None
            self._started_at = None
            raise RuntimeError(f"arecord exited immediately: {stderr_out.strip()}")

    async def stop_recording(self) -> dict[str, object]:
        """
        Send SIGTERM to arecord, wait for clean exit.

        Returns:
            dict with meeting_id and duration_s.

        Raises:
            RuntimeError: If no recording is in progress.
        """
        if not self.is_recording():
            raise RuntimeError("No recording in progress")

        assert self._process is not None
        assert self._current_meeting_id is not None
        assert self._started_at is not None

        meeting_id = self._current_meeting_id
        started_at = self._started_at

        try:
            self._process.send_signal(signal.SIGTERM)
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait()
        finally:
            self._process = None
            self._current_meeting_id = None
            self._started_at = None

        ended_at = datetime.now(tz=timezone.utc)
        duration_s = int((ended_at - started_at).total_seconds())

        return {"meeting_id": meeting_id, "duration_s": duration_s}

    def is_recording(self) -> bool:
        """Return True if arecord subprocess is alive."""
        if self._process is None:
            return False
        # Poll to detect unexpected termination
        if self._process.poll() is not None:
            # Process died on its own
            self._process = None
            self._current_meeting_id = None
            self._started_at = None
            return False
        return True

    def get_status(self) -> dict[str, object]:
        """Return current recording status."""
        recording = self.is_recording()
        elapsed_s: Optional[int] = None
        if recording and self._started_at is not None:
            elapsed_s = int(
                (datetime.now(tz=timezone.utc) - self._started_at).total_seconds()
            )
        return {
            "is_recording": recording,
            "meeting_id": self._current_meeting_id,
            "started_at": self._started_at,
            "elapsed_s": elapsed_s,
        }


# Module-level singleton shared via FastAPI Depends
_audio_service = AudioService()


def get_audio_service() -> AudioService:
    """FastAPI dependency that returns the module-level AudioService singleton."""
    return _audio_service
