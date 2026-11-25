import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { dragYaw, nextYaw, REST_YAW, type SpinState } from "./core-spin";

/**
 * 분해한 큐브의 속(3D, 큐브의 기초 `/cube/basics` 맨 위, docs/47 16-27). 해법 지도 시안(2026-11-25 사용자 「내부 축이랑,
 * 그것과 분리된 센터 블럭 6개, 그리고 코너 블럭 한 개, 엣지 블럭 한 개… 3D 모델로」)에서 옮겼다.
 *
 * - 가운데 공과 여섯 방향 축(심), 축 끝에서 떨어진 센터 블럭 여섯.
 * - 코너 블럭(흰-초록-빨강)은 제 코너 자리 방향(위-앞-오른쪽 대각선), 엣지 블럭(흰-초록)은 제 엣지 자리 방향
 *   (위-앞 모서리 가운데)으로 떼어 놓는다. 스티커는 그 자리에서 바깥을 보는 면 그대로다(2026-11-26 사용자 「엣지 조각이
 *   코너 위치에 있는 것 같은데, 엣지 위치 기준으로 배치해 줘」).
 * - 조각마다 안쪽 연결부를 그려 세 조각이 생김새로 갈린다(2026-11-26 사용자 「코너 블럭, 엣지 블럭 내부 연결부를 좀 더
 *   그려서 다르게 보이게」): 코너 블럭은 가운데로 뻗은 네모 기둥과 둥근 발, 엣지 블럭은 납작하고 넓은 혀와 양옆의
 *   홈(코너 발이 걸리는 곳), 센터 블럭은 축 끝을 향한 짧은 기둥과 나사 머리. 연결부는 몸통과 같은 검은 플라스틱이다.
 * - 세로축으로 천천히 한 바퀴씩 돈다(40초에 한 바퀴, 2026-11-26 사용자 「회전을 더 시켜서 엣지 반대쪽도 보이게」).
 *   끌어 돌리면 따라 돌고, 놓으면 그 각도에서 잠시 뒤 다시 돈다. 동작 줄이기면 엣지 블럭의 스티커와 혀가 함께 보이는
 *   각도에 멈춘다(끌어 돌리기는 된다). 화면 밖이면 그리지 않는다.
 *
 * 조각 생김새(둥근 몸통·스티커 판·재질·빛)는 큐브 장면(cube-view.ts)과 같은 값을 쓴다. 반사 세기는 재질이 아니라
 * 장면 `environmentIntensity`로 둔다(docs/standing-rules.md 4절). three.js를 담으므로 `loadCoreScene()`으로 늦게 부른다.
 */

/** cube-view.ts와 같은 조각 크기·둥글기·스티커 */
const CUBIE = 0.97;
const CUBIE_RADIUS = 0.1;
const STICKER = 0.8;
const STICKER_RADIUS = 0.1;
const LIFT = 0.004;
const HALF = CUBIE / 2;

/** 센터 블럭이 축 끝에서 떨어진 자리(가운데에서) */
const CENTER_AT = 2.05;
const ARM = 1.15;
/** 코너 블럭(세 축 모두 이만큼)·엣지 블럭(두 축 이만큼) 자리 */
const CORNER_AT = 2.3;
const EDGE_AT = 2.5;

type Axis = "+x" | "+y" | "+z" | "-x" | "-y" | "-z";
/** 축 → 면 번호(U R F D L B, 색 차례) */
const FACE_OF: Record<Axis, number> = {
  "+y": 0,
  "+x": 1,
  "+z": 2,
  "-y": 3,
  "-x": 4,
  "-z": 5,
};
const VEC: Record<Axis, [number, number, number]> = {
  "+x": [1, 0, 0],
  "-x": [-1, 0, 0],
  "+y": [0, 1, 0],
  "-y": [0, -1, 0],
  "+z": [0, 0, 1],
  "-z": [0, 0, -1],
};

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

/**
 * 조각 안 연결부의 틀: z축이 바깥(조각 자리 방향), -z가 큐브 가운데. `side`는 연결부 너비 방향(엣지 블럭은 엣지의
 * 긴 쪽)이다
 */
function inwardFrame(
  out: THREE.Vector3,
  side: THREE.Vector3,
): THREE.Quaternion {
  const z = out.clone().normalize();
  const x = side
    .clone()
    .sub(z.clone().multiplyScalar(side.dot(z)))
    .normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
}

export interface CoreSceneOptions {
  /** 면 번호(U R F D L B)별 색 */
  colors: readonly number[];
  /** 그리기를 잃으면(문맥 잃음) */
  onLost?: () => void;
}

