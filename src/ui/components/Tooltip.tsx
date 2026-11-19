import type { ReactNode } from "react";

export interface TooltipRow {
  key: string;
  label: string;
  value: string;
  /** CSS color for the line key; omitted for plain rows. */
  color?: string;
  shape?: "line" | "rect";
}

/** Shared chart tooltip: values lead, labels follow; line keys, not boxes. */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  title,
  rows,
  footer,
}: {
  x: number;
  y: number;
  containerWidth: number;
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  const flip = x > containerWidth * 0.6;
  return (
    <div
      className="viz-tip"
      role="status"
      style={{ left: x, top: y, transform: `translate(${flip ? "calc(-100% - 14px)" : "14px"}, -50%)` }}
    >
      <div className="viz-tip__title">{title}</div>
      {rows.map((r) => (
        <div key={r.key} className="viz-tip__row">
          {r.color && <span className={`viz-key viz-key--${r.shape ?? "line"}`} style={{ background: r.color }} />}
          <span className="viz-tip__value">{r.value}</span>
          <span className="viz-tip__label">{r.label}</span>
        </div>
      ))}
      {footer && <div className="viz-tip__foot">{footer}</div>}
    </div>
  );
}
