import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "큐브 티어표" },
  robots: { index: false, follow: false },
};

/**
 * 없앤 개발용 엠블럼 미리보기 주소(2026-11-13, 진열을 티어 화면으로 옮김, docs/47 14-7 「진열」). 운영 nginx가 먼저 301로
 * 티어 화면에 보내고(deploy/nginx.conf), nginx 밖(정적 빌드를 그대로 띄운 곳)에서도 바로 넘어가게 이 작은 페이지를 둔다.
 */
export default function OldEmblemPreviewPage() {
  return (
    <main className="min-h-dvh bg-neutral-900 p-4 text-white">
      <meta httpEquiv="refresh" content="0;url=/cube/tiers" />
      <a href="/cube/tiers" className="text-sky-300 underline">
        티어표
      </a>
    </main>
  );
}
