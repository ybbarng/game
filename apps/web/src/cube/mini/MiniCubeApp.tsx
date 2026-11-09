"use client";

import { type CubeMove, formatMove, isSolved } from "@game/cube-engine";
import type { ScrambleEvent } from "@game/cube-scramble";
import { realClock } from "@game/fair-play";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { stickersFromState } from "../bridge";
import { playCubeCue, playCubeSound } from "../components/CubePlay";
import { CubePosterPair } from "../components/CubePosterPair";
import { KeyboardMap, KeyLegend } from "../components/KeyboardMap";
import { soloSound } from "../game-sounds";
import { HeroLoop, heroMoveMs, SOLVED_LABEL } from "../hero/loop";
import { heroRotation, isHeroSize, solveForHero } from "../hero/methods";
import {
  attachKeyboard,
  chordLabel,
  chordsFor,
  KeyInterpreter as Interpreter,
  type KeyInterpreter,
  type Keymap,
  type KeyResult,
  loadKeymap,
  PRESET_LABEL,
} from "../input";
import { formatMs, type SolveInput } from "../records";
import { useCubeSettings } from "../settings";
import { SolveSession } from "../solve-session";
import { type MyTier, tierName } from "../tiers/rank";
import { TIER_TONE } from "../tiers/TierTable";
import { useReducedMotion } from "../use-reduced-motion";
import { useRenewable } from "../use-renewable";
import { type CubeView, loadCubeView } from "../view";
import { heroSolveInWorker, scrambleInWorker, warmUpScramble } from "../worker";
import { type FromApp, hasApp, onAppMessage, toApp } from "./app-bridge";
import { FocusClock } from "./focus-clock";
import { IDLE_TIMING, IdleShow, jigglePlan, playMoves } from "./idle";
import {
  addMiniRecord,
  type KeyOrigin,
  keyOriginOf,
  loadMiniPrefs,
  loadMiniRecords,
  MINI_SIZES,
  type MiniPrefs,
  type MiniRecord,
  miniTier,
  saveMiniPrefs,
  summarize,
} from "./store";

/**
 * 미니 모드(`/cube/mini`, docs/47 15절): 맥 앱 Cubie의 작은 투명 창(기본 200×200, 48×48까지 줄임)에 맞춘 혼자 맞추기.
 * 앱 안에서는 바탕이 없어 큐브와 거울만 바탕화면 위에 뜬다(바탕 비우기는 앱이 넣는 CSS, 바닥 그림자는 끈다).
 *
 * - 화면에는 큐브와 거울만 둔다. 시간·단추·글은 보이지 않는다(사용자 「시간도 화면에 떠 있으면 어지러우니까」).
 *   섞기·거울·크기·기록은 앱 메뉴(브라우저에서는 구석의 작은 메뉴)에서 고른다.
 * - 키는 사이트의 키 배치(두 손·표기·사용자) 그대로다. 섞기는 배치의 「다시 섞기」 키(두 배치 모두 Enter), 되돌리기는
 *   ⌫. 배치의 Esc(맞춘 상태로)는 쓰지 않는다: 앱에서 Esc는 이전 앱으로 돌아가는 키이고, 실수로 진행을 버리지 않게.
 * - 시간은 포커스가 있는 동안만 잰다(`FocusClock`). 섞은 뒤 첫 면 돌리기부터 맞출 때까지, 살펴보기는 없다.
 * - 포커스가 없으면 이따금 움직인다(`idle.ts`): 맞춘 큐브는 첫 화면 연출 한 판, 섞인 큐브는 조금 섞고 되돌리기.
 *   움직임은 장면에만 넣고 엔진 상태(진행)는 그대로다.
 */

/**
 * 거울을 저절로 접는 문턱: 창의 짧은 변(CSS px)이 큐브 크기 n × 이 값보다 작으면 큐브만 크게 보인다.
 * 거울 칸 한 변은 대략 창의 0.27배 ÷ n이라, 10이면 칸이 약 2.7px보다 작아질 때 접힌다(2026-11-09 이 맥에서 줄여 보며
 * 정함: 48px 창의 3×3 거울도 색을 알아본다). 3×3·4×4는 가장 작은 창(48)에서도 거울이 남고, 7×7은 70px 아래에서 접힌다
 */
export const MINI_MIRROR_PER_N = 10;

