"use client";

import { type RefObject, useLayoutEffect, useRef } from "react";

import { prefersReducedMotion } from "@/game/timing";
import type { Rect } from "@/layout/compute-layout";

/*
 * 장면이 바뀔 때 카드가 앞 장면 자리에서 새 자리로 옮겨 가는 연출(FLIP). 화면은 늘 새 장면 그대로 그리고, 옮긴 카드만
 * 잠시 앞 자리에서 출발해 새 자리로 가게 보인다. 카드 그림·배치와 상관없다: 무대 안에서 `data-flip="<id>"`를 단
 * 요소를 따라간다(화투 손패·바닥·먹은 패, 더미, 뒷면 부채 등). `data-flip-zone`을 단 조상이 있으면 그 이름을 함께
 * 기억한다(예: "floor"). 한 장면 안의 움직임은 걸음(`step`)으로 나눠 차례로 움직인다(동시에 움직이지 않게)
 */

/** 한 걸음(한 장이 한 자리에서 다음 자리로 가는 데) 걸리는 시간(ms) */
export const FLIP_STEP_MS = 420;

/** 앞 장면(또는 새 장면)에서 카드 하나의 자리 */
export interface FlipSpot {
  /** 무대 왼쪽 위 기준 */
  rect: Rect;
  /** 가장 가까운 `data-flip-zone` 이름 */
  zone: string | null;
}
export type FlipSpots = ReadonlyMap<string, FlipSpot>;

/** 카드 하나의 움직임 */
export interface FlipMove {
  /** 움직일 요소의 `data-flip` */
  id: string;
  /** 몇 번째 걸음에 출발하나(0부터). 그 전에는 출발 자리에서 기다린다 */
  step: number;
  /** 출발 자리: 이 id의 앞 장면 자리(예: 더미, 남의 뒷면 부채). 없으면 자기 앞 장면 자리 */
  from?: string;
  /** 새 자리로 가기 전에 들르는 자리(앞 장면의 id). 들를 때마다 한 걸음씩 더 쓴다 */
  via?: readonly string[];
}

export interface CardFlipOptions {
  /** 무대(좌표 기준이자 `data-flip`을 찾는 곳) */
  stage: RefObject<HTMLElement | null>;
  /** 장면을 나타내는 값. 바뀌면 앞 장면과 비교해 움직인다 */
  scene: unknown;
  /**
   * 이번 장면에서 일부러 움직일 카드(걸음·출발·들름). 여기 없는 카드는 자리가 바뀌었으면 첫 걸음에 옮긴다
   * (손패가 한 장 빠져 좁혀지는 것 등)
   */
  moves?: (prev: FlipSpots, next: FlipSpots) => readonly FlipMove[];
  /** 연출을 건너뛴다(겨루기 판 등). 움직임 줄이기 설정이면 늘 건너뛴다 */
  skip?: boolean;
  /**
   * `move`(기본): 카드 요소 자체를 앞 자리에서 새 자리로 옮긴다(도착 전에는 새 자리에 보이지 않는다).
   * `overlay`: 새 자리의 카드는 그 프레임에 바로 그리고, 똑같이 생긴 겉그림이 그 위를 날아간다(반응 시간을
   * 그려진 프레임부터 재는 겨루기 등)
   */
  mode?: "move" | "overlay";
  /** 한 걸음 시간. 기본 `FLIP_STEP_MS` */
  stepMs?: number;
}

/** 걸음 수만큼의 연출 시간(움직임 줄이기면 0). 다음 장면을 이만큼 늦게 보이게 할 때 쓴다 */
export function flipMs(steps: number, stepMs = FLIP_STEP_MS): number {
  return prefersReducedMotion() ? 0 : Math.max(0, steps) * stepMs;
}

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function measure(root: HTMLElement): Map<string, FlipSpot> {
  const base = root.getBoundingClientRect();
  const spots = new Map<string, FlipSpot>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-flip]")) {
    const id = el.dataset.flip;
    if (!id || spots.has(id)) continue;
    const r = el.getBoundingClientRect();
    spots.set(id, {
      rect: {
        x: r.left - base.left,
        y: r.top - base.top,
        w: r.width,
        h: r.height,
      },
      zone:
        el.closest<HTMLElement>("[data-flip-zone]")?.dataset.flipZone ?? null,
    });
  }
  return spots;
}

function elementOf(root: HTMLElement, id: string): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>("[data-flip]"))
    if (el.dataset.flip === id) return el;
  return null;
}

