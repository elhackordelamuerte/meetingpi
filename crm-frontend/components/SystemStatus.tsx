"use client";

import { clsx } from "clsx";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { SystemStats } from "../lib/types";
import { Card } from "./ui/Card";
import { Spinner } from "./ui/Spinner";

interface SystemStatusProps {
  compact?: boolean;
}

interface BarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  warn?: number;
  danger?: number;
}

function Bar({ label, value, max, unit, warn = 75, danger = 90 }: BarProps) {
  const pct = Math.min((value / max) * 100, 100);
  const barColor =
    pct >= danger
      ? "bg-accent-red"
      : pct >= warn
        ? "bg-accent-amber"
        : "bg-accent-green";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="font-mono text-text-primary">
          {value.toFixed(unit === "%" ? 1 : 0)}
          {unit}
          {unit !== "%" && (
            <span className="text-text-muted">
              /{max.toFixed(0)}
              {unit}
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-bg-elevated">
        <div
          className={clsx("h-1.5 rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
        />
      </div>
    </div>
  );
}

function StatusDot({ available }: { available: boolean }) {
  return (
    <span
      className={clsx(
        "inline-block h-2 w-2 rounded-full",
        available ? "bg-accent-green" : "bg-accent-red"
      )}
      aria-hidden="true"
    />
  );
}

export function SystemStatus({ compact = false }: SystemStatusProps) {
  const { data, isError } = useQuery<SystemStats>({
    queryKey: ["system-stats"],
    queryFn: () => api.getStats(),
    refetchInterval: 5000,
    retry: 1,
  });

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <span
          className={clsx(
            "h-2 w-2 rounded-full",
            isError ? "bg-accent-red" : "bg-accent-green"
          )}
          aria-hidden="true"
        />
        {isError ? (
          <span className="text-accent-red">Pi non joignable</span>
        ) : data ? (
          <span>
            CPU {data.cpu_percent.toFixed(0)}%
            {data.temperature_c != null && ` · ${data.temperature_c}°C`}
          </span>
        ) : (
          <Spinner size="sm" />
        )}
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <p className="text-sm text-accent-red">⚠ Pi non joignable</p>
        <p className="mt-1 text-xs text-text-muted">
          Vérifiez l&apos;URL dans les paramètres
        </p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="flex items-center justify-center p-8">
        <Spinner aria-label="Chargement des stats système" />
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-sm font-semibold text-text-primary">
          Raspberry Pi
        </h3>
        <span className="flex items-center gap-1.5 text-xs text-accent-green">
          <span
            className="h-2 w-2 animate-pulse rounded-full bg-accent-green"
            aria-hidden="true"
          />
          Connecté
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <Bar
          label="CPU"
          value={data.cpu_percent}
          max={100}
          unit="%"
          warn={70}
          danger={90}
        />
        <Bar
          label="RAM"
          value={data.ram_used_mb / 1024}
          max={data.ram_total_mb / 1024}
          unit="GB"
          warn={75}
          danger={90}
        />
        {data.temperature_c != null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-secondary">Température</span>
            <span
              className={clsx(
                "font-mono",
                data.temperature_c >= 80
                  ? "text-accent-red"
                  : data.temperature_c >= 65
                    ? "text-accent-amber"
                    : "text-accent-green"
              )}
            >
              {data.temperature_c}°C
            </span>
          </div>
        )}
        <Bar
          label="Disque"
          value={data.disk_used_gb}
          max={data.disk_total_gb}
          unit="GB"
          warn={80}
          danger={95}
        />
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">Whisper</span>
          <span className="flex items-center gap-1.5">
            <StatusDot available={data.whisper_available} />
            <span className="text-text-primary">
              {data.whisper_available ? "Prêt" : "Absent"}
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">Ollama</span>
          <span className="flex items-center gap-1.5">
            <StatusDot available={data.ollama_available} />
            <span className="text-text-primary">
              {data.ollama_available ? "Prêt" : "Arrêté"}
            </span>
          </span>
        </div>
      </div>
    </Card>
  );
}