const DEFAULT_VIEW = { yaw: 32, pitch: 26 };
const PEEK = {
  peekBack: { yaw: 212, pitch: 26 },
  peekDown: { yaw: 32, pitch: -55 },
} as const;

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

const eventFor = (n: number) => `${n}${n}${n}` as ScrambleEvent;

/**
 * `?view=records`면 기록만 보인다(앱이 따로 여는 기록 창, 떠 있는 창은 아주 작을 수 있어서). 아니면 큐브.
 * 주소는 붙은 뒤에 읽는다(정적 HTML은 둘 다 아니다)
 */
export function MiniCubeApp() {
  const [view, setView] = useState<"cube" | "records" | "keys" | null>(null);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    setView(v === "records" || v === "keys" ? v : "cube");
  }, []);
  if (view === "records") return <RecordsPage />;
  if (view === "keys") return <KeysPage />;
  if (view === "cube") return <MiniCube />;
  return null;
}

/** 기록 창: 이 기기의 미니 모드 기록. 창이 다시 앞에 오거나 다른 창이 기록을 더하면 다시 읽는다 */
function RecordsPage() {
  const [n, setN] = useState(() => loadMiniPrefs().n);
  const [records, setRecords] = useState<MiniRecord[]>(() =>
    loadMiniRecords(n),
  );
  useEffect(() => {
    const reload = () => setRecords(loadMiniRecords(n));
    reload();
    window.addEventListener("focus", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("storage", reload);
    };
  }, [n]);
  return (
    <main className="fixed inset-0 flex flex-col bg-neutral-950 text-white">
      <MiniTiers version={records} n={n} onSize={setN} />
      <div className="relative flex-1">
        <RecordsPanel n={n} records={records} onSize={setN} />
      </div>
    </main>
  );
}

/**
 * 크기별 최고 Ao5와 티어(Cubie 기록 기준, docs/47 15-6). 티어는 사이트와 같은 규칙(최고 Ao5, `tiers/rank.ts`)이지만
 * 기록은 미니 모드 것이라(살펴보기 없이·포커스 있는 동안만 잼) 그렇게 밝힌다
 */
