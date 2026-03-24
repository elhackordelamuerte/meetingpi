# Specs Backend — pi-backend (FastAPI)

## Objectif

Ce document décrit précisément tout ce que Claude Code doit générer pour le backend FastAPI tournant sur le Raspberry Pi.

---

## `requirements.txt`

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
pydantic==2.7.0
sqlalchemy==2.0.29
aiosqlite==0.20.0
python-multipart==0.0.9
httpx==0.27.0
psutil==5.9.8
python-dotenv==1.0.1
pytest==8.1.1
pytest-asyncio==0.23.6
httpx==0.27.0
```

---

## `main.py`

- Initialise l'app FastAPI avec titre "MeetingPi API"
- Monte les routers : `/api/recordings`, `/api/meetings`, `/api/system`
- Middleware CORS : origins=["*"] (réseau local uniquement)
- Au startup : crée les tables SQLite si absentes, vérifie que whisper.cpp bin existe
- Health check GET `/` → `{"status": "ok", "version": "1.0.0"}`

---

## `models/database.py`

### Tables SQLAlchemy

**Meeting**
```python
class Meeting(Base):
    __tablename__ = "meetings"
    id: Mapped[str]          # UUID, primary key
    title: Mapped[str]
    started_at: Mapped[datetime]
    ended_at: Mapped[Optional[datetime]]
    duration_s: Mapped[Optional[int]]
    status: Mapped[str]      # Enum: recording|transcribing|summarizing|done|error
    audio_path: Mapped[Optional[str]]
    transcript: Mapped[Optional[str]]
    summary: Mapped[Optional[str]]
    error_msg: Mapped[Optional[str]]
    created_at: Mapped[datetime]
```

**SystemEvent**
```python
class SystemEvent(Base):
    __tablename__ = "system_events"
    id: Mapped[int]          # autoincrement
    event_type: Mapped[str]
    meeting_id: Mapped[Optional[str]]
    payload: Mapped[Optional[str]]  # JSON string
    created_at: Mapped[datetime]
```

### Fonctions utilitaires
- `get_db()` : async generator pour dependency injection FastAPI
- `init_db()` : crée toutes les tables

---

## `services/audio.py`

### Classe `AudioService`

```python
class AudioService:
    _process: Optional[subprocess.Popen] = None
    _current_meeting_id: Optional[str] = None
    _started_at: Optional[datetime] = None

    async def start_recording(self, meeting_id: str, output_path: str) -> None:
        """Lance arecord en subprocess. Lève RuntimeError si déjà en cours."""
        # Commande: arecord -D {AUDIO_DEVICE} -r 16000 -c 1 -t wav -f S16_LE {output_path}
        # Stocker PID dans self._process

    async def stop_recording(self) -> dict:
        """Envoie SIGTERM à arecord. Retourne {meeting_id, duration_s}."""
        # SIGTERM → wait(timeout=5) → SIGKILL si nécessaire

    def is_recording(self) -> bool: ...

    def get_status(self) -> dict:
        """Retourne {is_recording, meeting_id, started_at, elapsed_s}"""
```

**Points importants :**
- Singleton : une seule instance partagée via FastAPI dependency
- Le fichier audio est `{RECORDINGS_DIR}/{meeting_id}.wav`
- Si arecord plante inopinément, `is_recording()` doit le détecter (poll process.returncode)

---

## `services/transcription.py`

### Classe `TranscriptionService`

```python
async def transcribe(audio_path: str) -> str:
    """
    1. Si durée > 30min, segmente avec ffmpeg en chunks 5min
    2. Lance whisper.cpp sur chaque chunk (subprocess async)
    3. Concatène les .txt
    4. Nettoie les filler words (um, uh, like, you know, euh, donc, voilà)
    5. Retourne le texte propre
    """

