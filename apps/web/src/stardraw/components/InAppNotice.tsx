"use client";

import { useEffect, useState } from "react";
import { browserName, inAppBrowser, openOutside } from "../passkey-env";

/**
 * 앱 안 브라우저(카톡 등)는 패스키가 막힌다: 기기의 브라우저로 열게 한다. 카카오톡·라인은 바로 여는 단추(`openOutside`),
 * 그 밖은 주소를 복사해 준다. 입구 안내(KeySetup)와 관측지(누른 단추 바로 아래)가 같이 쓴다
 */
export function InAppNotice({ app, ua }: { app: string; ua: string }) {
  const [copied, setCopied] = useState(false);
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => setHref(location.href), []);
  const outside = href ? openOutside(app, ua, href) : null;
  return (
    <div
      role="note"
      className="flex flex-col gap-2 rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-sm"
    >
      <p className="break-keep text-amber-50">
        {app} 안에서는 패스키를 쓸 수 없어요. {browserName(ua)} 열어 주세요.
      </p>
      {outside && (
        <a
          href={outside.url}
          data-open-outside
          className="sd-cta self-stretch rounded-xl py-2.5 text-center font-bold text-slate-950"
        >
          {outside.label}
        </a>
      )}
      {outside?.steps && (
        <p className="break-keep text-amber-50/75 text-xs">{outside.steps}</p>
      )}
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(location.href);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        className="self-start rounded-lg border border-amber-200/40 px-3 py-1.5 text-amber-50 hover:bg-amber-200/10"
      >
        {copied ? "주소를 복사했어요" : "주소 복사"}
      </button>
    </div>
  );
}

/** 패스키를 못 쓰는 브라우저 안내: 앱 안 브라우저면 바깥으로 여는 안내, 아니면 한 줄 */
export function PasskeyBlockedNotice() {
  const ua = navigator.userAgent;
  const app = inAppBrowser(ua);
  return app ? (
    <InAppNotice app={app} ua={ua} />
  ) : (
    <p role="note" className="break-keep text-sm text-white/80">
      이 브라우저는 패스키를 지원하지 않아요. 최신 Safari·Chrome으로 열어
      주세요.
    </p>
  );
}
