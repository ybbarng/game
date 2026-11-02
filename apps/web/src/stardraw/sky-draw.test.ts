import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SKY_STARS } from "./sky";
import {
  drawSky,
  type FrameInput,
  HIT,
  type SkyState,
  scaleOf,
  starAt,
  stateKey,
} from "./sky-draw";

describe("starAt: 별 누르는 범위", () => {
  it("별 한가운데를 누르면 그 별이다", () => {
    const W = 360;
    for (const s of SKY_STARS) expect(starAt(s.x * W, s.y * W, W)).toBe(s.n);
  });

  it("작은 하늘은 minHit로 응모 하늘의 기준 크기(HIT px)만큼 누를 수 있다", () => {
    const W = 240;
    // 작은 하늘의 원래 범위(HIT × 크기 비율)보다 멀고 HIT보다 가까운 자리
    const off = (HIT * scaleOf(W) + HIT) / 2;
    let checked = 0;
    for (const s of SKY_STARS) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = s.x * W + Math.cos(a) * off;
        const y = s.y * W + Math.sin(a) * off;
        if (starAt(x, y, W, HIT) !== s.n) continue; // 이웃 별이 더 가까운 쪽
        expect(starAt(x, y, W)).toBeNull();
        checked++;
        break;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("stateKey: 미리 그린 층을 다시 그릴지", () => {
  const draw: SkyState = {
    mode: "draw",
    picked: [1, 2, 3, 4, 5, 6],
    focus: null,
    lit: [7],
    bonus: null,
  };

  it("룰렛 불빛이 옮겨도 층은 그대로다(관측 한 번에 수백 번 옮긴다)", () => {
    expect(stateKey({ ...draw, cursor: 8 })).toBe(stateKey(draw));
    expect(stateKey({ ...draw, cursor: 9 })).toBe(
      stateKey({ ...draw, cursor: 8 }),
    );
  });

  it("별이 켜지거나 내 별·누른 별이 바뀌면 다시 그린다", () => {
    expect(stateKey({ ...draw, lit: [7, 8] })).not.toBe(stateKey(draw));
    expect(stateKey({ ...draw, bonus: 9 })).not.toBe(stateKey(draw));
    expect(stateKey({ ...draw, focus: 9 })).not.toBe(stateKey(draw));
    expect(stateKey({ ...draw, picked: [1, 2, 3, 4, 5, 7] })).not.toBe(
      stateKey(draw),
    );
  });
  it("차례 별(marks)이 바뀌면 다시 그린다(당첨자 확인의 ①②③)", () => {
    expect(stateKey({ ...draw, marks: [1, 2, 3] })).not.toBe(stateKey(draw));
    expect(stateKey({ ...draw, marks: [1, 2, 3] })).not.toBe(
      stateKey({ ...draw, marks: [1, 3, 2] }),
    );
  });
});

/**
 * 그리기 호출을 글로 적는 가짜 2D ctx. 메서드는 이름과 인자를, 속성 쓰기는 이름과 값을 적는다.
 * 그라디언트는 ctx 안의 차례 번호로 적어, 같은 그림이면 같은 기록이 나온다
 */
function recorder(log: string[]): CanvasRenderingContext2D {
  let grads = 0;
  const fmt = (v: unknown): string =>
    typeof v === "number"
      ? String(Math.round(v * 1000) / 1000)
      : v && typeof v === "object" && "id" in v
        ? String((v as { id: string }).id)
        : String(v);
  const props: Record<string, unknown> = {};
  return new Proxy(props, {
    get(_, k) {
      if (typeof k !== "string") return undefined;
      if (k in props) return props[k];
      return (...args: unknown[]) => {
        log.push(`${k}(${args.map(fmt).join(",")})`);
        if (k.startsWith("create")) {
          const id = `grad${grads++}`;
          return {
            id,
            addColorStop: (t: number, c: string) =>
              log.push(`${id}.stop(${fmt(t)},${c})`),
          };
        }
        if (k === "getTransform") return { a: 1 };
        if (k === "measureText") return { width: String(args[0]).length * 6 };
        return undefined;
      };
    },
    set(_, k, v) {
      log.push(`${String(k)}=${fmt(v)}`);
      props[String(k)] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

describe("drawSky 층: 룰렛 불빛은 미리 그린 층에 들어가지 않는다", () => {
  /** drawSky가 document.createElement로 만든 층 캔버스마다의 그리기 기록 */
  let layers: string[][] = [];
  beforeEach(() => {
    layers = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const log: string[] = [];
        layers.push(log);
        const ctx = recorder(log);
        return { width: 0, height: 0, getContext: () => ctx };
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const draw: SkyState = {
    mode: "draw",
    picked: [1, 2, 3, 4, 5, 6],
    focus: null,
    lit: [7],
    bonus: null,
  };
  const frame = (state: SkyState): FrameInput => ({
    width: 300,
    state,
    now: 1000,
    twinkles: [],
    meteor: null,
  });
  /** 새 화면(새 ctx)에 한 번 그리고 [화면 기록, 바탕 층, 위 층] */
  const paint = (state: SkyState) => {
    const screen: string[] = [];
    const before = layers.length;
    drawSky(recorder(screen), frame(state));
    const [base, top] = layers.slice(before);
    if (layers.length !== before + 2 || !base || !top)
      throw new Error("층 캔버스 두 개를 새로 만들지 않았다");
    return { screen, base, top };
  };

  it("불빛 자리만 다른 두 상태는 층 그림이 같고, 화면에서만 불빛이 다르다", () => {
    const a = paint({ ...draw, cursor: 8 });
    const b = paint({ ...draw, cursor: 9 });
    const none = paint(draw);
    expect(a.base.length).toBeGreaterThan(100);
    expect(a.top.length).toBeGreaterThan(10);
    expect(b.base).toEqual(a.base);
    expect(b.top).toEqual(a.top);
    expect(none.base).toEqual(a.base);
    expect(none.top).toEqual(a.top);
    expect(b.screen).not.toEqual(a.screen);
  });

  it("같은 화면에서 불빛만 옮기면 층을 다시 만들지 않는다", () => {
    const g = recorder([]);
    drawSky(g, frame({ ...draw, cursor: 8 }));
    expect(layers.length).toBe(2);
    drawSky(g, frame({ ...draw, cursor: 9 }));
    drawSky(g, frame({ ...draw, cursor: null }));
    expect(layers.length).toBe(2);
    // 별이 켜지면 같은 층 캔버스에 다시 그린다(새로 만들지 않는다)
    const baseBefore = layers[0]?.length ?? 0;
    drawSky(g, frame({ ...draw, lit: [7, 8], cursor: 9 }));
    expect(layers.length).toBe(2);
    expect(layers[0]?.length).toBeGreaterThan(baseBefore);
  });

  it("차례 별(marks)이 바뀌면 층 그림도 달라진다", () => {
    const plain = paint(draw);
    const marked = paint({ ...draw, marks: [10, 11, 12] });
    expect(marked.top).not.toEqual(plain.top);
  });
});
