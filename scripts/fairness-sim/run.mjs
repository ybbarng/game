#!/usr/bin/env node
// 공정한 동시 판정 모의 실험(docs/44). 결과를 마크다운 표로 찍는다. 제품 코드가 아니다.
//
//   nice -n 15 node scripts/fairness-sim/run.mjs           # 전체(이 맥 약 1분)
//   nice -n 15 node scripts/fairness-sim/run.mjs --quick   # 표본 1/5
//   nice -n 15 node scripts/fairness-sim/run.mjs --check   # 작은 경우 점검만
//
// 씨앗이 고정되어 있어 같은 명령은 늘 같은 숫자를 낸다.
import assert from "node:assert/strict";
import {
  BASE,
  cmp,
  GAMES,
  judge,
  METHODS,
  claim as makeClaim,
  makeRng,
  NETWORKS,
  pairTrial,
  playerTrial,
  quantile,
  sampleDevice,
  sampleLink,
  sampleRt,
  ZERO_NET,
} from "./sim.mjs";

const args = new Set(process.argv.slice(2));
const SCALE = args.has("--quick") ? 0.2 : 1;
const N = (n) => Math.max(200, Math.round(n * SCALE));
const SEED = 20261103;

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const ms = (x) => `${Math.round(x)}`;
const out = [];
const print = (s = "") => out.push(s);
function table(head, rows) {
  print(`| ${head.join(" | ")} |`);
  print(`|${head.map(() => "---").join("|")}|`);
  for (const r of rows) print(`| ${r.join(" | ")} |`);
  print();
}

// ---------------------------------------------------------------- 점검
function selfCheck() {
  const rng = makeRng(1);
  const zero = {
    ...BASE,
    frames: false,
    tick: 0,
    procMax: 0,
    touchSample: 0,
    extraFrameP: 0,
    devScale: 0,
  };
  const g = GAMES.simple;
  // 1. 지연 0·흔들림 0·기기 같음: 방법 1·2·3·8 모두 진짜 빠른 사람이 늘 이긴다, 동등하면 50%
  for (const kind of ["HG", "GH", "GG"]) {
    for (let i = 0; i < 500; i++) {
      const rt = sampleRt(rng, g);
      const { A, B } = pairTrial(rng, zero, ZERO_NET, kind, rt, rt + 1);
      for (const k of ["m1", "m2", "m3", "m3n", "m8"]) {
        assert.equal(METHODS[k].score(A, B), 1, `점검1 ${kind} ${k}`);
      }
      const e = pairTrial(rng, zero, ZERO_NET, kind, rt, rt);
      assert.equal(METHODS.m3.score(e.A, e.B), 0.5);
      assert.equal(METHODS.m1.score(e.A, e.B), 0.5);
      // 방법 4: 여분 0 → 여유 0에서 통과, 1ms 깎으면 걸린다
      if (kind !== "GG") {
        assert.ok(Math.abs(e.A.slack) < 1e-9 && Math.abs(e.B.slack) < 1e-9);
        assert.equal(
          judge(makeClaim(e.A, 1), makeClaim(e.B), "reject", 1e-6),
          0,
        );
      }
    }
  }
  // 2. 고정 지연(편도 21~39ms, 흔들림 0): 방법 3은 늘 맞고, 방법 1은 참가자가 RTT보다 덜 빠르면 진다
  const fixed = { ...ZERO_NET, base: 30 };
  for (let i = 0; i < 500; i++) {
    const rt = sampleRt(rng, g);
    let r = pairTrial(rng, zero, fixed, "GH", rt, rt + 30);
    assert.equal(METHODS.m3.score(r.A, r.B), 1);
    assert.equal(METHODS.m1.score(r.A, r.B), 0, "RTT 42ms 이상 > 30ms");
    r = pairTrial(rng, zero, fixed, "GH", rt, rt + 20);
    assert.equal(METHODS.m2.score(r.A, r.B), 0, "편도 21ms 이상 > 20ms 손해");
    r = pairTrial(rng, zero, fixed, "GH", rt, rt + 100);
    assert.equal(METHODS.m1.score(r.A, r.B), 1, "RTT 78ms 이하 < 100ms");
    r = pairTrial(rng, zero, fixed, "GH", rt, rt + 40);
    assert.equal(METHODS.m2.score(r.A, r.B), 1, "편도 39ms 이하 < 40ms");
  }
  // 3. 비대칭 a, 흔들림 0: 시계 맞추기 오차는 정확히 a/2
  const asym = { ...ZERO_NET, base: 30, asym: 20 };
  for (let i = 0; i < 200; i++) {
    const link = sampleLink(rng, zero, asym);
    const dev = sampleDevice(rng, zero);
    const p = playerTrial(rng, zero, asym, dev, link, 200);
    const want = (link.backBase - link.fwdBase) / 2;
    assert.ok(Math.abs(p.pressHost - p.event - want) < 1e-9, "Cristian 오차");
  }
  // 4. 창 X: 동등한 실력이면 50% 근처(우연 오차 안)
  const P = BASE;
  let s = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const rt = sampleRt(rng, g);
    const { A, B } = pairTrial(rng, P, NETWORKS.mixed, "GG", rt, rt);
    s += METHODS.m3x40.score(A, B);
  }
  assert.ok(Math.abs(s / n - 0.5) < 0.03, `점검4 ${s / n}`);
  return [
    "지연 0·흔들림 0·같은 기기: 방법 1·2·3·3′·8이 1ms 차이도 100% 맞히고, 동등하면 정확히 반반",
    "방법 4 여분이 정확히 0, 여유 0에서 1ms 깎은 청구가 늘 걸림",
    "고정 지연: 방법 3 100%, 방법 1은 RTT보다 작은 차이를 늘 뒤집고 큰 차이는 늘 맞힘, 방법 2는 편도만큼 손해",
    "비대칭 a에서 Cristian 시계 오차가 정확히 a/2",
    "창 X=40, 동등한 실력: 참가자 둘의 승률이 50% ± 3% 안",
  ];
}

