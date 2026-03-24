import { clsx } from "clsx";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  "aria-label"?: string;
}

const SIZE_CLASSES = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-[3px]",
};

export function Spinner({
  size = "md",
  className,
  "aria-label": ariaLabel = "Chargement…",
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={clsx(
        "inline-block animate-spin rounded-full border-text-muted border-t-accent-blue",
        SIZE_CLASSES[size],
        className
      )}
    />
  );
}
