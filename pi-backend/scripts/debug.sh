#!/bin/bash
set -euo pipefail

echo "════════════════════════════════════════════"
echo "=== MeetingPi Debug Report ==="
echo "Date: $(date)"
echo "════════════════════════════════════════════"
echo ""

# ── SYSTÈME ───────────────────────────────────────────────────────────────────
echo "--- SYSTÈME ---"
echo "OS         : $(grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '\"')"
echo "Kernel     : $(uname -r)"
echo "Arch       : $(uname -m)"
echo "Hostname   : $(hostname)"
echo "Uptime     : $(uptime -p)"
echo ""

# ── RESSOURCES ────────────────────────────────────────────────────────────────
echo "--- RESSOURCES ---"
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2 + $4}')
echo "CPU utilisé : ${CPU_USAGE}%"
free -h | awk '/Mem:/{printf "RAM : %s utilisé / %s total (libre: %s)\n", $3, $2, $4}'

TEMP_FILE="/sys/class/thermal/thermal_zone0/temp"
if [ -f "$TEMP_FILE" ]; then
  TEMP=$(awk '{printf "%.1f°C", $1/1000}' "$TEMP_FILE")
  echo "Température : $TEMP"
else
  echo "Température : N/A (sysfs non disponible)"
fi

df -h / | awk 'NR==2{printf "Disque /    : %s utilisé / %s total (%s utilisé)\n", $3, $2, $5}'
echo ""

# ── AUDIO ─────────────────────────────────────────────────────────────────────
echo "--- AUDIO ---"
echo "Périphériques d'enregistrement disponibles :"
if command -v arecord &> /dev/null; then
  arecord -l 2>/dev/null || echo "  (aucun périphérique détecté)"
else
  echo "ERREUR : arecord non installé (apt install alsa-utils)"
fi
echo ""

# ── CHARGEMENT CONFIG ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ -f "$ENV_FILE" ]; then
  # Load env vars but don't overwrite existing ones
  set -a
  source "$ENV_FILE"
  set +a
fi

# ── WHISPER.CPP ───────────────────────────────────────────────────────────────
echo "--- WHISPER.CPP ---"
WHISPER_BIN="${WHISPER_BIN:-$HOME/whisper.cpp/build/bin/whisper-cli}"
if [ ! -f "$WHISPER_BIN" ] && [ -f "$HOME/whisper.cpp/main" ]; then
  WHISPER_BIN="$HOME/whisper.cpp/main"
fi
WHISPER_MODEL="${WHISPER_MODEL_PATH:-$HOME/whisper.cpp/models/ggml-tiny.en.q5_1.bin}"
if [ ! -f "$WHISPER_MODEL" ] && [ -f "$HOME/whisper.cpp/models/ggml-model-tiny.en.q5_1.bin" ]; then
  WHISPER_MODEL="$HOME/whisper.cpp/models/ggml-model-tiny.en.q5_1.bin"
fi

if [ -f "$WHISPER_BIN" ]; then
  echo "✓ Binaire     : $WHISPER_BIN"
  echo "  Taille      : $(ls -lh "$WHISPER_BIN" | awk '{print $5}')"
else
  echo "✗ Binaire absent : $WHISPER_BIN"
  echo "  → Relancer scripts/setup.sh ou vérifier WHISPER_BIN dans .env"
fi

if [ -f "$WHISPER_MODEL" ]; then
  echo "✓ Modèle      : $WHISPER_MODEL"
  echo "  Taille      : $(ls -lh "$WHISPER_MODEL" | awk '{print $5}')"
else
  echo "✗ Modèle absent : $WHISPER_MODEL"
  echo "  → Vérifier WHISPER_MODEL_PATH dans .env"
fi

