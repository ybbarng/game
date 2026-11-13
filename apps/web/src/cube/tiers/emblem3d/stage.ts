import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type { ViewTurnTarget } from "@/cube/components/ViewHome";

import { levelOf } from "../emblemArt";
import type { GemStyle } from "./gemStyle";
import { POSTER_PAGE } from "./poster";
import { MotionQuality, REST_MS } from "./quality";
import {
  buildEmblemScene,
  type DraftTier,
  type EmblemScene,
  isGem,
  LOOK,
  styleFor,
  type Three,
} from "./scene";
import {
  coast,
  dragSpin,
  FRONT,
  flingSpeed,
  HOME_MS,
  homeSpin,
  isTurned,
  type Spin,
  wrapYaw,
} from "./spin";
import { canHdrCanvas, type DrawPath } from "./support";

/** 이 페이지에서 배운 돌릴 때 해상도 단계(티어를 바꿔 새 무대를 만들어도 이어 쓴다) */
let learnedLevel = 0;

/**
 * 3D 엠블럼 시안의 무대(docs/47 14-7): 캔버스 하나에 엠블럼 하나를 그리고, 끌어 돌리기를 받는다.
 *
 * - 움직일 때만 그린다: 끄는 중, 놓은 뒤 짧은 미끄러짐, 「처음 각도로」 돌아가는 중. 가만히 있으면 한 장도 그리지
 *   않는다(`data-emblem3d-frames`가 늘지 않는다). 화면 밖이면 그리기를 미뤘다가 다시 보일 때 한 장 그린다.
 * - 보석은 HDR 캔버스(WebGPU)를 먼저 시도하고, 안 되면 WebGL에 번짐(bloom)으로 그린다. 금속은 WebGL에 번짐 없이.
 * - `onViewTurn`·`resetView`는 큐브 화면의 「처음 각도로」 단추(`ViewHome`)가 그대로 붙는 꼴이다.
 */

/** 미리보기 바탕(neutral-900)과 같은 색: 배경판 가장자리가 페이지에 녹아든다 */
export const PAGE_COLOR = POSTER_PAGE.dark;

/**
 * 번짐 값(SDR 보석): 세기, 반지름, 밝기 문턱(톤 매핑 전 선형 값). 반짝이는 점에만 작게 걸리게 문턱을 높이고 반지름을
 * 줄였다(예전 0.55·0.35·1.25는 보석 전체를 뿌옇게 해 얼음처럼 보였다).
 */
export const BLOOM = { strength: 0.4, radius: 0.12, threshold: 3 } as const;

interface Painter {
  path: DrawPath;
  built: EmblemScene;
  draw(): void;
  /** 그리는 해상도 배율(캔버스 화면 크기는 그대로, 버퍼만 바뀐다) */
  setScale(s: number): void;
  /** 지금까지 보낸 그리기를 GPU가 다 끝내면 풀린다(돌릴 때 해상도 조절이 잰다) */
  gpuDone(): Promise<void>;
  dispose(): void;
}

/**
 * WebGL 무대. 셰이더는 `compileAsync`로 먼저 짓는다: 보석 셰이더가 길어 그리면서 지으면 주 스레드가 수백 ms 멈췄다
 * (티어를 바꿀 때마다, 2026-11-12 잰 값 200~340ms).
 */
