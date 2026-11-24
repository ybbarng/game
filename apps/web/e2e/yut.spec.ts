import { decodeYutRules } from "@game/yut-engine";

// 옛 엔진(규칙 판 1, 몸짓 없음)으로 만든 판 기록
import legacy from "../../../packages/yut-engine/src/legacy-y1.fixture.json" with {
  type: "json",
};
import { FLAT_ROLL_MS } from "../src/yut/components/toss-timing";
import { useTestSpeed } from "./fast";
import {
  animationsDone,
  expect,
  fastForwardUntil,
  leaveOnline,
  type Page,
  ready,
  speedUpAnimations,
  test,
} from "./test";

const status = (page: Page) => page.getByRole("status").first();
const over = (page: Page) => page.getByRole("button", { name: "다시 하기" });
const throwButton = (page: Page) => page.locator("[data-throw]");
/** 지금 움직일 수 있는 판 위 말 묶음 */
const movableStacks = (page: Page) => page.locator("[data-stack]:enabled");
const newPiece = (page: Page) => page.locator("[data-new-piece]");

/**
 * 윷가락을 잡고 아래로 당겼다가 위로 튕겨 놓는다(마우스로 끌었다 놓기, docs/37 13절).
 * `pull`은 높이 100이 되는 당김 길이(화면 높이의 30%, 적어도 150px)에 견준 비율. 튕기기는 3px씩 열 번에 곧장 위로
 * (점 사이는 적어도 8ms로 재므로 세기가 낮다): 가운데로 알맞게 던져 낙이 없다
 */
async function throwSticks(page: Page, pull = 0.5): Promise<void> {
  const pad = throwButton(page);
  const box = await pad.boundingBox();
  if (!box) throw new Error("윷가락이 보이지 않는다");
  const height = await page.evaluate(() => window.innerHeight);
  const reach = Math.max(150, Math.round(height * 0.3));
  const x = box.x + box.width / 2;
  const y = box.y + 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + reach * pull, { steps: 6 });
  await page.mouse.move(x, y + reach * pull - 30, { steps: 10 });
  await page.mouse.up();
}

/** 말 하나를 고른다. PC는 눌러서 바로, 휴대폰은 겨누고(한 번) 다시 눌러 움직인다 */
async function pickTarget(page: Page, touch: boolean): Promise<boolean> {
  const stack = movableStacks(page).first();
  const target = (await stack.count()) > 0 ? stack : newPiece(page);
  if ((await target.count()) === 0) return false;
  if (touch) {
    await target.tap();
    // 겨눈 뒤에는 갈 곳이 보인다.
    await expect(page.locator("[data-preview-to]")).toBeVisible();
    await target.tap();
  } else await target.click();
  return true;
}

/** 내 할 일(던지기·움직이기)이 생기거나 게임이 끝날 때까지 기다렸다가 하나 한다. 끝났으면 false */
async function playStep(page: Page, touch: boolean): Promise<boolean> {
  await expect(
    throwButton(page)
      .or(movableStacks(page))
      .or(newPiece(page))
      .or(over(page))
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  if (await over(page).isVisible()) return false;
  if (await throwButton(page).isVisible()) {
    await throwSticks(page);
    return true;
  }
  await pickTarget(page, touch);
  return true;
}

/**
 * 내 던지기 차례가 될 때까지 움직이기를 마저 한다. 그때는 컴퓨터 수가 모두 화면에 보인 뒤라
 * 판이 멈춰 있다(수를 세거나 기권해도 대기열에 걸리지 않는다)
 */
async function untilMyThrow(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await expect(
      throwButton(page)
        .or(movableStacks(page))
        .or(newPiece(page))
        .or(over(page))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    if (await throwButton(page).isVisible()) return;
    if (await over(page).isVisible()) throw new Error("게임이 먼저 끝났다");
    await pickTarget(page, false);
  }
  throw new Error("던지기 차례가 오지 않는다");
}

/** IndexedDB 복기 기록에 남은 끝난 윷놀이 게임 수(omok.spec과 같은 방식) */
async function finishedYutGames(): Promise<number> {
  const names = await indexedDB.databases();
  if (!names.some((d) => d.name === "mighty-review")) return 0;
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("mighty-review", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("games")) {
        db.close();
        resolve(0);
        return;
      }
      const all = db.transaction("games").objectStore("games").getAll();
      all.onerror = () => reject(all.error);
      all.onsuccess = () => {
        const games = all.result as { game: string; over: boolean }[];
        db.close();
        resolve(games.filter((g) => g.game === "yut" && g.over).length);
      };
    };
  });
}

/** 옵션에서 컴퓨터 단계와 말 수를 고르고 → 나홀로 윷놀이 */
async function startSolo(page: Page, pieces = "2개") {
  await ready(page);
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "입문", exact: true }).click();
  await page.getByRole("button", { name: pieces, exact: true }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 윷놀이/ }).click();
}

test.beforeEach(async ({ page, context }) => {
  // 움직임 줄이기는 화면 시험 설정이 기본으로 켠다(던지기·말 움직임 연출을 기다리지 않는다)
  await useTestSpeed(context);
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    if (!sessionStorage.getItem("keep")) localStorage.removeItem("yut-save");
  });
});

