import { sha256Hex } from "./sha256";

/**
 * 던지는 몸짓 「당겼다 튕기기」(docs/37 13절).
 * 윷가락을 잡고 아래로 당겼다가 위로 튕겨 놓는다. 당긴 길이 = 높이, 튕긴 방향 = 방향, 튕긴 빠르기 = 세기.
 * 몸짓 값은 던지는 기기에서 정수로 재고, 봉인(해시)해 먼저 보낸 뒤 모두의 고리가 공개되면 연다.
 * 결과는 「몸짓 + 모두의 값」으로 정한다(`gestureThrow`).
 */
export interface Gesture {
  /** 당긴 길이(0~100). `MIN_HEIGHT`보다 낮으면 굴린 것이라 다시 던진다 */
  height: number;
  /** 튕긴 방향(도, -90~90). 0이 곧장 위, 음수가 왼쪽. `SWEEP_ANGLE`을 넘으면 멍석 밖으로 쓸어 던진 것 */
  direction: number;
  /** 튕긴 빠르기(0~100) */
  strength: number;
}

/** 이보다 낮게 당기면(굴리기) 던진 것으로 치지 않는다 */
export const MIN_HEIGHT = 15;
/** 이보다 옆으로 튕기면 멍석 밖으로 쓸어 던진 것(일부러 낙) */
export const SWEEP_ANGLE = 60;

/** 손가락·마우스가 지나간 점 하나(화면 px, 시각 ms) */
export interface DragPoint {
  x: number;
  y: number;
  t: number;
}

/** 이만큼(당김 끝까지 길이/초)으로 튕기면 세기 100 */
const FULL_SPEED = 12;
/** 점 사이 시간은 적어도 이만큼으로 본다(한 화면 주기보다 짧게 잰 값이 세기를 부풀리지 않게) */
const MIN_STEP_MS = 8;
/** 세기는 놓기 직전 이만큼의 점 사이로 잰다 */
const SPEED_STEPS = 3;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * 끌어 놓은 길(누른 점 → 가장 낮은 점 → 놓은 점)에서 몸짓 값을 잰다. `reach`는 높이 100이 되는 당김 길이(px).
 * 가장 낮은 점에서 위·옆으로 튕기지 않고 놓았으면 던진 것이 아니라 null.
 * 높이가 `MIN_HEIGHT`보다 낮은 몸짓도 돌려준다(다시 던질지는 `tooLow`로 본다)
 */
export function gestureFromDrag(
  points: readonly DragPoint[],
  reach: number,
): Gesture | null {
  const start = points[0];
  if (!start || points.length < 2 || reach <= 0) return null;
  let low = 0;
  for (let i = 1; i < points.length; i++)
    if ((points[i] as DragPoint).y > (points[low] as DragPoint).y) low = i;
  const bottom = points[low] as DragPoint;
  const release = points[points.length - 1] as DragPoint;
  const dx = release.x - bottom.x;
  const up = bottom.y - release.y;
  if (Math.hypot(dx, up) <= 2) return null;
  const height = clamp(
    Math.round(((bottom.y - start.y) / reach) * 100),
    0,
    100,
  );
  const direction = clamp(
    Math.round((Math.atan2(dx, up) * 180) / Math.PI),
    -90,
    90,
  );
  let distance = 0;
  let time = 0;
  const from = Math.max(low, points.length - 1 - SPEED_STEPS);
  for (let i = from + 1; i < points.length; i++) {
    const a = points[i - 1] as DragPoint;
    const b = points[i] as DragPoint;
    distance += Math.hypot(b.x - a.x, b.y - a.y);
    time += Math.max(MIN_STEP_MS, b.t - a.t);
  }
  const speed = distance / reach / (time / 1000);
  const strength = clamp(Math.round((speed / FULL_SPEED) * 100), 0, 100);
  return { height, direction, strength };
}

/** 너무 낮게 당겼다(굴리기): 던지지 않고 다시 던진다 */
export function tooLow(gesture: Gesture): boolean {
  return gesture.height < MIN_HEIGHT;
}

/** 멍석 밖으로 쓸어 던졌다(일부러 낙) */
export function isSweep(gesture: Gesture): boolean {
  return Math.abs(gesture.direction) > SWEEP_ANGLE;
}

/** 받은 몸짓 값이 규칙에 맞는가(정수, 범위 안, 너무 낮지 않음) */
export function isGesture(value: unknown): value is Gesture {
  if (typeof value !== "object" || value === null) return false;
  const g = value as Record<string, unknown>;
  const int = (v: unknown, low: number, high: number) =>
    Number.isInteger(v) && (v as number) >= low && (v as number) <= high;
  return (
    Object.keys(g).length === 3 &&
    int(g.height, MIN_HEIGHT, 100) &&
    int(g.direction, -90, 90) &&
    int(g.strength, 0, 100)
  );
}

/** 몸짓 값을 해시에 넣는 글 */
export function gestureText(gesture: Gesture): string {
  return `${gesture.height},${gesture.direction},${gesture.strength}`;
}

/** 몸짓 봉인: 몸짓 값과 비밀 소금(16진수 64자)의 해시. 열 때 같은 값과 소금을 내야 한다 */
export function sealOf(gesture: Gesture, salt: string): string {
  return sha256Hex(`yut-gesture|${gestureText(gesture)}|${salt}`);
}

/**
 * 낙 확률(천분율). 가운데로(10도 안) 알맞은 세기(70 이하)·높이(80 이하)로 던지면 0,
 * 옆으로 치우칠수록·셀수록 빠르게 높아지고, 아주 높이 던지면 살짝 오른다. 쓸어 던지면 1000(반드시 낙).
 * 정수 계산만 쓴다(기기마다 같은 값)
 */
export function nakPermille(gesture: Gesture): number {
  if (isSweep(gesture)) return 1000;
  const off = Math.abs(gesture.direction);
  const aim = off <= 10 ? 0 : Math.floor(((off - 10) * (off - 10)) / 5);
  const hard =
    gesture.strength <= 70
      ? 0
      : Math.floor(((gesture.strength - 70) * (gesture.strength - 70)) / 2);
  const high = gesture.height <= 80 ? 0 : (gesture.height - 80) * 2;
  return Math.min(1000, aim + hard + high);
}

/** 키보드로 던질 때와 같이 가운데로 알맞게 던진 몸짓(낙 확률 0) */
export const STEADY_GESTURE: Gesture = {
  height: 50,
  direction: 0,
  strength: 40,
};

/**
 * 재료(시드에서 만든 자리 재료)와 던지기 번호로 만든 무작위 몸짓과 소금(컴퓨터 자리).
 * 높이 25~74, 방향 -20~20, 세기 20~75: 가끔 조금 치우쳐 낙 확률이 몇 %까지 오른다
 */
export function derivedThrow(
  key: string,
  throwIndex: number,
): { gesture: Gesture; salt: string; seal: string } {
  const h = sha256Hex(`yut-bot-gesture|${key}|${throwIndex}`);
  const n = (i: number) => Number.parseInt(h.slice(i * 4, i * 4 + 4), 16);
  const gesture: Gesture = {
    height: 25 + (n(0) % 50),
    direction: (n(1) % 41) - 20,
    strength: 20 + (n(2) % 56),
  };
  const salt = sha256Hex(`yut-bot-salt|${key}|${throwIndex}`);
  return { gesture, salt, seal: sealOf(gesture, salt) };
}
