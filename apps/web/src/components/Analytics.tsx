"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

import { BEFORE_SEND_NAME, UMAMI_WEBSITE_ID } from "@/stats/analytics";

/**
 * 사이트 통계 스크립트(umami, docs/33). ID가 없는 빌드(개발·시험)에서는 싣지 않는다.
 * game.byb.kr에서 연 방문만 세고, "추적하지 말라"(DNT)를 켠 브라우저는 스크립트가 스스로 보내지 않는다.
 * 주소의 쿼리·`#`은 지우고, 보내기 직전 `beforeSend`가 끔·GPC·남은 비밀을 다시 본다.
 * 하늘의 별 따기(/stardraw) 아래에서는 싣지 않는다: 바깥 스크립트는 화면 코드 해시(재현 빌드) 밖이라 바뀌어도
 * 알 수 없고, 같은 출처에서 돌면 기기에 저장된 소속 복구 코드를 읽고 패스키 서명을 띄울 수 있다(D7).
 * 주의(2026-11-01 별도 검토, docs/39 3절 1번): 경로만 빼서는 안전하지 않다. 기기 저장소는 출처(game.byb.kr)
 * 단위라 게임 목록 같은 다른 페이지에서 도는 바깥 스크립트도 별 따기 저장소를 읽는다. 그래서 이 출처에서 도는
 * 코드는 모두 우리 빌드 안(화면 코드 해시 안)에 두어야 한다
 */
export function Analytics() {
  const path = usePathname() ?? "";
  if (!UMAMI_WEBSITE_ID) return null;
  if (path === "/stardraw" || path.startsWith("/stardraw/")) return null;
  return (
    <Script
      src="https://stats.byb.kr/script.js"
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
