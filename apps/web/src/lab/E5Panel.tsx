"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { useStimulusShown } from "@/game/stimulus-shown";
import { ExportButtons } from "./ExportButtons";
import { E5Session, parseConfig } from "./e5-session";

declare global {
  interface Window {
    /** 화면 시험이 결과를 읽는다 */
    __lab?: () => ReturnType<E5Session["snapshot"]>;
  }
}

/**
 * E5 속임 시험 화면(docs/43 5절). 같은 브라우저 탭 여럿을 열어 쓴다:
 * `/lab/reaction?mode=e5&room=R&role=host` 하나와 `…&role=guest&name=g1` 여럿.
 * 속임은 주소 해시로 켠다(e5-session.ts).
 */
export function E5Panel() {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [stimulus, setStimulus] = useState<number | null>(null);
  const sessionRef = useRef<E5Session | null>(null);

  const { seen } = useStimulusShown(stimulus, {
    onShown: ({ stimulus: r }) => {
      const session = sessionRef.current;
      const auto = session?.config.autoMs ?? 0;
      if (!session || auto <= 0) return;
      setTimeout(() => press(performance.now(), r), auto);
    },
  });

  const press = (pressedAt: number, only?: number) => {
    const session = sessionRef.current;
    const found = seen(pressedAt);
    if (!session || !found || (only !== undefined && found.stimulus !== only))
      return;
    session.claim(found.stimulus, found.rtMs);
  };

  useEffect(() => {
    const session = new E5Session(
      parseConfig(window.location.search, window.location.hash),
      refresh,
      setStimulus,
    );
    sessionRef.current = session;
    window.__lab = () => session.snapshot();
    // 표본 수·준비 상태를 보이려고 가끔 다시 그린다
    const timer = setInterval(refresh, 500);
    return () => {
      clearInterval(timer);
      session.leave();
      sessionRef.current = null;
      delete window.__lab;
    };
  }, []);

  const session = sessionRef.current;
  if (!session) return <p className="text-sm">잇는 중…</p>;
  const { config } = session;
  const active =
    stimulus !== null && !session.own.some((o) => o.r === stimulus);
  const results = session.results();

  return (
    <section className="flex flex-col gap-3" data-lab-e5>
      <h2 className="font-bold text-lg">속임 시험(같은 브라우저 탭끼리)</h2>
      <p className="text-sm text-white/70">
        나: {config.name}({config.role === "host" ? "방장" : "손님"}) · 여유{" "}
        {config.slackMs} ms
        {config.pingDelayMs > 0 && ` · 핑 답 ${config.pingDelayMs} ms 늦춤`}
        {config.rtCutMs > 0 && ` · rt ${config.rtCutMs} ms 깎아 보고`}
        {config.stimDelayMs > 0 &&
          ` · ${config.stimTo}에게 자극 ${config.stimDelayMs} ms 늦춤`}
      </p>
      <ul className="text-sm" data-lab-peers>
        {[...session.peers].map(([id, p]) => {
          const s = session.transport.meter.samples(id);
          const app = session.transport.meter.rttMin(id, "app");
          const rtc = session.transport.meter.rttMin(id, "rtc");
          return (
            <li key={id}>
              {p.name}: 앱 핑 {s.app}개(최소 {app?.toFixed(1) ?? "?"} ms) ·
              getStats {s.rtc}개(최소 {rtc?.toFixed(1) ?? "?"} ms) · 순서 없는
              채널 {s.unordered}개
            </li>
          );
        })}
      </ul>
      {config.role === "host" && (
        <button
          type="button"
          data-lab-start
          disabled={!session.ready() || session.running}
          className="rounded-lg bg-amber-300 px-4 py-2 font-bold text-black disabled:opacity-40"
          onClick={() => void session.run()}
        >
          {session.ready() ? `시작(${config.rounds}회)` : "표본 모으는 중…"}
        </button>
      )}
      <button
        type="button"
        data-lab-stimulus={active ? "on" : "off"}
        className={`relative h-[40vh] w-full select-none rounded-xl ${active ? "bg-white" : "bg-black"}`}
        style={{ touchAction: "manipulation" }}
        onPointerDown={(event) => press(event.timeStamp)}
      >
        <span className="absolute top-2 right-3 font-bold font-mono text-5xl text-gray-500 tabular-nums">
          {stimulus ?? 0}
        </span>
      </button>
      {session.done && <p data-lab-done>끝났습니다.</p>}
      <table className="text-xs tabular-nums" data-lab-results>
        <thead>
          <tr className="text-white/60">
            <th className="text-left">확인 → 청구</th>
            <th>회</th>
            <th>깎인 양: 앱 핑</th>
            <th>getStats</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={`${r.checker}>${r.claimant}`}>
              <td>
                {r.checker} → {r.claimant}
              </td>
              <td className="text-center">{r.n}</td>
              <td className="text-center">{r.meanClippedApp ?? "-"}</td>
              <td className="text-center">{r.meanClippedRtc ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="text-xs" data-lab-skews>
        {session
          .skews()
          .filter((s) => s.n > 0)
          .map((s) => (
            <li key={s.peer}>
              {s.peer}와 같은 자극을 받은 시각 차이(나 − 상대): 평균{" "}
              {s.meanMs ?? "?"} ms ({s.n}회)
            </li>
          ))}
      </ul>
      <ExportButtons name="lab-e5" data={() => session.snapshot()} />
    </section>
  );
}
