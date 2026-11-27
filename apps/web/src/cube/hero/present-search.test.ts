import { faceColors } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import type { PresentOutput } from "./present";
import { CASES, run, sameState, segments, statesAt } from "./present-test-util";

// 보여 주기 변환의 조각 찾기·강조 사건. 변환 자체는 present.test.ts, 조각마다 큐브 돌리기는 present-turns.test.ts가
// 본다(오래 걸려 파일을 나눠 동시에 돈다)

/** 스티커 정체 가운데 하나라도 위·앞·오른쪽(U·R·F) 면에 있나 */
const anyVisible = (s: PuzzleState, ids: readonly number[]) =>
  ids.some((id) => Math.floor(s.perm.indexOf(id) / 9) <= 2);

/** 스티커(정체)가 모두 센터 색과 같은 면에 있나 */
const placedOk = (s: PuzzleState, ids: readonly number[]) => {
  const colors = faceColors(3, s);
  return ids.every((id) => {
    const at = s.perm.indexOf(id);
    return colors[at] === colors[Math.floor(at / 9) * 9 + 4];
  });
};

/** 앞 위 엣지(십자) · 앞-오른쪽 위 코너(첫 층) · 앞-오른쪽 칸(둘째 층) · 앞-오른쪽 짝(F2L) 스티커 자리 */
const FRONT_SLOTS = [
  [7, 19],
  [8, 20, 9],
  [23, 12],
  [29, 26, 15, 23, 12],
];