test("윷놀이: 게임 목록에서 들어가 입문 컴퓨터와 두다가 판 끝 화면까지 간다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/");
  await page
    .getByRole("link", { name: /윷놀이/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/yut$/);
  await expect(page.getByRole("heading", { name: "윷놀이" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("yut-home.png") });
  await startSolo(page);
  await expect(page.locator("[data-yut-board]")).toBeVisible();

  // 내 차례가 올 때까지 기다려 한 번 던지고, 첫 움직임 뒤 무르기로 되돌린다.
  await expect(throwButton(page)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: info.outputPath("yut-throw.png") });
  // 조금만 당겼다 놓으면 던지지 않고 다시 던지라고 한다.
  await throwSticks(page, 0.05);
  await expect(status(page)).toHaveText("너무 낮게 던졌어요. 다시 던지세요.");
  await expect(throwButton(page)).toBeVisible();
  // 당기는 동안 손과 윷이 따라 내려간다.
  const pad = await throwButton(page).boundingBox();
  if (!pad) throw new Error("윷가락이 보이지 않는다");
  await page.mouse.move(pad.x + pad.width / 2, pad.y + 40);
  await page.mouse.down();
  await page.mouse.move(pad.x + pad.width / 2, pad.y + 140, { steps: 5 });
  await expect(throwButton(page)).not.toHaveAttribute("data-pull", "0");
  await page.screenshot({ path: info.outputPath("yut-pull.png") });
  await page.mouse.move(pad.x + pad.width / 2, pad.y + 110, { steps: 10 });
  await page.mouse.up();
  await expect(
    movableStacks(page).or(newPiece(page)).or(throwButton(page)).first(),
  ).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: info.outputPath("yut-move.png") });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  if (await newPiece(page).isVisible()) {
    await pickTarget(page, touch);
    await expect(page.getByRole("button", { name: "무르기" })).toBeEnabled({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "무르기" }).click();
    // 무르면 같은 결과로 다시 고른다(던지기 결과는 사슬로 정해져 있다).
    await expect(newPiece(page)).toBeVisible({ timeout: 20_000 });
  }

  // 몇 수 더 둔 뒤 기권해 판 끝 화면(가운데 띠·결과·다시 하기)을 본다. 끝까지 두는 진행은
  // 엔진 단위 시험과 아래 온라인 시험이 본다. 판 끝 화면은 이기든 기권하든 같은 모양이다.
  for (let i = 0; i < 4; i++) if (!(await playStep(page, touch))) break;
  // 내 던지기 차례가 오면 기권한다. 그 전에 판이 끝났으면(짧은 판이라 컴퓨터가 먼저 날 수 있다) 그대로 본다.
  for (let i = 0; i < 40; i++) {
    await expect(
      throwButton(page)
        .or(movableStacks(page))
        .or(newPiece(page))
        .or(over(page))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    if (await over(page).isVisible()) break;
    if (await throwButton(page).isVisible()) {
      await page.getByRole("button", { name: "기권" }).click();
      await page.getByRole("button", { name: "기권하기" }).click();
      break;
    }
    await pickTarget(page, touch);
  }
  await expect(over(page)).toBeVisible();
  await expect(status(page)).toHaveText(/이겼|먼저 말을 모두|기권/);
  await expect(page.locator("[data-result-banner]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("yut-end.png") });

  // 다 끝난 게임은 이어하기에 남지 않는다.
  await over(page).click();
  await expect(
    page.getByRole("button", { name: /나홀로 윷놀이/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
});

test(
  "윷놀이 개인 시간: 빠른 3분을 고르면 자리마다 시계가 보이고 내 차례에만 간다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 시계는 화면 크기와 상관없다
    // 시계를 시험이 움직인다(실제로 기다리지 않는다).
    await page.clock.install();
    await page.goto("/yut");
    await ready(page);
    await page.getByRole("button", { name: "옵션" }).click();
    await page.getByRole("button", { name: "빠른 3분" }).click();
    await page.getByRole("button", { name: "처음으로" }).click();
    await expect(
      page.getByRole("button", { name: /나홀로 윷놀이/ }),
    ).toContainText("빠른 3분");
    await page.getByRole("button", { name: /나홀로 윷놀이/ }).click();
    const mine = page.locator('[data-clock-seat="0"] [data-clock]');
    await expect(page.locator("[data-clock-seat]")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "윷 던지기" })).toBeVisible({
      timeout: 15_000,
    });
    await page.clock.runFor(20_000);
    await expect(mine).toHaveText(/^2:[34]\d$/);
    await expect(page.locator('[data-clock-seat="1"] [data-clock]')).toHaveText(
      /^[23]:\d\d$/,
    );
    await page.screenshot({ path: info.outputPath("yut-time.png") });
  },
);

test("윷놀이: 하던 게임은 새로고침해도 이어 한다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  // 저장은 화면 크기와 상관없다
  await page.goto("/yut");
  await startSolo(page, "4개");
  for (let i = 0; i < 6; i++) await playStep(page, false);
  await untilMyThrow(page);
  // 말이 움직이는 연출 중에는 도착 점의 말을 잠깐 숨긴다. 연출이 끝난 뒤에 센다.
  await expect(page.locator("[data-moving]")).toHaveCount(0);
  const before = await page.locator("[data-stack]").count();
  await page.evaluate(() => sessionStorage.setItem("keep", "1"));
  await page.goto("/yut?keep");
  await page.getByRole("button", { name: /이어하기/ }).click();
  await expect(page.locator("[data-yut-board]")).toBeVisible();
  await expect(page.locator("[data-stack]")).toHaveCount(before);
  // 이어서 던지기·움직이기가 된다(내 사슬 공개도 자동).
  await playStep(page, false);
  await playStep(page, false);
});

