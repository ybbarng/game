/**
 * 하늘 자료 모양(docs/48 5-9). 자료(`src/sky/*.json`)를 만드는 스크립트와 엔진·웹이 함께 읽는다.
 * 엔진은 하늘을 인자로 받아 판을 만든다(`buildBoard`).
 */

export interface GalaxyStar {
  /** IAU 이름 영문(예: "Sirius"), 하늘 안에서 겹치지 않는다 */
  id: string;
  /** 한글 이름(예: "시리우스") */
  ko: string;
  /** BSC5 번호 */
  hr: number;
  /** "α" */
  bayer: string;
  /** 겉보기 등급(소수 둘째 자리) */
  mag: number;
  /** 표면 온도(K, 100 단위) */
  k: number;
  /** 거리(광년, 시차 오차가 크면 반올림한 어림값), 모르면 null */
  ly: number | null;
  /** 적경(도) */
  ra: number;
  /** 적위(도) */
  dec: number;
}

export interface GalaxyConstellation {
  /** IAU 약어 "CMa" */
  id: string;
  /** "큰개자리" */
  ko: string;
  season: "spring" | "summer" | "autumn" | "winter" | null;
  /** 판 위에 놓을 별(2 또는 3), 판 칸 순서 */
  stars: GalaxyStar[];
  /** 별자리 선(적경·적위 꺾은선), 그림용 */
  lines: [number, number][][];
  /** 선 위의 다른 별(흐린 점) */
  extra: { ra: number; dec: number; mag: number }[];
}

export interface GalaxySky {
  /** "seasons", "zodiac", "south", "spring" … */
  id: string;
  /** "사계절 하늘" */
  ko: string;
  /** 판 차례(우주국 다음 칸부터) */
  constellations: string[];
}
