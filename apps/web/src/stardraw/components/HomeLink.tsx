import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** 집 그림(탭 「홈」, 메뉴 줄 「홈」, 앱 밖 페이지의 「홈」 링크가 같이 쓴다) */
export const HOME_ICON = (
  <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />
);

/** 메뉴 그림 틀(선 그림 24칸) */
export function NavIcon({
  className = "size-4",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** 메뉴 항목 모양(PC 메뉴 줄 항목, 메뉴가 없는 화면의 「홈」 단추, 앱 밖 페이지의 「홈」 링크) */
export const MENU_ITEM_CLASS =
  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors";
export const MENU_ITEM_OFF = "text-white/65 hover:bg-white/5 hover:text-white";

/**
 * 앱 밖 페이지(설명·배우기·검증·소속·등록증·우주국·개인정보·공유 예측서·데모·관리)와 확인 링크에서 별 따기 홈으로 가는 링크.
 * 앱 안의 「홈」과 같은 그림·이름이다(2026-11-02 사용자: 어떤 곳은 「홈」, 어떤 곳은 「하늘의 별 따기」라 하나로).
 * 왼쪽 여백만큼 당겨 그림 첫머리가 본문 첫머리와 맞고, 세로 줄에 놓여도 줄 전체로 늘어나지 않는다
 */
export function HomeLink({ className }: { className?: string }) {
  return (
    <a
      href="/stardraw"
      data-home-link
      className={cn(MENU_ITEM_CLASS, MENU_ITEM_OFF, "-ml-3 w-fit", className)}
    >
      <NavIcon>{HOME_ICON}</NavIcon>홈
    </a>
  );
}
