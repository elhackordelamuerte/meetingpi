import { clsx } from "clsx";
import { Spinner } from "@/components/ui/Spinner";
import type { MeetingStatus } from "@/lib/types";

interface SummaryPanelProps {
  summary: string | null;
  status: MeetingStatus;
}

/** Minimal inline Markdown → JSX renderer (##, **, - bullets). */
function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={i}
          className="mt-5 mb-2 font-mono text-sm font-semibold text-text-primary"
        >
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="mt-3 mb-1 text-sm font-semibold text-text-primary">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-sm text-text-secondary">
          <InlineMarkdown text={line.slice(2)} />
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm text-text-secondary">
          <InlineMarkdown text={line} />
        </p>
      );
    }
  }

  return <div className="flex flex-col">{elements}</div>;
}

function InlineMarkdown({ text }: { text: string }) {
  // Handle **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-text-primary">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

const PIPELINE_STEPS: { key: MeetingStatus | "idle"; label: string }[] = [
  { key: "recording", label: "Enreg." },
  { key: "transcribing", label: "Transcription" },
  { key: "summarizing", label: "Résumé" },
  { key: "done", label: "Terminé" },
];

const STATUS_ORDER: Partial<Record<MeetingStatus, number>> = {
  recording: 0,
  transcribing: 1,
  summarizing: 2,
  done: 3,
  error: -1,
};

export function SummaryPanel({ summary, status }: SummaryPanelProps) {
  if (status === "error") {
    return (
      <div className="rounded-lg border border-accent-red/30 bg-accent-red/10 p-4">
        <p className="text-sm font-medium text-accent-red">
          Une erreur est survenue lors du traitement.
        </p>
      </div>
    );
  }

  if (status !== "done") {
    const currentStep = STATUS_ORDER[status] ?? 0;

    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/5 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Spinner
              size="sm"
              aria-label={`Traitement en cours : ${status}`}
            />
            <p className="text-sm text-accent-amber">Traitement en cours…</p>
          </div>

          <div className="flex items-center gap-2">
            {PIPELINE_STEPS.map((step, idx) => {
              const isCompleted = idx < currentStep;
              const isCurrent = idx === currentStep;
              return (
                <div key={step.key} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={clsx(
                        "h-2 w-2 rounded-full",
                        isCompleted && "bg-accent-green",
                        isCurrent && "animate-pulse bg-accent-amber",
                        !isCompleted && !isCurrent && "bg-text-muted"
                      )}
                    />
                    <span className="whitespace-nowrap text-xs text-text-muted">
                      {step.label}
                    </span>
                  </div>
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <div
                      className={clsx(
                        "mb-4 h-px w-6",
                        isCompleted ? "bg-accent-green" : "bg-border"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="py-12 text-center text-text-muted">
        <p>Résumé non disponible.</p>
      </div>
    );
  }

  return (
    <div className="prose-none">
      <MarkdownRenderer content={summary} />
    </div>
  );
}
