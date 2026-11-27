import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  FACE_AXES,
  FIXED_555,
  HIDDEN_222,
  LAYOUT,
  type ModelSize,
  placedOf,
  scale3,
  type V3,
} from "./core-layout";
import {
  type Axis,
  buildCoreModel,
  type CoreModel,
  CUBIE,
  CUBIE_RADIUS,
  FACE_OF,
  HALF,
  Helix,
  plain,
  stickerGeometry,
  VEC,
  zCylinder,
  zTube,
} from "./core-model";

export type { ModelSize } from "./core-layout";

/**
 * 큐브의 기초 분해 모델의 크기별 도형(2×2·4×4·5×5, docs/47 16-36). 3×3은 core-model.ts 그대로다.
 *
 * 3×3 모델과 같은 원칙: 조각 종류마다 하나씩 심과 함께 떼어 놓고, 다리·발의 구면 값은 맞춘 큐브 자리(조각 한 칸 = 1,
 * 큐브 가운데가 원점)에서 잰 그대로 쓰며, 재질별로 합쳐 그린다. 조각은 맞춘 자리에서 만든 뒤 떼어 놓는 거리(`offset`)만큼
 * 옮긴다. 따른 짜임과 출처, 어림한 곳은 docs/47 16-36.
 * - 2×2: 지금 흔한 2×2(GAN 특허 CN207203423U, Giiker 특허 WO2020147757A1). 3×3처럼 축 끝에 나사·스프링으로 숨은
 *   센터 블럭 여섯, 센터 블럭 밑에 걸리는 숨은 엣지 블럭 열둘이 속 구를 이루고, 코너 블럭 여덟이 그 구를 덮는다.
 * - 4×4: 세베스테니 특허 꼴(US4421311, 원래 루빅스 4×4). 홈 난 공 심, 홈을 미끄러지는 센터 블럭 캠, 두 센터 블럭
 *   밑에 걸리는 날개의 비둘기꼬리, 날개의 받침에 얹히는 코너 블럭 캠. 날개 둘은 거울에 비친 꼴이다.
 * - 5×5: Eastsheen 꼴(천썬리 특허 US6129356). 축 끝 고정 센터 블럭 → 십자 쪽·대각선 쪽 센터 블럭 → 가운데 엣지 블럭,
 *   대각선 쪽 센터 블럭 → 날개 → 코너 블럭 차례로 바깥 조각이 안쪽 조각의 발을 덮는다.
 */

type R2 = readonly [number, number];

/** 2×2: 속 구(숨은 센터·엣지 블럭)와 코너 블럭이 덮는 면. 비는 좌표 ÷ 그 면 축 좌표 */
export const SHELL_222 = {
  /** 속 구 바깥 면 = 코너 블럭 안쪽 오목한 면 */
  sphere: 0.62,
  /** 숨은 센터 블럭 머리 */
  centerCap: [0.44, 0.62],
  /** 숨은 엣지 블럭 혀(센터 블럭 머리 밑) */
  edgeLip: [0.35, 0.44],
  /** 코너 블럭 혀(엣지 블럭 혀 밑) */
  cornerLip: [0.27, 0.35],
} as const;
/** 2×2 숨은 센터 블럭 머리의 반 폭(비) */
export const CAP_222 = 0.42;

/** 4×4: 홈 난 공과 조각 캠 */
export const SHELL_444 = {
  /** 공(홈 바닥) */
  ball: 0.5,
  /** 홈 사이 길잡이 여덟(공 위의 구면 삼각형) */
  guide: [0.64, 0.8],
  /** 센터 블럭 캠: 홈 바닥과 길잡이 사이 */
  centerCam: [0.52, 0.62],
  /** 날개 비둘기꼬리: 두 센터 블럭 몸통 밑 */
  dovetail: [1.0, 1.12],
  /** 날개 받침(코너 쪽 끝) */
  wingCam: [1.16, 1.32],
  /** 받침 코너 쪽 끝의 낮춘 면(코너 블럭 캠이 얹힌다) */
  wingRecess: 1.26,
  /** 코너 블럭 캠 */
  cornerCam: [1.27, 1.4],
} as const;
/** 4×4 홈 가장자리(비). 세 지름 평면을 따라 이 비 안쪽이 홈이다 */
export const GROOVE_444 = 0.36;

