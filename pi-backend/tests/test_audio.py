"""Unit tests for AudioService."""

from __future__ import annotations

import signal
import subprocess
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from services.audio import AudioService


@pytest.mark.asyncio
async def test_start_recording_creates_process() -> None:
    """start_recording launches arecord with correct arguments."""
    service = AudioService()

    mock_proc = MagicMock(spec=subprocess.Popen)
    mock_proc.poll.return_value = None  # process is alive

    with patch("services.audio.subprocess.Popen", return_value=mock_proc) as mock_popen:
        await service.start_recording(
            meeting_id="test-meeting-1",
            output_path="/tmp/test-meeting-1.wav",
        )

    mock_popen.assert_called_once()
    call_args = mock_popen.call_args[0][0]  # first positional arg = cmd list
    assert call_args[0] == "arecord"
    assert "-r" in call_args
    assert "16000" in call_args
    assert "-f" in call_args
    assert "S16_LE" in call_args
    assert "/tmp/test-meeting-1.wav" in call_args

    assert service._current_meeting_id == "test-meeting-1"
    assert service._started_at is not None


@pytest.mark.asyncio
async def test_stop_recording_sends_sigterm() -> None:
    """stop_recording sends SIGTERM to the arecord process."""
    service = AudioService()

    mock_proc = MagicMock(spec=subprocess.Popen)
    mock_proc.poll.return_value = None  # alive before stop
    mock_proc.wait.return_value = 0

    with patch("services.audio.subprocess.Popen", return_value=mock_proc):
        await service.start_recording(
            meeting_id="test-meeting-2",
            output_path="/tmp/test-meeting-2.wav",
        )

    result = await service.stop_recording()

    mock_proc.send_signal.assert_called_once_with(signal.SIGTERM)
    assert result["meeting_id"] == "test-meeting-2"
    assert isinstance(result["duration_s"], int)
    assert result["duration_s"] >= 0


@pytest.mark.asyncio
async def test_cannot_start_twice() -> None:
    """start_recording raises RuntimeError if already recording."""
    service = AudioService()

    mock_proc = MagicMock(spec=subprocess.Popen)
    mock_proc.poll.return_value = None  # process alive

    with patch("services.audio.subprocess.Popen", return_value=mock_proc):
        await service.start_recording(
            meeting_id="test-meeting-3",
            output_path="/tmp/test-meeting-3.wav",
        )

        with pytest.raises(RuntimeError, match="already in progress"):
            await service.start_recording(
                meeting_id="test-meeting-3b",
                output_path="/tmp/test-meeting-3b.wav",
            )


@pytest.mark.asyncio
async def test_is_recording_detects_dead_process() -> None:
    """is_recording returns False when the arecord process has died unexpectedly."""
    service = AudioService()

    mock_proc = MagicMock(spec=subprocess.Popen)
    # Simulate process starting alive, then dying
    mock_proc.poll.return_value = None

    with patch("services.audio.subprocess.Popen", return_value=mock_proc):
        await service.start_recording(
            meeting_id="test-meeting-4",
            output_path="/tmp/test-meeting-4.wav",
        )

    assert service.is_recording() is True

    # Simulate the process dying
    mock_proc.poll.return_value = 1  # non-None returncode = dead
    assert service.is_recording() is False
    assert service._current_meeting_id is None
    assert service._process is None
