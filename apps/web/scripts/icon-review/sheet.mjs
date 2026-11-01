// 별 따기 아이콘 비교 그림. render.review.tsx가 뽑은 PNG를 HTML로 늘어놓고 Playwright로 찍는다.
//   node scripts/icon-review/sheet.mjs <PNG 폴더> <결과 폴더>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [, , SRC, OUT] = process.argv;
if (!SRC || !OUT) throw new Error("사용법: sheet.mjs <PNG 폴더> <결과 폴더>");

const img = (name) =>
  `data:image/png;base64,${readFileSync(join(SRC, `${name}.png`)).toString("base64")}`;

const CANDS = [
  { id: "now", label: "지금" },
  { id: "a", label: "A 다듬기" },
  { id: "b", label: "B 고른 별" },
  { id: "c", label: "C 직인" },
];
const OTHERS = [
  ["omok", "오목"],
  ["janggi", "장기"],
  ["chess", "체스"],
  ["baduk", "바둑"],
  ["mighty", "마이티"],
  ["hearts", "하트"],
  ["gostop", "고스톱"],
  ["minhwatu", "민화투"],
  ["nyrongppong", "나이롱뽕"],
  ["baseball", "숫자야구"],
  ["yut", "윷놀이"],
];

const BASE = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, "Apple SD Gothic Neo", sans-serif; background: #0b1020; color: #e5e7eb; padding: 24px; width: max-content; }
  h2 { font-size: 18px; margin: 0 0 12px; }
  .px { image-rendering: pixelated; }
  .lab { font-size: 13px; color: #94a3b8; }
`;

async function shot(page, html, file) {
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>${BASE}</style>${html}`,
  );
  await page.locator("body").screenshot({ path: join(OUT, file) });
  console.log("wrote", file);
}

function sizesTable() {
  const head = `<tr><th></th>
    <th>16px 실제</th><th>16px 8배</th><th>32px 실제</th><th>32px 4배</th>
    <th>목록 카드(64px)</th><th>iOS 홈(180px)</th><th>밝은 탭 16·32</th></tr>`;
  const rows = CANDS.map(
    (c) => `<tr>
      <td class="name">${c.label}</td>
      <td><img src="${img(`${c.id}-16`)}" width="16" height="16"></td>
      <td><img class="px" src="${img(`${c.id}-16`)}" width="128" height="128"></td>
      <td><img src="${img(`${c.id}-32`)}" width="32" height="32"></td>
      <td><img class="px" src="${img(`${c.id}-32`)}" width="128" height="128"></td>
      <td><img src="${img(`${c.id}-128`)}" width="64" height="64" style="border-radius:16px"></td>
      <td><img src="${img(`${c.id}-apple-180`)}" width="90" height="90" style="border-radius:20px"></td>
      <td class="light"><img src="${img(`${c.id}-16`)}" width="16" height="16"> &nbsp; <img src="${img(`${c.id}-32`)}" width="32" height="32"></td>
    </tr>`,
  ).join("");
  return `<style>
    table { border-collapse: separate; border-spacing: 18px 14px; }
    th { font-size: 13px; color: #94a3b8; font-weight: 500; }
    td { text-align: center; vertical-align: middle; }
    .name { font-weight: 700; font-size: 16px; text-align: left; }
    .light { background: #f1f3f6; border-radius: 8px; padding: 12px; }
  </style><h2>하늘의 별 따기 아이콘: 크기별 비교</h2><table>${head}${rows}</table>`;
}

function lineup() {
  const row = (c) => `
    <div class="row">
      <div class="name">${c.label}</div>
      ${OTHERS.map(
        ([g, n]) =>
          `<figure><img src="${img(`other-${g}-128`)}" width="64" height="64"><figcaption>${n}</figcaption></figure>`,
      ).join("")}
      <figure class="me"><img src="${img(`${c.id}-128`)}" width="64" height="64"><figcaption>별 따기</figcaption></figure>
    </div>
    <div class="row tabs">
      <div class="name"></div>
      ${OTHERS.map(([g]) => `<span class="tab"><img src="${img(`other-${g}-32`)}" width="16" height="16"></span>`).join("")}
      <span class="tab me"><img src="${img(`${c.id}-32`)}" width="16" height="16"></span>
      <span class="gap"></span>
      ${OTHERS.map(([g]) => `<span class="tab light"><img src="${img(`other-${g}-32`)}" width="16" height="16"></span>`).join("")}
      <span class="tab light me"><img src="${img(`${c.id}-32`)}" width="16" height="16"></span>
    </div>`;
  return `<style>
    .row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .tabs { margin-bottom: 26px; }
    .name { width: 90px; font-weight: 700; }
    figure { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px; border-radius: 12px; }
    figure img { border-radius: 16px; }
    figure.me { background: rgba(242,193,78,0.15); outline: 1px solid rgba(242,193,78,0.5); }
    figcaption { font-size: 11px; color: #94a3b8; }
    .tab { display: inline-flex; padding: 6px 8px; background: #1f2937; border-radius: 6px 6px 0 0; }
    .tab.light { background: #e5e7eb; }
    .tab.me { outline: 1px solid rgba(242,193,78,0.8); }
    .gap { width: 24px; }
  </style><h2>다른 게임 아이콘과 나란히(목록 64px, 탭 16px 어두운·밝은)</h2>${CANDS.map(row).join("")}`;
}

