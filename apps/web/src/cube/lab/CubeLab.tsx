"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  attachKeyboard,
  codeLabel,
  KeyInterpreter,
  type Keymap,
  type KeyResult,
  loadKeymap,
  PRESET_LABEL,
  presetKeymap,
  resolveAction,
  saveKeymap,
} from "@/cube/input";
import { actionLabel, isAvailable } from "@/cube/input/actions";
import type { CubeView } from "@/cube/view";
import {
  type CubeMove,
  loadCubeView,
  MAX_CUBE_SIZE,
  MIN_CUBE_SIZE,
  type Quality,
  solvedStickers,
} from "@/cube/view";

/**
 * 큐브 그리기·조작 시험 화면(숨은 주소 /cube/lab, docs/47 12절 C2). 엔진 없이 그리기만 한다:
 * 맞춘 상태에서 키로 돌린 회전만 장면이 따라간다.
 */

const SIZES = Array.from(
  { length: MAX_CUBE_SIZE - MIN_CUBE_SIZE + 1 },
  (_, i) => MIN_CUBE_SIZE + i,
);
const QUALITIES: { id: Quality; label: string }[] = [
  { id: "high", label: "높음" },
  { id: "medium", label: "보통" },
  { id: "low", label: "낮음" },
];
const KEY_ROWS = [
  ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7"],
  [
    "KeyQ",
    "KeyW",
    "KeyE",
    "KeyR",
    "KeyT",
    "KeyY",
    "KeyU",
    "KeyI",
    "KeyO",
    "KeyP",
  ],
  [
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyF",
    "KeyG",
    "KeyH",
    "KeyJ",
    "KeyK",
    "KeyL",
    "Semicolon",
  ],
  [
    "KeyZ",
    "KeyX",
    "KeyC",
    "KeyV",
    "KeyB",
    "KeyN",
    "KeyM",
    "Comma",
    "Period",
    "Slash",
  ],
];

const inverse = (m: CubeMove): CubeMove => ({
  ...m,
  turns: (4 - m.turns) as 1 | 2 | 3,
});

