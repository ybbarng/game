"use client";

import { type CubeMove, formatMove, type StickerMask } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useEffect, useMemo, useRef, useState } from "react";

import { useSettings } from "@/game/settings";
import { type Cue, play } from "@/game/sound";
import { cn } from "@/lib/cn";

import { type StickerMarks, stickersFromState } from "../bridge";
import { type CubeSound, comboSound, comboStep } from "../game-sounds";
import {
  attachKeyboard,
  buttonMoves,
  type Command,
  type KeyChord,
  KeyInterpreter,
  type Keymap,
  type KeyResult,
  loadKeymap,
  moreButtonMoves,
} from "../input";
import {
  type CubeLook,
  isPlainLook,
  lookColors,
  lookPatterns,
} from "../item-look";
import {
  resetHandLayers,
  setHandLayers,
  usesHandLayers,
} from "../keys/hand-layers";
import {
  HOME_ORIENT,
  type Orient,
  orientAfter,
  orientFromCenters,
} from "../keys/key-colors";
import { stickerAtHit } from "../learn/interact";
import {
  type CubeSettings,
  updateSettings,
  useCubeSettings,
} from "../settings";
import { type CubeView, loadCubeView } from "../view";
import { CubePosterPair } from "./CubePosterPair";
import { type FlowSize, FlowStripView, useFlowStrip } from "./FlowStrip";
import { KeyGuide } from "./KeyGuide";
import { CubeLookContext } from "./PatternGlyph";
import { StageBox, useBackView } from "./StageBox";

/**
 * 큐브 한 판의 화면 조각(혼자 맞추기·블라인드·나중에 배우기·대결이 함께 쓴다).
 *
 * 엔진 상태가 기준이다. 키를 누르면 `onMove`가 엔진에 수를 넣고(그 순간이 시간 기준), 받아들였으면 이 조각이
 * 3D 장면에 같은 수를 넣어 따라 돌린다. 섞기·맞춘 상태로·가리기처럼 한꺼번에 바뀌면 부모가 `syncToken`을 바꿔
 * 장면을 엔진 상태로 다시 칠한다.
 *
 * 휴대폰은 큐브를 밀어서 돌린다: 칸 위를 밀면 그 칸이 든 층이, 빈 곳을 밀면 큐브 전체가 민 방향으로 돈다
 * (계산은 `view/swipe.ts`). 마우스 끌기는 보기만 돌리고, 키 배치 「사용자」에서 마우스 돌리기를 켠 사람만
 * 마우스로도 큐브 전체를 돌린다. 3D를 못 그리는 기기에는 밀기도 없다(아래 표기 단추로 돌린다).
 */

const DEFAULT_VIEW = { yaw: 32, pitch: 26 };
const PEEK: Record<"peekBack" | "peekDown", { yaw: number; pitch: number }> = {
  peekBack: { yaw: 212, pitch: 26 },
  peekDown: { yaw: 32, pitch: -55 },
};

export function playCubeCue(settings: CubeSettings, cue: Cue): void {
  if (settings.sound && useSettings.getState().sound) play(cue);
}

/** 횟수·단계가 있는 큐브 소리(`game-sounds.ts`가 고른 것). 설정의 소리 끄기를 따른다 */
export function playCubeSound(
  settings: CubeSettings,
  sound: CubeSound | null,
): void {
  if (!sound || !settings.sound || !useSettings.getState().sound) return;
  play(sound.cue, {
    times: sound.times ?? 1,
    ...(sound.step === undefined ? {} : { step: sound.step }),
  });
}

