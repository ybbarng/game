import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import {
  buildSizedCoreModel,
  type ModelSize,
  modelBounds,
} from "./core-model-sizes";
import { dragYaw, nextYaw, restYawFor, type SpinState } from "./core-spin";

/**
 * 다른 크기 모델의 그림 범위 반지름(modelBounds, 가운데에서 가장 먼 꼭짓점까지)을 이만큼으로 맞춰 3×3과 같은 카메라로
 * 본다. 3×3은 4.75(가운데 원점)이지만 먼 꼭짓점이 대각선 코너 블럭뿐이라 틀에 든다. 다른 크기는 한 바퀴 도는 동안
 * 틀 밖으로 나가지 않게 조금 작게
 */
const FIT_RADIUS = 4.2;

/**
 * 분해한 큐브의 속(3D, 큐브의 기초 `/cube/basics` 맨 위, docs/47 16-27). 해법 지도 시안(2026-11-25 사용자 「내부 축이랑,
 * 그것과 분리된 센터 블럭 6개, 그리고 코너 블럭 한 개, 엣지 블럭 한 개… 3D 모델로」)에서 옮겼다.
 *
 * - 심(가운데 덩이와 여섯 축, 축 끝의 나사·스프링), 축 끝에서 떨어진 센터 블럭 여섯.
 * - 코너 블럭(흰-초록-빨강)은 제 코너 자리 방향(위-앞-오른쪽 대각선), 엣지 블럭(흰-초록)은 제 엣지 자리 방향
 *   (위-앞 모서리 가운데)으로 떼어 놓는다. 스티커는 그 자리에서 바깥을 보는 면 그대로다(2026-11-26 사용자 「엣지 조각이
 *   코너 위치에 있는 것 같은데, 엣지 위치 기준으로 배치해 줘」).
 * - 조각 안쪽 생김새는 실제 루빅스 큐브 구조를 자료로 확인해 따른다(2026-11-26 사용자 「조금 어색해 보여서 좀 더 실제
 *   같으면」, 출처는 docs/47 16-27). 도형은 core-model.ts. 2×2·4×4·5×5는 core-model-sizes.ts(docs/47 16-36).
 * - 세로축으로 천천히 한 바퀴씩 돈다(40초에 한 바퀴, 2026-11-26 사용자 「회전을 더 시켜서 엣지 반대쪽도 보이게」).
 *   끌어 돌리면 따라 돌고, 놓으면 그 각도에서 잠시 뒤 다시 돈다. 동작 줄이기면 다리가 잘 보이는 각도에 멈춘다(끌어
 *   돌리기는 된다). 화면 밖이면 그리지 않는다.
 *
 * 조각 생김새(둥근 몸통·스티커 판·재질·빛)는 큐브 장면(cube-view.ts)과 같은 값을 쓴다. 다리·심도 몸통과 같은 검은
 * 플라스틱이고, 나사·스프링만 쇠다. 정적 도형은 재질별로 합쳐 한 장에 그리기 여덟 번 안쪽이다. 반사 세기는 재질이
 * 아니라 장면 `environmentIntensity`로 둔다(docs/standing-rules.md 4절). three.js를 담으므로 `loadCoreScene()`으로
 * 늦게 부른다.
 */

export interface CoreSceneOptions {
  /** 면 번호(U R F D L B)별 색 */
  colors: readonly number[];
  /** 큐브 크기(2~5, 기본 3). 짜임은 core-model-sizes.ts */
  n?: ModelSize;
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
  private readonly spin: SpinState;
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
    const n = o.n ?? 3;
    this.spin = { yaw: restYawFor(n), releasedAt: null, dragging: false };
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
    // 뒤에서 비추는 빛: 검은 몸통·다리·심의 둘레가 바탕에서 갈려 보이게
    const rim = new THREE.DirectionalLight(0xffffff, 1.4);
    rim.position.set(-3, 4, -5);
    // 아래에서 올려 비추는 약한 빛: 가운데를 향한 다리(발 안쪽 면)가 검게 뭉개지지 않게
    const under = new THREE.DirectionalLight(0xffffff, 0.55);
    under.position.set(1, -5, 2);
    this.scene.add(sky, key, right, left, rim, under, this.group);

    const body = new THREE.MeshPhysicalMaterial({
      color: 0x0d0d0f,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.45,
      // 통·받침처럼 돌려 만든 도형은 안쪽 면도 보인다
      side: THREE.DoubleSide,
    });
    // 나사·스프링(쇠)
    const metal = new THREE.MeshPhysicalMaterial({
      color: 0xb4b6bc,
      roughness: 0.35,
      metalness: 1,
    });
    this.disposables.push(body, metal);

    const model = buildSizedCoreModel(n);
    // 크기마다 그림 범위가 달라 3×3과 같은 크기로 맞추고, 제 가운데를 축으로 돌게 한다(3×3은 그대로)
    const fit = new THREE.Group();
    if (n !== 3) {
      const s = modelBounds(model);
      fit.position.copy(s.center).negate();
      this.group.scale.setScalar(FIT_RADIUS / s.radius);
    }
    this.group.add(fit);
    this.disposables.push(model.body);
    fit.add(new THREE.Mesh(model.body, body));
    if (model.metal) {
      this.disposables.push(model.metal);
      fit.add(new THREE.Mesh(model.metal, metal));
    }
    for (const [face, g] of model.stickers) {
      const m = new THREE.MeshPhysicalMaterial({
        color: o.colors[face] ?? 0xffffff,
        roughness: 0.4,
        metalness: 0,
        clearcoat: 0.35,
        clearcoatRoughness: 0.22,
      });
      this.disposables.push(g, m);
      fit.add(new THREE.Mesh(g, m));
    }

    // 위·앞·오른쪽이 보이는 비스듬한 각(큐브 장면 기본 각과 비슷하게). 큐브가 도니 멀찍이
    const yaw = THREE.MathUtils.degToRad(36);
    const pitch = THREE.MathUtils.degToRad(30);
    // 한 바퀴 도는 동안 가장 먼 코너 블럭까지 틀 안에 들게
    const dist = 15.5;
    this.camera.position.set(
      dist * Math.cos(pitch) * Math.sin(yaw),
      dist * Math.sin(pitch),
      dist * Math.cos(pitch) * Math.cos(yaw),
    );
    this.camera.lookAt(0, 0.5, 0);

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
    // 한 장에 그린 횟수(화면 시험이 가벼운지 본다)
    this.canvas.dataset.coreCalls = String(this.renderer.info.render.calls);
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
