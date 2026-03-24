import { clsx } from "clsx";
import type { MeetingStatus } from "@/lib/types";

interface BadgeProps {
  status: MeetingStatus | string;
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  recording: {
    label: "En cours",
    classes: "bg-accent-red/20 text-accent-red border border-accent-red/40",
  },
  transcribing: {
    label: "Transcription",
    classes:
      "bg-accent-amber/20 text-accent-amber border border-accent-amber/40",
  },
  summarizing: {
    label: "Résumé",
    classes:
      "bg-accent-amber/20 text-accent-amber border border-accent-amber/40",
  },
  done: {
    label: "Terminée",
    classes:
      "bg-accent-green/20 text-accent-green border border-accent-green/40",
  },
  error: {
    label: "Erreur",
    classes: "bg-accent-red/10 text-accent-red border border-accent-red/30",
  },
};

export function Badge({ status, className }: BadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    classes: "bg-text-muted/20 text-text-secondary border border-border",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium font-mono",
        config.classes,
        className
      )}
    >
      {config.label}
    </span>
  );
}