async function webglPainter(
  canvas: HTMLCanvasElement,
  tier: DraftTier,
  px: number,
  bloom: boolean,
  pageColor: string,
  gemStyle: GemStyle | null,
): Promise<Painter> {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(px, px, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(pageColor, 1);
  const built = buildEmblemScene(THREE, tier, {
    backdrop: true,
    pageColor,
    hdr: false,
    gemStyle,
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(built.studio, 0.02).texture;
  pmrem.dispose();
  built.applyEnvironment(env);

  let composer: EffectComposer | null = null;
  if (bloom) {
    const target = new THREE.WebGLRenderTarget(px, px, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(1);
    composer.setSize(px, px);
    composer.addPass(new RenderPass(built.scene, built.camera));
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(px, px),
        built.bloom.strength,
        built.bloom.radius,
        built.bloom.threshold,
      ),
    );
    composer.addPass(new OutputPass());
  }
  // 셰이더 프로그램은 그릴 대상(화면이냐 번짐용 버퍼냐)에 따라 달라 실제로 그릴 대상에 맞춰 짓는다
  built.update();
  renderer.setRenderTarget(composer ? composer.readBuffer : null);
  try {
    await renderer.compileAsync(built.scene, built.camera);
  } finally {
    renderer.setRenderTarget(null);
  }
  return {
    path: bloom ? "bloom" : "plain",
    built,
    draw() {
      built.update();
      if (composer) composer.render();
      else renderer.render(built.scene, built.camera);
    },
    setScale(s) {
      renderer.setPixelRatio(s);
      renderer.setSize(px, px, false);
      if (composer) {
        composer.setPixelRatio(s);
        composer.setSize(px, px);
      }
    },
    gpuDone() {
      // 펜스를 걸고 기다리지 않고 짧게 들여다본다(WebGL은 시간 제한 0만 허용, 상태는 작업 사이에 바뀐다)
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) return Promise.resolve();
      gl.flush();
      return new Promise<void>((resolve) => {
        const check = () => {
          const r = gl.clientWaitSync(sync, 0, 0);
          if (r === gl.TIMEOUT_EXPIRED) {
            setTimeout(check, 1);
            return;
          }
          gl.deleteSync(sync);
          resolve();
        };
        setTimeout(check, 0);
      });
    },
    dispose() {
      composer?.dispose();
      env.dispose();
      built.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

interface GpuCtx {
  configure(c: Record<string, unknown>): void;
}

/**
 * HDR 캔버스: three WebGPURenderer(이 판의 webgpu 묶음)를 쓰되 캔버스 형식을 rgba16float로, 톤 매핑을 extended로
 * 바꿔 설정한다(r169는 이 설정을 열어 두지 않아 백엔드의 캔버스 형식 함수와 context.configure를 감싼다). 톤 매핑을
 * 끄면 1.0을 넘는 빛(점 조명 반사, 우물 빛)이 그대로 HDR 화면에 나간다. WebGPU가 아니면(WebGL 대신 길) 실패로 본다.
 */
async function hdrPainter(
  canvas: HTMLCanvasElement,
  tier: DraftTier,
  px: number,
  pageColor: string,
): Promise<Painter> {
  const W = await import("three/webgpu");
  const ctx = canvas.getContext("webgpu" as "2d") as unknown as GpuCtx | null;
  if (!ctx) throw new Error("WebGPU 캔버스 없음");
  const configure = ctx.configure.bind(ctx);
  ctx.configure = (c) =>
    configure({
      ...c,
      format: "rgba16float",
      toneMapping: { mode: "extended" },
    });
  const renderer = new W.WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
    context: ctx,
  } as unknown as ConstructorParameters<typeof W.WebGPURenderer>[0]);
  const backend = renderer.backend as unknown as {
    isWebGPUBackend?: boolean;
    utils?: { getPreferredCanvasFormat(): string };
  };
  if (backend.utils)
    backend.utils.getPreferredCanvasFormat = () => "rgba16float";
  await renderer.init();
  if (!backend.isWebGPUBackend) {
    renderer.dispose();
    throw new Error("WebGPU 백엔드가 아님");
  }
  renderer.setPixelRatio(1);
  renderer.setSize(px, px, false);
  renderer.toneMapping = W.NoToneMapping;
  renderer.setClearColor(new W.Color(pageColor), 1);
  const T = W as unknown as Three;
  const built = buildEmblemScene(T, tier, {
    backdrop: true,
    pageColor,
    hdr: true,
  });
  const pmrem = new W.PMREMGenerator(renderer);
  const env = pmrem.fromScene(built.studio as never, 0.02).texture;
  built.applyEnvironment(env as unknown as THREE.Texture);
  built.update();
  // r169 WebGPURenderer의 compileAsync는 이 장면에서 끝나지 않아(헤드리스 크롬, 2026-11-12) 쓰지 않는다
  return {
    path: "hdr",
    built,
    draw() {
      built.update();
      renderer.render(built.scene as never, built.camera as never);
    },
    setScale(s) {
      renderer.setPixelRatio(s);
      renderer.setSize(px, px, false);
    },
    gpuDone() {
      const device = (
        renderer.backend as unknown as {
          device?: { queue: { onSubmittedWorkDone(): Promise<void> } };
        }
      ).device;
      return device ? device.queue.onSubmittedWorkDone() : Promise.resolve();
    },
    dispose() {
      (pmrem as unknown as { dispose?: () => void }).dispose?.();
      env.dispose();
      built.dispose();
      renderer.dispose();
    },
  };
}

function reducedMotion(): boolean {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export interface StageOptions {
  tier: DraftTier;
  /** 칸 한 변(CSS px) */
  size: number;
  /** 길을 고정해 볼 때(`?emblem3d=`) */
  force?: DrawPath | null;
  /** 페이지 바탕색(배경판 가장자리가 녹아든다). 기본 `PAGE_COLOR` */
  pageColor?: string | undefined;
  /** 에메랄드 시안(`?gem=`). 고르면 시안끼리 같은 길로 견주도록 WebGL 길로 그린다 */
  gemStyle?: GemStyle | null | undefined;
}

/** 자동 회전 빠르기(라디안/ms, 8초에 한 바퀴) */
export const AUTO_SPIN = (Math.PI * 2) / 8000;

export class EmblemStage implements ViewTurnTarget {
  readonly path: DrawPath;
  readonly canvas: HTMLCanvasElement;
  private spin: Spin = { ...FRONT };
  private speed = 0;
  private homing: { from: Spin; start: number } | null = null;
  private drag: {
    id: number;
    x0: number;
    y0: number;
    start: Spin;
    samples: { t: number; yaw: number }[];
  } | null = null;
  private raf = 0;
  private last = 0;
  private visible = true;
  private pending = false;
  private frames = 0;
  private turnedSeen = false;
  private readonly listeners = new Set<(turned: boolean) => void>();
  private readonly io: IntersectionObserver | null;
  private disposed = false;
  private dirty = true;
  private lastMoveAt = 0;
  private timing = false;
  private scale = 1;
  private readonly quality = new MotionQuality(learnedLevel);
  private auto = false;
  private wasMoving = false;
  private shown: (() => void) | null = null;
  /**
   * 첫 장이 화면에 나가면 풀린다. 그때까지 대기 그림(미리 찍은 3D 그림)을 캔버스 위에 덮어 둬서, 빈 캔버스가 한 장도
   * 보이지 않게 한다(docs/47 14-7 「다섯째 시안」)
   */
  readonly firstFrame = new Promise<void>((resolve) => {
    this.shown = resolve;
  });

  private constructor(
    private readonly host: HTMLElement,
    private readonly painter: Painter,
    private readonly size: number,
  ) {
    this.path = painter.path;
    this.canvas = host.querySelector("canvas") as HTMLCanvasElement;
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    this.io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            for (const e of entries) this.visible = e.isIntersecting;
            if (this.visible && this.pending) this.invalidate();
          });
    this.io?.observe(c);
    this.apply();
    this.invalidate();
  }

  /**
   * 무대를 만든다. `host` 안에 캔버스를 새로 넣는다(HDR 시도가 실패하면 그 캔버스는 WebGPU에 묶여 WebGL을 못 얻으니
   * 버리고 새 캔버스로 다시 만든다).
   */
  static async create(
    host: HTMLElement,
    opt: StageOptions,
  ): Promise<EmblemStage> {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(opt.size * dpr);
    const fresh = () => {
      for (const old of host.querySelectorAll("canvas")) old.remove();
      const c = document.createElement("canvas");
      c.width = px;
      c.height = px;
      c.style.width = `${opt.size}px`;
      c.style.height = `${opt.size}px`;
      c.style.touchAction = "pan-y";
      c.style.cursor = "grab";
      c.className = "block rounded-2xl";
      host.prepend(c);
      return c;
    };
    const page = opt.pageColor ?? PAGE_COLOR;
    const gem = isGem(opt.tier);
    const style = styleFor(opt.tier, opt.gemStyle);
    let painter: Painter | null = null;
    if (gem && opt.force !== "bloom" && !style) {
      const want = opt.force === "hdr" || (await canHdrCanvas());
      if (want) {
        try {
          painter = await hdrPainter(fresh(), opt.tier, px, page);
        } catch {
          painter = null;
        }
      }
    }
    painter ??= await webglPainter(fresh(), opt.tier, px, gem, page, style);
    return new EmblemStage(host, painter, opt.size);
  }

  // ---------------------------------------------------------------- 보기

  /** 지금 각(시험·찍기용) */
  get view(): Spin {
    return { ...this.spin };
  }

  /** 움직이는 중인지(끄는 중, 미끄러지는 중, 처음 각도로 돌아가는 중) */
  get moving(): boolean {
    return (
      this.drag !== null ||
      this.speed !== 0 ||
      this.homing !== null ||
      this.auto
    );
  }

  /** 각을 바로 정한다(미리보기의 「정면」·「돌린 각」 단추, 찍기) */
  setView(s: Spin): void {
    this.speed = 0;
    this.homing = null;
    this.spin = { ...s };
    this.noteView();
    this.invalidate();
  }

  /** 자동 회전(미리보기). 도는 동안은 돌릴 때처럼 해상도 조절을 쓴다 */
  setAuto(on: boolean): void {
    if (this.auto === on) return;
    this.auto = on;
    this.last = performance.now();
    this.apply();
    this.invalidate();
  }

  onViewTurn(fn: (turned: boolean) => void): () => void {
    this.listeners.add(fn);
    fn(this.turnedSeen);
    return () => {
      this.listeners.delete(fn);
    };
  }

  resetView(): boolean {
    if (this.drag || this.homing || !isTurned(this.spin)) return false;
    this.speed = 0;
    this.homing = { from: { ...this.spin }, start: performance.now() };
    this.noteView();
    this.invalidate();
    return true;
  }

  private noteView(): void {
    const turned = isTurned(this.spin) && this.homing === null;
    if (turned === this.turnedSeen) return;
    this.turnedSeen = turned;
    for (const fn of this.listeners) fn(turned);
  }

  // ---------------------------------------------------------------- 끌기

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.drag) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.lastMoveAt = performance.now();
    this.speed = 0;
    this.homing = null;
    this.drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      start: { ...this.spin },
      samples: [{ t: e.timeStamp, yaw: this.spin.yaw }],
    };
    this.canvas.style.cursor = "grabbing";
    this.apply();
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.spin = dragSpin(
      d.start,
      e.clientX - d.x0,
      e.clientY - d.y0,
      this.size,
    );
    this.lastMoveAt = performance.now();
    d.samples.push({ t: e.timeStamp, yaw: this.spin.yaw });
    if (d.samples.length > 12) d.samples.shift();
    this.noteView();
    this.invalidate();
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    this.canvas.style.cursor = "grab";
    const lastT = d.samples[d.samples.length - 1]?.t ?? e.timeStamp;
    // 멈췄다가 놓았으면(마지막 움직임이 오래전이면) 미끄러지지 않는다
    this.speed =
      reducedMotion() || e.timeStamp - lastT > 80 ? 0 : flingSpeed(d.samples);
    this.last = performance.now();
    this.noteView();
    this.apply();
    this.invalidate();
  };

  // ---------------------------------------------------------------- 그리기

  /** 그릴 것이 바뀌었다(끌기·놓기·처음 각도로·처음 장·다시 보일 때) */
  private invalidate(): void {
    this.dirty = true;
    this.schedule();
  }

  /** 다음 장을 부른다. 끄는 동안은 그릴 것이 없어도 매 장 불러 간격을 재고, 손이 멈추면 제 해상도로 그린다 */
  private schedule(): void {
    this.pending = true;
    if (this.disposed || this.raf || !this.visible) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    if (!this.visible) return;
    this.pending = false;
    // 돌리는 동안 이어진 장 사이 간격으로 화면 주기를 잰다(120Hz면 한 장 예산이 8.3ms, quality.ts)
    if (this.moving && this.wasMoving && this.last)
      this.quality.noteInterval(now - this.last);
    const dt = Math.min(50, Math.max(0, now - (this.last || now)));
    this.last = now;
    let stepped = false;
    if (this.homing) {
      stepped = true;
      const t = (now - this.homing.start) / HOME_MS;
      this.spin = homeSpin(this.homing.from, t);
      if (t >= 1) {
        this.spin = { ...FRONT };
        this.homing = null;
        this.noteView();
      }
    } else if (this.speed !== 0 && !this.drag) {
      stepped = true;
      const next = coast(this.spin.yaw, this.speed, dt);
      this.spin = { ...this.spin, yaw: next.yaw };
      this.speed = next.speed;
      if (next.speed === 0) this.noteView();
    } else if (this.auto && !this.drag) {
      stepped = true;
      this.spin = { ...this.spin, yaw: this.spin.yaw + AUTO_SPIN * dt };
      this.noteView();
    }
    // 움직이는 동안은 낮춘 해상도, 멈춘 장과 끄는 손이 멈췄을 때는 제 해상도
    const moving = this.moving;
    const resting = this.drag !== null && now - this.lastMoveAt > REST_MS;
    const want = moving && !resting ? this.quality.scale : 1;
    let draw = this.dirty || stepped;
    if (!draw && resting && this.scale !== 1) draw = true;
    if (draw) {
      const rescaled = want !== this.scale;
      if (rescaled) {
        this.painter.setScale(want);
        this.scale = want;
      }
      this.painter.built.spin.rotation.set(
        this.spin.pitch,
        this.spin.yaw,
        0,
        "XYZ",
      );
      this.painter.draw();
      this.frames += 1;
      this.dirty = false;
      if (this.shown) {
        // 그린 장은 다음 화면 갱신에 나간다. 그 뒤에 대기 그림을 걷는다
        const done = this.shown;
        this.shown = null;
        requestAnimationFrame(() => done());
      }
      // 돌리는 동안 그린 장이 GPU에서 끝나기까지 걸린 시간을 잰다(한 번에 하나, 배율을 바꾼 장은 빼고)
      if (moving && !resting && !rescaled && !this.timing) {
        this.timing = true;
        const t0 = performance.now();
        const scale = this.scale;
        this.painter.gpuDone().then(() => {
          this.timing = false;
          if (this.disposed || scale !== this.scale) return;
          if (this.quality.note(performance.now() - t0)) {
            learnedLevel = Math.max(learnedLevel, this.quality.level);
            this.apply();
          }
        });
      }
    }
    this.wasMoving = this.moving;
    this.apply();
    if (this.homing || this.speed !== 0 || this.drag || this.auto)
      this.schedule();
  };

  /**
   * 시험과 사람이 볼 수 있게 지금 각·그린 장 수·움직임·해상도 배율·돌릴 때 장 사이 간격(ms, 가운데 값)을 캔버스 칸의
   * data 속성에 적는다(길은 화면 컴포넌트가 적는다). 간격은 실제 기기에서 끊김을 잴 때 개발자 도구로 읽는다.
   */
  private apply(): void {
    const h = this.host.dataset;
    h.emblem3dYaw = wrapYaw(this.spin.yaw).toFixed(3);
    h.emblem3dPitch = this.spin.pitch.toFixed(3);
    h.emblem3dFrames = String(this.frames);
    h.emblem3dScale = String(this.scale);
    if (this.quality.median > 0) h.emblem3dGap = this.quality.median.toFixed(1);
    h.emblem3dBudget = this.quality.budget.toFixed(1);
    if (this.moving) h.emblem3dMoving = "";
    else delete h.emblem3dMoving;
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    this.painter.dispose();
    this.listeners.clear();
  }
}

