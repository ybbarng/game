/*
 * 휴대폰에서 입력 칸을 누르면 iOS Safari는 글자가 16px보다 작은 칸에 맞춰 화면을 키운다(돌아오지 않는다).
 * 글자를 치는 칸(input·textarea)은 휴대폰 폭에서 16px 이상이어야 한다: `text-base sm:text-…`, `max-sm:text-base`,
 * 또는 공통 `INPUT_TEXT`(components/online-room.tsx). 체크 상자·라디오·슬라이더처럼 글자를 치지 않는 칸은 뺀다.
 */
import { describe, expect, it } from "vitest";

const FILES: Record<string, string> = import.meta.glob(
  ["./**/*.tsx", "!./**/*.test.tsx"],
  { query: "?raw", import: "default", eager: true },
);

const NOT_TYPED = new Set([
  "checkbox",
  "radio",
  "range",
  "file",
  "color",
  "hidden",
]);

/** 휴대폰 폭에서 16px 이상인 글자 크기 */
const PHONE_16 =
  /(^|[\s"'`])(text-base|max-sm:text-base|text-lg|text-xl|text-2xl|text-3xl)(?=[\s"'`]|$)|INPUT_TEXT/;

/** 글자를 치는 칸 가운데 휴대폰에서 16px보다 작을 수 있는 것 */
export function smallInputs(files: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [file, src] of Object.entries(files)) {
    const re = /<(input|textarea)\b([\s\S]*?)(\/>|<\/textarea>)/g;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      const attrs = m[2] ?? "";
      const type = /\btype="([^"]+)"/.exec(attrs)?.[1] ?? "text";
      if (NOT_TYPED.has(type)) continue;
      const cls =
        /className=(\{[\s\S]*?\)\}|\{[^}]*\}|"[^"]*")/.exec(attrs)?.[1] ?? "";
      if (PHONE_16.test(cls)) continue;
      out.push(`${file}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  return out;
}

describe("글자를 치는 입력 칸은 휴대폰에서 16px 이상이다(iOS 확대 막기)", () => {
  it("웹 화면 전체", () => {
    expect(Object.keys(FILES).length).toBeGreaterThan(300);
    expect(smallInputs(FILES)).toEqual([]);
  });

  it("점검이 작은 칸을 잡고 체크 상자·16px 칸은 잡지 않는다", () => {
    const src = [
      '<input value={a} onChange={(e) => setA(e.target.value)} className="px-2 text-sm" />',
      '<textarea value={b} className="p-2 text-xs"></textarea>',
      '<input type="checkbox" className="size-4" />',
      '<input value={c} className="px-2 text-base sm:text-sm" />',
      '<input value={d} className="px-2 max-sm:text-base" />',
      '<input value={e} className={cn("px-2", INPUT_TEXT)} />',
    ].join("\n");
    expect(smallInputs({ "a.tsx": src })).toEqual(["a.tsx:1", "a.tsx:2"]);
  });
});
