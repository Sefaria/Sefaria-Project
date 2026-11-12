import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
}

/** A placeholder block shown while content loads. Always decorative; pair with a live region elsewhere. */
export function Skeleton({ width, height, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.skeleton, className].filter(Boolean).join(" ")}
      style={{ ["--_w" as string]: width, ["--_h" as string]: height }}
    />
  );
}

/** A paragraph-shaped skeleton: n lines, the last one shorter. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <span style={{ display: "grid", gap: "0.6em" }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </span>
  );
}