/** 찍을 것 하나: 티어, 한 장의 한 변(실제 화소), 좌우 각들 */
export interface ShotJob {
  tier: DraftTier;
  px: number;
  yaws: readonly number[];
  /** 에메랄드 시안(에메랄드에만 쓴다) */
  gemStyle?: GemStyle | null | undefined;
}

/**
 * 엠블럼을 각도마다 한 장씩 찍는다(투명 바탕 PNG data URL). 작은 엠블럼(기록 창·티어 줄·Cubie 메뉴)과 미리보기 격자에
 * 3D 대신 쓸 그림이고, 각도를 조금씩 바꾼 몇 장을 차례로 보이면 반짝임이 옮겨 다닌다. 두 배로 그려 줄여 모서리를
 * 부드럽게 한다. 렌더러 하나로 여러 티어를 차례로 찍는다(WebGL 맥락을 티어마다 만들지 않는다).
 *
 * 보석은 뒤 배경판을 굴절해 비춰야 맑게 보이므로 배경판을 넣고 한 번 그린 뒤, 몸만 흰색으로 한 번 더 그려 그 테두리
 * 본으로 바탕을 지운다. 후광(다이아몬드부터)은 지운 뒤 2D로 뒤에 깐다. 번짐은 쓰지 않는다.
 */
