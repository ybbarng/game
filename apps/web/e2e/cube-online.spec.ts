import { inputReady, keysFor, no3d, useNotationKeys } from "./cube";
import {
  expect,
  fastForwardUntil,
  type Page,
  SAVE_SCREENSHOTS,
  speedUpAnimations,
  test,
} from "./test";

/**
 * 큐브 컴퓨터와 대결(/cube/vs)·온라인 대결(/cube/online, docs/47 9·10절).
 * 컴퓨터가 맞추는 시간을 실제로 기다리지 않는다: 시계를 감아(`fastForward`) 컴퓨터가 먼저 맞춰 결과 상자가 뜨는 것을 조건으로 본다.
 * 키 입력은 3D 그림과 따로 준비된다(`[data-cube-stage][data-input-ready]`). WebGL이 없는 환경에서도 입력 준비로 기다린다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-${name}-${project}.png`,
    fullPage: true,
  });
}

// 3D 그림은 보지 않으므로 끈다(e2e/cube.ts `no3d`)
test.beforeEach(({ page }) => no3d(page));

test("컴퓨터와 대결: 2×2 입문 컴퓨터가 먼저 맞추면 결과 상자가 뜬다", async ({
  page,
}, info) => {
  await page.clock.install();
  await page.goto("/cube/vs");
  await speedUpAnimations(page);
  await expect(page.locator("[data-cube-vs-size]")).toHaveValue("2");
  await page.getByRole("button", { name: "입문", exact: true }).click();
  await shot(page, "vs-setup", info.project.name);
  await page.locator("[data-cube-vs-start]").click();

  const view = page.locator("[data-cube-race-phase]");
  // 섞기(워커)가 끝나 살펴보기가 열리고 키 입력이 준비된다
  await expect(view).toHaveAttribute("data-cube-race-phase", "inspect", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await expect(
    page.locator("[data-cube-stage][data-input-ready]"),
  ).toBeVisible();
  const scramble =
    (await page
      .locator("[data-cube-scramble]")
      .getAttribute("data-cube-scramble")) ?? "";
  expect(scramble.split(" ").length).toBeGreaterThan(3);
  await shot(page, "vs-inspect", info.project.name);
  // 상대 자리의 작은 큐브(비스듬한 SVG). 둘러앉은 판이라 모든 화면에서 보인다(docs/47 9-9)
  const botCube = page.locator('[data-cube-peer="bot1"] [data-cube-posters]');
  await expect(botCube).toBeVisible();
  // 계획(워커)이 온 뒤에 감는다. 먼저 감으면 계획이 늦게 온 만큼 컴퓨터가 늦게 시작한다
  await expect(
    page.locator('[data-cube-peer="bot1"][data-cube-bot-planned]'),
  ).toBeAttached({ timeout: SCRAMBLE_TIMEOUT });

  // 상대 자리: 상대가 하나면 휴대폰 세로·데스크톱은 맞은편(위), 휴대폰 가로는 옆(docs/47 9-9).
  // 1280×720에서 큐브가 잘리지 않는다
  const peers = page.locator("[data-cube-peers]");
  const stage = await page.locator("[data-cube-stage]").boundingBox();
  const seatBox = await page
    .locator('[data-cube-seat][data-cube-peer="bot1"]')
    .boundingBox();
  expect(stage && seatBox).toBeTruthy();
  if (stage && seatBox) {
    if (info.project.name === "phone-landscape")
      expect(seatBox.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1);
    else expect(seatBox.y + seatBox.height).toBeLessThanOrEqual(stage.y + 1);
    if (info.project.name === "desktop")
      expect(stage.y + stage.height).toBeLessThanOrEqual(720);
  }
  // 움직임 줄이기라 대결 알림은 「조용히」(칩만, 톡 없음)
  await expect(peers).toHaveAttribute("data-cube-race-alerts", "quiet");

  // 컴퓨터가 첫 이정표를 지나면 그 칸에 단계 칩이 뜬다. 칸에는 수가 아니라 단계만 보인다
  const botStages = page.locator(
    '[data-cube-peer="bot1"] [data-cube-peer-stages]',
  );
  await fastForwardUntil(
    page,
    async () =>
      ((await botStages.getAttribute("data-cube-peer-stages")) ?? "") !== "",
    { step: 500, timeout: 60_000 },
  );
  await expect(page.locator('[data-cube-peer="bot1"]')).not.toContainText(
    /\d+수/,
  );
  await shot(page, "vs-stages", info.project.name);

  // 결과 상자는 누가 맞추거나 판이 끝나면 뜬다. 2×2 제한 시간 3분은 입문 컴퓨터 계획의 최대 길이(약 82초)보다
  // 넉넉해 씨앗과 상관없이 컴퓨터가 먼저 맞춘다(room.ts TIME_LIMIT_SEC)
  const result = page.locator("[data-cube-result]");
  await fastForwardUntil(page, () => result.isVisible(), {
    step: 1_000,
    timeout: 60_000,
  });
  await expect(result).toContainText("컴퓨터 1");
  await expect(page.locator('[data-cube-peer="bot1"]')).toHaveAttribute(
    "data-cube-peer-status",
    "done",
  );
  await shot(page, "vs-bot-done", info.project.name);

  // 제한 시간까지 감으면 판이 끝나 순위표가 나온다
  await fastForwardUntil(
    page,
    async () => (await result.getAttribute("data-cube-result")) === "final",
    { step: 5_000, timeout: 60_000 },
  );
  await expect(page.locator('[data-cube-rank="bot1"]')).toContainText(
    "컴퓨터 계획 확인",
  );
  await expect(page.locator("[data-cube-again]")).toBeVisible();
  // 판이 끝나면 사람마다 구간 기록을 나란히(맞춘 컴퓨터의 칸은 이 기기가 수 기록에서 계산한 시각)
  await expect(botStages).toHaveAttribute("data-cube-peer-stages", /(^| )ll$/);
  const splits = page.locator("[data-cube-race-splits]");
  await expect(splits).toBeVisible();
  await expect(splits.locator("[data-cube-race-split-row]")).toHaveCount(2);
  await expect(
    splits.locator('[data-cube-race-split-row="bot1"]'),
  ).toContainText(/\d\.\d\d/);
  await shot(page, "vs-final", info.project.name);
  // 모두의 풀이 다시 보기도 큐브 모양(사람마다 비스듬한 큐브 둘)
  await page.locator("[data-cube-replay]").click();
  await expect(
    page.locator("[data-cube-replay-view] [data-cube-posters]"),
  ).toHaveCount(2);
  await shot(page, "vs-replay", info.project.name);

  if (SAVE_SCREENSHOTS && info.project.name === "desktop") {
    // 온라인 대기실(같은 탭 연결, 방장 혼자 + 컴퓨터)
    await page.goto("/cube/online?net=local");
    await page.locator("[data-cube-enter]").click();
    await expect(page.locator("[data-cube-players] li")).toHaveCount(1);
    await page.getByRole("button", { name: "컴퓨터 더하기" }).click();
    await expect(page.locator("[data-cube-players] li")).toHaveCount(2);
    await shot(page, "online-lobby", info.project.name);
  }
});

/**
 * 대결 알림 「켬」(움직임을 줄이지 않은 기기): 상대가 이정표를 지나면 그 칸 안에 「첫 층 3.21초」 같은 톡이 1초 안쪽으로
 * 떴다 사라진다. 톡은 잠깐이라 화면 시험은 띄운 수(`data-cube-toasts-shown`)를 조건으로 본다
 */
