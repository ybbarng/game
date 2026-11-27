import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * 분해한 큐브의 속(큐브의 기초 3D, docs/47 16-27 「속 구조를 자료대로」)의 도형. 그리기 없이 도형만 만들어
 * 시험(core-model.test.ts)이 노드에서 본다. 장면(core-scene.ts)은 이 도형을 재질별로 하나씩만 그린다.
 *
 * 따른 구조는 원래 루빅스 큐브(나사·스프링으로 센터 블럭을 심에 붙이는 방식, 지금 흔한 스피드큐브도 같은 틀)다.
 * - 심: 가운데 작은 덩이에서 여섯 방향으로 뻗은 축. 축 끝은 나사를 받는 굵은 기둥이다.
 * - 센터 블럭: 몸통 아래에 나사가 지나는 통, 통 둘레에 둥글게 휜 받침(엣지 블럭 발을 위에서 누른다). 나사와 스프링은
 *   통에서 뽑아 축 끝과 센터 블럭 사이에 둔다(실제는 통 안, 나사 머리와 통 바닥 사이에 스프링).
 * - 엣지 블럭: 안쪽 모서리에서 작은 네모 덩이가 나오고, 그 끝에 두 센터 블럭 쪽으로 넓은 휜 발. 발은 이웃 센터 블럭
 *   받침 밑으로 들어간다.
 * - 코너 블럭: 안쪽 꼭짓점에 작은 정육면체 덩이(꼭짓점이 깎인 꼴), 짧은 목, 끝에 작고 둥근 휜 발. 발은 이웃 엣지
 *   블럭 셋의 발 밑으로 들어간다.
 * - 발과 받침의 안쪽 면은 큐브 가운데를 중심으로 한 구면이다(조각이 이 구면을 따라 미끄러지며 돈다). 그래서 센터
 *   받침 → 엣지 발 → 코너 발 차례로 가운데에 가깝다.
 * 조각을 떼어 놓아도 발의 휜 정도는 맞춘 큐브의 자리(조각 한 칸 = 1)에서 잰 값 그대로다.
 */

/** cube-view.ts와 같은 조각 크기·둥글기·스티커 */
export const CUBIE = 0.97;
export const CUBIE_RADIUS = 0.1;
const STICKER = 0.8;
const STICKER_RADIUS = 0.1;
const LIFT = 0.004;
export const HALF = CUBIE / 2;

/** 떼어 놓은 자리(가운데에서): 센터 블럭은 축 방향, 코너 블럭은 세 축 모두, 엣지 블럭은 두 축 이만큼 */
export const CENTER_AT = 2.45;
export const CORNER_AT = 2.3;
export const EDGE_AT = 2.5;

/**
 * 맞춘 큐브에서 가운데부터의 거리(조각 한 칸 = 1). 안쪽 면이 이 구면 위에 놓인다. 센터 받침이 엣지 발을, 엣지 발이
 * 코너 발을 덮는다(바깥일수록 덮는 쪽)
 */
export const SHELL = {
  centerSkirt: [0.45, 0.505],
  edgeFoot: [0.35, 0.44],
  cornerFoot: [0.26, 0.34],
} as const;

export type Axis = "+x" | "+y" | "+z" | "-x" | "-y" | "-z";
/** 축 → 면 번호(U R F D L B, 색 차례) */
export const FACE_OF: Record<Axis, number> = {
  "+y": 0,
  "+x": 1,
  "+z": 2,
  "-y": 3,
  "-x": 4,
  "-z": 5,
};
export const VEC: Record<Axis, [number, number, number]> = {
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

/** 조각 안쪽 틀: z축이 바깥(조각 자리 방향), -z가 큐브 가운데. `side`가 x축 */
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

/**
 * 둥근 구면 껍질 조각(원 모양): 구 중심이 원점, +z 쪽 꼭대기에서 `angle`(라디안)까지. 두께는 `rIn`~`rOut`
 */
function roundShell(
  rIn: number,
  rOut: number,
  angle: number,
): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const a = (angle * i) / n;
    pts.push(new THREE.Vector2(rOut * Math.sin(a), rOut * Math.cos(a)));
  }
  for (let i = n; i >= 0; i--) {
    const a = (angle * i) / n;
    pts.push(new THREE.Vector2(rIn * Math.sin(a), rIn * Math.cos(a)));
  }
  const g = new THREE.LatheGeometry(pts, 28);
  // 돌리는 축 y를 z로
  g.rotateX(Math.PI / 2);
  return g;
}

