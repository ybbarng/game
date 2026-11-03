// 공정한 동시 판정 모의 실험의 모형(docs/44). 제품 코드가 아니다.
// 시각은 모두 "참 시각"(ms)으로 다루고, 기기 시계 값이 필요한 곳(반응 시간 재기)만 기기마다 다른 시작점과
// 타이머 단위(tick)를 씌운다. 방장 엔진이 판을 바꾸는 순간이 참 시각 0이다.

/** 씨앗을 고정한 난수(mulberry32). 같은 씨앗이면 늘 같은 결과 */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  return {
    u: next,
    uni: (lo, hi) => lo + (hi - lo) * next(),
    exp: (mean) => (mean <= 0 ? 0 : -mean * Math.log(1 - next())),
    chance: (p) => next() < p,
    normal: () => {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      const r = Math.sqrt(-2 * Math.log(1 - next()));
      const th = 2 * Math.PI * next();
      spare = r * Math.sin(th);
      return r * Math.cos(th);
    },
  };
}

/** 기본 가정. 값마다 출처나 "가정"은 docs/44 2절 표에 있다 */
export const BASE = {
  procMax: 4, // 입력 처리기 → 보내기, 받기 → 처리 (가정, 0~4ms 고르게)
  pings: 10, // RTT_min·시계 차이를 고르는 핑 표본 수
  tick: 1, // 타이머 단위(ms). Firefox 1ms(docs/31 2-1)
  refresh120Share: 0.5, // 120Hz 기기 비율(가정)
  frames: true, // false면 화면 갱신 단위를 없앤다(점검용)
  extraFrameP: 0.05, // 그리기 줄이 한 프레임 밀리는 확률(가정)
  panelMin: 2, // 화면 패널 반응(ms, 가정)
  panelMax: 10,
  touchLatMin: 10, // 손가락 닿음 → event.timeStamp 고정 지연(기기마다, 가정)
  touchLatMax: 40,
  touchSample: 8.3, // 터치 표본 주기(120Hz) 안에서 매번 흔들림(가정)
  devScale: 1, // 기기마다 다른 고정 지연의 퍼짐 배율(민감도용)
  jitterScale: 1,
  holScale: 1, // 앞 막힘 확률 배율
  holMin: 200, // 앞 막힘(순서 보장 채널 재전송) 크기(가정)
  holMax: 400,
  asymScale: 1,
};

/**
 * 망 모형(편도 ms). 쌍마다 기본 지연 = base × U(0.7, 1.3), 방향 차이 = U(−asym, asym),
 * 메시지마다 + 지수 분포 흔들림(평균 jitter) + 확률 holP로 앞 막힘 U(holMin, holMax).
 * hostServer·guestServer는 방법 8(중립 서버)까지의 편도 기본 지연.
 */
export const NETWORKS = {
  lan: {
    label: "같은 와이파이",
    base: 3,
    asym: 1,
    jitter: 1.5,
    holP: 0.002,
    hostServer: 8,
    guestServer: 8,
  },
  mixed: {
    label: "와이파이↔LTE",
    base: 25,
    asym: 8,
    jitter: 6,
    holP: 0.01,
    hostServer: 8,
    guestServer: 25,
  },
  cell: {
    label: "둘 다 이동통신",
    base: 40,
    asym: 12,
    jitter: 12,
    holP: 0.02,
    hostServer: 25,
    guestServer: 25,
  },
  relay: {
    label: "TURN 중계",
    base: 60,
    asym: 10,
    jitter: 12,
    holP: 0.01,
    hostServer: 8,
    guestServer: 25,
  },
};

/** 점검용: 지연·흔들림이 없는 망 */
export const ZERO_NET = {
  label: "지연 0",
  base: 0,
  asym: 0,
  jitter: 0,
  holP: 0,
  hostServer: 0,
  guestServer: 0,
};

/**
 * 사람 반응 시간(눈에 보인 순간 → 손가락 닿음) = shift + 로그정규(중앙값 med, σ).
 * 값은 가정이고 근거는 docs/44 2절.
 */
export const GAMES = {
  simple: { label: "단순 반응", shift: 120, med: 120, sigma: 0.3 },
  onecard: { label: "원카드 잡기(미리 준비)", shift: 60, med: 110, sigma: 0.4 },
  halli: { label: "할리갈리 판단", shift: 250, med: 300, sigma: 0.35 },
  set: { label: "SET 찾기", shift: 1500, med: 5000, sigma: 0.7 },
};

