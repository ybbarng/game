// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRST_MS, GAP_MS, SHINE_MS } from "./emblemShine";
import { TierEmblem } from "./TierEmblem";

/**
 * 빛 띠 차례(emblemShine.ts)가 실제 엠블럼에서 도는지. 시계는 가짜 타이머로 감는다.
 * 2026-11-09 HDR 맥에서 다이아몬드 위 티어의 HDR 층이 켜지지 않았다: 차례가 문서 차례로만 돌아 엠블럼이 많은 화면에서는
 * HDR 티어 차례가 한참 오지 않았다. HDR 층의 띠·반짝임 그림은 `[data-shine]`이 붙어야 켜진다(globals.css).
 */

let reduce = false;
let io: { cb: IntersectionObserverCallback; els: Set<Element> } | null = null;

class FakeIO {
  constructor(cb: IntersectionObserverCallback) {
    io = { cb, els: new Set() };
  }
  observe(el: Element) {
    io?.els.add(el);
  }
  unobserve(el: Element) {
    io?.els.delete(el);
  }
  disconnect() {
    io = null;
  }
}

/** 지켜보는 엠블럼을 모두 화면에 들어온 것으로 알린다 */
function showAll() {
  const cur = io;
  if (!cur) throw new Error("IntersectionObserver가 없다");
  cur.cb(
    [...cur.els].map(
      (target) =>
        ({ target, isIntersecting: true }) as IntersectionObserverEntry,
    ),
    cur as unknown as IntersectionObserver,
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  reduce = false;
  vi.stubGlobal("IntersectionObserver", FakeIO);
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("reduced-motion") ? reduce : false,
  }));
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function render(node: React.ReactNode) {
  act(() => root.render(node));
}
const shining = () =>
  [...host.querySelectorAll("[data-shine]")].map((e) =>
    e.getAttribute("data-cube-emblem"),
  );

describe("빛 띠 차례", () => {
  it("보이는 엠블럼이 있으면 FIRST_MS 안에 가장 높은 티어부터 빛이 지나가고 HDR 층 띠가 켜질 자리에 있다", () => {
    // 문서 차례로는 낮은 티어가 앞(미리보기·티어표가 이렇다)
    render(
      <>
        <TierEmblem tier="platinum" size={64} />
        <TierEmblem tier="emerald" size={64} />
        <TierEmblem tier="diamond" size={64} />
        <TierEmblem tier="challenger" size={64} />
      </>,
    );
    act(() => showAll());
    expect(shining()).toEqual([]);
    act(() => vi.advanceTimersByTime(FIRST_MS));
    expect(shining()).toEqual(["challenger"]);
    const lit = host.querySelector("[data-shine]");
    expect(lit?.querySelectorAll("img.emb-hdr-band")).toHaveLength(3);
    expect(lit?.querySelector("img.emb-hdr-facet")).not.toBeNull();

    // 한 번에 하나: 빛이 끝나면 지우고, 틈 뒤에 다음 티어
    act(() => vi.advanceTimersByTime(SHINE_MS));
    expect(shining()).toEqual([]);
    act(() => vi.advanceTimersByTime(GAP_MS));
    expect(shining()).toEqual(["diamond"]);
    act(() => vi.advanceTimersByTime(SHINE_MS + GAP_MS));
    expect(shining()).toEqual(["emerald"]);
    act(() => vi.advanceTimersByTime((SHINE_MS + GAP_MS) * 2));
    expect(shining()).toEqual(["challenger"]);
  });

  it("화면에 들어오지 않으면, 움직임 줄이기면, still·28px 아래면 빛이 지나가지 않는다", () => {
    render(<TierEmblem tier="diamond" size={64} />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(shining()).toEqual([]);
    act(() => root.unmount());

    root = createRoot(host);
    render(
      <>
        <TierEmblem tier="master" size={64} still />
        <TierEmblem tier="master" size={18} />
      </>,
    );
    expect(io).toBeNull();
    act(() => root.unmount());

    reduce = true;
    root = createRoot(host);
    render(<TierEmblem tier="master" size={64} />);
    expect(io).toBeNull();
    act(() => vi.advanceTimersByTime(10_000));
    expect(shining()).toEqual([]);
  });
});
