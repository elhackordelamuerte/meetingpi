"""Router for meeting CRUD and export endpoints."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import Meeting, get_db

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class MeetingListItem(BaseModel):
    id: str
    title: str
    started_at: datetime
    duration_s: Optional[int]
    status: str
    summary_preview: Optional[str]


class MeetingDetail(BaseModel):
    id: str
    title: str
    started_at: datetime
    ended_at: Optional[datetime]
    duration_s: Optional[int]
    status: str
    transcript: Optional[str]
    summary: Optional[str]
    error_msg: Optional[str]
    created_at: datetime


class MeetingListResponse(BaseModel):
    items: list[MeetingListItem]
    total: int
    page: int
    page_size: int


class UpdateMeeting(BaseModel):
    title: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _to_list_item(m: Meeting) -> MeetingListItem:
    preview: Optional[str] = None
    if m.summary:
        preview = m.summary[:150]
    return MeetingListItem(
        id=m.id,
        title=m.title,
        started_at=m.started_at,
        duration_s=m.duration_s,
        status=m.status,
        summary_preview=preview,
    )


def _format_duration(duration_s: Optional[int]) -> str:
    if not duration_s:
        return "N/A"
    minutes, seconds = divmod(duration_s, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h{minutes:02d}min"
    return f"{minutes}min{seconds:02d}s"


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("", response_model=MeetingListResponse)
async def list_meetings(
    page: int = 1,
    page_size: int = 20,
    search: str = "",
    status: str = "",
    db: AsyncSession = Depends(get_db),
) -> MeetingListResponse:
    """List meetings with optional search and status filter, paginated."""
    stmt = select(Meeting)

    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            Meeting.title.ilike(pattern) | Meeting.summary.ilike(pattern)  # type: ignore[operator]
        )
    if status:
        stmt = stmt.where(Meeting.status == status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total: int = total_result.scalar_one()

    stmt = (
        stmt.order_by(Meeting.started_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(stmt)
    meetings = result.scalars().all()

    return MeetingListResponse(
        items=[_to_list_item(m) for m in meetings],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{meeting_id}", response_model=MeetingDetail)
async def get_meeting(
    meeting_id: str,
    db: AsyncSession = Depends(get_db),
) -> MeetingDetail:
    """Retrieve a single meeting by ID."""
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")

    return MeetingDetail(
        id=meeting.id,
        title=meeting.title,
        started_at=meeting.started_at,
        ended_at=meeting.ended_at,
        duration_s=meeting.duration_s,
        status=meeting.status,
        transcript=meeting.transcript,
        summary=meeting.summary,
        error_msg=meeting.error_msg,
        created_at=meeting.created_at,
    )


@router.patch("/{meeting_id}", response_model=MeetingDetail)
async def update_meeting(
    meeting_id: str,
    body: UpdateMeeting,
    db: AsyncSession = Depends(get_db),
) -> MeetingDetail:
    """Update meeting title."""
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if body.title is not None:
        meeting.title = body.title

    await db.commit()
    await db.refresh(meeting)

    return MeetingDetail(
        id=meeting.id,
        title=meeting.title,
        started_at=meeting.started_at,
        ended_at=meeting.ended_at,
        duration_s=meeting.duration_s,
        status=meeting.status,
        transcript=meeting.transcript,
        summary=meeting.summary,
        error_msg=meeting.error_msg,
        created_at=meeting.created_at,
    )


@router.delete("/{meeting_id}", status_code=200)
async def delete_meeting(
    meeting_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Delete a meeting and its audio file if present."""
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if meeting.audio_path and os.path.exists(meeting.audio_path):
        try:
            os.remove(meeting.audio_path)
        except OSError:
            pass

    await db.delete(meeting)
    await db.commit()
    return {"deleted": meeting_id}


@router.get("/{meeting_id}/export")
async def export_meeting(
    meeting_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export meeting as a Markdown file download."""
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")

    date_str = meeting.started_at.strftime("%Y-%m-%d")
    duration_str = _format_duration(meeting.duration_s)
    safe_title = meeting.title.replace("/", "-").replace("\\", "-")

    content = f"""# {meeting.title}
**Date:** {meeting.started_at.strftime("%d/%m/%Y %H:%M")}  **Durée:** {duration_str}

## Compte-rendu

{meeting.summary or "_Résumé non disponible._"}

## Transcription complète

{meeting.transcript or "_Transcription non disponible._"}
"""

    filename = f"meeting_{date_str}_{safe_title}.md"
    return Response(
        content=content,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
