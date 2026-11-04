import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/cn";

import { backViewFor } from "../back-view";
import type { BackView } from "../settings";

/**
 * 지금 보일 뒷면 보기(설정 「거울 / 펼친 그림 / 끔」, docs/47 5절). `ref`를 `StageWithNet`의 `boxRef`에 넘기면
 * 놓인 자리의 폭을 재어, 거울인데 자리가 좁으면(배우기 곁 그림 등) 펼친 그림으로 넘어간다. 3D를 못 그리면 펼친 그림
 */
export function useBackView(
  setting: BackView,
  can3d: boolean,
): { ref: RefObject<HTMLDivElement | null>; mode: BackView } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const read = () => setWidth(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, mode: backViewFor(setting, width, can3d) };
}

/**
 * 3D 큐브 자리와 펼친 그림을 겹치지 않게 나란히 둔다. 놓인 자리가 넓으면(폭 32rem 이상) 큐브 오른쪽,
 * 좁으면(휴대폰 세로, 배우기 곁 그림 등) 큐브 아래. 화면 폭이 아니라 놓인 상자 폭으로 정한다(곁 그림 220px
 * 상자 안에서 옆으로 놓아 3D 폭이 0이 되었다, 2026-11-04 점검). 예전에는 펼친 그림을 큐브 왼쪽 위에 얹어 두어 큐브 모서리를 가렸다(2026-11-04 사용자).
 * `stage`는 큐브 자리(정사각형, `relative`로 위에 얹는 작은 표시는 그대로 둘 수 있다).
 * 뒷면 보기가 거울이면 펼친 그림 없이(`net` null) 큐브 자리를 넓혀 판까지 들인다(부르는 쪽이 `maxWidth`를 넓힌다).
 */
export function StageWithNet({
  stage,
  net,
  maxWidth,
  boxRef,
}: {
  stage: ReactNode;
  /** 펼친 그림. 없으면 큐브만 */
  net: ReactNode | null;
  /** 큐브 자리의 최대 너비(px) */
  maxWidth: number;
  /** 자리 재기(`useBackView`의 `ref`) */
  boxRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={boxRef} className="@container w-full">
      <div
        className={cn(
          "flex w-full flex-col items-center gap-2",
          net && "@lg:flex-row @lg:items-center @lg:justify-center @lg:gap-4",
        )}
      >
        <div className="w-full min-w-0" style={{ maxWidth }}>
          {stage}
        </div>
        {net && (
          <div
            data-cube-net-side
            className="w-3/5 max-w-[220px] shrink-0 rounded-lg bg-black/30 p-2 @lg:w-[200px]"
          >
            {net}
          </div>
        )}
      </div>
    </div>
  );
}
