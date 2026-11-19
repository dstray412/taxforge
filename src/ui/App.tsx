import { useCallback, useRef, useState } from "react";
import { ScenarioProvider, useScenarios } from "./hooks/useScenarios";
import { useTaxResult } from "./hooks/useTax";
import { useTheme } from "./hooks/useTheme";
import { TopBar } from "./components/TopBar";
import { InputPanel } from "./components/InputPanel";
import { ResultsHeader } from "./components/ResultsHeader";
import { FlowSummary } from "./components/FlowSummary";
import { WorksheetView } from "./components/WorksheetView";
import { BreakdownView } from "./components/BreakdownView";
import { MarginalChart } from "./components/MarginalChart";
import { EstimatedTaxView } from "./components/EstimatedTaxView";
import { CompareView } from "./components/CompareView";
import { ImportDrawer } from "./components/ImportDrawer";
import { Footer } from "./components/Footer";
import { PrintSummary } from "./components/PrintSummary";
import { ErrorBoundary } from "./components/ErrorBoundary";

type View = "summary" | "worksheet" | "breakdown" | "rates" | "estimated" | "compare";

const VIEWS: { id: View; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "worksheet", label: "Worksheet" },
  { id: "breakdown", label: "Breakdown" },
  { id: "rates", label: "Marginal rates" },
  { id: "estimated", label: "Estimated tax" },
  { id: "compare", label: "Compare" },
];

const VIEW_KEY = "taxforge.view";

function readView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v && VIEWS.some((x) => x.id === v)) return v as View;
  } catch {
    /* ignore */
  }
  return "summary";
}

export default function App() {
  return (
    <ErrorBoundary title="TaxForge could not start">
      <ScenarioProvider>
        <Shell />
      </ScenarioProvider>
    </ErrorBoundary>
  );
}

function Shell() {
  const { active, importScenario } = useScenarios();
  const [theme, toggleTheme] = useTheme();
  const [view, setViewState] = useState<View>(readView);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const { result, error, pending } = useTaxResult(active.input, 100);

  const setView = useCallback((v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const flash = (tone: "good" | "bad", text: string) => {
    setNotice({ tone, text });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 4000);
  };

  function exportJson() {
    const payload = { app: "taxforge", version: 1, name: active.name, exportedAt: new Date().toISOString(), input: active.input };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taxforge-${active.name.replace(/[^\w-]+/g, "-").toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJson(f: File) {
    try {
      const data = JSON.parse(await f.text()) as unknown;
      if (typeof data !== "object" || data === null) throw new Error("Not a JSON object");
      const obj = data as Record<string, unknown>;
      const raw = "input" in obj ? obj.input : obj;
      if (typeof raw !== "object" || raw === null || !("filingStatus" in raw || "w2" in raw || "taxYear" in raw)) {
        throw new Error("This file does not look like a TaxForge scenario");
      }
      const name = typeof obj.name === "string" ? obj.name : f.name.replace(/\.json$/i, "");
      importScenario(name, raw);
      flash("good", `Imported "${name}" as a new scenario`);
    } catch (e) {
      flash("bad", `Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const tabIndex = VIEWS.findIndex((v) => v.id === view);

  return (
    <div className="app">
      <a className="skip-link" href="#results">
        Skip to results
      </a>
      <TopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        onPrint={() => window.print()}
        onExport={exportJson}
        onImportFile={(f) => void importJson(f)}
      />
      {notice && (
        <div className={`notice notice--${notice.tone}`} role="status">
          {notice.text}
        </div>
      )}

      <main className="layout">
        <aside className="layout__inputs">
          <InputPanel onOpenImport={() => setImportOpen(true)} />
        </aside>

        <section className="layout__results" id="results" aria-label="Results">
          {error && (
            <div className="error-panel" role="alert">
              <h2>The engine could not compute this return</h2>
              <p>{result ? "Showing the last good result. " : ""}Adjust an input to retry.</p>
              <pre>{error}</pre>
            </div>
          )}

          {result && (
            <ErrorBoundary resetKey={result} title="This view hit an error">
              <ResultsHeader result={result} pending={pending} />

              <div
                className="view-tabs"
                role="tablist"
                aria-label="Result views"
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const n = VIEWS[(tabIndex + (e.key === "ArrowRight" ? 1 : -1) + VIEWS.length) % VIEWS.length];
                  setView(n.id);
                  tabRefs.current[n.id]?.focus();
                }}
              >
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    ref={(el) => {
                      tabRefs.current[v.id] = el;
                    }}
                    id={`tab-${v.id}`}
                    type="button"
                    role="tab"
                    aria-selected={view === v.id}
                    aria-controls="view-panel"
                    tabIndex={view === v.id ? 0 : -1}
                    className="view-tab"
                    onClick={() => setView(v.id)}
                  >
                    {v.label}
                    {v.id === "worksheet" && result.warnings.length > 0 && (
                      <span className="view-tab__badge" aria-label={`${result.warnings.length} warnings`}>
                        {result.warnings.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div
                id="view-panel"
                role="tabpanel"
                aria-labelledby={`tab-${view}`}
                className={`view-panel${pending ? " is-pending" : ""}`}
              >
                <ErrorBoundary resetKey={`${view}`} title="This view hit an error">
                  {view === "summary" && <FlowSummary result={result} />}
                  {view === "worksheet" && <WorksheetView result={result} />}
                  {view === "breakdown" && <BreakdownView result={result} />}
                  {view === "rates" && <MarginalChart result={result} />}
                  {view === "estimated" && <EstimatedTaxView result={result} />}
                  {view === "compare" && <CompareView />}
                </ErrorBoundary>
              </div>
              <PrintSummary name={active.name} result={result} />
            </ErrorBoundary>
          )}
        </section>
      </main>

      <Footer year={active.input.taxYear} />
      <ImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
