// 서버에서 그리는 페이지도 쓰는 값이라 "use client" 모듈(marks.tsx) 밖에 둔다(클라이언트 모듈의 배열은 서버에서 참조로만 넘어온다)

/**
 * 용골자리(카노푸스가 속한 별자리)의 하나뿐인 정의(docs/36 11-39). 직인·실링왁스·우주국 로고·등록증 보안 무늬는
 * 여기서 만든 모양(`CARINA_SHAPE`)을 크기·자리만 바꿔 쓰고, 우주국 소개의 성도·남쪽 하늘은 실제 좌표(`ra`·`dec`)에
 * 같은 잇는 별 목록(`CARINA_LINES`)으로 그린다.
 *
 * 별 값은 Bright Star Catalogue 5판(canopus-sky.json과 같은 값). 잇는 별은 우주국 성도가 쓰는 d3-celestial
 * 별자리 선(국제천문연맹 성도 계열)의 용골자리 줄에서 용골자리 별만 남겼다. 돛자리·고물자리 별로 건너가는 선과
 * θ 둘레의 어두운 별(4등급 안팎) 고리는 뺐다.
 */
export const CARINA_STARS = {
  alpha: { name: "카노푸스", ra: 95.988, dec: -52.696, mag: -0.72 },
  beta: { name: "미아플라키두스", ra: 138.3, dec: -69.717, mag: 1.68 },
  omega: { name: "ω", ra: 153.434, dec: -70.038, mag: 3.32 },
  theta: { name: "θ", ra: 160.739, dec: -64.394, mag: 2.76 },
  p: { name: "p", ra: 158.006, dec: -61.685, mag: 3.32 },
  q: { name: "q", ra: 154.271, dec: -61.332, mag: 3.4 },
  iota: { name: "아스피디스케", ra: 139.273, dec: -59.275, mag: 2.25 },
  epsilon: { name: "아비오르", ra: 125.628, dec: -59.51, mag: 1.86 },
  chi: { name: "χ", ra: 119.195, dec: -52.982, mag: 3.47 },
} as const;
export type CarinaStar = keyof typeof CARINA_STARS;
export const CARINA_KEYS = Object.keys(CARINA_STARS) as CarinaStar[];

/** 잇는 별 차례(꺾은선마다 한 줄). 카노푸스에서 미아플라키두스로 내려가 θ를 돌아 아비오르·χ로 */
export const CARINA_LINES: readonly (readonly CarinaStar[])[] = [
  ["alpha", "beta", "omega", "theta", "p", "q", "iota", "epsilon", "chi"],
];

/** 잇는 선을 별 둘씩으로 */
export const CARINA_EDGES: readonly (readonly [CarinaStar, CarinaStar])[] =
  CARINA_LINES.flatMap((l) =>
    l.slice(1).map((k, i) => [l[i] as CarinaStar, k] as const),
  );

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * 장식 그림이 쓰는 모양: 하늘에서 올려다본 대로(동쪽이 왼쪽, 북쪽이 위) 별자리 가운데에 댄 평면에 비춘 자리.
 * 가로 0~1, 세로 0~`CARINA_HEIGHT`(가로에 맞춘 비율)
 */
const SHAPE = (() => {
  const ras = CARINA_KEYS.map((k) => CARINA_STARS[k].ra);
  const decs = CARINA_KEYS.map((k) => CARINA_STARS[k].dec);
  const ra0 = rad((Math.min(...ras) + Math.max(...ras)) / 2);
  const d0 = rad((Math.min(...decs) + Math.max(...decs)) / 2);
  const raw = CARINA_KEYS.map((k) => {
    const a = rad(CARINA_STARS[k].ra) - ra0;
    const d = rad(CARINA_STARS[k].dec);
    const c =
      Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a);
    return {
      x: -(Math.cos(d) * Math.sin(a)) / c,
      y:
        -(
          Math.cos(d0) * Math.sin(d) -
          Math.sin(d0) * Math.cos(d) * Math.cos(a)
        ) / c,
    };
  });
  const minX = Math.min(...raw.map((p) => p.x));
  const maxX = Math.max(...raw.map((p) => p.x));
  const minY = Math.min(...raw.map((p) => p.y));
  const maxY = Math.max(...raw.map((p) => p.y));
  const w = maxX - minX;
  const shape = {} as Record<CarinaStar, readonly [number, number]>;
  CARINA_KEYS.forEach((k, i) => {
    const p = raw[i] as { x: number; y: number };
    shape[k] = [(p.x - minX) / w, (p.y - minY) / w];
  });
  return { shape, height: (maxY - minY) / w };
})();
export const CARINA_SHAPE: Readonly<
  Record<CarinaStar, readonly [number, number]>
> = SHAPE.shape;
export const CARINA_HEIGHT = SHAPE.height;

/** 모양을 너비 w로 키워 가운데가 (cx, cy)에 오게 놓은 자리 */
export function carinaAt(
  cx: number,
  cy: number,
  w: number,
): (k: CarinaStar) => [number, number] {
  return (k) => {
    const [x, y] = CARINA_SHAPE[k];
    return [cx + (x - 0.5) * w, cy + (y - CARINA_HEIGHT / 2) * w];
  };
}

/** 네 갈래 빛줄기 별 모양 */
export function starPath(x: number, y: number, r: number): string {
  return `M${x} ${y - r} L ${x + r * 0.3} ${y - r * 0.3} L ${x + r} ${y} L ${x + r * 0.3} ${y + r * 0.3} L ${x} ${y + r} L ${x - r * 0.3} ${y + r * 0.3} L ${x - r} ${y} L ${x - r * 0.3} ${y - r * 0.3} Z`;
}
