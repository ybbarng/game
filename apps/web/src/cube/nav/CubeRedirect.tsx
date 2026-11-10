"use client";

import { useEffect } from "react";

import { redirectTarget } from "./redirect";

/**
 * 옛 주소의 page가 그리는 것(docs/47 16-6). 열리면 바로 새 주소로 바꾼다(뒤로 가기에 옛 주소가 남지 않게
 * `location.replace`). 스크립트가 돌기 전이나 막혔을 때를 위해 새 주소 링크를 둔다.
 */
export function CubeRedirect({ to, label }: { to: string; label: string }) {
  useEffect(() => {
    window.location.replace(
      redirectTarget(to, window.location.search) + window.location.hash,
    );
  }, [to]);
  return (
    <main
      data-game="cube"
      data-cube-redirect={to}
      className="flex min-h-dvh items-center justify-center bg-neutral-900 p-4 text-white"
    >
      <a href={to} className="underline underline-offset-2">
        {label}
      </a>
    </main>
  );
}
