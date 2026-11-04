/**
 * 화면 크기와 인원으로 카드·자리 판의 좌표를 계산한다 (docs/05-layout.md 4절).
 * 순수 함수라 화면 크기별로 테스트할 수 있다. 모든 좌표는 무대 왼쪽 위 기준 px.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface LayoutInput {
  width: number;
  height: number;
  playerCount: number;
  /** 내 손패 장수 */
  handCount: number;
  /** 카드 높이/폭. 기본은 서양 카드(350/250), 화투는 8/5 */
  cardRatio?: number;
  /**
   * 손패 카드 크기의 몫. 가로 화면은 화면 높이의 이만큼을 카드 높이로, 세로 화면은 화면 폭의 이만큼을 카드 폭으로
   * 잡는다(넘으면 줄인다). 기본 0.24·0.2(마이티·하트)
   */
  handShare?: { landscape: number; portrait: number };
  /** 다른 사람 자리 판의 처음 크기(겹치면 줄인다). 기본은 마이티·하트의 이름·장수 판 크기 */
  plate?: Size;
  /** 위쪽 막대 높이. 기본은 마이티(세로 화면은 두 줄) */
  hudHeight?: number;
  /**
   * 판 가운데를 무엇에 쓰나. `trick`(기본): 한 바퀴에 낸 카드를 놓는 작은 바닥과 행동 패널.
   * `floor`: 바닥 패·더미를 펼치는 넓은 판(화투). 위쪽에 앉은 사람은 판 위 끝에 붙이고, 내 자리 판과
   * 내 단추 칸(`actions`)은 손패 옆(자리가 모자라면 손패 바로 위)에 두고, 남은 가장 넓은 곳을 바닥으로 쓴다
   */
  board?: "trick" | "floor";
}

export interface SeatLayout {
  /** 나부터 차례 순서로 몇 번째인가. 0이 나 */
  offset: number;
  angle: number;
  anchor: Point;
  plate: Rect;
}

export interface Layout {
  orientation: "landscape" | "portrait";
  gutter: number;
  hud: Rect;
  table: Rect;
  /** 바닥이자 행동 패널 자리 */
  center: Rect;
  hand: { card: Size; rows: number; top: number; slots: Point[] };
  /** `offset` 순서. 0번은 내 자리(자리 판 없이 손패 위 가운데) */
  seats: SeatLayout[];
  trick: { card: Size; slots: Point[] };
  /** 내 자리 판: 손패 바로 위 구석. 이름·돈·주공 표시·먹은 점수 카드를 보인다 */
  myPlate: Rect;
  /** `board: "floor"`일 때 내 단추·알림 칸(내 자리 판의 맞은편). 아니면 null */
  actions: Rect | null;
}

/** 자리 판의 가장 낮은 높이. 이보다 낮아지면 한 줄짜리 간단한 판(이름·장수·점수)으로 그린다 */
export const PLATE_MIN_H = 44;
/** 자리가 모자랄 때 줄인 내 자리 판 높이(이름·돈 한 줄) */
export const MY_PLATE_SLIM_H = 26;
/** 이 높이보다 낮으면 자리 판을 한 줄로 줄여 그린다 */
export const PLATE_COMPACT_H = 58;

/** 카드 그림(250×350)의 높이/폭 */
export const CARD_RATIO = 350 / 250;

