import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { TaxInput } from "../../engine";
import {
  clone,
  ensureSpouseShape,
  initialState,
  newId,
  normalizeInput,
  persist,
  sampleInput,
  uniqueName,
} from "./scenarioModel";
import type { Scenario, ScenarioState } from "./scenarioModel";

export type { Scenario } from "./scenarioModel";

export interface ScenarioApi {
  scenarios: Scenario[];
  active: Scenario;
  select(id: string): void;
  add(): void;
  duplicate(id?: string): void;
  rename(id: string, name: string): void;
  remove(id: string): void;
  /** Mutate a draft copy of the active scenario's input. */
  update(mutator: (draft: TaxInput) => void): void;
  importScenario(name: string, raw: unknown): void;
}

const Ctx = createContext<ScenarioApi | null>(null);

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ScenarioState>(initialState);

  useEffect(() => {
    const t = window.setTimeout(() => persist(state), 150);
    return () => window.clearTimeout(t);
  }, [state]);

  const select = useCallback((id: string) => setState((s) => ({ ...s, activeId: id })), []);

  const add = useCallback(() => {
    setState((s) => {
      const sc: Scenario = {
        id: newId(),
        name: uniqueName("New scenario", s.scenarios.map((x) => x.name)),
        input: sampleInput(),
      };
      return { scenarios: [...s.scenarios, sc], activeId: sc.id };
    });
  }, []);

  const duplicate = useCallback((id?: string) => {
    setState((s) => {
      const src = s.scenarios.find((x) => x.id === (id ?? s.activeId));
      if (!src) return s;
      const sc: Scenario = {
        id: newId(),
        name: uniqueName(`${src.name} copy`, s.scenarios.map((x) => x.name)),
        input: clone(src.input),
      };
      const idx = s.scenarios.indexOf(src);
      const scenarios = [...s.scenarios];
      scenarios.splice(idx + 1, 0, sc);
      return { scenarios, activeId: sc.id };
    });
  }, []);

  const rename = useCallback((id: string, name: string) => {
    const n = name.trim();
    if (!n) return;
    setState((s) => ({ ...s, scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, name: n } : x)) }));
  }, []);

  const remove = useCallback((id: string) => {
    setState((s) => {
      if (s.scenarios.length <= 1) return s;
      const idx = s.scenarios.findIndex((x) => x.id === id);
      const scenarios = s.scenarios.filter((x) => x.id !== id);
      const activeId = s.activeId === id ? scenarios[Math.max(0, idx - 1)].id : s.activeId;
      return { scenarios, activeId };
    });
  }, []);

  const update = useCallback((mutator: (draft: TaxInput) => void) => {
    setState((s) => ({
      ...s,
      scenarios: s.scenarios.map((x) => {
        if (x.id !== s.activeId) return x;
        const draft = clone(x.input);
        mutator(draft);
        return { ...x, input: ensureSpouseShape(draft) };
      }),
    }));
  }, []);

  const importScenario = useCallback((name: string, raw: unknown) => {
    const input = normalizeInput(raw);
    setState((s) => {
      const sc: Scenario = { id: newId(), name: uniqueName(name || "Imported", s.scenarios.map((x) => x.name)), input };
      return { scenarios: [...s.scenarios, sc], activeId: sc.id };
    });
  }, []);

  const active = state.scenarios.find((x) => x.id === state.activeId) ?? state.scenarios[0];

  const api = useMemo<ScenarioApi>(
    () => ({ scenarios: state.scenarios, active, select, add, duplicate, rename, remove, update, importScenario }),
    [state.scenarios, active, select, add, duplicate, rename, remove, update, importScenario],
  );

  return createElement(Ctx.Provider, { value: api }, children);
}

export function useScenarios(): ScenarioApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScenarios must be used inside <ScenarioProvider>");
  return v;
}
