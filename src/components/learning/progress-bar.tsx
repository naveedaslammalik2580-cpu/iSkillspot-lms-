
/** Accessible progress bar used on course cards and course pages. */
export function ProgressBar({
  percent,
  completed,
  total,
  className,
}: {
  percent: number;
  completed?: number;
  total?: number;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, percent));
  return (
    <div className={className}>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Course progress"
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {pct}% complete
        {completed !== undefined && total !== undefined ? ` · ${completed} of ${total} lessons` : ""}
      </p>
    </div>
  );
}
