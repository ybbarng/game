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
//    ①-2 국소 모양: 꼭짓점마다 선으로 이어진 이웃 묶음의 실제 모양(각도·길이 비율)으로 당긴다
//    ①-3 한 줄: 실제로 160° 넘게 펴진 이웃 셋은 한 줄·차례·비율을 지키는 선형 제약으로 맞춘다
//    ② 손가락 틈: 번호 별끼리 GAP보다 가까우면 떼어 놓는다(같은 별자리면 실제 하늘에서 둘을 잇는 방향을 섞어서)
//    ③ 겹침: 서로 다른 별자리 꼭짓점끼리, 꼭짓점과 다른 별자리 선분이 너무 가까우면 밀어내고, 엇갈린 선분은 풀어 준다
//    ④ ②③에서 밀린 만큼을 덩어리 전체가 함께 옮긴다
//    ⑤ 제자리: 덩어리 가운데를 처음 자리로 약하게 당긴다(동서남북 차례)
//    ⑥ 가장자리: 번호 별은 0.05~0.95 · 0.05~0.92, 어두운 별은 판 안
//    그 뒤 손가락 틈을 확실히 두고, 번호 별을 고정한 채 번호 없는 별만 다시 맞춘다(다듬기). 끝에 점검한다
const MAX_TURN = 10 * DEG;
/** 보통 크기: 360px 판에서 하늘 1도가 약 1.8px(그릴 하늘 넓이를 판 넓이에 고르게 편 값) */
const BASE = 1.8 / (360 * DEG);
const SCALE_NUMBERED = [0.8, 2.2];
const SCALE_PLAIN = [0.7, 1.4];
for (const g of groups) g.numbered = g.ids.some((id) => verts[id].n !== null);
const GAP = 0.1;
// 번호 별 둘이 가까운 별자리(쌍둥이 카스토르·폴룩스, 오리온 허리띠)는 그 쌍이 손가락 틈의 PAIR_LIFT만큼 떨어지는 크기까지는
// 별자리 전체를 고르게 키운다(상한 안에서). 나머지 틈은 그 둘레를 늘려 메운다(국소 모양·한 줄 제약이 이웃을 함께 옮긴다)
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
/**
 * 꼭짓점 ids의 실제 모양 ref를 고른 크기·옮기기·돌리기(±maxTurn, 북쪽 위로 천천히 되돌림)로 지금 자리에 가장 잘 맞춘
 * 목표 자리. scaleOf가 있으면 맞춘 크기를 그 함수로 고친다
 */
