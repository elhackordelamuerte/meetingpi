"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { api } from "@/lib/api";
import type { Meeting } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { SummaryPanel } from "@/components/SummaryPanel";
import { TranscriptViewer } from "@/components/TranscriptViewer";
import { useToast } from "@/components/ui/Toast";

type Tab = "summary" | "transcript";

function formatDuration(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${String(m % 60).padStart(2, "0")}min`;
  return `${m}min${String(s % 60).padStart(2, "0")}s`;
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: meeting, isLoading } = useQuery<Meeting>({
    queryKey: ["meeting", id],
    queryFn: () => api.getMeeting(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "transcribing" || status === "summarizing") return 3000;
      return false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteMeeting(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast("Réunion supprimée", "success");
      router.push("/meetings");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner aria-label="Chargement de la réunion" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-6 text-sm text-text-muted">Réunion introuvable.</div>
    );
  }

  const date = format(new Date(meeting.started_at), "d MMMM yyyy · HH:mm", {
    locale: fr,
  });

  return (
    <div className="p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start gap-4">
        <button
          onClick={() => router.push("/meetings")}
          aria-label="Retour à la liste"
          className="mt-1 rounded p-1 text-text-muted hover:text-text-primary hover:bg-bg-elevated"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="font-mono text-xl font-bold text-text-primary truncate">
            {meeting.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
            <span>{date}</span>
            <span>·</span>
            <span>{formatDuration(meeting.duration_s)}</span>
            <span>·</span>
            <Badge status={meeting.status} />
          </div>
          {meeting.error_msg && (
            <p className="mt-2 text-xs text-accent-red">{meeting.error_msg}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={api.exportMeetingUrl(id)}
            download
            aria-label="Exporter en Markdown"
            className="inline-flex items-center gap-2 rounded border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:border-accent-blue/40 transition-colors"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter .md
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            aria-label="Supprimer la réunion"
            className="text-text-muted hover:text-accent-red"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="mb-4 flex border-b border-border">
        {(["summary", "transcript"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-accent-blue text-text-primary"
                : "border-transparent text-text-muted hover:text-text-secondary"
            }`}
            aria-selected={activeTab === tab}
            role="tab"
          >
            {tab === "summary" ? "Résumé" : "Transcription"}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────── */}
      <div role="tabpanel">
        {activeTab === "summary" && (
          <SummaryPanel summary={meeting.summary} status={meeting.status} />
        )}
        {activeTab === "transcript" && (
          <TranscriptViewer
            transcript={meeting.transcript}
            isLoading={
              meeting.status === "transcribing" ||
              meeting.status === "recording"
            }
          />
        )}
      </div>

      {/* ── Delete modal ───────────────────────────────────────────────── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmDelete(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer la suppression"
        >
          <div
            className="mx-4 w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 font-mono text-base font-semibold text-text-primary">
              Supprimer la réunion ?
            </h2>
            <p className="mb-6 text-sm text-text-secondary">
              Cette action est irréversible. Transcription et résumé seront
              perdus.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
