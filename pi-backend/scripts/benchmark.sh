#!/bin/bash
set -euo pipefail

echo "════════════════════════════════════════════"
echo "=== MeetingPi Whisper Benchmark ==="
echo "Date: $(date)"
echo "════════════════════════════════════════════"
echo ""

# ── CHARGEMENT CONFIG ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

MODEL="${1:-${WHISPER_MODEL_PATH:-$HOME/whisper.cpp/models/ggml-model-tiny.en.q5_1.bin}}"
WHISPER="${2:-${WHISPER_BIN:-$HOME/whisper.cpp/main}}"
DURATION="${3:-60}"  # Durée du fichier test en secondes (défaut 60s)

TESTFILE="/tmp/meetingpi_benchmark_${DURATION}s.wav"

# ── Vérifications préliminaires ────────────────────────────────────────────────
if [ ! -f "$WHISPER" ]; then
  echo "ERREUR : Binaire whisper.cpp introuvable : $WHISPER"
  echo "→ Vérifiez WHISPER_BIN dans votre .env"
  exit 1
fi

if [ ! -f "$MODEL" ]; then
  echo "ERREUR : Modèle introuvable : $MODEL"
  echo "→ Vérifiez WHISPER_MODEL_PATH dans votre .env"
  exit 1
fi

echo "Binaire  : $WHISPER"
echo "Modèle   : $MODEL ($(ls -lh "$MODEL" | awk '{print $5}' 2>/dev/null || echo 'N/A'))"
echo "Durée    : ${DURATION}s"
echo ""

# ── Génération du fichier de test ──────────────────────────────────────────────
if [ ! -f "$TESTFILE" ]; then
  echo "Génération du fichier test (${DURATION}s de silence)..."
  if ffmpeg -f lavfi -i "anullsrc=r=16000:cl=mono" \
      -t "$DURATION" -ar 16000 -ac 1 -f wav "$TESTFILE" -y 2>/dev/null; then
    echo "✓ Fichier créé via ffmpeg : $TESTFILE"
  else
    echo "ERREUR : ffmpeg n'a pas pu générer le fichier test"
    echo "→ apt install ffmpeg"
    exit 1
  fi
else
  echo "Réutilisation fichier existant : $TESTFILE"
fi

echo ""

# ── Mesure mémoire avant ───────────────────────────────────────────────────────
RAM_BEFORE=$(free -m | awk '/Mem:/{print $3}')
TEMP_BEFORE="N/A"
if [ -f "/sys/class/thermal/thermal_zone0/temp" ]; then
  TEMP_BEFORE=$(awk '{printf "%.1f°C", $1/1000}' /sys/class/thermal/thermal_zone0/temp)
fi

echo "Mémoire avant  : ${RAM_BEFORE}MB utilisé"
echo "Température    : $TEMP_BEFORE"
echo ""
echo "Lancement de la transcription..."

# ── Transcription + mesure temps ──────────────────────────────────────────────
START_NS=$(date +%s%N)

"$WHISPER" \
  -m "$MODEL" \
  -f "$TESTFILE" \
  -otxt \
  --language fr \
  --threads 3 \
  > /dev/null 2>&1

EXIT_CODE=$?
END_NS=$(date +%s%N)

# ── Mesure mémoire et température après ───────────────────────────────────────
RAM_AFTER=$(free -m | awk '/Mem:/{print $3}')
TEMP_AFTER="N/A"
if [ -f "/sys/class/thermal/thermal_zone0/temp" ]; then
  TEMP_AFTER=$(awk '{printf "%.1f°C", $1/1000}' /sys/class/thermal/thermal_zone0/temp)
fi

# ── Calcul résultats ───────────────────────────────────────────────────────────
ELAPSED_MS=$(( (END_NS - START_NS) / 1000000 ))
ELAPSED_S=$(echo "scale=2; $ELAPSED_MS / 1000" | bc)
RATIO=$(echo "scale=2; ${DURATION}000 / $ELAPSED_MS" | bc 2>/dev/null || echo "N/A")
RAM_DELTA=$(( RAM_AFTER - RAM_BEFORE ))

if [ $EXIT_CODE -ne 0 ]; then
  echo "ERREUR : Whisper a échoué (code $EXIT_CODE)"
  exit $EXIT_CODE
fi

echo ""
echo "════════════════════════════════════════════"
echo "=== Résultats du benchmark ==="
echo "════════════════════════════════════════════"
printf "Durée audio          : %ds\n" "$DURATION"
printf "Temps transcription  : %sms (%ss)\n" "$ELAPSED_MS" "$ELAPSED_S"
printf "Ratio temps-réel     : %sx  (>1 = plus rapide que temps réel)\n" "$RATIO"
printf "RAM avant / après    : %sMB / %sMB (delta: +%sMB)\n" "$RAM_BEFORE" "$RAM_AFTER" "$RAM_DELTA"
printf "Température avant/ap : %s → %s\n" "$TEMP_BEFORE" "$TEMP_AFTER"
echo ""

# ── Interprétation ────────────────────────────────────────────────────────────
echo "--- Interprétation ---"
RATIO_INT=$(echo "$RATIO" | cut -d. -f1)
if [ "${RATIO_INT:-0}" -ge 1 ] 2>/dev/null; then
  echo "✓ Performances OK : transcription plus rapide que temps réel"
elif echo "$RATIO" | grep -q "^0\.[5-9]"; then
  echo "⚠ Performances LIMITES : envisager phi3:mini + tiny model"
else
  echo "✗ Performances INSUFFISANTES : vérifier la charge système"
fi

# ── Nettoyage ─────────────────────────────────────────────────────────────────
rm -f "$TESTFILE" "${TESTFILE}.txt"
echo ""
echo "Nettoyage des fichiers temporaires effectué."
echo "════════════════════════════════════════════"
