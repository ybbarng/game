"use client";

import { useEffect, useState } from "react";
import { GameHome } from "@/components/GameHome";
import { RoomScreen } from "@/components/LazyRoomScreen";
import { Chip } from "@/components/options/Chip";
import { Section, SubScreen } from "@/components/options/SubScreen";
import { reviewRunFor } from "@/components/study/review-run";
import { StudyHome } from "@/components/study/StudyHome";
import {
  TimePresetPicker,
  timePresetLabel,
} from "@/components/TimePresetPicker";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useScreenHistory } from "@/game/screen-history";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { ENDGAME_SETS } from "../endgame";
import { chessOnline } from "../online";
import { CHESS_OPENING_SET } from "../openings";
import { useChessStudyProgress, useChessTutorialProgress } from "../progress";
import { CHESS_PUZZLE_SETS } from "../puzzles";
import { endChessSession } from "../session";
import {
  CHESS_LEVELS,
  type ChessLevel,
  type ColorPick,
  type PieceSet,
  useChessSettings,
} from "../settings";
import { type ChessSaved, clearChess, loadChess, useChess } from "../store";
import { CHESS_STUDY_ORDER } from "../study-order";
import { CHESS_LESSONS } from "../tutorial";
import { PieceIcon } from "./ChessBoard";
import { ChessEndgameScreen } from "./ChessEndgameScreen";
import { ChessGame } from "./ChessGame";
import { ChessLineScreen } from "./ChessLineScreen";
import { ChessPuzzleScreen } from "./ChessPuzzleScreen";
import { chessTutorial } from "./chess-tutorial";

