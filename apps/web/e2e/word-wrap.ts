import type { Locator } from "@playwright/test";

/**
 * 요소의 글이 화면에서 어떻게 줄 바뀌었는지 줄마다 글로 돌려준다.
 * 글자마다 Range로 자리(getClientRects)를 재서, 윗변이 앞 글자보다 아래로 내려간 글자에서 새 줄로 본다.
 * 한국어는 CSS 기본이 글자 단위 줄바꿈이라 「끝내기를 잘 골랐어 / 요!」처럼 낱말 중간에서 끊길 수 있다.
 */
export function renderedLines(locator: Locator): Promise<string[]> {
  return locator.evaluate((el) => {
    const lines: string[] = [];
    let line = "";
    let top: number | null = null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (let i = 0; i < text.length; i++) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getClientRects()[0];
        // 줄 끝 띄어쓰기는 너비 없는 상자가 되거나 사라진다. 자리 없는 글자는 지금 줄에 붙인다
        if (!rect || rect.width === 0) {
          line += text[i];
          continue;
        }
        if (top !== null && rect.top > top + rect.height / 2) {
          lines.push(line);
          line = "";
        }
        top = rect.top;
        line += text[i];
      }
    }
    lines.push(line);
    return lines.map((l) => l.trim()).filter((l) => l.length > 0);
  });
}

/**
 * 줄이 낱말(띄어쓰기) 경계에서만 바뀌었는지 본다: 줄마다 이어 붙이면 띄어쓰기로 나눈 낱말 목록과 같아야 한다.
 * 실패하면 화면 줄과 낱말을 함께 보여 어디서 끊겼는지 알 수 있다.
 */
export async function linesBreakAtSpaces(locator: Locator) {
  const lines = await renderedLines(locator);
  const words = (await locator.innerText()).split(/\s+/).filter(Boolean);
  const lineWords = lines.flatMap((l) => l.split(/\s+/).filter(Boolean));
  return { lines, words, lineWords };
}