export interface CubePlayProps {
  n: number;
  state: PuzzleState;
  mask: StickerMask | null;
  /** 바뀌면 장면을 `state`·`mask`로 다시 칠한다 */
  syncToken: number;
  settings: CubeSettings;
  /** 수 하나. 받아들였으면 true(장면이 따라 돈다) */
  onMove: (move: CubeMove, notation: string) => boolean;
  /** 명령. 되돌리기는 장면에 넣을 수를 돌려준다 */
  onCommand: (command: Command) => CubeMove | null | undefined;
  /** 키를 받지 않는다(섞기 준비 중, 다시 보기 중) */
  locked?: boolean;
  /** 장면이 준비되면 받는다(다시 보기처럼 장면을 직접 움직일 때) */
  onView?: (view: CubeView | null) => void;
  /** 키 그림에서 밝힐 칠 키(배우기의 힌트·따라 하기). 키 그림은 그대로 접고 펼 수 있다 */
  want?: readonly KeyChord[] | null;
  /**
   * 칸 표시(스티커 정체마다, 배우기 놀이판의 따라가는 조각). 마스크처럼 `syncToken`이 바뀔 때 장면에 칠하고,
   * 그 뒤로는 조각을 따라 돈다
   */
  marks?: StickerMarks | null;
  /** 칸을 누르면(3D 누르기·3D를 못 그릴 때의 큐브 그림) 그 스티커 자리 번호를 준다. 없으면 누르기를 받지 않는다 */
  onSticker?: ((sticker: number) => void) | undefined;
  /** 세 축 화살표를 보인다(처음 안내의 x·y·z) */
  axes?: boolean;
  /** 단추 줄에 더할 수(따라 하기의 Rw·E·S·2R 등, 휴대폰에서도 칠 수 있게) */
  extraButtons?: readonly string[];
  /**
   * 수 흐름 띠(docs/51 1-1): 이 화면의 크기. 설정이 「작게」면 늘 작게, 「끔」이면 없다. 없으면 띠를 두지 않는다.
   * 데스크톱은 큐브 위 한 줄, 휴대폰은 큐브 위쪽 가장자리에 반투명 띠로 겹친다. `syncToken`이 바뀌면 비운다
   */
  flow?: FlowSize | undefined;
  /** 수 흐름 띠 끝에 흐름 콤보(docs/51 2-1)를 보인다(혼자 맞추기) */
  combo?: boolean;
  /**
   * 데스크톱(폭 640px 이상)에서 큐브 칸을 남은 화면 높이에 맞춘다(혼자 맞추기: 1280×720 노트북에서도 큐브와 거울 판이
   * 첫 화면에 다 들어오게). 칸 위 끝의 자리를 재어 `100dvh - 위 끝 - 여백`을 넘지 않게 한다. 휴대폰은 그대로
   */
  fitViewport?: boolean;
  /**
   * 아이템전 화면 방해(docs/47 9-7). 상태·수·판정은 그대로이고 이 화면에서만 그린다.
   * - `fog`(안개): 거울 판·키 그림을 끈다(3D 큐브는 보인다)
   * - `look`(색 뒤집기·흑백 화면): 3D 큐브·거울 판·큐브 그림·수 흐름 띠·키 그림을 한꺼번에 같은 색·무늬로
   * - `glow`(찾아 주기): 스티커 정체마다 빛낼 표시. 바뀌면 바로 장면에 칠한다(`marks`와 달리 `syncToken`을 기다리지 않는다)
   * - `mask`가 바뀌면(한 면 가리기) 그때 다시 칠한다
   */
  fog?: boolean;
  look?: CubeLook | null;
  glow?: StickerMarks | null;
}