test(
  "윷놀이: 방장이 방을 만들고 친구가 링크로 들어와 두다가 판을 끝내고 판 끝 검증을 통과한다",
  { tag: "@only-desktop" },
  async ({ context }, info) => {
    // 데스크톱에서만 돌린다
    const host = await context.newPage();
    const guest = await context.newPage();
    const errors: string[] = [];
    for (const p of [host, guest])
      p.on("pageerror", (e) => errors.push(e.message));

    await host.goto("/yut?net=local");
    // 판을 짧게: 말 2개
    await ready(host);
    await host.getByRole("button", { name: "옵션" }).click();
    await host.getByRole("button", { name: "2개", exact: true }).click();
    await host.getByRole("button", { name: "처음으로" }).click();
    await host.getByRole("button", { name: /다함께 윷놀이/ }).click();
    await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
    await host.getByRole("button", { name: "방 만들기", exact: true }).click();
    const link = await host.locator("input[readonly]").inputValue();
    expect(link).toContain("/yut");

    await guest.goto(link);
    await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
    await guest.getByRole("button", { name: "들어가기" }).click();
    await expect(
      guest.getByText("방장이 시작하기를 기다리는 중"),
    ).toBeVisible();
    await expect(host.getByText("철수")).toBeVisible();
    await host.getByRole("button", { name: "시작하기" }).click();
    await expect(guest.locator("[data-yut-board]")).toBeVisible();
    await guest.screenshot({
      path: info.outputPath("yut-online-guest-start.png"),
    });

    // 둘이 몇 번씩 던지고 움직인 뒤 방장이 기권한다. 판 끝 검증은 그때까지의 모든 던지기
    // (양쪽 사슬 공개)를 다시 계산한다. 끝까지 두는 진행은 엔진·방 단위 시험이 본다.
    let actions = 0;
    for (let i = 0; i < 1500 && actions < 12; i++) {
      if ((await over(host).isVisible()) && (await over(guest).isVisible()))
        break;
      for (const p of [host, guest]) {
        if (await over(p).isVisible()) continue;
        if (await throwButton(p).isVisible()) {
          await throwSticks(p);
          actions++;
        } else if (
          (await movableStacks(p).count()) > 0 ||
          (await newPiece(p).count()) > 0
        ) {
          await pickTarget(p, false);
          actions++;
        }
      }
      await host.waitForTimeout(30);
    }
    if (!(await over(host).isVisible())) {
      const resign = host.getByRole("button", { name: "기권" });
      await expect(resign).toBeEnabled({ timeout: 20_000 });
      await resign.click();
      await host.getByRole("button", { name: "기권하기" }).click();
    }
    await expect(over(host)).toBeVisible();
    await expect(over(guest)).toBeVisible();
    await host.screenshot({ path: info.outputPath("yut-online-host-end.png") });

    // 방장이 나가면 기록이 공개되고, 참가자가 모든 던지기를 다시 계산해 확인한다.
    await leaveOnline(host, "← 윷놀이");
    await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
      timeout: 15_000,
    });
    expect(errors).toEqual([]);
  },
);

test(
  "윷놀이: 끝낸 판은 내 기록에 쌓이고 복기에서 한 걸음씩 다시 본다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 기록은 화면 크기와 상관없다
    await page.goto("/yut");
    await startSolo(page);
    for (let i = 0; i < 4; i++) await playStep(page, false);
    await untilMyThrow(page);
    // 기권은 한 번 더 묻는다. 「계속하기」면 판이 그대로다.
    await page.getByRole("button", { name: "기권" }).click();
    await page.getByRole("button", { name: "계속하기" }).click();
    await expect(throwButton(page)).toBeVisible();
    await page.getByRole("button", { name: "기권" }).click();
    await page.getByRole("button", { name: "기권하기" }).click();
    await expect(status(page)).toHaveText("기권했어요.");
    await expect
      .poll(() => page.evaluate(finishedYutGames), { intervals: [50] })
      .toBe(1);

    await page.goto("/profile?game=yut");
    await expect(page.getByRole("tab", { name: "🪵 윷놀이" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("0승 1패")).toBeVisible();

    await page.goto("/review");
    await page.getByRole("button", { name: /🪵 윷놀이 · 혼자/ }).click();
    await expect(page.locator("[data-yut-board]")).toBeVisible();
    await page.getByRole("button", { name: "처음" }).click();
    await expect(page.locator("[data-stack]")).toHaveCount(0);
    for (
      let i = 0;
      i < 30 && (await page.locator("[data-stack]").count()) === 0;
      i++
    )
      await page.getByRole("button", { name: "한 수 앞으로" }).click();
    await expect(page.locator("[data-stack]").first()).toBeVisible();
    await page.screenshot({ path: info.outputPath("yut-review.png") });
  },
);

test(
  "윷놀이 배우기: 단원을 끝내고, 미션은 틀리면 다시 한다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 배우기 진행은 크기와 상관없다(공통 배우기 화면의 배치는 tutorial.spec이 세 크기로 본다)
    const touch = info.project.name.startsWith("phone");
    const pick = async (point: number) => {
      const stack = page.locator(`[data-stack="${point}"]`);
      if (touch) {
        await stack.tap();
        await stack.tap();
      } else await stack.click();
    };
    await page.goto("/yut");
    await page.getByRole("button", { name: /윷놀이 배우기/ }).click();
    await expect(page.getByText("0/7")).toBeVisible();

    // 1단원: 설명 둘 → 퀴즈 → 새 말 내보내기 미션
    await page.getByRole("button", { name: /윷놀이는 어떤 게임/ }).click();
    for (let i = 0; i < 2; i++)
      await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "개(2칸)" }).click();
    await expect(page.getByText("정답이에요!")).toBeVisible();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "미션 시작" }).click();
    await expect(newPiece(page)).toBeVisible();
    await page.screenshot({ path: info.outputPath("yut-mission.png") });
    if (touch) {
      await newPiece(page).tap();
      await newPiece(page).tap();
    } else await newPiece(page).click();
    await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByText("단원 완료!")).toBeVisible();
    await page.getByRole("button", { name: "단원 목록으로" }).click();
    await expect(page.getByText("1/7")).toBeVisible();

    // 2단원: 걸을 먼저 쓰면 모를 지나쳐 실패, 개 → 걸 순서로 다시 하면 성공
    await page.getByRole("button", { name: /지름길/ }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "바깥 길로 계속" }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "미션 시작" }).click();
    await page.locator('[data-pending="3"]').click();
    await pick(3);
    await pick(6);
    await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "다시 하기" }).click();
    await expect(page.locator('[data-stack="3"]')).toBeVisible();
    await pick(3);
    await pick(5);
    await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
      timeout: 10_000,
    });

    // 튜토리얼 대국은 이어하기에 남지 않는다.
    await page.goto("/yut");
    await expect(page.getByText("1/7 단원 마침")).toBeVisible();
    await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
  },
);

