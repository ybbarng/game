import type { Page } from "@playwright/test";

/**
 * 컴퓨터가 생각하는 동안 화면이 멈추지 않는지 본다(컴퓨터 수는 웹 워커에서 센다, docs/26).
 * CPU를 느리게 해(CDP, Chromium만) 휴대폰처럼 만들고, requestAnimationFrame 사이 가장 긴 간격을 잰다
 */
export async function slowCpu(page: Page, rate = 4): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
}

interface FrameWatch {
  max: number;
  last: number;
  start: number;
  stopped: boolean;
}

/** 프레임 간격을 재기 시작한다 */
export async function watchFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const now = performance.now();
    const watch: FrameWatch = { max: 0, last: now, start: now, stopped: false };
    (window as unknown as { __frames: FrameWatch }).__frames = watch;
    const tick = (t: number) => {
      if (watch.stopped) return;
      watch.max = Math.max(watch.max, t - watch.last);
      watch.last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** 재기를 멈추고 가장 긴 프레임 간격과 잰 시간(ms)을 돌려준다 */
export async function stopFrames(
  page: Page,
): Promise<{ maxGap: number; span: number }> {
  return page.evaluate(() => {
    const watch = (window as unknown as { __frames: FrameWatch }).__frames;
    watch.stopped = true;
    return {
      maxGap: Math.round(watch.max),
      span: Math.round(performance.now() - watch.start),
    };
  });
}
