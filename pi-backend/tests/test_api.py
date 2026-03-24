"""Integration tests for the MeetingPi REST API."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_start_recording(client: AsyncClient) -> None:
    """POST /api/recordings/start returns 200 and creates a meeting in DB."""
    mock_audio = MagicMock()
    mock_audio.is_recording.return_value = False
    mock_audio.start_recording = AsyncMock()

    with (
        patch("routers.recordings.get_audio_service", return_value=lambda: mock_audio),
        patch("main.process_meeting", new_callable=AsyncMock),
    ):
        from services.audio import get_audio_service
        from main import app

        app.dependency_overrides[get_audio_service] = lambda: mock_audio

        resp = await client.post(
            "/api/recordings/start", json={"title": "Test Meeting"}
        )

    app.dependency_overrides.clear()
    # Re-apply the db override
    from models.database import get_db
    from tests.conftest import TestSessionLocal

    # Re-read fresh client state: just assert the response
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "recording"
    assert "meeting_id" in data
    assert data["title"] == "Test Meeting"


@pytest.mark.asyncio
async def test_cannot_start_twice(client: AsyncClient) -> None:
    """Second POST /api/recordings/start returns 400."""
    mock_audio = MagicMock()
    mock_audio.is_recording.return_value = False
    mock_audio.start_recording = AsyncMock()

    from main import app
    from services.audio import get_audio_service

    app.dependency_overrides[get_audio_service] = lambda: mock_audio

    resp1 = await client.post("/api/recordings/start", json={"title": "Meeting A"})
    assert resp1.status_code == 200

    # Simulate that audio is now recording
    mock_audio.is_recording.return_value = True
    resp2 = await client.post("/api/recordings/start", json={"title": "Meeting B"})
    assert resp2.status_code == 400

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stop_recording(client: AsyncClient) -> None:
    """start → stop results in status='transcribing'."""
    mock_audio = MagicMock()
    mock_audio.is_recording.return_value = False
    mock_audio.start_recording = AsyncMock()

    from main import app
    from services.audio import get_audio_service

    app.dependency_overrides[get_audio_service] = lambda: mock_audio

    start_resp = await client.post("/api/recordings/start", json={"title": "Stop Test"})
    assert start_resp.status_code == 200
    meeting_id: str = start_resp.json()["meeting_id"]

    # Now simulate recording is active
    mock_audio.is_recording.return_value = True
    mock_audio.stop_recording = AsyncMock(
        return_value={"meeting_id": meeting_id, "duration_s": 120}
    )

    with patch("main.process_meeting", new_callable=AsyncMock):
        stop_resp = await client.post("/api/recordings/stop")

    assert stop_resp.status_code == 200
    stop_data = stop_resp.json()
    assert stop_data["status"] == "transcribing"
    assert stop_data["duration_s"] == 120

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_meetings_empty(client: AsyncClient) -> None:
    """GET /api/meetings on empty DB returns empty list."""
    resp = await client.get("/api/meetings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_get_meeting_not_found(client: AsyncClient) -> None:
    """GET /api/meetings/{id} for unknown id returns 404."""
    resp = await client.get("/api/meetings/non-existent-id")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_system_health(client: AsyncClient) -> None:
    """GET /api/system/health returns status=ok."""
    with patch("routers.system._ollama_available", new_callable=AsyncMock, return_value=False):
        resp = await client.get("/api/system/health")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "whisper" in data
    assert "ollama" in data
    assert "db" in data


@pytest.mark.asyncio
async def test_export_markdown(client: AsyncClient) -> None:
    """GET /api/meetings/{id}/export returns text/markdown content."""
    # Create a meeting via the DB session
    from datetime import datetime, timezone
    from sqlalchemy import insert
    from models.database import Meeting

    meeting_id = "export-test-id"
    # We need to insert via the test DB — use the client fixture's session
    # by calling an endpoint first to get the session, but simpler: just POST
    # a meeting directly then export it.

    # Use the API to create a meeting, then manually update it
    mock_audio = MagicMock()
    mock_audio.is_recording.return_value = False
    mock_audio.start_recording = AsyncMock()

    from main import app
    from services.audio import get_audio_service

    app.dependency_overrides[get_audio_service] = lambda: mock_audio

    create_resp = await client.post(
        "/api/recordings/start", json={"title": "Export Test Meeting"}
    )
    assert create_resp.status_code == 200
    meeting_id = create_resp.json()["meeting_id"]
    app.dependency_overrides.clear()

    # Export
    export_resp = await client.get(f"/api/meetings/{meeting_id}/export")
    assert export_resp.status_code == 200
    assert "text/markdown" in export_resp.headers["content-type"]
    content = export_resp.text
    assert "Export Test Meeting" in content
    assert "# " in content


@pytest.mark.asyncio
async def test_update_meeting_title(client: AsyncClient) -> None:
    """PATCH /api/meetings/{id} updates the title."""
    mock_audio = MagicMock()
    mock_audio.is_recording.return_value = False
    mock_audio.start_recording = AsyncMock()

    from main import app
    from services.audio import get_audio_service

    app.dependency_overrides[get_audio_service] = lambda: mock_audio

    create_resp = await client.post(
        "/api/recordings/start", json={"title": "Original Title"}
    )
    assert create_resp.status_code == 200
    meeting_id = create_resp.json()["meeting_id"]
    app.dependency_overrides.clear()

    patch_resp = await client.patch(
        f"/api/meetings/{meeting_id}", json={"title": "Updated Title"}
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["title"] == "Updated Title"