/** 새 자리(`to`)를 기준으로 `r` 자리에 보이게 하는 transform */
function offset(r: Rect, to: Rect): string {
  const sx = to.w > 0 ? r.w / to.w : 1;
  const sy = to.h > 0 ? r.h / to.h : 1;
  return `translate(${r.x - to.x}px, ${r.y - to.y}px) scale(${sx}, ${sy})`;
}

const moved = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2 || Math.abs(a.w - b.w) > 2;

/** 장면이 바뀔 때 카드를 앞 자리에서 새 자리로 옮겨 보인다(설명은 파일 위) */
export function useCardFlip({
  stage,
  scene,
  moves,
  skip = false,
  mode = "move",
  stepMs = FLIP_STEP_MS,
}: CardFlipOptions): void {
  const prev = useRef<Map<string, FlipSpot> | null>(null);
  const lastScene = useRef<unknown>(scene);
  const running = useRef<Animation[]>([]);
  const movesRef = useRef(moves);
  movesRef.current = moves;

  useLayoutEffect(() => {
    const root = stage.current;
    if (!root) return;
    const changed = lastScene.current !== scene;
    lastScene.current = scene;
    // 같은 장면에서 연출이 도는 중이면 움직이는 자리를 재지 않는다(앞 장면 자리를 그대로 둔다)
    if (!changed && running.current.length > 0) return;
    if (changed) {
      for (const a of running.current) a.cancel();
      running.current = [];
    }
    const next = measure(root);
    const before = prev.current;
    prev.current = next;
    if (!changed || !before || skip || prefersReducedMotion()) return;
    if (typeof Element.prototype.animate !== "function") return;

    const explicit = movesRef.current?.(before, next) ?? [];
    const named = new Set(explicit.map((m) => m.id));
    const all: FlipMove[] = [...explicit];
    for (const [id, spot] of next) {
      const was = before.get(id);
      if (!named.has(id) && was && moved(was.rect, spot.rect))
        all.push({ id, step: 0 });
    }
    const plans = all.flatMap((m) => {
      const to = next.get(m.id)?.rect;
      const start = before.get(m.from ?? m.id)?.rect;
      if (!to || !start) return [];
      const via = (m.via ?? []).flatMap((v) => {
        const r = before.get(v)?.rect;
        return r ? [r] : [];
      });
      return [{ ...m, points: [start, ...via, to], to }];
    });
    const total = Math.max(
      0,
      ...plans.map((p) => p.step + p.points.length - 1),
    );
    if (total === 0) return;
    for (const p of plans) {
      const el = elementOf(root, p.id);
      if (!el) continue;
      const end = p.step + p.points.length - 1;
      const frames: Keyframe[] = [
        {
          offset: 0,
          transform: offset(p.points[0] as Rect, p.to),
          easing: EASE,
        },
      ];
      if (p.step > 0)
        frames.push({
          offset: p.step / total,
          transform: offset(p.points[0] as Rect, p.to),
          easing: EASE,
        });
      p.points.slice(1).forEach((r, k) => {
        frames.push({
          offset: (p.step + k + 1) / total,
          transform: offset(r, p.to),
          easing: EASE,
        });
      });
      if (end < total) frames.push({ offset: 1, transform: "none" });
      const target = mode === "overlay" ? cloneOver(root, el, p.to) : el;
      const z = target.style.zIndex;
      const origin = target.style.transformOrigin;
      if (mode === "move") {
        // 옮기는 동안 다른 카드 위로, 크기는 왼쪽 위를 기준으로 바꾼다(offset과 같은 기준)
        target.style.zIndex = "60";
        target.style.transformOrigin = "0 0";
      }
      const a = target.animate(frames, { duration: total * stepMs });
      const done = () => {
        running.current = running.current.filter((x) => x !== a);
        if (mode === "overlay") target.remove();
        else {
          target.style.zIndex = z;
          target.style.transformOrigin = origin;
        }
      };
      a.addEventListener("finish", done);
      a.addEventListener("cancel", done);
      running.current.push(a);
    }
  });
}

/** `overlay`: 새 자리 카드와 똑같은 겉그림을 무대 위에 띄운다 */
function cloneOver(root: HTMLElement, el: HTMLElement, to: Rect): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-flip");
  clone.removeAttribute("data-card");
  clone.setAttribute("aria-hidden", "true");
  Object.assign(clone.style, {
    position: "absolute",
    left: `${to.x}px`,
    top: `${to.y}px`,
    width: `${to.w}px`,
    height: `${to.h}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "300",
    transformOrigin: "0 0",
  });
  root.appendChild(clone);
  return clone;
}
