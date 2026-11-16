import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import {
  MAT_RADIUS,
  poseAt,
  rng,
  STICK_LENGTH,
  STICK_RADIUS,
  type TossPlan,
} from "./sim";

/**
 * 윷 던지기 3D 장면(docs/37 14절). 윷놀이 화면이 처음 3D 멍석을 띄울 때만 늦게 불러(동적 import) 다른 화면 묶음에는
 * three.js가 실리지 않는다. 결(멍석 짚·나무결·윷 표시)과 빛은 모두 코드로 만든다(바깥 그림 없음).
 *
 * - 카메라는 고정이다(던지는 동안 확대·축소 없음). 멍석 앞쪽(+z)이 내 자리다.
 * - 던지는 동안에만 매 프레임 그리고, 멈춰 있으면 바뀔 때 한 번만 그린다. 화면 밖이거나 말 옮기는 장면이면 그리지 않는다.
 * - 그리기 한 장 시간을 재어(`stats`) 너무 느리면 다음 던지기부터 해상도를 낮춘다.
 * - 재질에 반사 세기를 따로 두지 않는다(장면 `environmentIntensity`만, docs/standing-rules.md 4절).
 */

export interface TossCallbacks {
  /** 가락이 멍석에 닿았다(세기 0~1) */
  onImpact?: (stick: number, strength: number) => void;
  /** 가락 하나가 멈췄다 */
  onStop?: (stick: number) => void;
  /** 네 가락이 모두 멈췄다 */
  onDone?: () => void;
}

export interface FrameStats {
  /** 잰 장 수 */
  frames: number;
  /** 그리기 한 장 평균·95번째 백분위·가장 긴 시간(ms) */
  average: number;
  p95: number;
  max: number;
  /** 지난 연출의 화면 간격(requestAnimationFrame 사이) 가운데값(ms) */
  gapMedian: number;
  /** 지금 해상도 배율 */
  pixelRatio: number;
}

export interface TossScene {
  /** 계획을 처음부터 재생한다(`startAt`은 performance.now 기준 시작 시각) */
  play(plan: TossPlan, callbacks: TossCallbacks, startAt?: number): void;
  /** 연출 없이 멈춘 자리만 보인다(계획이 없으면 가락을 숨긴다) */
  showRest(plan: TossPlan | null): void;
  /** 화면에 보일 때만 그린다 */
  setActive(active: boolean): void;
  resize(width: number, height: number): void;
  stats(): FrameStats;
  dispose(): void;
}

// ---------------------------------------------------------------- 결(텍스처)

function canvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d") as CanvasRenderingContext2D);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 멍석: 짚으로 꼰 줄을 가운데부터 둥글게 감아 엮은 결 */
function strawTexture(): THREE.CanvasTexture {
  const size = 1024;
  return canvasTexture(size, size, (g) => {
    const r = rng(20261117);
    const c = size / 2;
    g.fillStyle = "#b58c45";
    g.fillRect(0, 0, size, size);
    // 감긴 줄: 고리마다 밝고 어두운 짚이 번갈아 비스듬히 꼬인다
    const ring = 15;
    for (let rad = ring; rad < c; rad += ring) {
      const twists = Math.round((rad * Math.PI * 2) / 9);
      for (let i = 0; i < twists; i++) {
        const a = (i / twists) * Math.PI * 2;
        const tone = 150 + Math.floor(r() * 60);
        g.strokeStyle = `rgb(${tone + 40},${tone + 10},${Math.floor(tone * 0.45)})`;
        g.lineWidth = 3 + r() * 2;
        g.beginPath();
        g.moveTo(
          c + Math.cos(a) * (rad - ring * 0.42),
          c + Math.sin(a) * (rad - ring * 0.42),
        );
        const b = a + (0.9 / Math.max(rad, 30)) * 9;
        g.lineTo(
          c + Math.cos(b) * (rad + ring * 0.42),
          c + Math.sin(b) * (rad + ring * 0.42),
        );
        g.stroke();
      }
      // 줄 사이 어두운 골
      g.strokeStyle = "rgba(60,36,12,0.55)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(c, c, rad + ring / 2, 0, Math.PI * 2);
      g.stroke();
    }
    // 바깥 테두리는 짙게 감친다
    g.strokeStyle = "#5b3712";
    g.lineWidth = 22;
    g.beginPath();
    g.arc(c, c, c - 12, 0, Math.PI * 2);
    g.stroke();
  });
}