// ---------------------------------------------------------------- 장면
function avgScore(n, seed, fn) {
  const rng = makeRng(seed);
  let s = 0;
  for (let i = 0; i < n; i++) s += fn(rng);
  return s / n;
}

/** 여러 방법을 같은 판(같은 난수)으로 함께 잰다 */
function multiScore(n, seed, keys, trial) {
  const rng = makeRng(seed);
  const sums = Object.fromEntries(keys.map((k) => [k, 0]));
  for (let i = 0; i < n; i++) {
    const { A, B } = trial(rng);
    for (const k of keys) sums[k] += METHODS[k].score(A, B);
  }
  return Object.fromEntries(keys.map((k) => [k, sums[k] / n]));
}

const CURVE_KEYS = ["m1", "m2", "m3n", "m3", "m3x20", "m3x40", "m3x60", "m8"];
const DELTAS = [0, 5, 10, 20, 30, 50, 75, 100];
const PAIRINGS = [
  ["GH", "참가자가 진짜 빠름(방장 + 참가자)"],
  ["HG", "방장이 진짜 빠름(방장 + 참가자)"],
  ["GG", "참가자 둘"],
];

function curves(P) {
  print("## 3-1. 진짜 반응 차이 Δ별 '진짜 빠른 사람이 이기는 비율'");
  print();
  print(
    "A가 Δms 빨리 반응한다(사람 반응 시간 기준). 동점·창 안은 0.5승으로 센다. 단순 반응 분포.",
  );
  print();
  for (const [nk, net] of Object.entries(NETWORKS)) {
    for (const [kind, label] of PAIRINGS) {
      const full = nk === "mixed";
      const ds = full ? DELTAS : [0, 10, 20, 50];
      const rows = ds.map((d, i) => {
        const r = multiScore(
          N(20000),
          SEED + i * 7 + kind.length,
          CURVE_KEYS,
          (rng) => {
            const rt = sampleRt(rng, GAMES.simple);
            return pairTrial(rng, P, net, kind, rt, rt + d);
          },
        );
        return [`${d}`, ...CURVE_KEYS.map((k) => pct(r[k]))];
      });
      print(`### ${net.label} · ${label}`);
      print();
      table(["Δ(ms)", ...CURVE_KEYS.map((k) => METHODS[k].label)], rows);
    }
  }
}

