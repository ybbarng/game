"use client";

import Script from "next/script";

import { BEFORE_SEND_NAME, UMAMI_WEBSITE_ID } from "@/stats/analytics";

/**
 * 사이트 통계 스크립트(umami, docs/33). ID가 없는 빌드(개발·시험)에서는 싣지 않는다.
 * game.byb.kr에서 연 방문만 세고, "추적하지 말라"(DNT)를 켠 브라우저는 스크립트가 스스로 보내지 않는다.
 * 주소의 쿼리·`#`은 지우고, 보내기 직전 `beforeSend`가 끔·GPC·남은 비밀을 다시 본다.
 * 이 출처에서 도는 코드는 모두 우리 빌드 안(화면 코드 해시 안)에 둔다(2026-11-01 별도 검토, docs/39 3절 1번:
 * 기기 저장소는 출처 단위라 어느 페이지에서 도는 바깥 스크립트든 별 따기 소속 증서를 읽을 수 있다). 그래서 추적
 * 스크립트를 저장소에 고정해 같은 출처에서 내보내고(`public/stats/umami-3.4.1.js`), 보내는 곳만 stats.byb.kr로
 * 둔다(`data-host-url`). 하늘의 별 따기에도 싣는다(2026-11-03 사용자, docs/33 11절). 소속·입상 확인·국장 화면과
 * 예측서를 낸 순간은 보내기 직전 함수(`beforeSend`)가 막는다
 */
export const UMAMI_SCRIPT = "/stats/umami-3.4.1.js";
export const UMAMI_HOST = "https://stats.byb.kr";

export function Analytics() {
  if (!UMAMI_WEBSITE_ID) return null;
  return (
    <Script
      src={UMAMI_SCRIPT}
      data-host-url={UMAMI_HOST}
      data-website-id={UMAMI_WEBSITE_ID}
      data-domains="game.byb.kr"
      data-do-not-track="true"
      data-exclude-search="true"
      data-exclude-hash="true"
      data-before-send={BEFORE_SEND_NAME}
      strategy="afterInteractive"
    />
  );
}
