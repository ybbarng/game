/**
 * 티어 엠블럼 빛 띠의 차례(TierEmblem.tsx). 화면에 엠블럼이 여럿이어도(티어표 열 줄) 한 번에 하나만, 화면에 보이는 것만
 * 차례로 한 번씩 빛이 지나간다. 타이머 하나(setTimeout)로 돌고 requestAnimationFrame은 쓰지 않는다. 움직임은 CSS
 * 애니메이션(`[data-shine]`, globals.css)이 맡는다.
 *
 * - 차례는 높은 티어부터(같은 티어는 문서 차례). 처음 빛은 FIRST_MS 뒤 가장 높은 티어에 지나간다.
 *   예전에는 문서 차례로만 돌아, 미리보기처럼 엠블럼이 많은 화면에서는 HDR 티어(다이아몬드부터)의 차례가 9초 넘게 지나도
 *   오지 않았다(2026-11-09 사용자 HDR 맥에서 「HDR 느낌이 없다」).
 * - 움직임 줄이기, 탭이 가려짐, 보이는 엠블럼이 없음이면 타이머를 멈춘다.
 * - 빛 띠 하나는 SHINE_MS, 다음 차례까지 GAP_MS.
 */

export const SHINE_MS = 1600;
export const GAP_MS = 1600;
export const FIRST_MS = 900;

const watched = new Map<HTMLElement, number>();
const visible = new Set<HTMLElement>();
let observer: IntersectionObserver | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let last: HTMLElement | null = null;

function reducedMotion(): boolean {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function stop() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function schedule(ms: number) {
  if (timer !== null || visible.size === 0) return;
  if (typeof document !== "undefined" && document.hidden) return;
  timer = setTimeout(tick, ms);
}

/** 보이는 것의 차례: 높은 티어부터, 같은 티어는 문서 차례 */
export function shineOrder(
  els: Iterable<HTMLElement>,
  rank: (el: HTMLElement) => number,
): HTMLElement[] {
  return [...els].sort((a, b) => {
    const d = rank(b) - rank(a);
    if (d !== 0) return d;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1;
  });
}

/** 다음 차례: 차례에서 지난번 다음 */
function next(): HTMLElement | null {
  const order = shineOrder(visible, (el) => watched.get(el) ?? 0);
  if (order.length === 0) return null;
  const i = last ? order.indexOf(last) : -1;
  return order[(i + 1) % order.length] ?? null;
}

function tick() {
  timer = null;
  if (!reducedMotion()) {
    const el = next();
    if (el) {
      last = el;
      el.setAttribute("data-shine", "");
      setTimeout(() => el.removeAttribute("data-shine"), SHINE_MS);
    }
  }
  schedule(SHINE_MS + GAP_MS);
}

function onVisibility() {
  if (document.hidden) stop();
  else schedule(FIRST_MS);
}

/** 엠블럼 하나를 차례에 넣는다(rank: 높을수록 먼저, 티어 차례). 돌려준 함수로 뺀다 */
export function watchShine(el: HTMLElement, rank = 0): () => void {
  if (typeof IntersectionObserver === "undefined" || reducedMotion())
    return () => {};
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const t = e.target as HTMLElement;
        if (e.isIntersecting) visible.add(t);
        else visible.delete(t);
      }
      if (visible.size === 0) stop();
      else schedule(FIRST_MS);
    });
    document.addEventListener("visibilitychange", onVisibility);
  }
  watched.set(el, rank);
  observer.observe(el);
  return () => {
    observer?.unobserve(el);
    watched.delete(el);
    visible.delete(el);
    el.removeAttribute("data-shine");
    if (last === el) last = null;
    if (watched.size === 0) {
      stop();
      observer?.disconnect();
      observer = null;
      last = null;
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}
