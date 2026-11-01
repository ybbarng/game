// 하늘의 별 따기 응모판(네모 하늘) 데이터를 한 번 만들어 고정한다(docs/36 11-3).
// 화면은 이 결과(src/stardraw/sky-data.json)만 읽는다. 별 목록이나 펴는 규칙을 바꿀 때만 다시 돌린다.
//
//   node apps/web/scripts/build-stardraw-sky.mjs ~/personal/projects/star.byb.kr
//   pnpm exec biome format --write apps/web/src/stardraw/sky-data.json
//
// 출처(star.byb.kr 저장소)
// - data/database/bsc5-short.json: Bright Star Catalogue 5판 요약(VizieR V/50)
// - src/search/utils/starNames.ts: 별의 한글 이름
// - build/database/vectors-constellations.json: 별자리 선(d3-celestial, BSD)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) throw new Error("star.byb.kr 저장소 경로를 넘겨라");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../src/stardraw/sky-data.json");
/** 별마다 한 줄 문구(번호 → 문장). 응모 정보 칸, 영수증, 설명 페이지에 쓴다 */
const facts = JSON.parse(
  readFileSync(join(here, "stardraw-star-facts.json"), "utf8"),
);

/** 별자리 약어 → 한글 이름(선 데이터의 이름과 같게) */
const CON = {
  CMa: "큰개자리",
  Boo: "목동자리",
  Lyr: "거문고자리",
  Aur: "마차부자리",
  Ori: "오리온자리",
  CMi: "작은개자리",
  Aql: "독수리자리",
  Tau: "황소자리",
  Sco: "전갈자리",
  Vir: "처녀자리",
  Gem: "쌍둥이자리",
  PsA: "남쪽물고기자리",
  Cyg: "백조자리",
  Leo: "사자자리",
  Sgr: "궁수자리",
  UMa: "큰곰자리",
  Per: "페르세우스자리",
  Hya: "바다뱀자리",
  Ari: "양자리",
  UMi: "작은곰자리",
  Cet: "고래자리",
  And: "안드로메다자리",
  Cen: "센타우루스자리",
  Oph: "뱀주인자리",
};

