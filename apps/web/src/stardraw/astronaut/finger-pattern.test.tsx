import { ManualClock } from "@game/fair-play";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AstronautCard, BlankAstronautCard } from "./AstronautCard";
import { FingerMark } from "./FingerMark";
import {
  CORE_CLEAR,
  FINGER_KINDS,
  fingermarkOf,
  fingerStrokes,
  insidePad,
  MAX_TILT,
  ridgeLines,
} from "./finger-pattern";
import { astronautOf } from "./identity";

/** 정해 둔 공개 열쇠(원시 P-256 꼴: 04 ‖ 64바이트). 이 열두 개는 네 꼴이 모두 나온다 */
const key = (i: number) => {
  const k = new Uint8Array(65);
  k[0] = 4;
  for (let j = 1; j < 65; j++) k[j] = (i * 37 + j * 11) & 255;
  return k;
};
const KEYS = Array.from({ length: 12 }, (_, i) => key(i));

describe("지문 문양 정의(열쇠 → 무늬)", () => {
  it("같은 열쇠면 같은 무늬다", () => {
    for (const k of KEYS.slice(0, 3))
      expect(fingermarkOf(Uint8Array.from(k))).toEqual(fingermarkOf(k));
  });

  it("다른 열쇠면 꼴·가운데·기울기가 갈린다", () => {
    const marks = KEYS.map(fingermarkOf);
    expect(new Set(marks.map((m) => m.kind))).toEqual(new Set(FINGER_KINDS));
    expect(new Set(marks.map((m) => `${m.core.x},${m.core.y}`)).size).toBe(12);
    expect(new Set(marks.map((m) => m.tilt)).size).toBe(12);
  });

  it("등록증 값(이름·얼굴)과 따로 정해진다: 이름이 같은 꼴로 몰리지 않는다", () => {
    // 같은 꼴끼리 등록번호가 다르다(씨앗 도메인이 달라 한쪽이 다른 쪽을 정하지 않는다)
    const byKind = new Map<string, Set<string>>();
    for (const k of KEYS) {
      const kind = fingermarkOf(k).kind;
      byKind.set(
        kind,
        (byKind.get(kind) ?? new Set()).add(astronautOf(k).number),
      );
    }
    for (const [kind, numbers] of byKind)
      expect(numbers.size, kind).toBe(
        KEYS.filter((k) => fingermarkOf(k).kind === kind).length,
      );
  });

  it("값이 정한 범위 안에 있다", () => {
    for (const k of KEYS) {
      const m = fingermarkOf(k);
      expect(Math.abs(m.tilt)).toBeLessThanOrEqual(MAX_TILT);
      expect(Math.abs(m.tilt)).toBeGreaterThanOrEqual(3);
      expect(m.minutiae.length).toBeGreaterThanOrEqual(2);
      expect(m.minutiae.length).toBeLessThanOrEqual(4);
      expect(m.minutiae.some((x) => x.kind === "break")).toBe(true);
      expect(m.minutiae.some((x) => x.kind === "fork")).toBe(true);
      expect(m.stars.length).toBeGreaterThanOrEqual(5);
      expect(m.chains.length).toBeGreaterThanOrEqual(1);
      expect(m.gap).toBeGreaterThanOrEqual(7.2);
      expect(m.gap).toBeLessThanOrEqual(8.8);
      expect(insidePad(m.core, 0.4)).toBe(true);
      expect(m.ink.edge).toBeGreaterThan(0);
      expect(m.ink.edge).toBeLessThan(1);
      const lines = ridgeLines(m);
      expect(lines).toHaveLength(m.ridges);
      for (const x of m.minutiae) {
        expect(x.ridge).toBeLessThan(lines.length - 1);
        const line = lines[x.ridge] ?? [];
        const p = line[Math.round(x.at * (line.length - 1))];
        expect(p && insidePad(p, 0.72)).toBe(true);
      }
      for (const s of m.stars) expect(insidePad(s, 0.8)).toBe(true);
    }
  });

  it("가운데 별 둘레에는 골이 지나가지 않는다", () => {
    for (const k of KEYS) {
      const m = fingermarkOf(k);
      const { ridges } = fingerStrokes(m);
      for (const r of ridges)
        for (const [, x, y] of r.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g))
          expect(
            Math.hypot(Number(x) - m.core.x, Number(y) - m.core.y),
          ).toBeGreaterThanOrEqual(m.gap * CORE_CLEAR - 0.1);
    }
  });
});

describe("지문 도장 부품", () => {
  it("가운데 별 하나, 골 사이 별 점, 별 사슬, 갈라진 골을 그린다", () => {
    const m = fingermarkOf(key(0));
    const html = renderToStaticMarkup(<FingerMark pub={key(0)} />);
    expect(html.match(/data-core-star/g)).toHaveLength(1);
    expect(html.match(/data-ink-star/g)).toHaveLength(m.stars.length);
    expect(html.match(/data-chain/g)).toHaveLength(m.chains.length);
    expect(html.match(/data-fork/g)).toHaveLength(
      m.minutiae.filter((x) => x.kind === "fork").length,
    );
    expect(html).toContain(`data-fingermark="${m.kind}"`);
    expect(html).toContain('aria-hidden="true"');
  });

  it("한 화면에 여럿 그려도 clipPath·mask·filter id가 겹치지 않는다", () => {
    const html = renderToStaticMarkup(
      <>
        <FingerMark pub={key(0)} />
        <FingerMark pub={key(0)} label="본인 서명 지문 도장" />
      </>,
    );
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((x) => x[1]);
    expect(ids.length).toBe(10);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/);
    expect(html).toContain('role="img" aria-label="본인 서명 지문 도장"');
  });

  it("같은 열쇠면 그릴 때마다 같은 그림이다(노이즈 씨앗도 열쇠에서)", () => {
    const one = renderToStaticMarkup(<FingerMark pub={key(3)} />);
    expect(renderToStaticMarkup(<FingerMark pub={key(3)} />)).toBe(one);
    expect(one).toMatch(/seed="\d+"/);
  });
});

describe("등록증 뒷면의 지문 도장", () => {
  const clock = new ManualClock();
  it("뒷면이 있는 등록증은 같은 열쇠의 무늬를 「본인 서명」으로 넣는다", () => {
    const pub = key(5);
    const html = renderToStaticMarkup(
      <AstronautCard
        astronaut={astronautOf(pub)}
        issued="2026. 11. 3."
        clock={clock}
        pub={pub}
        onReveal={async () => true}
      />,
    );
    const back = html.slice(html.indexOf("data-idcard-back"));
    expect(back).toContain("data-back-fingermark");
    expect(back).toContain(`data-fingermark="${fingermarkOf(pub).kind}"`);
    expect(back).toContain("본인 서명");
    // 앞면에는 넣지 않는다
    expect(html.slice(0, html.indexOf("data-idcard-back"))).not.toContain(
      "data-fingermark",
    );
  });

  it("뒷면이 없는 등록증·빈 등록증에는 넣지 않는다", () => {
    const pub = key(5);
    const front = renderToStaticMarkup(
      <AstronautCard
        astronaut={astronautOf(pub)}
        issued={null}
        clock={clock}
      />,
    );
    expect(front).not.toContain("data-fingermark");
    expect(renderToStaticMarkup(<BlankAstronautCard />)).not.toContain(
      "data-fingermark",
    );
  });
});