function hostEdge(P) {
  print("## 3-2. 실력이 같을 때 방장 승률(50%가 공정)");
  print();
  const keys = ["m1", "m2", "m3", "m3x40", "m8"];
  for (const [gk, game] of Object.entries(GAMES)) {
    const rows = Object.entries(NETWORKS).map(([, net], i) => {
      const r = multiScore(N(20000), SEED + 100 + i, keys, (rng) =>
        pairTrial(rng, P, net, "HG", sampleRt(rng, game), sampleRt(rng, game)),
      );
      return [net.label, ...keys.map((k) => pct(r[k]))];
    });
    print(`### ${game.label}${gk === "set" ? "(수 초)" : ""}`);
    print();
    table(["망", ...keys.map((k) => METHODS[k].label)], rows);
  }
}

function skillLuck(P) {
  print("## 3-3. 창 X를 넓히면 실력 차이가 운으로 바뀌는 정도");
  print();
  print(
    "참가자 둘(와이파이↔LTE). B는 판마다 같은 분포에서 뽑되 평균이 m만큼 느리다. '11판 다수' = 11판 중 6판 이상 이길 확률(이항).",
  );
  print();
  const net = NETWORKS.mixed;
  const cases = [
    ["simple", 10],
    ["simple", 20],
    ["simple", 40],
    ["halli", 50],
    ["halli", 100],
  ];
  const Xs = [0, 20, 40, 60, 100];
  const rows = [];
  for (const [gk, m] of cases) {
    const game = GAMES[gk];
    const rng = makeRng(SEED + 200 + m);
    const n = N(40000);
    let ideal = 0;
    const sums = Xs.map(() => 0);
    const coins = Xs.map(() => 0);
    for (let i = 0; i < n; i++) {
      const ra = sampleRt(rng, game);
      const rb = sampleRt(rng, game) + m;
      ideal += cmp(ra, rb);
      const { A, B } = pairTrial(rng, P, net, "GG", ra, rb);
      Xs.forEach((X, j) => {
        const d = Math.abs(A.rtMeas - B.rtMeas);
        if (d < X || d === 0) coins[j]++;
        sums[j] += d < X ? 0.5 : cmp(A.rtMeas, B.rtMeas);
      });
    }
    const p = [ideal / n, ...sums.map((v) => v / n)];
    rows.push([
      `${game.label} m=${m}`,
      ...p.map((v) => `${pct(v)} (${pct(majority(v, 11))})`),
      Xs.map((_, j) => pct(coins[j] / n)).join(" / "),
    ]);
  }
  table(
    [
      "경우",
      "기기·망 없음(이상)",
      ...Xs.map((X) => `3+5 X=${X}`),
      "동전으로 간 판 X=0/20/40/60/100",
    ],
    rows,
  );
}

