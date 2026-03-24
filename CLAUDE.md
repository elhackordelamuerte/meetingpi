# MeetingPi — Claude Code Memory File

## Projet

**MeetingPi** est un système de transcription de réunions 100% local, déployé sur Raspberry Pi 4/5.
Il comprend :
1. **Le moteur de transcription** : pipeline audio → Whisper.cpp → résumé via LLM local (Ollama/llama3)
2. **Le CRM web** : interface Next.js pour piloter le Pi à distance, lancer des enregistrements, consulter les réunions et leurs comptes-rendus

Tout fonctionne **hors-ligne**, sans API cloud, sans abonnement.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Transcription | Whisper.cpp (tiny.en.q5_1, ARM64 optimisé) |
| Résumé IA | Ollama + llama3:8b (ou phi3:mini si RAM < 4GB) |
| Backend API | FastAPI (Python 3.11) |
| Frontend CRM | Next.js 14 App Router + Tailwind CSS |
| Base de données | SQLite (via SQLAlchemy) — zéro infra externe |
| Audio | ALSA + arecord (USB mic, 16kHz mono) |
| Process mgmt | systemd services |
| Déploiement Pi | Script bash d'init + GitHub Actions CI |

---

## Structure du projet

```
meetingpi/
├── CLAUDE.md                  ← ce fichier
├── ARCHITECTURE.md
├── README.md
├── .env.example
│
├── pi-backend/                ← FastAPI sur le Raspberry Pi
│   ├── main.py
│   ├── routers/
│   │   ├── recordings.py      ← start/stop/list enregistrements
│   │   ├── meetings.py        ← CRUD réunions + transcriptions
│   │   └── system.py          ← status CPU/RAM/temp
│   ├── services/
│   │   ├── audio.py           ← gestion arecord subprocess
│   │   ├── transcription.py   ← appel whisper.cpp
│   │   └── summarizer.py      ← appel Ollama API
│   ├── models/
│   │   └── database.py        ← SQLAlchemy models
│   ├── tests/
│   │   ├── test_audio.py
│   │   ├── test_transcription.py
│   │   └── test_api.py
│   ├── scripts/
│   │   ├── setup.sh           ← installation complète sur Pi
│   │   ├── debug.sh           ← diagnostic système
│   │   └── benchmark.sh       ← test perf whisper
│   └── requirements.txt
│
├── crm-frontend/              ← Next.js CRM (peut tourner sur laptop ou Pi)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           ← dashboard
│   │   ├── meetings/
│   │   │   ├── page.tsx       ← liste réunions
│   │   │   └── [id]/page.tsx  ← détail + transcript + résumé
│   │   └── settings/page.tsx
│   ├── components/
│   │   ├── RecordingControl.tsx
│   │   ├── MeetingCard.tsx
│   │   ├── TranscriptViewer.tsx
│   │   ├── SystemStatus.tsx
│   │   └── SummaryPanel.tsx
│   ├── lib/
│   │   └── api.ts             ← client API vers le Pi
│   └── package.json
│
└── docker-compose.yml         ← optionnel, pour dev local
```

---

## Commandes essentielles

### Backend Pi
```bash
# Installer toutes les dépendances sur le Pi
bash pi-backend/scripts/setup.sh

# Lancer l'API en dev
cd pi-backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Lancer en production (systemd)
sudo systemctl start meetingpi-api

# Debug système complet
bash pi-backend/scripts/debug.sh

# Benchmark Whisper
bash pi-backend/scripts/benchmark.sh

# Tests unitaires
cd pi-backend && python -m pytest tests/ -v
```

### Frontend CRM
```bash
cd crm-frontend
npm install
npm run dev         # dev
npm run build       # prod
npm start
```

---

## Variables d'environnement

Copier `.env.example` → `.env` et adapter :

```
PI_API_URL=http://raspberrypi.local:8000
WHISPER_MODEL_PATH=/home/pi/whisper.cpp/models/ggml-model-tiny.en.q5_1.bin
WHISPER_BIN=/home/pi/whisper.cpp/main
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3:8b
AUDIO_DEVICE=plughw:1,0
RECORDINGS_DIR=/home/pi/recordings
DATABASE_URL=sqlite:///./meetingpi.db
```

---

## Comportements importants

- **Enregistrement** : `arecord` tourne en subprocess avec PID tracké. Le stop envoie SIGTERM proprement.
- **Transcription** : déclenché automatiquement à la fin de chaque enregistrement (background task FastAPI).
- **Résumé** : déclenché après transcription via Ollama (prompt en français).
- **Fichiers audio** : jamais exposés via API pour économiser la bande passante. Supprimés après transcription si `KEEP_AUDIO=false`.
- **SQLite** : base locale sur le Pi. Le CRM lit via l'API REST — jamais d'accès direct à la DB depuis le frontend.
- **Polling** : le CRM poll `/api/status` toutes les 3s quand un enregistrement est actif.

---

## Règles de code

1. Tout le code Python est typé (mypy strict)
2. Tout le code TS/TSX est typé (strict mode)
3. Pas de `any` en TypeScript
4. Chaque route FastAPI a un schéma Pydantic d'entrée ET de sortie
5. Les tests couvrent au minimum : démarrage/arrêt enregistrement, appel transcription mock, routes API CRUD
6. Les scripts bash ont `set -euo pipefail` en tête

---

## Contraintes hardware

- Pi 4 minimum 4GB RAM (Pi 5 recommandé)
- USB mic uniquement (ALSA `plughw:1,0` par défaut, configurable)
- Modèle Whisper : `tiny.en.q5_1` (125MB RAM) — ne PAS utiliser base ou small sans tester la RAM
- Ollama : `phi3:mini` si 4GB RAM, `llama3:8b` si 8GB
- Ne jamais lancer Whisper et Ollama simultanément sur Pi 4 4GB

---

## État du projet

- [x] pi-backend skeleton
- [x] audio service (arecord subprocess)
- [x] whisper.cpp integration
- [x] ollama summarizer
- [x] REST API routes
- [x] SQLite models
- [x] unit tests
- [x] setup.sh / debug.sh / benchmark.sh
- [x] crm-frontend scaffold
- [x] RecordingControl component
- [x] meetings list + detail pages
- [x] systemd service files
- [ ] README complet