/** 윷가락 등(둥근 면): 짙은 나무결 */
function backTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 64, (g) => {
    const r = rng(7);
    g.fillStyle = "#7a4416";
    g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 40; i++) {
      const y = r() * 64;
      g.strokeStyle = `rgba(${40 + r() * 40},${18 + r() * 20},6,0.45)`;
      g.lineWidth = 0.6 + r() * 1.4;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(
        80,
        y + (r() - 0.5) * 6,
        170,
        y + (r() - 0.5) * 6,
        256,
        y + (r() - 0.5) * 4,
      );
      g.stroke();
    }
  });
}

/** 윷가락 배(평평한 면): 밝은 나무에 × 무늬 셋. 빽도 가락은 한쪽 끝에 검은 점 */
function bellyTexture(marked: boolean): THREE.CanvasTexture {
  return canvasTexture(512, 64, (g) => {
    const r = rng(marked ? 11 : 13);
    g.fillStyle = "#eed7a6";
    g.fillRect(0, 0, 512, 64);
    for (let i = 0; i < 24; i++) {
      const y = r() * 64;
      g.strokeStyle = `rgba(170,120,60,${0.15 + r() * 0.2})`;
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(512, y + (r() - 0.5) * 5);
      g.stroke();
    }
    g.strokeStyle = "#8a2a12";
    g.lineWidth = 6;
    g.lineCap = "round";
    for (const x of [150, 256, 362]) {
      g.beginPath();
      g.moveTo(x - 14, 18);
      g.lineTo(x + 14, 46);
      g.moveTo(x + 14, 18);
      g.lineTo(x - 14, 46);
      g.stroke();
    }
    if (marked) {
      g.fillStyle = "#151008";
      g.beginPath();
      g.arc(60, 32, 13, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** 바닥 그림자 한 장: 가운데가 짙고 가장자리로 흐려진다 */
function blobTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 32, (g) => {
    const grad = g.createRadialGradient(64, 16, 2, 64, 16, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.setTransform(1, 0, 0, 0.25, 0, 12);
    g.fillStyle = grad;
    g.fillRect(0, -48, 128, 128);
  });
}

// ---------------------------------------------------------------- 윷가락 모양

/** 길이 방향 자리에서 반지름(양 끝이 조금 가늘다) */
function taper(u: number): number {
  const k = Math.abs((2 * u) / STICK_LENGTH);
  return STICK_RADIUS * (1 - 0.24 * k ** 4);
}

/**
 * 윷가락 하나: 반원기둥. 등(둥근 면)과 양 끝 마구리는 짙은 나무, 배(평평한 면, 제 +y)는 밝은 나무.
 * 길이 방향이 제 x축. 법선은 모양에서 바로 셈한다(면 방향이 뒤집히지 않게 감는 차례를 맞춘다)
 */
function stickGeometries(): {
  back: THREE.BufferGeometry;
  belly: THREE.BufferGeometry;
} {
  const along = 18;
  const around = 14;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= along; i++) {
    const u = -STICK_LENGTH / 2 + (STICK_LENGTH * i) / along;
    const rho = taper(u);
    for (let j = 0; j <= around; j++) {
      const a = -Math.PI / 2 + (Math.PI * j) / around;
      pos.push(u, -rho * Math.cos(a), rho * Math.sin(a));
      nor.push(0, -Math.cos(a), Math.sin(a));
      uv.push(i / along, j / around);
    }
  }
  const row = around + 1;
  for (let i = 0; i < along; i++)
    for (let j = 0; j < around; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  // 양 끝 마구리(반원): +x 끝은 바깥이 +x가 되게 감는다
  for (const end of [-1, 1]) {
    const u = (end * STICK_LENGTH) / 2;
    const rho = taper(u);
    const centre = pos.length / 3;
    pos.push(u, 0, 0);
    nor.push(end, 0, 0);
    uv.push(0.5, 0.5);
    for (let j = 0; j <= around; j++) {
      const a = -Math.PI / 2 + (Math.PI * j) / around;
      pos.push(u, -rho * Math.cos(a), rho * Math.sin(a));
      nor.push(end, 0, 0);
      uv.push(0.5 + Math.sin(a) * 0.5, 0.5 - Math.cos(a) * 0.5);
    }
    for (let j = 0; j < around; j++) {
      const p = centre + 1 + j;
      if (end > 0) idx.push(centre, p + 1, p);
      else idx.push(centre, p, p + 1);
    }
  }
  const back = new THREE.BufferGeometry();
  back.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  back.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  back.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  back.setIndex(idx);

  // 배: 길이 방향으로 나눈 띠, 위(+y)를 본다
  const bp: number[] = [];
  const bn: number[] = [];
  const bu: number[] = [];
  const bi: number[] = [];
  for (let i = 0; i <= along; i++) {
    const u = -STICK_LENGTH / 2 + (STICK_LENGTH * i) / along;
    const rho = taper(u);
    bp.push(u, 0, -rho, u, 0, rho);
    bn.push(0, 1, 0, 0, 1, 0);
    bu.push(i / along, 0, i / along, 1);
  }
  for (let i = 0; i < along; i++) {
    const a = i * 2;
    bi.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  const belly = new THREE.BufferGeometry();
  belly.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
  belly.setAttribute("normal", new THREE.Float32BufferAttribute(bn, 3));
  belly.setAttribute("uv", new THREE.Float32BufferAttribute(bu, 2));
  belly.setIndex(bi);
  return { back, belly };
}

// ---------------------------------------------------------------- 장면

/** 화면에 담을 반지름(멍석 밖으로 나간 가락까지) */
const FRAME_RADIUS = 1.42;
/** 내려다보는 각(수평에서) */
const ELEVATION = (62 * Math.PI) / 180;
/** 해상도 배율 상한 */
const MAX_PIXEL_RATIO = 2;
/** 화면 간격 가운데값이 이보다 길면(또는 90번째가 1.5배를 넘으면) 다음 던지기부터 해상도를 낮춘다(ms, 60장/초는 16.7) */
const SLOW_GAP_MS = 22;

export function createTossScene(canvas: HTMLCanvasElement): TossScene {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environmentIntensity = 0.35;
  // 저녁 마당의 따뜻한 등불과 하늘
  scene.add(new THREE.HemisphereLight(0xffe7c2, 0x2a1408, 0.9));
  const lamp = new THREE.DirectionalLight(0xffd9a0, 1.6);
  lamp.position.set(-1.5, 4, 2.5);
  scene.add(lamp);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);

  // 멍석(둘레 마당은 화면 바탕이 그대로 보인다. 밖으로 나간 가락은 그림자로 바닥에 앉는다)
  const straw = strawTexture();
  const mat = new THREE.Mesh(
    new THREE.CircleGeometry(MAT_RADIUS, 96),
    new THREE.MeshStandardMaterial({ map: straw, roughness: 0.92 }),
  );
  mat.rotation.x = -Math.PI / 2;
  scene.add(mat);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(MAT_RADIUS, 0.018, 8, 96),
    new THREE.MeshStandardMaterial({ color: 0x4a2a0c, roughness: 0.9 }),
  );
  rim.rotation.x = -Math.PI / 2;
  scene.add(rim);

  // 윷가락 넷과 그림자
  const geo = stickGeometries();
  const backMaterial = new THREE.MeshStandardMaterial({
    map: backTexture(),
    roughness: 0.6,
  });
  const bellyMaterials = [true, false].map(
    (marked) =>
      new THREE.MeshStandardMaterial({
        map: bellyTexture(marked),
        roughness: 0.55,
      }),
  );
  const shadowTex = blobTexture();
  const sticks: THREE.Group[] = [];
  const shadows: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.Group();
    g.rotation.order = "YXZ";
    g.add(new THREE.Mesh(geo.back, backMaterial));
    g.add(
      new THREE.Mesh(
        geo.belly,
        bellyMaterials[k === 0 ? 0 : 1] as THREE.MeshStandardMaterial,
      ),
    );
    g.visible = false;
    scene.add(g);
    sticks.push(g);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(STICK_LENGTH * 1.3, STICK_RADIUS * 5),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.order = "YXZ";
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    shadow.visible = false;
    scene.add(shadow);
    shadows.push(shadow);
  }

  const place = (plan: TossPlan, t: number) => {
    for (let k = 0; k < 4; k++) {
      const p = poseAt(plan, k, t);
      const g = sticks[k] as THREE.Group;
      g.visible = true;
      g.position.set(p.x, p.y, p.z);
      g.rotation.set(p.roll, p.yaw, p.pitch);
      const s = shadows[k] as THREE.Mesh;
      s.visible = true;
      s.position.set(p.x, 0.002, p.z);
      s.rotation.set(-Math.PI / 2, p.yaw, 0);
      const lift = Math.max(0, p.y - STICK_RADIUS);
      const fade = 1 / (1 + lift * 3);
      (s.material as THREE.MeshBasicMaterial).opacity = fade;
      s.scale.setScalar(1 + lift * 0.6);
    }
  };

  // ---------------------------------------------------------- 그리기
  let active = false;
  let raf = 0;
  let dirty = true;
  let playing: {
    plan: TossPlan;
    callbacks: TossCallbacks;
    start: number;
    last: number;
    stopped: boolean[];
    /** 앞 장을 그린 시각과 이번 연출의 화면 간격들(ms) */
    prev: number | null;
    gaps: number[];
  } | null = null;
  let rest: TossPlan | null = null;
  const times: number[] = [];
  let lastGaps: number[] = [];

  const render = () => {
    const t0 = performance.now();
    renderer.render(scene, camera);
    const spent = performance.now() - t0;
    if (playing) {
      times.push(spent);
      if (times.length > 600) times.shift();
    }
  };

  const frame = (now: number) => {
    raf = 0;
    const p = playing;
    if (p) {
      const t = Math.max(0, (now - p.start) / 1000);
      place(p.plan, t);
      for (const hit of p.plan.impacts)
        if (hit.t > p.last && hit.t <= t)
          p.callbacks.onImpact?.(hit.stick, hit.strength);
      for (const [k, s] of p.plan.sticks.entries())
        if (!p.stopped[k] && s.stop <= t) {
          p.stopped[k] = true;
          p.callbacks.onStop?.(k);
        }
      p.last = t;
      if (p.prev !== null) p.gaps.push(now - p.prev);
      p.prev = now;
      render();
      if (t >= p.plan.duration) {
        playing = null;
        rest = p.plan;
        lastGaps = p.gaps;
        adapt(p.gaps);
        p.callbacks.onDone?.();
      } else if (active) raf = requestAnimationFrame(frame);
      return;
    }
    if (dirty) {
      dirty = false;
      render();
    }
  };

  const kick = () => {
    if (active && raf === 0) raf = requestAnimationFrame(frame);
  };

  /**
   * 지난 던지기의 화면 간격이 느렸으면 다음 던지기부터 해상도를 한 단계 낮춘다(1 아래로는 내리지 않는다).
   * CPU 쪽 그리기 시간만으로는 GPU가 느린 기기를 알 수 없어, 실제로 화면에 나온 간격(rAF 사이)으로 본다
   */
  const adapt = (gaps: readonly number[]) => {
    if (gaps.length < 10) return;
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] as number;
    const p90 = sorted[Math.floor(sorted.length * 0.9)] as number;
    if ((median > SLOW_GAP_MS || p90 > SLOW_GAP_MS * 1.5) && pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio * 0.75);
      renderer.setPixelRatio(pixelRatio);
      const size = renderer.getSize(new THREE.Vector2());
      renderer.setSize(size.x, size.y, false);
      // 크기를 다시 정하면 캔버스가 지워진다: 멈춘 윷을 바로 다시 그린다(다음 장 요청을 기다리면 결과를 보이는 동안 멍석이 빈다)
      dirty = false;
      render();
    }
  };

  return {
    play(plan, callbacks, startAt = performance.now()) {
      playing = {
        plan,
        callbacks,
        start: startAt,
        last: -1,
        stopped: [false, false, false, false],
        prev: null,
        gaps: [],
      };
      kick();
    },
    showRest(plan) {
      playing = null;
      rest = plan;
      if (plan) place(plan, plan.duration + 1);
      else for (const g of [...sticks, ...shadows]) g.visible = false;
      dirty = true;
      kick();
    },
    setActive(a) {
      if (a === active) return;
      active = a;
      if (!active) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        dirty = true;
        kick();
      }
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // 멍석 밖으로 나간 가락까지 가로·세로 모두 담기는 거리
      const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
      const reachH = FRAME_RADIUS / Math.tan(hHalf);
      const reachV = (FRAME_RADIUS * Math.sin(ELEVATION)) / Math.tan(vHalf);
      const distance = Math.max(reachH, reachV) * 1.02;
      camera.position.set(
        0,
        Math.sin(ELEVATION) * distance,
        Math.cos(ELEVATION) * distance,
      );
      camera.lookAt(0, 0, 0.08);
      camera.updateProjectionMatrix();
      if (rest && !playing) place(rest, rest.duration + 1);
      // 크기를 바꾸면 캔버스가 지워지므로 보이는 중이면 바로 다시 그린다(굴리는 중이면 다음 장이 그린다)
      if (active && !playing) {
        dirty = false;
        render();
      } else {
        dirty = true;
        kick();
      }
    },
    stats() {
      const sorted = [...times].sort((a, b) => a - b);
      const n = sorted.length;
      return {
        frames: n,
        average: n ? sorted.reduce((a, b) => a + b, 0) / n : 0,
        p95: n ? (sorted[Math.min(n - 1, Math.floor(n * 0.95))] as number) : 0,
        max: n ? (sorted[n - 1] as number) : 0,
        gapMedian: lastGaps.length
          ? ([...lastGaps].sort((a, b) => a - b)[
              Math.floor(lastGaps.length / 2)
            ] as number)
          : 0,
        pixelRatio,
      };
    },
    dispose() {
      active = false;
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          for (const v of Object.values(x))
            if (v instanceof THREE.Texture) v.dispose();
          x.dispose();
        }
      });
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
