"use client";

import { usePathname } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  autoOpen,
  autoOpenTarget,
  BUREAU,
  bandText,
  inAppText,
  LINE_OUTSIDE,
  NO_PASSKEY_TEXT,
  type Outside,
  openOutside,
  passkeyReach,
  webviewName,
} from "../passkey-env";
import {
  dismissStall,
  passkeyStall,
  type StallWhy,
  subscribeStall,
} from "../passkey-watch";
import { BureauLogo } from "./BureauMarks";

/** 우주국 안내의 머리: 작은 로고와 「카노푸스 우주국」(방송 토스트와 같은 결) */
export function BureauHead() {
  return (
    <span className="flex items-center gap-1.5 font-semibold text-amber-200 text-xs tracking-wide">
      <BureauLogo className="size-3.5" />
      {BUREAU}
    </span>
  );
}

/** 우주국이 내는 한 줄 안내(머리 + 글) */
export function BureauNote({ text }: { text: string }) {
  return (
    <div
      role="note"
      data-bureau-note
      className="flex flex-col items-center gap-1"
    >
      <BureauHead />
      <p className="break-keep text-sm text-white/80">{text}</p>
    </div>
  );
}

/** 지금 주소(첫 그리기 뒤에 읽는다. 서버 그리기에는 location이 없다) */
function useHref(): string | null {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => setHref(location.href), []);
  return href;
}

/** 주소 복사 단추 */
function CopyLink({ className }: { className: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-copy-link
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
      className={className}
    >
      {copied ? "주소를 복사했어요" : "주소 복사"}
    </button>
  );
}

/** 바깥 브라우저로 여는 단추(띠와 안내가 같은 것을 쓴다) */
function OpenOutsideLink({
  outside,
  className,
}: {
  outside: Outside;
  className: string;
}) {
  return (
    <a href={outside.url} data-open-outside className={className}>
      {outside.label}
    </a>
  );
}

/**
 * 앱 안 브라우저(웹뷰)에서 패스키가 되지 않을 때: 기기의 브라우저로 열게 한다. 여는 길은 `openOutside`(카카오톡·라인은
 * 그 앱의 길, 그 밖은 안드로이드 intent·iOS x-safari-https), 단추로 안 열릴 때를 위해 메뉴 자리와 주소 복사를 함께 둔다.
 * 앱 안이라도 WebAuthn이 있으면 먼저 시도하게 두고(2026-11-03 사용자), 시도가 실패한 그 자리(신청서·신분증 제시 틀·오류
 * 칸)에 이 안내를 띄운다. `sure`는 WebAuthn이 아예 없어 미리 알리는 때. `app`은 webviewName(모르는 앱은 「이 앱」)
 */
export function InAppNotice({
  app,
  ua,
  sure = false,
}: {
  app: string;
  ua: string;
  sure?: boolean;
}) {
  const href = useHref();
  const outside = href ? openOutside(ua, href) : null;
  return (
    <div
      role="note"
      data-in-app-notice={sure ? "sure" : "tried"}
      className="flex flex-col gap-2 rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-sm"
    >
      <BureauHead />
      <p className="break-keep text-amber-50">{inAppText(app, ua, sure)}</p>
      {outside && (
        <OpenOutsideLink
          outside={outside}
          className="sd-cta self-stretch rounded-xl py-2.5 text-center font-bold text-slate-950"
        />
      )}
      {outside?.steps && (
        <p className="break-keep text-amber-50/75 text-xs">{outside.steps}</p>
      )}
      <CopyLink className="self-start rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-50 hover:bg-amber-200/10" />
    </div>
  );
}

/** 앱 안 브라우저에서 패스키 시도가 실패한 자리의 안내(`app`은 inAppFailed가 준 앱 이름) */
export function InAppTriedNotice({ app }: { app: string }) {
  return <InAppNotice app={app} ua={navigator.userAgent} />;
}

