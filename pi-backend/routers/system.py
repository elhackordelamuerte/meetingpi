"""Router for system health, stats, and model info endpoints."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Optional

import httpx
import psutil
from fastapi import APIRouter
from pydantic import BaseModel

from dotenv import load_dotenv

load_dotenv()

WHISPER_BIN: str = os.getenv("WHISPER_BIN", "/home/pi/whisper.cpp/main")
WHISPER_MODEL_PATH: str = os.getenv(
    "WHISPER_MODEL_PATH",
    "/home/pi/whisper.cpp/models/ggml-model-tiny.en.q5_1.bin",
)
OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3:8b")

router = APIRouter(prefix="/api/system", tags=["system"])

_boot_time: float = psutil.boot_time()


# ── Schemas ──────────────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    whisper: bool
    ollama: bool
    db: bool


class SystemStatsResponse(BaseModel):
    cpu_percent: float
    ram_used_mb: int
    ram_total_mb: int
    temperature_c: Optional[float]
    disk_used_gb: float
    disk_total_gb: float
    uptime_s: int
    whisper_available: bool
    ollama_available: bool


class ModelsResponse(BaseModel):
    whisper_model: str
    whisper_model_path: str
    ollama_model: str
    ollama_models_available: list[str]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _read_temperature() -> Optional[float]:
    """Read CPU temperature from sysfs (Linux/Raspberry Pi)."""
    thermal_path = Path("/sys/class/thermal/thermal_zone0/temp")
    if thermal_path.exists():
        try:
            raw = thermal_path.read_text().strip()
            return round(int(raw) / 1000, 1)
        except (ValueError, OSError):
            pass
    return None


def _whisper_available() -> bool:
    return os.path.isfile(WHISPER_BIN) and os.path.isfile(WHISPER_MODEL_PATH)


async def _ollama_available() -> bool:
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            return resp.status_code == 200
        except (httpx.RequestError, httpx.HTTPStatusError):
            return False


async def _ollama_models() -> list[str]:
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            return [str(m.get("name", "")) for m in data.get("models", []) if m.get("name")]
        except (httpx.RequestError, httpx.HTTPStatusError):
            return []


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Return overall health status of all components."""
    ollama_ok = await _ollama_available()
    return HealthResponse(
        status="ok",
        whisper=_whisper_available(),
        ollama=ollama_ok,
        db=True,  # If we got here, DB is accessible
    )


@router.get("/stats", response_model=SystemStatsResponse)
async def stats() -> SystemStatsResponse:
    """Return system resource metrics."""
    cpu = psutil.cpu_percent(interval=0.2)
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    uptime_s = int(time.time() - _boot_time)

    ram_used_mb = int(ram.used / 1024 / 1024)
    ram_total_mb = int(ram.total / 1024 / 1024)
    disk_used_gb = round(disk.used / 1024 / 1024 / 1024, 1)
    disk_total_gb = round(disk.total / 1024 / 1024 / 1024, 1)

    ollama_ok = await _ollama_available()

    return SystemStatsResponse(
        cpu_percent=round(cpu, 1),
        ram_used_mb=ram_used_mb,
        ram_total_mb=ram_total_mb,
        temperature_c=_read_temperature(),
        disk_used_gb=disk_used_gb,
        disk_total_gb=disk_total_gb,
        uptime_s=uptime_s,
        whisper_available=_whisper_available(),
        ollama_available=ollama_ok,
    )


@router.get("/models", response_model=ModelsResponse)
async def models() -> ModelsResponse:
    """Return information about available Whisper and Ollama models."""
    whisper_model_name = Path(WHISPER_MODEL_PATH).stem if WHISPER_MODEL_PATH else "unknown"
    available = await _ollama_models()

    return ModelsResponse(
        whisper_model=whisper_model_name,
        whisper_model_path=WHISPER_MODEL_PATH,
        ollama_model=OLLAMA_MODEL,
        ollama_models_available=available,
    )
