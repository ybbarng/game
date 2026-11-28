// 해법 지도 시안 화면 계산(solve-map-model.ts): 고른 해법 읽기, 길 꼬리표 값, 줌·패닝 범위.
import { describe, expect, it } from "vitest";

import { edgeById, type MapEdge } from "../learn/solve-map";
import {
  clampView,
  edgeFormulaLabel,
  isExtra,
  type MapWheel,
  methodById,
  parseSelected,
  visibleMethods,
  wheelView,
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

describe("휠·트랙패드(Figma 방식)", () => {
  const v = { x: -100, y: -200, k: 1 };
  const p = { x: 400, y: 300 };
  const wheel = (o: Partial<MapWheel>): MapWheel => ({
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...o,
  });

  it("두 손가락 밀기·마우스 휠은 밀린 만큼 옮기고 배율은 그대로", () => {
    expect(wheelView(v, wheel({ deltaX: 30, deltaY: 50 }), p, 600)).toEqual({
      x: -130,
      y: -250,
      k: 1,
    });
  });

  it("줄 단위 휠은 한 줄 16px, 쪽 단위 휠은 한 쪽 = 틀 높이로 옮긴다", () => {
    expect([
      wheelView(v, wheel({ deltaY: 3, deltaMode: 1 }), p, 600),
      wheelView(v, wheel({ deltaY: 1, deltaMode: 2 }), p, 600),
    ]).toEqual([
      { x: -100, y: -248, k: 1 },
      { x: -100, y: -800, k: 1 },
    ]);
  });

  it("Shift + 세로 휠은 가로로 옮기고, 브라우저가 이미 가로로 준 것은 그대로 쓴다", () => {
    expect([
      wheelView(v, wheel({ deltaY: 40, shiftKey: true }), p, 600),
      wheelView(v, wheel({ deltaX: 40, shiftKey: true }), p, 600),
    ]).toEqual([
      { x: -140, y: -200, k: 1 },
      { x: -140, y: -200, k: 1 },
    ]);
  });

  it("Ctrl 휠(오므리기)은 가리킨 자리를 그대로 두고 키운다(deltaY −10 → e^0.1배)", () => {
    const z = wheelView(v, wheel({ deltaY: -10, ctrlKey: true }), p, 600);
    const k = Math.exp(0.1);
    expect(z.k).toBeCloseTo(k, 10);
    // 가리킨 자리의 지도 좌표가 줌 앞뒤로 같다
    expect((p.x - z.x) / z.k).toBeCloseTo((p.x - v.x) / v.k, 10);
    expect((p.y - z.y) / z.k).toBeCloseTo((p.y - v.y) / v.k, 10);
  });

  it("⌘ + 휠도 줌, 마우스 휠 한 칸(deltaY 100)은 한 번에 e^0.5배까지만 줄인다", () => {
    const z = wheelView(v, wheel({ deltaY: 100, metaKey: true }), p, 600);
    expect(z.k).toBeCloseTo(Math.exp(-0.5), 10);
  });

  it("배율은 0.12~2.5 안에 묶인다", () => {
    expect([
      wheelView({ ...v, k: 2.4 }, wheel({ deltaY: -50, ctrlKey: true }), p, 600)
        .k,
      wheelView({ ...v, k: 0.13 }, wheel({ deltaY: 50, ctrlKey: true }), p, 600)
        .k,
    ]).toEqual([2.5, 0.12]);
  });
});

describe("길 꼬리표", () => {
  it("직관 걸음은 꼬리표를 비우고(「공식 없음」을 붙이지 않음), 공식 수는 「n개」, 앞에서 배운 공식만 쓰면 「배운 공식」, 셀 자료가 없으면 비운다", () => {
    const cfop = [methodById("cfop")];
    const beginner = [methodById("beginner")];
    const e = (id: string) => edgeById(id) as MapEdge;
    expect([
      edgeFormulaLabel(e("cross"), cfop),
      edgeFormulaLabel(e("f2l"), cfop),
      // 첫 층 코너에서 배운 코너 돌리기 공식을 다시 쓴다
      edgeFormulaLabel(e("beginner-corner-twist"), beginner),
      edgeFormulaLabel(e("zbll"), cfop),
    ]).toEqual([null, "공식 9개", "배운 공식", null]);
  });
});
