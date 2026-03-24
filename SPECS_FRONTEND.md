# Specs Frontend — crm-frontend (Next.js 14)

## Objectif

Interface web permettant de piloter le Raspberry Pi depuis n'importe quel appareil du réseau local. Design industriel/utilitaire — sobre, dense en informations, optimisé pour un usage quotidien.

---

## Stack

```json
{
  "next": "14.x",
  "react": "18.x",
  "typescript": "5.x",
  "tailwindcss": "3.x",
  "@tanstack/react-query": "5.x",
  "zustand": "4.x",
  "date-fns": "3.x",
  "lucide-react": "latest",
  "clsx": "latest"
}
```

---

## Design System

### Palette
```css
--bg-base: #0a0b0d;
--bg-surface: #111318;
--bg-elevated: #1a1d24;
--border: #2a2d35;
--text-primary: #e8eaf0;
--text-secondary: #8b909e;
--text-muted: #4a4f5e;
--accent-red: #e53935;       /* enregistrement actif */
--accent-green: #00c853;     /* succès / done */
--accent-amber: #ffab00;     /* en cours / processing */
--accent-blue: #2979ff;      /* actions / boutons */
```

### Typographie
- Display/titres : `JetBrains Mono` (Google Fonts)
- Corps : `Inter` (Google Fonts)

### Composants de base à créer dans `components/ui/`
- `Badge` : statut coloré (recording=rouge, transcribing=amber, done=vert, error=rouge outline)
- `Button` : variantes primary, secondary, ghost, danger
- `Card` : surface avec border
- `Spinner` : animation chargement

---

## `lib/api.ts`

```typescript
// URL configurée depuis localStorage ou env
const PI_API_URL = process.env.NEXT_PUBLIC_PI_API_URL ?? 'http://raspberrypi.local:8000'

export const api = {
  // Recordings
  startRecording: (title?: string) => POST('/api/recordings/start', { title }),
  stopRecording: () => POST('/api/recordings/stop'),
  getRecordingStatus: () => GET('/api/recordings/status'),

  // Meetings
  getMeetings: (page=1, search='', status='') => GET(`/api/meetings?page=${page}&search=${search}&status=${status}`),
  getMeeting: (id: string) => GET(`/api/meetings/${id}`),
  updateMeeting: (id: string, data: Partial<Meeting>) => PATCH(`/api/meetings/${id}`, data),
  deleteMeeting: (id: string) => DELETE(`/api/meetings/${id}`),
  exportMeeting: (id: string) => GET(`/api/meetings/${id}/export`),

  // System
  getHealth: () => GET('/api/system/health'),
  getStats: () => GET('/api/system/stats'),
}
```

---

## `app/layout.tsx`

Layout global :
- Fond `--bg-base`
- Sidebar gauche fixe (240px) avec navigation
- Zone content principale

### Sidebar
```
┌──────────────────┐
│  🎙 MeetingPi    │  ← logo + nom
├──────────────────┤
│  Dashboard       │
│  Réunions        │
│  Paramètres      │
├──────────────────┤
│  [Status Pi]     │  ← indicateur CPU/temp compact
│  ● Online        │
└──────────────────┘
```

---

## `app/page.tsx` — Dashboard

### Layout (grid 2 colonnes)

**Colonne gauche (flex 2) :**

**Zone RecordingControl (hero)**
```
┌─────────────────────────────────────┐
│                                     │
│      ●  EN COURS  00:23:45          │  ← timer si actif
│                                     │
│    [    ⏹ ARRÊTER L'ENREG.    ]    │  ← bouton rouge large
│     ou                              │
│    [    🎙 DÉMARRER            ]    │  ← bouton bleu large
│                                     │
│  Titre (optionnel): [____________]  │
└─────────────────────────────────────┘
```

Comportement :
- Polling `/api/recordings/status` toutes les 2s
- Timer qui s'incrémente en temps réel (calculé depuis `started_at`)
- Animation pulse rouge sur le ● quand actif
- Si status ≠ idle et ≠ recording : afficher "Pipeline en cours..." + spinner

**5 dernières réunions** (liste compacte)

---

**Colonne droite (flex 1) :**

**SystemStatus widget**
```
┌─────────────────┐
│ Raspberry Pi    │
│ ● Connecté      │
├─────────────────┤
│ CPU    23%  ████░ │
│ RAM  1.8/4GB ███░ │
│ Temp   58°C     │
│ Disk  12/58GB   │
├─────────────────┤
│ Whisper  ✓      │
│ Ollama   ✓      │
└─────────────────┘
```

Polling toutes les 5s. Si unreachable → "⚠ Pi non joignable" en rouge.

---

**Bande inférieure : Pipeline actif**

