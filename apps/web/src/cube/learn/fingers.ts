// 핑거 트릭(실물 큐브 손가락 연습, docs/47 8-3). 오른손잡이 기준, 큐브는 두 손 엄지를 앞면에 대고 쥔다.
// fingers는 공식의 수마다 FINGER_NOTATION 낱말 하나(띄어쓰기로 나눔). 시험이 수 개수와 낱말을 확인한다.
import type { FingerDrill } from "./types";

/** 손가락 표기 설명(배우기 첫 화면) */
export const FINGER_INTRO = [
  "두 손 엄지를 앞면 아래쪽에, 검지를 윗면 뒤쪽 모서리에 가볍게 걸친다. 손바닥으로 큐브를 꽉 쥐지 않는다.",
  "R·R'은 손가락이 아니라 오른 손목을 돌린다. 손목을 돌린 뒤 엄지가 앞면에 그대로 붙어 있게 한다.",
  "U는 오른 검지로 윗면 앞쪽 오른편을 왼쪽으로 민다. U'는 왼 검지로 윗면 앞쪽 왼편을 오른쪽으로 민다.",
  "F는 R'을 한 뒤라면 오른 엄지로 앞면을 위로 밀고, F'은 왼 엄지로 민다. 큐브를 다시 쥐지 않고 이어 가는 것이 핵심이다.",
  "처음에는 빠르기보다 박자를 고르게. 메트로놈을 켜고 한 박에 한 수부터 시작한다.",
];

const d = (
  id: string,
  title: string,
  alg: string,
  fingers: string,
  note: string,
  reps = 10,
): FingerDrill => ({
  id,
  title,
  alg,
  fingers,
  note,
  reps,
});

export const FINGER_DRILLS: FingerDrill[] = [
  d(
    "wrist",
    "손목 돌리기",
    "R R' R R' R2 R2",
    "RW RW RW RW RW RW",
    "엄지를 앞면에 붙인 채 오른 손목만 돌린다. R2는 손목을 끝까지 두 번 꺾는 느낌",
    5,
  ),
  d(
    "u-flick",
    "U 밀기",
    "U U U U",
    "RI RI RI RI",
    "오른 검지 끝으로 윗면을 한 칸씩 민다. 민 뒤 검지를 제자리로 빨리 되돌린다",
  ),
  d(
    "u-prime-flick",
    "U' 밀기",
    "U' U' U' U'",
    "LI LI LI LI",
    "왼 검지로 민다. 오른손은 큐브를 받쳐만 둔다",
  ),
  d(
    "u2-flick",
    "U2 이어 밀기",
    "U2 U2",
    "RI2 RI2",
    "오른 검지와 가운뎃손가락으로 이어서 두 칸 민다",
    10,
  ),
  d(
    "sexy",
    "섹시 무브",
    "R U R' U'",
    "RW RI RW LI",
    "가장 자주 나오는 네 수. 다시 쥐지 않고 6번 하면 제자리로 돌아온다",
    6,
  ),
  d(
    "sexy-reverse",
    "거꾸로 섹시 무브",
    "U R U' R'",
    "RI RW LI RW",
    "F2L 짝 넣기에 자주 나온다",
    6,
  ),
  d(
    "sledge",
    "슬레지(Sledgehammer)",
    "R' F R F'",
    "RW RIf RW LIf",
    "R' 뒤 오른 검지로 F, R 뒤 왼 검지로 F'",
    6,
  ),
  d(
    "hedge",
    "헤지(Hedgeslammer)",
    "F R' F' R",
    "LT RW LIf RW",
    "슬레지의 거꾸로",
    6,
  ),
  d(
    "sune",
    "수네",
    "R U R' U R U2 R'",
    "RW RI RW RI RW RI2 RW",
    "오른 검지만으로 U를 이어 민다",
    6,
  ),
  d(
    "t-perm",
    "T퍼뮤",
    "R U R' U' R' F R2 U' R' U' R U R' F'",
    "RW RI RW LI RW RIf RW LI RW LI RW RI RW LIf",
    "앞 네 수는 섹시 무브, 이어지는 R' F는 슬레지 앞부분이다. R2 뒤에는 왼 검지로 U'",
    5,
  ),
  d(
    "ua-perm",
    "U퍼뮤(R 공식)",
    "R U' R U R U R U' R' U' R2",
    "RW LI RW RI RW RI RW LI RW LI RW",
    "R과 U만 쓴다. 오른 손목을 크게 쓰지 말고 박자를 고르게",
    5,
  ),
  d(
    "jb-perm",
    "Jb퍼뮤",
    "R U R' F' R U R' U' R' F R2 U' R'",
    "RW RI RW LIf RW RI RW LI RW RIf RW LI RW",
    "T퍼뮤와 손 모양이 거의 같다",
    5,
  ),
];
