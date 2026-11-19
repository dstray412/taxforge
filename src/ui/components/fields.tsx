import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { parseCurrency, plainNumber } from "../format";

interface FieldShellProps {
  id: string;
  label: string;
  help?: string;
  helpId: string;
  error?: string | null;
  children: ReactNode;
}

function FieldShell({ id, label, help, helpId, error, children }: FieldShellProps) {
  return (
    <div className={`field${error ? " field--error" : ""}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      <p className="field__help" id={helpId} aria-live={error ? "polite" : undefined}>
        {error ? error : help ?? " "}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface CurrencyFieldProps {
  label: string;
  value: number;
  onChange(v: number): void;
  help?: string;
  allowNegative?: boolean;
}

/** Accepts "95,000", "$95k", "1.2m", "(500)". Formats on blur; commits on every valid keystroke. */
export function CurrencyField({ label, value, onChange, help, allowNegative = false }: CurrencyFieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const [text, setText] = useState(() => (value ? plainNumber(value) : ""));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // External changes (scenario switch, import apply) update the text while not editing.
  useEffect(() => {
    if (!focused) setText(value ? plainNumber(value) : "");
  }, [value, focused]);

  function commit(raw: string, final: boolean) {
    const v = parseCurrency(raw);
    if (v === null) {
      setError("Enter an amount like 95,000, $95k or 1.2m");
      return;
    }
    if (v < 0 && !allowNegative) {
      setError("Enter a positive amount");
      return;
    }
    setError(null);
    if (v !== value) onChange(v);
    if (final) setText(v ? plainNumber(v) : "");
  }

  return (
    <FieldShell id={id} label={label} help={help} helpId={helpId} error={error}>
      <div className="money-input">
        <span className="money-input__prefix" aria-hidden="true">
          $
        </span>
        <input
          id={id}
          className="input input--money"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0"
          value={text}
          aria-describedby={helpId}
          aria-invalid={error ? true : undefined}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value, false);
          }}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value, true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget.value, true);
            if (e.key === "Escape") {
              setError(null);
              setText(value ? plainNumber(value) : "");
            }
          }}
        />
      </div>
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */

export interface StepperFieldProps {
  label: string;
  value: number;
  onChange(v: number): void;
  min?: number;
  max?: number;
  help?: string;
}

export function StepperField({ label, value, onChange, min = 0, max = 20, help }: StepperFieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <FieldShell id={id} label={label} help={help} helpId={helpId}>
      <div className="stepper">
        <button
          type="button"
          className="stepper__btn"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1))}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 8h9" />
          </svg>
        </button>
        <input
          id={id}
          className="input stepper__value"
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-describedby={helpId}
          value={String(value)}
          onChange={(e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
            onChange(Number.isFinite(n) ? clamp(n) : min);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onChange(clamp(value + 1));
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onChange(clamp(value - 1));
            }
          }}
        />
        <button
          type="button"
          className="stepper__btn"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 1))}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 8h9M8 3.5v9" />
          </svg>
        </button>
      </div>
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  title?: string;
}

export interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange(v: T): void;
  help?: string;
  hideLabel?: boolean;
  size?: "sm" | "md";
}

/** Radio-group semantics with roving arrow-key focus. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  help,
  hideLabel,
  size = "md",
}: SegmentedProps<T>) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));

  function move(delta: number) {
    const next = (idx + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className={`field${hideLabel ? " field--bare" : ""}`}>
      <span className={hideLabel ? "sr-only" : "field__label"} id={`${id}-label`}>
        {label}
      </span>
      <div
        className={`segmented segmented--${size}`}
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        style={{ ["--seg-count" as string]: options.length, ["--seg-index" as string]: idx }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          }
        }}
      >
        <span className="segmented__thumb" aria-hidden="true" />
        {options.map((o, i) => (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            title={o.title}
            className="segmented__opt"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {help !== undefined && <p className="field__help">{help}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
  help?: string;
}

export function Toggle({ label, checked, onChange, help }: ToggleProps) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div className="toggle-row__text">
        <label className="toggle-row__label" htmlFor={id}>
          {label}
        </label>
        {help && (
          <p className="field__help" id={`${id}-help`}>
            {help}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={help ? `${id}-help` : undefined}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" aria-hidden="true" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface SectionProps {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Collapsible input group. Body stays mounted (keeps field state; no layout jump on reopen). */
export function Section({ title, summary, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={`section${open ? " section--open" : ""}`}>
      <h3 className="section__heading">
        <button
          type="button"
          className="section__toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen((o) => !o)}
        >
          <svg className="section__chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
          <span className="section__title">{title}</span>
          {summary && <span className="section__summary">{summary}</span>}
        </button>
      </h3>
      <div id={`${id}-body`} className="section__body" hidden={!open}>
        <div className="section__grid">{children}</div>
      </div>
    </section>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className="subheading">{children}</h4>;
}
