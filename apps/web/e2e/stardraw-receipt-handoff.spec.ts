import {
  expect,
  fastForwardUntil,
  fixStardrawClock,
  type Locator,
  type Page,
  speedUpAnimations,
  test,
} from "./test";

test.beforeEach(({ page }) => fixStardrawClock(page));

async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/**
 * 응모 뒤 출력된 영수증(오버레이)이 뒤 화면의 같은 영수증으로 넘어갈 때 자리가 어긋나지 않는다(ReceiptPrint handoff).
 * 화면 위쪽 여백·머리 줄·메뉴 줄이 바뀌어 스크롤로 맞추지 못하면 영수증이 튀어 움직인다. 화면 크기마다 본다.
 * 넘어간 뒤 영수증 윗부분이 머리 줄·탭바에 가리지 않는지도 본다.
 * 연출은 실제 시간으로 기다리지 않는다(약 30초 → 몇 초): CSS 연출은 20배로 돌리고, 타이머는 시계로 빨리 감는다.
 * 다만 넘김은 출력 연출이 다 끝난 뒤의 자리를 보므로, 출력 중에는 시계를 멈춘 채 연출이 끝나기를 기다린다
 */
test("영수증 넘김: 출력된 영수증이 뒤 화면의 같은 자리로 이어지고 가리지 않는다", async ({
  page,
}) => {
  await virtualAuthenticator(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // 영수증이 뒤 화면으로 넘어갈 때 출발 위치(오버레이 자리 - 뒤 화면 자리)를 남긴다
  await page.addInitScript(() => {
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (k, o) {
      if (this instanceof HTMLElement && this.dataset.receipt !== undefined)
        (window as unknown as { __handoff: unknown }).__handoff = {
          from: (k as Keyframe[])[0]?.transform,
          scrollY: window.scrollY,
        };
      return orig.call(this, k, o);
    };
  });
  await page.goto("/stardraw");
  await speedUpAnimations(page);
  /** 보일 때까지 연출을 빨리 감은 뒤 누른다 */
  const when = async (target: Locator, act: (l: Locator) => Promise<void>) => {
    await fastForwardUntil(page, () => target.isVisible());
    await act(target);
  };
  const press = (l: Locator) => l.press("Enter");
  const click = (l: Locator) => l.click();

  await when(
    page.getByRole("button", { name: "우주인 등록", exact: true }),
    click,
  );
  await when(
    page.locator("[aria-label='신청서 제출'][aria-disabled='false']"),
    press,
  );
  await when(
    page.getByRole("button", { name: "별을 고르러 가 볼까요?" }),
    click,
  );
  await when(page.getByRole("button", { name: "자동", exact: true }), click);
  await when(
    page.getByRole("button", { name: "응모하기", exact: true }),
    click,
  );
  await when(
    page.locator("[aria-label='답안지 제출'][aria-disabled='false']"),
    press,
  );
  await when(
    page.locator("[aria-label='신분증 제출'][aria-disabled='false']"),
    press,
  );

  // 출력 종이가 나올 때까지 빨리 감고, 출력 연출(CSS)이 끝날 때까지는 시계를 멈춘 채 기다린다
  const feed = page.locator(".sd-print");
  await fastForwardUntil(page, async () => (await feed.count()) > 0);
  await expect
    .poll(
      () =>
        feed.evaluate((el) => {
          const list = el.getAnimations();
          return (
            list.length > 0 && list.every((a) => a.playState === "finished")
          );
        }),
      { intervals: [50] },
    )
    .toBe(true);
  // 이제 넘김 타이머까지 빨리 감는다
  const handoff = () =>
    page.evaluate(
      () => (window as unknown as { __handoff?: unknown }).__handoff ?? null,
    );
  await fastForwardUntil(page, async () => (await handoff()) !== null);
  const from = await page.evaluate(
    () => (window as unknown as { __handoff: { from: string } }).__handoff.from,
  );
  const [dx, dy] = (from.match(/-?[\d.]+/g) ?? []).map(Number);
  expect(Math.abs(dx ?? Number.NaN)).toBeLessThanOrEqual(1);
  expect(Math.abs(dy ?? Number.NaN)).toBeLessThanOrEqual(1);
  // 오버레이가 걷힌 뒤: 영수증 윗부분 가운데를 누르면 그 영수증이 맞는다(머리 줄·탭바에 가리지 않는다)
  const shown = () =>
    page.evaluate(() => {
      const r = document.querySelector("[data-receipt]");
      if (!r) return "없음";
      const b = r.getBoundingClientRect();
      if (b.top < 0 || b.top > window.innerHeight - 40) return "화면 밖";
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + 12);
      return hit && r.contains(hit) ? "보임" : "가림";
    });
  await fastForwardUntil(page, async () => (await shown()) === "보임");
});
