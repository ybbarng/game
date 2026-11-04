"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { createConsoleEgg } from "./print";

/** 페이지를 다시 그려도 이어지게 모듈에 하나만 둔다(개발 모드에서 효과가 두 번 돌아도 한 번만 찍힌다) */
let show: ((pathname: string) => boolean) | null = null;

/**
 * 개발자 도구 콘솔 인사(`eggs.ts`). 화면에는 아무것도 그리지 않는다.
 * 서버 그리기·정적 빌드에서는 돌지 않게 효과 안에서만 콘솔을 만진다.
 */
export function ConsoleEgg() {
  const pathname = usePathname();
  useEffect(() => {
    show ??= createConsoleEgg(console, window.location.origin);
    show(pathname);
  }, [pathname]);
  return null;
}
