// 해법 지도 시안 화면 계산(solve-map-model.ts): 고른 해법 읽기, B안 갈림길과 구간, 길 꼬리표 값.
import { describe, expect, it } from "vitest";

import { edgeById, type MapEdge } from "../learn/solve-map";
import {
  clampView,
  edgeFormulaLabel,
  hubNodes,
  isExtra,
  MAIN_METHODS,
  methodById,
  parseSelected,
  segmentFormulas,
  segments,
  segmentTurns,
  visibleMethods,
} from "./solve-map-model";

const main = visibleMethods([], false, (m) => !MAIN_METHODS.includes(m.id));

describe("고른 해법", () => {
  it("주소의 해법 목록에서 모르는 id·겹친 id는 버리고, 비면 초보자", () => {
    expect([
      parseSelected("beginner,cfop,nope,cfop"),
      parseSelected(""),
      parseSelected(null),
    ]).toEqual([["beginner", "cfop"], ["beginner"], ["beginner"]]);
  });

  it("접은 해법은 펼치거나 고를 때만 보인다", () => {
    const ids = (xs: { id: string }[]) => xs.map((m) => m.id);
    expect(ids(visibleMethods(["zz-zbll"], false, isExtra))).toContain(
      "zz-zbll",
    );
    expect(ids(visibleMethods([], false, isExtra))).not.toContain("zz-zbll");
  });
});

describe("B안 갈림길", () => {
  it("초보자 둘·2단계·CFOP는 흰 십자·아래 두 층·노란 십자·노란 면·위 엣지에서 갈라지거나 합쳐진다", () => {
    expect([...hubNodes(main)].sort()).toEqual(
      [
        "cross",
        "f2l",
        "oll",
        "scrambled",
        "solved",
        "yellow-cross",
        "yellow-edges",
      ].sort(),
    );
  });

  it("같은 길 묶음은 구간 하나로 모으고 지나는 해법을 함께 단다", () => {
    const first = segments(main).find((s) => s.to === "cross");
    expect(first?.methods.map((m) => m.id)).toEqual([
      "beginner",
      "beginner-twist-first",
      "two-look",
      "cfop",
    ]);
  });

  it("구간 값: CFOP 짝 넷은 공식 41(둘째부터 앞 공식)·잰 수 23", () => {
    const pairs = segments(main).find((s) => s.edges[0] === "f2l-pair-1");
    const cfop = [methodById("cfop")];
    expect([
      pairs && segmentFormulas(pairs, cfop),
      pairs && segmentTurns(pairs, cfop),
    ]).toEqual([41, 23]);
  });
});

describe("줌·패닝 범위", () => {
  // 틀 800×600, 지도 1200×1500
  const b = { w: 800, h: 600, width: 1200, height: 1500 };

  it("지도 왼쪽·위 끝 너머로는 밀리지 않는다(지도 밖 빈칸이 안 보인다)", () => {
    expect(clampView({ x: 300, y: 50, k: 1 }, b)).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("지도 오른쪽·아래 끝 너머로도 밀리지 않는다", () => {
    expect(clampView({ x: -900, y: -2000, k: 1 }, b)).toEqual({
      x: -400,
      y: -900,
      k: 1,
    });
  });

  it("줄여서 지도가 틀보다 좁으면 왼쪽·위에 붙는다", () => {
    expect(clampView({ x: 120, y: -40, k: 0.5 }, b)).toEqual({
      x: 0,
      y: -40,
      k: 0.5,
    });
  });
});

describe("길 꼬리표", () => {
  it("직관 걸음은 공식 없음, 앞에서 배운 공식만 쓰면 앞 공식, 셀 자료가 없으면 비운다", () => {
    const cfop = [methodById("cfop")];
    const e = (id: string) => edgeById(id) as MapEdge;
    expect([
      edgeFormulaLabel(e("cross"), cfop),
      edgeFormulaLabel(e("f2l-pair-1"), cfop),
      edgeFormulaLabel(e("f2l-pair-2"), cfop),
      edgeFormulaLabel(e("zbll"), cfop),
    ]).toEqual(["공식 없음", "공식 41", "앞 공식", null]);
  });
});