// 1. 서울(북위 37.6°)에서 충분히 뜨는(적위 -45° 위) 가장 밝은 별 45개. 밝은 순서가 번호다.
//    이름·바이어 부호가 없는 별(폭발 밝기로 적힌 신성 HR 5958)은 뺀다
const catalog = JSON.parse(
  readFileSync(join(root, "data/database/bsc5-short.json"), "utf8"),
);
const namesSrc = readFileSync(
  join(root, "src/search/utils/starNames.ts"),
  "utf8",
);
const korean = {};
for (const m of namesSrc.matchAll(
  /^\s*(?:"([^"]+)"|([A-Za-z]+)):\s*"([^"]+)"/gm,
)) {
  korean[m[1] ?? m[2]] = m[3];
}
const sexagesimal = (text) => {
  const [a, b, c] = text.match(/[\d.]+/g).map(Number);
  return a + b / 60 + c / 3600;
};
const stars = catalog
  .filter((s) => s.V && s.RA && s.Dec && (s.B || s.N))
  .map((s) => ({
    name: s.N ?? null,
    ko: s.N ? (korean[s.N] ?? null) : null,
    con: s.C ?? null,
    bayer: s.B ?? null,
    ra: sexagesimal(s.RA) * 15,
    dec: (s.Dec.trim().startsWith("-") ? -1 : 1) * sexagesimal(s.Dec),
    mag: Number(s.V),
    k: Number(s.K) || 6000,
  }))
  .filter((s) => s.dec > -45)
  .sort((a, b) => a.mag - b.mag)
  .slice(0, 45)
  .map((s, i) => ({ n: i + 1, ...s }));
for (const s of stars) {
  if (!s.ko || !CON[s.con] || !facts[String(s.n)])
    throw new Error(`이름이나 문구가 없다: ${JSON.stringify(s)}`);
}

// 2. 네모 하늘의 큰 틀: 적경을 가로(동쪽이 왼쪽, 올려다본 하늘), 적위를 세로로 편다.
//    별이 가장 듬성한 적경에서 가른다. 가로·세로 모두 실제 비율과 차례 순위를 섞어 몰린 곳은 넓히고 빈 곳은 채운다.
//    여기서 번호 별을 고르게 퍼뜨린 자리는 별자리들이 어디쯤 놓일지(5단계 처음 자리)만 정한다. 마지막 자리는 6단계가 정한다
const byRa = [...stars].sort((a, b) => a.ra - b.ra);
let cut = 0;
let gap = -1;
for (let i = 0; i < byRa.length; i++) {
  const a = byRa[i].ra;
  const b = i + 1 < byRa.length ? byRa[i + 1].ra : byRa[0].ra + 360;
  if (b - a > gap) {
    gap = b - a;
    cut = (a + gap / 2) % 360;
  }
}
const u = (ra) => 1 - ((((ra - cut) % 360) + 360) % 360) / 360;
const rankOf = (key) => {
  const r = {};
  [...stars]
    .sort((a, b) => key(a) - key(b))
    .forEach((s, i) => {
      r[s.n] = (i + 0.5) / stars.length;
    });
  return r;
};
const rx = rankOf((s) => u(s.ra));
const ry = rankOf((s) => -s.dec);
const anchor = {};
const pos = {};
for (const s of stars) {
  const x = 0.45 * u(s.ra) + 0.55 * rx[s.n];
  const y = 0.5 * ((90 - s.dec) / 135) + 0.5 * ry[s.n];
  anchor[s.n] = { x: 0.07 + x * 0.86, y: 0.07 + y * 0.84 };
  pos[s.n] = { ...anchor[s.n] };
}
const ids = stars.map((s) => s.n);
// 고르게 퍼뜨리기: 먼 거리까지 약하게 밀어내고(빈 곳을 채움), 제자리로 약하게 당기고(모양 유지), 가장자리에서 밀어낸다
const R = 0.2;
const M = 0.06;
for (let it = 0; it < 400; it++) {
  const f = {};
  for (const n of ids) f[n] = { x: 0, y: 0 };
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const p = pos[ids[i]];
      const q = pos[ids[j]];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      if (d < R) {
        const k = ((R - d) / R) ** 2 * 0.006;
        f[ids[i]].x -= (dx / d) * k;
        f[ids[i]].y -= (dy / d) * k;
        f[ids[j]].x += (dx / d) * k;
        f[ids[j]].y += (dy / d) * k;
      }
    }
  for (const n of ids) {
    const p = pos[n];
    const a = anchor[n];
    f[n].x += (a.x - p.x) * 0.012;
    f[n].y += (a.y - p.y) * 0.012;
    if (p.x < M) f[n].x += (M - p.x) * 0.2;
    if (p.x > 1 - M) f[n].x -= (p.x - (1 - M)) * 0.2;
    if (p.y < M) f[n].y += (M - p.y) * 0.2;
    if (p.y > 1 - M) f[n].y -= (p.y - (1 - M)) * 0.2;
    p.x += Math.max(-0.01, Math.min(0.01, f[n].x));
    p.y += Math.max(-0.01, Math.min(0.01, f[n].y));
  }
}
// 너무 가까운 쌍을 떼어 손가락 틈을 둔다
for (let it = 0; it < 60; it++) {
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const p = pos[ids[i]];
      const q = pos[ids[j]];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      if (d < 0.09) {
        const push = (0.09 - d) / 2;
        p.x -= (dx / d) * push;
        p.y -= (dy / d) * push;
        q.x += (dx / d) * push;
        q.y += (dy / d) * push;
      }
    }
  for (const n of ids) {
    pos[n].x = Math.min(0.95, Math.max(0.05, pos[n].x));
    pos[n].y = Math.min(0.92, Math.max(0.05, pos[n].y));
  }
}