export function sampleRt(rng, game) {
  return game.shift + game.med * Math.exp(game.sigma * rng.normal());
}

function oneWay(rng, P, base, jitter, holP) {
  let d = base + rng.exp(jitter * P.jitterScale);
  if (holP > 0 && rng.chance(holP * P.holScale))
    d += rng.uni(P.holMin, P.holMax);
  return d;
}

/** 방장↔참가자 연결 하나. fwd = 방장→참가자, back = 참가자→방장 */
export function sampleLink(rng, P, net) {
  const base = net.base * rng.uni(0.7, 1.3);
  const a = rng.uni(-net.asym, net.asym) * P.asymScale;
  const fwdBase = Math.max(0, base + a / 2);
  const backBase = Math.max(0, base - a / 2);
  return {
    fwdBase,
    backBase,
    fwd: () => oneWay(rng, P, fwdBase, net.jitter, net.holP),
    back: () => oneWay(rng, P, backBase, net.jitter, net.holP),
  };
}

function sampleServer(rng, P, net, base) {
  const b = base * rng.uni(0.7, 1.3);
  return () => oneWay(rng, P, b, net.jitter / 2, net.holP);
}

/** 기기 하나(판마다 새로 뽑아 여러 기기 조합을 고루 본다) */
export function sampleDevice(rng, P) {
  const period = P.frames ? 1000 / (rng.u() < P.refresh120Share ? 120 : 60) : 0;
  const s = P.devScale;
  const pipe = 1 + (rng.u() < 0.5 ? Math.round(s) : 0);
  const panelMid = (P.panelMin + P.panelMax) / 2;
  const touchMid = (P.touchLatMin + P.touchLatMax) / 2;
  return {
    period,
    phase: rng.uni(0, period),
    pipe,
    panel: Math.max(
      0,
      panelMid + (rng.uni(P.panelMin, P.panelMax) - panelMid) * s,
    ),
    touchLat: Math.max(
      0,
      touchMid + (rng.uni(P.touchLatMin, P.touchLatMax) - touchMid) * s,
    ),
    clockOffset: rng.uni(0, 1e6),
  };
}

/** 시각 t 뒤 첫 프레임(requestAnimationFrame 콜백 시각) */
function nextFrame(t, dev) {
  if (dev.period <= 0) return t;
  return dev.phase + Math.ceil((t - dev.phase) / dev.period) * dev.period;
}

function quantize(t, dev, tick) {
  if (tick <= 0) return t;
  return Math.floor((t + dev.clockOffset) / tick) * tick;
}

/**
 * 한 사람이 자극(판 바뀜)을 보고 누르는 한 번.
 * link가 없으면 방장(망 지연 0). opts.stimDelay는 방장이 이 사람에게 자극을 일부러 늦게 보낼 때.
 * opts.pingInflate는 이 사람이 핑 답을 일부러 늦춰 RTT_min을 부풀릴 때.
 */
export function playerTrial(rng, P, net, dev, link, rt, opts = {}) {
  const stimArr = link ? link.fwd() + (opts.stimDelay ?? 0) : 0;
  const shown = nextFrame(stimArr, dev);
  const extra = rng.chance(P.extraFrameP) ? dev.period : 0;
  const photon = shown + dev.pipe * dev.period + dev.panel + extra;
  const touch = photon + rt;
  const event = touch + dev.touchLat + rng.uni(0, P.touchSample);
  const rtMeas = quantize(event, dev, P.tick) - quantize(shown, dev, P.tick);
  const rtNaive = quantize(event, dev, P.tick) - quantize(stimArr, dev, P.tick);
  const sent = event + rng.uni(0, P.procMax);
  const server = sampleServer(
    rng,
    P,
    net,
    link ? net.guestServer : net.hostServer,
  );
  const r = {
    host: !link,
    stimArr,
    shown,
    event,
    sent,
    rtMeas,
    rtNaive,
    hostArr: sent,
    pressHost: event,
    serverArr: sent + server(),
    slack: 0,
    rttMin: 0,
  };
  if (link) {
    r.hostArr = sent + link.back();
    // 핑 K번: 가장 짧은 왕복의 표본으로 RTT_min과 시계 차이(Cristian)를 정한다
    let best = Infinity;
    let err = 0;
    for (let k = 0; k < P.pings; k++) {
      const f = link.fwd();
      const b = link.back();
      const rtt = f + b + rng.uni(0, P.procMax);
      if (rtt < best) {
        best = rtt;
        err = (b - f) / 2;
      }
    }
    r.rttMin = best + (opts.pingInflate ?? 0);
    r.pressHost = event + err;
    // 방법 4(바른 방향): 방장이 보는 여분 = (a − s) − RTT_min − rt. 정직하면 흔들림·프레임 대기·처리만큼
    r.slack = r.hostArr - 0 - r.rttMin - rtMeas;
  }
  return r;
}