export async function captureShots(
  jobs: readonly ShotJob[],
  pitch = 0.06,
): Promise<string[][]> {
  const scale = 2;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  const silhouette = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const results: string[][] = [];
  try {
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.15;
    for (const job of jobs) {
      const { tier, px } = job;
      renderer.setSize(px * scale, px * scale, false);
      const built = buildEmblemScene(THREE, tier, {
        backdrop: true,
        pageColor: PAGE_COLOR,
        hdr: false,
        backGlow: 0.5,
        gemStyle: job.gemStyle,
      });
      // 작은 그림은 엠블럼이 칸을 꽉 채우게 조금 당긴다
      built.camera.position.z *= 39 / 43;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromScene(built.studio, 0.02).texture;
      pmrem.dispose();
      built.applyEnvironment(env);
      // 셰이더를 주 스레드를 막지 않고 먼저 짓는다(그리면서 지으면 티어마다 수백 ms 멈췄다)
      built.update();
      await renderer.compileAsync(built.scene, built.camera);
      const color = document.createElement("canvas");
      color.width = px;
      color.height = px;
      const out = document.createElement("canvas");
      out.width = px;
      out.height = px;
      const cctx = color.getContext("2d");
      const ctx = out.getContext("2d");
      const urls: string[] = [];
      const lv = levelOf(tier);
      for (const yaw of job.yaws) {
        if (!ctx || !cctx) break;
        built.spin.rotation.set(pitch, yaw, 0, "XYZ");
        built.update();
        // 1) 배경판을 넣고 그대로
        renderer.setClearColor(PAGE_COLOR, 1);
        renderer.render(built.scene, built.camera);
        cctx.clearRect(0, 0, px, px);
        cctx.imageSmoothingQuality = "high";
        cctx.drawImage(canvas, 0, 0, px, px);
        // 2) 몸만 흰색으로(테두리 본)
        for (const o of built.behind) o.visible = false;
        built.scene.overrideMaterial = silhouette;
        renderer.setClearColor(0x000000, 0);
        renderer.render(built.scene, built.camera);
        built.scene.overrideMaterial = null;
        for (const o of built.behind) o.visible = true;
        ctx.clearRect(0, 0, px, px);
        ctx.imageSmoothingQuality = "high";
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(canvas, 0, 0, px, px);
        ctx.globalCompositeOperation = "source-in";
        ctx.drawImage(color, 0, 0);
        // 3) 후광을 뒤에
        if (lv >= 6) {
          const hex = Number.parseInt(LOOK[tier].tint.slice(1), 16);
          const rgb = `${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255}`;
          const g = ctx.createRadialGradient(
            px / 2,
            px / 2,
            0,
            px / 2,
            px / 2,
            px / 2,
          );
          g.addColorStop(0, `rgba(${rgb},${lv >= 9 ? 0.5 : 0.36})`);
          g.addColorStop(0.55, `rgba(${rgb},0.12)`);
          g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, px, px);
        }
        ctx.globalCompositeOperation = "source-over";
        urls.push(out.toDataURL("image/png"));
      }
      env.dispose();
      built.dispose();
      results.push(urls);
    }
    return results;
  } finally {
    silhouette.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** 반짝임 몇 장 돌리기용 좌우 각: 정면 둘레를 조금씩(±0.32 라디안 안) */
export const SPARKLE_YAWS = [-0.32, -0.19, -0.06, 0.06, 0.19, 0.32] as const;