function homeCards() {
  const card = (src, name, en, tag, who, me) => `
    <a class="card${me ? " me" : ""}">
      <img src="${src}" width="64" height="64">
      <span class="t"><b>${name} <small>${en}</small></b><span>${tag}</span><em>${who}</em></span>
    </a>`;
  const col = (c) => `
    <div class="col"><h3>${c.label}</h3>
      ${card(img("other-baseball-128"), "숫자야구", "Bulls and Cows", "세 자리 숫자를 먼저 맞히는 사람이 이긴다", "2명")}
      ${card(img(`${c.id}-128`), "하늘의 별 따기", "Stardraw", "로또 1등과 하늘의 별 따기, 어느 게 더 쉬울까요?", "누구나", true)}
      ${card(img("other-yut-128"), "윷놀이", "Yut", "윷가락을 던져 말을 몰고, 업고, 잡는다", "2~4명")}
    </div>`;
  return `<style>
    body { background: radial-gradient(ellipse at top, #1e293b 0%, #020617 70%); }
    .cols { display: grid; grid-template-columns: repeat(4, 340px); gap: 18px; }
    h3 { font-size: 14px; margin-bottom: 8px; color: #cbd5e1; }
    .col { display: flex; flex-direction: column; gap: 10px; }
    .card { display: flex; gap: 14px; align-items: center; padding: 14px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; }
    .card.me { border-color: rgba(255,255,255,0.3); }
    .card img { border-radius: 16px; flex-shrink: 0; }
    .t { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: rgba(255,255,255,0.7); word-break: keep-all; }
    .t b { font-size: 16px; color: #fff; }
    .t small { font-weight: 400; font-size: 12px; color: rgba(255,255,255,0.5); }
    .t em { font-style: normal; font-size: 11px; color: rgba(255,255,255,0.5); }
  </style><h2>게임 목록 카드에서(첫 화면 그대로)</h2><div class="cols">${CANDS.map(col).join("")}</div>`;
}

function shares() {
  return `<style>.g { display: grid; grid-template-columns: repeat(2, 600px); gap: 16px; } figure{display:flex;flex-direction:column;gap:6px} img{border-radius:10px}</style>
    <h2>공유 미리보기(1200×630을 반으로)</h2>
    <div class="g">${CANDS.map((c) => `<figure><span class="lab">${c.label}</span><img src="${img(`${c.id}-share`)}" width="600" height="315"></figure>`).join("")}</div>`;
}

function now() {
  return `<style>.r{display:flex;gap:24px;align-items:end} figure{display:flex;flex-direction:column;gap:6px;align-items:center}</style>
    <h2>지금 아이콘(apps/web/src/stardraw/icon-art.tsx)</h2>
    <div class="r">
      <figure><img src="${img("now-16")}" width="16"><span class="lab">16</span></figure>
      <figure><img class="px" src="${img("now-16")}" width="128"><span class="lab">16 (8배)</span></figure>
      <figure><img src="${img("now-32")}" width="32"><span class="lab">32</span></figure>
      <figure><img class="px" src="${img("now-32")}" width="128"><span class="lab">32 (4배)</span></figure>
      <figure><img src="${img("now-128")}" width="64" style="border-radius:16px"><span class="lab">목록 카드 64</span></figure>
      <figure><img src="${img("now-apple-180")}" width="180"><span class="lab">iOS 홈 180</span></figure>
      <figure><img src="${img("now-share")}" width="480"><span class="lab">공유 미리보기</span></figure>
    </div>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({
  deviceScaleFactor: 2,
  viewport: { width: 1600, height: 900 },
});
await shot(page, now(), "icon-now.png");
await shot(page, sizesTable(), "icon-sizes.png");
await shot(page, lineup(), "icon-lineup.png");
await shot(page, homeCards(), "icon-home-cards.png");
await shot(page, shares(), "icon-share.png");
await browser.close();
