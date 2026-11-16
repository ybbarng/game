// @vitest-environment jsdom
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Emblem3D } from "./Emblem3D";
import { HERO_SIZE } from "./emblem3d/poster";

// 3D는 그릴 수 있다고 두고, 무대는 끝내 지어지지 않게 한다(로딩 중인 칸만 본다)
vi.mock("./emblem3d/support", () => ({
  canDraw3d: () => true,
  pathOverride: () => null,
}));
vi.mock("./emblem3d/stage", () => ({
  EmblemStage: { create: () => new Promise(() => {}) },
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

/** 매크로태스크 한 바퀴(React가 미뤄 둔 effect를 이 사이에 마친다) */
const turn = () => new Promise((r) => setTimeout(r, 0));

/** 조건이 맞을 때까지 매크로태스크를 넘긴다. 횟수는 멈춘 시험을 잡는 안전장치 */
async function until(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !ok(); i++) await turn();
}

const posterImg = (el: HTMLElement) =>
  el.querySelector<HTMLImageElement>("[data-emblem3d-poster] img");
const loading = (el: HTMLElement) =>
  el.querySelector("[data-emblem3d-loading]");

describe("Emblem3D 대기 그림", () => {
  it("티어가 바뀐 직후(effect보다 먼저) 새 대기 그림이 실패해도 로딩 표시가 뜬다", async () => {
    const el = document.createElement("div");
    host = el;
    document.body.append(el);
    const r = createRoot(el);
    root = r;
    r.render(<Emblem3D tier="iron" size={HERO_SIZE} />);
    await until(() => posterImg(el) !== null);
    expect(posterImg(el)?.getAttribute("src")).toBe(
      "/cube/tiers/emblem3d/iron-dark.webp",
    );

    // 새 주소가 DOM에 들어간 바로 그 마이크로태스크에(React의 미뤄 둔 effect보다 먼저) 실패를 낸다. 브라우저에서
    // 요청이 곧바로 끊기면(시험의 route.abort, 연결 없음) 이 순서가 된다
    const seen = new MutationObserver(() => {
      const img = posterImg(el);
      if (img?.getAttribute("src")?.includes("master")) {
        seen.disconnect();
        img.dispatchEvent(new Event("error"));
      }
    });
    seen.observe(el, { subtree: true, attributes: true, childList: true });
    r.render(<Emblem3D tier="master" size={HERO_SIZE} />);
    await until(() => loading(el) !== null);
    // React가 미뤄 둔 일을 모두 마친 뒤에도 로딩 표시가 남아 있다
    for (let i = 0; i < 5; i++) await turn();

    expect(
      el.querySelector("[data-emblem3d]")?.getAttribute("data-emblem3d"),
    ).toBe("master");
    expect(loading(el)).not.toBeNull();
    expect(posterImg(el)).toBeNull();
  });

  it("실패한 티어에서 다른 티어로 가면 그 티어의 대기 그림을 다시 불러 본다", async () => {
    const el = document.createElement("div");
    host = el;
    document.body.append(el);
    const r = createRoot(el);
    root = r;
    r.render(<Emblem3D tier="iron" size={HERO_SIZE} />);
    await until(() => posterImg(el) !== null);
    // 이 시험은 다시 불러 보기만 본다: 처음 그린 뒤 미뤄 둔 일을 마친 다음에 실패를 낸다
    for (let i = 0; i < 5; i++) await turn();
    posterImg(el)?.dispatchEvent(new Event("error"));
    await until(() => loading(el) !== null);
    expect(posterImg(el)).toBeNull();

    r.render(<Emblem3D tier="gold" size={HERO_SIZE} />);
    await until(() => posterImg(el) !== null);
    expect(posterImg(el)?.getAttribute("src")).toBe(
      "/cube/tiers/emblem3d/gold-dark.webp",
    );
    expect(loading(el)).toBeNull();
  });
});
