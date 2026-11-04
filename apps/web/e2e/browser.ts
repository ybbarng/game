/**
 * 화면 시험이 띄우는 브라우저(2026-11-04 사내 보안 공지).
 * Playwright 1.64.x에 들어 있는 Chromium·headless shell(156.0.8078.4)은 CVE-2026-118306·118331·118348·118344로
 * 취약하다. 그래서 번들 브라우저를 받지 않고, 패치된 시스템 Chrome(`channel: "chrome"`)만 샌드박스를 켜서 띄운다.
 * 실행이 실패해도 샌드박스를 끄지 않는다.
 */
export const BROWSER = {
  channel: "chrome",
  launchOptions: { chromiumSandbox: true },
} as const;

/** 위 CVE가 고쳐진 가장 낮은 Chrome 버전. 이보다 낮으면 시험을 시작하지 않는다 */
export const MIN_CHROME = "156.0.8078.73";

/** 점으로 나눈 버전 비교: a가 b보다 낮으면 음수 */
export function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