function majority(p, n) {
  let s = 0;
  for (let k = Math.ceil((n + 1) / 2); k <= n; k++)
    s += binom(n, k) * p ** k * (1 - p) ** (n - k);
  return s;
}
function binom(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

const MARGINS = [0, 10, 20, 30, 50, 100, 200];

function honestBound(P) {
  print("## 3-4. 방법 4(아래 경계)에서 정직한 청구가 걸리는 비율");
  print();
  print(
    "여분 = 참가자 청구: (a − s) − RTT_min − rt, 방장 청구(참가자가 확인): (a_G − r_G) − rt_H. 여분 > 여유면 걸린다.",
  );
  print();
  const qRows = [];
  const rRows = [];
  for (const [i, net] of Object.values(NETWORKS).entries()) {
    const rng = makeRng(SEED + 300 + i);
    const g = [];
    const h = [];
    for (let k = 0; k < N(40000); k++) {
      const rt = sampleRt(rng, GAMES.simple);
      const { A, B } = pairTrial(rng, P, net, "HG", rt, rt);
      h.push(A.slack);
      g.push(B.slack);
    }
    g.sort((x, y) => x - y);
    h.sort((x, y) => x - y);
    for (const [who, arr] of [
      ["참가자 청구", g],
      ["방장 청구", h],
    ]) {
      qRows.push([
        net.label,
        who,
        ...[0.5, 0.9, 0.95, 0.99, 0.999].map((q) => ms(quantile(arr, q))),
      ]);
      rRows.push([
        net.label,
        who,
        ...MARGINS.map((m) =>
          pct(arr.filter((v) => v > m).length / arr.length),
        ),
      ]);
    }
  }
  print("### 정직한 여분의 분포(ms)");
  print();
  table(["망", "누구", "p50", "p90", "p95", "p99", "p99.9"], qRows);
  print("### 여유별로 걸리는 비율(버리기면 무효, 깎기면 rt가 올라감)");
  print();
  table(["망", "누구", ...MARGINS.map((m) => `여유 ${m}`)], rRows);
}

function humanLimit(P) {
  print("## 3-5. '너무 빠름(120ms 미만) 무효'에 걸리는 정직한 비율");
  print();
  const rows = Object.entries(GAMES).map(([, game], i) => {
    const rng = makeRng(SEED + 400 + i);
    let meas = 0;
    let human = 0;
    let meas80 = 0;
    const n = N(40000);
    for (let k = 0; k < n; k++) {
      const rt = sampleRt(rng, game);
      const p = playerTrial(
        rng,
        P,
        NETWORKS.lan,
        sampleDevice(rng, P),
        null,
        rt,
      );
      if (rt < 100) human++;
      if (p.rtMeas < 120) meas++;
      if (p.rtMeas < 150) meas80++;
    }
    return [game.label, pct(human / n), pct(meas / n), pct(meas80 / n)];
  });
  table(["게임", "사람 반응 < 100ms", "잰 rt < 120ms", "잰 rt < 150ms"], rows);
}

function cheats(P) {
  print(
    "## 4-1. rt를 d만큼 깎아 보고하는 참가자(실력은 같음, 상대는 정직한 방장)",
  );
  print();
  print(
    "통과 = 여분 + d ≤ 여유. 승률은 깎은 사람 기준(정직하면 약 50%). 깎기 = rt_인정 = max(rt_보고, 아래 경계).",
  );
  print();
  const ds = [0, 10, 20, 30, 50, 100];
  for (const nk of ["lan", "mixed", "cell"]) {
    const net = NETWORKS[nk];
    const rows = [];
    for (const margin of [20, 50]) {
      for (const d of ds) {
        const rng = makeRng(SEED + 500 + d + margin);
        let pass = 0;
        let wNone = 0;
        let wRej = 0;
        let wClamp = 0;
        let wClampX = 0;
        const n = N(15000);
        for (let k = 0; k < n; k++) {
          const { A, B } = pairTrial(
            rng,
            P,
            net,
            "GH",
            sampleRt(rng, GAMES.simple),
            sampleRt(rng, GAMES.simple),
          );
          const a = makeClaim(A, d);
          const b = makeClaim(B);
          if (a.slack <= margin) pass++;
          wNone += judge(a, b, "none", margin);
          wRej += judge(a, b, "reject", margin);
          wClamp += judge(a, b, "clamp", margin);
          wClampX += judge(a, b, "clamp", margin, 40);
        }
        rows.push([
          `${margin}`,
          `${d}`,
          pct(pass / n),
          pct(wNone / n),
          pct(wRej / n),
          pct(wClamp / n),
          pct(wClampX / n),
        ]);
      }
    }
    print(`### ${net.label}`);
    print();
    table(
      [
        "여유",
        "d",
        "통과",
        "승률(확인 없음)",
        "승률(버리기)",
        "승률(깎기)",
        "승률(깎기+X40)",
      ],
      rows,
    );
  }

  print(
    "## 4-2. 핑 답을 D만큼 일부러 늦춰 RTT_min을 부풀린 참가자(d = D만큼 깎음, 여유 20)",
  );
  print();
  const rows2 = [];
  for (const nk of ["lan", "mixed"]) {
    for (const D of [0, 30, 100, 300]) {
      const rng = makeRng(SEED + 600 + D);
      let pass = 0;
      let w = 0;
      const n = N(15000);
      for (let k = 0; k < n; k++) {
        const { A, B } = pairTrial(
          rng,
          P,
          NETWORKS[nk],
          "GH",
          sampleRt(rng, GAMES.simple),
          sampleRt(rng, GAMES.simple),
          { A: { pingInflate: D } },
        );
        const a = makeClaim(A, D);
        if (a.slack <= 20) pass++;
        w += judge(a, makeClaim(B), "clamp", 20);
      }
      rows2.push([NETWORKS[nk].label, `${D}`, pct(pass / n), pct(w / n)]);
    }
  }
  table(["망", "D = d", "통과", "승률(깎기)"], rows2);

  print("## 4-3. 방장의 이득");
  print();
  print(
    "방장이 rt를 d만큼 깎고, 참가자에게 자극을 D만큼 늦게 보낸다(참가자가 확인: 여분 = (a_G − r_G) − rt_H). 여유 20, 와이파이↔LTE, 실력은 같음.",
  );
  print();
  const rows3 = [];
  const net = NETWORKS.mixed;
  for (const [d, D] of [
    [0, 0],
    [20, 0],
    [50, 0],
    [50, 50],
    [100, 100],
    [200, 200],
  ]) {
    const rng = makeRng(SEED + 700 + d + D);
    let pass = 0;
    let wRej = 0;
    let wClamp = 0;
    let wM1 = 0;
    const n = N(15000);
    for (let k = 0; k < n; k++) {
      const { A, B } = pairTrial(
        rng,
        P,
        net,
        "HG",
        sampleRt(rng, GAMES.simple),
        sampleRt(rng, GAMES.simple),
        { B: { stimDelay: D } },
      );
      const a = makeClaim(A, d);
      if (a.slack <= 20) pass++;
      wRej += judge(a, makeClaim(B), "reject", 20);
      wClamp += judge(a, makeClaim(B), "clamp", 20);
      wM1 += METHODS.m1.score(A, B);
    }
    rows3.push([
      `${d}`,
      `${D}`,
      pct(pass / n),
      pct(wRej / n),
      pct(wClamp / n),
      pct(wM1 / n),
    ]);
  }
  table(
    [
      "d(깎기)",
      "D(자극 늦추기)",
      "통과",
      "승률(3+4 버리기)",
      "승률(3+4 깎기)",
      "승률(방법 1, 정직)",
    ],
    rows3,
  );
}

function onecard(P) {
  print("## 4-4. 원카드 B안: 창 끝에서 지연 때문에 억울해지는 비율");
  print();
  print(
    "고리 지연 L = 편도(방장→나) + 프레임 대기 + 그리기·패널 + 터치 + 처리 + 편도(나→방장). 내 화면의 창 끝 직전에 누르면 방장에게 'P(또는 T) 끝 + L'에 닿는다. L > 여유면 억울(본인: 잡힘, 잡는 사람: 헛외침). '고르게'는 본인이 P=1초 안 아무 때나 누를 때, 잡는 사람이 T=3초 안 아무 때나 누를 때.",
  );
  print();
  const qRows = [];
  const rows = [];
  const margins = [0, 100, 200, 300, 500];
  const nets = [
    ["host", { ...ZERO_NET, label: "방장 자신" }],
    ...Object.entries(NETWORKS),
  ];
  for (const [i, [nk, net]] of nets.entries()) {
    const rng = makeRng(SEED + 800 + i);
    const L = [];
    for (let k = 0; k < N(100000); k++) {
      const dev = sampleDevice(rng, P);
      const link = nk === "host" ? null : sampleLink(rng, P, net);
      L.push(playerTrial(rng, P, net, dev, link, 0).hostArr);
    }
    L.sort((x, y) => x - y);
    qRows.push([
      net.label,
      ...[0.5, 0.95, 0.99, 0.999].map((q) => ms(quantile(L, q))),
    ]);
    const urng = makeRng(SEED + 900 + i);
    rows.push([
      net.label,
      ...margins.map((m) => {
        const edge = L.filter((v) => v > m).length / L.length;
        let selfU = 0;
        let catchU = 0;
        for (const v of L) {
          if (urng.u() * 1000 + v > 1000 + m) selfU++;
          if (urng.u() * 3000 + v > 3000 + m) catchU++;
        }
        return `${pct(edge)} · ${pct(selfU / L.length)} · ${pct(catchU / L.length)}`;
      }),
    ]);
  }
  print("### 고리 지연 L의 분포(ms)");
  print();
  table(["망", "p50", "p95", "p99", "p99.9"], qRows);
  print("### 여유별 억울한 비율: 끝 직전 · 본인 P 고르게 · 잡기 T 고르게");
  print();
  table(["망", ...margins.map((m) => `여유 ${m / 1000}초`)], rows);
}

function sensitivity() {
  print("## 5. 민감도: 가정 하나만 바꿨을 때");
  print();
  const variants = [
    ["기본", {}],
    ["기기 고정 지연 차이 0", { devScale: 0 }],
    ["기기 고정 지연 차이 ×2", { devScale: 2 }],
    ["모두 60Hz", { refresh120Share: 0 }],
    ["모두 120Hz", { refresh120Share: 1 }],
    ["프레임 밀림 0%", { extraFrameP: 0 }],
    ["프레임 밀림 20%", { extraFrameP: 0.2 }],
    ["흔들림 ×0.5", { jitterScale: 0.5 }],
    ["흔들림 ×2", { jitterScale: 2 }],
    ["앞 막힘 없음", { holScale: 0 }],
    ["앞 막힘 ×5", { holScale: 5 }],
    ["앞 막힘 크기 0.5~1.5초", { holMin: 500, holMax: 1500 }],
    ["비대칭 ×3", { asymScale: 3 }],
    ["핑 3개", { pings: 3 }],
    ["핑 50개", { pings: 50 }],
    ["타이머 5ms", { tick: 5 }],
    ["처리 지연 0~20ms", { procMax: 20 }],
  ];
  const mixed = NETWORKS.mixed;
  const rows = variants.map(([label, over], vi) => {
    const P = { ...BASE, ...over };
    const n = N(10000);
    const seed = SEED + 1000 + vi;
    const gg20 = multiScore(n, seed, ["m1", "m3"], (rng) => {
      const rt = sampleRt(rng, GAMES.simple);
      return pairTrial(rng, P, mixed, "GG", rt, rt + 20);
    });
    const host = multiScore(n, seed + 1, ["m1", "m3"], (rng) =>
      pairTrial(
        rng,
        P,
        mixed,
        "HG",
        sampleRt(rng, GAMES.simple),
        sampleRt(rng, GAMES.simple),
      ),
    );
    let rej = 0;
    let cheat = 0;
    const rng = makeRng(seed + 2);
    for (let k = 0; k < n; k++) {
      const { A, B } = pairTrial(
        rng,
        P,
        mixed,
        "GH",
        sampleRt(rng, GAMES.simple),
        sampleRt(rng, GAMES.simple),
      );
      if (A.slack > 30) rej++;
      cheat += judge(makeClaim(A, 30), makeClaim(B), "clamp", 30);
    }
    const onec = avgScore(n, seed + 3, (r) => {
      const p = playerTrial(
        r,
        P,
        NETWORKS.cell,
        sampleDevice(r, P),
        sampleLink(r, P, NETWORKS.cell),
        0,
      );
      return p.hostArr > 300 ? 1 : 0;
    });
    return [
      label,
      pct(gg20.m3),
      pct(gg20.m1),
      pct(host.m1),
      pct(host.m3),
      pct(rej / n),
      pct(cheat / n),
      pct(onec),
    ];
  });
  table(
    [
      "바꾼 가정",
      "참가자 둘 Δ20 정답(3)",
      "참가자 둘 Δ20 정답(1)",
      "방장 승률(1)",
      "방장 승률(3)",
      "정직 참가자 여유30 초과",
      "d=30 깎기 승률(깎기, 여유30)",
      "원카드 이동통신 L>0.3초",
    ],
    rows,
  );
}

// ---------------------------------------------------------------- 실행
const t0 = performance.now();
const checks = selfCheck();
print("## 점검(작은 경우)");
print();
for (const c of checks) print(`- 통과: ${c}`);
print();
if (!args.has("--check")) {
  const P = BASE;
  curves(P);
  hostEdge(P);
  skillLuck(P);
  honestBound(P);
  humanLimit(P);
  cheats(P);
  onecard(P);
  sensitivity();
}
console.log(out.join("\n"));
console.error(`걸린 시간 ${((performance.now() - t0) / 1000).toFixed(1)}초`);
