"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { api } from "../../lib/api";
import type { SystemHealth, SystemModels } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_PI_API_URL ?? "http://raspberrypi.local:8000";

export default function SettingsPage() {
  const { toast } = useToast();

  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [ollamaModel, setOllamaModel] = useState("llama3:8b");
  const [summaryLang, setSummaryLang] = useState("fr");
  const [keepAudio, setKeepAudio] = useState(false);
  const [audioDevice, setAudioDevice] = useState("plughw:1,0");
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<boolean | null>(null);

  // Load saved settings from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    setApiUrl(localStorage.getItem("pi_api_url") ?? DEFAULT_API_URL);
    setOllamaModel(localStorage.getItem("ollama_model") ?? "llama3:8b");
    setSummaryLang(localStorage.getItem("summary_lang") ?? "fr");
    setKeepAudio(localStorage.getItem("keep_audio") === "true");
    setAudioDevice(localStorage.getItem("audio_device") ?? "plughw:1,0");
  }, []);

  const { data: models } = useQuery<SystemModels>({
    queryKey: ["system-models"],
    queryFn: () => api.getModels(),
    retry: 1,
  });

  const handleTestConnection = async () => {
    setTestingConn(true);
    setConnResult(null);
    try {
      const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/system/health`);
      const json = (await res.json()) as SystemHealth;
      setConnResult(json.status === "ok");
    } catch {
      setConnResult(false);
    } finally {
      setTestingConn(false);
    }
  };

  const handleSave = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem("pi_api_url", apiUrl);
    localStorage.setItem("ollama_model", ollamaModel);
    localStorage.setItem("summary_lang", summaryLang);
    localStorage.setItem("keep_audio", keepAudio ? "true" : "false");
    localStorage.setItem("audio_device", audioDevice);
    toast("Paramètres enregistrés", "success");
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="mb-6 font-mono text-xl font-bold text-text-primary">
        Paramètres
      </h1>

      {/* ── Connexion Pi ─────────────────────────────────────────────── */}
      <Card className="mb-4">
        <h2 className="mb-4 font-mono text-sm font-semibold text-text-primary">
          Connexion Pi
        </h2>
        <div className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="api-url"
              className="mb-1 block text-xs text-text-secondary"
            >
              URL de l&apos;API
            </label>
            <div className="flex items-center gap-2">
              <input
                id="api-url"
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="flex-1 rounded border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                placeholder="http://raspberrypi.local:8000"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleTestConnection()}
                isLoading={testingConn}
                aria-label="Tester la connexion"
              >
                {testingConn ? (
                  <Spinner size="sm" />
                ) : connResult === true ? (
                  <Check className="h-4 w-4 text-accent-green" aria-hidden="true" />
                ) : connResult === false ? (
                  <X className="h-4 w-4 text-accent-red" aria-hidden="true" />
                ) : null}
                Tester
              </Button>
            </div>
            {connResult === true && (
              <p className="mt-1 text-xs text-accent-green">✓ Connexion établie</p>
            )}
            {connResult === false && (
              <p className="mt-1 text-xs text-accent-red">
                ✗ Impossible de joindre le Pi
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ── Modèle IA ────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <h2 className="mb-4 font-mono text-sm font-semibold text-text-primary">
          Modèle IA
        </h2>
        <div className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="ollama-model"
              className="mb-1 block text-xs text-text-secondary"
            >
              Modèle Ollama
            </label>
            <select
              id="ollama-model"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              className="w-full rounded border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
            >
              {models?.ollama_models_available.length
                ? models.ollama_models_available.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                : [
                    <option key="llama3" value="llama3:8b">
                      llama3:8b
                    </option>,
                    <option key="phi3" value="phi3:mini">
                      phi3:mini
                    </option>,
                  ]}
            </select>
          </div>

          <div>
            <label
              htmlFor="summary-lang"
              className="mb-1 block text-xs text-text-secondary"
            >
              Langue du résumé
            </label>
            <select
              id="summary-lang"
              value={summaryLang}
              onChange={(e) => setSummaryLang(e.target.value)}
              className="w-full rounded border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
            >
              <option value="fr">Français</option>
              <option value="en">Anglais</option>
            </select>
          </div>
        </div>
      </Card>

      {/* ── Enregistrement ───────────────────────────────────────────── */}
      <Card className="mb-6">
        <h2 className="mb-4 font-mono text-sm font-semibold text-text-primary">
          Enregistrement
        </h2>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">
                Conserver les fichiers audio
              </p>
              <p className="text-xs text-text-muted">
                Activé : les .wav sont gardés après transcription
              </p>
            </div>
            <button
              role="switch"
              aria-checked={keepAudio}
              aria-label="Conserver les fichiers audio"
              onClick={() => setKeepAudio((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                keepAudio ? "bg-accent-blue" : "bg-bg-elevated border border-border"
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                  keepAudio ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div>
            <label
              htmlFor="audio-device"
              className="mb-1 block text-xs text-text-secondary"
            >
              Périphérique audio (ALSA)
            </label>
            <input
              id="audio-device"
              type="text"
              value={audioDevice}
              onChange={(e) => setAudioDevice(e.target.value)}
              className="w-full rounded border border-border bg-bg-elevated px-3 py-2 text-sm font-mono text-text-primary focus:border-accent-blue focus:outline-none"
              placeholder="plughw:1,0"
            />
          </div>
        </div>
      </Card>

      <Button
        variant="primary"
        size="md"
        onClick={handleSave}
        aria-label="Enregistrer les paramètres"
      >
        Enregistrer
      </Button>
    </div>
  );
}
