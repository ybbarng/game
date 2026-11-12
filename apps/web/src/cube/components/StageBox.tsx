import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import { backViewFor } from "../back-view";
import type { BackView } from "../settings";

/**
 * 지금 보일 뒷면 보기(설정 「거울 / 끔」, docs/47 5절). `ref`를 `StageBox`의 `boxRef`에 넘기면 놓인 자리의 폭을
 * 재어, 거울인데 자리가 좁으면(배우기 곁 그림 등) 거울 없이 큐브만 보인다. 3D를 못 그리면 거울도 없다
 */
export function useBackView(
  setting: BackView,
  can3d: boolean,
  /** 거울 판을 보일 가장 좁은 자리(기본 `MIRROR_MIN_WIDTH`, 보기만 하는 큐브는 `MIRROR_VIEW_MIN_WIDTH`) */
  minWidth?: number,
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
  return { ref, mode: backViewFor(setting, width, can3d, minWidth) };
}

/**
 * 큐브 자리(정사각형, `relative`로 위에 얹는 작은 표시는 그대로 둘 수 있다)를 가운데에 두고 폭을 잰다.
 * 예전에는 곁에 펼친 그림을 두었지만 없앴다(2026-11-05 사용자 「전개도는 쓰지 말고」). 거울이면 부르는 쪽이
 * `maxWidth`를 넓혀 판까지 들인다.
 */
export function StageBox({
  stage,
  maxWidth,
  boxRef,
}: {
  stage: ReactNode;
  /** 큐브 자리의 최대 너비(px, 또는 CSS 길이: 화면 높이에 맞출 때 `min(600px, calc(100dvh - …))`) */
  maxWidth: number | string;
  /** 자리 재기(`useBackView`의 `ref`) */
  boxRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={boxRef} className="flex w-full flex-col items-center">
      <div className="w-full min-w-0" style={{ maxWidth }}>
        {stage}
      </div>
    </div>
  );
}
