import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { PATTERN_INK, patternShape, type StickerPattern } from "../item-look";
import {
  cubiePositions,
  inMove,
  moveAngle,
  moveDuration,
  normalVec,
  solvedStickers,
  type Vec3,
} from "./geometry";
import {
  type BackNormal,
  cellPoint,
  type Frame,
  MIRROR_CELL,
  MIRROR_PAD,
  type MirrorPanel,
  mirrorAlpha,
  mirrorCells,
  mirrorFrame,
  mirrorHitAt,
  mirrorPanels,
  rayPanel,
} from "./mirror";
import { cellOfPoint, type SwipeHit, swipeToMove } from "./swipe";
import {
  type CubeMove,
  type CubeViewOptions,
  DEFAULT_COLORS,
  MARK_COLOR,
  MAX_CUBE_SIZE,
  type MarkTone,
  MIN_CUBE_SIZE,
  type Normal,
  type PieceLayout,
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
/** 이만큼(CSS 픽셀) 밀어야 밀기로 본다. 그보다 짧으면 누름일 뿐 */
const SWIPE_PX = 14;

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
  /** 놓임(setLayout): 지금 값과 옮겨 가는 처음·끝 값 */
  shift: THREE.Vector3;
  scale: number;
  body: boolean;
  from: { shift: THREE.Vector3; scale: number };
  to: { shift: THREE.Vector3; scale: number };
}

interface StickerSlot {
  cubie: number;
  /** 조각 안에서 스티커 자리(조각이 처음 방향일 때의 바깥 방향) */
  normal: Normal;
  local: THREE.Matrix4;
  color: number | null;
  mark: MarkTone | null;
  /** 스티커 정체(`Sticker.id`). 모르면 null */
  id: number | null;
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

/** 칸 표시 고리(스티커 둘레를 감싸는 둥근 테, 스티커보다 조금 위). 배우기의 고른 조각·맞음·틀림 */
function frameGeometry(spec: QualitySpec): THREE.BufferGeometry {
  const shape = roundedRect(0.96, 0.14);
  const hole = roundedRect(0.74, 0.1);
  shape.holes.push(
    new THREE.Path(hole.getPoints(spec.curveSegments).reverse()),
  );
  const g = new THREE.ShapeGeometry(shape, spec.curveSegments);
  g.translate(0, 0, CUBIE / 2 + 0.03);
  return g;
}

/** 거울 판 바탕(어두운 유리, 옅은 테두리, 비스듬한 반사 띠). 판 한 장 크기의 정사각형 그림 */
function glassTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = 26;
  const path = (inset: number) => {
    const a = inset;
    const b = size - inset;
    g.beginPath();
    g.moveTo(a + r, a);
    g.arcTo(b, a, b, b, r);
    g.arcTo(b, b, a, b, r);
    g.arcTo(a, b, a, a, r);
    g.arcTo(a, a, b, a, r);
    g.closePath();
  };
  path(2);
  const base = g.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, "rgba(46,56,78,0.62)");
  base.addColorStop(1, "rgba(14,18,28,0.5)");
  g.fillStyle = base;
  g.fill();
  // 반사 띠: 왼쪽 위에서 오른쪽 아래로 비스듬히 지나는 옅은 빛
  g.save();
  g.clip();
  const band = g.createLinearGradient(0, size * 0.15, size * 0.6, size * 0.75);
  band.addColorStop(0, "rgba(255,255,255,0)");
  band.addColorStop(0.45, "rgba(255,255,255,0.09)");
  band.addColorStop(0.55, "rgba(255,255,255,0.03)");
  band.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = band;
  g.fillRect(0, 0, size, size);
  g.restore();
  path(2);
  g.lineWidth = 2.5;
  g.strokeStyle = "rgba(255,255,255,0.26)";
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 거울 판의 장면 조각(판 셋을 한 번에) */
interface Mirror {
  panels: MirrorPanel[];
  group: THREE.Group;
  plateMat: THREE.MeshBasicMaterial;
  cells: THREE.InstancedMesh;
  cellMat: THREE.MeshBasicMaterial;
  marks: THREE.InstancedMesh;
  markMat: THREE.MeshBasicMaterial;
  /** 흑백 화면의 무늬 판(무늬마다 하나, 칸 위에 겹친다) */
  patterns: { key: StickerPattern; mesh: THREE.InstancedMesh }[];
  /** 칸 인스턴스 번호(판·u·v) */
  index: Map<string, number>;
}

/** 거울 판 칸의 색은 큐브보다 조금 어둡게(비친 모습) */
const MIRROR_TINT = 0.86;

/** 표시가 없는 칸의 고리는 크기 0으로 둔다 */
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

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

/** 흑백 화면의 무늬(민무늬 빼고). 무늬마다 겹친 판 하나(InstancedMesh)를 둔다 */
const PATTERN_KEYS: readonly StickerPattern[] = [
  "dot",
  "ring",
  "dots4",
  "dots9",
  "ringDot",
];

