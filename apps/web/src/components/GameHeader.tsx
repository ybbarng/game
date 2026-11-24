import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { HIT_AREA } from "./hit-area";

/**
 * 판 게임(오목·바둑·장기·체스·숫자야구·윷놀이·은하)의 머리줄: 왼쪽 「← 게임 이름」, 가운데 판 정보,
 * 오른쪽 「설정」(공통 `GameSettingsButton`). 모든 게임이 같은 자리·같은 모양이다.
 */
export function GameHeader({
  exitLabel,
  onExit,
  info,
  settings,
  className,
}: {
  /** 나가기 단추 글(「← 오목」) */
  exitLabel: ReactNode;
  onExit: () => void;
  /** 판 정보(오른쪽으로 붙는다) */
  info: ReactNode;
  /** 「설정」 단추 */
  settings?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex w-full items-center gap-2 text-sm", className)}>
      <button
        type="button"
        onClick={onExit}
        className={cn(HIT_AREA, "shrink-0 text-white/70 hover:text-white")}
      >
        {exitLabel}
      </button>
      <span className="ml-auto min-w-0 truncate text-right text-white/60">
        {info}
      </span>
      {settings}
    </header>
  );
}
