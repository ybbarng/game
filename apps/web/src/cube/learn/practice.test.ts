import { describe, expect, it } from "vitest";

import { isFreeTrain, stageById } from "../practice/stages";
import { ALG_SETS, COURSES, courseById } from ".";
import { practiceLinks } from "./practice";

const title = (set: string) =>
  ALG_SETS.find((s) => s.set === set)?.title ?? set;
const set = (href: string) =>
  new URL(href, "https://x").searchParams.get("set");

describe("해법 익히기의 연습 칸", () => {
  it("공식 연습 칸은 모두 있는 단계, 자유 훈련 칸은 「더 보기」 묶음으로 열린다", () => {
    for (const c of COURSES)
      for (const l of practiceLinks(c, title)) {
        if (l.kind === "practice") expect(stageById(set(l.href))).toBeDefined();
        if (l.kind === "train") {
          expect(ALG_SETS.map((s) => s.set)).toContain(set(l.href));
          expect(isFreeTrain(new URL(l.href, "https://x").search)).toBe(true);
        }
      }
  });

  it("초보자 해법은 십자·2층·3층 공식 연습과 십자 훈련을 잇는다", () => {
    const c = courseById("333-beginner");
    const links = c ? practiceLinks(c, title) : [];
    expect(links.map((l) => l.title)).toEqual([
      "십자",
      "2층",
      "3층",
      "십자 훈련",
    ]);
    expect(links[0]?.href).toBe("/cube/train?set=beginner-cross");
  });

  it("ZZ는 블록 짝 넣기(경우 열둘)와 마지막 층의 2단계 OLL·PLL 공식 연습, 십자 훈련을 잇는다", () => {
    const c = courseById("zz");
    const links = c ? practiceLinks(c, title) : [];
    expect(links.map((l) => l.href)).toEqual([
      "/cube/train?set=zz-pair",
      "/cube/train?set=2look-oll",
      "/cube/train?set=2look-pll",
      "/cube/train/cross",
    ]);
    expect(links.slice(0, 3).every((l) => l.kind === "practice")).toBe(true);
    expect(stageById("zz-pair")?.cases).toHaveLength(12);
  });

  it("CFOP는 F2L부터 PLL까지 공식 연습, 십자 훈련, 내 공식을 잇는다", () => {
    const c = courseById("cfop");
    const hrefs = c ? practiceLinks(c, title).map((l) => l.href) : [];
    expect(hrefs.slice(0, 5)).toEqual([
      "/cube/train?set=f2l",
      "/cube/train?set=2look-oll",
      "/cube/train?set=2look-pll",
      "/cube/train?set=oll",
      "/cube/train?set=pll",
    ]);
    expect(hrefs).toContain("/cube/train/cross");
    expect(hrefs.filter((h) => h === "/cube/train?set=f2l")).toHaveLength(1);
    expect(hrefs.at(-1)).toBe("/cube/algs");
  });

  it("2×2 처음 맞추기는 오르테가 묶음을 자유 훈련으로", () => {
    const c = courseById("222-beginner");
    const train = c
      ? practiceLinks(c, title).filter((l) => l.kind === "train")
      : [];
    expect(train.map((l) => l.href)).toEqual(["/cube/train?set=ortega-oll"]);
  });
});

describe("공식 훈련 주소가 여는 화면", () => {
  it("기본은 공식 연습, 자유 훈련·내 목록·옛 묶음은 자유 훈련", () => {
    expect(isFreeTrain("")).toBe(false);
    expect(isFreeTrain("?set=pll")).toBe(false);
    expect(isFreeTrain("?set=beginner-second&mode=see")).toBe(false);
    expect(isFreeTrain("?mode=free")).toBe(true);
    expect(isFreeTrain("?pick=mine")).toBe(true);
    expect(isFreeTrain("?set=parity-4x4")).toBe(true);
  });
});