describe("조각 찾기와 강조 사건(3×3 초보자·프리드리히)", () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  /** 이미 맞은 조각이 있는 섞기를 더 본다(결정적) */
  const CHECK_SEEDS = [9, 10, 11, 12];
  for (const id of ["3-beginner", "3-cfop"]) {
    it(`${id}: 섞기가 같으면 찾는 돌리기가 늘 같다`, async () => {
      for (const seed of SEEDS.slice(0, 4)) {
        const a = await run(id, seed);
        const b = await run(id, seed);
        expect(b.shown.moves).toEqual(a.shown.moves);
        expect(b.shown.searches).toEqual(a.shown.searches);
        expect(b.shown.marks).toEqual(a.shown.marks);
      }
    });

    it(`${id}: 찾는 동안 조각이 보이기 전에는 멈추지 않고, 처음 보이는 걸음에서 멈춘다`, async () => {
      let searched = 0;
      for (const seed of SEEDS) {
        const { start, shown } = await run(id, seed);
        const states = statesAt(3, start, shown.moves);
        const searches = new Set(shown.searches);
        for (const s of shown.searches)
          expect(shown.moves[s]).toMatch(/^[xyz]['2]?$/);
        for (const { at, mark } of shown.marks) {
          // 조각 찾기만 본다(마지막 층의 모양 강조는 찾지 않는다)
          if (mark.kind !== "found" || mark.solo) continue;
          // 바로 앞에 이어진 찾는 돌리기들
          let from = at;
          while (searches.has(from - 1)) from--;
          for (let j = from; j < at; j++)
            expect(
              anyVisible(states[j] as PuzzleState, mark.stickers),
              `${id} ${seed} 찾는 ${j - from + 1}번째 앞`,
            ).toBe(false);
          expect(anyVisible(states[at] as PuzzleState, mark.stickers)).toBe(
            true,
          );
          if (at > from) {
            searched++;
            // 찾은 뒤에는 둘러보기 전 방향으로 되돌린 다음에 넣을 칸을 돌린다
            let back = at;
            while (searches.has(back)) back++;
            expect(back).toBeGreaterThan(at);
            expect(
              sameState(
                states[back] as PuzzleState,
                states[from] as PuzzleState,
              ),
              `${id} ${seed} 되돌리기`,
            ).toBe(true);
            // 둘러보기·되돌리기 사이에 넣는 수가 없다
            for (let j = from; j < back; j++)
              expect(shown.moves[j]).toMatch(/^[xyz]/);
          }
        }
      }
      expect(searched).toBeGreaterThan(0);
    });

    it(`${id}: 넣기 전(넣을 곳·찾은 조각)과 넣은 뒤(맞춘 조각)에만 조각 사건이 있고, 다 맞춘다`, async () => {
      for (const seed of SEEDS) {
        const { start, shown } = await run(id, seed);
        const states = statesAt(3, start, shown.moves);
        // 조각 넣기 사건(따로 빛내는 확인·마지막 층 사건은 아래 시험이 본다)
        const ll = shown.stages.find((s) =>
          ["eo", "oll"].includes(s.name),
        ) as PresentOutput["stages"][number];
        const before = shown.marks.filter(
          (m) => !m.mark.solo && m.at <= ll.start,
        );
        const kinds = before.map((m) => m.mark.kind);
        // 묶음마다 넣을 곳 → 찾은 조각 → 맞춘 조각(마지막 층 앞 단계의 끝 강조는 그 뒤)
        const tail = kinds.length % 3;
        expect(tail).toBeLessThanOrEqual(1);
        expect(kinds.length).toBeGreaterThan(0);
        for (let i = 0; i + 2 < kinds.length; i += 3) {
          expect(kinds.slice(i, i + 3)).toEqual(["slot", "found", "placed"]);
          const found = before[i + 1] as (typeof shown.marks)[number];
          const placed = before[i + 2] as (typeof shown.marks)[number];
          // 넣는 수가 하나 이상 있고, 그 사이에는 사건이 없다(차례가 slot·found·placed로 이어진다)
          expect(placed.at).toBeGreaterThan(found.at);
          expect(placed.mark.stickers).toEqual(found.mark.stickers);
          expect(
            placedOk(states[placed.at] as PuzzleState, placed.mark.stickers),
          ).toBe(true);
          expect(
            placedOk(states[found.at] as PuzzleState, found.mark.stickers),
          ).toBe(false);
        }
        const end = states.at(-1) as PuzzleState;
        expect(placedOk(end, [...end.perm])).toBe(true);
      }
    });

    it(`${id}: 이미 맞은 조각은 그 칸을 앞(-오른쪽)으로 돌려 한 번씩 확인하고, 그 사이에 층 돌리기가 없다`, async () => {
      let checks = 0;
      for (const seed of [...SEEDS, ...CHECK_SEEDS]) {
        const { start, shown } = await run(id, seed);
        const states = statesAt(3, start, shown.moves);
        const ll = shown.stages.find((s) =>
          ["eo", "oll"].includes(s.name),
        ) as PresentOutput["stages"][number];
        // 묶음마다 맞춘 조각 강조가 꼭 한 번(넣었거나 확인했거나)
        const seen = new Map<string, number>();
        let prevAt = 0;
        for (const { at, mark } of shown.marks) {
          if (at > ll.start) continue;
          if (mark.kind === "placed" && !(mark.solo && !mark.check)) {
            const key = [...mark.stickers].sort((x, y) => x - y).join();
            seen.set(key, (seen.get(key) ?? 0) + 1);
          }
          if (mark.check) {
            checks++;
            const st = states[at] as PuzzleState;
            expect(placedOk(st, mark.stickers), `${seed}`).toBe(true);
            // 앞 위 엣지·앞-오른쪽 위 코너·앞-오른쪽 칸·앞-오른쪽 짝 가운데 한 칸에 있다
            const ids = new Set(mark.stickers);
            const inFront = FRONT_SLOTS.some(
              (slot) =>
                slot.length === ids.size &&
                slot.every((p) => ids.has(st.perm[p] as number)),
            );
            expect(inFront, `${seed} 확인 칸 @${at}`).toBe(true);
            // 앞 사건 뒤부터 이 확인까지 큐브 돌리기뿐
            for (let j = prevAt; j < at; j++)
              expect(shown.moves[j], `${seed} @${j}`).toMatch(/^[xyz]['2]?$/);
          }
          prevAt = at;
        }
        for (const [key, count] of seen)
          expect(count, `${seed} ${key}`).toBe(1);
        // 넣은 것과 확인한 것을 합치면 그 단계들의 조각 스티커를 모두 덮는다
        // (초보자: 십자 8 + 코너 12 + 둘째 층 8, 프리드리히: 십자 8 + 짝 넷 20)
        const covered = new Set([...seen.keys()].flatMap((k) => k.split(",")));
        expect(covered.size, `${seed}`).toBe(28);
        const end = states.at(-1) as PuzzleState;
        expect(placedOk(end, [...end.perm])).toBe(true);
      }
      expect(checks).toBeGreaterThan(0);
    });

    it(`${id}: 마지막 층 단계마다 시작에 맞출 칸, 공식 앞에 모양, 공식 뒤에만 맞은 칸, 끝에 전체를 빛낸다`, async () => {
      for (const seed of SEEDS.slice(0, 4)) {
        const { shown } = await run(id, seed);
        const names =
          id === "3-beginner"
            ? ["eo", "ll-edges", "ll-corner-place", "ll-corner-twist"]
            : ["oll", "pll"];
        for (const name of names) {
          const st = shown.stages.find((s) => s.name === name);
          if (!st || st.end <= st.start) continue;
          const cuts = new Set([
            st.start,
            ...segments(shown, name).map(([a]) => a),
            st.end,
          ]);
          const own = shown.marks.filter(
            (m) =>
              m.mark.solo &&
              !m.mark.check &&
              m.at >= st.start &&
              m.at <= st.end,
          );
          // 시작 강조(넣을 곳)는 단계 첫머리에 한 번
          const slots = own.filter(
            (m) => m.mark.kind === "slot" && m.at === st.start,
          );
          expect(slots.length, `${seed} ${name}`).toBe(1);
          // 모양 강조는 토막 첫머리에만, 토막마다 많아야 한 번
          const founds = own.filter(
            (m) => m.mark.kind === "found" && m.at < st.end,
          );
          // 윗면만 돌려 끝나는 단계(공식 없음)는 모양·새로 맞은 칸 강조가 없다
          const formula = shown.moves
            .slice(st.start, st.end)
            .some((m) => !/^(U['2]?|[xyz]['2]?)$/.test(m));
          expect(founds.length > 0, `${seed} ${name}`).toBe(formula);
          for (const f of founds) expect(cuts.has(f.at)).toBe(true);
          expect(new Set(founds.map((f) => f.at)).size).toBe(founds.length);
          // 수를 두는 동안(토막 안)에는 강조가 없다
          for (const m of shown.marks)
            if (m.at > st.start && m.at < st.end)
              expect(cuts.has(m.at), `${seed} ${name} @${m.at}`).toBe(true);
          // 새로 맞은 칸 강조는 공식 뒤(토막 끝)에 나온다(단계 첫머리의 것은 앞 단계 것)
          const fresh = shown.marks.filter(
            (m) =>
              !m.mark.solo &&
              m.mark.kind === "placed" &&
              m.at > st.start &&
              m.at <= st.end,
          );
          if (formula)
            expect(fresh.length, `${seed} ${name}`).toBeGreaterThan(0);
          // 단계 끝에 맞춘 칸 전체
          expect(
            own.some((m) => m.mark.kind === "placed" && m.at === st.end),
            `${seed} ${name} 끝`,
          ).toBe(true);
        }
      }
    });
  }

  it("3×3 초보자: 흰 십자는 화면에서도 강의 공식의 F·R·D와 큐브 돌리기만(맞춘 면 U는 돌리지 않는다), 둘째 층에 왼쪽 면이 없다", async () => {
    for (const seed of SEEDS) {
      const { shown } = await run("3-beginner", seed);
      const cross = shown.stages.find((s) => s.name === "cross");
      const middle = shown.stages.find((s) => s.name === "middle");
      if (!cross || !middle) throw new Error("단계 없음");
      for (const m of shown.moves.slice(cross.start, cross.end))
        expect(m, `${seed} 십자`).toMatch(/^([FRD]|[xyz])['2]?$/);
      // 넣을 자리를 앞으로 가져오는 y가 있다
      expect(
        shown.moves
          .slice(cross.start, cross.end)
          .filter(
            (m, i) => /^y/.test(m) && !shown.searches.includes(cross.start + i),
          ).length,
      ).toBeGreaterThan(0);
      for (const m of shown.moves.slice(middle.start, middle.end))
        expect(m, `${seed} 둘째 층`).not.toMatch(/^[LBD]/);
    }
  });

  it("찾기를 켜지 않은 해법(루·ZZ·2×2·4×4)은 찾는 돌리기와 사건이 없다", async () => {
    for (const id of ["3-roux", "3-zz", "2-beginner", "4-cfop"]) {
      const seed = CASES.find((c) => c.id === id)?.seeds[0] ?? 1;
      const { shown } = await run(id, seed);
      expect(shown.searches).toEqual([]);
      expect(shown.marks).toEqual([]);
    }
  });
});
