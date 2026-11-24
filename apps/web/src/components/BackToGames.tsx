import { cn } from "@/lib/cn";

import { HIT_AREA } from "./hit-area";

/** 게임 첫 화면 왼쪽 위의 "← 게임 목록". 모든 게임이 같은 자리에 둔다(누르는 자리 44px) */
export function BackToGames() {
  return (
    <a
      href="/"
      className={cn(
        HIT_AREA,
        "self-start text-sm text-white/70 hover:text-white",
      )}
    >
      ← 게임 목록
    </a>
  );
}
