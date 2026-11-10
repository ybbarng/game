"use client";

import { useEffect, useRef, useState } from "react";
import { emblemPng } from "../tiers/emblemImage";
import type { MyTier } from "../tiers/rank";
import { TierEmblem } from "../tiers/TierEmblem";
import { toApp } from "./app-bridge";
import { loadMiniProfile, profileTierText } from "./profile";
import { miniTier } from "./store";

/** 메뉴 칸의 엠블럼 너비(pt). 앱이 같은 크기로 그린다(`ProfileMenuView.swift`) */
export const PROFILE_EMBLEM_PT = 32;

/**
 * 앱 메뉴 맨 위 프로필 칸에 보일 것을 앱에 알린다(docs/47 15-22). 지금 크기의 티어 엠블럼을 화면 밖에 그려 PNG로
 * 떼어 함께 보낸다. 크기가 바뀌거나 기록이 더해지면(`version`) 다시 보낸다. 화면에는 아무것도 보이지 않는다
 */
export function ProfileToApp({ n, version }: { n: number; version: unknown }) {
  const [mine, setMine] = useState<MyTier | null | undefined>(undefined);
  const hostRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version은 기록이 바뀐 때를 알리는 값
  useEffect(() => {
    setMine(miniTier(n));
  }, [n, version]);

  useEffect(() => {
    if (mine === undefined) return;
    let stale = false;
    const profile = loadMiniProfile();
    const send = (emblem: string | null) => {
      if (stale) return;
      toApp({
        type: "profile",
        ...profile,
        n,
        tier: mine?.place.tier ?? null,
        tierText: profileTierText(n, mine),
        emblem,
      });
    };
    const host = hostRef.current;
    if (!mine || !host) {
      send(null);
      return;
    }
    // 메뉴는 2배 화면에도 또렷하게(실제 화소 = pt × 2)
    void emblemPng(host, PROFILE_EMBLEM_PT * 2).then(send);
    return () => {
      stale = true;
    };
  }, [mine, n]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      data-mini-profile-emblem={mine?.place.tier}
      className="pointer-events-none fixed top-0 -left-[200px] opacity-0"
    >
      {mine && (
        <TierEmblem
          tier={mine.place.tier}
          size={PROFILE_EMBLEM_PT}
          still
          noHdr
        />
      )}
    </div>
  );
}
