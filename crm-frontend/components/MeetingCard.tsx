import { clsx } from "clsx";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Eye, Trash2 } from "lucide-react";
import { Badge } from "./ui/Badge";
import type { MeetingListItem } from "../lib/types";

interface MeetingCardProps {
  meeting: MeetingListItem;
  onClick: () => void;
  onDelete: () => void;
  compact?: boolean;
}

function formatDuration(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${String(m % 60).padStart(2, "0")}min`;
  return `${m}min`;
}

export function MeetingCard({
  meeting,
  onClick,
  onDelete,
  compact = false,
}: MeetingCardProps) {
  const date = format(new Date(meeting.started_at), "d MMM yyyy · HH:mm", {
    locale: fr,
  });

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={clsx(
          "w-full rounded-lg border border-border bg-bg-surface p-3 text-left",
          "hover:border-accent-blue/40 hover:bg-bg-elevated transition-colors"
        )}
        aria-label={`Voir la réunion ${meeting.title}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-medium text-text-primary">
            {meeting.title}
          </span>
          <Badge status={meeting.status} />
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
          <span>{date}</span>
          <span>·</span>
          <span>{formatDuration(meeting.duration_s)}</span>
        </div>
        {meeting.summary_preview && (
          <p className="mt-1.5 line-clamp-2 text-xs text-text-secondary">
            {meeting.summary_preview}
          </p>
        )}
      </button>
    );
  }

  return (
    <div
      className={clsx(
        "flex items-center gap-4 border-b border-border px-4 py-3",
        "hover:bg-bg-elevated transition-colors cursor-pointer"
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      aria-label={`Voir la réunion ${meeting.title}`}
    >
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-text-primary">
          {meeting.title}
        </p>
        <p className="text-xs text-text-muted">{date}</p>
      </div>
      <span className="text-xs text-text-secondary font-mono">
        {formatDuration(meeting.duration_s)}
      </span>
      <Badge status={meeting.status} />
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          aria-label={`Voir ${meeting.title}`}
          className="rounded p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-elevated"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Supprimer ${meeting.title}`}
          className="rounded p-1.5 text-text-muted hover:text-accent-red hover:bg-accent-red/10"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