test(
  "컴퓨터와 대결: 상대가 이정표를 지나면 그 칸에 톡이 뜬다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 알림 규칙은 화면 크기와 상관없다
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await page.goto("/cube/vs");
    await speedUpAnimations(page);
    await page.getByRole("button", { name: "입문", exact: true }).click();
    await page.locator("[data-cube-vs-start]").click();
    await expect(
      page.locator('[data-cube-peer="bot1"][data-cube-bot-planned]'),
    ).toBeAttached({ timeout: SCRAMBLE_TIMEOUT });
    const peers = page.locator("[data-cube-peers]");
    await expect(peers).toHaveAttribute("data-cube-race-alerts", "on");
    await fastForwardUntil(
      page,
      async () =>
        Number(await peers.getAttribute("data-cube-toasts-shown")) > 0,
      { step: 250, timeout: 60_000 },
    );
    // 톡은 그 사람 칸 안에만 뜬다(내 큐브 칸을 덮지 않는다)
    const toast = page.locator(
      '[data-cube-peer="bot1"] [data-cube-race-toast]',
    );
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/초$/);
    const key = await toast.getAttribute("data-toast-key");
    await shot(page, "vs-toast", info.project.name);
    // 1초 안쪽으로 사라진다(그사이 다음 이정표를 지나 새 톡이 떠도 앞 톡은 없다)
    await page.clock.fastForward(1_000);
    await expect(page.locator(`[data-toast-key="${key}"]`)).toHaveCount(0);
  },
);

