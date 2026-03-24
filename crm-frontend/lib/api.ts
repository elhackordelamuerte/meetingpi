import type {
  Meeting,
  MeetingListResponse,
  RecordingStarted,
  RecordingStopped,
  RecordingStatus,
  SystemHealth,
  SystemModels,
  SystemStats,
} from "./types";

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("pi_api_url");
    if (stored) return stored.replace(/\/$/, "");
  }
  return (
    process.env.NEXT_PUBLIC_PI_API_URL ?? "http://raspberrypi.local:8000"
  ).replace(/\/$/, "");
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = (await res.json()) as { detail?: string };
      if (json.detail) detail = json.detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(`${res.status} ${detail}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const GET = <T>(path: string) => request<T>("GET", path);
const POST = <T>(path: string, body?: unknown) =>
  request<T>("POST", path, body);
const PATCH = <T>(path: string, body: unknown) =>
  request<T>("PATCH", path, body);
const DELETE = <T>(path: string) => request<T>("DELETE", path);

export const api = {
  // ── Recordings ────────────────────────────────────────────────────────────
  startRecording: (title?: string): Promise<RecordingStarted> =>
    POST<RecordingStarted>("/api/recordings/start", { title }),

  stopRecording: (): Promise<RecordingStopped> =>
    POST<RecordingStopped>("/api/recordings/stop"),

  getRecordingStatus: (): Promise<RecordingStatus> =>
    GET<RecordingStatus>("/api/recordings/status"),

  // ── Meetings ──────────────────────────────────────────────────────────────
  getMeetings: (
    page = 1,
    search = "",
    status = ""
  ): Promise<MeetingListResponse> =>
    GET<MeetingListResponse>(
      `/api/meetings?page=${page}&page_size=20&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`
    ),

  getMeeting: (id: string): Promise<Meeting> =>
    GET<Meeting>(`/api/meetings/${id}`),

  updateMeeting: (
    id: string,
    data: { title?: string }
  ): Promise<Meeting> =>
    PATCH<Meeting>(`/api/meetings/${id}`, data),

  deleteMeeting: (id: string): Promise<void> =>
    DELETE<void>(`/api/meetings/${id}`),

  exportMeetingUrl: (id: string): string =>
    `${getBaseUrl()}/api/meetings/${id}/export`,

  // ── System ────────────────────────────────────────────────────────────────
  getHealth: (): Promise<SystemHealth> =>
    GET<SystemHealth>("/api/system/health"),

  getStats: (): Promise<SystemStats> =>
    GET<SystemStats>("/api/system/stats"),

  getModels: (): Promise<SystemModels> =>
    GET<SystemModels>("/api/system/models"),
};
