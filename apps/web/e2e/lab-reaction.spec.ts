import {
  type BrowserContext,
  expect,
  type Page,
  SAVE_SCREENSHOTS,
  test,
} from "./test";

/**
 * 반응 측정실(/lab/reaction, docs/43 5절).
 * - E1: 열면 저절로 타이머 단위·주사율을 잰다.
 * - E5: 같은 브라우저 탭끼리 실제 WebRTC로 이어 속임을 켜고, 아래 경계가 앱 핑 기준과 getStats 기준에서
 *   각각 잡는지 본다. 같은 컨텍스트의 탭이라야 연결 정보를 BroadcastChannel로 넘길 수 있다.
 *   크롬은 기본으로 내 주소를 mDNS 이름으로 숨기는데, 헤드리스에서는 그 이름이 풀리지 않을 수 있어 끈다.
 *
 * 판정 값은 실제 시간으로 잰 값이라 넉넉한 기준(속인 300ms 가운데 150ms 넘게 / 아래)으로 가른다.
 */
test.use({
  launchOptions: {
    args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
  },
});

type Snapshot = NonNullable<Window["__lab"]> extends () => infer R ? R : never;

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (window.__lab as () => Snapshot)());
}

/** E5 탭 하나를 연다 */
async function openLab(
  context: BrowserContext,
  room: string,
  query: string,
  hash = "",
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(
    `/lab/reaction?mode=e5&room=${room}&ping=300&slack=30&auto=400&rounds=4&gap=300&${query}${hash ? `#${hash}` : ""}`,
  );
  return page;
}

async function runRounds(host: Page): Promise<void> {
  const start = host.locator("[data-lab-start]");
  await expect(start).toBeEnabled({ timeout: 20_000 });
  await start.click();
  await expect(host.locator("[data-lab-done]")).toBeVisible({
    timeout: 40_000,
  });
}

test(
  "E1: 열면 타이머 단위와 주사율을 잰다",
  { tag: "@no-phone-landscape" },
  async ({ page }, info) => {
    // 세로·데스크톱만 본다
    await page.goto("/lab/reaction");
    await expect(page.locator("[data-lab-e1-done]")).toBeVisible();
    await expect(page.locator("[data-lab-hz]")).toContainText("Hz");
    await page.locator("[data-lab-tap]").click();
    await expect(page.locator("[data-lab-taps]")).toContainText(
      "누름 시각 단위",
    );
    if (SAVE_SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screens/lab-e1-${info.project.name}.png`,
        fullPage: true,
      });
  },
);

test.describe("E5 속임 시험", { tag: "@only-desktop" }, () => {
  // 탭 여럿을 띄우는 시험은 데스크톱 하나로(모든 프로젝트가 Chrome이다)

  test("핑 답만 늦춘 손님: 앱 핑 기준은 못 잡고 getStats 기준은 잡는다", async ({
    context,
  }, info) => {
    const room = `ping-${Date.now()}`;
    const host = await openLab(context, room, "role=host&name=host");
    const cheat = await openLab(
      context,
      room,
      "role=guest&name=g1",
      "pingDelay=300&rtCut=300",
    );
    await runRounds(host);
    const s = await snapshot(host);
    const row = s.results.find((r) => r.claimant === "g1");
    expect(row?.n).toBe(4);
    // 앱 핑 RTT_min이 300 부풀어 깎은 rt가 거의 그대로 통과한다(빈틈 1)
    expect(row?.meanClippedApp).toBeLessThan(150);
    // getStats RTT는 핑 답 늦추기와 상관없어 깎은 만큼 되돌린다(막는 길 (a))
    expect(row?.meanClippedRtc).toBeGreaterThan(150);
    const pair = s.latency.pairs.find(
      (p) => p.peer === Object.keys(s.peers)[0],
    );
    expect(pair?.appMinusRtcMin).toBeGreaterThan(250);
    // 순서 없는 채널도 열린다
    expect(pair?.unordered?.n ?? 0).toBeGreaterThan(0);
    if (SAVE_SCREENSHOTS) {
      await host.screenshot({
        path: `test-results/screens/lab-e5-ping-host-${info.project.name}.png`,
        fullPage: true,
      });
      await cheat.screenshot({
        path: `test-results/screens/lab-e5-ping-guest-${info.project.name}.png`,
        fullPage: true,
      });
    }
  });

  test("한 손님에게만 자극을 늦춘 방장: 그 손님 확인은 통과, 다른 손님 확인과 받은 시각 차이로 드러난다", async ({
    context,
  }, info) => {
    const room = `stim-${Date.now()}`;
    const host = await openLab(
      context,
      room,
      "role=host&name=host",
      "stimDelay=300&stimTo=g1&rtCut=300",
    );
    const g1 = await openLab(context, room, "role=guest&name=g1");
    const g2 = await openLab(context, room, "role=guest&name=g2");
    await expect
      .poll(async () => Object.keys((await snapshot(host)).peers).length, {
        timeout: 20_000,
      })
      .toBe(2);
    await runRounds(host);
    // 손님 쪽 확인은 방장 청구가 닿은 뒤 계산된다
    for (const g of [g1, g2])
      await expect
        .poll(async () => (await snapshot(g)).rows.length, { timeout: 10_000 })
        .toBe(4);
    const s1 = await snapshot(g1);
    const s2 = await snapshot(g2);
    const r1 = s1.results.find((r) => r.claimant === "host");
    const r2 = s2.results.find((r) => r.claimant === "host");
    // 늦게 받은 g1 쪽 확인은 느슨해져 통과(빈틈 2)
    expect(r1?.meanClippedApp).toBeLessThan(150);
    // 제때 받은 g2 쪽 확인은 깎는다(막는 길 (d))
    expect(r2?.meanClippedApp).toBeGreaterThan(150);
    // 손님끼리 같은 자극을 받은 시각 차이: g1이 약 300ms 늦게 받았다(막는 길 (b))
    const skew = s1.skews.find((k) => k.peer === "g2");
    expect(skew?.n ?? 0).toBeGreaterThan(0);
    expect(skew?.meanMs ?? 0).toBeGreaterThan(150);
    if (SAVE_SCREENSHOTS)
      await g1.screenshot({
        path: `test-results/screens/lab-e5-stim-g1-${info.project.name}.png`,
        fullPage: true,
      });
  });
});