async def _run_whisper(audio_path: str) -> str:
    """
    Commande: {WHISPER_BIN} -m {WHISPER_MODEL_PATH} -f {audio_path}
              -otxt --language fr --threads 3
    Lit le fichier .txt généré et retourne son contenu.
    Timeout: 600s
    """

async def _segment_audio(audio_path: str) -> list[str]:
    """ffmpeg -i {input} -f segment -segment_time 300 -c copy {dir}/seg_%03d.wav"""

def _clean_transcript(text: str) -> str:
    """Regex suppression filler words FR + EN. Supprime lignes < 15 chars."""
```

---

## `services/summarizer.py`

### Classe `SummarizerService`

```python
async def summarize(transcript: str, language: str = "fr") -> str:
    """
    Appelle Ollama API: POST {OLLAMA_URL}/api/generate
    Body: {
        "model": OLLAMA_MODEL,
        "prompt": PROMPT_TEMPLATE.format(transcript=transcript),
        "stream": false
    }
    Retourne le résumé en Markdown.
    Timeout: 300s
    """
```

**Prompt template (français) :**
```
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

Sois concis, factuel, et utilise des puces. Réponds uniquement en français.
```

---

## `routers/recordings.py`

### POST `/api/recordings/start`

```python
# Body schema
class StartRecordingRequest(BaseModel):
    title: Optional[str] = None

# Response schema
class RecordingStarted(BaseModel):
    meeting_id: str
    status: str  # "recording"
    started_at: datetime
    title: str
```

**Logique :**
1. Vérifie qu'aucun enregistrement n'est en cours (400 si oui)
2. Génère UUID meeting_id
3. Crée Meeting en DB avec status="recording"
4. Lance `audio_service.start_recording()`
5. Retourne RecordingStarted

---

### POST `/api/recordings/stop`

```python
class RecordingStopped(BaseModel):
    meeting_id: str
    status: str  # "transcribing"
    duration_s: int
```

**Logique :**
1. Vérifie qu'un enregistrement est actif (400 sinon)
2. `audio_service.stop_recording()` → duration_s
3. Met à jour Meeting en DB (ended_at, duration_s, status="transcribing")
4. Lance `BackgroundTasks.add_task(process_meeting, meeting_id)` 
5. Retourne RecordingStopped

---

### GET `/api/recordings/status`

```python
class RecordingStatus(BaseModel):
    is_recording: bool
    meeting_id: Optional[str]
    started_at: Optional[datetime]
    elapsed_s: Optional[int]
```

---

## `routers/meetings.py`

### GET `/api/meetings`
- Paramètres query : `page=1`, `page_size=20`, `search=str`, `status=str`
- Retourne liste paginée avec `summary_preview` (150 premiers chars du résumé)

### GET `/api/meetings/{id}`
- Retourne la réunion complète (transcript + summary inclus)
- 404 si non trouvée

### PATCH `/api/meetings/{id}`
```python
class UpdateMeeting(BaseModel):
    title: Optional[str] = None
```

### DELETE `/api/meetings/{id}`
- Supprime en DB
- Supprime fichier audio si présent

### GET `/api/meetings/{id}/export`
- Content-Type: `text/markdown`
- Filename: `meeting_{date}_{title}.md`
- Format :
```markdown
# {title}
**Date:** {date}  **Durée:** {duration}

## Compte-rendu
{summary}

