import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import {
  cubiePositions,
  inMove,
  moveAngle,
  normalVec,
  solvedStickers,
  type Vec3,
} from "./geometry";
import {
  type CubeMove,
  type CubeViewOptions,
  DEFAULT_COLORS,
  MAX_CUBE_SIZE,
  MIN_CUBE_SIZE,
  type Normal,
  type Quality,
  type Sticker,
} from "./types";

/**
 * 큐브 3D 장면(docs/47 5절). 화면 틀(React 등)을 모르는 클래스라 어느 화면에서나 쓴다.
 * three.js를 담고 있으므로 직접 import하지 말고 `loadCubeView()`(동적 import)로 불러온다.
 *
 * - 조각은 모서리가 둥근 검은 상자 하나(InstancedMesh), 스티커는 조금 떠 있는 둥근 사각형 하나(InstancedMesh,
 *   색은 인스턴스마다). 7×7(조각 218개·스티커 294장)도 그리기 호출 두어 번이다.
 * - 빛은 코드로 만드는 방 환경(RoomEnvironment → PMREM)과 바닥의 부드러운 그림자 한 장.
 * - 움직일 때만 그린다. 회전·보기 되돌리기가 끝나면 requestAnimationFrame을 멈춘다.
 */

const CUBIE = 0.97;
const CUBIE_RADIUS = 0.1;
/** 스티커가 조각 면에서 떠 있는 높이 */
const LIFT = 0.004;
/** 줄이 이보다 길면 앞의 수는 그리지 않고 바로 넘긴다 */
const MAX_BACKLOG = 4;
const RETURN_MS = 700;
const DEFAULT_YAW = 32;
const DEFAULT_PITCH = 26;
const PITCH_LIMIT = 80;

interface QualitySpec {
  maxDpr: number;
  antialias: boolean;
  boxSegments: number;
  curveSegments: number;
  physical: boolean;
  shadow: boolean;
}

const QUALITY: Record<Quality, QualitySpec> = {
  high: {
    maxDpr: 2,
    antialias: true,
    boxSegments: 4,
    curveSegments: 6,
    physical: true,
    shadow: true,
  },
  medium: {
    maxDpr: 1.5,
    antialias: true,
    boxSegments: 3,
    curveSegments: 4,
    physical: true,
    shadow: true,
  },
  low: {
    maxDpr: 1,
    antialias: false,
    boxSegments: 2,
    curveSegments: 2,
    physical: false,
    shadow: false,
  },
};

interface Cubie {
  home: Vec3;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  stickers: number[];
}

interface StickerSlot {
  cubie: number;
  /** 조각 안에서 스티커 자리(조각이 처음 방향일 때의 바깥 방향) */
  normal: Normal;
  local: THREE.Matrix4;
  color: number | null;
}

interface Running {
  move: CubeMove;
  cubies: number[];
  axis: THREE.Vector3;
  angle: number;
  start: number;
  duration: number;
}

const HIDDEN_COLOR = { black: 0x111111, gray: 0x6b6b6b } as const;

const AXIS_VEC = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
} as const;

const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
/** 끝에 살짝 넘쳤다 돌아온다 */
const easeBack = (p: number) => {
  const s = 1.1;
  const q = p - 1;
  return 1 + (s + 1) * q * q * q + s * q * q;
};
const easeOut = (p: number) => 1 - (1 - p) ** 3;

function roundedRect(size: number, radius: number): THREE.Shape {
  const h = size / 2;
  const r = Math.min(radius, h);
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

/** 스티커 판(+z를 향하고, 뒷면이 z=0). 조각 면 위에 놓는다 */
function stickerGeometry(
  stickerless: boolean,
  spec: QualitySpec,
): THREE.BufferGeometry {
  const size = stickerless ? CUBIE - 0.035 : 0.8;
  const radius = stickerless ? CUBIE_RADIUS * 0.9 : 0.1;
  const depth = stickerless ? 0.002 : 0.008;
  const bevel = stickerless ? 0.002 : 0.006;
  const g = new THREE.ExtrudeGeometry(roundedRect(size - bevel * 2, radius), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: spec.curveSegments > 2 ? 3 : 1,
    curveSegments: spec.curveSegments,
  });
  // 뒷면 경사까지 z=0 위로 올린다
  g.translate(0, 0, bevel + CUBIE / 2 + LIFT);
  return g;
}

