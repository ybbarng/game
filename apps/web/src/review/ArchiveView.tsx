"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ScreenLoading } from "@/components/ScreenLoading";
import { botName } from "@/game/bot-names";
import { useSettings } from "@/game/settings";

import type { GameArchive } from "./archive";
import { GAME_NAME, when } from "./labels";
import { ReplayView } from "./ReplayView";
import { replayArchive } from "./replay";
import { CARD_REPLAY_GAMES, type ReplayTable } from "./replay-table";

/**
 * 복기에서 연 게임 하나. 목록 화면(ReviewPage)이 게임을 고르면 이 파일을 불러온다. 다시 보기 화면은 게임마다
 * 따로 불러와, 오목 기록을 열 때 마이티·바둑 다시 보기까지 받지 않는다(2026-11-25 첫 화면 가볍게)
 */

const loading = () => <ScreenLoading />;
const JanggiReplay = dynamic(
  () => import("@/janggi/components/JanggiReplay").then((m) => m.JanggiReplay),
  { loading },
);
const BadukReplay = dynamic(
  () => import("@/baduk/components/BadukReplay").then((m) => m.BadukReplay),
  { loading },
);
const ChessReplay = dynamic(
  () => import("@/chess/components/ChessReplay").then((m) => m.ChessReplay),
  { loading },
);
const GostopReplay = dynamic(
  () => import("@/gostop/components/GostopReplay").then((m) => m.GostopReplay),
  { loading },
);
const MinhwatuReplay = dynamic(
  () =>
    import("@/minhwatu/components/MinhwatuReplay").then(
      (m) => m.MinhwatuReplay,
    ),
  { loading },
);
const NyrongppongReplay = dynamic(
  () =>
    import("@/nyrongppong/components/NyrongppongReplay").then(
      (m) => m.NyrongppongReplay,
    ),
  { loading },
);
const BaseballReplay = dynamic(
  () =>
    import("@/baseball/components/BaseballReplay").then(
      (m) => m.BaseballReplay,
    ),
  { loading },
);
const YutReplay = dynamic(
  () => {
    // 3D 멍석 장면(three.js)도 다시 보기 화면과 함께 받기 시작한다(화면이 뜬 뒤에 받으면 멍석이 한 박자 늦다)
    void import("@/yut/toss/load").then((m) => m.preloadTossScene());
    return import("@/yut/components/YutReplay").then((m) => m.YutReplay);
  },
  { loading },
);
const GalaxyReplay = dynamic(
  () => import("@/galaxy/components/GalaxyReplay").then((m) => m.GalaxyReplay),
  { loading },
);
const OmokReplay = dynamic(
  () => import("@/omok/components/OmokReplay").then((m) => m.OmokReplay),
  { loading },
);

/** 마이티·하트·원카드 표 묶음(그 게임 화면들)은 카드 게임 기록을 열 때 불러온다 */
const CardArchive = dynamic(
  () =>
    import("./replay-tables").then(
      (m) =>
        function CardArchive(props: {
          archive: GameArchive;
          onBack: () => void;
        }) {
          const table = m.replayTableFor(props.archive.game);
          return table ? <CardArchiveView {...props} table={table} /> : null;
        },
    ),
  { loading },
);

export function ArchiveView({
  archive,
  onBack,
}: {
  archive: GameArchive;
  onBack: () => void;
}) {
  // 마이티·하트·원카드는 게임 화면 위에서 다시 본다. 그 밖의 게임은 게임마다 다시 보기 화면을 쓴다.
  if (CARD_REPLAY_GAMES.includes(archive.game))
    return <CardArchive archive={archive} onBack={onBack} />;
  return <BoardArchiveView archive={archive} onBack={onBack} />;
}

/** 판 게임(오목·장기) 다시 보기 */
function BoardArchiveView({
  archive,
  onBack,
}: {
  archive: GameArchive;
  onBack: () => void;
}) {
  const name = (seat: number) =>
    seat === archive.seat ? "나" : (archive.seatNames?.[seat] ?? "컴퓨터");
  return (
    <main className="min-h-dvh bg-[#1c1917] px-4 py-6 text-white">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <button
          type="button"
          onClick={onBack}
          className="self-start rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
        >
          ← 목록
        </button>
        <h1 className="font-black text-xl">
          {GAME_NAME[archive.game] ?? archive.game} ·{" "}
          {archive.mode === "solo" ? "혼자" : "친구와"} ·{" "}
          {when(archive.startedAt)}
        </h1>
        {archive.game === "janggi" ? (
          <JanggiReplay archive={archive} name={name} />
        ) : archive.game === "baduk" ? (
          <BadukReplay archive={archive} name={name} />
        ) : archive.game === "chess" ? (
          <ChessReplay archive={archive} name={name} />
        ) : archive.game === "gostop" ? (
          <GostopReplay archive={archive} name={name} />
        ) : archive.game === "minhwatu" ? (
          <MinhwatuReplay archive={archive} name={name} />
        ) : archive.game === "nyrongppong" ? (
          <NyrongppongReplay archive={archive} name={name} />
        ) : archive.game === "baseball" ? (
          <BaseballReplay archive={archive} name={name} />
        ) : archive.game === "yut" ? (
          <YutReplay archive={archive} name={name} />
        ) : archive.game === "galaxy" ? (
          <GalaxyReplay archive={archive} name={name} />
        ) : (
          <OmokReplay archive={archive} name={name} />
        )}
      </div>
    </main>
  );
}

/** 판 위 다시 보기(마이티·하트·원카드): 판마다 한눈에 보기 → 게임 화면 위에서 한 걸음씩 */
function CardArchiveView({
  archive,
  table,
  onBack,
}: {
  archive: GameArchive;
  table: ReplayTable;
  onBack: () => void;
}) {
  const botNames = useSettings((s) => s.botNames);
  const replayed = useMemo(
    () => replayArchive(table.kit, archive),
    [table, archive],
  );
  const spans = useMemo(() => table.spans(replayed), [table, replayed]);
  const Round = table.Round;
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const name = (seat: number) =>
    seat === archive.seat
      ? "나"
      : (archive.seatNames?.[seat] ?? botName(botNames, seat));

  if (replayAt !== null)
    return (
      <ReplayView
        table={table}
        replayed={replayed}
        seat={archive.seat}
        seatNames={archive.seatNames}
        spans={spans}
        startIndex={replayAt}
        name={name}
        log={archive.log}
        onExit={() => setReplayAt(null)}
      />
    );

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
          >
            ← 목록
          </button>
          <button
            type="button"
            onClick={() => setReplayAt(0)}
            className="rounded-lg bg-amber-300 px-3 py-1 font-semibold text-black text-sm"
          >
            ▶ 처음부터 다시 보기
          </button>
        </div>
        <h1 className="font-black text-xl">
          {GAME_NAME[archive.game] ?? archive.game} ·{" "}
          {archive.mode === "solo" ? "혼자" : "친구와"} ·{" "}
          {when(archive.startedAt)}
        </h1>
        {replayed.error && (
          <p className="text-sm text-rose-300">{replayed.error}</p>
        )}
        {[...spans].reverse().map((span) => (
          <Round
            key={span.start}
            span={span}
            states={replayed.states}
            events={replayed.events}
            seat={archive.seat}
            name={name}
            onReplay={setReplayAt}
          />
        ))}
      </div>
    </main>
  );
}