/** WebAuthn이 없는 브라우저 안내: 앱 안 브라우저면 바깥으로 여는 안내, 아니면 한 줄 */
export function PasskeyBlockedNotice() {
  const ua = navigator.userAgent;
  const app = webviewName(ua);
  return app ? (
    <InAppNotice app={app} ua={ua} sure />
  ) : (
    <BureauNote text={NO_PASSKEY_TEXT} />
  );
}

/** 띠를 두지 않는 별 따기 주소: 흉내(데모)는 흉내 창을 쓰고, 국장 화면은 PC에서만 쓴다 */
const NO_BAND = ["/stardraw/demo", "/stardraw/admin"];

/**
 * 웹뷰 위쪽 띠(docs/36 11-54). 웹뷰이고 미리 알아보니 패스키가 안 될 것 같으면 별 따기 모든 화면 위쪽에 한 줄
 * 「{앱} 안에서는 등록·예측이 되지 않을 수 있어요.」와 바깥 브라우저로 여는 단추. 글을 누르면 메뉴 자리와 주소 복사를 펼친다
 * (늘 펼쳐 두면 군더더기가 된다, docs/41 5절). 둘러보기·관측·숨어서 관측은 그대로 쓸 수 있어 막지 않는다.
 * 처음 열 때 몸짓 없이 시도해도 되는 길(카카오톡·라인)이면 탭마다 한 번 바깥 브라우저로 넘긴다. 넘긴 뒤 이 화면에는 다른
 * 말을 더하지 않고 띠만 남긴다.
 * 띠는 화면 위에 고정하고 같은 높이의 빈칸을 앞에 두어 본문을 민다. 위에 고정된 다른 것(PC 메뉴·방송 토스트·마감 표시)은
 * `--sd-band`(띠 높이, safe-area 포함)만큼 내려간다
 */
