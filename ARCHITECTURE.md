# Architecture MeetingPi

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                    RÉSEAU LOCAL                          │
│                                                         │
│  ┌──────────────┐        HTTP/REST        ┌──────────┐  │
│  │  CRM Web     │ ◄────────────────────► │  Pi API  │  │
│  │  (Next.js)   │    ws://pi:8000/ws      │ (FastAPI)│  │
│  │  Port 3000   │    polling /status      │ Port 8000│  │
│  └──────────────┘                         └────┬─────┘  │
│                                                │        │
│                              ┌─────────────────▼──────┐ │
│                              │   Services internes Pi │ │
│                              │                        │ │
│                              │  ┌─────────────────┐   │ │
│                              │  │  audio.py        │   │ │
│                              │  │  arecord process │   │ │
│                              │  └────────┬────────┘   │ │
│                              │           │ .wav        │ │
│                              │  ┌────────▼────────┐   │ │
│                              │  │ transcription.py │   │ │
│                              │  │  whisper.cpp     │   │ │
│                              │  └────────┬────────┘   │ │
│                              │           │ .txt        │ │
│                              │  ┌────────▼────────┐   │ │
│                              │  │  summarizer.py   │   │ │
│                              │  │  Ollama API      │   │ │
│                              │  └────────┬────────┘   │ │
│                              │           │ résumé.md   │ │
│                              │  ┌────────▼────────┐   │ │
│                              │  │   SQLite DB      │   │ │
│                              │  │  meetingpi.db    │   │ │
│                              │  └─────────────────┘   │ │
│                              └────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Pipeline de transcription

```
USB Mic
  │
  ▼
arecord (ALSA, 16kHz, mono, S16_LE)
  │  meeting_20240321_143022.wav
  ▼
[STOP signal reçu ou timeout]
  │
  ▼
ffmpeg segmentation (chunks 5min si > 30min)
  │  segment_000.wav, segment_001.wav, ...
  ▼
whisper.cpp --model tiny.en.q5_1 --threads 3
  │  segment_000.txt, ...
  ▼
concat + nettoyage (suppression filler words)
  │  transcript_full.txt
  ▼
Ollama (llama3 ou phi3)
  Prompt: "Résume cette réunion en français, identifie les décisions, actions et participants"
  │  summary.md
  ▼
SQLite: Meeting { id, title, date, duration, transcript, summary, status }
```

---

## Modèle de données SQLite

```sql
CREATE TABLE meetings (
    id          TEXT PRIMARY KEY,  -- UUID
    title       TEXT NOT NULL,
    started_at  DATETIME NOT NULL,
    ended_at    DATETIME,
    duration_s  INTEGER,
    status      TEXT NOT NULL,  -- recording | transcribing | summarizing | done | error
    audio_path  TEXT,           -- NULL si supprimé
    transcript  TEXT,
    summary     TEXT,
    error_msg   TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT NOT NULL,  -- start_recording | stop | transcription_done | error
    meeting_id  TEXT,
    payload     TEXT,           -- JSON
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## API REST (FastAPI)

### Enregistrement

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/recordings/start` | Démarre un enregistrement |
| POST | `/api/recordings/stop` | Arrête l'enregistrement en cours |
| GET  | `/api/recordings/status` | État actuel (recording, idle, processing) |

**POST /api/recordings/start**
```json
// Body (optionnel)
{ "title": "Sprint Review S14" }

// Response
{
  "meeting_id": "uuid-...",
  "status": "recording",
  "started_at": "2024-03-21T14:30:22Z"
}
```

**POST /api/recordings/stop**
```json
// Response
{
  "meeting_id": "uuid-...",
  "status": "transcribing",
  "duration_s": 1823
}
```

---

### Réunions

| Méthode | Route | Description |
|---------|-------|-------------|
| GET  | `/api/meetings` | Liste paginée |
| GET  | `/api/meetings/{id}` | Détail complet |
| PATCH | `/api/meetings/{id}` | Modifier titre |
| DELETE | `/api/meetings/{id}` | Supprimer |
| GET | `/api/meetings/{id}/export` | Export Markdown |

**GET /api/meetings**
```json
{
  "items": [
    {
      "id": "uuid-...",
      "title": "Sprint Review S14",
      "started_at": "2024-03-21T14:30:22Z",
      "duration_s": 1823,
      "status": "done",
      "summary_preview": "Réunion de 30min. Décisions: migration vers Redis..."
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 20
}
```

---

### Système

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/system/health` | Santé globale |
| GET | `/api/system/stats` | CPU, RAM, temp, disk |
| GET | `/api/system/models` | Modèles Whisper/Ollama disponibles |

**GET /api/system/stats**
```json
{
  "cpu_percent": 23.4,
  "ram_used_mb": 1842,
  "ram_total_mb": 3900,
  "temperature_c": 58.2,
  "disk_used_gb": 12.3,
  "disk_total_gb": 58.4,
  "uptime_s": 86400,
  "whisper_available": true,
  "ollama_available": true
}
```

---

## CRM Frontend — Pages

### `/` — Dashboard
- Bouton central START/STOP enregistrement (état temps réel)
- Widget status Pi (CPU, RAM, température)
- 5 dernières réunions
- Indicateur pipeline en cours (recording → transcribing → summarizing)

### `/meetings` — Liste
- Tableau avec tri/filtre par date, durée, statut
- Recherche full-text sur titres et résumés
- Actions rapides : voir, exporter, supprimer

### `/meetings/[id]` — Détail
- Onglet **Résumé** : compte-rendu structuré (décisions, actions, participants)
- Onglet **Transcript** : texte brut avec timestamps
- Durée, date, statut
- Bouton export Markdown

### `/settings`
- URL de l'API Pi (configurable)
- Choix du modèle Ollama
- Langue du résumé
- KEEP_AUDIO toggle

---

## Systemd services

### `meetingpi-api.service`
```ini
[Unit]
Description=MeetingPi FastAPI Backend
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/meetingpi/pi-backend
ExecStart=/home/pi/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

### `meetingpi-ollama.service`
```ini
[Unit]
Description=Ollama LLM Server
After=network.target

[Service]
User=pi
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=10
Environment=OLLAMA_HOST=127.0.0.1:11434

[Install]
WantedBy=multi-user.target
```

---

## Considérations de performance

| Opération | Pi 4 (4GB) | Pi 5 (8GB) |
|-----------|-----------|-----------|
| Transcription 5min audio | ~340s | ~210s |
| Résumé Ollama phi3:mini | ~45s | ~25s |
| RAM idle (API + Ollama) | ~1.8GB | ~1.8GB |
| RAM pendant Whisper | +125MB | +125MB |
| Température charge | ~70°C | ~58°C |

**Règle absolue** : ne jamais lancer Whisper et Ollama en même temps sur Pi 4 4GB.
Le pipeline est séquentiel par design : transcription terminée → libération RAM → lancement Ollama.

---

## Sécurité

- L'API n'est accessible que sur le réseau local (pas d'exposition internet)
- Pas d'authentification par défaut (à ajouter si accès multi-utilisateurs)
- Les fichiers audio sont stockés dans `/home/pi/recordings` avec permissions `700`
- Optionnel : chiffrement GPG des exports (`gpg --encrypt`)
