// 처음 안내(`/cube/intro`, 2026-11-04 사용자가 정함): 우리 화면 쓰는 법. 표기·공식·단축키라는 말부터, 면 여섯과
// 이름의 뜻, 방향, 큐브 전체 돌리기, 가운데 층, 넓게 돌리기와 큰 큐브까지. 정의는 `intro.test.ts`가 엔진(parseMoves)과
// 견준다. 화면 글은 해요체.

/** 면 여섯(영어 머리글자). 면 번호는 엔진 차례(U R F D L B) */
export const FACE_WORDS = [
  { letter: "R", word: "Right", ko: "오른쪽", face: 1 },
  { letter: "L", word: "Left", ko: "왼쪽", face: 4 },
  { letter: "U", word: "Up", ko: "위", face: 0 },
  { letter: "D", word: "Down", ko: "아래", face: 3 },
  { letter: "F", word: "Front", ko: "앞", face: 2 },
  { letter: "B", word: "Back", ko: "뒤", face: 5 },
] as const;

/** 큐브 전체 돌리기: 수학의 세 축. 그 축이 가리키는 면과 같은 쪽으로 돈다 */
export const ROTATION_WORDS = [
  {
    move: "x",
    like: "R",
    why: "x축은 왼쪽 → 오른쪽(R 쪽)을 가리켜요. 그래서 x는 R과 같은 쪽으로 큐브 전체가 돌아요.",
  },
  {
    move: "y",
    like: "U",
    why: "y축은 아래 → 위(U 쪽)를 가리켜요. y는 U와 같은 쪽으로 돌아요.",
  },
  {
    move: "z",
    like: "F",
    why: "z축은 뒤 → 앞(F 쪽)을 가리켜요. z는 F와 같은 쪽으로 돌아요.",
  },
] as const;

/** 가운데 층 */
export const SLICE_WORDS = [
  {
    move: "M",
    word: "Middle",
    like: "L",
    why: "L과 R 사이 세로 가운데 층. L과 같은 쪽으로 돌아요.",
  },
  {
    move: "E",
    word: "Equator",
    like: "D",
    why: "적도처럼 가로로 도는 가운데 층. D와 같은 쪽으로 돌아요.",
  },
  {
    move: "S",
    word: "Standing",
    like: "F",
    why: "앞을 보고 서 있는 가운데 층. F와 같은 쪽으로 돌아요.",
  },
] as const;

/** 넓게 돌리기와 큰 큐브. 층 번호는 그 면에서부터 센다(from~to) */
export const WIDE_WORDS = [
  {
    n: 3,
    move: "Rw",
    from: 1,
    to: 2,
    why: "w는 wide(넓게). 오른쪽 두 층을 함께 돌려요. 소문자 r도 같아요.",
  },
  { n: 3, move: "r", from: 1, to: 2, why: "Rw와 같아요." },
  { n: 4, move: "2R", from: 2, to: 2, why: "바깥에서 둘째 층만 돌려요." },
  { n: 4, move: "Rw", from: 1, to: 2, why: "바깥 두 층을 함께 돌려요." },
  { n: 5, move: "3R", from: 3, to: 3, why: "5×5의 한가운데 층이에요." },
  { n: 5, move: "3Rw", from: 1, to: 3, why: "바깥 세 층을 함께 돌려요." },
] as const;

/** 처음 안내에서 직접 쳐 보는 수 */
export const INTRO_TRIES = {
  turns: { n: 3, alg: "R U' F2 L D B" },
  rotate: { n: 3, alg: "x y z" },
  slices: { n: 3, alg: "M E S" },
  wide3: { n: 3, alg: "Rw r" },
  wide4: { n: 4, alg: "2R Rw" },
  wide5: { n: 5, alg: "3R 3Rw" },
} as const;
