"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { MeetingListResponse, RecordingStatus } from "@/lib/types";
import { RecordingControl } from "@/components/RecordingControl";
import { SystemStatus } from "@/components/SystemStatus";
import { MeetingCard } from "@/components/MeetingCard";
import { PipelineProgress } from "@/components/PipelineProgress";
import { useToast } from "@/components/ui/Toast";

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Recording status (poll every 2s) ──────────────────────────────────────
  const { data: recordingStatus } = useQuery<RecordingStatus>({
    queryKey: ["recording-status"],
    queryFn: () => api.getRecordingStatus(),
    refetchInterval: 2000,
    retry: 1,
  });

  // ── Recent meetings ────────────────────────────────────────────────────────
  const { data: meetingsData } = useQuery<MeetingListResponse>({
    queryKey: ["meetings", 1, "", ""],
    queryFn: () => api.getMeetings(1),
    refetchInterval: 5000,
  });

  const recentMeetings = meetingsData?.items.slice(0, 5) ?? [];
  const activePipeline = recentMeetings.find(
    (m) => m.status === "transcribing" || m.status === "summarizing"
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: (title?: string) => api.startRecording(title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recording-status"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast("Enregistrement démarré", "success");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopRecording(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recording-status"] });
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast("Enregistrement arrêté — transcription en cours…", "info");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMeeting(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast("Réunion supprimée", "success");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const isRecording = recordingStatus?.is_recording ?? false;
  const isProcessing =
    !isRecording &&
    recentMeetings.some(
      (m) => m.status === "transcribing" || m.status === "summarizing"
    );

  return (
    <div className="p-6">
      <h1 className="mb-6 font-mono text-xl font-bold text-text-primary">
        Dashboard
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left: Recording + recent meetings ─────────────────────── */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <RecordingControl
            onStart={(title) => startMutation.mutateAsync(title)}
            onStop={() => stopMutation.mutateAsync()}
            isRecording={isRecording}
            elapsedSeconds={recordingStatus?.elapsed_s ?? null}
            isProcessing={isProcessing}
          />

          {/* Pipeline active banner */}
          {activePipeline && <PipelineProgress meeting={activePipeline} />}

          {/* Recent meetings */}
          <div>
            <h2 className="mb-3 font-mono text-sm font-semibold text-text-secondary">
              Dernières réunions
            </h2>
            {recentMeetings.length === 0 ? (
              <p className="rounded-lg border border-border p-4 text-sm text-text-muted">
                Aucune réunion enregistrée.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {recentMeetings.map((m) => (
                  <MeetingCard
                    key={m.id}
                    meeting={m}
                    compact
                    onClick={() => router.push(`/meetings/${m.id}`)}
                    onDelete={() => deleteMutation.mutate(m.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: System status ──────────────────────────────────── */}
        <div>
          <SystemStatus />
        </div>
      </div>
    </div>
  );
}
