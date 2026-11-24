"use client";

import type { GroupName } from "@game/fair-play";

import { useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";
import type { LobbyState } from "@/net/protocol";

/**
 * 방 만들기: 암호화방(멘탈 포커, 기본)과 일반방 중 고른다. 고른 것은 다음에도 기억한다.
 * 암호화방은 방장도 남의 패를 모르지만 판 시작·판 끝에 계산이 든다(느린 폰이 섞이면 몇 초씩)
 */
export function RoomKindPicker() {
  const fairPlay = useSettings((s) => s.fairPlay);
  const setFairPlay = useSettings((s) => s.setFairPlay);
  const kinds = [
    {
      fair: true,
      icon: "🔐",
      title: "암호화방(추천)",
      detail:
        "방장 기기도 남의 패를 볼 수 없고, 속이면 그 자리에서 짚어요. 판 시작·끝에 계산이 들어 느린 폰이 섞이면 몇 초씩 걸릴 수 있어요.",
    },
    {
      fair: false,
      icon: "🔓",
      title: "일반방",
      detail:
        "방장 기기가 섞어서 가볍고 빨라요. 방장 기기에는 모든 패가 있어요(판 끝에 섞기와 진행은 확인해요). 믿는 친구끼리 할 때 써요.",
    },
  ];
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm">방 종류</legend>
      {kinds.map((k) => (
        <label
          key={k.title}
          className={cn(
            "flex cursor-pointer gap-2 rounded-xl border px-3 py-2",
            fairPlay === k.fair
              ? "border-amber-300 bg-amber-300/10"
              : "border-white/15 bg-black/30 hover:bg-white/5",
          )}
        >
          <input
            type="radio"
            name="room-kind"
            checked={fairPlay === k.fair}
            onChange={() => setFairPlay(k.fair)}
            className="mt-1 accent-amber-300"
          />
          <span className="flex flex-col">
            <span className="font-semibold text-sm">
              {k.icon} {k.title}
            </span>
            <span className="text-xs leading-relaxed opacity-75">
              {k.detail}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** 대기실: 암호화방(멘탈 포커)인지 일반방인지. 방장은 시작 전에 바꿀 수 있다 */
export function FairLine({
  lobby,
  isHost,
  setFair,
}: {
  lobby: LobbyState;
  isHost: boolean;
  setFair: (fair: { group: GroupName } | null) => void;
}) {
  const fairPlay = useSettings((s) => s.fairPlay);
  const setFairPlay = useSettings((s) => s.setFairPlay);
  if (lobby.seats.length < 2) return null;
  const on = lobby.fair !== undefined;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-emerald-950/60 px-3 py-2 text-xs">
      <span aria-hidden>{on ? "🔐" : "🔓"}</span>
      <span className="flex-1 leading-relaxed">
        {on ? (
          <>
            <b>암호화방</b> — 멘탈 포커로 함께 섞어요. 방장 기기도 남의 카드를
            볼 수 없고, 판마다 진행을 모두가 다시 계산해 확인해요.{" "}
            <a
              href="/security#mental-poker"
              target="_blank"
              className="underline opacity-80"
              rel="noopener"
            >
              어떻게?
            </a>
          </>
        ) : (
          <>
            <b>일반방</b> — 방장 기기가 섞어요(방장 기기에는 모든 패가 있어요).
            판 끝에 섞기와 진행을 확인해요.
          </>
        )}
      </span>
      {isHost && (
        <button
          type="button"
          onClick={() => {
            const next = !fairPlay;
            setFairPlay(next);
            setFair(next ? { group: "r255" } : null);
          }}
          className="shrink-0 rounded bg-white/10 px-1.5 py-0.5"
        >
          {on ? "일반방으로" : "암호화방으로"}
        </button>
      )}
    </div>
  );
}