Affiché uniquement si une réunion est en status transcribing ou summarizing :
```
⟳ Traitement en cours — Sprint Review S14
  [Enreg. ✓] → [Transcription ●●●○○] → [Résumé ○○○○○]
```

---

## `app/meetings/page.tsx` — Liste réunions

### Filtres (barre horizontale)
- Input recherche (titre + résumé)
- Select statut : Tous / En cours / Terminées / Erreur
- Tri : Plus récent / Plus ancien / Durée

### Tableau

| # | Titre | Date | Durée | Statut | Actions |
|---|-------|------|-------|--------|---------|
| ... | Sprint Review | 21 mars 14h30 | 30min | ✓ Terminée | 👁 🗑 |
| ... | Daily standup | 21 mars 9h00 | 12min | ⟳ Transcription | - |

- Click ligne → `/meetings/{id}`
- Actions : voir (icône), supprimer (icône, confirmation modale)
- Pagination en bas (précédent / page X/Y / suivant)
- Skeleton loading pendant fetch

---

## `app/meetings/[id]/page.tsx` — Détail réunion

### Header
```
← Retour    Sprint Review S14
            21 mars 2024 · 14h30 · 30min · ✓ Terminée
                                    [Exporter .md]  [Supprimer]
```

### Onglets : Résumé | Transcription

**Onglet Résumé** :
- Rendu Markdown (composant `MarkdownRenderer` simple : gère ##, **, listes)
- Si status ≠ done : placeholder avec état pipeline

**Onglet Transcription** :
- Texte brut dans une `<pre>` scrollable avec police monospace
- Hauteur max 600px, overflow scroll
- Bouton "Copier" en haut à droite

---

## `app/settings/page.tsx`

### Formulaire

**Connexion Pi**
- URL API : input text (défaut `http://raspberrypi.local:8000`)
- Bouton "Tester la connexion" → ping health endpoint → ✓ ou ✗

**Modèle IA**
- Select modèle Ollama (chargé depuis `/api/system/models`)
- Langue résumé : Français / Anglais

**Enregistrement**
- Conserver fichiers audio : toggle (défaut OFF)
- Périphérique audio : input (défaut `plughw:1,0`)

**Bouton Enregistrer** → sauvegarde dans localStorage + env

---

## Composants détaillés

### `RecordingControl.tsx`

```typescript
interface RecordingControlProps {
  onStart: (title?: string) => Promise<void>
  onStop: () => Promise<void>
}
```

États internes :
- `status: 'idle' | 'recording' | 'processing'`
- `elapsedSeconds: number` (interval ticker)
- `inputTitle: string`
- `isLoading: boolean` (pendant appel API)

### `MeetingCard.tsx`

```typescript
interface MeetingCardProps {
  meeting: MeetingListItem
  onClick: () => void
  onDelete: () => void
}
```

Compact (pour dashboard) vs full (pour liste).

### `SystemStatus.tsx`

```typescript
interface SystemStatusProps {
  compact?: boolean  // sidebar vs widget dashboard
}
```

Affiche barres de progression pour CPU/RAM/disk.

### `TranscriptViewer.tsx`

```typescript
interface TranscriptViewerProps {
  transcript: string
  isLoading: boolean
}
```

### `SummaryPanel.tsx`

```typescript
interface SummaryPanelProps {
  summary: string
  status: MeetingStatus
}
```

Si status = transcribing/summarizing : affiche progression animée.

---

## Types TypeScript globaux (`lib/types.ts`)

```typescript
export type MeetingStatus = 'recording' | 'transcribing' | 'summarizing' | 'done' | 'error'

export interface Meeting {
  id: string
  title: string
  started_at: string  // ISO
  ended_at: string | null
  duration_s: number | null
  status: MeetingStatus
  transcript: string | null
  summary: string | null
  error_msg: string | null
}

export interface MeetingListItem {
  id: string
  title: string
  started_at: string
  duration_s: number | null
  status: MeetingStatus
  summary_preview: string | null
}

export interface RecordingStatus {
  is_recording: boolean
  meeting_id: string | null
  started_at: string | null
  elapsed_s: number | null
}

export interface SystemStats {
  cpu_percent: number
  ram_used_mb: number
  ram_total_mb: number
  temperature_c: number
  disk_used_gb: number
  disk_total_gb: number
  uptime_s: number
  whisper_available: boolean
  ollama_available: boolean
}
```

---

## `package.json` (scripts)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  }
}
```

---

## `.env.example` (frontend)

```
NEXT_PUBLIC_PI_API_URL=http://raspberrypi.local:8000
```

---

## Accessibilité & UX

- Tous les boutons ont `aria-label`
- Loading states sur chaque action async
- Toast notifications pour start/stop/erreurs (composant `Toast` simple)
- Responsive : fonctionne sur mobile (sidebar se collapse)
- Pas de dépendances CSS externes autres que Tailwind
