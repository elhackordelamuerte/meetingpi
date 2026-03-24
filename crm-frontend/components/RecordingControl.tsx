"use client";

import { clsx } from "clsx";
import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";

interface RecordingControlProps {
  onStart: (title?: string) => Promise<void>;
  onStop: () => Promise<void>;
  /** Live status from API polling */
  isRecording: boolean;
  elapsedSeconds: number | null;
  isProcessing: boolean;
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function RecordingControl({
  onStart,
  onStop,
  isRecording,
  elapsedSeconds,
  isProcessing,
}: RecordingControlProps) {
  const [inputTitle, setInputTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [localElapsed, setLocalElapsed] = useState(elapsedSeconds ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync localElapsed with server-reported elapsed_s
  useEffect(() => {
    if (elapsedSeconds !== null) setLocalElapsed(elapsedSeconds);
  }, [elapsedSeconds]);

  // Local tick to keep timer smooth between polls
  useEffect(() => {
    if (isRecording) {
      intervalRef.current = setInterval(() => {
        setLocalElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setLocalElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRecording]);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await onStart(inputTitle.trim() || undefined);
      setInputTitle("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await onStop();
    } finally {
      setIsLoading(false);
    }
  };

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-accent-amber/30 bg-accent-amber/5 p-8">
        <Spinner size="lg" aria-label="Traitement en cours" />
        <p className="text-text-secondary">Pipeline en cours…</p>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "rounded-xl border p-8 transition-colors",
        isRecording
          ? "border-accent-red/40 bg-accent-red/5"
          : "border-border bg-bg-surface"
      )}
    >
      {isRecording && (
        <div className="mb-6 flex items-center justify-center gap-3">
          <span
            className="h-3 w-3 animate-pulse rounded-full bg-accent-red"
            aria-label="Enregistrement actif"
          />
          <span className="font-mono text-2xl font-bold text-accent-red">
            {formatTime(localElapsed)}
          </span>
          <span className="text-sm text-accent-red/70">EN COURS</span>
        </div>
      )}

      <div className="flex flex-col items-center gap-4">
        {isRecording ? (
          <Button
            variant="danger"
            size="lg"
            onClick={() => void handleStop()}
            isLoading={isLoading}
            aria-label="Arrêter l'enregistrement"
            className="w-full max-w-xs"
          >
            <Square className="h-5 w-5" aria-hidden="true" />
            Arrêter l&apos;enregistrement
          </Button>
        ) : (
          <>
            <Button
              variant="primary"
              size="lg"
              onClick={() => void handleStart()}
              isLoading={isLoading}
              aria-label="Démarrer l'enregistrement"
              className="w-full max-w-xs"
            >
              <Mic className="h-5 w-5" aria-hidden="true" />
              Démarrer l&apos;enregistrement
            </Button>

            <div className="flex w-full max-w-xs flex-col gap-1">
              <label
                htmlFor="recording-title"
                className="text-xs text-text-muted"
              >
                Titre (optionnel)
              </label>
              <input
                id="recording-title"
                type="text"
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
                placeholder="Ex. Sprint Review S14"
                className="rounded border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleStart();
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
