"use client";

import { useEffect, useState } from "react";
import { GameHome } from "@/components/GameHome";
import { Chip } from "@/components/options/Chip";
import { Section, SubScreen } from "@/components/options/SubScreen";
import { RoomScreen } from "@/components/RoomScreen";
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
import { BADUK_FUSEKI_SET } from "../fuseki";
import { BADUK_JOSEKI_SET } from "../joseki";
import { badukOnline } from "../online";
import { useBadukStudyProgress, useBadukTutorialProgress } from "../progress";
import { BADUK_PUZZLE_SETS } from "../puzzles";
import { endBadukSession } from "../session";
import {
  BADUK_LEVELS,
  type BadukLevel,
  SIZE_INFO,
  type StonePick,
  useBadukSettings,
} from "../settings";
import { type BadukSaved, clearBaduk, loadBaduk, useBaduk } from "../store";
import {
  BADUK_STUDY_LESSON_SUMMARY,
  BADUK_STUDY_LESSONS,
} from "../study-lessons";
import { BADUK_LESSONS } from "../tutorial";
import { BadukGame, StoneDot } from "./BadukGame";
import { BadukLineScreen } from "./BadukLineScreen";
import { BadukPuzzleScreen } from "./BadukPuzzleScreen";
import { badukStudyLessons, badukTutorial } from "./baduk-tutorial";

