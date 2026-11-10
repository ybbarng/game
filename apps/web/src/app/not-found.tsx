import type { Metadata } from "next";

import { NotFoundLinks } from "@/components/NotFoundLinks";
import "@/stardraw/night.css";

/**
 * 없는 주소(정적 내보내기의 out/404.html). 운영 nginx는 `error_page 404 /404.html`로 이 파일을 낸다(deploy/nginx.conf).
 * 파일이 하나뿐이라 별 따기 경로인지는 화면에서 주소를 보고 가린다(NotFoundLinks)
 */
export const metadata: Metadata = {
  title: "찾을 수 없는 페이지",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main
      data-not-found
      className="sd-night flex min-h-dvh flex-col items-center justify-center gap-5 px-4 text-center text-white"
    >
      <p className="font-mono text-5xl text-amber-100/80 tabular-nums">404</p>
      <h1 className="font-bold text-xl">찾을 수 없는 페이지입니다.</h1>
      <p className="break-keep text-sm text-white/70">
        주소가 바뀌었거나 지워졌을 수 있습니다.
      </p>
      <NotFoundLinks />
    </main>
  );
}
