/**
 * 정식 전환 리허설의 화면 확인(docs/36 11-32). `rehearsal.js --screens`로 띄운 리허설 서버(8855)와,
 * 그 서버 주소를 넣어 빌드한 화면(4855)을 Playwright Chromium(휴대폰 세로)으로 열고, 시계를 함께 옮기며
 * 경계 전후의 첫 화면(카운트다운)·영수증(「추첨 보러 가기」)·회차 방·마감 안내를 찍는다.
 * 화면의 시계는 page.clock으로 서버의 가짜 시각에 맞춘다(둘 다 실제 시간으로 흐르고, 건너뛸 때 함께 옮긴다).
 * 「열어 둔 탭」은 경계 전에 열어 두고 다시 읽지 않은 채 시계만 옮겨, 오래 열린 탭이 새 일정을 따라가는지 본다.
 *
 * 준비:
 *   NEXT_PUBLIC_STARDRAW_API=http://localhost:8855/stardraw-api nice -n 15 pnpm --filter @mighty/web build
 *   (apps/web) nice -n 15 pnpm exec serve out -l 4855 --no-port-switching
 *   nice -n 15 node apps/stardraw-server/dist/bench/rehearsal.js --work <빈 폴더> --screens
 * 실행: nice -n 15 node apps/stardraw-server/bench/rehearsal-screens.mjs --out <스크린숏 폴더>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const { chromium } = await import(
  pathToFileURL(join(repo, "apps/web/node_modules/@playwright/test/index.mjs"))
    .href
);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const out = resolve(arg("out", "rehearsal-shots"));
const SERVER = arg("server", "http://localhost:8855");
const WEB = arg("web", "http://localhost:4855");
mkdirSync(out, { recursive: true });

const notes = [];
const note = (m) => {
  notes.push(m);
  console.log(m);
};

async function ctl(path, body = {}) {
  const res = await fetch(`${SERVER}/rehearsal/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(json)}`);
  return json;
}
const times = (round) => ctl("times", { round });
const kst = (s) => new Date((s + 9 * 3600) * 1000).toISOString().slice(11, 19);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
});
const pages = [];
async function openPage() {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
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
  const now = (await ctl("info")).now;
  await page.clock.install({ time: now * 1000 });
  pages.push(page);
  return page;
}

/** 서버 시계를 옮기고 열린 화면의 시계도 같이(타이머를 불러 화면이 따라오게) */
async function jump(to) {
  const before = (await ctl("info")).now;
  const info = await ctl("jump", { to });
  for (const p of pages)
    await p.clock.fastForward((info.now - before) * 1000).catch(() => {});
  return info;
}

let n = 0;
async function shot(page, name) {
  n++;
  const file = join(out, `rehearsal-${String(n).padStart(2, "0")}-${name}.png`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file });
  const info = await ctl("info");
  note(
    `${file} · 서버 ${info.nowKst} · ${info.label.label}(사슬 ${info.round})`,
  );
}

async function enterViaUi(page, first) {
  if (first) {
    await page.goto(`${WEB}/stardraw`);
    await page
      .getByRole("button", { name: "우주인 등록", exact: true })
      .click();
    await page
      .locator("[aria-label='신청서 제출'][aria-disabled='false']")
      .press("Enter", { timeout: 60_000 });
    await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  } else {
    await page.goto(`${WEB}/stardraw/enter`);
  }
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "응모하기", exact: true }).click();
  await page
    .locator("[aria-label='용지 제출'][aria-disabled='false']")
    .press("Enter", { timeout: 60_000 });
  await page
    .locator("[aria-label='신분증 제출'][aria-disabled='false']")
    .press("Enter", { timeout: 60_000 });
  await page.locator("[data-receipt]").first().waitFor({ timeout: 120_000 });
}

/** 회차 r의 응모가 열린 직후(앞 회차 추첨 + 연출 뒤) */
async function toOpen(r) {
  const prev = await times(r - 1);
  return jump(prev.drawAt + 90);
}

const page = await openPage();
try {
  let info = await ctl("info");
  note(
    `시작: ${info.nowKst} ${info.label.label}(사슬 ${info.round}), ${kst(info.opensAt)}~${kst(info.closesAt)}`,
  );
  // 지금 회차가 막 열린 때로(앞 회차 추첨 연출 뒤)
  info = await toOpen(info.round + 1);
  await page.goto(`${WEB}/stardraw`);
  await shot(page, "시험20분-첫화면");
  await enterViaUi(page, true);
  await shot(page, "시험20분-영수증");

  const boundaries = [
    { length: 3600, phase: "trial", name: "시험1시간" },
    { length: 3600, phase: "live", name: "정식1시간" },
    { length: 7200, phase: "live", name: "정식2시간" },
  ];
  for (const b of boundaries) {
    const res = await ctl("schedule", { length: b.length, phase: b.phase });
    const B = res.change.fromRound;
    note(
      `예약: ${res.cmd} → 사슬 ${B}회차부터(${res.decidedIn}회차 기록에 실림)`,
    );
    // 예약이 실린 뒤(예고 중)
    const decided = await times(res.decidedIn);
    await jump(decided.drawAt + 90);
    await page.goto(`${WEB}/stardraw`);
    await shot(page, `${b.name}-예고중-첫화면`);
    // 경계 직전 회차(B-1)에 응모, 그 화면을 열어 둔 채로 둔다
    await toOpen(B - 1);
    await enterViaUi(page, false);
    await shot(page, `${b.name}-경계직전-영수증`);
    const stale = await openPage();
    await stale.goto(`${WEB}/stardraw`);
    await shot(stale, `${b.name}-경계직전-첫화면(열어둘탭)`);
    // 직전 회차 마감 1분 전: 마감 안내
    const last = await times(B - 1);
    await jump(last.entryDeadline - 40);
    await page.goto(`${WEB}/stardraw/enter`);
    await shot(page, `${b.name}-경계직전-마감안내`);
    // 마감 직후~추첨 전: 새 일정 첫 회차가 열렸지만 앞 회차 추첨 전
    await jump(last.closesAt + 20);
    await page.goto(`${WEB}/stardraw`);
    await shot(page, `${b.name}-마감직후-첫화면`);
    await shot(stale, `${b.name}-마감직후-열어둔탭`);
    // 새 일정 첫 회차가 열리고 응모
    await toOpen(B);
    const t = await times(B);
    note(
      `사슬 ${B}회차(${t.label}): ${kst(t.opensAt)}~${kst(t.closesAt)}, 추첨 ${kst(t.drawAt)}, 길이 ${t.length / 60}분`,
    );
    await shot(stale, `${b.name}-첫회차-열어둔탭`);
    await page.goto(`${WEB}/stardraw`);
    await shot(page, `${b.name}-첫회차-첫화면`);
    await enterViaUi(page, false);
    await shot(page, `${b.name}-첫회차-영수증`);
    const go = page.getByRole("button", { name: "추첨 보러 가기" });
    if (await go.count()) {
      await go.first().click();
      await shot(page, `${b.name}-첫회차-추첨보러가기`);
    } else note(`${b.name}: 「추첨 보러 가기」가 보이지 않음`);
    // 첫 회차 마감 1분 전(1시간·2시간 회차의 끝에서 마감 안내)
    await jump(t.entryDeadline - 40);
    await page.goto(`${WEB}/stardraw/enter`);
    await shot(page, `${b.name}-첫회차-마감안내`);
    await stale.close();
    pages.splice(pages.indexOf(stale), 1);
  }
} finally {
  writeFileSync(join(out, "rehearsal-screens.txt"), `${notes.join("\n")}\n`);
  await browser.close();
}