## Transcription complète
{transcript}
```

---

## `routers/system.py`

### GET `/api/system/health`
```json
{"status": "ok", "whisper": true, "ollama": true, "db": true}
```

### GET `/api/system/stats`
Utilise `psutil` pour CPU, RAM, disk.
Température via `/sys/class/thermal/thermal_zone0/temp` (diviser par 1000).

### GET `/api/system/models`
```json
{
  "whisper_model": "tiny.en.q5_1",
  "whisper_model_path": "/home/pi/whisper.cpp/models/...",
  "ollama_model": "llama3:8b",
  "ollama_models_available": ["llama3:8b", "phi3:mini"]
}
```

---

## Background task : `process_meeting(meeting_id)`

```python
async def process_meeting(meeting_id: str, db: AsyncSession):
    try:
        # 1. Transcription
        meeting.status = "transcribing"
        transcript = await transcription_service.transcribe(meeting.audio_path)
        meeting.transcript = transcript

        # 2. Résumé
        meeting.status = "summarizing"
        summary = await summarizer_service.summarize(transcript)
        meeting.summary = summary

        # 3. Done
        meeting.status = "done"

        # 4. Supprime audio si KEEP_AUDIO=false
        if not KEEP_AUDIO:
            os.remove(meeting.audio_path)
            meeting.audio_path = None

    except Exception as e:
        meeting.status = "error"
        meeting.error_msg = str(e)
    finally:
        await db.commit()
```

---

## Tests unitaires

### `tests/test_audio.py`
- `test_start_recording_creates_process` : mock subprocess.Popen, vérifie appel arecord
- `test_stop_recording_sends_sigterm` : vérifie SIGTERM envoyé
- `test_cannot_start_twice` : lève RuntimeError
- `test_is_recording_detects_dead_process` : process.returncode=1 → is_recording=False

### `tests/test_transcription.py`
- `test_clean_transcript_removes_fillers` : "um so like you know" → ""
- `test_transcribe_calls_whisper_bin` : mock subprocess, vérifie commande
- `test_segment_audio_for_long_files` : mock ffmpeg, vérifie segmentation si durée > 1800s

### `tests/test_api.py`
- `test_start_recording` : POST /api/recordings/start → 200 + meeting créée en DB
- `test_cannot_start_twice` : 2× POST start → 400
- `test_stop_recording` : start → stop → status="transcribing"
- `test_get_meetings_empty` : GET /api/meetings → {items: [], total: 0}
- `test_get_meeting_not_found` : GET /api/meetings/fake-id → 404
- `test_system_health` : GET /api/system/health → status=ok
- `test_export_markdown` : GET /api/meetings/{id}/export → Content-Type markdown

---

## Scripts bash

### `scripts/setup.sh`

```bash
#!/bin/bash
set -euo pipefail

echo "=== MeetingPi Setup Script ==="

# 1. Mise à jour système
sudo apt update && sudo apt full-upgrade -y

# 2. Dépendances système
sudo apt install -y python3.11 python3.11-venv python3-pip \
  alsa-utils pulseaudio libasound2-dev ffmpeg git gcc-12 g++-12 make curl

# 3. Python venv
python3.11 -m venv /home/pi/.venv
source /home/pi/.venv/bin/activate
pip install -r /home/pi/meetingpi/pi-backend/requirements.txt

# 4. Compiler Whisper.cpp
if [ ! -f "/home/pi/whisper.cpp/main" ]; then
  cd /home/pi
  git clone https://github.com/ggerganov/whisper.cpp
  cd whisper.cpp
  make clean && make CC=gcc-12 CXX=g++-12 WHISPER_AVX=0 WHISPER_AVX2=0 WHISPER_ARM=1 WHISPER_ARM_FMA=1
  bash models/download-ggml-model.sh tiny.en
  ./quantize ./models/ggml-model-tiny.en.bin ./models/ggml-model-tiny.en.q5_1.bin q5_1
fi

# 5. Installer Ollama
if ! command -v ollama &> /dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
  sleep 3
  ollama pull phi3:mini
fi

# 6. Créer dossiers
mkdir -p /home/pi/recordings
chmod 700 /home/pi/recordings

# 7. Copier .env
if [ ! -f "/home/pi/meetingpi/pi-backend/.env" ]; then
  cp /home/pi/meetingpi/.env.example /home/pi/meetingpi/pi-backend/.env
  echo "⚠️  Édite /home/pi/meetingpi/pi-backend/.env avant de démarrer"
fi

# 8. Installer services systemd
sudo cp /home/pi/meetingpi/pi-backend/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable meetingpi-api meetingpi-ollama
sudo systemctl start meetingpi-ollama
sleep 5
sudo systemctl start meetingpi-api

