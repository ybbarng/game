"use client";

import { useFairBar } from "@/net/fair-bar";

/**
 * 암호화방 띠: 함께 섞는 중, 부정 감지(누가·무엇을), 끊긴 사람을 기다리는 동안 끝내기·투표.
 * 화투 셋·원카드의 온라인 대국 화면 위쪽에 놓는다(마이티·하트는 판 위에 `FairOverlays`로 그린다)
 */
export function FairBar({
  me,
  over,
}: {
  me: number;
  /** 게임이 끝났다(끊긴 사람을 기다리지 않는다) */
  over: boolean;
}) {
  const {
    incident,
    shuffling,
    fair,
    endGame,
    endVote,
    voteEnd,
    names,
    offline,
  } = useFairBar();
  if (!fair) return null;
  const nameOf = (seat: number) =>
    seat === me ? "내 자리" : (names[seat] ?? `${seat + 1}번 자리`);
  const waiting = over ? [] : offline.map(nameOf);
  return (
    <>
      {incident && (
        <div
          role="alert"
          className="w-full max-w-3xl rounded-xl border border-rose-300/60 bg-rose-800/95 px-3 py-2 text-center text-sm short-landscape:col-span-2"
        >
          <div className="font-bold">
            ⚠ 부정 감지 —{" "}
            {incident.pending
              ? "누가 했는지 확인하는 중…"
              : incident.seat === null
                ? "누군지는 가릴 수 없어요."
                : nameOf(incident.seat)}
          </div>
          <div className="mt-0.5 text-xs opacity-90">{incident.reason}</div>
          <div className="mt-1 text-[11px] opacity-75">
            {incident.own
              ? "내 기기가 직접 확인한 거예요. 이 판을 멈췄어요."
              : "판을 진행하는 방장 기기가 찾아 판을 멈췄어요(내 기기는 따로 확인하지 못했어요)."}
          </div>
        </div>
      )}
      {shuffling && shuffling !== "wait" && !incident && (
        <p
          role="status"
          className="w-full max-w-3xl rounded-xl bg-black/50 px-3 py-1.5 text-center text-sm short-landscape:col-span-2"
        >
          🔐{" "}
          {shuffling === "redeal"
            ? "바닥에 같은 달 넉 장이 깔려 다시 섞는 중…"
            : "모두 함께 섞고 나누는 중…"}
        </p>
      )}
      {waiting.length > 0 && !incident && (
        <div
          role="status"
          className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-2 rounded-xl bg-black/70 px-3 py-2 text-center text-sm short-landscape:col-span-2"
        >
          {waiting.join(", ")}님 연결이 끊겼어요. 그 사람 카드는 그 사람만 열 수
          있어 돌아오기를 기다려요.
          {endVote && voteEnd ? (
            <span className="flex items-center gap-1">
              {endVote.voters.includes(me) &&
              !endVote.votes.some((v) => v.seat === me) ? (
                <>
                  <button
                    type="button"
                    onClick={() => voteEnd(true)}
                    className="rounded-lg bg-rose-500 px-2 py-0.5 font-semibold"
                  >
                    그만하기
                  </button>
                  <button
                    type="button"
                    onClick={() => voteEnd(false)}
                    className="rounded-lg bg-white/15 px-2 py-0.5"
                  >
                    더 기다리기
                  </button>
                </>
              ) : (
                <span className="text-xs opacity-70">
                  투표 {endVote.votes.filter((v) => v.end).length}/
                  {endVote.voters.length}
                </span>
              )}
            </span>
          ) : endGame ? (
            <button
              type="button"
              onClick={endGame}
              className="rounded-lg bg-rose-500 px-3 py-1 font-semibold"
            >
              그만하기
            </button>
          ) : null}
        </div>
      )}
    </>
  );
}