// 3. 별자리 꼭짓점: 모든 꼭짓점은 실제 별 하나다. 같은 별(0.1° 안)은 꼭짓점 하나로 묶는다(엘나스는 황소·마차부가 함께 쓴다).
//    번호 별은 늘 그 별의 꼭짓점 자체라 선과 어긋나지 않는다
const DEG = Math.PI / 180;
const fromRaDec = (ra, dec) => [
  Math.cos(dec * DEG) * Math.cos(ra * DEG),
  Math.cos(dec * DEG) * Math.sin(ra * DEG),
  Math.sin(dec * DEG),
];
const toRaDec = ([x, y, z]) => {
  const dec = Math.asin(Math.max(-1, Math.min(1, z))) / DEG;
  const ra = Math.atan2(y, x) / DEG;
  return [ra < 0 ? ra + 360 : ra, dec];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const SAME = Math.cos(0.1 * DEG);
/** 꼭짓점: 실제 별 하나(번호 별이면 n) */
const verts = stars.map((s) => ({
  vec: fromRaDec(s.ra, s.dec),
  ra: s.ra,
  dec: s.dec,
  n: s.n,
}));
const vertexOf = (vec) => {
  const i = verts.findIndex((v) => dot(v.vec, vec) > SAME);
  if (i >= 0) return i;
  const [ra, dec] = toRaDec(vec);
  verts.push({ vec, ra, dec, n: null });
  return verts.length - 1;
};
const lineSrc = JSON.parse(
  readFileSync(
    join(root, "build/database/vectors-constellations.json"),
    "utf8",
  ),
);
/** 원본 꺾은선마다 꼭짓점 번호(남쪽 끝 -47° 아래는 null로 끊는다) */
const polylines = lineSrc.map((c) => ({
  con: c.label,
  ids: c.stars.map((vec) => (toRaDec(vec)[1] <= -47 ? null : vertexOf(vec))),
}));
/** 네모 하늘을 가른 곳을 건너는 선(가로로 그림 폭의 절반 넘게 뛴다) */
const crosses = (a, b) => Math.abs(u(verts[a].ra) - u(verts[b].ra)) > 0.5;

// 4. 모양 덩어리: 별자리마다 선으로 이어진 꼭짓점 묶음. 가른 곳을 건너는 선은 잇지 않아 좌우 두 덩어리가 된다
//    (세페우스, 작은곰 → 북극성). 번호 별이 자기 별자리 선에 없으면 그 별자리의 가장 가까운 꼭짓점 덩어리에 넣는다
const groups = [];
for (const con of new Set(polylines.map((p) => p.con))) {
  const parent = new Map();
  const find = (a) => {
    while (parent.get(a) !== a) a = parent.get(a);
    return a;
  };
  const add = (a) => {
    if (!parent.has(a)) parent.set(a, a);
  };
  for (const p of polylines.filter((q) => q.con === con))
    p.ids.forEach((id, k) => {
      if (id === null) return;
      add(id);
      const prev = p.ids[k - 1];
      if (prev !== null && prev !== undefined && !crosses(prev, id))
        parent.set(find(prev), find(id));
    });
  for (const s of stars) {
    if (CON[s.con] !== con || parent.has(s.n - 1)) continue;
    let best = null;
    for (const id of parent.keys())
      if (
        best === null ||
        dot(verts[id].vec, verts[s.n - 1].vec) >
          dot(verts[best].vec, verts[s.n - 1].vec)
      )
        best = id;
    add(s.n - 1);
    if (best !== null) parent.set(s.n - 1, find(best));
  }
  const byRoot = new Map();
  for (const id of [...parent.keys()].sort((a, b) => a - b)) {
    const r = find(id);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(id);
  }
  for (const ids of byRoot.values()) groups.push({ con, ids });
}
// 덩어리마다 참모양: 덩어리 가운데에서 본 하늘을 평사 투영으로 편다(북쪽이 위, 동쪽이 왼쪽). 실제 하늘에서 보는 모양이다
for (const g of groups) {
  const c = [0, 0, 0];
  for (const id of g.ids) for (let k = 0; k < 3; k++) c[k] += verts[id].vec[k];
  const len = Math.hypot(...c);
  const [cra, cdec] = toRaDec(c.map((v) => v / len));
  const center = fromRaDec(cra, cdec);
  const east = [-Math.sin(cra * DEG), Math.cos(cra * DEG), 0];
  const north = [
    -Math.sin(cdec * DEG) * Math.cos(cra * DEG),
    -Math.sin(cdec * DEG) * Math.sin(cra * DEG),
    Math.cos(cdec * DEG),
  ];
  g.ref = g.ids.map((id) => {
    const v = verts[id].vec;
    const k = 2 / (1 + dot(v, center));
    return [-k * dot(v, east), -k * dot(v, north)];
  });
}

// 5. 처음 자리: 모든 꼭짓점(번호 별 포함)을 가까운 번호 별이 2단계에서 옮긴 만큼(거리 제곱에 반비례해 섞어) 휜 자리.
//    이 휨은 이어진 변형이라 선이 서로 엇갈리지 않는다. 여기서 출발해야 6단계가 별자리를 서로 꿰지 않는다
//    (번호 별을 퍼뜨린 자리에 바로 붙이고 출발하면 처음부터 52곳이 엇갈렸다)
const lin = (ra, dec) => ({
  x: 0.07 + 0.86 * u(ra),
  y: 0.07 + 0.84 * ((90 - dec) / 135),
});
const moved = stars.map((s) => {
  const l = lin(s.ra, s.dec);
  return { l, dx: pos[s.n].x - l.x, dy: pos[s.n].y - l.y };
});
const warp = (ra, dec) => {
  const l = lin(ra, dec);
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (const m of moved) {
    const w = 1 / ((m.l.x - l.x) ** 2 + (m.l.y - l.y) ** 2 + 0.0006);
    sw += w;
    sx += w * m.dx;
    sy += w * m.dy;
  }
  return [l.x + sx / sw, l.y + sy / sw];
};
const P = verts.map((v) => warp(v.ra, v.dec));
/** 꼭짓점마다 속한 덩어리 */
const groupsOf = verts.map(() => []);
groups.forEach((g, gi) => {
  for (const id of g.ids) groupsOf[id].push(gi);
});
const centroid = (g) => {
  let x = 0;
  let y = 0;
  for (const id of g.ids) {
    x += P[id][0];
    y += P[id][1];
  }
  return [x / g.ids.length, y / g.ids.length];
};
// 덩어리 가운데는 처음 자리 근처에 머문다(동서남북 차례를 지킨다)
for (const g of groups) g.home = centroid(g);

// 6. 함께 풀기(2026-11-01 사용자: "모양은 해치지 않으면서, 조금씩 위치를 서로 밀어내는 식으로").
//    같은 입력이면 같은 결과다(난수 없음, 정해진 차례). 차례마다
//    ① 모양: 덩어리마다 참모양을 고른 크기·옮기기·조금 돌리기(±MAX_TURN)로 지금 자리에 가장 잘 맞춘 뒤 그 자리로 당긴다
//       (as-similar-as-possible). 두 별자리가 함께 쓰는 별은 두 목표의 가운데로 간다
//    ② 손가락 틈: 번호 별끼리 GAP보다 가까우면 떼어 놓는다
//    ③ 겹침: 서로 다른 별자리 꼭짓점끼리, 꼭짓점과 다른 별자리 선분이 너무 가까우면 밀어내고, 엇갈린 선분은 풀어 준다
//    ④ ②③에서 밀린 만큼을 덩어리 전체가 함께 옮긴다
//    ⑤ 제자리: 덩어리 가운데를 처음 자리로 약하게 당긴다(동서남북 차례)
//    ⑥ 가장자리: 번호 별은 0.05~0.95 · 0.05~0.92, 어두운 별은 판 안
const MAX_TURN = 10 * DEG;
/** 보통 크기: 360px 판에서 하늘 1도가 약 1.8px(그릴 하늘 넓이를 판 넓이에 고르게 편 값) */
const BASE = 1.8 / (360 * DEG);
const SCALE_NUMBERED = [0.8, 2.2];
const SCALE_PLAIN = [0.7, 1.4];
for (const g of groups) g.numbered = g.ids.some((id) => verts[id].n !== null);
const GAP = 0.1;
// 번호 별 둘이 가까운 별자리(쌍둥이 카스토르·폴룩스, 오리온 허리띠)는 그 쌍이 손가락 틈의 PAIR_LIFT만큼 떨어지는 크기까지는
// 별자리 전체를 고르게 키운다(상한 안에서). 나머지 틈만 그 둘레를 조금 늘려 메운다
const PAIR_LIFT = 0.5;
for (const g of groups) {
  let near = Infinity;
  for (let i = 0; i < g.ids.length; i++)
    for (let j = i + 1; j < g.ids.length; j++) {
      if (verts[g.ids[i]].n === null || verts[g.ids[j]].n === null) continue;
      near = Math.min(
        near,
        Math.hypot(g.ref[i][0] - g.ref[j][0], g.ref[i][1] - g.ref[j][1]),
      );
    }
  g.minScale = near === Infinity ? 0 : (PAIR_LIFT * GAP) / near;
}
const APART = 0.03;
const APART_NUMBERED = 0.045;
const isNumbered = (id) => verts[id].n !== null;
const fit = (g) => {
  const [px, py] = centroid(g);
  let qx = 0;
  let qy = 0;
  for (const [x, y] of g.ref) {
    qx += x;
    qy += y;
  }
  qx /= g.ref.length;
  qy /= g.ref.length;
  let a = 0;
  let b = 0;
  let qq = 0;
  g.ids.forEach((id, k) => {
    const rx = g.ref[k][0] - qx;
    const ry = g.ref[k][1] - qy;
    const ox = P[id][0] - px;
    const oy = P[id][1] - py;
    a += rx * ox + ry * oy;
    b += rx * oy - ry * ox;
    qq += rx * rx + ry * ry;
  });
  // 돌리기는 조금만, 그리고 북쪽이 위로 천천히 돌아가게 한다
  const turn = 0.9 * Math.max(-MAX_TURN, Math.min(MAX_TURN, Math.atan2(b, a)));
  const fitted = qq > 0 ? (a * Math.cos(turn) + b * Math.sin(turn)) / qq : 0;
  // 크기는 판 전체의 보통 크기(BASE) 둘레에 머문다. 번호 별이 있는 별자리는 손가락 틈을 위해 더 커질 수 있고,
  // 번호 별 없는 별자리는 보통 크기로 천천히 돌아간다(이웃에 밀려 쪼그라들지 않게)
  const [lo, hi] = g.numbered ? SCALE_NUMBERED : SCALE_PLAIN;
  let scale = Math.min(hi * BASE, Math.max(lo * BASE, g.minScale, fitted));
  if (!g.numbered) scale += (BASE - scale) * 0.02;
  const cs = scale * Math.cos(turn);
  const sn = scale * Math.sin(turn);
  return g.ref.map(([x, y]) => [
    px + cs * (x - qx) - sn * (y - qy),
    py + sn * (x - qx) + cs * (y - qy),
  ]);
};
/** 두 꼭짓점이 같은 별자리에 함께 있는지(같은 별자리끼리는 모양 힘이 자리를 정하므로 밀지 않는다) */
const conOf = verts.map(
  (_, i) => new Set(groupsOf[i].map((g) => groups[g].con)),
);
const sameConTable = new Uint8Array(verts.length * verts.length);
for (let a = 0; a < verts.length; a++)
  for (let b = 0; b < verts.length; b++)
    sameConTable[a * verts.length + b] = [...conOf[a]].some((c) =>
      conOf[b].has(c),
    )
      ? 1
      : 0;
const sameCon = (a, b) => sameConTable[a * verts.length + b] === 1;
const push = (a, b, want, k) => {
  const dx = P[b][0] - P[a][0];
  const dy = P[b][1] - P[a][1];
  const d = Math.hypot(dx, dy) || 1e-9;
  if (d >= want) return;
  const m = ((want - d) / 2) * k;
  P[a][0] -= (dx / d) * m;
  P[a][1] -= (dy / d) * m;
  P[b][0] += (dx / d) * m;
  P[b][1] += (dy / d) * m;
};
const numbered = verts.map((_, i) => i).filter(isNumbered);
const clampAll = () => {
  verts.forEach((v, i) => {
    const [x0, x1, y0, y1] = v.n
      ? [0.05, 0.95, 0.05, 0.92]
      : [0.01, 0.99, 0.01, 0.99];
    P[i][0] = Math.min(x1, Math.max(x0, P[i][0]));
    P[i][1] = Math.min(y1, Math.max(y0, P[i][1]));
  });
};
const shapeStep = (k) => {
  const sum = verts.map(() => [0, 0, 0]);
  for (const g of groups) {
    if (g.ids.length < 2) continue;
    const t = fit(g);
    g.ids.forEach((id, j) => {
      sum[id][0] += t[j][0] - P[id][0];
      sum[id][1] += t[j][1] - P[id][1];
      sum[id][2] += 1;
    });
  }
  sum.forEach(([x, y, c], i) => {
    if (c === 0) return;
    P[i][0] += (k * x) / c;
    P[i][1] += (k * y) / c;
  });
};
/** 별자리 선분(가른 곳을 건너는 선 제외) */
const segments = [];
for (const p of polylines)
  p.ids.forEach((id, k) => {
    const prev = p.ids[k - 1];
    if (
      id !== null &&
      prev !== null &&
      prev !== undefined &&
      prev !== id &&
      !crosses(prev, id)
    )
      segments.push({ con: p.con, a: prev, b: id });
  });
/** 다른 별자리 선분에 꼭짓점이 SEG_APART보다 가까우면 꼭짓점과 선분을 서로 밀어낸다(선이 엉키지 않게) */
const SEG_APART = 0.03;
const UNTANGLE = 2;
/** 덩어리 가운데를 처음 자리로 당기는 세기(번호 별 있는 별자리, 없는 별자리) */
const HOME_NUMBERED = 0.01;
const HOME_PLAIN = 0.001;
const CELL = 0.05;
const segmentStep = (k) => {
  const grid = new Map();
  const cellKey = (cx, cy) => cx * 1000 + cy;
  segments.forEach((s, si) => {
    const [ax, ay] = P[s.a];
    const [bx, by] = P[s.b];
    const x0 = Math.floor((Math.min(ax, bx) - SEG_APART) / CELL);
    const x1 = Math.floor((Math.max(ax, bx) + SEG_APART) / CELL);
    const y0 = Math.floor((Math.min(ay, by) - SEG_APART) / CELL);
    const y1 = Math.floor((Math.max(ay, by) + SEG_APART) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const key = cellKey(cx, cy);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(si);
      }
  });
  verts.forEach((_, v) => {
    if (groupsOf[v].length === 0) return;
    const list = grid.get(
      cellKey(Math.floor(P[v][0] / CELL), Math.floor(P[v][1] / CELL)),
    );
    if (!list) return;
    for (const si of list) {
      const s = segments[si];
      if (conOf[v].has(s.con) || s.a === v || s.b === v) continue;
      const [ax, ay] = P[s.a];
      const [bx, by] = P[s.b];
      const ex = bx - ax;
      const ey = by - ay;
      const ll = ex * ex + ey * ey || 1e-12;
      const t = Math.max(
        0,
        Math.min(1, ((P[v][0] - ax) * ex + (P[v][1] - ay) * ey) / ll),
      );
      const cx = ax + t * ex;
      const cy = ay + t * ey;
      const dx = P[v][0] - cx;
      const dy = P[v][1] - cy;
      const d = Math.hypot(dx, dy) || 1e-9;
      if (d >= SEG_APART) continue;
      const m = ((SEG_APART - d) / 2) * k;
      P[v][0] += (dx / d) * m;
      P[v][1] += (dy / d) * m;
      P[s.a][0] -= (dx / d) * m * (1 - t);
      P[s.a][1] -= (dy / d) * m * (1 - t);
      P[s.b][0] -= (dx / d) * m * t;
      P[s.b][1] -= (dy / d) * m * t;
    }
  });
};
/** 서로 다른 별자리 선분이 엇갈리면, 상대 선에 가장 가까운 끝점을 건너편으로 넘긴다(상대 선분도 반대로 조금) */
const side = (p, a, b) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const untangleStep = (k) => {
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i];
      const t = segments[j];
      if (
        s.con === t.con ||
        s.a === t.a ||
        s.a === t.b ||
        s.b === t.a ||
        s.b === t.b
      )
        continue;
      const [A, B, C, D] = [P[s.a], P[s.b], P[t.a], P[t.b]];
      if (
        Math.max(A[0], B[0]) < Math.min(C[0], D[0]) ||
        Math.max(C[0], D[0]) < Math.min(A[0], B[0])
      )
        continue;
      if (
        Math.max(A[1], B[1]) < Math.min(C[1], D[1]) ||
        Math.max(C[1], D[1]) < Math.min(A[1], B[1])
      )
        continue;
      if (
        side(A, C, D) * side(B, C, D) >= 0 ||
        side(C, A, B) * side(D, A, B) >= 0
      )
        continue;
      // 끝점마다 상대 선(무한 직선)까지 거리 → 가장 가까운 끝점을 넘긴다
      const cand = [
        [s.a, C, D, t],
        [s.b, C, D, t],
        [t.a, A, B, s],
        [t.b, A, B, s],
      ].map(([id, p, q, other]) => {
        const ex = q[0] - p[0];
        const ey = q[1] - p[1];
        const len = Math.hypot(ex, ey) || 1e-9;
        const d = side(P[id], p, q) / len;
        return { id, nx: -ey / len, ny: ex / len, d, other };
      });
      cand.sort((x, y) => Math.abs(x.d) - Math.abs(y.d));
      const { id, nx, ny, d, other } = cand[0];
      // 끝점이 있는 쪽의 반대편으로 |d| + 여백만큼(끝점 하나는 k, 상대 선분 두 끝은 반대로 k/2씩)
      const m = (Math.abs(d) + 0.006) * k;
      const sgn = d > 0 ? -1 : 1;
      P[id][0] += sgn * nx * m;
      P[id][1] += sgn * ny * m;
      for (const e of [other.a, other.b]) {
        P[e][0] -= (sgn * nx * m) / 2;
        P[e][1] -= (sgn * ny * m) / 2;
      }
    }
};
function countCrossings() {
  let c = 0;
  const pairs = {};
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i];
      const t = segments[j];
      if (
        s.con === t.con ||
        s.a === t.a ||
        s.a === t.b ||
        s.b === t.a ||
        s.b === t.b
      )
        continue;
      const [A, B, C, D] = [P[s.a], P[s.b], P[t.a], P[t.b]];
      if (
        side(A, C, D) * side(B, C, D) < 0 &&
        side(C, A, B) * side(D, A, B) < 0
      ) {
        c++;
        const k = [s.con, t.con].sort().join("/");
        pairs[k] = (pairs[k] ?? 0) + 1;
      }
    }
  return c === 0 ? "0" : `${c} ${JSON.stringify(pairs)}`;
}
const STEPS = 3000;
for (let it = 0; it < STEPS; it++) {
  shapeStep(0.5);
  const before = P.map(([x, y]) => [x, y]);
  for (let i = 0; i < numbered.length; i++)
    for (let j = i + 1; j < numbered.length; j++)
      push(numbered[i], numbered[j], GAP, 0.5);
  for (let a = 0; a < verts.length; a++)
    for (let b = a + 1; b < verts.length; b++) {
      if (sameCon(a, b)) continue;
      const want = isNumbered(a) || isNumbered(b) ? APART_NUMBERED : APART;
      if (
        Math.abs(P[a][0] - P[b][0]) >= want ||
        Math.abs(P[a][1] - P[b][1]) >= want
      )
        continue;
      push(a, b, want, 0.3);
    }
  segmentStep(0.3);
  untangleStep(UNTANGLE);
  // 밀린 만큼을 덩어리 전체가 함께 옮긴다(꼭짓점 하나만 밀리면 모양 힘이 도로 당겨 이웃 별자리가 비켜나지 못한다)
  const delta = P.map(([x, y], i) => [x - before[i][0], y - before[i][1]]);
  for (const g of groups) {
    let mx = 0;
    let my = 0;
    for (const id of g.ids) {
      mx += delta[id][0];
      my += delta[id][1];
    }
    const k = (g.numbered ? 0.5 : 1) / g.ids.length;
    for (const id of g.ids) {
      P[id][0] += (mx * k) / groupsOf[id].length;
      P[id][1] += (my * k) / groupsOf[id].length;
    }
  }
  for (const g of groups) {
    const [cx, cy] = centroid(g);
    const HOME = g.numbered ? HOME_NUMBERED : HOME_PLAIN;
    for (const id of g.ids) {
      P[id][0] += ((g.home[0] - cx) * HOME) / groupsOf[id].length;
      P[id][1] += ((g.home[1] - cy) * HOME) / groupsOf[id].length;
    }
  }
  clampAll();
}
// 마무리: 손가락 틈 MIN_GAP(2026-11-01 전 판의 실제 최소 0.0946과 같은 수준)을 확실히 둔다. 대개 이미 넘어 거의 움직이지 않는다
const MIN_GAP = 0.095;
for (let it = 0; it < 200; it++) {
  for (let i = 0; i < numbered.length; i++)
    for (let j = i + 1; j < numbered.length; j++)
      push(numbered[i], numbered[j], MIN_GAP, 1);
  clampAll();
}

