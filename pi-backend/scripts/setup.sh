#!/bin/bash
set -euo pipefail

echo "=== MeetingPi Setup Script ==="
echo "Date: $(date)"
echo ""

# ── CONFIGURATION DYNAMIQUE ───────────────────────────────────────────────────
REAL_USER=${SUDO_USER:-$USER}
USER_HOME=$(eval echo "~$REAL_USER")
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Utilisateur detecté : $REAL_USER"
echo "Home de l'utilisateur : $USER_HOME"
echo "Dossier du projet : $PROJECT_ROOT"
echo ""

# ── 1. Mise à jour système ─────────────────────────────────────────────────────
echo "--- [1/8] Mise à jour système ---"
sudo apt update && sudo apt full-upgrade -y
echo "OK"

# ── 2. Dépendances système ─────────────────────────────────────────────────────
echo "--- [2/8] Installation des dépendances système ---"
sudo apt install -y \
  python3.11 python3.11-venv python3-pip \
  alsa-utils libasound2-dev \
  ffmpeg \
  git gcc-12 g++-12 make curl bc
echo "OK"

# ── 3. Python venv ─────────────────────────────────────────────────────────────
echo "--- [3/8] Création de l'environnement Python ---"
VENV_PATH="$PROJECT_ROOT/.venv"
if [ ! -d "$VENV_PATH" ]; then
  python3.11 -m venv "$VENV_PATH"
fi
source "$VENV_PATH/bin/activate"
pip install --upgrade pip
pip install -r "$PROJECT_ROOT/pi-backend/requirements.txt"
echo "OK"

# ── 4. Compiler Whisper.cpp ────────────────────────────────────────────────────
echo "--- [4/8] Compilation de whisper.cpp ---"
WHISPER_DIR="$USER_HOME/whisper.cpp"
if [ ! -f "$WHISPER_DIR/main" ]; then
  cd "$USER_HOME"
  echo "Clonage du dépôt whisper.cpp..."
  git clone https://github.com/ggerganov/whisper.cpp
  cd whisper.cpp
  echo "Compilation pour ARM64 (pas d'AVX)..."
  make clean && make \
    CC=gcc-12 \
    CXX=g++-12 \
    WHISPER_AVX=0 \
    WHISPER_AVX2=0 \
    WHISPER_ARM=1 \
    WHISPER_ARM_FMA=1
  echo "Téléchargement du modèle tiny.en..."
  bash ./models/download-ggml-model.sh tiny.en
  
  echo "Quantification q5_1 (moins de RAM)..."
  # Support both old (ggml-model-tiny.en.bin) and new (ggml-tiny.en.bin) filenames
  SRC_MODEL="./models/ggml-tiny.en.bin"
  if [ ! -f "$SRC_MODEL" ]; then SRC_MODEL="./models/ggml-model-tiny.en.bin"; fi
  
  DST_MODEL="./models/ggml-tiny.en.q5_1.bin"
  
  if [ -f "$SRC_MODEL" ]; then
    if [ -f "./build/bin/whisper-quantize" ]; then
      ./build/bin/whisper-quantize "$SRC_MODEL" "$DST_MODEL" q5_1
    elif [ -f "./quantize" ]; then
      ./quantize "$SRC_MODEL" "$DST_MODEL" q5_1
    fi
  fi
  
  echo "OK — modèle prêt: $(ls -lh $WHISPER_DIR/models/ggml-tiny.en.q5_1.bin 2>/dev/null || ls -lh $WHISPER_DIR/models/ggml-model-tiny.en.q5_1.bin 2>/dev/null || echo 'ERREUR')"
else
  echo "SKIP — whisper.cpp déjà compilé"
fi

