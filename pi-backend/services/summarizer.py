import logging
import os
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3:8b")
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "minimax/minimax-m2.5:free")

PROMPT_TEMPLATE = """\
Tu es un assistant expert en synthèse de réunions professionnelles.
Voici la transcription d'une réunion :

---
{transcript}
---

Génère un compte-rendu structuré en Markdown avec :
## Résumé (2-3 phrases)
## Participants identifiés
## Décisions prises
## Actions à suivre (avec responsable si mentionné)
## Points en suspens

Sois concis, factuel, et utilise des puces. Réponds uniquement en français.\
"""


class SummarizerService:
    """Calls Ollama's local inference API with fallback to OpenRouter."""

    async def summarize(self, transcript: str, language: str = "fr") -> str:
        """
        Generate a structured Markdown summary from the transcript.
        Tries Ollama first, then falls back to OpenRouter if configured.
        """
        # 1. Try Ollama
        try:
            logger.info("SummarizerService: Attempting summarization with Ollama (%s)", OLLAMA_MODEL)
            return await self._summarize_ollama(transcript)
        except Exception as e:
            logger.error("SummarizerService: Ollama failed: %s", e)
            
            # 2. Fallback to OpenRouter
            if OPENROUTER_API_KEY:
                logger.info("SummarizerService: Falling back to OpenRouter (%s)", OPENROUTER_MODEL)
                try:
                    return await self._summarize_openrouter(transcript)
                except Exception as ore:
                    logger.error("SummarizerService: OpenRouter also failed: %s", ore)
                    raise RuntimeError(f"Both Ollama and OpenRouter failed to summarize. Ollama error: {e}. OpenRouter error: {ore}") from ore
            else:
                logger.warning("SummarizerService: No OpenRouter API key configured for fallback.")
                raise RuntimeError(f"Ollama summarization failed and no fallback is configured. Error: {e}") from e

    async def _summarize_ollama(self, transcript: str) -> str:
        """Ollama specific implementation."""
        prompt = PROMPT_TEMPLATE.format(transcript=transcript)
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=300) as client:
            try:
                response = await client.post(
                    f"{OLLAMA_URL}/api/generate",
                    json=payload,
                )
                response.raise_for_status()
            except httpx.TimeoutException as exc:
                raise RuntimeError("Ollama request timed out after 300s") from exc
            except httpx.HTTPStatusError as exc:
                raise RuntimeError(
                    f"Ollama API error {exc.response.status_code}: {exc.response.text}"
                ) from exc
            except httpx.RequestError as exc:
                raise RuntimeError(f"Cannot reach Ollama at {OLLAMA_URL}: {exc}") from exc

        data: dict[str, object] = response.json()
        summary = data.get("response")
        if not isinstance(summary, str) or not summary.strip():
            raise RuntimeError(f"Unexpected Ollama response format: {data}")
        return summary.strip()

    async def _summarize_openrouter(self, transcript: str) -> str:
        """OpenRouter specific implementation."""
        prompt = PROMPT_TEMPLATE.format(transcript=transcript)
        
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "HTTP-Referer": "https://meetingpi.local", # Optional
            "X-Title": "MeetingPi", # Optional
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": OPENROUTER_MODEL,
            "messages": [
                {"role": "user", "content": prompt}
            ]
        }

        async with httpx.AsyncClient(timeout=60) as client:
            try:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise RuntimeError(
                    f"OpenRouter API error {exc.response.status_code}: {exc.response.text}"
                ) from exc
            except httpx.RequestError as exc:
                raise RuntimeError(f"Cannot reach OpenRouter: {exc}") from exc

        data = response.json()
        try:
            summary = data["choices"][0]["message"]["content"]
            return summary.strip()
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"Unexpected OpenRouter response format: {data}") from e

    async def list_models(self) -> list[str]:
        """Return the list of models available in Ollama."""
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                response = await client.get(f"{OLLAMA_URL}/api/tags")
                response.raise_for_status()
            except (httpx.RequestError, httpx.HTTPStatusError):
                return []

        data = response.json()
        models: list[dict[str, object]] = data.get("models", [])
        return [str(m.get("name", "")) for m in models if m.get("name")]

    async def is_available(self) -> bool:
        """Check if Ollama or OpenRouter is reachable."""
        # Ollama check
        async with httpx.AsyncClient(timeout=5) as client:
            try:
                response = await client.get(f"{OLLAMA_URL}/api/tags")
                if response.status_code == 200:
                    return True
            except (httpx.RequestError, httpx.HTTPStatusError):
                pass
        
        # Fallback check for OpenRouter
        return bool(OPENROUTER_API_KEY)


# Module-level singleton
_summarizer_service = SummarizerService()


def get_summarizer_service() -> SummarizerService:
    """FastAPI dependency that returns the SummarizerService singleton."""
    return _summarizer_service
