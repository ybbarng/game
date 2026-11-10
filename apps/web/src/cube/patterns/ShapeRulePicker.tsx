"use client";

import {
  SHAPE_PICK_LABELS,
  SHAPE_START_LABELS,
  SHAPE_STARTS,
  type ShapePick,
  type ShapeStart,
  shapePicks,
  shapesFor,
} from "./race";

/**
 * 모양 만들기 규칙 고르기(컴퓨터와 대결·온라인 대기실·혼자 하기가 함께 쓴다, docs/47 9-10).
 * 시작(맞춘 큐브/섞인 큐브)과 모양 어려움(그 크기에 모양이 있는 것만, 개수를 붙인다), 「만드는 법」 허용(기본 켬).
 * `disabled`면 보기만(손님)
 */
export function ShapeRulePicker({
  n,
  start,
  pick,
  onStart,
  onPick,
  formula,
  onFormula,
  disabled = false,
}: {
  n: number;
  start: ShapeStart;
  pick: ShapePick;
  onStart: (s: ShapeStart) => void;
  onPick: (p: ShapePick) => void;
  /** 「만드는 법」 허용. 칸을 두지 않으려면 `onFormula`를 넘기지 않는다 */
  formula?: boolean;
  onFormula?: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div data-cube-shape-rule className="flex flex-col gap-2 text-sm">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1">시작</legend>
        <div className="flex flex-wrap gap-1">
          {SHAPE_STARTS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              data-cube-shape-start={s}
              aria-pressed={start === s}
              onClick={() => onStart(s)}
              className={`rounded-lg px-3 py-1.5 disabled:opacity-60 ${start === s ? "bg-violet-300 text-black" : "bg-white/10"}`}
            >
              {SHAPE_START_LABELS[s]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1">모양</legend>
        <div className="flex flex-wrap gap-1">
          {shapePicks(n).map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              data-cube-shape-pick={p}
              aria-pressed={pick === p}
              onClick={() => onPick(p)}
              className={`rounded-lg px-3 py-1.5 disabled:opacity-60 ${pick === p ? "bg-violet-300 text-black" : "bg-white/10"}`}
            >
              {SHAPE_PICK_LABELS[p]}
              <span className="ml-1 text-xs opacity-60">
                {shapesFor(n, p).length}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      {onFormula && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1">만드는 법 보기</legend>
          <div className="flex flex-wrap gap-1">
            {[true, false].map((on) => (
              <button
                key={String(on)}
                type="button"
                disabled={disabled}
                data-cube-shape-formula-rule={on ? "on" : "off"}
                aria-pressed={(formula !== false) === on}
                onClick={() => onFormula(on)}
                className={`rounded-lg px-3 py-1.5 disabled:opacity-60 ${(formula !== false) === on ? "bg-violet-300 text-black" : "bg-white/10"}`}
              >
                {on ? "허용" : "끔"}
              </button>
            ))}
          </div>
          {formula === false && (
            <span
              data-cube-shape-formula-off
              className="text-amber-200/90 text-xs"
            >
              만드는 법 보기를 껐어요. 외운 공식으로 겨뤄요.
            </span>
          )}
        </fieldset>
      )}
      <p className="text-white/50 text-xs">
        판마다 목표 모양이 하나 나와요. 먼저 그 모양을 만든 사람이 이겨요.
        큐브를 어느 쪽으로 들고 만들어도 같은 모양이면 돼요.
      </p>
    </div>
  );
}