function MiniTiers({
  version,
  n,
  onSize,
}: {
  version: unknown;
  n: number;
  onSize: (n: number) => void;
}) {
  const [tiers, setTiers] = useState<(MyTier | null)[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version은 기록이 바뀐 때를 알리는 값
  useEffect(() => {
    setTiers(MINI_SIZES.map((s) => miniTier(s)));
  }, [version]);
  return (
    <section
      data-mini-tiers
      className="flex flex-col gap-1 border-white/10 border-b p-2 text-xs"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="font-bold text-sm">티어</h2>
        <span className="text-white/60">Cubie 기록 기준 · 최고 Ao5</span>
        <a
          href={`/cube/tiers?n=${n}`}
          className="ml-auto text-white/70 underline-offset-2 hover:underline"
        >
          티어표
        </a>
      </div>
      <ul className="grid grid-cols-3 gap-1 tabular-nums">
        {MINI_SIZES.map((s, i) => {
          const t = tiers[i] ?? null;
          return (
            <li key={s}>
              <button
                type="button"
                data-mini-tier-size={s}
                aria-pressed={s === n}
                onClick={() => onSize(s)}
                className={cn(
                  "flex w-full flex-col items-start rounded px-1.5 py-1 text-left",
                  s === n ? "bg-white/15" : "bg-white/5 hover:bg-white/10",
                )}
              >
                <span className="text-white/60">
                  {s}×{s} {t ? formatMs(t.ao5) : ""}
                </span>
                {t ? (
                  <span
                    data-cube-tier={t.place.tier}
                    className={cn("font-semibold", TIER_TONE[t.place.tier])}
                  >
                    {tierName(t.place)}
                  </span>
                ) : (
                  <span className="text-white/40">5판 뒤에</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="break-keep text-white/50">
        Cubie는 살펴보기 없이, 큐브에 키 입력이 있는 동안만 재요. 사이트 혼자
        맞추기 기록과는 따로 매겨요.
      </p>
    </section>
  );
}

/** 앱 단축키(맥 앱 Cubie가 쓰는 키). 앱 쪽 값은 `apps/cubie/Sources/Cubie/Config.swift` */
const APP_KEYS: { keys: string; what: string }[] = [
  { keys: "⌃⌥⌘C", what: "큐브로 가기(다시 누르면 돌아가기)" },
  { keys: "Esc", what: "이전 앱으로 돌아가기(큐브는 그대로 떠 있다)" },
  { keys: "⌘ + 끌기", what: "창 옮기기(창 위 손잡이를 끌어도 된다)" },
];

/**
 * 단축키 창(앱 메뉴 「단축키 보기」): 앱 단축키 짧은 목록과, 지금 키 배치·크기의 큐브 키를 사이트 단축키 표와 같은
 * 키보드 그림으로. 섞기·되돌리기는 배치에서 읽는다
 */
function KeysPage() {
  const [n, setN] = useState(() => loadMiniPrefs().n);
  const [keymap, setKeymap] = useState<Keymap | null>(null);
  useEffect(() => {
    const reload = () => {
      setKeymap(loadKeymap());
      setN(loadMiniPrefs().n);
    };
    reload();
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);
  const chord = (action: "scramble" | "undo") =>
    keymap
      ? chordsFor(keymap, action)
          .map((c) => chordLabel(c))
          .join(", ") || "없음"
      : "…";
  return (
    <main
      data-mini-keys={n}
      className="min-h-dvh bg-neutral-950 p-4 text-sm text-white"
    >
      <h1 className="mb-2 font-bold text-base">단축키</h1>
      <table className="mb-4 text-left">
        <tbody>
          {[
            ...APP_KEYS,
            { keys: chord("scramble"), what: "섞기" },
            { keys: chord("undo"), what: "되돌리기" },
          ].map((k) => (
            <tr key={k.what}>
              <th className="pr-4 font-semibold tabular-nums">{k.keys}</th>
              <td className="text-white/70">{k.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-bold">큐브 돌리기</h2>
        {keymap && (
          <span className="text-white/60 text-xs">
            배치 「{PRESET_LABEL[keymap.preset]}」
          </span>
        )}
        <div className="ml-auto flex gap-0.5">
          {MINI_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === n}
              onClick={() => setN(s)}
              className={cn(
                "rounded px-1.5 text-xs",
                s === n ? "bg-white/20" : "text-white/60 hover:bg-white/10",
              )}
            >
              {s}×{s}
            </button>
          ))}
        </div>
      </div>
      {keymap && (
        <div className="flex flex-col gap-2">
          <KeyboardMap keymap={keymap} n={n} layer="all" />
          <KeyLegend />
          <p className="break-keep text-white/60 text-xs">
            칸마다 맨 위 굵은 글은 그냥 칠 때, 그 아래는 Shift와 함께, 맨 아래는
            Alt와 함께 칠 때예요. 흐린 글은 이 크기에서 쓰지 않아요. Cubie에서
            Esc는 「처음으로」가 아니라 이전 앱으로 돌아가는 키이고,
            Space(살펴보기)는 쓰지 않아요. 배치는 메뉴 「키·색 설정」에서
            바꿔요.
          </p>
        </div>
      )}
    </main>
  );
}

function MiniCube() {
  const settings = useCubeSettings();
  const reduced = useReducedMotion();
  const [prefs, setPrefsState] = useState<MiniPrefs | null>(null);
  useEffect(() => setPrefsState(loadMiniPrefs()), []);
  const n = prefs?.n ?? 3;
  const setPrefs = useCallback((next: MiniPrefs) => {
    setPrefsState(next);
    saveMiniPrefs(next);
  }, []);

  // 앱 안인지는 붙은 뒤에 본다(정적 HTML과 첫 그림이 같아야 한다)
  const [app, setApp] = useState(false);
  useEffect(() => setApp(hasApp()), []);
  // 앱 안이면 앱이 알려 줄 때까지 포커스 없음·보임으로 둔다. 브라우저는 창의 포커스를 본다
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordsN, setRecordsN] = useState(n);
  const [records, setRecords] = useState<MiniRecord[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, bumpState] = useState(0);
  const bump = useCallback(() => bumpState((v) => v + 1), []);

  const clock = useMemo(() => new FocusClock(realClock, false), []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  /**
   * 이번 판의 입력(혼자 맞추기와 같은 `inputs`, 처음 쓴 차례)과 키 출처(공정함 확인): 앱이 키마다 바로 앞에 알려 준
   * 출처(`key` 메시지)를 모은다. 섞을 때 비우고, 기록에 `inputs`·`keyOrigin`(`keyOriginOf`)으로 남긴다
   */
  const keyOriginRef = useRef<KeyOrigin | null>(null);
  const inputsRef = useRef<SolveInput[]>([]);
  const originsRef = useRef(new Set<KeyOrigin>());
  const appRef = useRef(false);
  appRef.current = app;

  const session = useRenewable(
    () =>
      new SolveSession({
        n,
        mode: "solo",
        inspection: false,
        clock,
        onChange: bump,
        onCue: (cue) => {
          if (cue === "solved")
            playCubeSound(settingsRef.current, soloSound("solved"));
        },
        onRecord: (r) => {
          const origin = keyOriginOf(originsRef.current);
          const list = addMiniRecord({
            ...r,
            inspection: false,
            ...(inputsRef.current.length > 0
              ? { inputs: [...inputsRef.current] }
              : {}),
            ...(origin ? { keyOrigin: origin } : {}),
          });
          setRecords(list);
        },
      }),
    `${n}`,
  );
  session.inspection = false;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // 3D 장면
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const mirrorWanted = prefs?.mirror ?? true;
  const mirrorFits =
    size === null || Math.min(size.w, size.h) >= MINI_MIRROR_PER_N * n;
  const mirror = mirrorWanted && mirrorFits;

  const repaint = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    v.setStickers(stickersFromState(n, sessionRef.current.state, null));
    v.setMarks(null);
    v.setOptions({ moveMs: settingsRef.current.moveMs });
  }, [n]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () =>
      setSize((s) => {
        const w = Math.round(wrap.clientWidth);
        const h = Math.round(wrap.clientHeight);
        return s && s.w === w && s.h === h ? s : { w, h };
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const quality = settings.quality;
  const loaded = prefs !== null;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    let disposed = false;
    setReady(false);
    const ro = new ResizeObserver(() =>
      viewRef.current?.resize(canvas.clientWidth, canvas.clientHeight),
    );
    void loadCubeView()
      .then(({ CubeView }) => {
        if (disposed) return;
        const s = settingsRef.current;
        const view = CubeView.create(canvas, {
          n,
          quality,
          colors: s.colors,
          stickerless: s.stickerless,
          moveMs: s.moveMs,
          hidden: s.hidden,
          // 앱의 투명 창에서는 바닥 그림자를 끈다(바탕화면 위 얼룩처럼 보인다)
          ...(hasApp() ? { shadow: false } : {}),
          onSwipe: (m) => moveRef.current(m, formatMove(n, m), "swipe", null),
        });
        view.setStickers(stickersFromState(n, sessionRef.current.state, null));
        viewRef.current = view;
        view.resize(canvas.clientWidth, canvas.clientHeight);
        ro.observe(canvas);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [n, quality, loaded]);

  useEffect(() => {
    viewRef.current?.setOptions({
      colors: settings.colors,
      stickerless: settings.stickerless,
      moveMs: settings.moveMs,
      hidden: settings.hidden,
    });
  }, [settings.colors, settings.stickerless, settings.moveMs, settings.hidden]);

  useEffect(() => {
    if (ready) viewRef.current?.setMirror(mirror);
  }, [mirror, ready]);

  // 앱의 투명 창: 큐브·거울이 차지하는 곳을 알린다(그 밖의 누르기는 아래 앱으로 지나간다)
  const hitKey = size ? `${mirror}-${size.w}x${size.h}` : "";
  useEffect(() => {
    // 거울·창 크기가 바뀌면(hitKey) 다시 알린다
    if (!app || !ready || !hitKey) return;
    const send = () => {
      const v = viewRef.current;
      if (!v) return;
      toApp({
        type: "hit",
        rects: v
          .hitRects()
          .map((r) => [r.x, r.y, r.w, r.h].map((x) => Math.round(x))),
      });
    };
    // 거울이 나타나는 동안 카메라가 물러나므로 다 그린 뒤에도 한 번 더
    const timers = [0, 450].map((ms) => window.setTimeout(send, ms));
    // 끌어 둘러본 보기는 손을 떼면 0.7초에 걸쳐 돌아온다
    const canvas = canvasRef.current;
    let later = 0;
    const onUp = () => {
      window.clearTimeout(later);
      later = window.setTimeout(send, 800);
    };
    canvas?.addEventListener("pointerup", onUp);
    return () => {
      for (const t of timers) window.clearTimeout(t);
      window.clearTimeout(later);
      canvas?.removeEventListener("pointerup", onUp);
    };
  }, [app, ready, hitKey]);

  // 떠 있을 때 움직임
  const idle = useMemo(
    () =>
      new IdleShow(realClock, {
        solved: () => isSolved(sessionRef.current.n, sessionRef.current.state),
        hero: (done) => {
          const v = viewRef.current;
          const size = sessionRef.current.n;
          if (!v || !isHeroSize(size)) return null;
          // 연출은 맞춘 큐브(흰 위·초록 앞)에서 시작한다
          v.setStickers(
            stickersFromState(size, sessionRef.current.state, null),
          );
          let moveMs = settingsRef.current.moveMs;
          let finishing: (() => void) | null = null;
          const loop = new HeroLoop({
            n: size,
            methods: heroRotation(size, settingsRef.current.heroMethod),
            clock: realClock,
            rng: Math.random,
            solve: heroSolveInWorker,
            solveHere: solveForHero,
            onMove: (_m, ms, parsed) => {
              const want = heroMoveMs(ms, parsed);
              if (want !== moveMs) {
                moveMs = want;
                v.setOptions({ moveMs });
              }
              for (const m of parsed) v.enqueue(m);
            },
            onLabel: (label) => {
              // 한 판을 다 맞추면(「… · 맞춤」) 그 멈춤만큼 보이고 끝낸다
              if (!label.endsWith(SOLVED_LABEL) || finishing) return;
              finishing = realClock.after(1500, () => {
                loop.stop();
                done();
              });
            },
            onReset: (state) => v.setStickers(stickersFromState(size, state)),
          });
          loop.start();
          return () => {
            finishing?.();
            loop.stop();
          };
        },
        jiggle: (done) => {
          const s = sessionRef.current;
          const plan = jigglePlan(s.n, Math.random, IDLE_TIMING.jiggleMoves);
          return playMoves(
            realClock,
            plan,
            IDLE_TIMING.jiggleStepMs,
            (m) => viewRef.current?.enqueue(m),
            done,
          );
        },
        restore: () => {
          repaintRef.current();
          bump();
          if (hasApp()) toApp({ type: "idle", showing: null });
        },
        started: (kind) => {
          bump();
          if (hasApp()) toApp({ type: "idle", showing: kind });
        },
      }),
    [bump],
  );
  const repaintRef = useRef(repaint);
  repaintRef.current = repaint;
  useEffect(() => () => idle.dispose(), [idle]);
  useEffect(() => {
    clock.setFocused(focused);
    idle.setActive(!focused && visible && !reduced && prefs !== null);
  }, [clock, idle, focused, visible, reduced, prefs]);
  // 크기가 바뀌면 움직이던 것을 멈추고 간격을 처음부터
  // biome-ignore lint/correctness/useExhaustiveDependencies: 크기가 바뀔 때만
  useEffect(() => idle.reset(), [n, idle]);

  // 섞기
  const preparing = useRef(false);
  const scrambleId = useRef(0);
  const doScramble = useCallback(async () => {
    if (preparing.current) return;
    preparing.current = true;
    const id = ++scrambleId.current;
    const s = sessionRef.current;
    const seed = randomSeed();
    try {
      const made = await scrambleInWorker(eventFor(s.n), seed);
      if (id !== scrambleId.current || s.disposed) return;
      idle.reset();
      s.start(made.text, seed);
      inputsRef.current = [];
      originsRef.current = new Set();
      repaintRef.current();
    } catch {
      // 섞기를 못 만들었다: 다음에 다시 누르면 된다
    } finally {
      if (id === scrambleId.current) preparing.current = false;
    }
  }, [idle]);
  useEffect(() => {
    if (prefs) warmUpScramble(eventFor(n));
    return () => {
      scrambleId.current++;
      preparing.current = false;
    };
  }, [n, prefs]);

  /**
   * 수 하나: 엔진에 넣고 장면이 따라 돈다(키·밀기). 입력 방식과 키 출처(키일 때)는 이번 판 기록에 남긴다
   */
  const moveRef = useRef(
    (
      move: CubeMove,
      notation: string,
      input: SolveInput,
      origin: KeyOrigin | null,
    ) => {
      idleRef.current.setActive(false);
      const s = sessionRef.current;
      // 맞춰서 기록이 생기는 수도 그 판에 든다(input 전에 더한다)
      if (!inputsRef.current.includes(input))
        inputsRef.current = [...inputsRef.current, input];
      if (origin) originsRef.current.add(origin);
      if (s.input(move, notation) !== "applied") return;
      viewRef.current?.enqueue(move);
      playCubeCue(settingsRef.current, "cubeTurn");
    },
  );
  const idleRef = useRef(idle);
  idleRef.current = idle;
  const scrambleRef = useRef(doScramble);
  scrambleRef.current = doScramble;

  // 키
  const [keymap] = useState(() =>
    typeof window === "undefined" ? null : loadKeymap(),
  );
  const interpreter = useMemo(
    () => (keymap ? new Interpreter(n, keymap) : null),
    [n, keymap],
  );
  const interpreterRef = useRef<KeyInterpreter | null>(interpreter);
  interpreterRef.current = interpreter;
  const recordsOpenRef = useRef(recordsOpen);
  recordsOpenRef.current = recordsOpen;
  useEffect(() => {
    let peekKey: string | null = null;
    /**
     * 지금 키의 출처: 앱이 키 바로 앞에 보낸 `key` 메시지를 키마다(동작이 아닌 키도) 한 번 꺼내 쓴다.
     * 브라우저(앱 없음)거나 메시지가 없으면 unknown
     */
    let eventOrigin: KeyOrigin = "unknown";
    const take = (e: KeyboardEvent) => {
      // 수식 키만 누른 keydown(Shift 등)은 앱의 키 알림이 없다(맥에서는 키가 아니라 수식 변화). 다음 키 몫을 남겨 둔다
      if (MODIFIER_KEYS.has(e.key)) return;
      eventOrigin = appRef.current
        ? (keyOriginRef.current ?? "unknown")
        : "unknown";
      keyOriginRef.current = null;
    };
    window.addEventListener("keydown", take, true);
    const handle = (r: KeyResult, e: KeyboardEvent) => {
      if (r.kind === "move") {
        moveRef.current(r.move, r.notation, "keyboard", eventOrigin);
        return;
      }
      if (r.kind !== "command") return;
      if (r.command === "undo") {
        // 되돌리기는 입력 방식에 세지 않지만(혼자 맞추기와 같다) 키 출처에는 넣는다(판을 바꾸는 키다)
        originsRef.current.add(eventOrigin);
        const m = sessionRef.current.undo();
        if (m) {
          viewRef.current?.enqueue(m);
          playCubeCue(settingsRef.current, "cubeTurn");
        }
      } else if (r.command === "scramble") void scrambleRef.current();
      else if (r.command === "peekBack" || r.command === "peekDown") {
        const p = PEEK[r.command];
        viewRef.current?.setView(p.yaw, p.pitch);
        peekKey = e.code;
      }
      // reset(Esc)·inspectionSkip(Space)은 쓰지 않는다
    };
    const detach = attachKeyboard(
      window,
      () => {
        const it = interpreterRef.current;
        return it && !recordsOpenRef.current ? it : LOCKED;
      },
      handle,
    );
    const onKeyUp = (e: KeyboardEvent) => {
      if (peekKey === null || e.code !== peekKey) return;
      peekKey = null;
      viewRef.current?.setView(DEFAULT_VIEW.yaw, DEFAULT_VIEW.pitch);
    };
    window.addEventListener("keyup", onKeyUp);
    return () => {
      detach();
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", take, true);
    };
  }, []);

  // 포커스: 앱이면 앱이 알린다. 브라우저면 창의 포커스·보임
  useEffect(() => {
    // 앱 상태(app)는 붙은 뒤에 바뀌므로 여기서 바로 본다(첫 그림에서 브라우저 포커스로 켜지지 않게)
    if (app || hasApp()) return;
    const sync = () => {
      setFocused(document.hasFocus() && !document.hidden);
      setVisible(!document.hidden);
    };
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [app]);

  const openRecords = useCallback(
    (open: boolean) => {
      setRecordsOpen(open);
      if (open) {
        setRecordsN(n);
        setRecords(loadMiniRecords(n));
      }
    },
    [n],
  );

  // 앱이 보낸 것(앱이 없어도 같은 이벤트를 받는다: 화면 시험이 앱 흉내를 낸다)
  const live = useRef({ prefs, n, recordsOpen, openRecords });
  live.current = { prefs, n, recordsOpen, openRecords };
  useEffect(
    () =>
      onAppMessage((msg: FromApp) => {
        const c = live.current;
        switch (msg.type) {
          case "focus":
            setFocused(msg.focused);
            break;
          case "visible":
            setVisible(msg.visible);
            break;
          case "scramble":
            void scrambleRef.current();
            break;
          case "mirror":
            if (c.prefs)
              setPrefs({ ...c.prefs, mirror: msg.on ?? !c.prefs.mirror });
            break;
          case "size":
            if (c.prefs && (MINI_SIZES as readonly number[]).includes(msg.n))
              setPrefs({ ...c.prefs, n: msg.n });
            break;
          case "records":
            c.openRecords(msg.open ?? !c.recordsOpen);
            break;
          case "key":
            keyOriginRef.current =
              msg.source === "keyboard" ? "hardware" : "synthetic";
            break;
        }
      }),
    [setPrefs],
  );
  useEffect(() => {
    if (app) toApp({ type: "ready" });
  }, [app]);
  useEffect(() => {
    if (app && prefs)
      toApp({
        type: "state",
        n: prefs.n,
        mirror: prefs.mirror,
        records: recordsOpen,
      });
  }, [app, prefs, recordsOpen]);
  // 기록을 보다가 포커스를 잃으면 닫는다(떠 있는 창은 큐브만)
  useEffect(() => {
    if (!focused && app) setRecordsOpen(false);
  }, [focused, app]);

  const solved = isSolved(session.n, session.state);
  return (
    <main
      data-mini
      data-mini-n={n}
      data-mini-phase={session.phase}
      data-mini-solved={solved ? "" : undefined}
      data-mini-scramble={session.scramble}
      data-mini-moves={session.moveCount}
      data-mini-focused={focused ? "" : undefined}
      data-mini-mirror={mirror ? "on" : mirrorWanted ? "folded" : "off"}
      data-mini-idle={idle.showing ?? ""}
      data-input-ready={interpreter && prefs ? "" : undefined}
      className={cn(
        "fixed inset-0 select-none overflow-hidden text-white",
        // 앱 안에서는 바탕을 비워 큐브와 거울만 바탕화면 위에 뜬다
        !app && "bg-neutral-950",
      )}
    >
      <div ref={wrapRef} className="absolute inset-0">
        {failed ? (
          <div
            data-cube-no3d
            className="flex h-full w-full items-center justify-center p-1"
          >
            <CubePosterPair
              n={n}
              state={session.state}
              settings={settings}
              captions={false}
              frontOnly={!mirror}
              className="h-full w-full"
            />
          </div>
        ) : (
          <canvas
            key={`${n}-${quality}`}
            ref={canvasRef}
            data-cube-canvas
            data-cube-ready={ready ? "" : undefined}
            className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          />
        )}
      </div>

      {!app && (
        <BrowserMenu
          open={menuOpen}
          setOpen={setMenuOpen}
          n={n}
          mirror={mirrorWanted}
          onScramble={() => {
            setMenuOpen(false);
            void doScramble();
          }}
          onMirror={() =>
            prefs && setPrefs({ ...prefs, mirror: !prefs.mirror })
          }
          onSize={(size) => prefs && setPrefs({ ...prefs, n: size })}
          onRecords={() => {
            setMenuOpen(false);
            openRecords(true);
          }}
        />
      )}

      {recordsOpen && (
        <RecordsPanel
          n={recordsN}
          records={recordsN === n ? records : loadMiniRecords(recordsN)}
          onSize={setRecordsN}
          onClose={() => setRecordsOpen(false)}
        />
      )}
    </main>
  );
}

const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Fn",
]);

/** 잠겨 있을 때(기록을 보는 동안) 쓰는 해석기: 어떤 키도 먹지 않는다 */
const LOCKED = { handle: () => null } as unknown as KeyInterpreter;

/** 브라우저에서 열었을 때(앱 메뉴가 없을 때)의 구석 메뉴 */
function BrowserMenu({
  open,
  setOpen,
  n,
  mirror,
  onScramble,
  onMirror,
  onSize,
  onRecords,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  n: number;
  mirror: boolean;
  onScramble: () => void;
  onMirror: () => void;
  onSize: (n: number) => void;
  onRecords: () => void;
}) {
  return (
    <div className="absolute top-1 right-1 z-10 flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label="메뉴"
        aria-expanded={open}
        data-mini-menu
        onClick={() => setOpen(!open)}
        className="h-7 w-7 rounded-md text-white/40 hover:bg-white/10 hover:text-white"
      >
        ⋯
      </button>
      {open && (
        <div className="flex w-36 flex-col gap-0.5 rounded-lg border border-white/15 bg-neutral-900/95 p-1 text-sm shadow-xl">
          <MenuItem onClick={onScramble} data="scramble">
            섞기
          </MenuItem>
          <MenuItem onClick={onMirror} data="mirror">
            {mirror ? "거울 끄기" : "거울 켜기"}
          </MenuItem>
          <MenuItem onClick={onRecords} data="records">
            기록
          </MenuItem>
          <div className="grid grid-cols-3 gap-0.5 pt-1">
            {MINI_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                data-mini-size={s}
                aria-pressed={s === n}
                onClick={() => onSize(s)}
                className={cn(
                  "rounded px-1 py-0.5 text-xs",
                  s === n ? "bg-white/20" : "hover:bg-white/10",
                )}
              >
                {s}×{s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  data,
  children,
}: {
  onClick: () => void;
  data: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-mini-item={data}
      onClick={onClick}
      className="rounded px-2 py-1 text-left hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function shortTime(at: number): string {
  const d = new Date(at);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 기록: 크기마다 지난 기록(날짜·시간·수)과 최고·평균 */
function RecordsPanel({
  n,
  records,
  onSize,
  onClose,
}: {
  n: number;
  records: readonly MiniRecord[];
  onSize: (n: number) => void;
  /** 없으면 닫기 단추가 없다(앱의 기록 창은 창을 닫는다) */
  onClose?: () => void;
}) {
  const sum = summarize(records);
  return (
    <section
      data-mini-records={n}
      className="absolute inset-0 z-20 flex flex-col gap-1.5 overflow-hidden bg-neutral-950/95 p-2 text-xs"
    >
      <div className="flex items-center gap-1">
        <h1 className="font-bold text-sm">기록</h1>
        <div className="flex flex-1 flex-wrap gap-0.5">
          {MINI_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === n}
              data-mini-records-size={s}
              onClick={() => onSize(s)}
              className={cn(
                "rounded px-1",
                s === n ? "bg-white/20" : "text-white/60 hover:bg-white/10",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            data-mini-records-close
            className="rounded px-1.5 py-0.5 hover:bg-white/10"
          >
            닫기
          </button>
        )}
      </div>
      <dl
        data-mini-summary
        className="grid grid-cols-2 gap-x-2 rounded bg-white/5 p-1.5 tabular-nums"
      >
        <dt className="text-white/60">최고</dt>
        <dd data-mini-best>{formatMs(sum.best ?? undefined)}</dd>
        <dt className="text-white/60">평균</dt>
        <dd>{formatMs(sum.mean ?? undefined)}</dd>
        <dt className="text-white/60">5번 평균</dt>
        <dd>{formatMs(sum.ao5)}</dd>
        <dt className="text-white/60">12번 평균</dt>
        <dd>{formatMs(sum.ao12)}</dd>
      </dl>
      {records.length === 0 ? (
        <p className="text-white/60">아직 기록이 없어요.</p>
      ) : (
        <ol className="flex-1 overflow-y-auto tabular-nums">
          {records.map((r) => (
            <li
              key={`${r.no}-${r.at}`}
              data-mini-record
              className="flex gap-2 border-white/10 border-b py-0.5"
            >
              <span className="w-6 text-white/40">{r.no}</span>
              <span className="w-20 text-white/60">{shortTime(r.at)}</span>
              <span className="flex-1 font-semibold">{formatMs(r.ms)}</span>
              {/* 실제 키보드가 아닌 입력이 섞인 판만 표시(막지는 않는다) */}
              {r.keyOrigin === "synthetic" && (
                <span
                  data-mini-source="synthetic"
                  className="rounded bg-amber-500/25 px-1 text-amber-200"
                >
                  다른 프로그램 입력
                </span>
              )}
              {r.inputs?.includes("swipe") && (
                <span
                  data-mini-source="swipe"
                  className="rounded bg-white/10 px-1 text-white/70"
                >
                  마우스·화면
                </span>
              )}
              <span className="text-white/60">{r.moves}수</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