/** 시험 화면용 무작위 섞기(같은 축이 이어지지 않게). 대회 섞기는 cube-scramble이 맡는다 */
function randomMoves(n: number, count: number): CubeMove[] {
  const axes = ["x", "y", "z"] as const;
  const out: CubeMove[] = [];
  let last = "";
  while (out.length < count) {
    const axis = axes[Math.floor(Math.random() * 3)] ?? "x";
    if (axis === last) continue;
    last = axis;
    const layer = 1 + Math.floor(Math.random() * n);
    const turns = (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
    out.push({ axis, from: layer, to: layer, turns });
  }
  return out;
}

export function CubeLab() {
  const [n, setN] = useState(3);
  const [quality, setQuality] = useState<Quality>("high");
  const [stickerless, setStickerless] = useState(false);
  const [moveMs, setMoveMs] = useState(90);
  const [keymap, setKeymap] = useState<Keymap>(() => presetKeymap("twoHand"));
  /** 키로 보낸 회전 수(되돌리기·섞기 포함). 3D 그림이 없어도 센다 */
  const [moves, setMoves] = useState(0);
  /** 장면이 회전을 끝낸 수 */
  const [drawn, setDrawn] = useState(0);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [inputReady, setInputReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [last, setLast] = useState("");
  const [depth, setDepth] = useState<number | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  /** 되돌리기에 쓰는 수 */
  const historyRef = useRef<CubeMove[]>([]);
  /** 맞춘 상태에서 지금까지 장면에 보낸 회전. 3D가 늦게 뜨면 이것을 바로 적용해 따라잡는다 */
  const sceneRef = useRef<CubeMove[]>([]);
  const optionsRef = useRef({ stickerless, moveMs });
  optionsRef.current = { stickerless, moveMs };

  const interpreter = useMemo(() => new KeyInterpreter(n, keymap), [n, keymap]);
  const interpreterRef = useRef(interpreter);
  interpreterRef.current = interpreter;

  // 저장해 둔 배치(첫 그리기 뒤에 읽는다)
  useEffect(() => setKeymap(loadKeymap()), []);

  // 장면: 크기·품질이 바뀌면 새 캔버스로 다시 만든다.
  // WebGL을 못 만들거나(예외) 문맥을 잃으면 안내로 바꾼다. 키 입력과 수 세기는 장면과 따로 돈다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    setMoves(0);
    setDrawn(0);
    setFailed(false);
    historyRef.current = [];
    sceneRef.current = [];
    const ro = new ResizeObserver(() =>
      viewRef.current?.resize(canvas.clientWidth, canvas.clientHeight),
    );
    const drop = () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      ro.disconnect();
      viewRef.current?.dispose();
      viewRef.current = null;
    };
    const onLost = () => {
      drop();
      setReadyFor(null);
      setFailed(true);
    };
    void loadCubeView()
      .then(({ CubeView }) => {
        if (disposed) return;
        const view = CubeView.create(canvas, {
          n,
          quality,
          ...optionsRef.current,
          onMoveDone: setDrawn,
        });
        viewRef.current = view;
        canvas.addEventListener("webglcontextlost", onLost);
        ro.observe(canvas);
        // 그림이 뜨기 전에 친 수를 따라잡는다
        for (const m of sceneRef.current) view.enqueue(m);
        view.flush();
        setReadyFor(`${n}-${quality}`);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      drop();
    };
  }, [n, quality]);

  useEffect(() => {
    viewRef.current?.setOptions({ stickerless, moveMs });
  }, [stickerless, moveMs]);

  useEffect(() => {
    const flash = (code: string) => {
      setLit(code);
      window.setTimeout(() => setLit((c) => (c === code ? null : c)), 160);
    };
    /** 회전을 세고 장면에 보낸다(장면이 아직 없거나 못 그리면 세기만) */
    const send = (ms: CubeMove[]) => {
      sceneRef.current.push(...ms);
      setMoves((c) => c + ms.length);
      const view = viewRef.current;
      if (view) for (const m of ms) view.enqueue(m);
    };
    const restart = () => {
      const size = interpreterRef.current.n;
      historyRef.current = [];
      sceneRef.current = [];
      viewRef.current?.setStickers(solvedStickers(size));
      return size;
    };
    const onResult = (r: KeyResult, e: KeyboardEvent) => {
      flash(e.code);
      setDepth(interpreterRef.current.pendingDepth);
      if (r.kind === "move") {
        send([r.move]);
        historyRef.current.push(r.move);
        setLast(r.notation);
        return;
      }
      if (r.kind !== "command") return;
      if (r.command === "undo") {
        const m = historyRef.current.pop();
        if (m) {
          send([inverse(m)]);
          setLast("되돌리기");
        }
      } else if (r.command === "reset") {
        restart();
        setLast("맞춘 상태로");
      } else if (r.command === "scramble") {
        const size = restart();
        send(randomMoves(size, size * 7));
        viewRef.current?.flush();
        setLast("다시 섞기");
      }
    };
    const detach = attachKeyboard(
      window,
      () => interpreterRef.current,
      onResult,
    );
    setInputReady(true);
    return detach;
  }, []);

  const choosePreset = (preset: "twoHand" | "notation") => {
    const km = presetKeymap(preset);
    setKeymap(km);
    saveKeymap(km);
  };

  const keyCell = (code: string) => {
    const plain = resolveAction(keymap, key(code));
    const shift = resolveAction(keymap, key(code, true));
    const usable = (a: string | null) => a !== null && isAvailable(n, a);
    return (
      <div
        key={code}
        data-key={code}
        className={`flex h-11 min-w-0 flex-1 flex-col items-center justify-center rounded border text-[10px] leading-tight transition-colors ${
          lit === code
            ? "border-amber-300 bg-amber-300/30"
            : "border-white/15 bg-white/5"
        }`}
      >
        <span className="text-white/40">{codeLabel(code)}</span>
        <span className="font-semibold text-xs">
          {usable(plain) && plain ? actionLabel(plain) : ""}
        </span>
        <span className="text-white/50">
          {usable(shift) && shift ? actionLabel(shift) : ""}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-dvh bg-neutral-900">
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5 text-white">
        <h1 className="font-bold text-xl">큐브 그리기 시험</h1>
        <p className="break-keep text-sm text-white/70">
          키를 치면 큐브가 돕니다(엔진 없이 그리기만). 큐브를 끌면 보는 각만
          바뀌고, 놓으면 제자리로 돌아옵니다.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            크기
            <select
              data-cube-size
              value={n}
              onChange={(e) => {
                setN(Number(e.target.value));
                e.target.blur();
              }}
              className="rounded bg-white/10 px-2 py-1"
            >
              {SIZES.map((s) => (
                <option key={s} value={s} className="bg-neutral-800">
                  {s}×{s}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">품질</legend>
            품질
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setQuality(q.id)}
                aria-pressed={quality === q.id}
                className={`rounded px-2 py-1 ${quality === q.id ? "bg-white/25" : "bg-white/5"}`}
              >
                {q.label}
              </button>
            ))}
          </fieldset>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={stickerless}
              onChange={(e) => setStickerless(e.target.checked)}
            />
            스티커 없는 모양
          </label>
          <label className="flex items-center gap-1">
            회전 {moveMs}ms
            <input
              type="range"
              min={0}
              max={200}
              step={10}
              value={moveMs}
              onChange={(e) => setMoveMs(Number(e.target.value))}
            />
          </label>
        </div>

        {/* 입력 준비(data-input-ready)와 그림 준비(canvas의 data-cube-ready)는 따로 붙는다 */}
        <div
          data-cube-stage
          data-input-ready={inputReady ? "" : undefined}
          data-cube-moves={moves}
          className="relative aspect-square w-full max-w-[560px] self-center"
        >
          {failed && (
            <p
              data-cube-no3d
              className="flex h-full items-center justify-center break-keep rounded border border-white/15 px-6 text-center text-sm text-white/70"
            >
              이 기기에서는 3D 큐브를 그릴 수 없습니다. 키는 그대로 받고 돌린
              수를 셉니다.
            </p>
          )}
          <canvas
            key={`${n}-${quality}`}
            ref={canvasRef}
            hidden={failed}
            data-cube-canvas
            data-cube-ready={
              !failed && readyFor === `${n}-${quality}` ? "" : undefined
            }
            data-cube-drawn={drawn}
            className="h-full w-full cursor-grab active:cursor-grabbing"
          />
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            돌린 수 <b data-cube-done>{moves}</b>
          </span>
          <span>
            마지막 <b>{last || "-"}</b>
          </span>
          {depth !== null && <span>다음 수 깊이 {depth}</span>}
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            배치
            {(["twoHand", "notation"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => choosePreset(p)}
                aria-pressed={keymap.preset === p}
                className={`rounded px-2 py-1 ${keymap.preset === p ? "bg-white/25" : "bg-white/5"}`}
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
            {keymap.preset === "custom" && <span>{PRESET_LABEL.custom}</span>}
          </div>
          <div className="flex flex-col gap-1" data-cube-keys>
            {KEY_ROWS.map((row, i) => (
              <div
                key={row[0]}
                className="flex gap-1"
                style={{ paddingLeft: `${i * 2}%` }}
              >
                {row.map(keyCell)}
              </div>
            ))}
          </div>
          <p className="break-keep text-white/50 text-xs">
            칸의 굵은 글은 그냥 칠 때, 아래 흐린 글은 Shift와 함께 칠 때.
            {keymap.preset === "notation"
              ? " Alt를 함께 치면 넓게(w) 돕니다."
              : " Alt+면 키는 넓게(w)."}{" "}
            ⌫ 되돌리기 · Esc 맞춘 상태로 · Enter 섞기.
          </p>
        </section>
      </main>
    </div>
  );
}

function key(code: string, shift = false) {
  return {
    code,
    shiftKey: shift,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
  };
}
