import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * 3D 큐브 자리와 펼친 그림을 겹치지 않게 나란히 둔다. 넓은 화면은 큐브 오른쪽, 좁은 화면(휴대폰 세로)은
 * 큐브 아래. 예전에는 펼친 그림을 큐브 왼쪽 위에 얹어 두어 큐브 모서리를 가렸다(2026-11-04 사용자).
 * `stage`는 큐브 자리(정사각형, `relative`로 위에 얹는 작은 표시는 그대로 둘 수 있다).
 */
export function StageWithNet({
  stage,
  net,
  maxWidth,
}: {
  stage: ReactNode;
  /** 펼친 그림. 없으면 큐브만 */
  net: ReactNode | null;
  /** 큐브 자리의 최대 너비(px) */
  maxWidth: number;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-2",
        net && "sm:flex-row sm:items-center sm:justify-center sm:gap-4",
      )}
    >
      <div className="w-full min-w-0" style={{ maxWidth }}>
        {stage}
      </div>
      {net && (
        <div
          data-cube-net-side
          className="w-3/5 max-w-[220px] shrink-0 rounded-lg bg-black/30 p-2 sm:w-[200px]"
        >
          {net}
        </div>
      )}
    </div>
  );
}