/** 5×5: 바깥 조각이 안쪽 조각의 발을 덮는 차례 */
export const SHELL_555 = {
  /** 고정 센터 블럭 밑면 접시 */
  dish: [1.36, 1.52],
  /** 십자 쪽·대각선 쪽 센터 블럭 발(접시 밑) */
  centerFoot: [1.22, 1.34],
  /** 가운데 엣지 블럭 발(십자 쪽 센터 블럭 밑) */
  edgeFoot: [1.08, 1.2],
  /** 날개 발(대각선 쪽 센터 블럭 밑) */
  wingFoot: [0.94, 1.06],
  /** 코너 블럭 발(날개 발 밑) */
  cornerFoot: [0.8, 0.92],
} as const;

const AXES = FACE_AXES as Axis[];
const scale = scale3;

type Kind = "body" | "metal";

/** 한 면(축 `k`, 부호 `s`) 위 구면 조각. `ranges`는 다른 두 축의 비(좌표 ÷ |k 축 좌표|) 범위, 가운데에서 rIn~rOut */
export function facePatch(
  k: 0 | 1 | 2,
  s: 1 | -1,
  ranges: Partial<Record<0 | 1 | 2, R2>>,
  rIn: number,
  rOut: number,
  seg = 8,
): THREE.BufferGeometry {
  const [i, j] = ([0, 1, 2] as const).filter((a) => a !== k) as [
    0 | 1 | 2,
    0 | 1 | 2,
  ];
  const ri = ranges[i] ?? [-1, 1];
  const rj = ranges[j] ?? [-1, 1];
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const d = [0, 0, 0];
  const v = new THREE.Vector3();
  for (let n = 0; n < p.count; n++) {
    const a = ri[0] + (p.getX(n) + 0.5) * (ri[1] - ri[0]);
    const b = rj[0] + (p.getY(n) + 0.5) * (rj[1] - rj[0]);
    const r = rIn + (p.getZ(n) + 0.5) * (rOut - rIn);
    d[k] = s;
    d[i] = a;
    d[j] = b;
    v.set(d[0] as number, d[1] as number, d[2] as number)
      .normalize()
      .multiplyScalar(r);
    p.setXYZ(n, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** 부호를 붙인 비 범위 [t, 1](부호가 음이면 [-1, -t]) */
const side = (sign: number, t: number, to = 1): R2 =>
  sign > 0 ? [t, to] : [-to, -t];

/** 한 꼭짓점 방향(세 부호) 둘레의 구면 삼각형: 세 면 모두 다른 두 축 비가 t 넘음 */
export function octantPatch(
  signs: V3,
  t: number,
  rIn: number,
  rOut: number,
): THREE.BufferGeometry[] {
  return ([0, 1, 2] as const).map((k) => {
    const ranges: Partial<Record<0 | 1 | 2, R2>> = {};
    for (const o of [0, 1, 2] as const)
      if (o !== k) ranges[o] = side(signs[o], t);
    return facePatch(k, signs[k] > 0 ? 1 : -1, ranges, rIn, rOut);
  });
}

/** 위(+y)·앞(+z) 사이 엣지 둘레 구면 조각: x 비는 `along`, 다른 면 쪽 비는 [t, 1] */
function upFrontPatch(
  along: R2,
  t: R2,
  rIn: number,
  rOut: number,
): THREE.BufferGeometry[] {
  return [
    facePatch(1, 1, { 0: along, 2: t }, rIn, rOut),
    facePatch(2, 1, { 0: along, 1: t }, rIn, rOut),
  ];
}

/** `from`에서 `to`까지 원기둥 */
function rod(from: V3, to: V3, r: number, seg = 16): THREE.BufferGeometry {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const g = zCylinder(r, 0, a.distanceTo(b), seg);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    b.clone().sub(a).normalize(),
  );
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** 축 방향 `axis`로 z축 도형을 돌린다 */
function alongAxis(g: THREE.BufferGeometry, axis: Axis): THREE.BufferGeometry {
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(...VEC[axis]),
    ),
  );
  return g;
}

/**
 * 안쪽 꼭짓점 쪽이 구면으로 오목한 조각 몸통(2×2 코너 블럭): 둥근 상자에서 큐브 가운데부터 `r` 안에 든 곳을 그 구면으로
 * 밀어낸다(코너 블럭이 속 구를 덮는다). 맞춘 자리 좌표로 낸다
 */
export function dimpledCubie(
  at: V3,
  r: number,
  seg = 24,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(CUBIE, CUBIE, CUBIE, seg, seg, seg);
  const p = g.attributes.position as THREE.BufferAttribute;
  const inner = HALF - CUBIE_RADIUS;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  const lo = new THREE.Vector3(-inner, -inner, -inner);
  const hi = new THREE.Vector3(inner, inner, inner);
  for (let n = 0; n < p.count; n++) {
    v.fromBufferAttribute(p, n);
    // 둥근 모서리(RoundedBoxGeometry와 같은 둥글기)
    c.copy(v).clamp(lo, hi);
    const d = v.clone().sub(c);
    if (d.lengthSq() > 0)
      v.copy(c).add(d.normalize().multiplyScalar(CUBIE_RADIUS));
    v.add(new THREE.Vector3(...at));
    if (v.length() < r) v.setLength(r);
    p.setXYZ(n, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** 재질별로 모아 합친다. 조각은 맞춘 자리에서 넣고, 지금 조각의 떼어 놓는 거리만큼 옮긴다 */
class Builder {
  private readonly lists: Record<Kind, THREE.BufferGeometry[]> = {
    body: [],
    metal: [],
  };
  private readonly stickers = new Map<number, THREE.BufferGeometry[]>();
  private readonly shift = new THREE.Vector3();
  private name: string | null = null;
  readonly parts = new Map<string, THREE.BufferGeometry[]>();
  private readonly box = new RoundedBoxGeometry(
    CUBIE,
    CUBIE,
    CUBIE,
    3,
    CUBIE_RADIUS,
  );
  private readonly sticker = stickerGeometry();

  constructor(private readonly keepParts: boolean) {}

  piece(name: string, offset: V3, draw: () => void): void {
    this.name = name;
    this.shift.set(...offset);
    draw();
    this.name = null;
    this.shift.set(0, 0, 0);
  }

  /** 도형(맞춘 자리)을 넣고 버린다 */
  add(kind: Kind, ...gs: THREE.BufferGeometry[]): void {
    for (const g of gs) {
      this.put(kind, g);
      g.dispose();
    }
  }

  private put(kind: Kind, g: THREE.BufferGeometry, m?: THREE.Matrix4): void {
    const p = plain(g);
    if (m) p.applyMatrix4(m);
    p.translate(this.shift.x, this.shift.y, this.shift.z);
    this.lists[kind].push(p);
    if (this.keepParts && kind === "body" && this.name) {
      const list = this.parts.get(this.name) ?? [];
      list.push(p.clone());
      this.parts.set(this.name, list);
    }
  }

  /** 조각 몸통(둥근 상자, 또는 `shape`)과 바깥 면 스티커 */
  cubie(at: V3, faces: Axis[], shape?: THREE.BufferGeometry): void {
    const pos = new THREE.Vector3(...at);
    if (shape) this.add("body", shape);
    else this.put("body", this.box, new THREE.Matrix4().makeTranslation(pos));
    for (const f of faces) {
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(...VEC[f]),
      );
      const p = plain(this.sticker);
      p.applyMatrix4(
        new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)),
      );
      p.translate(this.shift.x, this.shift.y, this.shift.z);
      const list = this.stickers.get(FACE_OF[f]) ?? [];
      list.push(p);
      this.stickers.set(FACE_OF[f], list);
    }
  }

  /** 맞춘 자리의 둥근 덩이(다리 몸) */
  lump(at: V3, size: V3, r = 0.05): void {
    const g = new RoundedBoxGeometry(size[0], size[1], size[2], 2, r);
    g.translate(...at);
    this.add("body", g);
  }

  finish(): SizedCoreModel {
    const merge = (list: THREE.BufferGeometry[]) => {
      const g = mergeGeometries(list);
      for (const l of list) l.dispose();
      if (!g) throw new Error("큐브 속 도형을 합치지 못했다");
      return g;
    };
    this.box.dispose();
    this.sticker.dispose();
    const parts = new Map(
      [...this.parts].map(([k, list]) => [k, merge(list)] as const),
    );
    return {
      body: merge(this.lists.body),
      metal: this.lists.metal.length ? merge(this.lists.metal) : null,
      stickers: new Map(
        [...this.stickers].map(([face, list]) => [face, merge(list)] as const),
      ),
      parts,
    };
  }
}

export interface SizedCoreModel extends CoreModel {
  /** 시험용: 조각 이름별 검은 플라스틱 도형(떼어 놓은 자리). `keepParts`일 때만 */
  parts: Map<string, THREE.BufferGeometry>;
}

/** 축 끝 나사(와 스프링): 축 끝 `from`에서 떼어 놓은 센터 블럭 통 바로 앞 `head`까지 */
function screw(
  b: Builder,
  axis: Axis,
  from: number,
  head: number,
  spring: { r: number; length: number } | null,
  r = 0.02,
): void {
  b.add(
    "metal",
    alongAxis(zCylinder(r, from, head, 10), axis),
    alongAxis(zCylinder(r * 2.6, head, head + 0.03, 16), axis),
  );
  if (spring) {
    const g = new THREE.TubeGeometry(
      new Helix(spring.r, spring.length, 6),
      140,
      spring.r * 0.2,
      6,
      false,
    );
    g.translate(0, 0, head - spring.length - 0.01);
    b.add("metal", alongAxis(g, axis));
  }
}

function build222(b: Builder): void {
  const S = SHELL_222;
  const A = CAP_222;
  b.piece("core", [0, 0, 0], () => {
    b.add("body", new THREE.SphereGeometry(0.12, 20, 14));
    for (const a of AXES) {
      b.add(
        "body",
        alongAxis(zCylinder(0.04, 0, 0.24), a),
        alongAxis(zCylinder(0.06, 0.16, 0.24), a),
      );
      // 축 끝 나사와 너트·스프링(GAN 특허: 너트와 센터 블럭 사이 스프링이 센터 블럭을 안으로 민다)
      screw(b, a, 0.18, 0.26 + HIDDEN_222.center - 0.06, {
        r: 0.045,
        length: 0.26,
      });
    }
  });
  // 숨은 센터 블럭 여섯: 나사가 지나는 통과 둥근 머리
  for (const a of AXES) {
    const k = "xyz".indexOf(a[1] as string) as 0 | 1 | 2;
    const s = a[0] === "+" ? 1 : -1;
    b.piece(`center${a}`, scale(VEC[a], HIDDEN_222.center), () => {
      b.add(
        "body",
        alongAxis(zTube(0.03, 0.07, 0.26, S.centerCap[0] + 0.005), a),
        facePatch(k, s, { 0: [-A, A], 1: [-A, A], 2: [-A, A] }, ...S.centerCap),
      );
    });
  }
  // 숨은 엣지 블럭(위-앞): 두 센터 블럭 사이 머리와, 두 센터 블럭 머리 밑으로 들어가는 혀
  const e = HIDDEN_222.edge;
  b.piece("edge", [0, e, e], () => {
    b.add(
      "body",
      ...upFrontPatch([-A, A], [A, 1], S.centerCap[0], S.sphere),
      ...upFrontPatch(
        [-A + 0.06, A - 0.06],
        [A - 0.16, A + 0.04],
        ...S.edgeLip,
      ),
    );
  });
  // 코너 블럭: 큰 몸통의 안쪽이 속 구를 덮어 오목하고, 그 아래 받침(속 구의 코너 자리)과 엣지 블럭 혀 밑 혀
  const c = placedOf(2, "corner");
  b.piece("corner", c.offset, () => {
    b.cubie(c.at, c.faces, dimpledCubie(c.at, S.sphere));
    const d = 1 / Math.sqrt(3);
    b.add(
      "body",
      ...octantPatch([1, 1, 1], A, S.centerCap[0], S.sphere),
      rod(scale([d, d, d], 0.3), scale([d, d, d], 0.46), 0.06),
      ...octantPatch([1, 1, 1], A - 0.16, ...S.cornerLip),
    );
  });
}

function build444(b: Builder): void {
  const S = SHELL_444;
  const G = GROOVE_444;
  // 심: 공과 홈 사이 길잡이 여덟, 공과 길잡이를 잇는 기둥
  b.piece("core", [0, 0, 0], () => {
    b.add("body", new THREE.SphereGeometry(S.ball, 32, 20));
    for (const sx of [1, -1])
      for (const sy of [1, -1])
        for (const sz of [1, -1]) {
          const d = new THREE.Vector3(sx, sy, sz).normalize();
          b.add(
            "body",
            ...octantPatch([sx, sy, sz], G, ...S.guide),
            rod(
              [
                d.x * (S.ball - 0.04),
                d.y * (S.ball - 0.04),
                d.z * (S.ball - 0.04),
              ],
              [
                d.x * (S.guide[0] + 0.04),
                d.y * (S.guide[0] + 0.04),
                d.z * (S.guide[0] + 0.04),
              ],
              0.07,
            ),
          );
        }
  });
  // 센터 블럭(위, 오른쪽 앞 칸): 몸통 안쪽 모서리에서 홈으로 내려가는 기둥(평평한 두 면이 지름 평면 위), 끝에 캠
  const ce = placedOf(4, "center");
  b.piece("center", ce.offset, () => {
    b.cubie(ce.at, ce.faces);
    b.lump([0.11, 0.83, 0.11], [0.16, 0.46, 0.16], 0.03);
    b.add(
      "body",
      facePatch(
        1,
        1,
        { 0: [0.02, G + 0.1], 2: [0.02, G + 0.1] },
        ...S.centerCam,
      ),
    );
  });
  // 날개 둘(위-앞 줄의 오른쪽·왼쪽): 안쪽(가운데 층 쪽)에 비둘기꼬리, 코너 쪽 끝에 낮춘 받침. 서로 거울에 비친 꼴
  for (const sx of [1, -1] as const) {
    const w = placedOf(4, sx > 0 ? "wing-right" : "wing-left");
    const x = (lo: number, hi: number): R2 => side(sx, lo, hi);
    b.piece(w.name, w.offset, () => {
      b.cubie(w.at, w.faces);
      b.lump([0.42 * sx, 0.82, 0.82], [0.6, 0.36, 0.36]);
      b.add(
        "body",
        ...upFrontPatch(x(0.06, 0.5), [0.62, 1], ...S.dovetail),
        ...upFrontPatch(x(0.5, 0.72), [0.78, 1], ...S.wingCam),
        ...upFrontPatch(x(0.72, 0.95), [0.78, 1], S.wingCam[0], S.wingRecess),
      );
    });
  }
  // 코너 블럭: 몸통 안쪽 꼭짓점의 짧은 목과 구면 삼각형 캠
  const co = placedOf(4, "corner");
  b.piece("corner", co.offset, () => {
    b.cubie(co.at, co.faces);
    const d = 1 / Math.sqrt(3);
    b.add(
      "body",
      rod(
        scale([d, d, d], S.cornerCam[1] - 0.06),
        scale([d, d, d], 1.78),
        0.12,
      ),
      ...octantPatch([1, 1, 1], 0.78, ...S.cornerCam),
    );
  });
}

function build555(b: Builder): void {
  const S = SHELL_555;
  const ARM = 0.85;
  b.piece("core", [0, 0, 0], () => {
    b.add("body", new THREE.SphereGeometry(0.35, 28, 18));
    for (const a of AXES) {
      b.add(
        "body",
        alongAxis(zCylinder(0.08, 0, ARM), a),
        alongAxis(zCylinder(0.12, ARM - 0.2, ARM), a),
      );
      // 특허는 나사·덧씌우개만 적는다(스프링 없음)
      screw(b, a, ARM - 0.12, 0.9 + FIXED_555 - 0.08, null, 0.035);
    }
  });
  // 고정 센터 블럭 여섯: 몸통, 밑면 접시(둘레 조각 발이 밑으로 들어간다), 축에 끼는 통
  for (const p of LAYOUT[5].filter((x) => x.name.startsWith("fixed"))) {
    const a = p.faces[0] as Axis;
    const k = "xyz".indexOf(a[1] as string) as 0 | 1 | 2;
    const s = a[0] === "+" ? 1 : -1;
    b.piece(p.name, p.offset, () => {
      b.cubie(p.at, p.faces);
      b.add(
        "body",
        facePatch(
          k,
          s,
          { 0: [-0.34, 0.34], 1: [-0.34, 0.34], 2: [-0.34, 0.34] },
          ...S.dish,
        ),
        alongAxis(zTube(0.07, 0.16, 0.9, S.dish[0] + 0.02), a),
      );
    });
  }
  // 십자 쪽 센터 블럭(위 면 오른쪽): 고정 센터 블럭 쪽으로 뻗은 발이 접시 밑에
  const cr = placedOf(5, "cross");
  b.piece("cross", cr.offset, () => {
    b.cubie(cr.at, cr.faces);
    b.lump([0.6, 1.4, 0], [0.26, 0.26, 0.36], 0.04);
    b.add(
      "body",
      facePatch(1, 1, { 0: [0.2, 0.44], 2: [-0.2, 0.2] }, ...S.centerFoot),
    );
  });
  // 대각선 쪽 센터 블럭(위 면 오른쪽 앞): 축 쪽으로 뻗은 발이 접시 모서리 밑에
  const xc = placedOf(5, "x");
  b.piece("x", xc.offset, () => {
    b.cubie(xc.at, xc.faces);
    b.lump([0.66, 1.3, 0.66], [0.4, 0.5, 0.4]);
    b.add(
      "body",
      facePatch(1, 1, { 0: [0.2, 0.44], 2: [0.2, 0.44] }, ...S.centerFoot),
    );
  });
  // 가운데 엣지 블럭(위-앞): 두 십자 쪽 센터 블럭 밑으로 들어가는 T자 발
  const me = placedOf(5, "mid-edge");
  b.piece("mid-edge", me.offset, () => {
    b.cubie(me.at, me.faces);
    b.lump([0, 1.12, 1.12], [0.36, 0.7, 0.7], 0.06);
    b.add("body", ...upFrontPatch([-0.2, 0.2], [0.6, 1], ...S.edgeFoot));
  });
  // 날개(위-앞 줄 오른쪽): 가운데 엣지 블럭 쪽으로 붙은 덩이와 목, 두 대각선 쪽 센터 블럭 밑으로 들어가는 발
  const wi = placedOf(5, "wing");
  b.piece("wing", wi.offset, () => {
    b.cubie(wi.at, wi.faces);
    b.lump([0.55, 1.19, 1.19], [0.3, 0.62, 0.62], 0.05);
    const d = new THREE.Vector3(0.55, 1, 1).normalize();
    b.add(
      "body",
      rod(
        [
          d.x * (S.wingFoot[1] - 0.06),
          d.y * (S.wingFoot[1] - 0.06),
          d.z * (S.wingFoot[1] - 0.06),
        ],
        [d.x * 1.45, d.y * 1.45, d.z * 1.45],
        0.08,
      ),
      ...upFrontPatch([0.3, 0.9], [0.55, 1], ...S.wingFoot),
    );
  });
  // 코너 블럭: 몸통 안쪽 꼭짓점에서 가운데로 뻗은 긴 목과 날개 발 밑에 드는 발
  const co = placedOf(5, "corner");
  b.piece("corner", co.offset, () => {
    b.cubie(co.at, co.faces);
    const d = 1 / Math.sqrt(3);
    b.add(
      "body",
      rod(
        scale([d, d, d], S.cornerFoot[1] - 0.06),
        scale([d, d, d], 2.62),
        0.12,
      ),
      ...octantPatch([1, 1, 1], 0.62, ...S.cornerFoot),
    );
  });
}

/**
 * 크기별 분해 모델. 3×3은 core-model.ts 그대로(`parts`는 비어 있다). `keepParts`면 시험이 조각마다 볼 수 있게
 * 조각 이름별 도형도 남긴다
 */
export function buildSizedCoreModel(
  n: ModelSize,
  keepParts = false,
): SizedCoreModel {
  if (n === 3) return { ...buildCoreModel(), parts: new Map() };
  const b = new Builder(keepParts);
  if (n === 2) build222(b);
  else if (n === 4) build444(b);
  else build555(b);
  return b.finish();
}

/**
 * 그림 범위: 가운데는 상자 범위의 가운데(`origin`을 주면 그 점), 반지름은 가운데에서 가장 먼 꼭짓점까지. 장면이
 * 크기마다 3×3과 같은 크기로 보이게 맞춘다
 */
export function modelBounds(
  m: CoreModel,
  origin?: THREE.Vector3,
): THREE.Sphere {
  const gs = [m.body, ...m.stickers.values()];
  const box = new THREE.Box3();
  for (const g of gs) {
    g.computeBoundingBox();
    if (g.boundingBox) box.union(g.boundingBox);
  }
  const c = origin ?? box.getCenter(new THREE.Vector3());
  const v = new THREE.Vector3();
  let r = 0;
  for (const g of gs) {
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++)
      r = Math.max(r, v.fromBufferAttribute(p, i).distanceTo(c));
  }
  return new THREE.Sphere(c, r);
}