/**
 * 네모난 구면 껍질 조각: 구 중심이 원점, +z 쪽에 x로 `w`, y로 `h`(가운데 반지름에서 잰 호 길이)만큼 펼친다
 */
function rectShell(
  w: number,
  h: number,
  rIn: number,
  rOut: number,
): THREE.BufferGeometry {
  const mid = (rIn + rOut) / 2;
  const g = new THREE.BoxGeometry(w, h, rOut - rIn, 10, 10, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const r = mid + p.getZ(i);
    d.set(Math.tan(p.getX(i) / mid), Math.tan(p.getY(i) / mid), 1)
      .normalize()
      .multiplyScalar(r);
    p.setXYZ(i, d.x, d.y, d.z);
  }
  g.computeVertexNormals();
  return g;
}

/** 축(z)을 따라 감긴 스프링 */
export class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly radius: number,
    private readonly length: number,
    private readonly turns: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * this.turns * Math.PI * 2;
    return target.set(
      this.radius * Math.cos(a),
      this.radius * Math.sin(a),
      t * this.length,
    );
  }
}

/** z축 원기둥(`z0`~`z1`) */
export function zCylinder(
  r: number,
  z0: number,
  z1: number,
  seg = 20,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, Math.abs(z1 - z0), seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}

/** z축 둘레 속 빈 통(`rIn`~`rOut`, `z0`~`z1`) */
export function zTube(
  rIn: number,
  rOut: number,
  z0: number,
  z1: number,
): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    [
      new THREE.Vector2(rIn, z0),
      new THREE.Vector2(rOut, z0),
      new THREE.Vector2(rOut, z1),
      new THREE.Vector2(rIn, z1),
      new THREE.Vector2(rIn, z0),
    ],
    24,
  );
  g.rotateX(Math.PI / 2);
  return g;
}

export interface CoreModel {
  /** 검은 플라스틱(몸통·발·받침·심) 한 덩이 */
  body: THREE.BufferGeometry;
  /** 쇠(나사·스프링) 한 덩이. 쇠가 없는 짜임(4×4 세베스테니 꼴)은 null */
  metal: THREE.BufferGeometry | null;
  /** 면 번호별 스티커 한 덩이 */
  stickers: Map<number, THREE.BufferGeometry>;
}

/** 조각 몸통 바깥 면에 붙는 스티커 판(+z 면, 몸통 가운데가 원점) */
export function stickerGeometry(): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(
    roundedRect(STICKER - 0.012, STICKER_RADIUS),
    {
      depth: 0.008,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 2,
      curveSegments: 6,
    },
  );
  g.translate(0, 0, 0.006 + HALF + LIFT);
  return g;
}

/** 합칠 수 있게 위치·법선만 남긴 색인 없는 도형으로 */
export function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(n.attributes))
    if (name !== "position" && name !== "normal") n.deleteAttribute(name);
  return n;
}