// 7. 별자리 선: 꼭짓점 자리를 잇는다. 가른 곳을 건너는 곳과 남쪽 끝(-47°) 아래에서 끊는다
const lines = [];
/** 그림 위쪽 가장자리 밖(북극 너머로 이어지는 선의 끝) */
const ABOVE = -0.04;
for (const p of polylines) {
  let run = [];
  const flush = () => {
    if (run.length >= 2) lines.push({ con: p.con, pts: run });
    run = [];
  };
  p.ids.forEach((id, k) => {
    if (id === null) {
      flush();
      return;
    }
    const prev = p.ids[k - 1];
    const at = P[id].map(round);
    if (prev !== null && prev !== undefined && crosses(prev, id)) {
      // 북극 근처에서 그림 폭을 넘나드는 선(작은곰자리 → 북극성)은 북극 너머로 이어진다: 앞 별에서 위쪽 가장자리 밖으로
      // 나가고, 다음 별 위쪽 가장자리 밖에서 들어오게 그린다(2026-11-01 사용자). 그 밖의 곳(세페우스 등)은 끊는다
      const a = verts[prev].dec;
      const b = verts[id].dec;
      const polar = Math.min(a, b) > 60 && Math.max(a, b) > 85;
      if (polar && run.length > 0) run.push([run[run.length - 1][0], ABOVE]);
      flush();
      if (polar) run.push([at[0], ABOVE]);
    }
    run.push(at);
  });
  flush();
}

function round(v) {
  return Math.round(v * 10000) / 10000;
}

const data = {
  stars: stars.map((s) => ({
    n: s.n,
    ko: s.ko,
    name: s.name,
    con: CON[s.con],
    bayer: s.bayer,
    ra: Math.round(s.ra * 100) / 100,
    dec: Math.round(s.dec * 100) / 100,
    mag: s.mag,
    k: s.k,
    x: round(P[s.n - 1][0]),
    y: round(P[s.n - 1][1]),
    fact: facts[String(s.n)],
  })),
  lines,
};
writeFileSync(out, `${JSON.stringify(data)}\n`);
console.log(
  `별 ${data.stars.length}개, 별자리 선 ${lines.length}줄, 다른 별자리 선끼리 엇갈림 ${countCrossings()} → ${out}`,
);
