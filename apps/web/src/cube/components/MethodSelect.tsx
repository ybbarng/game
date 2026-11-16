"use client";

import { milestoneLabel } from "@game/cube-engine";
import { useCallback, useEffect, useState } from "react";

import {
  loadMethod,
  METHOD_LABEL,
  methodsFor,
  type SolveMethod,
  saveMethod,
  type TheoryBest,
  usableMethod,
} from "../progress/methods";
import { formatMs } from "../records";

/**
 * 고른 해법(docs/51 1-2, 이 기기에 하나, 혼자 맞추기·대결 함께). 처음 그릴 때는 자동, 화면이 뜬 뒤 저장값을 읽는다.
 * 돌려주는 `method`는 그 크기에서 고를 수 있는 것(못 고르면 자동)
 */
export function useSolveMethod(n: number) {
  const [picked, setPicked] = useState<SolveMethod>("auto");
  useEffect(() => {
    setPicked(loadMethod());
    // 같은 화면의 다른 고르기(대기실과 대결 칸)와 다른 탭에서 바꾼 것도 따른다
    const sync = () => setPicked(loadMethod());
    window.addEventListener(METHOD_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(METHOD_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const pick = useCallback((m: SolveMethod) => {
    setPicked(m);
    saveMethod(m);
    window.dispatchEvent(new Event(METHOD_EVENT));
  }, []);
  return { method: usableMethod(n, picked), pick };
}

const METHOD_EVENT = "cube-method";

/** 대기실의 「내 해법」(내 칸 칩을 그 해법 차례로, 이 기기에만) */
export function MyMethodPick({
  n,
  className,
}: {
  n: number;
  className?: string | undefined;
}) {
  const { method, pick } = useSolveMethod(n);
  return (
    <MethodSelect
      n={n}
      value={method}
      onChange={pick}
      label="내 해법"
      className={className}
    />
  );
}

/** 「해법」 고르기. 그 크기에 고를 것이 하나뿐이면(2×2) 그리지 않는다 */
export function MethodSelect({
  n,
  value,
  onChange,
  label = "해법",
  className = "",
}: {
  n: number;
  value: SolveMethod;
  onChange: (m: SolveMethod) => void;
  label?: string;
  className?: string | undefined;
}) {
  const options = methodsFor(n);
  if (options.length < 2) return null;
  return (
    <label className={`flex items-center gap-1 text-sm ${className ?? ""}`}>
      {label}
      <select
        data-cube-method={value}
        value={value}
        onChange={(e) => {
          onChange(e.target.value as SolveMethod);
          e.target.blur();
        }}
        className="rounded bg-white/10 px-2 py-1"
      >
        {options.map((m) => (
          <option key={m} value={m} className="bg-neutral-800">
            {METHOD_LABEL[m]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 기록 칸의 이론 최고: 합과 구간마다의 최고(아직 없는 구간은 「-」) */
export function TheoryBestLine({ theory }: { theory: TheoryBest }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg bg-white/5 px-2 py-1"
      data-cube-theory={theory.total ?? ""}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-white/50 text-xs">이론 최고</span>
        <span className="font-mono tabular-nums">
          {theory.total === null ? "-" : formatMs(theory.total)}
        </span>
      </div>
      <p className="flex flex-wrap gap-x-2 text-[11px] text-white/45">
        {theory.parts.map((p) => (
          <span key={p.key} data-cube-theory-part={p.id}>
            {milestoneLabel(p.id)}{" "}
            <span className="font-mono tabular-nums">
              {p.ms === null ? "-" : formatMs(p.ms)}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}
