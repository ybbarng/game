"use client";

// 분해한 큐브의 속 3D 그림(크기 2~5). 큐브의 기초 맨 위(docs/47 16-27·16-36).
// - 3D 장면 하나(천천히 돌고, 끌어 돌린다). 불러오는 동안은 같은 크기의 빈 자리만 둔다(그림이 바뀌며 튀지 않게)
// - 3D를 못 그리거나 문맥을 잃으면 같은 조각을 떼어 놓은 SVG 그림(ExplodedCube)
import { useEffect, useRef, useState } from "react";

import { loadCoreScene } from "../view";
import type { ModelSize } from "../view/core-layout";
import { ExplodedCube } from "./ExplodedCube";

/** 부모 폭을 다 쓰는 정사각형 */
export function CoreCube({
  colors,
  n = 3,
}: {
  colors: readonly number[];
  n?: ModelSize;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  // 설정 색이 같으면 장면을 다시 만들지 않는다(설정을 읽기 전·뒤 배열이 달라도)
  const key = `${n}:${colors.join(",")}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 크기·색은 key로 본다
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let scene: import("../view/core-scene").CoreScene | null = null;
    const ro = new ResizeObserver(() => scene?.resize());
    loadCoreScene()
      .then(({ CoreScene }) => {
        if (disposed) return;
        scene = CoreScene.create(canvas, {
          colors,
          n,
          onLost: () => setFailed(true),
        });
        canvas.dataset.coreCube = "live";
        ro.observe(canvas);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      scene?.dispose();
    };
  }, [key]);

  if (failed) return <ExplodedCube colors={colors} n={n} size="100%" />;
  return (
    <canvas
      ref={canvasRef}
      className="block aspect-square w-full"
      data-core-cube="loading"
      data-core-size={n}
      aria-hidden
    />
  );
}