/** 무늬 그림(투명 바탕에 짙은 점·고리). 칸 한 변 = 그림 한 변 */
function patternTexture(p: StickerPattern): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const ink = `#${PATTERN_INK.toString(16).padStart(6, "0")}`;
  const s = patternShape(p);
  g.fillStyle = ink;
  for (const d of s.dots) {
    g.beginPath();
    g.arc(d.x * size, d.y * size, d.r * size, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = ink;
  for (const r of s.rings) {
    g.lineWidth = r.w * size;
    g.beginPath();
    g.arc(r.x * size, r.y * size, r.r * size, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
const tmpS = new THREE.Vector3(1, 1, 1);

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
  private readonly frameMesh: THREE.InstancedMesh;
  /** 흑백 화면: 색 번호마다 무늬(없으면 끔). 무늬 판은 처음 켤 때 만든다 */
  private patterns: readonly (StickerPattern | null)[] | null = null;
  private patternMeshes: { key: StickerPattern; mesh: THREE.InstancedMesh }[] =
    [];
  private readonly shadow: THREE.Mesh | null = null;
  private readonly envTexture: THREE.Texture | null = null;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly reduced: MediaQueryList | null;
  private readonly interactive: boolean;
  private readonly maxDpr: number;

  private colors: readonly number[];
  private stickerless: boolean;
  private moveMs: number;
  private overshoot: boolean;
  private hidden: "black" | "gray";
  private onMoveDone: ((done: number) => void) | undefined;
  private onSwipe: ((move: CubeMove) => void) | undefined;
  private onTap: ((hit: SwipeHit) => void) | undefined;
  private swipeMouse: boolean;
  private keepView: boolean;
  /** 밀기 하나(누른 곳에서 정한 칸, 이미 수를 냈는지) */
  private gesture: {
    id: number;
    x: number;
    y: number;
    hit: SwipeHit | null;
    done: boolean;
  } | null = null;

  /** 놓임이 바뀌는 중(시작 시각·걸리는 시간) */
  private layoutAnim: { start: number; ms: number } | null = null;
  /** 큐브 속 축(가운데를 잇는 심). setCore(true)일 때만 만든다 */
  private core: THREE.Group | null = null;

  private queue: CubeMove[] = [];
  private running: Running | null = null;
  private done = 0;
  private raf = 0;
  private disposed = false;

  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  private dragYaw = 0;
  private dragPitch = 0;
  private drag: {
    id: number;
    x: number;
    y: number;
    x0: number;
    y0: number;
  } | null = null;
  private returning: { start: number; yaw: number; pitch: number } | null =
    null;
  /** 거울 판(뒷면 보기). 켤 때 만든다 */
  private mirror: Mirror | null = null;
  private mirrorOn = false;
  /** 지금 판이 보이는 정도(0~1, 보는 각에 따라) */
  private mirrorShown = 0;
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
    this.onSwipe = o.onSwipe;
    this.onTap = o.onTap;
    this.swipeMouse = o.swipeMouse ?? false;
    this.keepView = o.keepView ?? false;
    this.interactive = o.interactive ?? true;
    this.maxDpr = Math.min(o.maxDpr ?? this.spec.maxDpr, this.spec.maxDpr);

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
    // 방 환경은 광택(반사)용으로만 약하게 쓴다. 세게 두면 비스듬히 보이는 면(오른쪽)에 하얀 방이 비쳐 색이 물 빠진 듯 옅어진다
    this.scene.environmentIntensity = 0.45;
    // 색은 직접 빛으로 낸다: 보이는 세 면(위·앞·오른쪽)이 비슷하게 밝도록 위-앞, 오른쪽, 왼쪽-앞에서 비춘다
    const sky = new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 0.7);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3, 5, 4);
    const right = new THREE.DirectionalLight(0xffffff, 0.75);
    right.position.set(5, 0.5, 1);
    const left = new THREE.DirectionalLight(0xffffff, 0.5);
    left.position.set(-4, 1, 3);
    this.scene.add(sky, key, right, left);

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
          roughness: 0.4,
          metalness: 0,
          // 광택은 얇게: 맑은 막(clearcoat)이 세면 비스듬한 면에서 방 반사가 색을 덮는다
          clearcoat: 0.35,
          clearcoatRoughness: 0.22,
          envMapIntensity: 0.5,
        })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
    this.disposables.push(boxGeo, this.bodyMaterial, this.stickerMaterial);

    for (const home of cubiePositions(this.n))
      this.cubies.push({
        home,
        pos: new THREE.Vector3(...home),
        quat: new THREE.Quaternion(),
        stickers: [],
        shift: new THREE.Vector3(),
        scale: 1,
        body: true,
        from: { shift: new THREE.Vector3(), scale: 1 },
        to: { shift: new THREE.Vector3(), scale: 1 },
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
          this.slots.push({
            cubie: ci,
            normal,
            local,
            color: null,
            mark: null,
            id: null,
          });
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
    // 칸 표시: 빛을 받지 않는 밝은 색이라 어느 면에서도 같은 색으로 보인다
    const frameMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const frameGeo = frameGeometry(this.spec);
    this.disposables.push(frameMat, frameGeo);
    this.frameMesh = new THREE.InstancedMesh(
      frameGeo,
      frameMat,
      this.slots.length,
    );
    this.frameMesh.visible = false;
    for (const m of [this.body, this.stickerMesh, this.frameMesh]) {
      m.frustumCulled = false;
      this.scene.add(m);
    }

    if (o.shadow ?? this.spec.shadow) {
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
    if (this.interactive) {
      canvas.style.touchAction = "none";
      canvas.addEventListener("pointerdown", this.onPointerDown);
      canvas.addEventListener("pointermove", this.onPointerMove);
      canvas.addEventListener("pointerup", this.onPointerUp);
      canvas.addEventListener("pointercancel", this.onPointerUp);
    }

    this.resize(canvas.clientWidth || 300, canvas.clientHeight || 300);
    if (o.mirror) this.setMirror(true);
    // 화면 시험만: 캔버스에서 장면을 찾아 판 칸 자리를 묻는다(제품은 이 값을 넣지 않는다)
    if (
      typeof window !== "undefined" &&
      (window as { __cubeTestHooks?: boolean }).__cubeTestHooks
    )
      (canvas as unknown as { __cubeView?: CubeView }).__cubeView = this;
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
    for (const s of this.slots) {
      s.color = null;
      s.mark = null;
      s.id = null;
    }
    for (const s of stickers) {
      const i = this.slotIndex.get(slotKey(s.center, s.normal));
      const slot = i === undefined ? undefined : this.slots[i];
      if (slot) {
        slot.color = s.color;
        slot.mark = s.mark ?? null;
        slot.id = s.id ?? null;
      }
    }
    this.cubies.forEach((_, i) => {
      this.writeCubie(i);
    });
    this.writeColors();
    this.writeMirror();
    this.invalidate();
  }

  /**
   * 칸 표시만 바꾼다(색·놓임·돌고 있는 회전은 그대로). `marks`는 스티커 정체(`Sticker.id`)마다 표시다
   * (bridge `StickerMarks`와 같다). 표시는 조각에 붙어 다니므로 수를 두는 도중에 불러도 된다. null이면 모두 끈다.
   * 첫 화면 연출의 강조가 쓴다(docs/47 0절 2026-11-05)
   */
  setMarks(marks: readonly (MarkTone | null)[] | null): void {
    let changed = false;
    this.slots.forEach((s, si) => {
      const want = (s.id !== null && marks?.[s.id]) || null;
      if (want === s.mark) return;
      s.mark = want;
      changed = true;
      // 돌고 있는 조각도 그 자리에 그리도록 스티커의 지금 행렬을 그대로 쓴다
      if (want) {
        this.stickerMesh.getMatrixAt(si, tmpM2);
        this.frameMesh.setMatrixAt(si, tmpM2);
      } else this.frameMesh.setMatrixAt(si, ZERO);
    });
    if (!changed) return;
    this.frameMesh.instanceMatrix.needsUpdate = true;
    this.writeColors();
    this.writeMirror();
    this.invalidate();
  }

  /**
   * 뒷면 거울 판(docs/47 5절)을 켜고 끈다. 켜면 안 보이는 세 면(세계의 뒤·왼쪽·아래)을 큐브 둘레에 거울상으로
   * 띄우고, 화면에 판까지 들어오게 카메라를 조금 물린다. 둘러보거나 살짝 보기로 각이 멀어지면 판은 흐려지고
   * 카메라는 큐브만 담는 자리로 돌아온다
   */
  /**
   * 흑백 화면(아이템전, docs/47 9-7): 색 번호(면 번호)마다 붙일 무늬. null이면 끈다. 색은 `setOptions({ colors })`로 따로
   * 바꾼다(같은 회색). 무늬는 스티커 위에 조금 떠 있는 판이라 조각과 함께 돌고 거울 판에도 같은 무늬가 비친다
   */
  setPatterns(patterns: readonly (StickerPattern | null)[] | null): void {
    this.patterns = patterns;
    if (patterns && this.patternMeshes.length === 0) {
      const size = this.stickerless ? CUBIE - 0.06 : 0.76;
      const geo = new THREE.PlaneGeometry(size, size);
      geo.translate(0, 0, CUBIE / 2 + LIFT + 0.024);
      this.disposables.push(geo);
      for (const key of PATTERN_KEYS) {
        const tex = patternTexture(key);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        });
        this.disposables.push(tex, mat);
        const mesh = new THREE.InstancedMesh(geo, mat, this.slots.length);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.patternMeshes.push({ key, mesh });
      }
    }
    for (const p of this.patternMeshes) p.mesh.visible = !!patterns;
    for (let i = 0; i < this.cubies.length; i++) this.writeCubie(i);
    this.writeMirror();
    this.invalidate();
  }

  setMirror(on: boolean): void {
    this.mirrorOn = on;
    if (on && !this.mirror) this.mirror = this.buildMirror();
    this.writeMirror();
    this.invalidate();
  }

  /** 판이 지금 보이는지(시험·화면 표시) */
  get mirrorVisible(): boolean {
    return this.mirrorShown > 0.5;
  }

  /**
   * 판 위 칸 가운데의 화면 좌표(client px). 판이 없거나 보이지 않으면 null. 화면 시험이 판 칸을 누를 때 쓴다
   */
  mirrorCellClient(
    panel: BackNormal,
    u: number,
    v: number,
  ): { x: number; y: number } | null {
    const p = this.mirror?.panels.find((q) => q.normal === panel);
    if (!p) return null;
    this.placeCamera();
    if (!this.mirrorVisible) return null;
    this.camera.updateMatrixWorld();
    const w = new THREE.Vector3(...cellPoint(p, u, v)).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((w.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - w.y) / 2) * rect.height,
    };
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
        | "onSwipe"
        | "onTap"
        | "swipeMouse"
        | "mirror"
        | "keepView"
      >
    >,
  ): void {
    if (o.mirror !== undefined && o.mirror !== this.mirrorOn)
      this.setMirror(o.mirror);
    if (o.moveMs !== undefined) this.moveMs = clampMs(o.moveMs);
    if (o.overshoot !== undefined) this.overshoot = o.overshoot;
    if ("onMoveDone" in o) this.onMoveDone = o.onMoveDone;
    if ("onSwipe" in o) this.onSwipe = o.onSwipe;
    if ("onTap" in o) this.onTap = o.onTap;
    if (o.swipeMouse !== undefined) this.swipeMouse = o.swipeMouse;
    if (o.keepView !== undefined) this.keepView = o.keepView;
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
    if (recolor) {
      this.writeColors();
      this.writeMirror();
    }
    this.invalidate();
  }

  /**
   * 조각마다 놓임을 정한다(배우기의 스티커·조각 보기, 분해·조립). `of`는 조각의 제자리(맞춘 큐브의 중심)를 받아
   * 놓임을 돌려준다(null이면 기본). `ms`가 있으면 그동안 부드럽게 옮긴다. 회전과 함께 쓰지 않는다(놓임은 세계 좌표)
   */
  setLayout(
    of: (home: readonly [number, number, number]) => PieceLayout | null,
    ms = 0,
  ): void {
    const now = typeof performance === "undefined" ? 0 : performance.now();
    const t = this.reduced?.matches ? 0 : ms;
    this.cubies.forEach((c, i) => {
      const l = of(c.home) ?? {};
      c.body = l.body ?? true;
      c.from.shift.copy(c.shift);
      c.from.scale = c.scale;
      c.to.shift.set(...(l.shift ?? [0, 0, 0]));
      c.to.scale = l.scale ?? 1;
      if (t <= 0) {
        c.shift.copy(c.to.shift);
        c.scale = c.to.scale;
      }
      this.writeCubie(i);
    });
    this.layoutAnim = t > 0 ? { start: now, ms: t } : null;
    this.writeMirror();
    this.invalidate();
  }

  private axes: THREE.Group | null = null;

  /**
   * 세 축 화살표(x 빨강 = 왼쪽 → 오른쪽, y 초록 = 아래 → 위, z 파랑 = 뒤 → 앞). 처음 안내의 x·y·z 설명이 쓴다.
   * 큐브를 꿰뚫고 양쪽으로 삐져나온다
   */
  setAxes(show: boolean): void {
    if (show && !this.axes) {
      const g = new THREE.Group();
      const half = this.n / 2 + 0.9;
      const dirs: [THREE.Vector3, number][] = [
        [new THREE.Vector3(1, 0, 0), 0xff4d4d],
        [new THREE.Vector3(0, 1, 0), 0x4dff88],
        [new THREE.Vector3(0, 0, 1), 0x4d9bff],
      ];
      for (const [d, color] of dirs) {
        const a = new THREE.ArrowHelper(
          d,
          d.clone().multiplyScalar(-half),
          half * 2,
          color,
          0.5,
          0.28,
        );
        for (const m of [a.line.material, a.cone.material])
          (m as THREE.Material & { toneMapped?: boolean }).toneMapped = false;
        g.add(a);
      }
      this.scene.add(g);
      this.axes = g;
    }
    if (this.axes) this.axes.visible = show;
    this.invalidate();
  }

  /** 큐브 속 축(가운데 여섯을 잇는 심)을 그린다. 분해한 큐브에서 보인다 */
  setCore(show: boolean): void {
    if (show && !this.core) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8a8f98,
        roughness: 0.45,
        metalness: 0.3,
      });
      const len = this.n - 1;
      const rod = new THREE.CylinderGeometry(0.09, 0.09, len, 12);
      const ball = new THREE.SphereGeometry(0.32, 20, 14);
      this.disposables.push(mat, rod, ball);
      g.add(new THREE.Mesh(ball, mat));
      for (const axis of ["x", "y", "z"] as const) {
        const m = new THREE.Mesh(rod, mat);
        if (axis === "x") m.rotation.z = Math.PI / 2;
        if (axis === "z") m.rotation.x = Math.PI / 2;
        g.add(m);
      }
      this.scene.add(g);
      this.core = g;
    }
    if (this.core) this.core.visible = show;
    this.invalidate();
  }

  private hands: { left: THREE.Group; right: THREE.Group } | null = null;

  /**
   * 손 표시(csTimer `updateHandMarks`처럼, 2026-11-04): 큰 큐브 「두 손」에서 왼손(L·Lw 키)·오른손(R·Rw 키)이 잡은 층의
   * 경계를 윗면 위의 세모와 윗면·앞면을 가로지르는 선으로 보인다. 왼손은 하늘색, 오른손은 주황(키 그림의 손 색).
   * 손은 큐브가 아니라 보는 쪽에 붙어 있어 큐브 전체 돌리기에 따라 돌지 않는다. null이면 숨긴다
   */
  setHandMarks(layers: { left: number; right: number } | null): void {
    if (layers && !this.hands) {
      const make = (color: number) => {
        const g = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
          toneMapped: false,
        });
        const n = this.n;
        // 윗면을 앞뒤로 가로지르는 선, 앞면을 위아래로 내려오는 선, 윗면 위에 떠 있는 아래 향한 세모
        const top = new THREE.BoxGeometry(0.06, 0.03, n + 0.1);
        const front = new THREE.BoxGeometry(0.06, n + 0.1, 0.03);
        const cone = new THREE.ConeGeometry(0.22, 0.4, 3);
        this.disposables.push(mat, top, front, cone);
        const a = new THREE.Mesh(top, mat);
        a.position.set(0, n / 2 + 0.03, 0);
        const b = new THREE.Mesh(front, mat);
        b.position.set(0, 0, n / 2 + 0.03);
        const c = new THREE.Mesh(cone, mat);
        c.rotation.x = Math.PI;
        c.position.set(0, n / 2 + 0.55, n / 2 - 0.2);
        g.add(a, b, c);
        this.scene.add(g);
        return g;
      };
      this.hands = { left: make(0x38bdf8), right: make(0xfbbf24) };
    }
    if (this.hands) {
      this.hands.left.visible = !!layers;
      this.hands.right.visible = !!layers;
      if (layers) {
        this.hands.left.position.x = -this.n / 2 + layers.left;
        this.hands.right.position.x = this.n / 2 - layers.right;
      }
    }
    this.invalidate();
  }

  // ---------------------------------------------------------------- 보기

  /** 보는 각(도). yaw는 위에서 봐서 오른쪽으로 돈 각, pitch는 위로 올라간 각 */
  setView(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.invalidate();
  }

  /** 끌어 돌린 보기를 처음 각으로 천천히 되돌린다(`keepView`일 때 쓴다) */
  resetView(): void {
    if (this.drag) return;
    if (this.dragYaw === 0 && this.dragPitch === 0) return;
    this.returning = {
      start: performance.now(),
      yaw: this.dragYaw,
      pitch: this.dragPitch,
    };
    this.invalidate();
  }

  /** 끌어 돌린 보기가 처음 각에서 벗어나 있는지 */
  get viewTurned(): boolean {
    return this.dragYaw !== 0 || this.dragPitch !== 0;
  }

  /** 보기가 움직이는 중인지(끄는 중이거나 처음 각으로 돌아가는 중). 화면 시험이 멈출 때를 기다린다 */
  get viewMoving(): boolean {
    return this.drag !== null || this.returning !== null;
  }

  /**
   * 큐브 겉의 점(세계 좌표)의 화면 좌표(client px). 그 점이 붙은 면(`normal`)이 카메라 반대쪽을 보면 null.
   * 화면 시험이 3D 칸을 누를 때 쓴다
   */
  pointClient(
    point: readonly [number, number, number],
    normal: readonly [number, number, number],
  ): { x: number; y: number } | null {
    this.placeCamera();
    this.camera.updateMatrixWorld();
    const p = new THREE.Vector3(...point);
    const toCamera = this.camera.position.clone().sub(p);
    if (toCamera.dot(new THREE.Vector3(...normal)) <= 0) return null;
    const w = p.project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((w.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - w.y) / 2) * rect.height,
    };
  }

  /**
   * 화면에서 큐브와 (보이는) 거울 판이 차지하는 사각형(캔버스 안 CSS px, 왼쪽 위 기준). 맥 앱 Cubie의 투명 창이
   * 이 밖의 누르기를 아래 앱으로 넘길 때 쓴다. 층을 돌리는 중에 모서리가 조금 나와도 들어가게 여유를 둔다
   */
  hitRects(): { x: number; y: number; w: number; h: number }[] {
    this.placeCamera();
    this.camera.updateMatrixWorld();
    const rectOf = (points: readonly (readonly [number, number, number])[]) => {
      let x0 = Number.POSITIVE_INFINITY;
      let y0 = Number.POSITIVE_INFINITY;
      let x1 = Number.NEGATIVE_INFINITY;
      let y1 = Number.NEGATIVE_INFINITY;
      for (const p of points) {
        const w = tmpV.set(p[0], p[1], p[2]).project(this.camera);
        const x = ((w.x + 1) / 2) * this.width;
        const y = ((1 - w.y) / 2) * this.height;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const h = (this.n / 2) * 1.15;
    const corners: [number, number, number][] = [];
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) corners.push([sx * h, sy * h, sz * h]);
    const out = [rectOf(corners)];
    if (this.mirror && this.mirrorVisible) {
      const e = this.n / 2 + MIRROR_PAD;
      for (const p of this.mirror.panels)
        out.push(
          rectOf([
            cellPoint(p, -e, -e),
            cellPoint(p, -e, e),
            cellPoint(p, e, -e),
            cellPoint(p, e, e),
          ]),
        );
    }
    return out;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const dpr =
      typeof window === "undefined" ? 1 : (window.devicePixelRatio ?? 1);
    this.renderer.setPixelRatio(Math.min(dpr, this.maxDpr));
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
    this.frameMesh.dispose();
    this.mirror?.cells.dispose();
    this.mirror?.marks.dispose();
    for (const p of this.mirror?.patterns ?? []) p.mesh.dispose();
    for (const p of this.patternMeshes) p.mesh.dispose();
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
      this.stickerMaterial.clearcoat = this.stickerless ? 0.2 : 0.35;
      this.stickerMaterial.roughness = this.stickerless ? 0.45 : 0.4;
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
      this.frameMesh.setColorAt(
        i,
        color.setHex(s.mark ? MARK_COLOR[s.mark] : 0xffffff),
      );
    });
    if (this.stickerMesh.instanceColor)
      this.stickerMesh.instanceColor.needsUpdate = true;
    if (this.frameMesh.instanceColor)
      this.frameMesh.instanceColor.needsUpdate = true;
    this.frameMesh.visible = this.slots.some((s) => s.mark !== null);
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
    tmpV.add(c.shift);
    tmpS.setScalar(c.scale);
    tmpM.compose(tmpV, tmpQ, tmpS);
    this.body.setMatrixAt(i, c.body ? tmpM : ZERO);
    for (const si of c.stickers) {
      const slot = this.slots[si];
      if (!slot) continue;
      tmpM2.multiplyMatrices(tmpM, slot.local);
      this.stickerMesh.setMatrixAt(si, tmpM2);
      this.frameMesh.setMatrixAt(si, slot.mark ? tmpM2 : ZERO);
      if (this.patterns) {
        const want = slot.color === null ? null : this.patterns[slot.color];
        for (const p of this.patternMeshes)
          p.mesh.setMatrixAt(si, p.key === want ? tmpM2 : ZERO);
      }
    }
    for (const p of this.patternMeshes)
      p.mesh.instanceMatrix.needsUpdate = true;
    this.body.instanceMatrix.needsUpdate = true;
    this.stickerMesh.instanceMatrix.needsUpdate = true;
    this.frameMesh.instanceMatrix.needsUpdate = true;
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
    this.writeMirror();
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
      const base = moveDuration(this.effectiveMs(), m);
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

    // 놓임(벌리기·날아오기)
    const la = this.layoutAnim;
    if (la) {
      const p = clamp((now - la.start) / la.ms, 0, 1);
      const e = easeInOut(p);
      this.cubies.forEach((c, i) => {
        c.shift.lerpVectors(c.from.shift, c.to.shift, e);
        c.scale = c.from.scale + (c.to.scale - c.from.scale) * e;
        this.writeCubie(i);
      });
      if (p >= 1) this.layoutAnim = null;
      else busy = true;
    }

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
    const yawDeg = this.yaw + this.dragYaw;
    const pitchDeg = clamp(
      this.pitch + this.dragPitch,
      -PITCH_LIMIT,
      PITCH_LIMIT,
    );
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    const pitch = THREE.MathUtils.degToRad(pitchDeg);
    // 큐브를 감싸는 공이 화면 짧은 쪽에 들어가도록 거리를 잡는다
    const radius = (this.n * Math.sqrt(3)) / 2;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    let dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.02;
    const target = new THREE.Vector3();
    // 거울 판: 기준 각에 가까울수록 판이 짙고, 카메라는 판까지 담는 자리로 물러난다
    const shown = this.mirrorReady() ? mirrorAlpha(yawDeg, pitchDeg) : 0;
    if (shown !== this.mirrorShown) {
      this.mirrorShown = shown;
      this.applyMirrorAlpha();
    }
    if (this.mirror && shown > 0) {
      const f: Frame = mirrorFrame(
        this.n,
        this.mirror.panels,
        this.camera.aspect,
        this.camera.fov,
      );
      const e = easeInOut(shown);
      dist += (f.dist - dist) * e;
      target.set(...f.target).multiplyScalar(e);
    }
    this.camera.position.set(
      target.x + dist * Math.cos(pitch) * Math.sin(yaw),
      target.y + dist * Math.sin(pitch),
      target.z + dist * Math.cos(pitch) * Math.cos(yaw),
    );
    this.camera.lookAt(target);
  }

  /** 판을 보일 수 있는지: 켰고, 조각을 벌리거나 숨긴 놓임(분해·조각 보기)이 아니다 */
  private mirrorReady(): boolean {
    if (!this.mirrorOn || !this.mirror) return false;
    return this.cubies.every(
      (c) =>
        c.body &&
        c.to.scale === 1 &&
        c.to.shift.lengthSq() < 1e-6 &&
        c.shift.lengthSq() < 1e-6,
    );
  }

  private applyMirrorAlpha(): void {
    const m = this.mirror;
    if (!m) return;
    const a = this.mirrorShown;
    m.group.visible = a > 0.01;
    m.plateMat.opacity = a;
    m.cellMat.opacity = a;
    m.markMat.opacity = a;
    this.canvas.dataset.cubeMirror = a > 0.5 ? "on" : "off";
  }

  private buildMirror(): Mirror {
    const n = this.n;
    const panels = mirrorPanels(n);
    const group = new THREE.Group();
    const tex = glassTexture();
    const plateMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const plateSize = (n + MIRROR_PAD * 2) * MIRROR_CELL;
    const plateGeo = new THREE.PlaneGeometry(plateSize, plateSize);
    const cellGeo = new THREE.ShapeGeometry(
      roundedRect(0.86 * MIRROR_CELL, 0.12 * MIRROR_CELL),
      this.spec.curveSegments,
    );
    const ring = roundedRect(0.98 * MIRROR_CELL, 0.16 * MIRROR_CELL);
    ring.holes.push(
      new THREE.Path(
        roundedRect(0.7 * MIRROR_CELL, 0.1 * MIRROR_CELL)
          .getPoints(this.spec.curveSegments)
          .reverse(),
      ),
    );
    const markGeo = new THREE.ShapeGeometry(ring, this.spec.curveSegments);
    const cellMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const markMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.disposables.push(
      tex,
      plateMat,
      plateGeo,
      cellGeo,
      markGeo,
      cellMat,
      markMat,
    );
    const basis = (p: MirrorPanel, at: readonly number[], lift: number) =>
      new THREE.Matrix4()
        .makeBasis(
          new THREE.Vector3(...p.right),
          new THREE.Vector3(...p.up),
          new THREE.Vector3(...p.facing),
        )
        .setPosition(
          (at[0] ?? 0) + p.facing[0] * lift,
          (at[1] ?? 0) + p.facing[1] * lift,
          (at[2] ?? 0) + p.facing[2] * lift,
        );
    for (const p of panels) {
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.matrixAutoUpdate = false;
      plate.matrix.copy(basis(p, p.center, 0));
      plate.renderOrder = 1;
      group.add(plate);
    }
    const count = panels.length * n * n;
    const cells = new THREE.InstancedMesh(cellGeo, cellMat, count);
    const marks = new THREE.InstancedMesh(markGeo, markMat, count);
    cells.renderOrder = 2;
    marks.renderOrder = 3;
    const index = new Map<string, number>();
    const h = (n - 1) / 2;
    let k = 0;
    for (const p of panels)
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const u = j - h;
          const v = i - h;
          index.set(`${p.normal}:${u}:${v}`, k);
          cells.setMatrixAt(k, basis(p, cellPoint(p, u, v), 0.004));
          marks.setMatrixAt(k, ZERO);
          k++;
        }
    const patternGeo = new THREE.PlaneGeometry(
      0.8 * MIRROR_CELL,
      0.8 * MIRROR_CELL,
    );
    this.disposables.push(patternGeo);
    const patterns = PATTERN_KEYS.map((key) => {
      const tex = patternTexture(key);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      this.disposables.push(tex, mat);
      const mesh = new THREE.InstancedMesh(patternGeo, mat, count);
      mesh.renderOrder = 3;
      for (let i = 0; i < count; i++) mesh.setMatrixAt(i, ZERO);
      return { key, mesh };
    });
    for (const m of [cells, marks, ...patterns.map((p) => p.mesh)]) {
      m.frustumCulled = false;
      group.add(m);
    }
    group.visible = false;
    this.scene.add(group);
    return {
      panels,
      group,
      plateMat,
      cells,
      cellMat,
      marks,
      markMat,
      patterns,
      index,
    };
  }

  /** 지금 조각 자리에서 세계의 스티커(조각 중심·향하는 쪽·색·표시)를 읽는다 */
  private worldStickers(): Sticker[] {
    return this.slots.map((s) => {
      const c = this.cubies[s.cubie] as Cubie;
      const nv = new THREE.Vector3(...normalVec(s.normal)).applyQuaternion(
        c.quat,
      );
      const ax = Math.abs(nv.x);
      const ay = Math.abs(nv.y);
      const az = Math.abs(nv.z);
      const normal = (
        ax >= ay && ax >= az
          ? `${nv.x > 0 ? "+" : "-"}x`
          : ay >= az
            ? `${nv.y > 0 ? "+" : "-"}y`
            : `${nv.z > 0 ? "+" : "-"}z`
      ) as Normal;
      return {
        center: [c.pos.x + 0, c.pos.y + 0, c.pos.z + 0],
        normal,
        color: s.color,
        mark: s.mark,
      };
    });
  }

  /** 판 칸의 색·표시를 지금 상태로 다시 칠한다 */
  private writeMirror(): void {
    const m = this.mirror;
    if (!m) return;
    const color = new THREE.Color();
    for (const c of mirrorCells(this.worldStickers())) {
      const k = m.index.get(`${c.panel}:${c.u}:${c.v}`);
      if (k === undefined) continue;
      const hex =
        c.color === null
          ? HIDDEN_COLOR[this.hidden]
          : (this.colors[c.color] ?? HIDDEN_COLOR[this.hidden]);
      m.cells.setColorAt(k, color.setHex(hex).multiplyScalar(MIRROR_TINT));
      m.marks.setColorAt(
        k,
        color.setHex(c.mark ? MARK_COLOR[c.mark] : 0xffffff),
      );
      if (c.mark) {
        m.cells.getMatrixAt(k, tmpM);
        tmpM2.makeTranslation(0, 0, 0.004);
        m.marks.setMatrixAt(k, tmpM.multiply(tmpM2));
      } else m.marks.setMatrixAt(k, ZERO);
      const want =
        this.patterns && c.color !== null ? this.patterns[c.color] : null;
      for (const p of m.patterns) {
        if (p.key === want) {
          m.cells.getMatrixAt(k, tmpM);
          tmpM2.makeTranslation(0, 0, 0.003);
          p.mesh.setMatrixAt(k, tmpM.multiply(tmpM2));
        } else p.mesh.setMatrixAt(k, ZERO);
      }
    }
    for (const p of m.patterns) p.mesh.instanceMatrix.needsUpdate = true;
    if (m.cells.instanceColor) m.cells.instanceColor.needsUpdate = true;
    if (m.marks.instanceColor) m.marks.instanceColor.needsUpdate = true;
    m.marks.instanceMatrix.needsUpdate = true;
    this.mirrorShown = -1;
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

  /** 끄는 동안 손가락이 캔버스 밖으로 나가도 이어 받는다. 이미 끝난 포인터면 브라우저가 던지므로 넘긴다 */
  private capture(pointerId: number, on: boolean): void {
    try {
      if (on) this.canvas.setPointerCapture?.(pointerId);
      else this.canvas.releasePointerCapture?.(pointerId);
    } catch {
      // 붙잡지 못해도 밀기·끌기는 캔버스 안에서 그대로 된다
    }
  }

  /** 화면의 한 점 아래 큐브 겉의 칸(큐브를 감싼 상자와 만나는 점으로 정한다). 빈 곳이면 null */
  private hitAt(
    clientX: number,
    clientY: number,
    panels = false,
  ): SwipeHit | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.placeCamera();
    this.camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const h = this.n / 2;
    const box = new THREE.Box3(
      new THREE.Vector3(-h, -h, -h),
      new THREE.Vector3(h, h, h),
    );
    const p = ray.ray.intersectBox(box, new THREE.Vector3());
    if (p) return cellOfPoint(this.n, [p.x, p.y, p.z]);
    // 거울 판 위 칸: 그 칸이 비추는 큐브 칸을 누른 것과 같다
    if (!panels || !this.mirror || !this.mirrorVisible) return null;
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    for (const panel of this.mirror.panels) {
      const at = rayPanel(panel, [o.x, o.y, o.z], [d.x, d.y, d.z]);
      if (!at) continue;
      const hit = mirrorHitAt(this.n, panel, at.point);
      if (hit) return hit;
    }
    return null;
  }

  /** 누르기(거의 움직이지 않고 뗌): 그 점 아래 칸을 알린다 */
  private tap(clientX: number, clientY: number): void {
    if (!this.onTap) return;
    const hit = this.hitAt(clientX, clientY, true);
    if (hit) this.onTap(hit);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.drag || this.gesture) return;
    const mouse = e.pointerType === "mouse";
    if (this.onSwipe && (!mouse || this.swipeMouse)) {
      // 마우스로 돌리기를 켠 사람의 마우스 끌기는 늘 큐브 전체(칸 위여도)
      this.gesture = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        hit: mouse ? null : this.hitAt(e.clientX, e.clientY),
        done: false,
      };
      this.capture(e.pointerId, true);
      return;
    }
    this.drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      x0: e.clientX,
      y0: e.clientY,
    };
    this.returning = null;
    this.capture(e.pointerId, true);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const g = this.gesture;
    if (g && g.id === e.pointerId) {
      if (g.done) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.hypot(dx, dy) < SWIPE_PX) return;
      g.done = true;
      // 화면에서 민 방향을 세계 좌표로: 카메라의 오른쪽·위 방향(화면 y는 아래로 커진다)
      this.placeCamera();
      this.camera.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(
        this.camera.matrixWorld,
        0,
      );
      const up = new THREE.Vector3().setFromMatrixColumn(
        this.camera.matrixWorld,
        1,
      );
      const swipe = right.multiplyScalar(dx).addScaledVector(up, -dy);
      const toward = this.camera.position.clone().normalize();
      const move = swipeToMove(
        this.n,
        g.hit,
        [swipe.x, swipe.y, swipe.z],
        [toward.x, toward.y, toward.z],
      );
      if (move) this.onSwipe?.(move);
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.dragYaw -= (e.clientX - d.x) * 0.45;
    this.dragPitch += (e.clientY - d.y) * 0.45;
    if (this.keepView) {
      // 남겨 두는 보기: 옆으로는 끝없이 돌고(한 바퀴마다 감음), 위아래는 보이는 끝에서 멈춘다(거꾸로 끌면 바로 움직인다)
      this.dragYaw = ((((this.dragYaw + 180) % 360) + 360) % 360) - 180;
      this.dragPitch = clamp(
        this.dragPitch,
        -PITCH_LIMIT - this.pitch,
        PITCH_LIMIT - this.pitch,
      );
    } else {
      this.dragYaw = clamp(this.dragYaw, -180, 180);
      this.dragPitch = clamp(this.dragPitch, -PITCH_LIMIT * 2, PITCH_LIMIT * 2);
    }
    d.x = e.clientX;
    d.y = e.clientY;
    this.invalidate();
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.gesture && this.gesture.id === e.pointerId) {
      const tapped = !this.gesture.done;
      this.gesture = null;
      this.capture(e.pointerId, false);
      if (tapped) this.tap(e.clientX, e.clientY);
      return;
    }
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const d = this.drag;
    this.drag = null;
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < SWIPE_PX)
      this.tap(e.clientX, e.clientY);
    this.capture(e.pointerId, false);
    if (!this.keepView)
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
