"use client";

import { type CubeMove, isSolved } from "@game/cube-engine";
import type { ScrambleEvent } from "@game/cube-scramble";
import { realClock } from "@game/fair-play";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { stickersFromState } from "../bridge";
import { playCubeCue, playCubeSound } from "../components/CubePlay";
import { CubePosterPair } from "../components/CubePosterPair";
import { soloSound } from "../game-sounds";
import { HeroLoop, heroMoveMs, SOLVED_LABEL } from "../hero/loop";
import { heroRotation, isHeroSize, solveForHero } from "../hero/methods";
import {
  attachKeyboard,
  KeyInterpreter as Interpreter,
  type KeyInterpreter,
  type KeyResult,
  loadKeymap,
} from "../input";
import { formatMs, type SolveRecord } from "../records";
import { useCubeSettings } from "../settings";
import { SolveSession } from "../solve-session";
import { useReducedMotion } from "../use-reduced-motion";
import { useRenewable } from "../use-renewable";
import { type CubeView, loadCubeView } from "../view";
import { heroSolveInWorker, scrambleInWorker, warmUpScramble } from "../worker";
import { type FromApp, hasApp, onAppMessage, toApp } from "./app-bridge";
import { FocusClock } from "./focus-clock";
import { IDLE_TIMING, IdleShow, jigglePlan, playMoves } from "./idle";
import {
  addMiniRecord,
  loadMiniPrefs,
  loadMiniRecords,
  MINI_SIZES,
  type MiniPrefs,
  saveMiniPrefs,
  summarize,
} from "./store";

/**
 * 미니 모드(`/cube/mini`, docs/47 14절): 맥 앱 Cubie의 작은 창(기본 약 320×380, 120×120까지 줄임)에 맞춘 혼자 맞추기.
 *
 * - 화면에는 큐브와 거울만 둔다. 시간·단추·글은 보이지 않는다(사용자 「시간도 화면에 떠 있으면 어지러우니까」).
 *   섞기·거울·크기·기록은 앱 메뉴(브라우저에서는 구석의 작은 메뉴)에서 고른다.
 * - 키는 사이트의 키 배치(두 손·표기·사용자) 그대로다. 섞기는 배치의 「다시 섞기」 키(두 배치 모두 Enter), 되돌리기는
 *   ⌫. 배치의 Esc(맞춘 상태로)는 쓰지 않는다: 앱에서 Esc는 이전 앱으로 돌아가는 키이고, 실수로 진행을 버리지 않게.
 * - 시간은 포커스가 있는 동안만 잰다(`FocusClock`). 섞은 뒤 첫 면 돌리기부터 맞출 때까지, 살펴보기는 없다.
 * - 포커스가 없으면 이따금 움직인다(`idle.ts`): 맞춘 큐브는 첫 화면 연출 한 판, 섞인 큐브는 조금 섞고 되돌리기.
 *   움직임은 장면에만 넣고 엔진 상태(진행)는 그대로다.
 */

/** 이보다 좁으면(창의 짧은 변, CSS px) 거울을 저절로 접고 큐브만 크게 보인다 */
export const MINI_MIRROR_MIN = 200;

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

export function MiniCubeApp() {
  const settings = useCubeSettings();
  const reduced = useReducedMotion();
  const [prefs, setPrefsState] = useState<MiniPrefs | null>(null);
  useEffect(() => setPrefsState(loadMiniPrefs()), []);
  const n = prefs?.n ?? 3;
  const setPrefs = useCallback((next: MiniPrefs) => {
    setPrefsState(next);
    saveMiniPrefs(next);
  }, []);

  const app = useMemo(() => hasApp(), []);
  // 앱 안이면 앱이 알려 줄 때까지 포커스 없음·보임으로 둔다. 브라우저는 창의 포커스를 본다
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordsN, setRecordsN] = useState(n);
  const [records, setRecords] = useState<SolveRecord[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, bumpState] = useState(0);
  const bump = useCallback(() => bumpState((v) => v + 1), []);

  const clock = useMemo(() => new FocusClock(realClock, false), []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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
          const list = addMiniRecord(r);
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
    size === null || Math.min(size.w, size.h) >= MINI_MIRROR_MIN;
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
          onSwipe: (m) => moveRef.current(m, ""),
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
        },
        started: () => bump(),
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

  /** 수 하나: 엔진에 넣고 장면이 따라 돈다(키·밀기) */
  const moveRef = useRef((move: CubeMove, notation: string) => {
    idleRef.current.setActive(false);
    const s = sessionRef.current;
    if (s.input(move, notation) !== "applied") return;
    viewRef.current?.enqueue(move);
    playCubeCue(settingsRef.current, "cubeTurn");
  });
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
    const handle = (r: KeyResult, e: KeyboardEvent) => {
      if (r.kind === "move") {
        moveRef.current(r.move, r.notation);
        return;
      }
      if (r.kind !== "command") return;
      if (r.command === "undo") {
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
    };
  }, []);

  // 포커스: 앱이면 앱이 알린다. 브라우저면 창의 포커스·보임
  useEffect(() => {
    if (app) return;
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
      className="fixed inset-0 select-none overflow-hidden bg-neutral-950 text-white"
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
  records: readonly SolveRecord[];
  onSize: (n: number) => void;
  onClose: () => void;
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
        <button
          type="button"
          onClick={onClose}
          data-mini-records-close
          className="rounded px-1.5 py-0.5 hover:bg-white/10"
        >
          닫기
        </button>
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
              <span className="text-white/60">{r.moves}수</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
