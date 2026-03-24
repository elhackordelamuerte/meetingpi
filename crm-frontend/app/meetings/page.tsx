"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { MeetingListResponse } from "@/lib/types";
import { MeetingCard } from "@/components/MeetingCard";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

const STATUS_OPTIONS = [
  { value: "", label: "Tous les statuts" },
  { value: "recording", label: "En cours" },
  { value: "transcribing", label: "Transcription" },
  { value: "summarizing", label: "Résumé" },
  { value: "done", label: "Terminées" },
  { value: "error", label: "Erreur" },
];

export default function MeetingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery<MeetingListResponse>({
    queryKey: ["meetings", page, search, status],
    queryFn: () => api.getMeetings(page, search, status),
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMeeting(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast("Réunion supprimée", "success");
      setConfirmDelete(null);
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-mono text-xl font-bold text-text-primary">
          Réunions
        </h1>
        {data && (
          <span className="text-sm text-text-muted">{data.total} réunions</span>
        )}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Rechercher…"
            aria-label="Rechercher dans les réunions"
            className="w-full rounded border border-border bg-bg-elevated py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filtrer par statut"
          className="rounded border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-bg-surface overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_140px_80px_100px_80px] gap-4 border-b border-border px-4 py-2 text-xs font-medium text-text-muted">
          <span>Titre</span>
          <span>Date</span>
          <span>Durée</span>
          <span>Statut</span>
          <span>Actions</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner aria-label="Chargement des réunions" />
          </div>
        ) : !data?.items.length ? (
          <p className="py-12 text-center text-sm text-text-muted">
            Aucune réunion trouvée.
          </p>
        ) : (
          data.items.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              onClick={() => router.push(`/meetings/${m.id}`)}
              onDelete={() => setConfirmDelete(m.id)}
            />
          ))
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Page précédente"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-sm text-text-secondary">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label="Page suivante"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────────────── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmDelete(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer la suppression"
        >
          <div
            className="rounded-xl border border-border bg-bg-elevated p-6 shadow-xl max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 font-mono text-base font-semibold text-text-primary">
              Supprimer la réunion ?
            </h2>
            <p className="mb-6 text-sm text-text-secondary">
              Cette action est irréversible. Le fichier audio sera également
              supprimé.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDelete(null)}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(confirmDelete)}
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