echo "=== Setup terminé ! API disponible sur http://$(hostname -I | awk '{print $1}'):8000 ==="
```

### `scripts/debug.sh`

```bash
#!/bin/bash
set -euo pipefail

echo "=== MeetingPi Debug Report ==="
echo "Date: $(date)"
echo ""

echo "--- SYSTÈME ---"
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME)"
echo "Kernel: $(uname -r)"
echo "Architecture: $(uname -m)"
echo "Uptime: $(uptime -p)"
echo ""

echo "--- RESSOURCES ---"
echo "CPU: $(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')% utilisé"
free -h | grep Mem
echo "Température: $(cat /sys/class/thermal/thermal_zone0/temp | awk '{printf "%.1f°C\n", $1/1000}')"
df -h / | tail -1
echo ""

echo "--- AUDIO ---"
echo "Périphériques d'enregistrement disponibles :"
arecord -l 2>/dev/null || echo "ERREUR: arecord non disponible"
echo ""

echo "--- WHISPER.CPP ---"
if [ -f "/home/pi/whisper.cpp/main" ]; then
  echo "✓ Binaire présent: /home/pi/whisper.cpp/main"
  ls -lh /home/pi/whisper.cpp/models/*.bin 2>/dev/null || echo "⚠ Aucun modèle trouvé"
else
  echo "✗ Binaire absent — relancer setup.sh"
fi
echo ""

echo "--- OLLAMA ---"
if command -v ollama &> /dev/null; then
  echo "✓ Ollama installé: $(ollama --version)"
  ollama list 2>/dev/null || echo "⚠ Ollama non démarré"
else
  echo "✗ Ollama absent"
fi
echo ""

echo "--- SERVICES SYSTEMD ---"
for svc in meetingpi-api meetingpi-ollama; do
  status=$(systemctl is-active $svc 2>/dev/null || echo "absent")
  echo "$svc: $status"
done
echo ""

echo "--- API HEALTHCHECK ---"
curl -s http://localhost:8000/ 2>/dev/null || echo "✗ API non joignable"
echo ""

echo "--- DERNIERS LOGS API ---"
journalctl -u meetingpi-api -n 20 --no-pager 2>/dev/null || echo "Pas de logs systemd"
```

### `scripts/benchmark.sh`

```bash
#!/bin/bash
set -euo pipefail

echo "=== MeetingPi Whisper Benchmark ==="

# Génère 60s de silence (test rapide)
TESTFILE="/tmp/benchmark_test.wav"
echo "Génération fichier test (60s)..."
arecord -D plughw:1,0 -d 60 -r 16000 -c 1 -t wav -f S16_LE "$TESTFILE" 2>/dev/null \
  || ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 60 -ar 16000 "$TESTFILE" -y 2>/dev/null

MODEL="${1:-/home/pi/whisper.cpp/models/ggml-model-tiny.en.q5_1.bin}"
WHISPER_BIN="${2:-/home/pi/whisper.cpp/main}"

echo "Modèle: $MODEL"
echo "Lancement transcription..."

START=$(date +%s%N)
"$WHISPER_BIN" -m "$MODEL" -f "$TESTFILE" -otxt --language fr --threads 3 > /dev/null 2>&1
END=$(date +%s%N)

ELAPSED=$(( (END - START) / 1000000 ))
RATIO=$(echo "scale=2; 60000 / $ELAPSED" | bc)

echo ""
echo "=== Résultats ==="
echo "Durée audio : 60s"
echo "Temps transcription : ${ELAPSED}ms"
echo "Ratio temps-réel : ${RATIO}x"
echo "Température finale: $(cat /sys/class/thermal/thermal_zone0/temp | awk '{printf "%.1f°C\n", $1/1000}')"

rm -f "$TESTFILE" "${TESTFILE}.txt"
```