/** 아래로 당겼다가 옆으로 쓸어 놓는다(튕긴 쪽이 60도를 넘어 반드시 낙, docs/37 13-3) */
async function sweepSticks(page: Page): Promise<void> {
  const box = await throwButton(page).boundingBox();
  if (!box) throw new Error("윷가락이 보이지 않는다");
  const x = box.x + box.width / 2;
  const y = box.y + 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 120, { steps: 6 });
  await page.mouse.move(x + 120, y + 100, { steps: 10 });
  await page.mouse.up();
}

test(
  "윷놀이 배우기: 공정한 던지기 단원에서 직접 던지고, 쓸어 던지면 낙이라 다시 한다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 앞 단원 다섯을 마친 사람(공정한 던지기는 여섯째 단원이라 그 전에는 잠겨 있다)
    await page.addInitScript(() => {
      localStorage.setItem(
        "yut-tutorial",
        JSON.stringify({
          state: {
            completed: ["goal", "shortcut", "capture", "bonus", "home"],
          },
          version: 0,
        }),
      );
    });
    await page.goto("/yut");
    await page.getByRole("button", { name: /윷놀이 배우기/ }).click();
    await page.getByRole("button", { name: /공정한 던지기/ }).click();
    await expect(page.getByText("윷 던지는 법")).toBeVisible();
    await page.screenshot({ path: info.outputPath("yut-fair-lesson.png") });
    // 설명 둘(던지는 법, 낙) → 던지기 미션
    for (let i = 0; i < 2; i++)
      await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "미션 시작" }).click();
    await expect(throwButton(page)).toBeVisible();
    await page.screenshot({ path: info.outputPath("yut-fair-mission.png") });

    await sweepSticks(page);
    await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "다시 하기" }).click();
    await expect(throwButton(page)).toBeVisible();
    await throwSticks(page);
    await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "다음", exact: true }).click();

    // 설명 둘(모두가 함께 정함, 겨냥할 수 없음) → 퀴즈 셋
    await expect(page.getByText("모두가 함께 정해요")).toBeVisible();
    await page.screenshot({ path: info.outputPath("yut-fair-seal.png") });
    for (let i = 0; i < 2; i++)
      await page.getByRole("button", { name: "다음", exact: true }).click();
    for (const answer of [
      "아무도 없다",
      "낙이 날지 말지",
      "그 던지기는 없던 일이 되고 더 던지지 못한다",
    ]) {
      await page.getByRole("button", { name: answer }).click();
      await expect(page.getByText("정답이에요!")).toBeVisible();
      await page.getByRole("button", { name: "다음", exact: true }).click();
    }
    await expect(page.getByText("단원 완료!")).toBeVisible();
  },
);

const stage = (page: Page) => page.locator(".yut-stage");
const mat = (page: Page) => page.locator("[data-toss]");

/** 지금 장면(throw 던지는 장면, move 말 옮기는 장면) */
async function sceneNow(page: Page): Promise<string | null> {
  return stage(page).getAttribute("data-scene");
}

/** 멍석 연출 상태(playing 구르는 중, done 멈춤, 2d 3D 없음) */
async function tossNow(page: Page): Promise<string | null> {
  return mat(page).getAttribute("data-toss");
}

/**
 * 3D 캔버스에 실제로 그려진 짚 멍석 빛 화소의 몫(0~1). WebGL 캔버스는 그린 뒤 버퍼를 읽을 수 없어,
 * 화면에 보이는 그대로 요소 스크린샷을 찍어 페이지 안에서 풀어 센다(빈 캔버스면 0에 가깝다)
 */
async function strawShare(page: Page): Promise<number> {
  const png = await page.locator("[data-toss-3d]").screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let straw = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, gr, b] = [
        d[i] as number,
        d[i + 1] as number,
        d[i + 2] as number,
      ];
      if (r > 150 && gr > 105 && b < 120 && r > b + 60) straw++;
    }
    return straw / (d.length / 4);
  }, png.toString("base64"));
}