export function WebviewBand() {
  const path = usePathname();
  const [shown, setShown] = useState<{
    app: string;
    outside: Outside | null;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(0);
  const band = useRef<HTMLDivElement>(null);
  const off = NO_BAND.some((p) => path?.startsWith(p));

  useEffect(() => {
    if (off) return;
    let alive = true;
    void passkeyReach().then((reach) => {
      if (!alive || reach.ok || !reach.webview) return;
      const ua = navigator.userAgent;
      // 라인이 바깥으로 넘긴 꼬리표는 주소에서 지운다(새로 고침·공유에 남지 않게)
      const url = new URL(location.href);
      if (url.searchParams.has(LINE_OUTSIDE)) {
        url.searchParams.delete(LINE_OUTSIDE);
        history.replaceState(history.state, "", url);
      }
      const href = url.toString();
      setShown({ app: webviewName(ua) ?? "", outside: openOutside(ua, href) });
      const target = autoOpenTarget(ua, reach, href);
      if (target)
        autoOpen(target, (u) => {
          location.href = u;
        });
    });
    return () => {
      alive = false;
    };
  }, [off]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 띠가 생기거나 사라질 때(shown·off) 다시 잰다
  useLayoutEffect(() => {
    const el = band.current;
    const root = document.documentElement;
    if (!el) {
      root.style.removeProperty("--sd-band");
      return;
    }
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      setHeight(h);
      root.style.setProperty("--sd-band", `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--sd-band");
    };
  }, [shown, off]);

  if (off || !shown) return null;
  const { app, outside } = shown;
  return (
    <>
      <div aria-hidden="true" style={{ height }} />
      <div
        ref={band}
        role="note"
        data-webview-band
        className="fixed inset-x-0 top-0 z-[60] border-amber-200/25 border-b bg-[#1a1408]/95 text-amber-50 text-sm backdrop-blur-md"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
          >
            <BureauHead />
            <span className="break-keep leading-snug">{bandText(app)}</span>
          </button>
          {outside && (
            <OpenOutsideLink
              outside={outside}
              className="sd-cta shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 font-bold text-slate-950 text-xs"
            />
          )}
        </div>
        {open && (
          <div className="mx-auto flex max-w-xl items-center gap-3 px-4 pb-2.5 text-amber-50/75 text-xs">
            {outside?.steps && (
              <p className="min-w-0 flex-1 break-keep">{outside.steps}</p>
            )}
            <CopyLink className="ml-auto shrink-0 rounded-lg border border-amber-200/40 px-2.5 py-1 text-amber-50 hover:bg-amber-200/10" />
          </div>
        )}
      </div>
    </>
  );
}

/** 패스키 무응답 안내의 문구(docs/36 11-55). 우주국이 내는 글이라 「~습니다」 */
export function stallText(why: StallWhy, app: string | null): string {
  const first =
    why === "quiet"
      ? "확인 창이 열리지 않은 것 같습니다."
      : "확인이 아직 끝나지 않았습니다.";
  return app
    ? `${first} ${app} 안에서는 패스키가 열리지 않을 수 있습니다.`
    : `${first} 이 브라우저에서는 패스키가 열리지 않을 수 있습니다. 다른 브라우저(Safari·Chrome)에서 열어 보세요.`;
}

/** 화면 가장자리와 띄울 거리(px) */
const GUTTER = 16;

/**
 * 패스키를 불렀는데 답이 없을 때의 안내(passkey-watch). 누른 자리 바로 아래(자리가 없으면 위)에 띄운다. 웹뷰면 바깥
 * 브라우저로 여는 단추, 아니면 주소 복사와 함께 「다시 시도」(페이지를 다시 연다: 멈춘 호출은 끊지 않으므로 같은 페이지에서
 * 다시 부르면 「이미 진행 중」으로 막힌다. 바구니의 별은 저장해 둔다). 늦게라도 답이 오면 걷힌다
 */
export function PasskeyStallNotice() {
  const stall = useSyncExternalStore(subscribeStall, passkeyStall, () => null);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!stall || !el) {
      setPos(null);
      return;
    }
    const place = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const me = el.getBoundingClientRect();
      const a = stall.anchor?.isConnected
        ? stall.anchor.getBoundingClientRect()
        : null;
      const left = Math.min(
        Math.max(GUTTER, (a ? a.left + a.width / 2 : w / 2) - me.width / 2),
        Math.max(GUTTER, w - GUTTER - me.width),
      );
      let top = a ? a.bottom + 8 : h - me.height - 96;
      if (a && top + me.height > h - GUTTER) top = a.top - 8 - me.height;
      top = Math.min(
        Math.max(GUTTER, top),
        Math.max(GUTTER, h - GUTTER - me.height),
      );
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, { capture: true });
    };
  }, [stall]);
  if (!stall) return null;
  const ua = navigator.userAgent;
  const app = webviewName(ua);
  const outside = openOutside(ua, location.href);
  return (
    <div
      ref={box}
      role="alert"
      data-passkey-stall={stall.why}
      className="fixed z-[90] flex w-[calc(100vw-32px)] max-w-sm flex-col gap-2 rounded-2xl border border-amber-200/30 bg-slate-950/95 px-4 py-3 text-left text-sm shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur"
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { visibility: "hidden", top: 0, left: 0 }
      }
    >
      <div className="flex items-center justify-between gap-2">
        <BureauHead />
        <button
          type="button"
          aria-label="닫기"
          onClick={dismissStall}
          className="-mr-1 rounded-md px-1.5 text-white/60 hover:text-white"
        >
          ×
        </button>
      </div>
      <p className="break-keep text-white/90 leading-snug">
        {stallText(stall.why, app)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {outside && (
          <OpenOutsideLink
            outside={outside}
            className="sd-cta rounded-lg px-3 py-1.5 font-bold text-slate-950 text-xs"
          />
        )}
        <button
          type="button"
          onClick={() => location.reload()}
          className="rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-50 text-xs hover:bg-amber-200/10"
        >
          다시 시도
        </button>
        {!outside && (
          <CopyLink className="rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-50 text-xs hover:bg-amber-200/10" />
        )}
      </div>
    </div>
  );
}