/**
 * 4×4 컴퓨터(축소법 + 3×3 사람 해법)도 같은 길로 돈다. 계획은 워커에서 만들고, 입문은 3~4분 걸려
 * 시계를 크게 감는다. 화면 크기와 상관없는 길이라 desktop 하나로 본다
 */
test(
  "컴퓨터와 대결: 4×4 입문 컴퓨터가 맞추면 결과 상자가 뜬다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 크기만 다른 같은 길
    test.setTimeout(150_000);
    await page.clock.install();
    await page.goto("/cube/vs");
    await page.locator("[data-cube-vs-size]").selectOption("4");
    await page.getByRole("button", { name: "입문", exact: true }).click();
    await page.locator("[data-cube-vs-start]").click();

    const view = page.locator("[data-cube-race-phase]");
    await expect(view).toHaveAttribute("data-cube-race-phase", "inspect", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    // 계획(워커)이 온 뒤에 감는다. 먼저 감으면 계획이 늦게 온 만큼 컴퓨터가 늦게 시작한다
    await expect(
      page.locator('[data-cube-peer="bot1"][data-cube-bot-planned]'),
    ).toBeAttached({ timeout: SCRAMBLE_TIMEOUT });
    const result = page.locator("[data-cube-result]");
    await fastForwardUntil(page, () => result.isVisible(), {
      step: 2_000,
      timeout: 120_000,
    });
    await expect(result).toContainText("컴퓨터 1");
    await expect(page.locator('[data-cube-peer="bot1"]')).toHaveAttribute(
      "data-cube-peer-status",
      "done",
    );
    await shot(page, "vs-4x4-bot-done", info.project.name);
  },
);

/**
 * 여러 탭 온라인 대결(같은 브라우저 탭끼리 `?net=local`). 이 맥에서는 돌리지 않는다: `CUBE_MULTI=1`일 때만.
 * 방장이 방을 만들고 손님이 초대 링크로 들어와, 컴퓨터 하나를 더해 판을 열면 세 참가자가 모두 보인다.
 */
test(
  "온라인 대결: 방장과 손님 두 탭 + 컴퓨터",
  { tag: "@only-desktop" },
  async ({ context }, info) => {
    test.skip(!process.env.CUBE_MULTI, "여러 탭 시험은 CUBE_MULTI=1일 때만");
    // 키보드 기기만 참가
    await no3d(context);
    const host = await context.newPage();
    await host.goto("/cube/online?net=local");
    await host.locator("[data-cube-enter]").click();
    const link = await host.locator("input[readonly]").inputValue();
    expect(link).toContain("room=");

    const guest = await context.newPage();
    await guest.goto(link);
    await guest.locator("[data-cube-enter]").click();
    await expect(host.locator("[data-cube-players] li")).toHaveCount(2);
    await host.getByRole("button", { name: "컴퓨터 더하기" }).click();
    await expect(guest.locator("[data-cube-players] li")).toHaveCount(3);
    await host.locator("[data-cube-start]").click();
    for (const p of [host, guest])
      await expect(p.locator("[data-cube-race-phase]")).toHaveAttribute(
        "data-cube-race-phase",
        "inspect",
        { timeout: SCRAMBLE_TIMEOUT },
      );
    await expect(guest.locator("[data-cube-peer]")).toHaveCount(3);
    // 손님이 판 중에 새로 고쳐도 이름 화면에서 멈추지 않고 기억한 이름으로 바로 다시 들어간다
    await guest.reload();
    await expect(guest.locator("main[data-cube-online]")).toHaveAttribute(
      "data-cube-online",
      /^(?!name$|connecting$|error$)/,
      { timeout: SCRAMBLE_TIMEOUT },
    );
    await expect(guest.locator("[data-cube-enter]")).toHaveCount(0);
    await shot(guest, "online-guest-reload", info.project.name);
  },
);

