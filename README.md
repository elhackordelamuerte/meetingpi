# MeetingPi 🎙

**Transcription de réunions 100% locale sur Raspberry Pi**

Enregistrez, transcrivez et résumez vos réunions sans envoyer la moindre donnée à un serveur externe. Whisper.cpp + Ollama + interface web pilotable depuis n'importe quel appareil du réseau local.

---

## Fonctionnalités

- 🎙 **Enregistrement** one-click via interface web
- 📝 **Transcription automatique** avec Whisper.cpp (ARM64 optimisé)
- 🤖 **Résumé IA** via Ollama (llama3 ou phi3, 100% local)
- 📋 **CRM web** : historique, détail, export Markdown
- 📊 **Monitoring Pi** : CPU, RAM, température en temps réel
- 🔒 **Zéro cloud** : toutes les données restent sur votre Pi

---

## Matériel requis

| Composant | Minimum | Recommandé |
|-----------|---------|------------|
| Raspberry Pi | Pi 4 (4GB) | Pi 5 (8GB) |
| MicroSD | 64GB Class 10 UHS-I | 128GB SanDisk Extreme |
| Alimentation | Officielle Pi 4 (15W) | Officielle Pi 5 (27W) |
| Microphone | USB condenser (Fifine K669B) | Samson Q2U |
| OS | Raspberry Pi OS 64-bit Lite | idem |

---

## Installation rapide

```bash
# Sur le Raspberry Pi
git clone https://github.com/yourname/meetingpi
cd meetingpi
bash pi-backend/scripts/setup.sh
```

Le script installe automatiquement : Whisper.cpp, Ollama, l'API FastAPI, et configure les services systemd.

---

## Lancer le CRM (sur votre laptop)

```bash
cd crm-frontend
cp .env.example .env.local
# Éditer NEXT_PUBLIC_PI_API_URL avec l'IP de votre Pi
npm install && npm run dev
```

Ouvrez http://localhost:3000

---

## Diagnostic

```bash
# Sur le Pi
bash pi-backend/scripts/debug.sh

# Tests unitaires
cd pi-backend && python -m pytest tests/ -v

# Benchmark Whisper
bash pi-backend/scripts/benchmark.sh
```

---

## Structure

Voir [ARCHITECTURE.md](./ARCHITECTURE.md) pour le détail complet.

---

## Licence

MIT
