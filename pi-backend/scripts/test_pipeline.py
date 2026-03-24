import asyncio
import os
import sys
from pathlib import Path

# Add the parent directory to sys.path to import services
sys.path.append(str(Path(__file__).parent.parent))

from services.audio import get_audio_service
from services.transcription import get_transcription_service
from services.summarizer import get_summarizer_service
from dotenv import load_dotenv

load_dotenv()

RECORDINGS_DIR = os.getenv("RECORDINGS_DIR", "/tmp/recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

async def test_record():
    print("\n--- TEST RECORD (5 secondes) ---")
    audio_service = get_audio_service()
    meeting_id = "test-uuid"
    output_path = os.path.join(RECORDINGS_DIR, f"{meeting_id}.wav")
    
    print(f"Démarrage de l'enregistrement vers {output_path}...")
    try:
        await audio_service.start_recording(meeting_id, output_path)
        await asyncio.sleep(5)
        result = await audio_service.stop_recording()
        print(f"Enregistrement terminé: {result}")
        if os.path.exists(output_path):
            print(f"Fichier créé avec succès: {os.path.getsize(output_path)} octets")
            return output_path
        else:
            print("ERREUR: Le fichier n'a pas été créé.")
            return None
    except Exception as e:
        print(f"ERREUR lors de l'enregistrement: {e}")
        return None

async def test_transcription(audio_path):
    print("\n--- TEST TRANSCRIPTION ---")
    if not audio_path or not os.path.exists(audio_path):
        print("ERREUR: Pas de fichier audio à transcrire.")
        return None
    
    transcription_service = get_transcription_service()
    print(f"Transcription du fichier {audio_path}...")
    try:
        transcript = await transcription_service.transcribe(audio_path)
        print("Transcription réussie !")
        print(f"Extrait : {transcript[:200]}...")
        return transcript
    except Exception as e:
        print(f"ERREUR lors de la transcription: {e}")
        return None

async def test_summary(transcript):
    print("\n--- TEST RÉSUMÉ IA (Ollama) ---")
    if not transcript:
        print("ERREUR: Pas de texte à résumer.")
        return
    
    summarizer_service = get_summarizer_service()
    print("Demande de résumé à Ollama...")
    try:
        summary = await summarizer_service.summarize(transcript)
        print("Résumé généré avec succès !")
        print(f"\nRÉSUMÉ :\n{summary}")
    except Exception as e:
        print(f"ERREUR lors du résumé: {e}")

async def main():
    print("=== TEST PIPELINE MEETINGPI ===")
    
    # 1. Test Audio
    audio_path = await test_record()
    
    # 2. Test Transcription
    transcript = await test_transcription(audio_path)
    
    # 3. Test Résumé
    await test_summary(transcript)
    
    print("\n=== FIN DU TEST ===")

if __name__ == "__main__":
    asyncio.run(main())