/** 바둑 화면들의 배경(대국 화면의 짙은 색과 이어진다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#57534e_0%,#1c1917_80%)]";

const WINS_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 2, label: "3판 2승" },
  { value: 3, label: "5판 3승" },
] as const;

const PICK_OPTIONS: readonly { value: StonePick; label: string }[] = [
  { value: "black", label: "흑(먼저)" },
  { value: "white", label: "백" },
  { value: "random", label: "무작위" },
];

const KOMI_OPTIONS = [
  { value: 7.5, label: "덤 7.5" },
  { value: 6.5, label: "덤 6.5" },
] as const;

/** 바둑 옵션: 판 크기·덤·개인 시간·판 수·컴퓨터·내 돌. 다함께 바둑도 여기서 고른 규칙을 쓴다 */
function BadukOptions({ onBack }: { onBack: () => void }) {
  const s = useBadukSettings();
  const size = SIZE_INFO.find((b) => b.value === s.size);
  const level = BADUK_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="바둑 옵션" onBack={onBack} bg={BG}>
      <Section title="판 크기">
        <div className="flex flex-wrap gap-1.5">
          {SIZE_INFO.map((b) => (
            <Chip
              key={b.value}
              active={s.size === b.value}
              onClick={() => s.set({ size: b.value })}
            >
              {b.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{size?.description}</p>
      </Section>
      <Section title="덤">
        <div className="flex flex-wrap gap-1.5">
          {KOMI_OPTIONS.map((k) => (
            <Chip
              key={k.value}
              active={s.komi === k.value}
              onClick={() => s.set({ komi: k.value })}
            >
              {k.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">
          흑이 먼저 두는 대신 백이 더 받는 점수예요.
        </p>
      </Section>
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
          {BADUK_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as BadukLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <Section title="나홀로 바둑에서 내 돌">
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
      <Section title="단수 표시">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={s.atariHint} onClick={() => s.set({ atariHint: true })}>
            보이기
          </Chip>
          <Chip
            active={!s.atariHint}
            onClick={() => s.set({ atariHint: false })}
          >
            감추기
          </Chip>
        </div>
      </Section>
    </SubScreen>
  );
}

/** 바둑 규칙 한눈에 */
function BadukRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "흑과 백이 줄이 만나는 점에 돌을 하나씩 번갈아 놓아요. 흑이 먼저 둬요. 판이 끝났을 때 아래 「세기」로 센 점수가 더 많은 쪽이 이겨요.",
    ],
    [
      "따내기",
      "돌의 위·아래·왼쪽·오른쪽에 붙은 빈 점을 활로라 해요. 줄로 이어진 같은 색 돌은 한 무리가 되어 활로를 함께 써요. 상대가 한 무리의 활로를 모두 막으면 그 돌을 판에서 들어내요. 이것을 따낸다고 해요. 활로가 하나만 남은 상태를 단수라 해요.",
    ],
    [
      "자살수",
      "놓자마자 활로가 없어 바로 따내질 자리에 두는 수를 자살수라 하고, 둘 수 없어요. 다만 그 수로 상대 돌을 따내 활로가 생기면 둘 수 있어요.",
    ],
    [
      "패",
      "바둑판 모양을 이번 대국에서 이미 나왔던 모양으로 되돌리는 수는 둘 수 없어요. 그래서 서로 한 점씩 번갈아 따낼 수 있는 모양(패)에서는, 한쪽이 따내면 상대는 다른 곳에 한 수 둔 뒤에야 되따낼 수 있어요.",
    ],
    [
      "끝",
      "차례에 돌을 놓지 않고 넘기는 것을 쉰다고 해요. 두 사람이 이어서 쉬면 판이 끝나요. 기권해도 끝나요.",
    ],
    [
      "세기",
      "판 위 내 돌 수와, 내 돌로만 둘러싼 빈 점 수를 더해요. 내 돌로만 둘러싼 빈 점을 집이라 해요. 흑과 백 모두에 닿은 빈 점은 누구 것도 아니에요. 흑이 먼저 둔 몫을 메우려고 백은 덤을 더해요. 덤은 옵션에서 7.5나 6.5로 골라요.",
    ],
    [
      "죽은 돌",
      "상대가 결국 따낼 수 있어 살릴 길이 없는 돌을 죽은 돌이라 해요. 여기서는 판 위에 놓인 돌을 그대로 세므로, 내 집 안에 들어온 상대의 죽은 돌은 끝내기 전에 따내야 해요. 따내지 않고 쉬면 그 상대 돌은 판 위 상대 돌로 세어지고, 그 돌에 닿은 빈 점은 내 집으로 세지 않아요.",
    ],
  ];
  return (
    <SubScreen title="바둑은?" onBack={onBack} bg={BG}>
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

/** 바둑 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function BadukHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: BadukSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useBadukSettings();
  const learned = useBadukTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<BadukSaved | null>(null);
  useEffect(() => setSaved(loadBaduk()), []);
  const wins = WINS_OPTIONS.find((w) => w.value === s.winsToFinish)?.label;
  const level = BADUK_LEVELS.find((l) => l.value === s.level)?.label;
  const side = PICK_OPTIONS.find((p) => p.value === s.pick)?.label;

  return (
    <GameHome
      game="baduk"
      theme="baduk"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center gap-1" aria-hidden="true">
            <StoneDot black className="size-14" />
            <StoneDot black={false} className="mt-5 size-14" />
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">바둑</h1>
        </>
      }
      tagline="돌을 번갈아 놓아 더 넓게 차지해요."
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "⚫",
        title: "나홀로 바둑",
        detail: [
          "컴퓨터와",
          `${s.size}줄`,
          side,
          wins,
          timePresetLabel(s.time),
          level,
        ]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 바둑",
        detail: "링크로 친구를 불러요.",
        onClick: onOnline,
      }}
      learn={{
        title: "바둑 배우기",
        learned,
        total: BADUK_LESSONS.length,
        firstHint: `돌 놓기부터 ${BADUK_LESSONS.length}단원이 있어요.`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="바둑은?"
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
  | { kind: "studyLesson"; lessonId: string };

/** 「오늘 복습」으로 연 문제의 복습 줄(없으면 보통으로 연 문제) */
type Review = readonly string[] | undefined;

/** 수 배우기 목록에 보일 문제 묶음 */
const STUDY_SETS = BADUK_PUZZLE_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.puzzles.map((p) => p.id),
}));

/** 수 배우기 단원(읽고 퀴즈 풀기). 끝내면 수 배우기 진행에도 끝냄으로 남긴다 */
const LESSON_SET = {
  id: "lessons",
  title: "단원 읽기",
  summary: BADUK_STUDY_LESSON_SUMMARY,
  puzzleIds: BADUK_STUDY_LESSONS.map((l) => l.id),
  labels: BADUK_STUDY_LESSONS.map((l) => l.title),
};

/** 수 배우기 목록 차례: 처음 배우던 문제, 단원, 단원을 익히는 문제, 따라 두기 */
const FIRST_SETS = [
  "atari",
  "ladder",
  "net",
  "snapback",
  "ko",
  "live",
  "kill",
  "shapes",
];
const studySets = () => [
  ...STUDY_SETS.filter((s) => FIRST_SETS.includes(s.id)),
  LESSON_SET,
  ...STUDY_SETS.filter((s) => !FIRST_SETS.includes(s.id)),
  JOSEKI_SET,
  FUSEKI_SET,
];

/** 수 배우기 목록에 보일 정석 수순 묶음(이름 목록) */
const JOSEKI_SET = {
  id: BADUK_JOSEKI_SET.id,
  title: BADUK_JOSEKI_SET.title,
  summary: BADUK_JOSEKI_SET.summary,
  puzzleIds: BADUK_JOSEKI_SET.lines.map((l) => l.id),
  labels: BADUK_JOSEKI_SET.lines.map((l) => l.name),
};

/** 수 배우기 목록에 보일 포석 수순 묶음(이름 목록) */
const FUSEKI_SET = {
  id: BADUK_FUSEKI_SET.id,
  title: BADUK_FUSEKI_SET.title,
  summary: BADUK_FUSEKI_SET.summary,
  puzzleIds: BADUK_FUSEKI_SET.lines.map((l) => l.id),
  labels: BADUK_FUSEKI_SET.lines.map((l) => l.name),
};

/** 목록에서 고른 것이 수순이면 수순 화면, 단원이면 단원 화면, 아니면 문제 화면 */
const studyScreen = (id: string, review?: Review): Screen =>
  id.startsWith("line-")
    ? { kind: "line", lineId: id, review }
    : id.startsWith("lesson-")
      ? { kind: "studyLesson", lessonId: id }
      : { kind: "puzzle", puzzleId: id, review };

/** 주소의 `?seed=`(화면 시험이 같은 판을 다시 할 때, 민화투·고스톱·숫자야구와 같은 길) */
function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get("seed");
  const seed = raw === null ? Number.NaN : Number(raw);
  return Number.isInteger(seed) && seed >= 0 ? seed : undefined;
}

/** 바둑(/baduk): 첫 화면, 옵션, 규칙, 배우기, 다함께 바둑 방, 대국 화면 */
export function BadukApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endBadukSession();
    useBaduk.getState().leave();
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial", "study"] },
  );
  const view = useBaduk((s) => s.view);
  const size = useBadukSettings((s) => s.size);
  const komi = useBadukSettings((s) => s.komi);
  const winsToFinish = useBadukSettings((s) => s.winsToFinish);
  const time = useBadukSettings((s) => s.time);

  // 저장한 설정과 배우기 진행을 첫 그리기 뒤에 읽는다(다른 게임은 StoreHydration이 맡는다).
  useEffect(() => {
    void useBadukSettings.persist.rehydrate();
    void useBadukTutorialProgress.persist.rehydrate();
    void useBadukStudyProgress.persist.rehydrate();
  }, []);

  // 다 끝난 게임은 이어하기에 남기지 않는다(튜토리얼 미션은 이어하기 저장과 상관없다).
  useEffect(() => {
    if (view?.phase === "gameOver" && !useBaduk.getState().practice)
      clearBaduk();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("baduk");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });
  /**
   * 컴퓨터와 새 판(첫 화면 「시작」과 판 끝 「다시 하기」). 고른 설정 그대로.
   * 씨앗은 첫 화면에서만 주소 `?seed=`를 따르고, 「다시 하기」는 새로 뽑는다
   */
  const startSolo = (seed?: number) => {
    const s = useBadukSettings.getState();
    useBaduk.getState().newGame({
      rules: {
        size: s.size,
        komi: s.komi,
        winsToFinish: s.winsToFinish,
        ...(s.time !== "none" ? { time: s.time } : {}),
      },
      level: s.level,
      pick: s.pick,
      ...(seed !== undefined ? { seed } : {}),
    });
  };
  // 「오늘 복습」으로 연 문제: 다 풀면 복습 줄의 다음 문제로, 줄 끝이면 목록으로
  const reviewOf = (queue: Review, current: string) =>
    reviewRunFor({
      queue,
      current,
      progress: useBadukStudyProgress,
      open: (id, q) => setScreen(studyScreen(id, q)),
      done: () => setScreen({ kind: "study", reviewDone: true }),
    });

  if (screen.kind === "online")
    return (
      <RoomScreen
        game={badukOnline}
        rules={{
          size,
          komi,
          winsToFinish,
          ...(time !== "none" ? { time } : {}),
        }}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing")
    return <BadukGame onExit={backToStart} onRestart={() => startSolo()} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={badukTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
        extra={{
          title: "수 배우기",
          detail: `돌 잡기·살리기 문제 ${STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개, 읽는 단원 ${LESSON_SET.puzzleIds.length}개, 구석에서 흔히 두는 정해진 수 ${JOSEKI_SET.puzzleIds.length}개, 빈 판 첫 몇 수 ${FUSEKI_SET.puzzleIds.length}개가 있어요.`,
          onClick: () => setScreen({ kind: "study" }),
        }}
      />
    );
  if (screen.kind === "study")
    return (
      <StudyHome
        title="바둑 수 배우기"
        background={BG}
        sets={studySets()}
        progress={useBadukStudyProgress}
        onOpen={(id, review) => setScreen(studyScreen(id, review))}
        onBack={() => setScreen({ kind: "tutorial" })}
        reviewDone={screen.reviewDone ?? false}
      />
    );
  if (screen.kind === "studyLesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={badukStudyLessons}
        lessonId={screen.lessonId}
        onExit={() => {
          // 끝낸 단원은 수 배우기 목록에도 ✓로 남긴다
          const id = screen.lessonId;
          if (useBadukTutorialProgress.getState().completed.includes(id))
            useBadukStudyProgress.getState().solve(id);
          setScreen({ kind: "study" });
        }}
      />
    );
  if (screen.kind === "line")
    return (
      <BadukLineScreen
        key={screen.lineId}
        lineId={screen.lineId}
        onExit={() => setScreen({ kind: "study" })}
        onOpen={(id) => setScreen(studyScreen(id))}
        review={reviewOf(screen.review, screen.lineId)}
      />
    );
  if (screen.kind === "puzzle")
    return (
      <BadukPuzzleScreen
        key={screen.puzzleId}
        puzzleId={screen.puzzleId}
        onExit={() => setScreen({ kind: "study" })}
        onOpen={(puzzleId) => setScreen({ kind: "puzzle", puzzleId })}
        review={reviewOf(screen.review, screen.puzzleId)}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={badukTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <BadukOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <BadukRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <BadukHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useBaduk.getState().resume(saved);
        else startSolo(seedFromUrl());
        setScreen({ kind: "playing" });
      }}
    />
  );
}
