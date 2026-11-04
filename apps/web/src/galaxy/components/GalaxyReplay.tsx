"use client";

import { type Action, type GalaxyState, viewOf } from "@game/galaxy-engine";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { GameArchive } from "@/review/archive";
import { replayArchive } from "@/review/replay";

import { money } from "../format";
import { EMPTY_TIMELINE } from "../fx";
import { explainGalaxy, galaxyKit, isCurrentEdition } from "../kit";
import { GalaxyBoard } from "./GalaxyBoard";
import { ShipToken } from "./parts";

const PLAY_MS = 800;
/** 다시 보기에서 건너뛰는 걸음(사람이 고른 것이 아니라 기기가 낸 것) */
const QUIET = new Set(["commit", "bid"]);

/**
 * 은하 한 바퀴 다시 보기: 기록을 처음부터 다시 둬 보며, 걸음마다 별빛이 어떻게 흘렀는지 사건으로 보인다.
 * 약속·입찰 봉투처럼 기기가 낸 걸음은 건너뛴다. 공개는 주사위가 정해지는 마지막 공개만 남긴다. ←·→ 키로도 움직인다
 */
export function GalaxyReplay(props: {
  archive: GameArchive;
  name: (seat: number) => string;
}) {
  // 판 번호가 다른(옛 규칙) 판은 지금 숫자로 다시 두면 다른 판이 되므로 다시 두지 않는다
  if (!isCurrentEdition(props.archive.rules))
    return (
      <p className="py-6 text-center text-sm text-white/60" role="status">
        옛 규칙으로 둔 판이라 다시 볼 수 없어요.
      </p>
    );
  return <ReplayBody {...props} />;
}

function ReplayBody({
  archive,
  name,
}: {
  archive: GameArchive;
  name: (seat: number) => string;
}) {
  const replayed = useMemo(() => replayArchive(galaxyKit, archive), [archive]);
  const states = replayed.states as GalaxyState[];
  // 보일 걸음: 그 걸음 뒤 상태 번호(0은 처음)
  const marks = useMemo(() => {
    const list = [0];
    archive.log.forEach((entry, i) => {
      const action = entry.action as Action;
      if (QUIET.has(action.type)) return;
      const after = states[i + 1];
      if (
        (action.type === "reveal" || action.type === "bidReveal") &&
        after &&
        (after.phase === "reveal" || after.phase === "bidReveal")
      )
        return;
      if (after) list.push(i + 1);
    });
    return list;
  }, [archive, states]);
  const last = marks.length - 1;
  const [at, setAt] = useState(last);
  const [playing, setPlaying] = useState(false);
  const index = marks[Math.min(at, last)] ?? 0;
  const state = states[index] as GalaxyState;
  const go = (i: number) => setAt(Math.max(0, Math.min(last, i)));

  useEffect(() => {
    if (!playing) return;
    if (at >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setAt((i) => i + 1), PLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, at, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setAt((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setAt((i) => Math.min(last, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  // 이 걸음(앞 표시 뒤부터 지금까지)의 사건으로 별빛 흐름을 말한다
  const commentary = useMemo(() => {
    if (at === 0) return null;
    const from = marks[at - 1] ?? 0;
    const lines: string[] = [];
    let situation: string[] = [];
    for (let i = from; i < index; i++) {
      const entry = archive.log[i];
      const before = states[i];
      if (!entry || !before) continue;
      const c = explainGalaxy(before, entry, null, 0, name);
      if (i === index - 1) situation = c.situation;
      lines.push(...c.reasons);
    }
    return { situation, lines };
  }, [at, marks, index, archive, states, name]);

  const view = viewOf(state, archive.seat);
  return (
    <section className="flex flex-col items-center gap-3">
      <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <GalaxyBoard
          view={view}
          timeline={EMPTY_TIMELINE}
          elapsed={Number.POSITIVE_INFINITY}
          selected={null}
          name={name}
        />
        <ul className="flex flex-col gap-1 text-sm">
          {state.cash.map((c, seat) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 열쇠다
              key={seat}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1"
            >
              <ShipToken seat={seat} size={12} />
              {name(seat)}
              <span className="ml-auto font-bold text-amber-100">
                {money(c)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div
        role="toolbar"
        aria-label="다시 보기"
        className="flex flex-wrap justify-center gap-1"
      >
        {(
          [
            ["⏮", "처음", () => go(0)],
            ["◀", "한 수 뒤로", () => go(at - 1)],
            ["▶", "한 수 앞으로", () => go(at + 1)],
            ["⏭", "끝", () => go(last)],
          ] as const
        ).map(([icon, label, onClick]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => {
              setPlaying(false);
              onClick();
            }}
            className="min-w-10 rounded-lg bg-white/10 px-2 py-1 font-semibold hover:bg-white/20"
          >
            {icon}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (at >= last) setAt(0);
            setPlaying((p) => !p);
          }}
          className={cn(
            "rounded-lg px-3 py-1 font-semibold",
            playing ? "bg-amber-200 text-black" : "bg-white/10",
          )}
        >
          {playing ? "⏸ 멈춤" : "자동 재생"}
        </button>
      </div>
      <p role="status" className="text-sm text-white/80">
        {state.round}차례째 · {at}/{last}
        {state.phase === "gameOver" ? " · 판 끝" : ""}
      </p>
      {commentary && (
        <div className="w-full max-w-xl rounded-xl bg-white/5 p-3 text-sm">
          <p className="text-white/70">{commentary.situation.join(" · ")}</p>
          <ul className="mt-1 list-inside list-disc text-white/80">
            {commentary.lines.map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 사건 차례
              <li key={`${i}-${r}`}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {replayed.error && (
        <p className="text-rose-300 text-xs">{replayed.error}</p>
      )}
    </section>
  );
}