const similar = (ids, ref, maxTurn, scaleOf) => {
  let px = 0;
  let py = 0;
  let qx = 0;
  let qy = 0;
  ids.forEach((id, k) => {
    px += P[id][0];
    py += P[id][1];
    qx += ref[k][0];
    qy += ref[k][1];
  });
  px /= ids.length;
  py /= ids.length;
  qx /= ids.length;
  qy /= ids.length;
  let a = 0;
  let b = 0;
  let qq = 0;
  ids.forEach((id, k) => {
    const rx = ref[k][0] - qx;
    const ry = ref[k][1] - qy;
    const ox = P[id][0] - px;
    const oy = P[id][1] - py;
    a += rx * ox + ry * oy;
    b += rx * oy - ry * ox;
    qq += rx * rx + ry * ry;
  });
  const turn = 0.9 * Math.max(-maxTurn, Math.min(maxTurn, Math.atan2(b, a)));
  const fitted = qq > 0 ? (a * Math.cos(turn) + b * Math.sin(turn)) / qq : 0;
  const scale = scaleOf ? scaleOf(fitted) : fitted;
  const cs = scale * Math.cos(turn);
  const sn = scale * Math.sin(turn);
  return ref.map(([x, y]) => [
    px + cs * (x - qx) - sn * (y - qy),
    py + sn * (x - qx) + cs * (y - qy),
  ]);
};
/** 국소 묶음은 덩어리보다 조금 더 돌 수 있다(모양은 각도·비율로 지키고, 방향은 덩어리 힘이 잡는다) */
const LOCAL_TURN = 20 * DEG;
const fit = (g) =>
  similar(g.ids, g.ref, MAX_TURN, (fitted) => {
    // 크기는 판 전체의 보통 크기(BASE) 둘레에 머문다. 번호 별이 있는 별자리는 손가락 틈을 위해 더 커질 수 있고,
    // 번호 별 없는 별자리는 보통 크기로 천천히 돌아간다(이웃에 밀려 쪼그라들지 않게)
    const [lo, hi] = g.numbered ? SCALE_NUMBERED : SCALE_PLAIN;
    const scale = Math.min(hi * BASE, Math.max(lo * BASE, g.minScale, fitted));
    return g.numbered ? scale : scale + (BASE - scale) * 0.02;
  });
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
/** a와 b가 want보다 가까우면 떼어 놓는다. dir(단위 벡터, a → b)이 있으면 그 방향으로, 없으면 지금 방향으로 */
const push = (a, b, want, k, dir) => {
  const dx = P[b][0] - P[a][0];
  const dy = P[b][1] - P[a][1];
  const d = Math.hypot(dx, dy) || 1e-9;
  if (d >= want) return;
  const m = ((want - d) / 2) * k;
  let [ux, uy] = [dx / d, dy / d];
  // 실제 방향이 지금 방향과 크게 어긋나면(비스듬하면 밀어도 거리가 늘지 않는다) 지금 방향, 아니면 둘을 섞는다
  if (dir && dir[0] * ux + dir[1] * uy > 0.3) {
    const sx = ux + dir[0];
    const sy = uy + dir[1];
    const s = Math.hypot(sx, sy);
    [ux, uy] = [sx / s, sy / s];
  }
  P[a][0] -= ux * m;
  P[a][1] -= uy * m;
  P[b][0] += ux * m;
  P[b][1] += uy * m;
};
const numbered = verts.map((_, i) => i).filter(isNumbered);
// 같은 별자리의 번호 별 둘은 실제 하늘에서 둘을 잇는 방향으로 뗀다(그 축으로 별자리를 늘이는 셈). 지금 방향으로 떼면
// 처음에 거의 겹친 두 별(오리온 허리띠 37·20)이 엉뚱한 쪽으로 밀려 이웃 별을 넘어가 모양이 접혔다
const pairDir = new Map();
for (const g of groups)
  for (let i = 0; i < g.ids.length; i++)
    for (let j = 0; j < g.ids.length; j++) {
      const [a, b] = [g.ids[i], g.ids[j]];
      if (verts[a].n === null || verts[b].n === null || a >= b) continue;
      const dx = g.ref[j][0] - g.ref[i][0];
      const dy = g.ref[j][1] - g.ref[i][1];
      const d = Math.hypot(dx, dy) || 1e-9;
      if (!pairDir.has(a * verts.length + b))
        pairDir.set(a * verts.length + b, [dx / d, dy / d]);
    }
const pushNumbered = (want, k) => {
  for (let i = 0; i < numbered.length; i++)
    for (let j = i + 1; j < numbered.length; j++) {
      const [a, b] = [numbered[i], numbered[j]];
      push(a, b, want, k, pairDir.get(a * verts.length + b));
    }
};
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

