"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";

interface TranscriptViewerProps {
  transcript: string | null;
  isLoading: boolean;
}

export function TranscriptViewer({
  transcript,
  isLoading,
}: TranscriptViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner aria-label="Chargement de la transcription" />
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="py-12 text-center text-text-muted">
        <p>Transcription non disponible.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleCopy()}
          aria-label="Copier la transcription"
        >
          {copied ? (
            <Check className="h-4 w-4 text-accent-green" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? "Copié !" : "Copier"}
        </Button>
      </div>
      <pre className="max-h-[600px] overflow-y-auto rounded-lg border border-border bg-bg-elevated p-4 pt-12 font-mono text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
        {transcript}
      </pre>
    </div>
  );
}
