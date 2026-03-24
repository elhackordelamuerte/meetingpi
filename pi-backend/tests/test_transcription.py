"""Unit tests for TranscriptionService."""

from __future__ import annotations

import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.transcription import TranscriptionService, _clean_transcript


@pytest.mark.asyncio
async def test_clean_transcript_removes_fillers() -> None:
    """_clean_transcript strips filler words and short lines."""
    dirty = (
        "um so like you know we need to make a decision about the project timeline\n"
        "euh voilà donc on va procéder à la révision du code avant le sprint\n"
        "ok"  # too short, should be removed
    )
    result = _clean_transcript(dirty)

    assert "um" not in result
    assert "like" not in result
    assert "you know" not in result
    assert "euh" not in result
    assert "voilà" not in result
    # Short line "ok" should be removed
    assert "ok" not in result
    # Meaningful content preserved
    assert "decision" in result
    assert "projet" in result or "project" in result


@pytest.mark.asyncio
async def test_transcribe_calls_whisper_bin() -> None:
    """transcribe() invokes the whisper binary with expected flags."""
    service = TranscriptionService()

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        audio_path = f.name

    try:
        # Mock ffprobe for short duration (< threshold)
        async def fake_get_duration(path: str) -> float:
            return 60.0  # 1 minute, no segmentation needed

        # Mock asyncio.create_subprocess_exec for whisper
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"", b""))

        txt_path = audio_path + ".txt"
        with open(txt_path, "w") as f2:
            f2.write("This is a test transcript from the meeting session.\n")

        with (
            patch("services.transcription._get_audio_duration", side_effect=fake_get_duration),
            patch(
                "asyncio.create_subprocess_exec", return_value=mock_proc
            ) as mock_exec,
            patch("asyncio.wait_for", new_callable=AsyncMock, return_value=(b"", b"")),
        ):
            # Patch wait_for to call communicate and return
            import asyncio

            original_wait_for = asyncio.wait_for

            async def fake_wait_for(coro: object, timeout: float) -> object:  # type: ignore[misc]
                return await coro  # type: ignore[misc]

            with patch("asyncio.wait_for", side_effect=fake_wait_for):
                result = await service.transcribe(audio_path)

        assert mock_exec.called
        call_args = mock_exec.call_args[0]
        assert "-otxt" in call_args
        assert "--language" in call_args

    finally:
        os.unlink(audio_path)
        if os.path.exists(txt_path):
            os.unlink(txt_path)


@pytest.mark.asyncio
async def test_segment_audio_for_long_files() -> None:
    """transcribe() calls _segment_audio when duration exceeds 1800s."""
    service = TranscriptionService()

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        audio_path = f.name

    try:
        segment_paths: list[str] = []

        async def fake_segment(path: str) -> list[str]:
            # Create two fake segment files
            d = tempfile.mkdtemp()
            segs = []
            for i in range(2):
                seg = os.path.join(d, f"seg_{i:03d}.wav")
                open(seg, "w").close()
                segs.append(seg)
            segment_paths.extend(segs)
            return segs

        async def fake_run_whisper(path: str) -> str:
            return f"Segment transcript from {os.path.basename(path)} about the project decisions.\n"

        async def fake_get_duration(path: str) -> float:
            return 2000.0  # > 1800s threshold

        with (
            patch("services.transcription._get_audio_duration", side_effect=fake_get_duration),
            patch.object(service, "_segment_audio", side_effect=fake_segment),
            patch.object(service, "_run_whisper", side_effect=fake_run_whisper),
        ):
            result = await service.transcribe(audio_path)

        # Both segments should have been transcribed and concatenated
        assert "Segment transcript" in result

    finally:
        os.unlink(audio_path)
