import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type { ViewTurnTarget } from "@/cube/components/ViewHome";

import {
  buildEmblemScene,
  type DraftTier,
  type EmblemScene,
  isGem,
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

/**
 * 3D 엠블럼 시안의 무대(docs/47 14-7): 캔버스 하나에 엠블럼 하나를 그리고, 끌어 돌리기를 받는다.
 *
 * - 움직일 때만 그린다: 끄는 중, 놓은 뒤 짧은 미끄러짐, 「처음 각도로」 돌아가는 중. 가만히 있으면 한 장도 그리지
 *   않는다(`data-emblem3d-frames`가 늘지 않는다). 화면 밖이면 그리기를 미뤘다가 다시 보일 때 한 장 그린다.
 * - 보석은 HDR 캔버스(WebGPU)를 먼저 시도하고, 안 되면 WebGL에 번짐(bloom)으로 그린다. 금속은 WebGL에 번짐 없이.
 * - `onViewTurn`·`resetView`는 큐브 화면의 「처음 각도로」 단추(`ViewHome`)가 그대로 붙는 꼴이다.
 */

/** 미리보기 바탕(neutral-900)과 같은 색: 배경판 가장자리가 페이지에 녹아든다 */
export const PAGE_COLOR = "#171717";

/** 번짐 값(SDR 보석): 세기, 반지름, 밝기 문턱(톤 매핑 전 선형 값) */
export const BLOOM = { strength: 0.55, radius: 0.35, threshold: 1.25 } as const;

interface Painter {
  path: DrawPath;
  built: EmblemScene;
  draw(): void;
  dispose(): void;
}

function webglPainter(
  canvas: HTMLCanvasElement,
  tier: DraftTier,
  px: number,
  bloom: boolean,
): Painter {
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
  renderer.setClearColor(PAGE_COLOR, 1);
  const built = buildEmblemScene(THREE, tier, {
    backdrop: true,
    pageColor: PAGE_COLOR,
    hdr: false,
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(built.studio, 0.02).texture;
  pmrem.dispose();
  built.scene.environment = env;

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
        BLOOM.strength,
        BLOOM.radius,
        BLOOM.threshold,
      ),
    );
    composer.addPass(new OutputPass());
  }
  return {
    path: bloom ? "bloom" : "plain",
    built,
    draw() {
      if (composer) composer.render();
      else renderer.render(built.scene, built.camera);
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
  renderer.setClearColor(new W.Color(PAGE_COLOR), 1);
  const T = W as unknown as Three;
  const built = buildEmblemScene(T, tier, {
    backdrop: true,
    pageColor: PAGE_COLOR,
    hdr: true,
  });
  const pmrem = new W.PMREMGenerator(renderer);
  const env = pmrem.fromScene(built.studio as never, 0.02).texture;
  built.scene.environment = env as unknown as THREE.Texture;
  return {
    path: "hdr",
    built,
    draw() {
      renderer.render(built.scene as never, built.camera as never);
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
}

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
    const gem = isGem(opt.tier);
    let painter: Painter | null = null;
    if (gem && opt.force !== "bloom") {
      const want = opt.force === "hdr" || (await canHdrCanvas());
      if (want) {
        try {
          painter = await hdrPainter(fresh(), opt.tier, px);
        } catch {
          painter = null;
        }
      }
    }
    painter ??= webglPainter(fresh(), opt.tier, px, gem);
    return new EmblemStage(host, painter, opt.size);
  }

  // ---------------------------------------------------------------- 보기

  /** 지금 각(시험·찍기용) */
  get view(): Spin {
    return { ...this.spin };
  }

  /** 움직이는 중인지(끄는 중, 미끄러지는 중, 처음 각도로 돌아가는 중) */
  get moving(): boolean {
    return this.drag !== null || this.speed !== 0 || this.homing !== null;
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

  private invalidate(): void {
    this.pending = true;
    if (this.disposed || this.raf || !this.visible) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    if (!this.visible) return;
    this.pending = false;
    const dt = Math.min(50, Math.max(0, now - (this.last || now)));
    this.last = now;
    if (this.homing) {
      const t = (now - this.homing.start) / HOME_MS;
      this.spin = homeSpin(this.homing.from, t);
      if (t >= 1) {
        this.spin = { ...FRONT };
        this.homing = null;
        this.noteView();
      }
    } else if (this.speed !== 0 && !this.drag) {
      const next = coast(this.spin.yaw, this.speed, dt);
      this.spin = { ...this.spin, yaw: next.yaw };
      this.speed = next.speed;
      if (next.speed === 0) this.noteView();
    }
    this.painter.built.spin.rotation.set(
      this.spin.pitch,
      this.spin.yaw,
      0,
      "XYZ",
    );
    this.painter.draw();
    this.frames += 1;
    this.apply();
    if (this.homing || (this.speed !== 0 && !this.drag)) this.invalidate();
  };

  /** 시험과 사람이 볼 수 있게 지금 각·그린 장 수·움직임을 캔버스 칸의 data 속성에 적는다(길은 화면 컴포넌트가 적는다) */
  private apply(): void {
    const h = this.host.dataset;
    h.emblem3dYaw = wrapYaw(this.spin.yaw).toFixed(3);
    h.emblem3dPitch = this.spin.pitch.toFixed(3);
    h.emblem3dFrames = String(this.frames);
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

/**
 * 엠블럼을 각도마다 한 장씩 찍는다(투명 바탕 PNG data URL). 작은 엠블럼(기록 창·티어 줄·Cubie 메뉴)에 3D 대신 쓸
 * 그림이고, 각도를 조금씩 바꾼 몇 장을 차례로 보이면 반짝임이 옮겨 다닌다. 두 배로 그려 줄여 모서리를 부드럽게 한다.
 * 번짐은 투명 바탕을 지워 쓰지 않는다(후광이 그 몫을 한다).
 *
 * @param px 한 장의 한 변(실제 화소). 두 배 화면용이면 보일 크기의 두 배를 넘긴다
 * @param yaws 찍을 좌우 각(라디안)
 */
export async function captureEmblemShots(
  tier: DraftTier,
  px: number,
  yaws: readonly number[],
  pitch = 0.06,
): Promise<string[]> {
  const scale = 2;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(px * scale, px * scale, false);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setClearColor(0x000000, 0);
    const built = buildEmblemScene(THREE, tier, {
      backdrop: false,
      pageColor: "#000000",
      hdr: false,
    });
    // 작은 그림은 엠블럼이 칸을 꽉 채우게 조금 당긴다
    built.camera.position.z = 39;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(built.studio, 0.02).texture;
    pmrem.dispose();
    built.scene.environment = env;
    const out = document.createElement("canvas");
    out.width = px;
    out.height = px;
    const ctx = out.getContext("2d");
    const urls: string[] = [];
    for (const yaw of yaws) {
      built.spin.rotation.set(pitch, yaw, 0, "XYZ");
      renderer.render(built.scene, built.camera);
      if (!ctx) continue;
      ctx.clearRect(0, 0, px, px);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, 0, 0, px, px);
      urls.push(out.toDataURL("image/png"));
    }
    env.dispose();
    built.dispose();
    return urls;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** 반짝임 몇 장 돌리기용 좌우 각: 정면 둘레를 조금씩(±0.32 라디안 안) */
export const SPARKLE_YAWS = [-0.32, -0.19, -0.06, 0.06, 0.19, 0.32] as const;