test(
  "윷놀이 3D: 던진 윷이 멍석에서 구르다 하나씩 멈춘 뒤 말 옮기는 장면으로 바뀌고, 컴퓨터 윷은 그 자리에서 날아온다",
  { tag: "@no-phone-landscape" },
  async ({ page }, info) => {
    // 연출을 켜고 시계를 잡는다: 연출은 실제 시간으로 기다리지 않고 조건까지 시계를 감는다
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await page.goto("/yut");
    await speedUpAnimations(page);
    await startSolo(page);
    await expect(page.locator('[data-toss-3d="ready"]')).toBeVisible();
    expect(await sceneNow(page)).toBe("throw");
    await page.screenshot({ path: info.outputPath("yut-3d-ready.png") });

    // 컴퓨터가 먼저 던졌을 수 있다: 그 연출이 끝나 내 차례가 될 때까지 감는다
    await fastForwardUntil(page, () => throwButton(page).isVisible(), {
      step: 200,
    });
    const plays = () =>
      page.evaluate(
        () =>
          (window as unknown as { __yutToss?: { plays: number } }).__yutToss
            ?.plays ?? 0,
      );
    const playsBefore = await plays();
    await throwSticks(page);
    await fastForwardUntil(
      page,
      async () => (await tossNow(page)) === "playing",
      {
        step: 50,
      },
    );
    // 굴러가는 동안은 결과가 나왔어도 던지는 장면에 머물고 말을 고를 수 없다
    expect(await sceneNow(page)).toBe("throw");
    await expect(movableStacks(page)).toHaveCount(0);
    await page.clock.fastForward(350);
    await page.screenshot({ path: info.outputPath("yut-3d-flight.png") });
    await page.clock.fastForward(900);
    await page.screenshot({ path: info.outputPath("yut-3d-land.png") });
    // 내 윷이 다 멈출 때까지. 차례가 넘어가면 컴퓨터가 곧(약 70ms) 이어 던지므로 그보다 짧게 감는다
    await fastForwardUntil(page, async () => (await plays()) > playsBefore, {
      step: 50,
    });
    await expect(mat(page)).toHaveAttribute("data-toss", "done");
    const result = await page
      .locator("[data-throw-result]")
      .getAttribute("data-throw-result");
    expect(result).toMatch(/^(-1|[1-5]|nak)$/);
    // 멈춘 윷과 결과 글을 읽을 틈: 아직 던지는 장면이고, 결과 글은 멈춘 멍석·윷가락 위에 겹쳐 보인다
    expect(await sceneNow(page)).toBe("throw");
    await expect(page.locator("[data-toss-3d]")).toBeVisible();
    expect(
      await page
        .locator("[data-mat]")
        .evaluate((el) => getComputedStyle(el).opacity),
    ).toBe("1");
    // 빈 캔버스면 약 0.07, 멍석이 그려져 있으면 0.29~0.36(2026-11-17)
    expect(await strawShare(page)).toBeGreaterThan(0.15);
    await expect(status(page)).not.toHaveText("윷이 구르는 중…");
    await page.screenshot({ path: info.outputPath("yut-3d-done.png") });

    // 연출 한 번이 여러 장을 그렸다(그리기 시간은 시계를 잡아 여기서는 재지 않는다, docs/37 14-5)
    const stats = await page.evaluate(
      () =>
        (
          window as unknown as {
            __yutToss?: { plays: number; frames: number };
          }
        ).__yutToss,
    );
    expect(stats?.plays).toBe(playsBefore + 1);
    expect(stats?.frames).toBeGreaterThan(10);

    if (result === "4" || result === "5") {
      // 윷·모: 한 번 더 던지므로 던지는 장면에 그대로 머문다
      await fastForwardUntil(page, () => throwButton(page).isVisible(), {
        step: 100,
      });
      expect(await sceneNow(page)).toBe("throw");
      return;
    }
    // 낙이 아니면 모은 결과로 말을 옮긴다: 말 옮기는 장면으로 한 번 바뀐다.
    // 빽도인데 판에 내 말이 없으면 그 결과는 버려지고 차례가 넘어간다(장면도 그대로)
    const discarded =
      result === "-1" &&
      (await page.locator('[data-stack][data-side="0"]').count()) === 0;
    if (result !== "nak" && !discarded) {
      await fastForwardUntil(
        page,
        async () => (await sceneNow(page)) === "move",
        {
          step: 100,
        },
      );
      await animationsDone(stage(page));
      await page.screenshot({ path: info.outputPath("yut-3d-move.png") });
      await pickTarget(page, info.project.name.startsWith("phone"));
    }
    // 컴퓨터 차례: 그 자리(건너편)에서 윷이 날아온다. 그동안 던지는 장면이다.
    // 내 말이 컴퓨터 말을 잡았으면 내가 한 번 더 던진다(던지는 장면으로 돌아간다)
    await fastForwardUntil(
      page,
      async () =>
        (await tossNow(page)) === "playing" ||
        (await throwButton(page).isVisible()),
      { step: 100 },
    );
    expect(await sceneNow(page)).toBe("throw");
    if (await throwButton(page).isVisible()) return;
    await page.clock.fastForward(450);
    await page.screenshot({ path: info.outputPath("yut-3d-other.png") });
    await fastForwardUntil(page, async () => (await tossNow(page)) === "done", {
      step: 200,
    });
  },
);

test("윷놀이: WebGL이 없으면 멍석에 2D 윷가락으로 결과를 보인다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...rest: unknown[]
    ) {
      if (kind.startsWith("webgl")) return null;
      return (original as (...a: unknown[]) => unknown).call(
        this,
        kind,
        ...rest,
      );
    } as typeof original;
  });
  await page.goto("/yut");
  await startSolo(page);
  await expect(mat(page)).toHaveAttribute("data-toss", "2d");
  await throwSticks(page);
  await expect(
    page.locator("[data-throw-result]:not([data-throw-result=''])"),
  ).toBeVisible();
  await expect(page.locator("[data-toss-3d]")).toHaveCount(0);
});

test("윷놀이: 움직임 줄이기면 3D 없이 결과만 보이고 장면이 바로 바뀐다", {
  // 장면이 바뀌는 것은 휴대폰 세로뿐(PC·가로는 나란히 둔다)
  tag: "@only-phone-portrait",
}, async ({ page }) => {
  await page.goto("/yut");
  await startSolo(page);
  await expect(mat(page)).toHaveAttribute("data-toss", "2d");
  // 장면 전환에 시간을 쓰지 않는다
  const duration = await page
    .locator(".yut-board-layer")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe("0s");
  await throwSticks(page);
  await expect(
    page.locator("[data-throw-result]:not([data-throw-result=''])"),
  ).toBeVisible();
  await expect(page.locator("[data-toss-3d]")).toHaveCount(0);
});

/**
 * 결과 글(`data-throw-result`)이 새로 뜰 때마다 그 순간 사람 눈에 보였는지를 페이지 안에 적어 둔다.
 * 보였다 = 그 순간 던지는 장면(멍석이 큰 장면)이고 결과 글에 크기가 있다. 휴대폰 세로에서 말 옮기는 장면이면
 * 멍석 층이 투명해져(yut.css) 결과 글이 보이지 않는다. 투명도 값은 장면이 바뀌는 연출(0.7초) 중간값이라 쓰지 않고
 * 장면으로 판정한다. `toBeVisible`은 불투명도를 보지 않아, 결과가 나오자마자 멍석이 투명해지는 것을 잡지 못했다(2026-11-19)
 */
