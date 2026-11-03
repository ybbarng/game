import { describe, expect, it } from "vitest";
import {
  cubieToFacelets,
  faceletsToCubie,
  faceMoveCubies,
  multiply,
  solvedCubie,
} from "./cubie";
import {
  applyAlgorithm,
  invertAlgorithm,
  isSolvedFacelets,
  parseMove,
  solvedFacelets,
} from "./facelets";

const S3 = solvedFacelets(3);

describe("스티커 시뮬레이터", () => {
  it("맞춘 큐브는 면 이름 9개씩", () => {
    expect(S3).toBe("UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB");
    expect(solvedFacelets(2)).toHaveLength(24);
  });

  it("R 한 번은 알려진 스티커 배치와 같다", () => {
    expect(applyAlgorithm(S3, "R")).toBe(
      "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB",
    );
  });

  it("U 한 번: 앞면 윗줄이 왼쪽으로 간다", () => {
    const f = applyAlgorithm(S3, "U");
    // F 윗줄에는 R색, L 윗줄에는 F색
    expect(f.slice(18, 21)).toBe("RRR");
    expect(f.slice(36, 39)).toBe("FFF");
  });

  it("수를 네 번, 섹시 무브를 여섯 번 두면 제자리", () => {
    for (const face of ["U", "R", "F", "D", "L", "B"]) {
      expect(applyAlgorithm(S3, `${face} ${face} ${face} ${face}`)).toBe(S3);
      expect(applyAlgorithm(S3, `${face}2 ${face}2`)).toBe(S3);
    }
    expect(applyAlgorithm(S3, "R U R' U' ".repeat(6))).toBe(S3);
  });

  it("거꾸로 표기를 두면 되돌아온다", () => {
    const alg = "R U2 F' L D B2 Rw 2U' x y2";
    expect(invertAlgorithm(alg)).toBe("y2 x' 2U Rw' B2 D' L' F U2 R'");
    const f = applyAlgorithm(solvedFacelets(4), alg);
    expect(applyAlgorithm(f, invertAlgorithm(alg))).toBe(solvedFacelets(4));
  });

  it("큐브 돌리기와 넓은 층: x = Rw L' (3×3), 4×4의 3Rw = x L", () => {
    expect(applyAlgorithm(S3, "x")).toBe(applyAlgorithm(S3, "Rw L'"));
    const s4 = solvedFacelets(4);
    expect(applyAlgorithm(s4, "3Rw")).toBe(applyAlgorithm(s4, "x L"));
    expect(isSolvedFacelets(applyAlgorithm(S3, "x y z2"))).toBe(true);
    expect(applyAlgorithm(S3, "x y z2")).not.toBe(S3);
  });

  it("층 표기를 읽는다", () => {
    expect(parseMove(5, "Rw")).toEqual({ face: "R", from: 1, to: 2, turns: 1 });
    expect(parseMove(7, "3Fw2")).toEqual({
      face: "F",
      from: 1,
      to: 3,
      turns: 2,
    });
    expect(parseMove(4, "2U'")).toEqual({
      face: "U",
      from: 2,
      to: 2,
      turns: 3,
    });
    expect(parseMove(3, "y'")).toEqual({ face: "U", from: 1, to: 3, turns: 3 });
    expect(() => parseMove(3, "Q")).toThrow();
    expect(() => parseMove(3, "4Rw")).toThrow();
  });
});

describe("조각 표현", () => {
  it("스티커 → 조각 → 스티커가 되돌아온다", () => {
    const f = applyAlgorithm(S3, "R U F' L2 D B' R2 U'");
    expect(cubieToFacelets(faceletsToCubie(f))).toBe(f);
  });

  it("조각 곱셈이 스티커 시뮬레이터와 같다", () => {
    const moves = faceMoveCubies();
    const names = ["U", "U2", "U'", "R", "R2", "R'", "F", "F2", "F'"].concat([
      "D",
      "D2",
      "D'",
      "L",
      "L2",
      "L'",
      "B",
      "B2",
      "B'",
    ]);
    const seq = [3, 0, 7, 14, 9, 17, 5, 1, 12, 16, 2, 10];
    let c = solvedCubie();
    for (const m of seq) c = multiply(c, moves[m] as typeof c);
    const alg = seq.map((m) => names[m]).join(" ");
    expect(cubieToFacelets(c)).toBe(applyAlgorithm(S3, alg));
  });

  it("맞출 수 없는 상태는 오류", () => {
    const twisted = cubieToFacelets({
      ...solvedCubie(),
      co: [1, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(() => faceletsToCubie(twisted)).toThrow(/꼭짓점 방향/);
    const flipped = cubieToFacelets({
      ...solvedCubie(),
      eo: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(() => faceletsToCubie(flipped)).toThrow(/모서리 방향/);
    const swapped = cubieToFacelets({
      ...solvedCubie(),
      ep: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    });
    expect(() => faceletsToCubie(swapped)).toThrow(/홀짝/);
    expect(() => faceletsToCubie(applyAlgorithm(S3, "x"))).toThrow(/가운데/);
  });
});