/** 섞기의 거꾸로(표기 글) */
function inverseAlg(alg: string): string {
  return alg
    .trim()
    .split(/\s+/)
    .reverse()
    .map((t) =>
      t.endsWith("2") ? t : t.endsWith("'") ? t.slice(0, -1) : `${t}'`,
    )
    .join(" ");
}

/**
 * 새로고침 뒤 대결 자리 되찾기(docs/47 9-11). 두 탭(`?net=local`), `CUBE_MULTI=1`일 때만.
 * 손님이 판 도중 두 수를 두고 새로 고치면 같은 참가자 자리(같은 아이디)로 돌아와 같은 수 기록·같은 큐브에서 이어 두고,
 * 남은 수로 맞추면 방장 탭도 그 손님을 「맞춤」으로 본다(새 연결의 수를 그 자리 수로 받았다)
 */
test(
  "온라인 대결: 손님이 판 도중 새로 고쳐도 같은 자리·같은 큐브에서 이어 맞춘다",
  { tag: "@only-desktop" },
  async ({ context }, info) => {
    test.skip(!process.env.CUBE_MULTI, "여러 탭 시험은 CUBE_MULTI=1일 때만");
    await no3d(context);
    const host = await context.newPage();
    await useNotationKeys(host);
    await host.goto("/cube/online?net=local");
    await host.locator("[data-cube-enter]").click();
    const link = await host.locator("input[readonly]").inputValue();
    const guest = await context.newPage();
    await useNotationKeys(guest);
    await guest.goto(link);
    await guest.locator("[data-cube-enter]").click();
    await expect(host.locator("[data-cube-players] li")).toHaveCount(2);
    await host.getByLabel("종목").selectOption("2");
    await host.getByLabel("살펴보기").selectOption("0");
    await host.locator("[data-cube-start]").click();
    for (const p of [host, guest])
      await expect(p.locator("[data-cube-race-phase]")).toHaveAttribute(
        "data-cube-race-phase",
        "race",
        { timeout: SCRAMBLE_TIMEOUT },
      );
    await inputReady(guest);
    const scramble = (await guest
      .locator("[data-cube-scramble]")
      .getAttribute("data-cube-scramble")) as string;
    const mySeat = guest.locator("[data-cube-my-log]");
    const me = (await mySeat.getAttribute("data-cube-peer")) as string;
    await guest.keyboard.press("KeyR");
    await guest.keyboard.press("KeyU");
    await expect(mySeat).toHaveAttribute("data-cube-my-log", "R U");
    await shot(guest, "online-rejoin-before", info.project.name);

    await guest.reload();
    await expect(guest.locator("[data-cube-race-phase]")).toHaveAttribute(
      "data-cube-race-phase",
      "race",
      { timeout: SCRAMBLE_TIMEOUT },
    );
    await inputReady(guest);
    // 같은 자리(참가자 아이디), 같은 섞기, 같은 수 기록 = 같은 큐브 상태. 상대 자리도 그대로 하나
    await expect(mySeat).toHaveAttribute("data-cube-peer", me);
    await expect(mySeat).toHaveAttribute("data-cube-my-log", "R U");
    await expect(guest.locator("[data-cube-scramble]")).toHaveAttribute(
      "data-cube-scramble",
      scramble,
    );
    await expect(guest.locator("[data-cube-peer]")).toHaveCount(2);
    await expect(guest.locator("[data-cube-moves]")).toHaveText("2");
    await shot(guest, "online-rejoin-after", info.project.name);

    // 남은 수로 맞춘다: 두었던 R U를 되돌리고 섞기의 거꾸로
    for (const key of keysFor(`U' R' ${inverseAlg(scramble)}`))
      await guest.keyboard.press(key);
    await expect(mySeat).toHaveAttribute("data-cube-peer-status", "done");
    await expect(host.locator(`[data-cube-peer="${me}"]`)).toHaveAttribute(
      "data-cube-peer-status",
      "done",
      { timeout: 10_000 },
    );
    await shot(host, "online-rejoin-host", info.project.name);
  },
);

/**
 * 방장 새로고침 뒤 방 되찾기(docs/47 9-11 「방장 되찾기」). 두 탭(`?net=local`), `CUBE_MULTI=1`일 때만.
 * 대기실에서 방장이 새로 고쳐도 손님 탭은 같은 방에 남고(방장을 기다리다 새 연결을 받는다) 방장이 다음 판을 연다.
 * 판 도중 방장이 두 수를 두고 새로 고치면 같은 방장 자리·같은 큐브에서 이어 맞추고, 손님 탭도 방장을 「맞춤」으로 본다
 */