/**
 * 두 사람 한 판. kind: "HG"(A 방장, B 참가자), "GH"(A 참가자, B 방장), "GG"(둘 다 참가자).
 * 방장 청구는 짝 참가자가 확인한다: 여분 = (a_G − r_G) − rt_H.
 */
export function pairTrial(rng, P, net, kind, rtA, rtB, opts = {}) {
  const devA = sampleDevice(rng, P);
  const devB = sampleDevice(rng, P);
  const aHost = kind === "HG";
  const bHost = kind === "GH";
  const linkA = aHost ? null : sampleLink(rng, P, net);
  const linkB = bHost ? null : sampleLink(rng, P, net);
  const A = playerTrial(rng, P, net, devA, linkA, rtA, opts.A ?? {});
  const B = playerTrial(rng, P, net, devB, linkB, rtB, opts.B ?? {});
  if (aHost) A.slack = A.sent + linkB.fwd() - B.stimArr - A.rtMeas;
  if (bHost) B.slack = B.sent + linkA.fwd() - A.stimArr - B.rtMeas;
  return { A, B };
}

/** A가 이기면 1, 지면 0, 동점이면 0.5 */
export function cmp(a, b) {
  if (a < b) return 1;
  if (a > b) return 0;
  return 0.5;
}

/** 방법별 A의 점수 */
export const METHODS = {
  m1: { label: "1 도착 순서", score: (A, B) => cmp(A.hostArr, B.hostArr) },
  m2: { label: "2 시계+시각", score: (A, B) => cmp(A.pressHost, B.pressHost) },
  m3n: {
    label: "3′ 받은 시각 기준",
    score: (A, B) => cmp(A.rtNaive, B.rtNaive),
  },
  m3: { label: "3 반응 시간", score: (A, B) => cmp(A.rtMeas, B.rtMeas) },
  m3x20: {
    label: "3+5 X=20",
    score: (A, B) => windowed(A.rtMeas, B.rtMeas, 20),
  },
  m3x40: {
    label: "3+5 X=40",
    score: (A, B) => windowed(A.rtMeas, B.rtMeas, 40),
  },
  m3x60: {
    label: "3+5 X=60",
    score: (A, B) => windowed(A.rtMeas, B.rtMeas, 60),
  },
  m8: { label: "8 중립 서버", score: (A, B) => cmp(A.serverArr, B.serverArr) },
};

export function windowed(a, b, X) {
  if (Math.abs(a - b) < X) return 0.5;
  return cmp(a, b);
}

/**
 * 방법 3+4(+5) 판정. 청구 = {rt: 보고한 반응 시간, slack: 확인하는 쪽이 본 여분}.
 * rule "none": 확인 없음 / "reject": 여분 > margin이면 무효 / "clamp": 무효 대신 rt를 (여분 − margin)만큼 올려 잡음.
 */
export function judge(a, b, rule, margin, X = 0) {
  let ra = a.rt;
  let rb = b.rt;
  if (rule === "reject") {
    const va = a.slack <= margin;
    const vb = b.slack <= margin;
    if (va && !vb) return 1;
    if (!va && vb) return 0;
    if (!va && !vb) return 0.5;
  } else if (rule === "clamp") {
    ra += Math.max(0, a.slack - margin);
    rb += Math.max(0, b.slack - margin);
  }
  return windowed(ra, rb, X);
}

/** 정직한 청구, 또는 d만큼 깎은 청구 */
export function claim(p, shave = 0) {
  return { rt: p.rtMeas - shave, slack: p.slack + shave };
}

export function quantile(sorted, q) {
  if (sorted.length === 0) return Number.NaN;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(q * sorted.length)),
  );
  return sorted[i];
}
