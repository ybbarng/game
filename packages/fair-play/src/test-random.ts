/**
 * 시험 전용 난수원: 멘탈 포커 섞기 순서·섞기 열쇠·자리 열쇠와 방의 비밀 값(공동 시드)을 씨앗으로 정한다.
 *
 * 제품은 이것을 쓰지 않는다. 방(HostRoom·GuestRoom)과 판·기기는 `testRandom`을 받지 않으면 지금처럼
 * Web Crypto(`randomBelow`·`newSecret`)를 쓴다. 이 모듈은 패키지 하위 경로 `@game/fair-play/test-random`으로만
 * 내보내고(묶음 `@game/fair-play`에는 타입만), 웹 소스에서 이 경로는 시험·시험 틀만 부른다
 * (`apps/web/src/fair-test-random.test.ts`가 본다).
 *
 * 시험에서 판의 패가 실행마다 달라지면 운에 따라 흐름(0점 판, 총통, 모두 포기)과 시간이 달라진다(docs/13 8절 「시험」).
 * 값은 이름(`stream`·`secret`의 이름, `child`로 이은 경로)만으로 정해진다. 기기들이 어떤 차례로 계산하든
 * 같은 씨앗이면 같은 패가 나온다.
 */

const MASK64 = (1n << 64n) - 1n;

/** FNV-1a 64비트(이름 → 씨앗, UTF-16 단위로) */
function hash64(text: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & MASK64;
  }
  return h;
}

/** splitmix64 한 걸음씩. 암호용이 아니다(시험이 같은 판을 다시 만들 때만) */
function splitmix(seed: bigint): () => bigint {
  let state = seed & MASK64;
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return z ^ (z >> 31n);
  };
}

/** 0 이상 max 미만을 고른다(`randomBelow`와 같은 모양) */
export type BelowSource = (max: bigint) => bigint;

/**
 * 씨앗으로 정한 시험 난수원. `seededTestRandom`으로만 만든다(`kind`로 제품 난수원과 갈린다)
 */
export interface SeededTestRandom {
  readonly kind: "seeded-test";
  /** 이 난수원의 경로(씨앗과 `child` 이름들) */
  readonly path: string;
  /** 이름마다 따로 이어지는 수열. 같은 이름이면 처음부터 같은 수열을 새로 준다 */
  stream(name: string): BelowSource;
  /** 아래 경로의 난수원(참가자마다, 게임마다, 판마다) */
  child(name: string): SeededTestRandom;
  /** 방의 비밀 값(영문·숫자 32글자, `newSecret`과 같은 꼴) */
  secret(name: string): string;
}

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 시험 전용: 씨앗으로 정한 멘탈 포커 난수원을 만든다. 제품 코드는 부르지 않는다 */
export function seededTestRandom(seed: string): SeededTestRandom {
  return make(seed);
}

function make(path: string): SeededTestRandom {
  const stream = (name: string): BelowSource => {
    const next = splitmix(hash64(`${path}#${name}`));
    return (max) => {
      if (max <= 0n) throw new Error("max는 1 이상이어야 한다");
      // `randomBelow`처럼 max보다 64비트 넉넉히 뽑아 나머지를 쓴다(치우침이 2^-64 남짓).
      const words = Math.ceil(max.toString(2).length / 64) + 1;
      let n = 0n;
      for (let i = 0; i < words; i++) n = (n << 64n) | next();
      return n % max;
    };
  };
  return {
    kind: "seeded-test",
    path,
    stream,
    child: (name) => make(`${path}/${name}`),
    secret: (name) => {
      const below = stream(`secret:${name}`);
      let out = "";
      for (let i = 0; i < 32; i++)
        out += ALPHABET[Number(below(BigInt(ALPHABET.length)))];
      return out;
    },
  };
}