// 꼭 지킬 모양의 짜임(2026-11-01 사용자: "모양의 특징만 유지해서 알아볼 수 있는 정도면 변형이 일어나도 괜찮아. 원래 겹쳐 있지
// 않은 선이 겹치는 문제만 생기지 않으면 돼"). 수학으로는 평면 그림의 짜임을 지키는 변형(아이소토피)이다:
// ① 평면 매장 보존: 원래 하늘에서 만나지 않던 두 선분은 판에서도 만나지 않는다(같은 별자리 안, 다른 별자리 사이 모두)
// ② 회전 순서 보존: 한 별에서 뻗은 선들의 시계 방향 차례가 원래 하늘과 같다
/** 같은 두 별을 잇는 선분은 하나로(여러 꺾은선이 같은 선을 겹쳐 그린 곳이 있다) */
const edges = [];
{
  const seen = new Set();
  for (const s of segments) {
    const key = s.a < s.b ? `${s.a}-${s.b}` : `${s.b}-${s.a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(s);
  }
}
const cross3 = (p, q) => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
/** 하늘(구면)에서 두 대원호 AB·CD가 만나는지(끝점을 함께 쓰면 만나지 않는 것으로 본다) */
const arcsMeet = (A, B, C, D) => {
  const n1 = cross3(A, B);
  const n2 = cross3(C, D);
  const p = cross3(n1, n2);
  const len = Math.hypot(...p);
  if (len < 1e-12) return false;
  for (const s of [1, -1]) {
    const x = p.map((v) => (s * v) / len);
    const onArc = (U, V) =>
      dot(cross3(U, x), cross3(U, V)) > 0 &&
      dot(cross3(x, V), cross3(U, V)) > 0;
    if (onArc(A, B) && onArc(C, D)) return true;
  }
  return false;
};
/** 판에서 두 선분이 만나는지(끝점을 함께 쓰면 만나지 않는 것으로 본다) */
const segsMeet = (A, B, C, D) => {
  const s = (p, a, b) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  return s(A, C, D) * s(B, C, D) < 0 && s(C, A, B) * s(D, A, B) < 0;
};
const shareEnd = (s, t) =>
  s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b;
/** 원래 하늘에서 만나는 선분 쌍(이것만은 판에서 만나도 된다) */
const meetInSky = new Set();
for (let i = 0; i < edges.length; i++)
  for (let j = i + 1; j < edges.length; j++) {
    const [s, t] = [edges[i], edges[j]];
    if (shareEnd(s, t)) continue;
    if (
      arcsMeet(verts[s.a].vec, verts[s.b].vec, verts[t.a].vec, verts[t.b].vec)
    )
      meetInSky.add(`${i}:${j}`);
  }
/** 판에서 새로 만나게 된 선분 쌍(원래 하늘에서는 만나지 않던 것) */
const newMeetingPairs = () => {
  const out = [];
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const [s, t] = [edges[i], edges[j]];
      if (shareEnd(s, t) || meetInSky.has(`${i}:${j}`)) continue;
      if (segsMeet(P[s.a], P[s.b], P[t.a], P[t.b])) out.push([s, t]);
    }
  return out;
};
/** 꼭짓점마다 이웃(선으로 이어진 별) */
const around = verts.map(() => new Set());
for (const e of edges) {
  around[e.a].add(e.b);
  around[e.b].add(e.a);
}
/** 별 v에서 본 이웃 w의 방향(그 별의 접평면, 판과 같게 동쪽이 왼쪽·북쪽이 위) */
const skyAngle = (v, w) => {
  const { ra, dec } = verts[v];
  const east = [-Math.sin(ra * DEG), Math.cos(ra * DEG), 0];
  const north = [
    -Math.sin(dec * DEG) * Math.cos(ra * DEG),
    -Math.sin(dec * DEG) * Math.sin(ra * DEG),
    Math.cos(dec * DEG),
  ];
  const d = verts[w].vec;
  return Math.atan2(-dot(d, north), -dot(d, east));
};
/** 이웃을 각도 차례로 늘어놓고, 가장 작은 번호부터 시작하게 돌린 차례(시계 방향 차례 비교용) */
const cyclic = (v, angleOf) => {
  const order = [...around[v]].sort((a, b) => angleOf(a) - angleOf(b));
  const k = order.indexOf(Math.min(...order));
  return [...order.slice(k), ...order.slice(0, k)].join(",");
};
const skyOrder = verts.map((_, v) =>
  around[v].size >= 3 ? cyclic(v, (w) => skyAngle(v, w)) : "",
);
/** 판에서 시계 방향 차례가 원래 하늘과 달라진 별 */
const orderChanged = () =>
  verts
    .map((_, v) => v)
    .filter(
      (v) =>
        skyOrder[v] !== "" &&
        cyclic(v, (w) => Math.atan2(P[w][1] - P[v][1], P[w][0] - P[v][0])) !==
          skyOrder[v],
    );
// 국소 모양: 꼭짓점마다 그 별과 선으로 이어진 이웃들(한 덩어리 안)을 한 묶음으로 두고, 그 묶음의 실제 모양을 고른 크기·
// 옮기기·돌리기로 맞춘 자리로 당긴다. 덩어리 전체를 맞추는 힘만으로는 손가락 틈 때문에 별 하나가 밀려도 막지 못해
// 오리온 허리띠 가운데 별이 줄 밖으로 접혔다(2026-11-01 사용자). 이 힘이 이웃 각도·길이 비율·일직선을 지켜, 별을
// 떼야 하면 이웃이 줄 방향으로 함께 따라와 그 둘레가 고르게 늘어난다
/** 국소 묶음: 가운데 꼭짓점과 이웃(덩어리 안 번호), 실제 모양 */
const cells = [];
for (const g of groups) {
  const index = new Map(g.ids.map((id, i) => [id, i]));
  const near = g.ids.map(() => new Set());
  for (const s of segments) {
    if (s.con !== g.con || !index.has(s.a) || !index.has(s.b)) continue;
    near[index.get(s.a)].add(index.get(s.b));
    near[index.get(s.b)].add(index.get(s.a));
  }
  near.forEach((ns, i) => {
    if (ns.size < 2) return;
    const members = [i, ...[...ns].sort((a, b) => a - b)];
    cells.push({
      con: g.con,
      ids: members.map((m) => g.ids[m]),
      ref: members.map((m) => g.ref[m]),
    });
  });
}
// 한 줄로 늘어선 별: 실제 하늘에서 STRAIGHT보다 펴진 이웃 셋(a-b-c, b에서 두 선)은 "b가 a와 c를 잇는 선 위, 실제와
// 같은 비율 t 자리에 있다"(b − (1−t)a − t·c = 0)를 차례마다 셋에 나눠 맞춘다. 한 줄·차례·간격 비율을 함께 지키고,
// 번호 별 하나를 떼면 그 힘이 줄 끝 별까지 전해져 줄 전체가 그 방향으로 고르게 늘어난다(오리온 허리띠 37-20-민타카)
const STRAIGHT = 160 * DEG;
const lineups = [];
for (const c of cells) {
  const [b, ...ns] = c.ref;
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++) {
      const [a, z] = [ns[i], ns[j]];
      const ux = a[0] - b[0];
      const uy = a[1] - b[1];
      const vx = z[0] - b[0];
      const vy = z[1] - b[1];
      const angle = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
      if (angle < STRAIGHT) continue;
      const ex = z[0] - a[0];
      const ey = z[1] - a[1];
      const ee = ex * ex + ey * ey;
      const t = ((b[0] - a[0]) * ex + (b[1] - a[1]) * ey) / ee;
      const h = (ex * (b[1] - a[1]) - ey * (b[0] - a[0])) / ee;
      lineups.push({ a: c.ids[1 + i], b: c.ids[0], c: c.ids[1 + j], t, h });
    }
}
/** b에서 a → c로 도는 각도(도, 부호 있음. 차례가 뒤집히면 부호가 바뀐다) */
const turnAt = (A, B, C) => {
  const ux = A[0] - B[0];
  const uy = A[1] - B[1];
  const vx = C[0] - B[0];
  const vy = C[1] - B[1];
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) / DEG;
};
/**
 * 점검: 이웃 셋(b에서 두 선)의 각도가 실제 모양에서 얼마나 바뀌었나. 실제 하늘에서 STRAIGHT보다 펴진 셋(한 줄로 선 별)과
 * 모든 셋을 따로 센다. 판(360px)에서 두 선이 다 SHORT_PX 넘는 것만 센다(몇 px짜리 선의 꺾임은 보이지 않는다)
 */
const SHORT_PX = 8;
const bendCheck = () => {
  const straight = [];
  const all = [];
  for (const c of cells) {
    const [b, ...ns] = c.ids;
    for (let i = 0; i < ns.length; i++)
      for (let j = i + 1; j < ns.length; j++) {
        const [a, z] = [ns[i], ns[j]];
        const len = (p, q) => Math.hypot(P[p][0] - P[q][0], P[p][1] - P[q][1]);
        if (Math.min(len(a, b), len(z, b)) * 360 < SHORT_PX) continue;
        const ref = turnAt(c.ref[1 + i], c.ref[0], c.ref[1 + j]);
        const now = turnAt(P[a], P[b], P[z]);
        const bend = Math.abs(((now - ref + 540) % 360) - 180);
        const name = (id) => (verts[id].n ? String(verts[id].n) : "·");
        const row = {
          con: c.con,
          at: `${name(a)}-${name(b)}-${name(z)}`,
          bend,
        };
        all.push(row);
        if (Math.abs(ref) * DEG >= STRAIGHT) straight.push(row);
      }
  }
  const worst = (rows) => rows.reduce((m, r) => (r.bend > m.bend ? r : m));
  const mean = (rows) => rows.reduce((s, r) => s + r.bend, 0) / rows.length;
  return { straight, all, worst, mean };
};
// 제약: b = a + t·e + h·R(e), e = c − a, R은 90° 돌리기(t는 줄 위 비율, h는 줄에서 비켜난 비율, 둘 다 실제 하늘 값).
// 실제 세 별의 각도·비율을 그대로 지킨다. 식이 선형이라 잘못된 정도 C를 셋에 바로 나눠 맞춘다(움직이기 쉬운 정도 w로
// 나눔: b에는 −w_b·C, a에는 w_a((1−t)C + h·R(C)), c에는 w_c(t·C − h·R(C)), 모두 ÷ (w_b + w_a((1−t)²+h²) + w_c(t²+h²)))
/** 한 줄 제약을 맞출 때 얼마나 쉽게 움직이나: 번호 별은 손가락 틈을 지키느라 무겁고, 번호 없는 별이 줄을 맞추러 움직인다 */
const NUMBERED_LIGHTNESS = 0.1;
const lightness = (id) => (verts[id].n === null ? 1 : NUMBERED_LIGHTNESS);
const RATIO_SLACK = 0.4;
const lineupStep = (k) => {
  for (const { a, b, c, t: tRef, h } of lineups) {
    const ex = P[c][0] - P[a][0];
    const ey = P[c][1] - P[a][1];
    // 줄 위 간격 비율은 실제 값 둘레(RATIO_SLACK 안)에서 늘어나도 된다: 번호 별 둘을 떼야 하면 그 너머 별(민타카)은
    // 같은 줄 위 바깥에 남기만 하면 된다(차례는 그대로). 비율까지 다 지키면 오리온이 판 절반보다 커져야 한다
    const tNow =
      ((P[b][0] - P[a][0]) * ex + (P[b][1] - P[a][1]) * ey) /
      (ex * ex + ey * ey || 1e-12);
    // 늘어나도 되는 쪽은 번호 별 둘이 이웃한 구간뿐이다(a-b가 번호 별 둘이면 t가 커지고, b-c면 작아진다). 다른 줄은 비율 그대로
    const numA = verts[a].n !== null && verts[b].n !== null;
    const numC = verts[c].n !== null && verts[b].n !== null;
    const t = Math.min(
      numA ? 1 - (1 - tRef) * RATIO_SLACK : tRef,
      Math.max(numC ? tRef * RATIO_SLACK : tRef, tNow),
    );
    const cx = P[b][0] - P[a][0] - t * ex + h * ey;
    const cy = P[b][1] - P[a][1] - t * ey - h * ex;
    const [wa, wb, wc] = [a, b, c].map(lightness);
    const den =
      wb + wa * ((1 - t) ** 2 + h * h) + wc * (t ** 2 + h * h) || 1e-9;
    const mx = (k * cx) / den;
    const my = (k * cy) / den;
    // R(C) = (−Cy, Cx)
    P[b][0] -= wb * mx;
    P[b][1] -= wb * my;
    P[a][0] += wa * ((1 - t) * mx - h * my);
    P[a][1] += wa * ((1 - t) * my + h * mx);
    P[c][0] += wc * (t * mx + h * my);
    P[c][1] += wc * (t * my - h * mx);
  }
};
const LOCAL = 0.5;
const localStep = (k) => {
  const sum = verts.map(() => [0, 0, 0]);
  for (const c of cells) {
    const t = similar(c.ids, c.ref, LOCAL_TURN, null);
    c.ids.forEach((id, j) => {
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
const STEPS = 3000;
for (let it = 0; it < STEPS; it++) {
  shapeStep(0.5);
  localStep(LOCAL);
  const before = P.map(([x, y]) => [x, y]);
  lineupStep(1);
  pushNumbered(GAP, 1);
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
const minNumbered = () => {
  let m = Infinity;
  for (let i = 0; i < numbered.length; i++)
    for (let j = i + 1; j < numbered.length; j++)
      m = Math.min(
        m,
        Math.hypot(
          P[numbered[i]][0] - P[numbered[j]][0],
          P[numbered[i]][1] - P[numbered[j]][1],
        ),
      );
  return m;
};
// 마무리: 손가락 틈 MIN_GAP(2026-11-01 전 판의 실제 최소 0.0946과 같은 수준)을 확실히 둔다. 이 뒤로 번호 별은 움직이지 않는다
const MIN_GAP = 0.095;
for (let it = 0; it < 200; it++) {
  for (let i = 0; i < numbered.length; i++)
    for (let j = i + 1; j < numbered.length; j++)
      push(numbered[i], numbered[j], MIN_GAP, 1);
  clampAll();
}

// 다듬기: 번호 별은 이제 그 자리에 고정하고(손가락 틈·선 꼭짓점 일치는 그대로), 번호 없는 별만 움직여 별자리 모양을 다시
// 맞춘다. 떼느라 번호 별 사이가 늘어난 곳은 그 둘레의 번호 없는 별이 따라 옮겨 한 줄·차례·각도를 지킨다
// (오리온 허리띠: 37·20을 뗀 만큼 민타카가 같은 줄 위 20 너머로 간다)
const pinned = numbered.map((id) => [P[id][0], P[id][1]]);
const pin = () =>
  numbered.forEach((id, i) => {
    P[id][0] = pinned[i][0];
    P[id][1] = pinned[i][1];
  });
for (let it = 0; it < 600; it++) {
  shapeStep(0.5);
  pin();
  localStep(1);
  pin();
  for (let r = 0; r < 3; r++) lineupStep(1);
  pin();
  segmentStep(0.3);
  untangleStep(UNTANGLE);
  pin();
  clampAll();
}

// 짜임 고치기: 원래 만나지 않던 선분이 판에서 만나면(위 단계는 다른 별자리끼리만 풀어, 같은 별자리 안에서 몇 px짜리
// 선이 엇갈린 곳이 남는다: 염소자리·두루미자리), 그 별자리의 번호 없는 별만 움직여 푼다. 다른 별자리와 번호 별은
// 바이트까지 그대로다(2026-11-01 사용자가 모양 우선 판으로 정함)
for (let round = 0; round < 300; round++) {
  const pairs = newMeetingPairs();
  if (pairs.length === 0) break;
  const cons = new Set(pairs.flatMap(([s, t]) => [s.con, t.con]));
  const movable = verts.map(
    (v, i) =>
      v.n === null &&
      groupsOf[i].length > 0 &&
      groupsOf[i].every((g) => cons.has(groups[g].con)),
  );
  const kept = P.map(([x, y]) => [x, y]);
  for (const [s, t] of pairs) {
    // 움직일 수 있는 끝점 가운데 상대 선(무한 직선)에 가장 가까운 것을 건너편으로 넘긴다
    const cand = [
      [s.a, t],
      [s.b, t],
      [t.a, s],
      [t.b, s],
    ]
      .filter(([id]) => movable[id])
      .map(([id, other]) => {
        const [p, q] = [P[other.a], P[other.b]];
        const ex = q[0] - p[0];
        const ey = q[1] - p[1];
        const len = Math.hypot(ex, ey) || 1e-9;
        return { id, nx: -ey / len, ny: ex / len, d: side(P[id], p, q) / len };
      })
      .sort((x, y) => Math.abs(x.d) - Math.abs(y.d));
    if (!cand[0]) continue;
    const { id, nx, ny, d } = cand[0];
    const m = Math.abs(d) + 0.004;
    P[id][0] -= Math.sign(d) * nx * m;
    P[id][1] -= Math.sign(d) * ny * m;
  }
  localStep(0.3);
  verts.forEach((_, i) => {
    if (movable[i]) return;
    P[i][0] = kept[i][0];
    P[i][1] = kept[i][1];
  });
}

// 점검(어기면 멈춘다): 번호 별 최소 거리, 평면 매장·회전 순서 보존, 한 줄로 선 별의 꺾임
const bends = bendCheck();
const straightWorst = bends.worst(bends.straight);
const allWorst = bends.worst(bends.all);
const met = newMeetingPairs().map(([s, t]) => `${s.con}/${t.con}`);
const turned = orderChanged();
const report = [
  `번호 별 최소 거리 ${minNumbered().toFixed(4)}(360px 판 ${(minNumbered() * 360).toFixed(1)}px)`,
  `평면 매장: 원래 하늘에서 만나는 선분 쌍 ${meetInSky.size}, 판에서 새로 만난 쌍 ${met.length}${met.length ? `(${[...new Set(met)].join(", ")})` : ""}`,
  `회전 순서: 선이 셋 넘게 모이는 별 ${skyOrder.filter((s) => s !== "").length}곳 중 시계 방향 차례가 바뀐 별 ${turned.length}`,
  `한 줄로 선 별 ${bends.straight.length}곳 꺾임 평균 ${bends.mean(bends.straight).toFixed(1)}° · 최대 ${straightWorst.bend.toFixed(1)}°(${straightWorst.con} ${straightWorst.at})`,
  `이웃 셋 ${bends.all.length}곳 각도 변화 평균 ${bends.mean(bends.all).toFixed(1)}° · 최대 ${allWorst.bend.toFixed(1)}°(${allWorst.con} ${allWorst.at})`,
];
/** 한 줄로 선 별이 이만큼 넘게 꺾이면 멈춘다(2026-11-01 오리온 허리띠가 146° 접혔던 일) */
const STRAIGHT_LIMIT = 30;
const problems = [
  minNumbered() < 0.0945 && "손가락 틈 부족",
  met.length > 0 && "원래 만나지 않던 선분이 만남",
  turned.length > 0 && "선이 뻗는 차례가 바뀜",
  straightWorst.bend > STRAIGHT_LIMIT && "한 줄로 선 별이 꺾임",
].filter(Boolean);
if (problems.length)
  throw new Error(`${problems.join(", ")}\n${report.join("\n")}`);

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
// 단위 시험용 원래 하늘의 짜임: 선이 셋 넘게 모이는 별마다 그 별 자리와, 이웃 별 자리를 원래 하늘의 각도 차례로(sky.test.ts가
// 판에서 같은 차례인지 본다). 원래 하늘에서 만나는 선분 쌍도 적는다(그 밖의 선분은 판에서 만나면 안 된다)
const at = (id) => P[id].map(round);
writeFileSync(
  join(here, "../src/stardraw/sky-topology.json"),
  `${JSON.stringify({
    meetInSky: [...meetInSky].map((k) =>
      k.split(":").map((i) => [at(edges[i].a), at(edges[i].b)]),
    ),
    around: verts
      .map((_, v) => v)
      .filter((v) => around[v].size >= 3)
      .map((v) => ({
        at: at(v),
        order: [...around[v]]
          .sort((a, b) => skyAngle(v, a) - skyAngle(v, b))
          .map(at),
      })),
  })}\n`,
);
console.log(
  `별 ${data.stars.length}개, 별자리 선 ${lines.length}줄 → ${out}\n${report.join("\n")}`,
);
