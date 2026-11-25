// 해법 지도 시안 화면 계산(solve-map-model.ts): 고른 해법 읽기, 길 꼬리표 값, 줌·패닝 범위.
import { describe, expect, it } from "vitest";

import { edgeById, type MapEdge } from "../learn/solve-map";
import {
  clampView,
  edgeFormulaLabel,
  isExtra,
  methodById,
  parseSelected,
  visibleMethods,
} from "./solve-map-model";

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

  it("줄여서 지도가 틀보다 좁으면 그 방향은 가운데에 둔다(전체 보기)", () => {
    // 폭 1200×0.5 = 600 < 800이라 가로는 (800 − 600) / 2, 세로 750 > 600이라 범위 안
    expect(clampView({ x: 120, y: -40, k: 0.5 }, b)).toEqual({
      x: 100,
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