interface ShownResult {
  value: string;
  /** 그때 장면과 상태 줄(실패하면 어느 던지기였는지 알 수 있게) */
  scene: string;
  status: string;
  visible: boolean;
}

async function watchShownResults(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: ShownResult[] = [];
    (window as unknown as { __shownResults: typeof seen }).__shownResults =
      seen;
    /** 상태 줄에 뜬 글들(차례대로, 같은 글이 이어지면 한 번) */
    const statuses: string[] = [];
    (window as unknown as { __statuses: string[] }).__statuses = statuses;
    let last = "";
    const check = () => {
      const now = document.querySelector('[role="status"]')?.textContent ?? "";
      if (statuses.at(-1) !== now) statuses.push(now);
      const el = document.querySelector<HTMLElement>("[data-throw-result]");
      const value = el?.getAttribute("data-throw-result") ?? "";
      if (value === last) return;
      last = value;
      if (!el || value === "") return;
      const box = el.getBoundingClientRect();
      const scene = document
        .querySelector(".yut-stage")
        ?.getAttribute("data-scene");
      seen.push({
        value,
        scene: scene ?? "",
        status: document.querySelector('[role="status"]')?.textContent ?? "",
        visible: scene === "throw" && box.width > 0 && box.height > 0,
      });
    };
    new MutationObserver(check).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-throw-result", "data-scene", "data-toss"],
    });
    check();
  });
}

const seenStatuses = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __statuses: string[] }).__statuses,
  );

const shownResults = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __shownResults: ShownResult[];
        }
      ).__shownResults,
  );

/** WebGL 맥락을 만들지 못하는 기기(3D를 못 그림) */
async function blockWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...rest: unknown[]
    ) {
      if (kind.startsWith("webgl")) return null;
      return (original as (...a: unknown[]) => unknown).call(
        this,
        kind,
        ...rest,
      );
    } as typeof original;
  });
}

for (const [label, prepare] of [
  ["움직임 줄이기", async () => {}],
  [
    "WebGL 없음",
    async (page: Page) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await blockWebGL(page);
    },
  ],
] as const)
  test(
    `윷놀이 휴대폰(${label}): 3D 멍석이 없어도 내 윷과 컴퓨터 윷의 결과를 멍석 위에 보인 뒤 윷판 장면으로 바뀐다`,
    {
      // 장면이 같은 자리에서 바뀌는 것은 휴대폰 세로뿐이다(PC·가로는 멍석과 윷판을 나란히 둔다)
      tag: "@only-phone-portrait",
    },
    async ({ page }, info) => {
      await prepare(page);
      await page.goto("/yut");
      await startSolo(page);
      await expect(mat(page)).toHaveAttribute("data-toss", "2d");
      await watchShownResults(page);
      await untilMyThrow(page);
      await throwSticks(page);
      // 결과 글이 떠야 하고, 그동안은 던지는 장면이다
      await expect
        .poll(async () => (await shownResults(page)).length)
        .toBeGreaterThan(0);
      await page.screenshot({ path: info.outputPath("yut-2d-result.png") });
      // 컴퓨터가 던질 때까지 이어 둔다(내가 윷·모를 던지면 컴퓨터보다 내가 먼저 한 번 더 던진다).
      // 상태 줄도 결과를 알려야 한다(「윷이 구르는 중…」에 머물지 않는다)
      const computerSaw = async () =>
        (await seenStatuses(page)).some((s) => s.startsWith("컴퓨터의 윷: "));
      for (let i = 0; i < 10; i++) {
        await untilMyThrow(page);
        if (await computerSaw()) break;
        await throwSticks(page);
      }
      expect(await computerSaw()).toBe(true);
      const statuses = await seenStatuses(page);
      expect(statuses.some((s) => s.startsWith("내 윷: "))).toBe(true);
      const shown = await shownResults(page);
      expect(shown.length).toBeGreaterThan(1);
      expect(shown.filter((r) => !r.visible)).toEqual([]);
    },
  );

/** 지금 그려진 2D 윷가락 연출(`yut-toss`)마다 멈추는 때(ms, 던진 때부터 출발 지연 + 도는 시간) */
const stickRollEnds = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter(
        (a): a is CSSAnimation =>
          a instanceof CSSAnimation && a.animationName === "yut-toss",
      )
      .map((a) => {
        const t = a.effect?.getComputedTiming();
        return Math.round(Number(t?.delay ?? 0) + Number(t?.activeDuration));
      }),
  );

test("윷놀이 2D 윷가락: 네 가락 모두 결과 면을 보이는 때(FLAT_ROLL_MS)에 멈춘다", {
  // 연출 길이는 화면 크기와 상관없다
  tag: "@only-phone-portrait",
}, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await blockWebGL(page);
  await page.goto("/yut");
  await startSolo(page);
  await expect(mat(page)).toHaveAttribute("data-toss", "2d");
  await untilMyThrow(page);
  await throwSticks(page);
  // 채움(both)이 있어 끝난 연출도 남는다. 결과 면은 FLAT_ROLL_MS에 보이므로 그보다 늦게 도는 가락이 없어야 한다
  await expect.poll(() => stickRollEnds(page)).toHaveLength(4);
  expect(await stickRollEnds(page)).toEqual(Array(4).fill(FLAT_ROLL_MS));
});

