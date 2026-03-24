export type MeetingStatus =
  | "recording"
  | "transcribing"
  | "summarizing"
  | "done"
  | "error";

export interface Meeting {
  id: string;
  title: string;
  started_at: string; // ISO 8601
  ended_at: string | null;
  duration_s: number | null;
  status: MeetingStatus;
  transcript: string | null;
  summary: string | null;
  error_msg: string | null;
  created_at: string;
}

export interface MeetingListItem {
  id: string;
  title: string;
  started_at: string;
  duration_s: number | null;
  status: MeetingStatus;
  summary_preview: string | null;
}

export interface MeetingListResponse {
  items: MeetingListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface RecordingStatus {
  is_recording: boolean;
  meeting_id: string | null;
  started_at: string | null;
  elapsed_s: number | null;
}

export interface RecordingStarted {
  meeting_id: string;
  status: string;
  started_at: string;
  title: string;
}

export interface RecordingStopped {
  meeting_id: string;
  status: string;
  duration_s: number;
}

export interface SystemStats {
  cpu_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
  temperature_c: number | null;
  disk_used_gb: number;
  disk_total_gb: number;
  uptime_s: number;
  whisper_available: boolean;
  ollama_available: boolean;
}

export interface SystemHealth {
  status: string;
  whisper: boolean;
  ollama: boolean;
  db: boolean;
}

export interface SystemModels {
  whisper_model: string;
  whisper_model_path: string;
  ollama_model: string;
  ollama_models_available: string[];
}