test(
  "온라인 대결: 방장이 새로 고쳐도 손님은 같은 방에 남고, 판 도중이면 같은 큐브에서 이어 맞춘다",
  { tag: "@only-desktop" },
  async ({ context }, info) => {
    test.skip(!process.env.CUBE_MULTI, "여러 탭 시험은 CUBE_MULTI=1일 때만");
    await no3d(context);
    const host = await context.newPage();
    await useNotationKeys(host);
    await host.goto("/cube/online?net=local");
    await host.locator("[data-cube-enter]").click();
    const link = await host.locator("input[readonly]").inputValue();
    const room = new URL(link).searchParams.get("room");
    const guest = await context.newPage();
    await useNotationKeys(guest);
    await guest.goto(link);
    await guest.locator("[data-cube-enter]").click();
    await expect(host.locator("[data-cube-players] li")).toHaveCount(2);
    await host.getByLabel("종목").selectOption("2");
    await host.getByLabel("살펴보기").selectOption("0");

    // 대기실에서 방장이 새로 고친다: 이름 화면 없이 같은 방(같은 방 코드·설정)으로 돌아온다
    await host.reload();
    await expect(host.locator("main[data-cube-online]")).toHaveAttribute(
      "data-cube-online",
      "lobby",
      { timeout: SCRAMBLE_TIMEOUT },
    );
    await expect(host.locator("[data-cube-enter]")).toHaveCount(0);
    expect(
      new URL(
        await host.locator("input[readonly]").inputValue(),
      ).searchParams.get("room"),
    ).toBe(room);
    await expect(host.getByLabel("종목")).toHaveValue("2");
    // 손님 탭은 같은 방에 남고, 방장 자리를 확인한 새 연결을 받는다(끊김 표시 없음)
    await expect(guest.locator("[data-cube-host-away]")).toHaveCount(0);
    await expect(guest.locator("main[data-cube-online]")).toHaveAttribute(
      "data-cube-online",
      "lobby",
    );
    await expect(host.locator("[data-cube-players] li")).toHaveCount(2);
    await expect(
      host.locator("[data-cube-players] li", { hasText: "끊김" }),
    ).toHaveCount(0);
    await shot(guest, "online-host-reload-lobby", info.project.name);

    // 새로 고친 방장이 판을 연다
    await host.locator("[data-cube-start]").click();
    for (const p of [host, guest])
      await expect(p.locator("[data-cube-race-phase]")).toHaveAttribute(
        "data-cube-race-phase",
        "race",
        { timeout: SCRAMBLE_TIMEOUT },
      );
    await inputReady(host);
    const scramble = (await host
      .locator("[data-cube-scramble]")
      .getAttribute("data-cube-scramble")) as string;
    const mySeat = host.locator("[data-cube-my-log]");
    const me = (await mySeat.getAttribute("data-cube-peer")) as string;
    await host.keyboard.press("KeyR");
    await host.keyboard.press("KeyU");
    await expect(mySeat).toHaveAttribute("data-cube-my-log", "R U");

    // 판 도중 방장이 새로 고친다
    await host.reload();
    await expect(host.locator("[data-cube-race-phase]")).toHaveAttribute(
      "data-cube-race-phase",
      "race",
      { timeout: SCRAMBLE_TIMEOUT },
    );
    await inputReady(host);
    await expect(mySeat).toHaveAttribute("data-cube-peer", me);
    await expect(mySeat).toHaveAttribute("data-cube-my-log", "R U");
    await expect(host.locator("[data-cube-scramble]")).toHaveAttribute(
      "data-cube-scramble",
      scramble,
    );
    await expect(guest.locator("[data-cube-host-away]")).toHaveCount(0);
    await shot(host, "online-host-reload-race", info.project.name);
    for (const key of keysFor(`U' R' ${inverseAlg(scramble)}`))
      await host.keyboard.press(key);
    await expect(mySeat).toHaveAttribute("data-cube-peer-status", "done");
    await expect(guest.locator(`[data-cube-peer="${me}"]`)).toHaveAttribute(
      "data-cube-peer-status",
      "done",
      { timeout: 10_000 },
    );
    await shot(guest, "online-host-reload-guest", info.project.name);
  },
);