test(
  "윷놀이 휴대폰: 구르는 도중 3D 문맥을 잃으면 2D 윷가락으로 결과를 보이고 다음 화면으로 간다",
  {
    tag: "@only-phone-portrait",
  },
  async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await page.goto("/yut");
    await speedUpAnimations(page);
    await startSolo(page);
    await expect(page.locator('[data-toss-3d="ready"]')).toBeVisible();
    await fastForwardUntil(page, () => throwButton(page).isVisible(), {
      step: 200,
    });
    await watchShownResults(page);
    await throwSticks(page);
    await fastForwardUntil(
      page,
      async () => (await tossNow(page)) === "playing",
      {
        step: 50,
      },
    );
    // 휴대폰이 화면 뒤로 갔다 오거나 GPU가 바빠 그리기 맥락을 잃는다
    await page.evaluate(() => {
      const canvas =
        document.querySelector<HTMLCanvasElement>("[data-toss-3d]");
      canvas
        ?.getContext("webgl2")
        ?.getExtension("WEBGL_lose_context")
        ?.loseContext();
    });
    await expect(mat(page)).toHaveAttribute("data-toss", "2d");
    // 연출이 끝나지 않는 9초 안전장치를 기다리지 않는다: 2D로 굴린 뒤 결과를 알린다
    await fastForwardUntil(
      page,
      async () => /^내 윷: /.test((await status(page).textContent()) ?? ""),
      { step: 100, timeout: 10_000 },
    );
    expect(await sceneNow(page)).toBe("throw");
    await page.screenshot({ path: info.outputPath("yut-lost-result.png") });
    // 지켜보기 전에 떠 있던 앞 결과(컴퓨터가 먼저 던짐)와 2D로 바뀌며 다시 그린 결과도 함께 적힌다
    const shown = await shownResults(page);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.filter((r) => !r.visible)).toEqual([]);
  },
);

test("윷놀이 다시 보기(휴대폰, 3D 없음): 한 걸음 앞으로 가 새 던지기가 나오면 멍석 위에 결과를 보인다", {
  tag: "@only-phone-portrait",
}, async ({ page }) => {
  await leaveOneGame(page);
  await page.goto("/review");
  await page.getByRole("button", { name: /🪵 윷놀이 · 혼자/ }).click();
  await expect(page.locator("[data-yut-board]")).toBeVisible();
  await expect(mat(page)).toHaveAttribute("data-toss", "2d");
  await page.getByRole("button", { name: "처음" }).click();
  await watchShownResults(page);
  for (let i = 0; i < 12; i++) {
    await stepForward(page);
    // 결과를 보인 뒤(던지는 장면이 끝나면) 다음 걸음으로
    await expect(stage(page)).not.toHaveAttribute("data-replay-toss");
  }
  const shown = await shownResults(page);
  expect(shown.length).toBeGreaterThan(1);
  expect(shown.filter((r) => !r.visible)).toEqual([]);
});

/** 입문 컴퓨터와 몇 수 두다 기권해 복기 기록 하나를 남긴다(연출 없이 빠르게) */
async function leaveOneGame(page: Page): Promise<void> {
  await page.goto("/yut");
  await startSolo(page);
  for (let i = 0; i < 4; i++) await playStep(page, false);
  await untilMyThrow(page);
  await page.getByRole("button", { name: "기권" }).click();
  await page.getByRole("button", { name: "기권하기" }).click();
  await expect
    .poll(() => page.evaluate(finishedYutGames), { intervals: [50] })
    .toBe(1);
}

/** 연출을 켜고 시계를 잡은 새 탭에서 복기 목록의 윷놀이 기록을 연다 */
async function openReplay(page: Page): Promise<Page> {
  const review = await page.context().newPage();
  await review.addInitScript(() =>
    sessionStorage.setItem("mighty-splash-seen", "1"),
  );
  await review.emulateMedia({ reducedMotion: "no-preference" });
  await review.clock.install();
  await review.goto("/review");
  // 숨은 탭이면 멍석이 그리지 않는다(대국을 둔 탭은 닫는다)
  await page.close();
  await review.bringToFront();
  expect(await review.evaluate(() => document.hidden)).toBe(false);
  await speedUpAnimations(review);
  await review.getByRole("button", { name: /🪵 윷놀이 · 혼자/ }).click();
  await expect(review.locator("[data-yut-board]")).toBeVisible();
  return review;
}

/** 다시 보기 걸음 글(「던지기 n번 · 걸음/끝」) */
const replayStatus = (page: Page) =>
  page.getByRole("status").filter({ hasText: /던지기 \d+번 · \d+\// });

/** 이 탭에서 3D 멍석이 굴린 횟수 */
const tossPlays = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __yutToss?: { plays: number } }).__yutToss
        ?.plays ?? 0,
  );

/** 한 걸음씩 앞으로 가다 멍석이 굴리기 시작하면 멈춘다 */
async function stepUntilToss(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await stepForward(page);
    if ((await stage(page).getAttribute("data-replay-toss")) !== null) {
      await expect(mat(page)).toHaveAttribute("data-toss", "playing");
      return;
    }
  }
  throw new Error("다시 보기에서 던지기 결과가 나오지 않는다");
}

/** 다시 보기 한 걸음 앞으로(그 걸음이 화면에 그려질 때까지) */
async function stepForward(page: Page): Promise<void> {
  const before = Number(await stage(page).getAttribute("data-replay-step"));
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(stage(page)).toHaveAttribute(
    "data-replay-step",
    String(before + 1),
  );
}

