"use client";

import { useEffect, useState } from "react";

/**
 * 조용히 새 화면으로(2026-11-02 사용자): 배포 전에 열어 둔 탭·홈 화면 앱은 새로 고치기 전까지 옛 코드로 돈다
 * (옛 화면 조각 파일이 사라져 다른 화면으로 옮길 때 깨지거나, 새 서버와 어긋날 수 있다). 화면은 자기 판 번호(빌드한 커밋)를
 * 알고, 배포된 판 번호(/version.json, scripts/write-version.mjs)와 다르면 "새 판이 있다"를 기억한다. 바꾸는 것은
 * 다음에 사람이 화면을 옮길 때 그 주소를 새로 불러오는 것으로(StardrawApp go), 하던 일을 끊지 않는다
 */
export const MY_BUILD = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "";

/** 배포된 판 번호를 다시 묻는 간격 */
const CHECK_MS = 5 * 60_000;

/** 배포된 판 번호. 못 받으면 null(개발 서버, 잠깐 끊김) */
export async function deployedBuild(): Promise<string | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { commit?: unknown };
    return typeof body.commit === "string" ? body.commit : null;
  } catch {
    return null;
  }
}

/** 새 판이 나왔는지: 화면을 연 직후, CHECK_MS마다, 탭으로 돌아올 때 묻는다. 한 번 나왔으면 계속 true */
export function useStaleBuild(): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!MY_BUILD || MY_BUILD === "unknown") return;
    let alive = true;
    const check = () => {
      void deployedBuild().then((v) => {
        if (alive && v && v !== "unknown" && v !== MY_BUILD) setStale(true);
      });
    };
    check();
    const t = window.setInterval(check, CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return stale;
}

const RELOADED_KEY = "stardraw-chunk-reloaded";

/** 옛 화면 조각을 못 찾은 오류인지(배포로 파일이 바뀐 뒤 옛 탭에서 다른 화면을 불러올 때) */
function isChunkError(reason: unknown): boolean {
  const text =
    reason instanceof Error
      ? `${reason.name} ${reason.message}`
      : typeof reason === "string"
        ? reason
        : "";
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(
    text,
  );
}

/** 화면 조각을 못 찾으면 한 번 새로 고친다(세션에 표시해 되풀이하지 않는다) */
export function useChunkErrorReload(): void {
  useEffect(() => {
    const reload = (reason: unknown) => {
      if (!isChunkError(reason)) return;
      try {
        if (sessionStorage.getItem(RELOADED_KEY)) return;
        sessionStorage.setItem(RELOADED_KEY, "1");
      } catch {
        return;
      }
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => reload(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reload(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}
