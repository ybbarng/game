import type { GameEntry } from "@/games/registry";
import type { ErrorKind } from "@/stardraw/errors";

import type { StatsMode } from "./records";

/**
 * 사이트 통계 이벤트(umami, docs/33 2-2절). 이름과 값은 여기서만 정한다 — 통계 화면(stats.byb.kr)에서 이 이름으로 찾는다.
 * 값은 정해 둔 것(게임 id, 단계, 코드에 적힌 단원 id)만 받는다. 방 코드·이름·채팅·패·시드·점수는 보내지 않는다.
 * 페이지 보기는 umami가 스스로 센다(`Analytics`).
 */
export type GameId = GameEntry["id"];

export interface TrackEvents {
  /** 판을 시작했다. 혼자 하기는 컴퓨터 단계, 온라인은 방장·참가자 */
  "game-start":
    | { game: GameId; mode: "solo"; level?: number }
    | { game: GameId; mode: "online"; role: "host" | "guest" };
  /** 게임을 끝까지 했다(내 기록에 남을 때) */
  "game-finish": { game: GameId; mode: StatsMode };
  /** 배우기 단원을 마쳤다(first: 처음 마쳤나) */
  "lesson-finish": { game: GameId; lesson: string; first: boolean };
  /** 배우기 단원 목록을 열었다(주소가 바뀌지 않아 페이지 보기로는 안 잡힌다) */
  "learn-open": { game: GameId };

  // ── 하늘의 별 따기(docs/33 11절). 실제 게임(서버 장부)에서만 보낸다: stardraw/sd-track.ts ──
  /** 공지 링크(`/stardraw?from=notice`)로 들어왔다 */
  "sd-arrive": { from: "notice" };
  /** 우주인 등록증을 만들었거나(create) 다른 기기에서 신분증을 제시해 찾았다(present) */
  "sd-key": { how: SdKeyHow; where: SdWhere; inApp: boolean };
  /**
   * 패스키가 막혔다. step: 만들기·제시, 또는 들어오자마자 본 브라우저 환경(env, 페이지를 열 때 한 번).
   * kind는 SdKeyFailKind, inApp은 앱 안 브라우저(카카오톡 등)였는지
   */
  "sd-key-fail": {
    step: SdKeyHow | "env";
    kind: SdKeyFailKind;
    inApp: boolean;
  };
  /**
   * 예측을 시작했다: 그 회차에 첫 별을 바구니에 담았을 때(예측서를 낸 순간이 아니다. 접수 시각과 방문을 맞춰 보지 못하게).
   * first는 이 기기의 첫 예측인지
   */
  "sd-predict": { kind: "first" | "again" };
  /** 예측서를 내지 못했다(접수 실패 까닭, stardraw/errors.ts ErrorKind) */
  "sd-predict-fail": { why: SdPredictFailWhy };
  /** 주소(경로)가 바뀌지 않는 별 따기 화면을 열었다(# 조각 화면, 지금 회차의 예측·관측) */
  "sd-view": { view: SdView };
}

export type SdKeyHow = "create" | "present";

/** 패스키가 막힌 까닭 */
export type SdKeyFailKind =
  /** 창을 닫았거나 시간이 지났다(브라우저는 「맞는 패스키 없음」도 같은 오류로 준다) */
  | "cancelled"
  /** 이 인증기가 ES256 패스키·본인 확인을 못 한다 */
  | "unsupported"
  /** 신분증 제시: 패스키는 골랐지만 장부에 없는 등록증 */
  | "not-found"
  /** 들어온 브라우저가 앱 안 브라우저(env) */
  | "in-app"
  /** 들어온 브라우저에 패스키 기능이 없다(env) */
  | "no-api"
  | "other";

/** 접수 실패 까닭: 별 따기 오류 문구가 쓰는 종류 그대로(stardraw/errors.ts, 값은 정해진 몇 가지) */
export type SdPredictFailWhy = ErrorKind;

/** 별 따기 화면 이름(sd-key의 where, sd-view의 view) */
export type SdWhere =
  | "home"
  | "enter"
  | "predict"
  | "observe"
  | "mine"
  | "records"
  | "receipt"
  | "rounds"
  | "round"
  | "draw"
  | "stats"
  | "timetable"
  | "other";

export type SdView =
  | "records"
  | "receipt"
  | "round"
  | "draw"
  | "predict"
  | "observe";

interface Umami {
  track(name: string, data?: object): void;
}

/** 통계 스크립트가 없거나(개발·시험 빌드, 광고 차단기) 실패해도 화면은 그대로 둔다 */
export function track<K extends keyof TrackEvents>(
  name: K,
  data: TrackEvents[K],
): void {
  try {
    (globalThis as { umami?: Umami }).umami?.track(name, data);
  } catch {
    // 통계는 못 남겨도 된다
  }
}