test(
  "윷놀이 다시 보기: 한 걸음 앞으로 가면 그 던지기를 3D 멍석에 굴리고, 건너뛰거나 뒤로 가면 멈춘 모습만 보인다",
  { tag: "@no-phone-landscape" },
  async ({ page }, info) => {
    await leaveOneGame(page);
    const review = await openReplay(page);
    await expect(review.locator("[data-toss-3d]")).toHaveAttribute(
      "data-toss-3d",
      "ready",
    );
    // 끝 걸음으로 연다: 마지막 던지기가 멈춘 모습, 굴린 적 없음
    await expect(mat(review)).toHaveAttribute("data-toss", "done");
    expect(await tossPlays(review)).toBe(0);

    // 처음으로 건너뛰기: 연출 없음(장면도 바로 바뀐다), 아직 던지기가 없다
    await review.getByRole("button", { name: "처음" }).click();
    await expect(mat(review)).toHaveAttribute("data-toss", "idle");
    await expect(stage(review)).toHaveAttribute("data-instant", "");

    // 한 걸음씩 앞으로: 던지기 결과가 나온 걸음에서 굴린다. 그동안 던지는 장면에 머문다
    await stepUntilToss(review);
    expect(await sceneNow(review)).toBe("throw");
    expect(await stage(review).getAttribute("data-instant")).toBeNull();
    await review.clock.fastForward(350);
    await review.screenshot({ path: info.outputPath("yut-replay-flight.png") });
    await fastForwardUntil(review, async () => (await tossPlays(review)) > 0, {
      step: 50,
    });
    await expect(mat(review)).toHaveAttribute("data-toss", "done");
    await expect(
      review.locator("[data-throw-result]:not([data-throw-result=''])"),
    ).toBeVisible();
    expect(await sceneNow(review)).toBe("throw");
    // 빈 캔버스면 약 0.07, 멍석이 그려져 있으면 0.29~0.36
    expect(await strawShare(review)).toBeGreaterThan(0.15);
    await review.screenshot({ path: info.outputPath("yut-replay-done.png") });
    // 결과 글을 읽을 틈 뒤에는 그 걸음의 장면으로(말을 옮길 차례면 말 옮기는 장면)
    await review.clock.fastForward(1000);
    await animationsDone(stage(review));
    await review.screenshot({ path: info.outputPath("yut-replay-after.png") });

    // 한 걸음 뒤로: 굴리지 않는다. 다시 한 걸음 앞으로 오면 같은 던지기를 다시 굴린다
    const at = Number(await stage(review).getAttribute("data-replay-step"));
    await review.getByRole("button", { name: "한 수 뒤로" }).click();
    await expect(stage(review)).toHaveAttribute(
      "data-replay-step",
      String(at - 1),
    );
    await expect(stage(review)).toHaveAttribute("data-instant", "");
    await expect(stage(review)).not.toHaveAttribute("data-replay-toss");
    await expect(mat(review)).not.toHaveAttribute("data-toss", "playing");
    await stepForward(review);
    await expect(stage(review)).toHaveAttribute("data-replay-toss", "");
    await expect(mat(review)).toHaveAttribute("data-toss", "playing");
    expect(await sceneNow(review)).toBe("throw");
    await fastForwardUntil(review, async () => (await tossPlays(review)) > 1, {
      step: 50,
    });

    // 끝으로 건너뛰기: 굴리지 않고 마지막 던지기가 멈춘 모습만
    await review.getByRole("button", { name: "끝" }).click();
    await expect(stage(review)).toHaveAttribute("data-instant", "");
    await expect(stage(review)).not.toHaveAttribute("data-replay-toss");
    await expect(mat(review)).toHaveAttribute("data-toss", "done");
    await review.clock.fastForward(3000);
    expect(await tossPlays(review)).toBe(2);
  },
);

test("윷놀이 다시 보기: 자동 재생은 던지기 연출이 끝나고 결과를 보인 뒤에 다음 걸음으로 간다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await leaveOneGame(page);
  const review = await openReplay(page);
  await expect(review.locator("[data-toss-3d]")).toHaveAttribute(
    "data-toss-3d",
    "ready",
  );
  await review.getByRole("button", { name: "처음" }).click();
  await review.getByRole("button", { name: "자동 재생" }).click();
  await fastForwardUntil(
    review,
    async () => (await tossNow(review)) === "playing",
    { step: 100 },
  );
  const during = (await replayStatus(review).textContent()) ?? "";
  // 구르는 동안은 자동 재생 간격(0.7초)이 지나도 다음 걸음으로 가지 않는다
  await review.clock.fastForward(800);
  await expect(replayStatus(review)).toHaveText(during);
  await fastForwardUntil(review, async () => (await tossPlays(review)) > 0, {
    step: 50,
  });
  await expect(replayStatus(review)).toHaveText(during);
  // 결과를 보인 뒤 다음 걸음으로
  await fastForwardUntil(
    review,
    async () => (await replayStatus(review).textContent()) !== during,
    { step: 100 },
  );
  await review.getByRole("button", { name: "⏸ 멈춤" }).click();
});

test("윷놀이 다시 보기: 몸짓이 없는 옛 기록(규칙 판 1)은 3D 없이 2D 윷가락으로 보인다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  const decoded = decodeYutRules(legacy.rules);
  if (!decoded.ok) throw new Error(decoded.reason);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/review");
  // 2026-11-17 전 엔진으로 만든 판을 복기 기록에 넣는다
  await page.evaluate(
    (archive) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("mighty-review", 1);
        open.onupgradeneeded = () =>
          open.result.createObjectStore("games", { keyPath: "id" });
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("games", "readwrite");
          tx.objectStore("games").put(archive);
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    {
      id: `solo:${legacy.seed}`,
      game: "yut",
      mode: "solo",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      rules: decoded.rules,
      seed: legacy.seed,
      log: legacy.log,
      seat: 0,
      seatNames: null,
      rounds: 1,
      over: true,
    },
  );
  await page.reload();
  await page.getByRole("button", { name: /🪵 윷놀이 · 혼자/ }).click();
  await expect(page.locator("[data-yut-board]")).toBeVisible();
  await expect(mat(page)).toHaveAttribute("data-toss", "2d");
  await page.getByRole("button", { name: "처음" }).click();
  for (let i = 0; i < 12; i++)
    await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(mat(page)).toHaveAttribute("data-toss", "2d");
  await expect(page.locator("[data-toss-3d]")).toHaveCount(0);
});
