import { chromium } from "@playwright/test";
import { BROWSER, compareVersion, MIN_CHROME } from "./browser";

/** 시험 전에 실제로 뜨는 브라우저 버전을 확인한다. 취약한 버전이면 시험 전체를 실패시킨다 */
export default async function globalSetup() {
  const browser = await chromium.launch({
    channel: BROWSER.channel,
    ...BROWSER.launchOptions,
  });
  const version = browser.version();
  await browser.close();
  console.log(`[e2e] 브라우저: Chrome ${version} (${BROWSER.channel})`);
  if (compareVersion(version, MIN_CHROME) < 0) {
    throw new Error(
      `Chrome ${version}은 보안 수정 전 버전이다. ${MIN_CHROME} 이상으로 올려야 한다`,
    );
  }
}
