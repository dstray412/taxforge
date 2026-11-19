import { useEffect, useRef, useState } from "react";
import { getParams } from "../../engine";
import type { TaxYear } from "../../engine";

export function Footer({ year }: { year: TaxYear }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  let sources: string[] = [];
  try {
    sources = getParams(year).sources ?? [];
  } catch {
    sources = [];
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <footer className="footer">
      <p className="footer__disclaimer">
        Planning estimates only. Not tax advice; does not file returns. Verify with a professional.
      </p>
      <div className="popover-wrap" ref={wrap}>
        <button
          ref={btn}
          type="button"
          className="btn btn--ghost btn--sm"
          aria-expanded={open}
          aria-controls="about-pop"
          onClick={() => setOpen((o) => !o)}
        >
          About the numbers
        </button>
        {open && (
          <div id="about-pop" className="popover" role="dialog" aria-label="About the numbers">
            <h3>About the numbers</h3>
            <p>
              {year} figures come from the engine's parameter table. Federal income tax only: no state tax, no
              filing. Sources:
            </p>
            {sources.length ? (
              <ul>
                {sources.map((s) => (
                  <li key={s}>
                    {/^https?:\/\//.test(s) ? (
                      <a href={s} target="_blank" rel="noreferrer noopener">
                        {s.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    ) : (
                      s
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No sources listed for {year}.</p>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