export function CubePlay({
  n,
  state,
  mask,
  syncToken,
  settings,
  onMove,
  onCommand,
  locked = false,
  onView,
  want,
  marks,
  onSticker,
  axes = false,
  extraButtons,
  flow,
  combo = false,
  fitViewport = false,
  fog = false,
  look = null,
  glow = null,
}: CubePlayProps) {
  const swap = !!look?.swap;
  const gray = !!look?.gray;
  const lookNow = useMemo(() => ({ swap, gray }), [swap, gray]);
  const shownColors = useMemo(
    () => lookColors(settings.colors, lookNow),
    [settings.colors, lookNow],
  );
  const patterns = useMemo(() => lookPatterns(lookNow), [lookNow]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [keymap, setKeymap] = useState<Keymap | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [depth, setDepth] = useState<number | null>(null);
  /** 짝수 큐브의 들고 있는 방향(받은 수를 따라간다, 키 색의 기준). 홀수는 가운데 칸으로 읽는다 */
  const [evenOrient, setEvenOrient] = useState<Orient>(HOME_ORIENT);
  // 수·명령 처리(아래 moveRef·handleRef)는 한 번만 만들어 크기를 ref로 읽는다
  const nRef = useRef(n);
  nRef.current = n;
  const evenRef = useRef<Orient>(HOME_ORIENT);
  evenRef.current = evenOrient;
  const flowStrip = useFlowStrip(n);
  const flowRef = useRef(flowStrip);
  flowRef.current = flowStrip;
  const flowSize: FlowSize | null =
    !flow || settings.flowStrip === "off"
      ? null
      : settings.flowStrip === "small"
        ? "small"
        : flow;
  /** 큰 큐브의 층 수(csTimer의 3·4·7·8 키). 1·1이면 보이지 않는다 */
  const [layers, setLayers] = useState({ left: 1, right: 1 });
  const [prime, setPrime] = useState(false);
  const [moreButtons, setMoreButtons] = useState(false);
  // 휴대폰에서 단추 줄 대신 키보드 그림으로 치기(설정 그대로, 화면에서도 바꾼다). 부모가 바꿔 넘긴 설정이 아니라 저장된 설정을 본다
  const saved = useCubeSettings();
  const keysMode = saved.touchKeyboard;
  // 키 그림 접기·뒷면 숨기기도 저장해 새로 고쳐도 남는다(2026-11-05 점검)
  const showKeys = saved.keyGuideOpen;
  const showMirror = saved.backViewShown;

  // 바뀌는 값은 ref로 넘겨 키 연결을 한 번만 건다
  const live = useRef({
    state,
    mask,
    settings,
    onMove,
    onCommand,
    locked,
    onView,
    marks,
    onSticker,
    combo,
  });
  live.current = {
    state,
    mask,
    settings,
    onMove,
    onCommand,
    locked,
    onView,
    marks,
    onSticker,
    combo,
  };

  // 뒷면 보기: 거울이면 3D 장면에 판을 띄운다(「거울 숨기기」로 접는다)
  const back = useBackView(settings.backView, !failed);
  // 화면 높이에 맞추기: 큐브 칸 위 끝(문서 기준)을 잰다. 칸 크기는 위 끝을 바꾸지 않아 재기가 돌지 않는다
  const [stageTop, setStageTop] = useState<number | null>(null);
  useEffect(() => {
    if (!fitViewport) return;
    const measure = () => {
      const el = back.ref.current;
      if (!el) return;
      if (!window.matchMedia("(min-width: 640px)").matches) {
        setStageTop(null);
        return;
      }
      const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
      setStageTop((t) => (t !== null && Math.abs(t - top) < 2 ? t : top));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [fitViewport, back.ref]);
  // 안개(아이템전): 거울 판·키 그림을 끈다. 3D를 못 그리는 기기는 큐브 그림이 큐브라 그대로 둔다
  const mirror = back.mode === "mirror" && showMirror && !fog;
  const shownRef = useRef(shownColors);
  shownRef.current = shownColors;
  useEffect(() => {
    if (ready) viewRef.current?.setMirror(mirror);
  }, [mirror, ready]);

  useEffect(() => setKeymap(loadKeymap()), []);
  useEffect(() => {
    if (ready) viewRef.current?.setAxes(axes);
  }, [axes, ready]);
  // 마우스 돌리기(키 배치 「사용자」)는 배치를 읽은 뒤·장면을 만든 뒤에 알린다
  useEffect(() => {
    if (ready)
      viewRef.current?.setOptions({ swipeMouse: keymap?.mouseRotate ?? false });
  }, [keymap, ready]);
  const interpreter = useMemo(
    () => (keymap ? new KeyInterpreter(n, keymap) : null),
    [n, keymap],
  );
  const interpreterRef = useRef(interpreter);
  interpreterRef.current = interpreter;
  // 새 해석기(크기·배치가 바뀜)는 층 수 1·1에서 시작한다. 이 큐브가 사라지면 배우기 키캡도 1·1로
  useEffect(() => {
    if (!interpreter) return;
    setLayers(interpreter.layers);
    setHandLayers(interpreter.n, interpreter.layers);
    return () => resetHandLayers();
  }, [interpreter]);
  // 큰 큐브 「두 손」: 큐브 위에 손이 잡은 층(csTimer의 손 표시)
  const handMarks = !!keymap && usesHandLayers(keymap, n);
  useEffect(() => {
    if (ready) viewRef.current?.setHandMarks(handMarks ? layers : null);
  }, [ready, handMarks, layers]);

  // 장면: 크기·품질이 바뀌면 다시 만든다
  const quality = settings.quality;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    setReady(false);
    const ro = new ResizeObserver(() =>
      viewRef.current?.resize(canvas.clientWidth, canvas.clientHeight),
    );
    void loadCubeView()
      .then(({ CubeView }) => {
        if (disposed) return;
        const s = live.current.settings;
        const view = CubeView.create(canvas, {
          n,
          quality,
          colors: shownRef.current,
          stickerless: s.stickerless,
          moveMs: s.moveMs,
          hidden: s.hidden,
          onSwipe: (m) => {
            if (live.current.locked) return;
            moveRef.current(m, formatMove(n, m));
          },
          onTap: (hit) => {
            const pick = live.current.onSticker;
            if (!pick) return;
            const i = stickerAtHit(n, hit.center, hit.normal);
            if (i !== null) pick(i);
          },
        });
        view.setStickers(
          stickersFromState(
            n,
            live.current.state,
            live.current.mask,
            live.current.marks,
          ),
        );
        viewRef.current = view;
        ro.observe(canvas);
        setReady(true);
        live.current.onView?.(view);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      live.current.onView?.(null);
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [n, quality]);

  useEffect(() => {
    viewRef.current?.setOptions({
      colors: shownColors,
      stickerless: settings.stickerless,
      moveMs: settings.moveMs,
      hidden: settings.hidden,
    });
  }, [shownColors, settings.stickerless, settings.moveMs, settings.hidden]);

  // 흑백 화면의 무늬(장면이 준비된 뒤, 바뀔 때만)
  const patternsOn = useRef(false);
  useEffect(() => {
    if (!ready || (!patterns && !patternsOn.current)) return;
    patternsOn.current = !!patterns;
    viewRef.current?.setPatterns(patterns);
  }, [patterns, ready]);

  // 찾아 주기: 빛낼 조각(한 번이라도 켠 뒤로만 장면에 쓴다. 배우기의 `marks`를 건드리지 않게)
  const glowOn = useRef(false);
  useEffect(() => {
    if (!ready || (!glow && !glowOn.current)) return;
    glowOn.current = !!glow;
    viewRef.current?.setMarks(glow);
  }, [glow, ready]);

  // 한 면 가리기: 마스크가 바뀌면 그때 다시 칠한다(첫 칠하기는 아래 syncToken이 한다)
  const maskSeen = useRef(mask);
  useEffect(() => {
    if (maskSeen.current === mask) return;
    maskSeen.current = mask;
    viewRef.current?.setStickers(
      stickersFromState(n, live.current.state, mask, live.current.marks),
    );
    if (glowOn.current) viewRef.current?.setMarks(glowRef.current);
  }, [mask, n]);
  const glowRef = useRef(glow);
  glowRef.current = glow;

  // 한꺼번에 바뀐 상태로 다시 칠하기
  // biome-ignore lint/correctness/useExhaustiveDependencies: syncToken이 바뀔 때만 다시 칠한다
  useEffect(() => {
    setEvenOrient(HOME_ORIENT);
    flowRef.current.clear();
    viewRef.current?.setStickers(
      stickersFromState(
        n,
        live.current.state,
        live.current.mask,
        live.current.marks,
      ),
    );
    if (glowOn.current) viewRef.current?.setMarks(glowRef.current);
  }, [syncToken, n]);

  /** 수 하나를 엔진에 넣고, 받아들였으면 장면이 따라 돈다(키·단추·밀기가 함께 쓴다) */
  const moveRef = useRef((move: CubeMove, notation: string) => {
    const c = live.current;
    // 띠의 색은 수를 두기 전 들고 있는 방향으로 고른다(키 그림과 같은 기준)
    const before = orientFromCenters(nRef.current, c.state) ?? evenRef.current;
    if (!c.onMove(move, notation)) {
      playCubeCue(c.settings, "invalid");
      return;
    }
    viewRef.current?.enqueue(move);
    const pushed = flowRef.current.push(move, before);
    if (n % 2 === 0) setEvenOrient((o) => orientAfter(n, o, move));
    playCubeCue(c.settings, "cubeTurn");
    // 흐름 콤보가 단계를 넘으면 작은 "톡"(콤보를 보이는 화면만, docs/51 5절)
    if (c.combo)
      playCubeSound(
        c.settings,
        comboSound(comboStep(pushed.before, pushed.after)),
      );
  });

  /** 수·명령 하나를 처리한다(키보드와 화면 단추가 함께 쓴다) */
  const handleRef = useRef((r: KeyResult) => {
    const c = live.current;
    setDepth(interpreterRef.current?.pendingDepth ?? null);
    const it = interpreterRef.current;
    if (it) {
      setLayers(it.layers);
      setHandLayers(it.n, it.layers);
    }
    if (r.kind === "move") {
      moveRef.current(r.move, r.notation);
      return;
    }
    if (r.kind !== "command") return;
    if (r.command === "peekBack" || r.command === "peekDown") {
      const p = PEEK[r.command];
      viewRef.current?.setView(p.yaw, p.pitch);
      return;
    }
    const before = orientFromCenters(nRef.current, c.state) ?? evenRef.current;
    const m = c.onCommand(r.command);
    if (m) {
      const pushed = flowRef.current.push(m, before);
      if (n % 2 === 0) setEvenOrient((o) => orientAfter(n, o, m));
      viewRef.current?.enqueue(m);
      playCubeCue(c.settings, "cubeTurn");
      if (c.combo)
        playCubeSound(
          c.settings,
          comboSound(comboStep(pushed.before, pushed.after)),
        );
    }
  });

  useEffect(() => {
    const flash = (code: string) => {
      setLit(code);
      window.setTimeout(() => setLit((c) => (c === code ? null : c)), 160);
    };
    /** 살짝 보기를 일으킨 키(떼면 보기를 되돌린다) */
    let peekKey: string | null = null;
    const detach = attachKeyboard(
      window,
      () => {
        const it = interpreterRef.current;
        // 잠겨 있으면 아무 키도 먹지 않는 해석기를 넘긴다
        return it && !live.current.locked ? it : LOCKED;
      },
      (r, e) => {
        flash(e.code);
        // 살짝 보기는 누르는 동안만: 지금 배치에서 그 동작을 일으킨 키를 기억해 두고 떼면 되돌린다
        if (
          r.kind === "command" &&
          (r.command === "peekBack" || r.command === "peekDown")
        )
          peekKey = e.code;
        handleRef.current(r);
      },
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

  const tap = (base: string) => {
    if (locked || !interpreter) return;
    const r = interpreter.run(prime ? `${base}'` : base);
    if (r) handleRef.current(r);
  };

  const colors = shownColors;
  // 칸 너비는 안개 동안에도 그대로(거울 판이 꺼져도 큐브 크기가 흔들리지 않게)
  const wide = back.mode === "mirror" && showMirror;
  return (
    <div className="relative flex w-full flex-col items-center gap-3">
      {flowSize && (
        <FlowStripView
          strip={flowStrip.strip}
          size={flowSize}
          colors={colors}
          combo={combo}
          className="max-sm:absolute max-sm:inset-x-0 max-sm:top-0 max-sm:z-10 max-sm:mx-auto max-sm:rounded-b-lg max-sm:bg-neutral-900/55 max-sm:px-2"
        />
      )}
      {/* 입력 준비(data-input-ready)와 그림 준비(canvas의 data-cube-ready)는 따로 붙는다 */}
      <StageBox
        boxRef={back.ref}
        maxWidth={
          stageTop === null
            ? wide
              ? 600
              : 460
            : `min(${wide ? 600 : 460}px, max(280px, calc(100dvh - ${stageTop}px - 12px)))`
        }
        stage={
          <div
            data-cube-stage
            data-input-ready={interpreter && !locked ? "" : undefined}
            className="relative aspect-square w-full"
          >
            {failed ? (
              // 3D를 못 그리면 비스듬한 큐브 그림 둘(앞쪽 셋·뒤쪽 셋)이 큐브다. 휴대폰에서는 수 흐름 띠가 칸 위쪽에
              // 겹치니 그만큼 내린다
              <div
                data-cube-no3d
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-2 p-2",
                  flowSize && "max-sm:pt-12",
                )}
              >
                <CubePosterPair
                  n={n}
                  state={state}
                  mask={mask}
                  marks={glow ?? marks}
                  settings={settings}
                  look={lookNow}
                  onSticker={onSticker}
                  className="w-full"
                />
                <p className="text-center text-white/50 text-xs">
                  이 기기에서는 3D를 그릴 수 없어 그림으로 보여 드려요.
                </p>
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
            {(layers.left > 1 || layers.right > 1) && (
              <span
                data-cube-layers={`${layers.left}-${layers.right}`}
                className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 font-semibold text-xs"
              >
                층 수 <span className="text-sky-300">왼손 {layers.left}</span> ·{" "}
                <span className="text-amber-300">오른손 {layers.right}</span>
              </span>
            )}
            {depth !== null && (
              <span className="absolute top-2 right-2 rounded bg-amber-400/90 px-2 py-0.5 font-semibold text-black text-xs">
                다음 수 깊이 {depth}
              </span>
            )}
          </div>
        }
      />

      {/* 휴대폰·마우스용 표기 단추 줄(휴대폰에서 키보드로 치면 숨긴다) */}
      <div
        className={`${keysMode ? "hidden sm:flex" : "flex"} flex-wrap justify-center gap-1`}
        data-cube-buttons
      >
        {[
          ...buttonMoves(n),
          ...(extraButtons ?? []).filter((b) => !buttonMoves(n).includes(b)),
          ...(moreButtons
            ? moreButtonMoves(n).filter((b) => !extraButtons?.includes(b))
            : []),
        ].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => tap(m)}
            className="h-11 w-11 rounded-lg bg-white/10 font-semibold text-sm hover:bg-white/20 active:bg-white/30 sm:h-9 sm:w-9"
          >
            {m}
            {prime ? "'" : ""}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={prime}
          onClick={() => setPrime((p) => !p)}
          className={`h-11 rounded-lg px-2 text-sm sm:h-9 ${prime ? "bg-amber-400 text-black" : "bg-white/10"}`}
        >
          ′ 반대
        </button>
        {moreButtonMoves(n).some((b) => !extraButtons?.includes(b)) && (
          <button
            type="button"
            data-cube-more-buttons
            aria-expanded={moreButtons}
            onClick={() => setMoreButtons((v) => !v)}
            className="h-11 rounded-lg bg-white/10 px-2 text-sm sm:h-9"
          >
            {moreButtons ? "접기" : `${moreButtonMoves(n).join("·")} 더 보기`}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (!locked)
              handleRef.current({
                kind: "command",
                action: "undo",
                command: "undo",
              });
          }}
          className="h-11 rounded-lg bg-white/10 px-2 text-sm sm:h-9"
        >
          되돌리기
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-x-3 text-white/60 text-xs">
        <button
          type="button"
          onClick={() =>
            updateSettings({ ...saved, keyGuideOpen: !saved.keyGuideOpen })
          }
          aria-expanded={showKeys}
          className="hidden min-h-8 items-center px-1 underline-offset-2 hover:underline sm:inline-flex"
        >
          {showKeys ? "키 그림 접기" : "키 그림 펴기"}
        </button>
        <button
          type="button"
          onClick={() =>
            updateSettings({ ...saved, touchKeyboard: !saved.touchKeyboard })
          }
          aria-pressed={keysMode}
          data-cube-input-toggle={keysMode ? "keys" : "buttons"}
          className="inline-flex min-h-8 items-center px-1 underline-offset-2 hover:underline sm:hidden"
        >
          {keysMode ? "단추로 치기" : "키보드로 치기"}
        </button>
        {back.mode === "mirror" && (
          <button
            type="button"
            onClick={() =>
              updateSettings({
                ...saved,
                backViewShown: !saved.backViewShown,
              })
            }
            aria-pressed={showMirror}
            data-back-toggle={back.mode}
            className="inline-flex min-h-8 items-center px-1 underline-offset-2 hover:underline"
          >
            {showMirror ? "거울 숨기기" : "거울 보기"}
          </button>
        )}
        <a
          href="/cube/keys"
          className="hidden min-h-8 items-center px-1 underline-offset-2 hover:underline sm:inline-flex"
        >
          단축키 표
        </a>
        <a
          href="/cube/settings"
          className="inline-flex min-h-8 items-center px-1 underline-offset-2 hover:underline"
        >
          키·색 설정
        </a>
      </div>
      {/* 키 그림: 데스크톱은 펴고 접기, 휴대폰은 키보드로 칠 때만. 칸을 누르면 그 키를 친 것과 같다 */}
      {/* 안개면 거의 투명하게(휴대폰에서 키 그림으로 치는 사람도 계속 칠 수 있게 자리와 누르기는 둔다) */}
      {keymap && (
        <div
          data-cube-keys-wrap
          data-cube-fogged={fog ? "" : undefined}
          className={`w-full max-w-2xl transition-opacity ${fog ? "opacity-[0.06]" : ""} ${keysMode ? "block" : "hidden"} ${showKeys ? "sm:block" : "sm:hidden"}`}
        >
          <CubeLookContext.Provider
            value={isPlainLook(lookNow) ? null : lookNow}
          >
            <KeyGuide
              n={n}
              keymap={keymap}
              lit={lit}
              want={want}
              orient={orientFromCenters(n, state) ?? evenOrient}
              layers={handMarks ? layers : null}
              pressable
            />
          </CubeLookContext.Provider>
        </div>
      )}
    </div>
  );
}

/** 잠겨 있을 때 쓰는 해석기: 어떤 키도 먹지 않는다 */
const LOCKED = {
  handle: () => null,
} as unknown as KeyInterpreter;