export class CoreScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private raf = 0;
  private visible = true;
  private last = performance.now();
  private readonly spin: SpinState = {
    yaw: REST_YAW,
    releasedAt: null,
    dragging: false,
  };
  private dragX = 0;
  private dragYaw = 0;
  private readonly reduced: MediaQueryList | null;
  private readonly io: IntersectionObserver | null;
  private readonly offPointer: () => void;

  static create(canvas: HTMLCanvasElement, o: CoreSceneOptions): CoreScene {
    return new CoreScene(canvas, o);
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    o: CoreSceneOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    canvas.addEventListener("webglcontextlost", () => o.onLost?.());

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.disposables.push(env);
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.45;
    const sky = new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 0.7);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3, 5, 4);
    const right = new THREE.DirectionalLight(0xffffff, 0.75);
    right.position.set(5, 0.5, 1);
    const left = new THREE.DirectionalLight(0xffffff, 0.5);
    left.position.set(-4, 1, 3);
    // 뒤에서 비추는 빛: 검은 몸통·연결부의 둘레가 바탕에서 갈려 보이게
    const rim = new THREE.DirectionalLight(0xffffff, 1.4);
    rim.position.set(-3, 4, -5);
    this.scene.add(sky, key, right, left, rim, this.group);

    const body = new THREE.MeshPhysicalMaterial({
      color: 0x0d0d0f,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.45,
    });
    // 심은 플라스틱 뼈대라 몸통보다 조금 밝게(어두운 바탕에서 보이게)
    const core = new THREE.MeshPhysicalMaterial({
      color: 0x6c6c78,
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0.2,
    });
    const geo = <T extends { dispose(): void }>(g: T): T => {
      this.disposables.push(g);
      return g;
    };
    const boxGeo = geo(
      new RoundedBoxGeometry(CUBIE, CUBIE, CUBIE, 3, CUBIE_RADIUS),
    );
    const stickerGeo = geo(
      new THREE.ExtrudeGeometry(roundedRect(STICKER - 0.012, STICKER_RADIUS), {
        depth: 0.008,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.006,
        bevelSegments: 2,
        curveSegments: 6,
      }),
    );
    stickerGeo.translate(0, 0, 0.006 + HALF + LIFT);
    const ballGeo = geo(new THREE.SphereGeometry(0.44, 32, 20));
    const armGeo = geo(new THREE.CylinderGeometry(0.15, 0.15, ARM * 2, 20));
    this.disposables.push(body, core);

    const stickerMats = new Map<number, THREE.MeshPhysicalMaterial>();
    const stickerMat = (face: number) => {
      let m = stickerMats.get(face);
      if (!m) {
        m = new THREE.MeshPhysicalMaterial({
          color: o.colors[face] ?? 0xffffff,
          roughness: 0.4,
          metalness: 0,
          clearcoat: 0.35,
          clearcoatRoughness: 0.22,
        });
        stickerMats.set(face, m);
        this.disposables.push(m);
      }
      return m;
    };

    /** 몸통 재질의 둥근 상자 하나(연결부 조각). 틀의 z축을 따라 `z0`에서 `z1`까지(가운데 쪽이 음수) */
    const block = (
      w: number,
      h: number,
      z0: number,
      z1: number,
      x = 0,
      radius = 0.05,
    ) => {
      const m = new THREE.Mesh(
        geo(
          new RoundedBoxGeometry(
            w,
            h,
            Math.abs(z1 - z0),
            2,
            Math.min(radius, w / 2, h / 2),
          ),
        ),
        body,
      );
      m.position.set(x, 0, (z0 + z1) / 2);
      return m;
    };

    /** 조각 하나: 몸통 + 바깥 면 스티커 + 안쪽 연결부 */
    const piece = (
      at: [number, number, number],
      faces: Axis[],
      inner: THREE.Object3D,
    ) => {
      const g = new THREE.Group();
      g.position.set(...at);
      g.add(new THREE.Mesh(boxGeo, body));
      for (const f of faces) {
        const s = new THREE.Mesh(stickerGeo, stickerMat(FACE_OF[f]));
        // 스티커 판은 +z를 본다. 그 면 방향으로 돌린다
        s.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(...VEC[f]),
        );
        g.add(s);
      }
      g.add(inner);
      this.group.add(g);
      return g;
    };

    // 심: 가운데 공과 세 축(양쪽으로 뻗음)
    this.group.add(new THREE.Mesh(ballGeo, core));
    for (const [rx, rz] of [
      [0, 0],
      [0, Math.PI / 2],
      [Math.PI / 2, 0],
    ] as const) {
      const arm = new THREE.Mesh(armGeo, core);
      arm.rotation.set(rx, 0, rz);
      this.group.add(arm);
    }

    // 센터 블럭 여섯: 축 끝에서 떨어져 그 방향을 본다. 안쪽에 축 끝을 향한 짧은 기둥(나사 자리)과 나사 머리
    const postGeo = geo(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 20));
    postGeo.rotateX(Math.PI / 2);
    const capGeo = geo(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 24));
    capGeo.rotateX(Math.PI / 2);
    for (const a of Object.keys(VEC) as Axis[]) {
      const v = VEC[a];
      const inner = new THREE.Group();
      const post = new THREE.Mesh(postGeo, body);
      post.position.z = -HALF - 0.15;
      const cap = new THREE.Mesh(capGeo, body);
      cap.position.z = -HALF - 0.34;
      inner.add(post, cap);
      inner.quaternion.copy(
        inwardFrame(
          new THREE.Vector3(...v),
          new THREE.Vector3(v[1], v[2], v[0]),
        ),
      );
      piece([v[0] * CENTER_AT, v[1] * CENTER_AT, v[2] * CENTER_AT], [a], inner);
    }

    // 코너 블럭(흰-초록-빨강): 위-앞-오른쪽 대각선 방향. 가운데로 뻗은 네모 기둥과 끝의 둥근 발(이웃 엣지 블럭 아래로
    // 걸리는 곳)
    {
      const out = new THREE.Vector3(1, 1, 1);
      const reach = HALF * Math.sqrt(3);
      const inner = new THREE.Group();
      inner.add(block(0.3, 0.3, -0.1, -reach - 0.55, 0, 0.06));
      const foot = new THREE.Mesh(
        geo(new THREE.SphereGeometry(0.25, 24, 16)),
        body,
      );
      foot.scale.set(1, 1, 0.75);
      foot.position.z = -reach - 0.62;
      inner.add(foot);
      inner.quaternion.copy(inwardFrame(out, new THREE.Vector3(1, 0, -1)));
      piece([CORNER_AT, CORNER_AT, CORNER_AT], ["+y", "+z", "+x"], inner);
    }

    // 엣지 블럭(흰-초록): 위-앞 모서리 가운데 방향. 가운데로 뻗은 납작하고 넓은 혀, 끝의 넓은 발에는 양옆에 코너 발을
    // 받치는 홈(발 가운데만 몸통 쪽으로 두껍고 양옆은 가운데 쪽 끝만 남아 계단처럼 파인다)
    {
      const out = new THREE.Vector3(0, 1, 1);
      const reach = HALF * Math.SQRT2;
      const inner = new THREE.Group();
      const tip = -reach - 0.55;
      // 혀: 엣지 긴 쪽(x)으로 넓고, 두께는 얇게
      inner.add(block(0.6, 0.14, -0.1, tip + 0.1, 0, 0.05));
      // 발 가운데(두껍게)와 양옆 날개(가운데 쪽 끝만, 몸통 쪽에 홈이 남는다)
      inner.add(block(0.6, 0.26, tip + 0.2, tip - 0.14, 0, 0.06));
      for (const side of [-1, 1])
        inner.add(block(0.22, 0.26, tip - 0.04, tip - 0.14, side * 0.42, 0.05));
      inner.quaternion.copy(inwardFrame(out, new THREE.Vector3(1, 0, 0)));
      piece([0, EDGE_AT, EDGE_AT], ["+y", "+z"], inner);
    }

    // 위·앞·오른쪽이 보이는 비스듬한 각(큐브 장면 기본 각과 비슷하게). 큐브가 도니 멀찍이
    const yaw = THREE.MathUtils.degToRad(36);
    const pitch = THREE.MathUtils.degToRad(30);
    // 한 바퀴 도는 동안 가장 먼 코너 블럭까지 틀 안에 들게
    const dist = 17.5;
    this.camera.position.set(
      dist * Math.cos(pitch) * Math.sin(yaw),
      dist * Math.sin(pitch),
      dist * Math.cos(pitch) * Math.cos(yaw),
    );
    this.camera.lookAt(0, 0.35, 0);

    this.reduced =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    this.io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((es) => {
            this.visible = es.some((e) => e.isIntersecting);
            this.loop();
          });
    this.io?.observe(canvas);
    this.offPointer = this.listenPointer();
    this.resize();
    this.loop();
  }

  /** 끌어 돌리기(가로만, 세로로 밀면 페이지가 내려간다) */
  private listenPointer(): () => void {
    const c = this.canvas;
    c.style.touchAction = "pan-y";
    c.style.cursor = "grab";
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.spin.dragging = true;
      this.dragX = e.clientX;
      this.dragYaw = this.spin.yaw;
      c.setPointerCapture(e.pointerId);
      c.style.cursor = "grabbing";
      this.loop();
    };
    const move = (e: PointerEvent) => {
      if (!this.spin.dragging) return;
      this.spin.yaw = dragYaw(this.dragYaw, e.clientX - this.dragX);
      this.draw();
    };
    const up = () => {
      if (!this.spin.dragging) return;
      this.spin.dragging = false;
      this.spin.releasedAt = performance.now();
      c.style.cursor = "grab";
      this.loop();
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
    };
  }

  /** 지금 각도(라디안, 화면 시험·확인용) */
  get yaw(): number {
    return this.spin.yaw;
  }

  /** 캔버스 크기에 맞춘다 */
  resize(): void {
    const w = this.canvas.clientWidth || this.canvas.width || 1;
    const h = this.canvas.clientHeight || this.canvas.height || 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  private draw(): void {
    this.group.rotation.y = this.spin.yaw;
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.coreYaw = this.spin.yaw.toFixed(3);
  }

  /** 보일 때만, 움직일 때만 다음 장을 그린다 */
  private loop(): void {
    cancelAnimationFrame(this.raf);
    const reduced = this.reduced?.matches ?? false;
    if (!this.visible || (reduced && !this.spin.dragging)) {
      this.draw();
      return;
    }
    this.last = performance.now();
    const tick = (now: number) => {
      this.spin.yaw = nextYaw(this.spin, now, now - this.last, reduced);
      this.last = now;
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.offPointer();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