/** 조각 다섯 종류와 심을 만들어 재질별로 합친다(그리기 횟수 = 재질 수) */
export function buildCoreModel(): CoreModel {
  const body: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];
  const stickers = new Map<number, THREE.BufferGeometry[]>();
  const made: THREE.BufferGeometry[] = [];
  const keep = <T extends THREE.BufferGeometry>(g: T): T => {
    made.push(g);
    return g;
  };
  const put = (
    into: THREE.BufferGeometry[],
    g: THREE.BufferGeometry,
    m: THREE.Matrix4,
  ) => {
    const p = plain(g);
    p.applyMatrix4(m);
    into.push(p);
  };
  const at = (pos: THREE.Vector3, q = new THREE.Quaternion()): THREE.Matrix4 =>
    new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));

  const boxGeo = keep(
    new RoundedBoxGeometry(CUBIE, CUBIE, CUBIE, 3, CUBIE_RADIUS),
  );
  const stickerGeo = keep(stickerGeometry());
  const z = new THREE.Vector3(0, 0, 1);

  /** 몸통과 바깥 면 스티커 */
  const shell = (pos: THREE.Vector3, faces: Axis[]) => {
    put(body, boxGeo, at(pos));
    for (const f of faces) {
      const q = new THREE.Quaternion().setFromUnitVectors(
        z,
        new THREE.Vector3(...VEC[f]),
      );
      const list = stickers.get(FACE_OF[f]) ?? [];
      put(list, stickerGeo, at(pos, q));
      stickers.set(FACE_OF[f], list);
    }
  };

  // 심: 가운데 덩이와 여섯 축, 축 끝 나사 기둥
  const HUB = 0.26;
  const ARM_END = 0.78;
  put(body, keep(new THREE.SphereGeometry(HUB, 28, 18)), new THREE.Matrix4());
  const armGeo = keep(zCylinder(0.075, 0, ARM_END));
  const postGeo = keep(zCylinder(0.115, ARM_END - 0.2, ARM_END, 24));
  // 나사(축 끝 기둥에 박힌다)와 머리, 머리 밑 스프링
  const SCREW_HEAD = 1.55;
  const screwGeo = keep(zCylinder(0.032, ARM_END - 0.12, SCREW_HEAD, 12));
  const headGeo = keep(zCylinder(0.085, SCREW_HEAD, SCREW_HEAD + 0.05, 20));
  const springGeo = keep(
    new THREE.TubeGeometry(new Helix(0.072, 0.36, 7), 180, 0.014, 6, false),
  );
  springGeo.translate(0, 0, SCREW_HEAD - 0.37);

  // 센터 블럭: 몸통 아래 나사가 지나는 통과 둥글게 휜 받침
  const tubeGeo = keep(zTube(0.06, 0.15, -HALF + 0.05, 0.2 - 1));
  const skirtGeo = keep(
    roundShell(SHELL.centerSkirt[0], SHELL.centerSkirt[1], 0.72),
  );
  skirtGeo.translate(0, 0, -1);
  for (const a of Object.keys(VEC) as Axis[]) {
    const v = new THREE.Vector3(...VEC[a]);
    const q = new THREE.Quaternion().setFromUnitVectors(z, v);
    for (const g of [armGeo, postGeo]) put(body, g, at(new THREE.Vector3(), q));
    for (const g of [screwGeo, headGeo, springGeo])
      put(metal, g, at(new THREE.Vector3(), q));
    const pos = v.clone().multiplyScalar(CENTER_AT);
    shell(pos, [a]);
    for (const g of [tubeGeo, skirtGeo]) put(body, g, at(pos, q));
  }

  // 엣지 블럭(흰-초록): 위-앞 모서리 가운데 방향. 안쪽 모서리의 네모 덩이와 두 센터 블럭 쪽으로 넓은 휜 발
  {
    const pos = new THREE.Vector3(0, EDGE_AT, EDGE_AT);
    shell(pos, ["+y", "+z"]);
    // 덩이: 엣지 길이 방향(x)으로 조금 좁게, 안쪽 모서리에서 발까지
    const lump = keep(new RoundedBoxGeometry(0.42, 0.44, 0.44, 2, 0.05));
    put(body, lump, at(pos.clone().add(new THREE.Vector3(0, -0.52, -0.52))));
    // 발: 맞춘 큐브 가운데(조각에서 √2 안쪽)를 중심으로 한 구면. 두 센터 블럭 쪽(틀의 y)으로 넓다
    const foot = keep(
      rectShell(0.36, 0.56, SHELL.edgeFoot[0], SHELL.edgeFoot[1]),
    );
    foot.translate(0, 0, -Math.SQRT2);
    const q = inwardFrame(
      new THREE.Vector3(0, 1, 1),
      new THREE.Vector3(1, 0, 0),
    );
    put(body, foot, at(pos, q));
  }

  // 코너 블럭(흰-초록-빨강): 위-앞-오른쪽 꼭짓점 방향. 안쪽 꼭짓점의 작은 정육면체 덩이, 짧은 목, 작고 둥근 휜 발
  {
    const pos = new THREE.Vector3(CORNER_AT, CORNER_AT, CORNER_AT);
    shell(pos, ["+y", "+z", "+x"]);
    const lump = keep(new RoundedBoxGeometry(0.36, 0.36, 0.36, 2, 0.06));
    put(body, lump, at(pos.clone().addScalar(-0.5)));
    const reach = Math.sqrt(3);
    const neck = keep(zCylinder(0.085, -1.05, SHELL.cornerFoot[0] - reach));
    const foot = keep(
      roundShell(SHELL.cornerFoot[0], SHELL.cornerFoot[1], 0.62),
    );
    foot.translate(0, 0, -reach);
    const q = inwardFrame(
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 0, -1),
    );
    for (const g of [neck, foot]) put(body, g, at(pos, q));
  }

  const merge = (list: THREE.BufferGeometry[]) => {
    const g = mergeGeometries(list);
    for (const l of list) l.dispose();
    if (!g) throw new Error("큐브 속 도형을 합치지 못했다");
    return g;
  };
  const model: CoreModel = {
    body: merge(body),
    metal: merge(metal),
    stickers: new Map(
      [...stickers].map(([face, list]) => [face, merge(list)] as const),
    ),
  };
  for (const g of made) g.dispose();
  return model;
}
