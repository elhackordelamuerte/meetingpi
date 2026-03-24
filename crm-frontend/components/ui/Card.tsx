import { clsx } from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "sm" | "md" | "lg" | "none";
}

const PADDING_CLASSES = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function Card({
  children,
  padding = "md",
  className,
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={clsx(
        "rounded-lg bg-bg-surface border border-border",
        PADDING_CLASSES[padding],
        className
      )}
    >
      {children}
    </div>
  );
}
