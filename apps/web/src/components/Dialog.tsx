"use client";

import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";

import { cn } from "@/lib/cn";

/** 열린 대화 상자 차례. Esc·Tab은 맨 위 것만 받는다(설정 메뉴에서 용어 사전을 여는 것처럼 겹칠 때) */
const openStack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest("[inert]"),
  );
}

/**
 * 판 중 설정·점수판·규칙 편집·용어 사전처럼 판 위에 뜨는 대화 상자의 공통 틀.
 *
 * - `role="dialog"`, `aria-modal`, 이름(`label` 또는 `labelledBy`)
 * - 열리면 처음 초점(`initialFocus`, 없으면 상자 안 첫 단추·입력, 그것도 없으면 상자 자체)
 * - Esc로 닫기, Tab은 상자 안에서만 돈다
 * - 닫히면 연 단추로 초점을 되돌린다
 * - 바깥(겹침)을 누르면 닫는다
 * - 겹침 순서는 판·알림(화투 판 230·알림 350·채팅 380)보다 위, 온라인 나가기 확인(LeaveConfirm 900)보다 아래
 */
export function Dialog({
  onClose,
  closeOnOutside = true,
  label,
  labelledBy,
  initialFocus,
  overlayClassName,
  className,
  style,
  children,
  ...data
}: {
  onClose: () => void;
  /** 바깥을 누르면 닫는다(고치던 것을 잃는 화면은 끈다) */
  closeOnOutside?: boolean;
  /** 상자 이름(제목이 없을 때) */
  label?: string;
  /** 상자 이름이 될 제목의 id */
  labelledBy?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  /** 겹침 모양(어둡게 덮기·상자 자리) */
  overlayClassName?: string;
  /** 상자 모양 */
  className?: string;
  /** 상자 자리(연 단추에 맞춰 띄울 때) */
  style?: CSSProperties;
  children: ReactNode;
  [data: `data-${string}`]: string | boolean | undefined;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const firstFocus = useRef(initialFocus);

  // 처음 열 때 한 번만(닫기 함수·처음 초점은 ref로 읽는다)
  useEffect(() => {
    const id = Symbol("dialog");
    openStack.push(id);
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const box = panel.current;
    if (box) {
      const first = firstFocus.current?.current ?? focusables(box)[0] ?? box;
      first.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const items = focusables(box);
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) {
        e.preventDefault();
        box.focus();
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey && (active === firstItem || active === box)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      } else if (!(active instanceof Node) || !box.contains(active)) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const at = openStack.indexOf(id);
      if (at >= 0) openStack.splice(at, 1);
      // 연 단추가 아직 화면에 있으면 그리로 초점을 돌려준다
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className={cn("fixed inset-0 z-[800]", overlayClassName)}
      onPointerDown={(e) => {
        if (closeOnOutside && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn("outline-none", className)}
        style={style}
        {...data}
      >
        {children}
      </div>
    </div>
  );
}
