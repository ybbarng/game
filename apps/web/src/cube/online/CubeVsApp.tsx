"use client";

import { BOT_LEVEL_LABELS, BOT_LEVELS, type BotLevel } from "@game/cube-ai";
import { useEffect, useRef, useState } from "react";

import { raceClock } from "@/net/race/race-session";
import { planInWorker, scrambleInWorker, warmUpScramble } from "../worker";
import { RaceView } from "./RaceView";
import { eventForSize } from "./race-game";
import { CubeRoom, TIME_LIMIT_SEC } from "./room";
import { useCubeRoom } from "./use-room";

/**
 * 컴퓨터와 대결(`/cube/vs`, docs/47 10절). 단계를 고르면 같은 섞기로 나란히 맞춘다.
 * 온라인 방과 같은 길(대결 틀 + 컴퓨터 참가자)을 진짜 연결 없이 쓴다.
 */

const SIZES = [2, 3, 4, 5] as const;

export function CubeVsApp() {
  const [n, setN] = useState(2);
  const [level, setLevel] = useState<BotLevel>("beginner");
  const [inspection, setInspection] = useState(true);
  const [room, setRoom] = useState<CubeRoom | null>(null);
  const version = useCubeRoom(room);
  const roomRef = useRef<CubeRoom | null>(null);

  useEffect(() => warmUpScramble(eventForSize(n)), [n]);
  useEffect(() => () => roomRef.current?.dispose(), []);

  const start = () => {
    roomRef.current?.dispose();
    const r = new CubeRoom({
      clock: raceClock,
      isHost: true,
      name: "나",
      scrambler: scrambleInWorker,
      botPlan: planInWorker,
      settings: {
        n,
        format: "single",
        inspection,
        timeLimitSec: TIME_LIMIT_SEC[n] ?? 300,
      },
    });
    r.addBot(level);
    roomRef.current = r;
    setRoom(r);
    r.startRound();
  };

  const status = room?.state?.status;
  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-cube-vs={status ?? "setup"}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">컴퓨터와 대결</h1>
          {room && status !== "racing" && (
            <button
              type="button"
              data-cube-again
              onClick={() => {
                room.newMatch();
                room.startRound();
              }}
              className="ml-auto rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-black text-sm"
            >
              한 판 더
            </button>
          )}
          {room && status !== "racing" && (
            <button
              type="button"
              onClick={() => {
                room.dispose();
                roomRef.current = null;
                setRoom(null);
              }}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm"
            >
              다시 고르기
            </button>
          )}
        </header>

        {!room ? (
          <section className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white/5 p-4">
            <label className="flex items-center justify-between text-sm">
              크기
              <select
                data-cube-vs-size
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
                className="rounded bg-white/10 px-2 py-1"
              >
                {SIZES.map((k) => (
                  <option key={k} value={k} className="bg-neutral-800">
                    {k}×{k}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1">컴퓨터 단계</legend>
              <div className="flex flex-wrap gap-1">
                {BOT_LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={level === l}
                    onClick={() => setLevel(l)}
                    className={`rounded-lg px-3 py-1.5 ${level === l ? "bg-amber-400 text-black" : "bg-white/10"}`}
                  >
                    {BOT_LEVEL_LABELS[l]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-sky-400"
                checked={inspection}
                onChange={(e) => setInspection(e.target.checked)}
              />
              15초 살펴보기
            </label>
            <button
              type="button"
              data-cube-vs-start
              onClick={start}
              className="rounded-xl bg-sky-500 py-2 font-semibold text-black"
            >
              시작
            </button>
          </section>
        ) : (
          <RaceView room={room} version={version} local />
        )}
      </main>
    </div>
  );
}
