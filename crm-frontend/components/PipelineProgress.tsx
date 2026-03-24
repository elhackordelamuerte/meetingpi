import { clsx } from "clsx";
import type { MeetingListItem, MeetingStatus } from "@/lib/types";

interface PipelineProgressProps {
  meeting: MeetingListItem;
}

const STEPS: { key: MeetingStatus | "idle"; label: string }[] = [
  { key: "recording", label: "Enreg. ✓" },
  { key: "transcribing", label: "Transcription" },
  { key: "summarizing", label: "Résumé" },
];

const STEP_ORDER: Partial<Record<MeetingStatus, number>> = {
  transcribing: 1,
  summarizing: 2,
};

export function PipelineProgress({ meeting }: PipelineProgressProps) {
  if (meeting.status !== "transcribing" && meeting.status !== "summarizing") {
    return null;
  }

  const current = STEP_ORDER[meeting.status] ?? 0;

  return (
    <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/5 p-3">
      <p className="mb-2 flex items-center gap-2 text-xs text-accent-amber">
        <span
          className="inline-block h-2 w-2 animate-spin rounded-full border border-accent-amber border-t-transparent"
          aria-hidden="true"
        />
        Traitement en cours —{" "}
        <span className="font-medium text-text-primary">{meeting.title}</span>
      </p>
      <div className="flex items-center gap-2">
        {STEPS.map((step, idx) => (
          <div key={step.key} className="flex items-center gap-2">
            <span
              className={clsx(
                "text-xs",
                idx < current && "text-accent-green",
                idx === current && "animate-pulse text-accent-amber",
                idx > current && "text-text-muted"
              )}
            >
              {step.label}
            </span>
            {idx < STEPS.length - 1 && (
              <span
                className={clsx(
                  "text-xs",
                  idx < current ? "text-accent-green" : "text-text-muted"
                )}
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