# ── 5. Installer Ollama ────────────────────────────────────────────────────────
echo "--- [5/8] Installation d'Ollama ---"
if ! command -v ollama &> /dev/null; then
  echo "Téléchargement et installation d'Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
  sleep 3
  # Choisir le modèle selon la RAM disponible
  RAM_GB=$(free -g | awk '/Mem:/{print $2}')
  if [ "$RAM_GB" -ge 7 ]; then
    echo "RAM >= 7GB — installation de llama3:8b"
    ollama pull llama3:8b
  else
    echo "RAM < 7GB — installation de phi3:mini (moins gourmand)"
    ollama pull phi3:mini
  fi
  echo "OK"
else
  echo "SKIP — Ollama déjà installé: $(ollama --version)"
fi

# ── 6. Créer les dossiers de travail ──────────────────────────────────────────
echo "--- [6/8] Création des dossiers ---"
REC_DIR="$PROJECT_ROOT/recordings"
mkdir -p "$REC_DIR"
chmod 700 "$REC_DIR"
echo "OK — $REC_DIR (permissions 700)"

# ── 7. Configurer l'environnement ─────────────────────────────────────────────
echo "--- [7/8] Configuration .env ---"
ENV_FILE="$PROJECT_ROOT/pi-backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$PROJECT_ROOT/pi-backend/.env.example" "$ENV_FILE" 2>/dev/null || \
  cp "$PROJECT_ROOT/.env.example" "$ENV_FILE" 2>/dev/null || touch "$ENV_FILE"
  
  # Update paths in .env - Support new whisper.cpp structure
  if [ -f "$WHISPER_DIR/build/bin/whisper-cli" ]; then
    sed -i "s|WHISPER_BIN=.*|WHISPER_BIN=$WHISPER_DIR/build/bin/whisper-cli|" "$ENV_FILE"
  else
    sed -i "s|/home/pi/whisper.cpp/main|$WHISPER_DIR/main|g" "$ENV_FILE"
  fi
  sed -i "s|/home/pi/whisper.cpp|$WHISPER_DIR|g" "$ENV_FILE"
  sed -i "s|/home/pi/recordings|$REC_DIR|g" "$ENV_FILE"
  
  # Auto-detect Ollama model
  if ollama list 2>/dev/null | grep -q "llama3:8b"; then
    sed -i 's/OLLAMA_MODEL=.*/OLLAMA_MODEL=llama3:8b/' "$ENV_FILE"
  else
    sed -i 's/OLLAMA_MODEL=.*/OLLAMA_MODEL=phi3:mini/' "$ENV_FILE"
  fi
  echo "OK — Fichier .env créé"
  echo "⚠️  Vérifiez $ENV_FILE avant de démarrer"
else
  echo "SKIP — .env existe déjà"
fi

# ── 8. Installer services systemd ─────────────────────────────────────────────
echo "--- [8/8] Installation des services systemd ---"
# Update templates with current user and paths
for svc_file in "$PROJECT_ROOT/pi-backend/systemd"/*.service; do
  svc_name=$(basename "$svc_file")
  sed "s/User=pi/User=$REAL_USER/g; s/Group=pi/Group=$REAL_USER/g; s|/home/pi|$USER_HOME|g; s|/home/cmoi|$USER_HOME|g" "$svc_file" | \
  sudo tee "/etc/systemd/system/$svc_name" > /dev/null
done

sudo systemctl daemon-reload
sudo systemctl enable meetingpi-api meetingpi-ollama

echo "Démarrage d'Ollama..."
sudo systemctl start meetingpi-ollama
sleep 5

echo "Démarrage de l'API MeetingPi..."
sudo systemctl start meetingpi-api
sleep 3

# Vérification finale
if systemctl is-active --quiet meetingpi-api; then
  echo "OK — meetingpi-api actif"
else
  echo "ERREUR — meetingpi-api n'a pas démarré. Consultez: journalctl -u meetingpi-api -n 30"
fi

LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "════════════════════════════════════════════════════"
echo "=== Setup MeetingPi terminé ! ==="
echo "API disponible sur : http://${LOCAL_IP}:8000"
echo "Docs Swagger      : http://${LOCAL_IP}:8000/docs"
echo "Debug             : bash scripts/debug.sh"
echo "════════════════════════════════════════════════════"