MODEL_DIR=$(dirname "${WHISPER_MODEL}")
if [ -d "$MODEL_DIR" ]; then
  echo "  Modèles dispo :"
  ls -lh "$MODEL_DIR"/*.bin 2>/dev/null | awk '{printf "    %s (%s)\n", $NF, $5}' || echo "    (aucun)"
fi
echo ""

# ── OLLAMA ────────────────────────────────────────────────────────────────────
echo "--- OLLAMA ---"
if command -v ollama &> /dev/null; then
  echo "✓ Installé    : $(ollama --version 2>/dev/null | head -n 1 || echo 'version inconnue')"
  echo "  Modèles disponibles :"
  ollama list 2>/dev/null | tail -n +2 | awk '{printf "    %-20s %s\n", $1, $3}' || echo "  ⚠ Ollama non démarré (systemctl start meetingpi-ollama)"
else
  echo "✗ Ollama absent — relancer scripts/setup.sh"
fi
echo ""

# ── FFMPEG ────────────────────────────────────────────────────────────────────
echo "--- FFMPEG ---"
if command -v ffmpeg &> /dev/null; then
  FFMPEG_VER=$(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')
  echo "✓ ffmpeg $FFMPEG_VER"
else
  echo "✗ ffmpeg absent (apt install ffmpeg)"
fi
echo ""

# ── SERVICES SYSTEMD ──────────────────────────────────────────────────────────
echo "--- SERVICES SYSTEMD ---"
for svc in meetingpi-api meetingpi-ollama; do
  if systemctl is-enabled --quiet "$svc" 2>/dev/null; then
    STATUS=$(systemctl is-active "$svc" 2>/dev/null || echo "inactive")
    ENABLED="enabled"
  else
    STATUS=$(systemctl is-active "$svc" 2>/dev/null || echo "absent")
    ENABLED="absent"
  fi
  printf "  %-25s status=%-10s enabled=%s\n" "$svc" "$STATUS" "$ENABLED"
done
echo ""

# ── API HEALTHCHECK ───────────────────────────────────────────────────────────
echo "--- API HEALTHCHECK ---"
API_URL="${PI_API_URL:-http://localhost:8000}"
HEALTH_RESP=$(curl -s --max-time 5 "${API_URL}/" 2>/dev/null || echo "ERREUR")
if echo "$HEALTH_RESP" | grep -q '"status":"ok"'; then
  echo "✓ API joignable : $API_URL"
  echo "  Réponse       : $HEALTH_RESP"
else
  echo "✗ API non joignable : $API_URL"
  echo "  → Vérifier : sudo systemctl status meetingpi-api"
fi
echo ""

# ── DOSSIER RECORDINGS ────────────────────────────────────────────────────────
echo "--- RECORDINGS ---"
REC_DIR="${RECORDINGS_DIR:-$HOME/recordings}"
if [ -d "$REC_DIR" ]; then
  COUNT=$(find "$REC_DIR" -maxdepth 1 -name "*.wav" 2>/dev/null | wc -l)
  SIZE=$(du -sh "$REC_DIR" 2>/dev/null | awk '{print $1}')
  echo "✓ Dossier     : $REC_DIR"
  echo "  Fichiers WAV : $COUNT"
  echo "  Taille totale: $SIZE"
  echo "  Permissions  : $(stat -c "%a %U:%G" "$REC_DIR" 2>/dev/null || stat -f "%p %Su:%Sg" "$REC_DIR" 2>/dev/null)"
else
  echo "✗ Dossier absent : $REC_DIR (mkdir -p $REC_DIR && chmod 700 $REC_DIR)"
fi
echo ""

# ── DERNIERS LOGS API ──────────────────────────────────────────────────────────
echo "--- DERNIERS LOGS meetingpi-api (20 lignes) ---"
journalctl -u meetingpi-api -n 20 --no-pager 2>/dev/null \
  || echo "  (journalctl non disponible — logs systemd absents)"

echo ""
echo "════════════════════════════════════════════"
echo "=== Fin du rapport debug ==="
echo "════════════════════════════════════════════"