/** 바닥에 까는 부드러운 그림자(가운데가 짙고 가장자리로 사라진다) */
function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(0,0,0,0.55)");
  r.addColorStop(0.45, "rgba(0,0,0,0.3)");
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function prefersReducedMotion(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

export class CubeView {
  readonly n: number;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private readonly spec: QualitySpec;
  private readonly cubies: Cubie[] = [];
  private readonly slots: StickerSlot[] = [];
  private readonly slotIndex = new Map<string, number>();
  private readonly body: THREE.InstancedMesh;
  private readonly stickerMesh: THREE.InstancedMesh;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly stickerMaterial: THREE.MeshStandardMaterial;
  private readonly shadow: THREE.Mesh | null = null;
  private readonly envTexture: THREE.Texture | null = null;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly reduced: MediaQueryList | null;

  private colors: readonly number[];
  private stickerless: boolean;
  private moveMs: number;
  private overshoot: boolean;
  private hidden: "black" | "gray";
  private onMoveDone: ((done: number) => void) | undefined;

  private queue: CubeMove[] = [];
  private running: Running | null = null;
  private done = 0;
  private raf = 0;
  private disposed = false;

  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  private dragYaw = 0;
  private dragPitch = 0;
  private drag: { id: number; x: number; y: number } | null = null;
  private returning: { start: number; yaw: number; pitch: number } | null =
    null;
  private width = 1;
  private height = 1;

  static create(canvas: HTMLCanvasElement, options: CubeViewOptions): CubeView {
    return new CubeView(canvas, options);
  }

  private constructor(canvas: HTMLCanvasElement, o: CubeViewOptions) {
    if (!Number.isInteger(o.n) || o.n < MIN_CUBE_SIZE || o.n > MAX_CUBE_SIZE)
      throw new Error(`큐브 크기가 맞지 않습니다: ${o.n}`);
    this.n = o.n;
    this.canvas = canvas;
    this.spec = QUALITY[o.quality ?? "high"];
    this.colors = o.colors ?? DEFAULT_COLORS;
    this.stickerless = o.stickerless ?? false;
    this.moveMs = clampMs(o.moveMs ?? 90);
    this.overshoot = o.overshoot ?? false;
    this.hidden = o.hidden ?? "black";
    this.onMoveDone = o.onMoveDone;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.spec.antialias,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.9;
    // 위에서 오는 빛 하나를 더해 윗면이 조금 더 밝게(실내 조명처럼)
    const key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(2, 6, 3);
    this.scene.add(key);

    // 조각 몸통
    const boxGeo = new RoundedBoxGeometry(
      CUBIE,
      CUBIE,
      CUBIE,
      this.spec.boxSegments,
      CUBIE_RADIUS,
    );
    this.bodyMaterial = this.spec.physical
      ? new THREE.MeshPhysicalMaterial({
          color: 0x0d0d0f,
          roughness: 0.5,
          metalness: 0,
          clearcoat: 0.3,
          clearcoatRoughness: 0.45,
        })
      : new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.5 });
    this.stickerMaterial = this.spec.physical
      ? new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0.32,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
        })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
    this.disposables.push(boxGeo, this.bodyMaterial, this.stickerMaterial);

    for (const home of cubiePositions(this.n))
      this.cubies.push({
        home,
        pos: new THREE.Vector3(...home),
        quat: new THREE.Quaternion(),
        stickers: [],
      });
    const h = (this.n - 1) / 2;
    const zAxis = new THREE.Vector3(0, 0, 1);
    this.cubies.forEach((c, ci) => {
      (["x", "y", "z"] as const).forEach((axis, a) => {
        const v = c.home[a] ?? 0;
        if (Math.abs(v) !== h) return;
        const signs = h === 0 ? [1, -1] : [Math.sign(v)];
        for (const s of signs) {
          const normal = `${s > 0 ? "+" : "-"}${axis}` as Normal;
          const nv = new THREE.Vector3(...normalVec(normal));
          const local = new THREE.Matrix4().makeRotationFromQuaternion(
            new THREE.Quaternion().setFromUnitVectors(zAxis, nv),
          );
          this.slotIndex.set(slotKey(c.home, normal), this.slots.length);
          c.stickers.push(this.slots.length);
          this.slots.push({ cubie: ci, normal, local, color: null });
        }
      });
    });

    this.body = new THREE.InstancedMesh(
      boxGeo,
      this.bodyMaterial,
      this.cubies.length,
    );
    this.stickerMesh = new THREE.InstancedMesh(
      stickerGeometry(this.stickerless, this.spec),
      this.stickerMaterial,
      this.slots.length,
    );
    for (const m of [this.body, this.stickerMesh]) {
      m.frustumCulled = false;
      this.scene.add(m);
    }

    if (this.spec.shadow) {
      const tex = shadowTexture();
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      });
      const plane = new THREE.PlaneGeometry(1, 1);
      const shadow = new THREE.Mesh(plane, mat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.setScalar(this.n * 1.9);
      shadow.position.y = -this.n * 0.5 - this.n * 0.28;
      this.scene.add(shadow);
      this.shadow = shadow;
      this.disposables.push(tex, mat, plane);
    }

    this.applyStickerless();
    this.setStickers(solvedStickers(this.n));

    this.reduced = prefersReducedMotion();
    this.reduced?.addEventListener("change", this.invalidate);
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);

    this.resize(canvas.clientWidth || 300, canvas.clientHeight || 300);
  }

  // ---------------------------------------------------------------- 상태

  /** 스티커 색을 한꺼번에 정한다(진행 중 회전·줄은 버리고 바로 그 상태로). 빠진 자리는 가림 */
  setStickers(stickers: readonly Sticker[]): void {
    this.queue = [];
    this.running = null;
    for (const c of this.cubies) {
      c.pos.set(...c.home);
      c.quat.identity();
    }
    for (const s of this.slots) s.color = null;
    for (const s of stickers) {
      const i = this.slotIndex.get(slotKey(s.center, s.normal));
      const slot = i === undefined ? undefined : this.slots[i];
      if (slot) slot.color = s.color;
    }
    this.cubies.forEach((_, i) => {
      this.writeCubie(i);
    });
    this.writeColors();
    this.invalidate();
  }

  /**
   * 회전 하나를 줄에 넣는다. 돌고 있던 회전은 바로 끝내고 다음으로 넘어가며, 줄이 길면 더 빨리 돈다.
   */
  enqueue(move: CubeMove): void {
    if (this.disposed) return;
    if (this.running) this.finish(this.running);
    this.queue.push(move);
    this.invalidate();
  }

  /** 줄에 남은 회전까지 모두 끝낸 상태로 바로 넘긴다 */
  flush(): void {
    if (this.running) this.finish(this.running);
    for (const m of this.queue.splice(0)) this.finish(this.start(m, 0, 0));
    this.invalidate();
  }

  /** 지금까지 끝낸 회전 수 */
  get movesDone(): number {
    return this.done;
  }

  /** 돌고 있거나 줄에 남은 회전이 없는지 */
  get idle(): boolean {
    return !this.running && this.queue.length === 0;
  }

  setOptions(
    o: Partial<
      Pick<
        CubeViewOptions,
        | "colors"
        | "stickerless"
        | "moveMs"
        | "overshoot"
        | "hidden"
        | "onMoveDone"
      >
    >,
  ): void {
    if (o.moveMs !== undefined) this.moveMs = clampMs(o.moveMs);
    if (o.overshoot !== undefined) this.overshoot = o.overshoot;
    if ("onMoveDone" in o) this.onMoveDone = o.onMoveDone;
    let recolor = false;
    if (o.colors) {
      this.colors = o.colors;
      recolor = true;
    }
    if (o.hidden && o.hidden !== this.hidden) {
      this.hidden = o.hidden;
      recolor = true;
    }
    if (o.stickerless !== undefined && o.stickerless !== this.stickerless) {
      this.stickerless = o.stickerless;
      const old = this.stickerMesh.geometry;
      this.stickerMesh.geometry = stickerGeometry(this.stickerless, this.spec);
      old.dispose();
      this.applyStickerless();
    }
    if (recolor) this.writeColors();
    this.invalidate();
  }

  // ---------------------------------------------------------------- 보기

  /** 보는 각(도). yaw는 위에서 봐서 오른쪽으로 돈 각, pitch는 위로 올라간 각 */
  setView(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.invalidate();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const dpr =
      typeof window === "undefined" ? 1 : (window.devicePixelRatio ?? 1);
    this.renderer.setPixelRatio(Math.min(dpr, this.spec.maxDpr));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.reduced?.removeEventListener("change", this.invalidate);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    this.stickerMesh.geometry.dispose();
    this.body.dispose();
    this.stickerMesh.dispose();
    for (const d of this.disposables) d.dispose();
    this.envTexture?.dispose();
    this.renderer.dispose();
    // 브라우저의 WebGL 문맥 수에는 상한이 있다. 크기를 여러 번 바꿔도 쌓이지 않게 바로 놓아준다
    this.renderer.forceContextLoss();
  }

  // ---------------------------------------------------------------- 안쪽

  private applyStickerless(): void {
    // 스티커 없는 큐브: 색 플라스틱 조각에 안쪽만 검은 심. 몸통을 조금 밝은 검정으로, 광택은 덜하게
    this.bodyMaterial.color.setHex(this.stickerless ? 0x1a1a1c : 0x0d0d0f);
    if (this.stickerMaterial instanceof THREE.MeshPhysicalMaterial) {
      this.stickerMaterial.clearcoat = this.stickerless ? 0.35 : 1;
      this.stickerMaterial.roughness = this.stickerless ? 0.4 : 0.32;
    }
  }

  private writeColors(): void {
    const color = new THREE.Color();
    this.slots.forEach((s, i) => {
      const hex =
        s.color === null
          ? HIDDEN_COLOR[this.hidden]
          : (this.colors[s.color] ?? HIDDEN_COLOR[this.hidden]);
      this.stickerMesh.setColorAt(i, color.setHex(hex));
    });
    if (this.stickerMesh.instanceColor)
      this.stickerMesh.instanceColor.needsUpdate = true;
  }

  /** 조각 하나(와 그 스티커)의 행렬을 쓴다. `extra`가 있으면 그 회전을 바깥에 더한다(도는 중) */
  private writeCubie(i: number, extra?: THREE.Quaternion): void {
    const c = this.cubies[i];
    if (!c) return;
    if (extra) {
      tmpV.copy(c.pos).applyQuaternion(extra);
      tmpQ.multiplyQuaternions(extra, c.quat);
    } else {
      tmpV.copy(c.pos);
      tmpQ.copy(c.quat);
    }
    tmpM.compose(tmpV, tmpQ, ONE);
    this.body.setMatrixAt(i, tmpM);
    for (const si of c.stickers) {
      const slot = this.slots[si];
      if (!slot) continue;
      tmpM2.multiplyMatrices(tmpM, slot.local);
      this.stickerMesh.setMatrixAt(si, tmpM2);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.stickerMesh.instanceMatrix.needsUpdate = true;
  }

  private start(move: CubeMove, now: number, duration: number): Running {
    const cubies: number[] = [];
    this.cubies.forEach((c, i) => {
      if (inMove(this.n, move, [c.pos.x, c.pos.y, c.pos.z])) cubies.push(i);
    });
    return {
      move,
      cubies,
      axis: AXIS_VEC[move.axis],
      angle: moveAngle(move),
      start: now,
      duration,
    };
  }

  /** 회전을 끝까지 적용하고, 위치·방향을 정수 격자로 다시 맞춘다(오차가 쌓이지 않게) */
  private finish(r: Running): void {
    tmpQ2.setFromAxisAngle(r.axis, r.angle);
    for (const i of r.cubies) {
      const c = this.cubies[i];
      if (!c) continue;
      c.pos.applyQuaternion(tmpQ2);
      c.pos.set(snapHalf(c.pos.x), snapHalf(c.pos.y), snapHalf(c.pos.z));
      c.quat.premultiply(tmpQ2);
      snapQuaternion(c.quat);
      this.writeCubie(i);
    }
    if (this.running === r) this.running = null;
    this.done++;
    this.onMoveDone?.(this.done);
  }

  private effectiveMs(): number {
    return this.reduced?.matches ? 0 : this.moveMs;
  }

  /** 한 장 그린다. 더 그릴 것이 있으면 true */
  private update(now: number): boolean {
    let busy = false;
    // 회전
    while (this.queue.length > MAX_BACKLOG) {
      const m = this.queue.shift();
      if (m) this.finish(this.start(m, now, 0));
    }
    while (!this.running && this.queue.length > 0) {
      const m = this.queue.shift() as CubeMove;
      const base = this.effectiveMs() * (m.turns === 2 ? 1.4 : 1);
      // 줄에 남은 수가 많을수록 빨리
      const r = this.start(m, now, base / (1 + this.queue.length));
      if (r.duration <= 0) this.finish(r);
      else this.running = r;
    }
    const r = this.running;
    if (r) {
      const p = clamp((now - r.start) / r.duration, 0, 1);
      if (p >= 1) {
        this.finish(r);
      } else {
        const e = this.overshoot ? easeBack(p) : easeInOut(p);
        tmpQ2.setFromAxisAngle(r.axis, r.angle * e);
        const q = tmpQ2.clone();
        for (const i of r.cubies) this.writeCubie(i, q);
      }
      busy = true;
    }
    if (this.queue.length > 0) busy = true;

    // 보기(끌어 돌린 뒤 천천히 제자리로)
    if (this.returning) {
      const p = clamp((now - this.returning.start) / RETURN_MS, 0, 1);
      const e = easeOut(p);
      this.dragYaw = this.returning.yaw * (1 - e);
      this.dragPitch = this.returning.pitch * (1 - e);
      if (p >= 1) this.returning = null;
      else busy = true;
    }
    this.placeCamera();
    return busy;
  }

  private placeCamera(): void {
    const yaw = THREE.MathUtils.degToRad(this.yaw + this.dragYaw);
    const pitch = THREE.MathUtils.degToRad(
      clamp(this.pitch + this.dragPitch, -PITCH_LIMIT, PITCH_LIMIT),
    );
    // 큐브를 감싸는 공이 화면 짧은 쪽에 들어가도록 거리를 잡는다
    const radius = (this.n * Math.sqrt(3)) / 2;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.02;
    this.camera.position.set(
      dist * Math.cos(pitch) * Math.sin(yaw),
      dist * Math.sin(pitch),
      dist * Math.cos(pitch) * Math.cos(yaw),
    );
    this.camera.lookAt(0, 0, 0);
  }

  private readonly invalidate = (): void => {
    if (this.disposed || this.raf) return;
    if (typeof requestAnimationFrame === "undefined") return;
    this.raf = requestAnimationFrame(this.tick);
  };

  private readonly tick = (now: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    const busy = this.update(now);
    this.renderer.render(this.scene, this.camera);
    if (busy) this.invalidate();
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.drag) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.returning = null;
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.dragYaw -= (e.clientX - d.x) * 0.45;
    this.dragPitch += (e.clientY - d.y) * 0.45;
    this.dragYaw = clamp(this.dragYaw, -180, 180);
    this.dragPitch = clamp(this.dragPitch, -PITCH_LIMIT * 2, PITCH_LIMIT * 2);
    d.x = e.clientX;
    d.y = e.clientY;
    this.invalidate();
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    this.drag = null;
    this.canvas.releasePointerCapture?.(e.pointerId);
    this.returning = {
      start: performance.now(),
      yaw: this.dragYaw,
      pitch: this.dragPitch,
    };
    this.invalidate();
  };
}

function slotKey(center: readonly number[], normal: Normal): string {
  return `${center.map((v) => Math.round(v * 2)).join(",")}${normal}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clampMs(ms: number): number {
  return clamp(Number.isFinite(ms) ? ms : 90, 0, 200);
}

/** 0.5 간격 격자로 */
function snapHalf(v: number): number {
  return Math.round(v * 2) / 2 + 0;
}

/** 90° 회전만 모인 방향이므로 회전 행렬의 칸은 -1·0·1뿐이다. 그 값으로 다시 맞춘다 */
function snapQuaternion(q: THREE.Quaternion): void {
  tmpM.makeRotationFromQuaternion(q);
  const e = tmpM.elements;
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[i] = Math.round(e[i] ?? 0);
  q.setFromRotationMatrix(tmpM).normalize();
}