/** 나부터 차례 순서로 k번째 사람의 각도(0° = 오른쪽, 90° = 아래). docs/05-layout.md 3.6절 */
const SEAT_ANGLES: Record<number, number[]> = {
  2: [270],
  3: [205, 335],
  4: [180, 270, 0],
  5: [165, 235, 305, 15],
  6: [160, 215, 270, 325, 20],
  7: [150, 195, 240, 300, 345, 30],
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const rad = (deg: number) => (deg * Math.PI) / 180;

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

const DEFAULT_HAND_SHARE = { landscape: 0.24, portrait: 0.2 };

function handLayout(
  W: number,
  H: number,
  g: number,
  n: number,
  portrait: boolean,
  ratio: number,
  share: { landscape: number; portrait: number },
) {
  const usableW = W - 2 * g;
  const count = Math.max(1, n);
  const byWidth = usableW / (1 + 0.55 * (count - 1));
  const byHeight = portrait
    ? W * share.portrait
    : (H * share.landscape) / ratio;
  let cw = clamp(Math.min(byWidth, byHeight), 44, 200);
  let step = count > 1 ? Math.min(cw * 0.75, (usableW - cw) / (count - 1)) : 0;
  let rows = 1;
  if (portrait && count > 1 && step < Math.max(30, cw * 0.42)) {
    rows = 2;
    const top = Math.ceil(count / 2);
    cw = Math.min(W * share.portrait, usableW / (1 + 0.55 * (top - 1)));
    step = top > 1 ? Math.min(cw * 0.75, (usableW - cw) / (top - 1)) : 0;
  }
  const ch = cw * ratio;
  const lift = ch * 0.2;
  const height = rows === 1 ? ch + lift : ch * 1.5 + lift;
  const top = H - g - height;

  const slots: Point[] = [];
  const perRow = rows === 1 ? count : Math.ceil(count / 2);
  for (let i = 0; i < n; i++) {
    const row = rows === 1 ? 0 : Math.floor(i / perRow);
    const inRow = rows === 1 ? n : row === 0 ? perRow : n - perRow;
    const col = i - row * perRow;
    const totalW = cw + step * (inRow - 1);
    const x0 = W / 2 - totalW / 2 + cw / 2;
    slots.push({ x: x0 + step * col, y: top + lift + ch / 2 + row * ch * 0.5 });
  }
  return { card: { w: cw, h: ch }, rows, top, slots };
}

export function computeLayout(input: LayoutInput): Layout {
  const { width: W, height: H, playerCount } = input;
  const portrait = W / H < 1;
  const g = clamp(Math.min(W, H) * 0.02, 8, 24);

  const ratio = input.cardRatio ?? CARD_RATIO;
  const floorBoard = input.board === "floor";
  const hand = handLayout(
    W,
    H,
    g,
    input.handCount,
    portrait,
    ratio,
    input.handShare ?? DEFAULT_HAND_SHARE,
  );
  // 세로 화면 마이티는 위쪽 막대를 두 줄(공약·버튼 / 주공·프렌드)로 쓴다.
  const hudH = input.hudHeight ?? (portrait ? 58 : H < 480 ? 32 : 40);
  const hud: Rect = { x: g, y: g, w: W - 2 * g, h: hudH };
  const table: Rect = {
    x: g,
    y: g + hudH,
    w: W - 2 * g,
    h: hand.top - g - (g + hudH),
  };

  // 자리 판
  const angles = [90, ...(SEAT_ANGLES[playerCount] ?? [])];
  let plate: Size =
    input.plate ??
    (portrait
      ? { w: clamp(W * 0.24, 76, 112), h: 64 }
      : {
          w: clamp(W * 0.12, 120, 180),
          h: clamp(table.h * 0.22, PLATE_MIN_H, 64),
        });
  // 세로 화면은 자리 판을 위쪽에 모으고 그 아래를 바닥으로 쓴다.
  const C: Point = portrait
    ? { x: table.x + table.w / 2, y: table.y + table.h * 0.27 }
    : { x: table.x + table.w / 2, y: table.y + table.h / 2 };

  let seats: SeatLayout[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const Rx = table.w / 2 - plate.w / 2;
    const Ry = portrait ? table.h * 0.23 : table.h / 2 - plate.h / 2;
    seats = angles.map((angle, offset) => {
      if (offset === 0) {
        const anchor = { x: W / 2, y: hand.top };
        return {
          offset,
          angle,
          anchor,
          plate: { x: anchor.x - plate.w / 2, y: anchor.y, w: plate.w, h: 0 },
        };
      }
      const anchor = {
        x: C.x + Rx * Math.cos(rad(angle)),
        y: C.y + Ry * Math.sin(rad(angle)),
      };
      const x = clamp(
        anchor.x - plate.w / 2,
        table.x,
        table.x + table.w - plate.w,
      );
      // 넓은 바닥 판은 위쪽에 앉은 사람을 판 위 끝에 붙여 가운데를 비운다.
      const y =
        floorBoard && Math.sin(rad(angle)) < -0.3
          ? table.y
          : clamp(anchor.y - plate.h / 2, table.y, table.y + table.h - plate.h);
      return { offset, angle, anchor, plate: { x, y, w: plate.w, h: plate.h } };
    });
    const others = seats.slice(1).map((s) => s.plate);
    const overlapping = others.some((a, i) =>
      others.some((b, j) => i < j && rectsOverlap(a, b)),
    );
    if (!overlapping) break;
    plate = { w: plate.w * 0.85, h: Math.max(PLATE_MIN_H, plate.h * 0.9) };
  }

  if (floorBoard)
    return floorLayout({ W, H, g, portrait, hud, table, hand, seats, plate });

  // 바닥
  let center: Rect;
  let trickCard: Size;
  if (portrait) {
    const platesBottom = Math.max(
      ...seats.slice(1).map((s) => s.plate.y + s.plate.h),
    );
    const top = platesBottom + g;
    const room = table.y + table.h - top;
    // 자리 판 아래 공간이 너무 좁으면(아주 낮은 화면) 겹치더라도 일정 크기를 지킨다.
    const side = Math.min(table.w * 0.8, Math.max(room, table.h * 0.4));
    const cy = room >= side ? top + room / 2 : table.y + table.h - side / 2;
    center = { x: W / 2 - side / 2, y: cy - side / 2, w: side, h: side };
    const tw = Math.min(side * 0.28, hand.card.w);
    trickCard = { w: tw, h: tw * CARD_RATIO };
  } else {
    const tw = hand.card.w * 0.85;
    trickCard = { w: tw, h: tw * CARD_RATIO };
    const w = Math.min(tw * 3.4, table.w * 0.42);
    const h = Math.min(trickCard.h * 2.4, table.h * 0.62);
    const cx = table.x + table.w / 2;
    const cy = table.y + table.h / 2 + table.h * 0.06;
    center = { x: cx - w / 2, y: cy - h / 2, w, h };
    // 맞은편 자리 판(위쪽 가운데)이 바닥 위로 내려와 있으면 바닥을 그 아래로 줄인다.
    const above = seats
      .slice(1)
      .map((s) => s.plate)
      .filter(
        (p) =>
          p.x < center.x + center.w &&
          center.x < p.x + p.w &&
          p.y < center.y + center.h / 2,
      );
    const top = Math.max(center.y, ...above.map((p) => p.y + p.h + g / 2));
    if (top > center.y) {
      const bottom = Math.min(
        table.y + table.h,
        center.y + center.h + (top - center.y) / 2,
      );
      center = { ...center, y: top, h: bottom - top };
      if (trickCard.h > center.h * 0.75) {
        const th = center.h * 0.75;
        trickCard = { w: th / CARD_RATIO, h: th };
      }
    }
  }

  // 바닥 칸: 자리와 같은 각도로 바닥 안 작은 타원 위에
  const Tc: Point = { x: center.x + center.w / 2, y: center.y + center.h / 2 };
  const Tx = center.w / 2 - trickCard.w / 2;
  const maxTy = center.h / 2 - trickCard.h / 2;
  // 2인은 위·아래 두 칸뿐이라 가운데로 모은다.
  const Ty = playerCount === 2 ? Math.min(trickCard.h * 0.6, maxTy) : maxTy;
  const trickSlots = angles.map((angle) => ({
    x: Tc.x + Tx * Math.cos(rad(angle)),
    y: Tc.y + Ty * Math.sin(rad(angle)),
  }));

  // 내 자리 판: 손패 바로 위 왼쪽 구석. 다른 자리 판이나 바닥 카드와 겹치면 오른쪽 구석,
  // 그래도 겹치면(7인, 좁은 세로 화면) 판을 줄여 본다. 줄인 판은 이름·돈 한 줄만 보인다.
  const taken = [
    ...seats.slice(1).map((s) => s.plate),
    ...trickSlots.map((s) => ({
      x: s.x - trickCard.w / 2,
      y: s.y - trickCard.h / 2,
      w: trickCard.w,
      h: trickCard.h,
    })),
  ];
  const cornersOf = (w: number, h: number): Rect[] => {
    const y = table.y + table.h - h;
    return [
      { x: table.x, y, w, h },
      { x: table.x + table.w - w, y, w, h },
    ];
  };
  const sizes: Size[] = [
    plate,
    { w: plate.w, h: MY_PLATE_SLIM_H },
    { w: plate.w * 0.8, h: MY_PLATE_SLIM_H },
    { w: plate.w * 0.65, h: MY_PLATE_SLIM_H },
  ];
  const myPlate =
    sizes
      .flatMap((s) => cornersOf(s.w, s.h))
      .find((r) => !taken.some((t) => rectsOverlap(r, t))) ??
    (cornersOf(plate.w * 0.65, MY_PLATE_SLIM_H)[0] as Rect);

  return {
    orientation: portrait ? "portrait" : "landscape",
    gutter: g,
    hud,
    table,
    center,
    hand,
    seats,
    trick: { card: trickCard, slots: trickSlots },
    myPlate,
    actions: null,
  };
}

/**
 * 넓은 바닥 판(`board: "floor"`). 내 자리 판과 단추 칸은 손패 양옆에 두고(손패 옆이 모자라면 손패 바로 위에
 * 나란히), 다른 자리 판과 겹치지 않는 가장 넓은 곳을 바닥으로 쓴다. 바닥 카드는 놓는 쪽이 정한다(낸 카드 칸은 쓰지 않는다)
 */
function floorLayout(p: {
  W: number;
  H: number;
  g: number;
  portrait: boolean;
  hud: Rect;
  table: Rect;
  hand: Layout["hand"];
  seats: SeatLayout[];
  plate: Size;
}): Layout {
  const { W, H, g, table, hand, seats, plate } = p;
  const xs = hand.slots.map((s) => s.x);
  const handW =
    xs.length > 0 ? Math.max(...xs) - Math.min(...xs) + hand.card.w : 0;
  const handH = H - g - hand.top;
  const side = (W - handW) / 2 - 2 * g;
  let myPlate: Rect;
  let actions: Rect;
  let bottom = table.y + table.h;
  if (side >= Math.min(plate.w, 200)) {
    const w = Math.min(side, plate.w);
    const h = Math.min(handH, Math.max(plate.h, handH * 0.8));
    myPlate = { x: g, y: H - g - h, w, h };
    actions = { x: W - g - w, y: H - g - h, w, h };
  } else {
    const h = plate.h;
    const y = table.y + table.h - h;
    const w = Math.round((table.w - g) * 0.62);
    myPlate = { x: table.x, y, w, h };
    actions = { x: table.x + w + g, y, w: table.w - w - g, h };
    bottom = y - g / 2;
  }

  const others = seats.slice(1).map((s) => s.plate);
  const mid = table.x + table.w / 2;
  const left = others.filter((r) => r.x + r.w < mid);
  const right = others.filter((r) => r.x > mid);
  const across = others.filter((r) => !left.includes(r) && !right.includes(r));
  const below = (rs: Rect[]) =>
    rs.length > 0 ? Math.max(...rs.map((r) => r.y + r.h)) + g / 2 : table.y;
  // 양옆 자리 판 사이(맞은편 아래)와 모든 자리 판 아래 중 넓은 쪽
  const between: Rect = (() => {
    const x0 =
      left.length > 0
        ? Math.max(...left.map((r) => r.x + r.w)) + g / 2
        : table.x;
    const x1 =
      right.length > 0
        ? Math.min(...right.map((r) => r.x)) - g / 2
        : table.x + table.w;
    const y0 = below(across);
    return { x: x0, y: y0, w: x1 - x0, h: bottom - y0 };
  })();
  const under: Rect = (() => {
    const y0 = below(others);
    return { x: table.x, y: y0, w: table.w, h: bottom - y0 };
  })();
  const area = (r: Rect) => Math.max(0, r.w) * Math.max(0, r.h);
  const center = area(between) >= area(under) ? between : under;

  return {
    orientation: p.portrait ? "portrait" : "landscape",
    gutter: g,
    hud: p.hud,
    table,
    center,
    hand,
    seats,
    trick: { card: hand.card, slots: [] },
    myPlate,
    actions,
  };
}

/**
 * 다른 사람 손패 뒷면 한 장의 크기. 자리 판 높이에 맞춘다(마이티·하트는 자리 판 뒤에 펼친다).
 * `ratio`는 카드 높이/폭
 */
export function fanCardSize(layout: Layout, ratio = CARD_RATIO): Size {
  const h = Math.min(56, Math.max(30, (layout.seats[1]?.plate.h ?? 40) * 1.05));
  return { w: h / ratio, h };
}

/**
 * 다른 사람 손패 뒷면 `index`번째(전체 `count`장)의 가운데와 기울기. 마주 앉아 보므로 그 사람의 왼쪽 끝이
 * 내 쪽에서는 오른쪽 끝이다. 손에 든 카드는 판 쪽을 향한다: 판 가운데보다 위에 앉은 사람은 자리 판 아래로,
 * 아래에 앉은 사람은 위로 펼친다
 */
export function fanSlot(
  layout: Layout,
  offset: number,
  index: number,
  count: number,
  card: Size,
): Point & { rotate: number } {
  const p = layout.seats[offset]?.plate;
  if (!p) return { x: 0, y: 0, rotate: 0 };
  const mirrored = count - 1 - index;
  const centered = mirrored - (count - 1) / 2;
  const step =
    count > 1
      ? Math.min(card.w * 0.42, (p.w * 0.85 - card.w) / (count - 1))
      : 0;
  const towardTable =
    p.y + p.h / 2 < layout.center.y + layout.center.h / 2 ? 1 : -1;
  const edge = towardTable === 1 ? p.y + p.h : p.y;
  return {
    x: p.x + p.w / 2 + centered * step,
    y: edge + towardTable * (card.h * 0.22 - Math.abs(centered) * 0.6),
    rotate: centered * 2.5 * -towardTable,
  };
}