/** 체스 화면들의 배경(대국 화면의 짙은 색과 이어진다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]";

const WINS_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 2, label: "3판 2승" },
  { value: 3, label: "5판 3승" },
] as const;

const PICK_OPTIONS: readonly { value: ColorPick; label: string }[] = [
  { value: "white", label: "백(먼저)" },
  { value: "black", label: "흑" },
  { value: "random", label: "무작위" },
];

const PIECE_SET_OPTIONS: readonly { value: PieceSet; label: string }[] = [
  { value: "3d", label: "입체" },
  { value: "glyph", label: "기호" },
];

/** 체스 옵션: 개인 시간·판 수·컴퓨터·내 색·칸 이름. 다함께 체스도 여기서 고른 판 수와 시간을 쓴다 */
function ChessOptions({ onBack }: { onBack: () => void }) {
  const s = useChessSettings();
  const level = CHESS_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="체스 옵션" onBack={onBack} bg={BG} game="chess">
      <Section title="개인 시간">
        <TimePresetPicker value={s.time} onChange={(time) => s.set({ time })} />
      </Section>
      <Section title="판 수">
        <div className="flex flex-wrap gap-1.5">
          {WINS_OPTIONS.map((w) => (
            <Chip
              key={w.value}
              active={s.winsToFinish === w.value}
              onClick={() => s.set({ winsToFinish: w.value })}
            >
              {w.label}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {CHESS_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as ChessLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <Section title="나홀로 체스에서 내 색">
        <div className="flex flex-wrap gap-1.5">
          {PICK_OPTIONS.map((p) => (
            <Chip
              key={p.value}
              active={s.pick === p.value}
              onClick={() => s.set({ pick: p.value })}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="칸 이름">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={s.coordinates}
            onClick={() => s.set({ coordinates: true })}
          >
            보이기(a~h·1~8)
          </Chip>
          <Chip
            active={!s.coordinates}
            onClick={() => s.set({ coordinates: false })}
          >
            감추기
          </Chip>
        </div>
      </Section>
      <Section title="잡힐 기물 표시">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={s.dangerHint}
            onClick={() => s.set({ dangerHint: true })}
          >
            보이기
          </Chip>
          <Chip
            active={!s.dangerHint}
            onClick={() => s.set({ dangerHint: false })}
          >
            감추기
          </Chip>
        </div>
      </Section>
      <Section title="기물 모양">
        <div className="flex flex-wrap gap-1.5">
          {PIECE_SET_OPTIONS.map((p) => (
            <Chip
              key={p.value}
              active={s.pieces === p.value}
              onClick={() => s.set({ pieces: p.value })}
            >
              {p.label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-1 self-start rounded-lg bg-[#f0d9b5] p-1">
          {(["wK", "wQ", "wN", "bB", "bR", "bP"] as const).map((p) => (
            <PieceIcon key={p} piece={p} className="size-9" />
          ))}
        </div>
      </Section>
    </SubScreen>
  );
}

/** 체스 규칙 한눈에 */
function ChessRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "판과 기물",
      "가로세로 8칸 판에서 백과 흑이 기물 열여섯 개씩을 번갈아 하나씩 움직여요. 기물은 킹 하나, 퀸 하나, 룩 둘, 비숍 둘, 나이트 둘, 폰 여덟이에요. 백이 먼저 둬요. 상대 기물이 있는 칸으로 가면 그 기물을 잡아요.",
    ],
    [
      "목표",
      "다음 수에 상대 킹을 잡을 수 있게 노리는 것을 체크라 해요. 체크를 받은 쪽은 킹을 피하거나, 노리는 길을 막거나, 노리는 기물을 잡아 반드시 풀어야 해요. 어떻게 두어도 풀 수 없으면 체크메이트라 해서 져요. 줄여서 메이트라고도 해요.",
    ],
    [
      "기물 값",
      "기물을 주고받을 때 흔히 쓰는 값은 폰 1, 나이트 3, 비숍 3, 룩 5, 퀸 9예요. 킹은 잡히면 지므로 값을 매기지 않아요.",
    ],
    ["킹", "어느 방향으로든 한 칸 가요. 상대 기물이 노리는 칸으로는 못 가요."],
    ["퀸", "가로·세로·대각선으로 막힐 때까지 몇 칸이든 가요."],
    ["룩", "가로·세로로 막힐 때까지 몇 칸이든 가요."],
    ["비숍", "대각선으로 막힐 때까지 몇 칸이든 가요."],
    [
      "나이트",
      "한쪽으로 두 칸, 옆으로 한 칸 꺾어 L 모양으로 가요. 길에 있는 기물을 뛰어넘어요.",
    ],
    [
      "폰",
      "앞으로 한 칸 가요. 처음 자리에서는 두 칸까지 갈 수 있어요. 잡을 때만 앞쪽 대각선으로 한 칸 가요. 맞은편 끝줄에 닿으면 퀸·룩·비숍·나이트 가운데 하나로 바뀌어요.",
    ],
    [
      "캐슬링",
      "킹과 룩이 한 번도 움직이지 않았고 둘 사이가 비어 있으면, 한 수에 킹을 룩 쪽으로 두 칸 옮기고 룩을 킹 너머 바로 옆에 놓아요. 체크를 받고 있거나, 킹이 지나가거나 도착하는 칸을 상대가 노리면 못 해요.",
    ],
    [
      "앙파상",
      "상대 폰이 처음 자리에서 두 칸 나와 내 폰 바로 옆에 서면, 바로 다음 수에 한해 내 폰이 그 폰이 지나간 칸으로 대각선으로 가며 그 폰을 잡을 수 있어요.",
    ],
    [
      "비김",
      "다음 넷 가운데 하나면 비겨요. 체크를 받지 않았는데 둘 수 있는 수가 없을 때(스테일메이트), 두 편이 50수씩 두는 동안 폰을 움직이지도 기물을 잡지도 않았을 때, 같은 판 모양이 세 번 나왔을 때, 어느 편도 메이트할 만큼 기물이 남지 않았을 때예요. 시간이 다 된 쪽은 지지만, 상대에게 메이트할 기물이 없으면 비겨요.",
    ],
  ];
  return (
    <SubScreen title="체스는?" onBack={onBack} bg={BG} game="chess">
      <dl className="flex flex-col gap-3 text-sm">
        {items.map(([term, meaning]) => (
          <div key={term}>
            <dt className="font-bold text-amber-200">{term}</dt>
            <dd className="leading-relaxed opacity-85">{meaning}</dd>
          </div>
        ))}
      </dl>
    </SubScreen>
  );
}

/** 체스 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function ChessHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: ChessSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useChessSettings();
  const learned = useChessTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<ChessSaved | null>(null);
  useEffect(() => setSaved(loadChess()), []);
  const wins = WINS_OPTIONS.find((w) => w.value === s.winsToFinish)?.label;
  const level = CHESS_LEVELS.find((l) => l.value === s.level)?.label;
  const color = PICK_OPTIONS.find((p) => p.value === s.pick)?.label;

  return (
    <GameHome
      game="chess"
      theme="chess"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center gap-1" aria-hidden="true">
            <span className="rounded-2xl bg-[#f0d9b5] p-1 shadow-[2px_5px_8px_rgba(0,0,0,0.55)]">
              <PieceIcon piece="wK" className="size-14" />
            </span>
            <span className="mt-5 rounded-2xl bg-[#b58863] p-1 shadow-[2px_5px_8px_rgba(0,0,0,0.55)]">
              <PieceIcon piece="bQ" className="size-14" />
            </span>
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">체스</h1>
        </>
      }
      tagline="여섯 가지 기물로 상대 킹을 피할 곳 없이 몰아요."
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "♔︎",
        title: "나홀로 체스",
        detail: ["컴퓨터와", color, wins, timePresetLabel(s.time), level]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 체스",
        detail: "링크로 친구를 불러요.",
        onClick: onOnline,
      }}
      learn={{
        title: "체스 배우기",
        learned,
        total: CHESS_LESSONS.length,
        firstHint: `기물 움직임부터 ${CHESS_LESSONS.length}단원이 있어요.`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="체스는?"
      onAbout={onRules}
    />
  );
}

type Screen =
  | { kind: "start" }
  | {
      kind: "online";
      /** 초대 링크로 들어왔으면 방 코드, 방장이면 null */
      room: string | null;
      /** 방장이 새로고침했으면 이 탭이 연 방과 남긴 것 */
      resume?: { room: string; restore: HostRestore };
    }
  | { kind: "playing" }
  | { kind: "options" }
  | { kind: "rules" }
  | { kind: "tutorial" }
  | { kind: "lesson"; lessonId: string }
  | { kind: "study"; reviewDone?: boolean | undefined }
  | { kind: "puzzle"; puzzleId: string; review?: Review }
  | { kind: "line"; lineId: string; review?: Review }
  | { kind: "endgame"; drillId: string; review?: Review };

/** 「오늘 복습」으로 연 문제의 복습 줄(없으면 보통으로 연 문제) */
type Review = readonly string[] | undefined;

/** 수 배우기 목록에 보일 문제 묶음 */
const STUDY_SETS = CHESS_PUZZLE_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.puzzles.map((p) => p.id),
}));

/** 수 배우기 목록에 보일 기본 엔드게임 연습 묶음(퀸·룩 하나·룩 둘·폰을 퀸으로 만들기) */
const ENDGAME_STUDY_SETS = ENDGAME_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.drills.map((d) => d.id),
}));

/** 수 배우기 목록에 보일 오프닝 수순 묶음 */
const OPENING_SET = {
  id: CHESS_OPENING_SET.id,
  title: CHESS_OPENING_SET.title,
  summary: CHESS_OPENING_SET.summary,
  puzzleIds: CHESS_OPENING_SET.lines.map((l) => l.id),
  labels: CHESS_OPENING_SET.lines.map((l) => l.name),
};

/** 배우는 차례(`CHESS_STUDY_ORDER`)대로 늘어놓은 수 배우기 목록 */
const ORDERED_STUDY_SETS = (() => {
  const all = [OPENING_SET, ...STUDY_SETS, ...ENDGAME_STUDY_SETS];
  return CHESS_STUDY_ORDER.map((id) => {
    const set = all.find((s) => s.id === id);
    if (!set) throw new Error(`수 배우기 목록에 없는 묶음: ${id}`);
    return set;
  });
})();

/** 목록에서 고른 것이 수순이면 수순 화면, 엔드게임 연습이면 연습 화면, 아니면 문제 화면 */
const studyScreen = (id: string, review?: Review): Screen =>
  id.startsWith("line-")
    ? { kind: "line", lineId: id, review }
    : id.startsWith("end-")
      ? { kind: "endgame", drillId: id, review }
      : { kind: "puzzle", puzzleId: id, review };

/** 체스(/chess): 첫 화면, 옵션, 규칙, 배우기, 다함께 체스 방, 대국 화면 */
export function ChessApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endChessSession();
    useChess.getState().leave();
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial", "study"] },
  );
  const view = useChess((s) => s.view);
  const winsToFinish = useChessSettings((s) => s.winsToFinish);
  const time = useChessSettings((s) => s.time);

  // 다 끝난 게임은 이어하기에 남기지 않는다(튜토리얼 미션은 이어하기 저장과 상관없다).
  useEffect(() => {
    if (view?.phase === "gameOver" && !useChess.getState().practice)
      clearChess();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("chess");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });
  /** 컴퓨터와 새 판(첫 화면 「시작」과 판 끝 「다시 하기」). 고른 설정 그대로, 씨앗은 새로 */
  const startSolo = () => {
    const s = useChessSettings.getState();
    useChess.getState().newGame({
      rules: {
        winsToFinish: s.winsToFinish,
        ...(s.time !== "none" ? { time: s.time } : {}),
      },
      level: s.level,
      pick: s.pick,
    });
  };
  // 「오늘 복습」으로 연 문제: 다 풀면 복습 줄의 다음 문제로, 줄 끝이면 목록으로
  const reviewOf = (queue: Review, current: string) =>
    reviewRunFor({
      queue,
      current,
      progress: useChessStudyProgress,
      open: (id, q) => setScreen(studyScreen(id, q)),
      done: () => setScreen({ kind: "study", reviewDone: true }),
    });

  if (screen.kind === "online")
    return (
      <RoomScreen
        game={chessOnline}
        rules={{ winsToFinish, ...(time !== "none" ? { time } : {}) }}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing")
    return <ChessGame onExit={backToStart} onRestart={startSolo} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={chessTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
        extra={{
          title: "수 배우기",
          detail: `이름난 첫 수들 ${OPENING_SET.puzzleIds.length}개, 메이트·상대 기물 얻기 문제 ${STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개, 퀸·룩 하나·룩 둘로 메이트하고 폰을 퀸으로 만드는 엔드게임 연습 ${ENDGAME_STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개가 있어요.`,
          onClick: () => setScreen({ kind: "study" }),
        }}
      />
    );
  if (screen.kind === "study")
    return (
      <StudyHome
        title="체스 수 배우기"
        background={BG}
        sets={ORDERED_STUDY_SETS}
        progress={useChessStudyProgress}
        onOpen={(id, review) => setScreen(studyScreen(id, review))}
        onBack={() => setScreen({ kind: "tutorial" })}
        reviewDone={screen.reviewDone ?? false}
      />
    );
  if (screen.kind === "puzzle")
    return (
      <ChessPuzzleScreen
        key={screen.puzzleId}
        puzzleId={screen.puzzleId}
        onExit={() => setScreen({ kind: "study" })}
        onOpen={(puzzleId) => setScreen({ kind: "puzzle", puzzleId })}
        review={reviewOf(screen.review, screen.puzzleId)}
      />
    );
  if (screen.kind === "line")
    return (
      <ChessLineScreen
        key={screen.lineId}
        lineId={screen.lineId}
        onExit={() => setScreen({ kind: "study" })}
        onOpen={(id) => setScreen(studyScreen(id))}
        review={reviewOf(screen.review, screen.lineId)}
      />
    );
  if (screen.kind === "endgame")
    return (
      <ChessEndgameScreen
        key={screen.drillId}
        drillId={screen.drillId}
        onExit={() => setScreen({ kind: "study" })}
        onOpen={(id) => setScreen(studyScreen(id))}
        review={reviewOf(screen.review, screen.drillId)}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={chessTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <ChessOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <ChessRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <ChessHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useChess.getState().resume(saved);
        else startSolo();
        setScreen({ kind: "playing" });
      }}
    />
  );
}
