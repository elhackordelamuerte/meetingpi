# TASKS — MeetingPi Build Plan

Ce fichier liste les tâches dans l'ordre exact que Claude Code doit suivre pour générer le projet entier.

---

## PHASE 1 — Backend Pi (pi-backend/)

### 1.1 Scaffold
- [x] Créer `pi-backend/` avec structure dossiers (routers/, services/, models/, tests/, scripts/, systemd/)
- [x] Générer `requirements.txt` (voir SPECS_BACKEND.md)
- [x] Générer `pi-backend/.env.example` (copie de racine)

### 1.2 Models
- [x] `models/database.py` : tables Meeting + SystemEvent, `get_db()`, `init_db()`

### 1.3 Services
- [x] `services/audio.py` : classe AudioService (start/stop/status, subprocess arecord)
- [x] `services/transcription.py` : TranscriptionService (whisper.cpp + ffmpeg segmentation + clean)
- [x] `services/summarizer.py` : SummarizerService (Ollama API, prompt FR)

### 1.4 Routers
- [x] `routers/recordings.py` : start, stop, status
- [x] `routers/meetings.py` : CRUD + export markdown
- [x] `routers/system.py` : health, stats (psutil), models

### 1.5 Main
- [x] `main.py` : app FastAPI, CORS, startup, mount routers, background task process_meeting()

### 1.6 Tests
- [x] `tests/conftest.py` : fixtures (TestClient, DB in-memory)
- [x] `tests/test_audio.py` : 4 tests (voir SPECS_BACKEND.md)
- [x] `tests/test_transcription.py` : 3 tests
- [x] `tests/test_api.py` : 8 tests routes

### 1.7 Scripts
- [x] `scripts/setup.sh` (voir SPECS_BACKEND.md — complet avec commentaires)
- [x] `scripts/debug.sh`
- [x] `scripts/benchmark.sh`

### 1.8 Systemd
- [x] `systemd/meetingpi-api.service`
- [x] `systemd/meetingpi-ollama.service`

---

## PHASE 2 — Frontend CRM (crm-frontend/)

### 2.1 Scaffold
- [x] `package.json` avec toutes les dépendances (voir SPECS_FRONTEND.md)
- [x] `tsconfig.json` (strict mode)
- [x] `tailwind.config.ts` avec les couleurs custom du design system
- [x] `next.config.ts`
- [x] `.env.example`

### 2.2 Types & API
- [x] `lib/types.ts` : tous les types TypeScript (Meeting, RecordingStatus, SystemStats, etc.)
- [x] `lib/api.ts` : client API complet vers le Pi

### 2.3 Components UI
- [x] `components/ui/Badge.tsx`
- [x] `components/ui/Button.tsx`
- [x] `components/ui/Card.tsx`
- [x] `components/ui/Spinner.tsx`
- [x] `components/ui/Toast.tsx`

### 2.4 Components métier
- [x] `components/RecordingControl.tsx` : bouton start/stop + timer + input titre
- [x] `components/SystemStatus.tsx` : widget CPU/RAM/temp/disk + barres
- [x] `components/MeetingCard.tsx` : carte réunion (compact + full)
- [x] `components/TranscriptViewer.tsx` : pre scrollable + bouton copier
- [x] `components/SummaryPanel.tsx` : rendu markdown + état pipeline
- [x] `components/PipelineProgress.tsx` : barre progression recording→transcribing→summarizing

### 2.5 Layout
- [x] `app/layout.tsx` : sidebar + main content, fonts Google

### 2.6 Pages
- [x] `app/page.tsx` : dashboard (RecordingControl + SystemStatus + 5 dernières réunions + pipeline)
- [x] `app/meetings/page.tsx` : liste avec filtres + tableau + pagination
- [x] `app/meetings/[id]/page.tsx` : détail onglets Résumé/Transcription + header + export
- [x] `app/settings/page.tsx` : formulaire config Pi + test connexion

---

## PHASE 3 — Documentation finale

- [x] Vérifier que `CLAUDE.md` checklist est à jour
- [ ] Vérifier que `README.md` est complet
- [x] Générer `docker-compose.yml` optionnel (pour dev local sans Pi)

---

## Ordre de priorité si temps limité

1. `models/database.py` + `main.py`
2. `services/audio.py` + `routers/recordings.py`
3. `services/transcription.py` + `services/summarizer.py`
4. `routers/meetings.py`
5. Tests
6. Scripts bash
7. Frontend complet

---

## Notes pour Claude Code

- Utiliser `AsyncSession` SQLAlchemy partout (pas de sync)
- Le singleton AudioService doit être partagé via `Depends()` FastAPI — utiliser une variable module-level
- Le background task `process_meeting` doit avoir sa propre session DB (ne pas réutiliser celle de la requête)
- Tous les paths vers whisper.cpp et recordings lisent depuis `.env` via `python-dotenv`
- Le frontend utilise React Query pour toutes les requêtes (pas de fetch brut dans les composants)
- Les polls (status, system stats) sont gérés avec `refetchInterval` de React Query
