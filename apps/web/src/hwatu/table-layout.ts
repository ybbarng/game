import { computeLayout, type Layout, type Size } from "@/layout/compute-layout";

/** 화투 카드 높이/폭(5:8) */
export const HWATU_RATIO = 8 / 5;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export interface HwatuLayout extends Layout {
  /** 자리 판 안 먹은 패 한 장 폭 */
  captured: number;
  /** 바닥 카드 한 장 폭 */
  floor: number;
  /** 더미 한 장 폭 */
  deck: number;
  /** 다른 사람 손패 뒷면 부채 한 장 크기(`fanSlot`에 넣는다) */
  fan: Size;
}

/**
 * 다른 사람 자리 판의 처음 크기. 셋 넘게 둘러앉으면 판을 좁혀 양옆·위에 나란히 앉힌다.
 * `compact`는 먹은 패 네 묶음이 없는 판(나이롱뽕: 이름 줄과 뽕 묶음 한 줄)이라 낮게 잡는다
 */
function plateSize(
  width: number,
  height: number,
  players: number,
  compact: boolean,
): Size {
  const portrait = width < height;
  const short = !portrait && height <= 600;
  const g = clamp(Math.min(width, height) * 0.02, 8, 24);
  const others = players - 1;
  if (portrait) {
    const across = Math.min(others, 3);
    return {
      w: (width - (across + 1) * g) / across,
      h: compact
        ? clamp(height * 0.09, 64, 80)
        : others >= 4
          ? clamp(height * 0.11, 84, 108)
          : clamp(height * 0.12, 96, 116),
    };
  }
  const many = others >= 3;
  if (short)
    return {
      w: many ? clamp(width * 0.22, 180, 260) : clamp(width * 0.34, 240, 340),
      h: compact ? clamp(height * 0.17, 56, 68) : clamp(height * 0.22, 76, 90),
    };
  return {
    w: many ? clamp(width * 0.22, 220, 320) : clamp(width * 0.3, 300, 440),
    h: compact ? clamp(height * 0.11, 68, 92) : clamp(height * 0.16, 96, 132),
  };
}

/**
 * 화투 둘러앉은 판(docs/05 4.11, `computeLayout`의 `board: "floor"`). 다른 사람은 판 위 끝(넷 넘으면 양옆도)
 * 자리 판에 앉고 그 아래로 손패 뒷면 부채를 펼친다. 가운데 넓은 바닥, 아래 내 손패와 그 양옆에 내 자리 판·
 * 단추 칸. 판 내내 자리가 움직이지 않게 손패 칸은 처음 장수(`handMax`)로 잡는다. 고스톱·민화투·나이롱뽕이 쓴다
 */
export function hwatuLayout(
  width: number,
  height: number,
  players: number,
  handMax: number,
  /** 낮은 자리 판(`plateSize`) */
  { compact = false }: { compact?: boolean } = {},
): HwatuLayout {
  const portrait = width < height;
  const short = !portrait && height <= 600;
  const input = {
    width,
    height,
    playerCount: players,
    handCount: handMax,
    cardRatio: HWATU_RATIO,
    handShare: short
      ? { landscape: 0.2, portrait: 0.2 }
      : { landscape: 0.17, portrait: 0.2 },
    plate: plateSize(width, height, players, compact),
    hudHeight: short ? 30 : 36,
    board: "floor" as const,
  };
  // 부채 높이는 자리 판 높이로 정해진다. 한 번 놓아 본 자리 판으로 부채를 정하고, 그만큼 바닥을 내려 다시 놓는다
  const first = computeLayout(input);
  const plateH = first.seats[1]?.plate.h ?? 60;
  const fanH = Math.round(clamp(plateH * 0.4, 28, 46));
  const fan = { w: fanH / HWATU_RATIO, h: fanH };
  const layout = computeLayout({ ...input, fanHeight: fanH });

  const plates = [...layout.seats.slice(1).map((s) => s.plate), layout.myPlate];
  const platH = Math.min(...plates.map((p) => p.h));
  const platW = Math.min(...plates.map((p) => p.w));
  // 자리 판: 이름 줄(약 20px)·묶음 이름(14px)·위아래 여백을 빼고 남는 높이에, 네 묶음이 한 줄로 들어가게
  const captured = Math.floor(
    clamp(Math.min((platH - 54) / HWATU_RATIO, (platW - 40) / 4), 12, 30),
  );
  const { center, hand } = layout;
  // 바닥: 같은 달끼리 겹친 묶음이 여남은 개(넉넉히 12묶음, 묶음 하나는 카드 1.3장 폭). 한 줄~세 줄 중 카드가
  // 가장 커지는 줄 수로 잡고, 손패보다 크게 하지 않는다. 아래 52px는 지난 걸음·차례 글 자리
  const bySide = (w: number) =>
    Math.max(
      ...[1, 2, 3].map((rows) =>
        Math.min(
          (center.h - 52) / (rows * HWATU_RATIO + (rows - 1) * 0.12),
          (center.w - w - 40) / (Math.ceil(12 / rows) * 1.3),
        ),
      ),
    );
  const floor = Math.floor(clamp(bySide(hand.card.w * 0.8), 24, hand.card.w));
  const deck = Math.floor(Math.min(floor, hand.card.w * 0.8));
  return { ...layout, captured, floor, deck, fan };
}

/**
 * 손패 `count`장의 카드 사이 간격(왼쪽 끝에서 다음 카드 왼쪽 끝까지). 손패 줄에 남는 폭이 있으면 겹치지 않게
 * 벌리고(카드 사이 조금 띄움), 모자라면 겹친다. 손패 양옆에 내 자리 판·단추 칸이 있으면 그 사이 폭만 쓴다
 */
export function handStepFor(layout: HwatuLayout, count: number): number {
  const { hand, myPlate, actions, gutter: g } = layout;
  if (count <= 1) return hand.card.w;
  const beside = actions !== null && myPlate.y >= hand.top;
  const avail = beside
    ? actions.x - (myPlate.x + myPlate.w) - 2 * g
    : layout.table.w;
  return Math.max(
    hand.card.w * 0.3,
    Math.min(hand.card.w * 1.06, (avail - hand.card.w) / (count - 1)),
  );
}
