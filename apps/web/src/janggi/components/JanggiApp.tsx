"use client";

import { useEffect, useState } from "react";
import { BoardOnlineScreen } from "@/components/BoardOnlineScreen";
import { GameHome } from "@/components/GameHome";
import { StudyHome } from "@/components/study/StudyHome";
import {
  TimePresetPicker,
  timePresetLabel,
} from "@/components/TimePresetPicker";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useScreenHistory } from "@/game/screen-history";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { useJanggiStudyProgress } from "@/study/progress";
import { useJanggiTutorialProgress } from "@/tutorial/progress";
import { janggiOnline } from "../online";
import { PIECE_GLYPH_CREDIT } from "../piece-glyphs";
import { JANGGI_PUZZLE_SETS } from "../puzzles";
import { endJanggiSession } from "../session";
import {
  BIKJANG_INFO,
  JANGGI_LEVELS,
  type JanggiLevel,
  type PieceLabels,
  type SidePick,
  useJanggiSettings,
} from "../settings";
import { clearJanggi, type JanggiSaved, loadJanggi, useJanggi } from "../store";
import { JANGGI_LESSONS } from "../tutorial";
import { JanggiGame } from "./JanggiGame";
import { JanggiPuzzleScreen } from "./JanggiPuzzleScreen";
import { janggiTutorial } from "./janggi-tutorial";

/** 장기 화면들의 배경(대국 화면의 짙은 색과 이어진다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]";

const WINS_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 2, label: "3판 2승" },
  { value: 3, label: "5판 3승" },
] as const;

const PICK_OPTIONS: readonly { value: SidePick; label: string }[] = [
  { value: "cho", label: "초(먼저)" },
  { value: "han", label: "한" },
  { value: "random", label: "무작위" },
];

const LABEL_OPTIONS: readonly { value: PieceLabels; label: string }[] = [
  { value: "hanja", label: "한자(車·包·馬)" },
  { value: "hangul", label: "한글(차·포·마)" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active
          ? "border-amber-300 bg-white text-black"
          : "border-white/15 bg-white/5",
      )}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold text-sm">{title}</h2>
      {children}
    </section>
  );
}

/** 옵션·규칙 화면의 틀: 제목과 "처음으로" */
function SubScreen({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className={cn("flex min-h-dvh justify-center p-4 text-white", BG)}>
      <div className="flex w-full max-w-md flex-col gap-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">{title}</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            처음으로
          </button>
        </div>
        <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur">
          {children}
        </div>
      </div>
    </main>
  );
}

/** 장기 옵션: 빅장 규칙·판 수·컴퓨터·내 편·기물 글자. 다함께 장기도 여기서 고른 규칙과 판 수를 쓴다 */
function JanggiOptions({ onBack }: { onBack: () => void }) {
  const s = useJanggiSettings();
  const bikjang = BIKJANG_INFO.find((b) => b.value === s.bikjang);
  const level = JANGGI_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="장기 옵션" onBack={onBack}>
      <Section title="빅장">
        <div className="flex flex-wrap gap-1.5">
          {BIKJANG_INFO.map((b) => (
            <Chip
              key={b.value}
              active={s.bikjang === b.value}
              onClick={() => s.set({ bikjang: b.value })}
            >
              {b.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{bikjang?.description}</p>
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
          {JANGGI_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as JanggiLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <Section title="나홀로 장기에서 내 편">
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
        <p className="text-xs opacity-60">
          여러 판이면 판마다 초·한을 바꾼다. 한은 뒤에 두는 대신 점수로 가릴 때
          덤 1.5점을 더 받는다.
        </p>
      </Section>
      <Section title="기물 글자">
        <div className="flex flex-wrap gap-1.5">
          {LABEL_OPTIONS.map((l) => (
            <Chip
              key={l.value}
              active={s.labels === l.value}
              onClick={() => s.set({ labels: l.value })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="잡힐 위험 표시">
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
        <p className="text-xs opacity-60">
          공짜로 잡히거나 점수가 더 낮은 기물이 노리는 내 기물에 빨간 점선
          고리를 두른다.
        </p>
      </Section>
      <p className="text-xs opacity-60">
        다함께 장기도 여기서 고른 빅장 규칙과 판 수로 방을 연다.
      </p>
    </SubScreen>
  );
}

/** 장기 규칙 한눈에 */
function JanggiRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "판과 편",
      "두 사람이 초(초록 글자)와 한(빨간 글자)으로 나뉘어, 가로 9줄·세로 10줄이 만나는 점에 기물을 두고 번갈아 하나씩 움직인다. 이웃한 점으로 옮기는 것을 한 칸이라 한다. 초가 먼저 둔다.",
    ],
    [
      "기물",
      "한 편에 열여섯 개다. 왕 노릇을 하는 궁 하나(초는 楚, 한은 漢), 차 車 둘, 포 包 둘, 마 馬 둘, 상 象 둘, 사 士 둘, 졸 다섯이다. 졸은 초가 卒(졸), 한이 兵(병)이라 쓴다. 옵션에서 한글 글자로 바꿀 수 있다.",
    ],
    [
      "목표",
      "상대 기물이 있는 점으로 움직이면 그 기물을 잡는다. 다음 수에 상대 궁을 잡을 수 있게 노리는 것을 장군이라 한다. 장군을 받은 쪽이 어떻게 두어도 궁을 지킬 수 없으면 외통이라 하고, 외통으로 몬 쪽이 이긴다.",
    ],
    [
      "궁성",
      "양쪽 끝 가운데에 X자 대각선이 그어진 가로 3줄·세로 3줄 구역을 궁성이라 한다. 궁과 사는 궁성 밖으로 나가지 못한다.",
    ],
    [
      "상차림",
      "두기 전에 궁성 양옆 자리에 마와 상을 어떤 차례로 놓을지 네 가지 가운데 골라 놓는다. 한이 먼저 고른다.",
    ],
    [
      "궁·사",
      "궁성 안에서 줄을 따라 한 칸씩 움직인다. 대각선이 그어진 곳에서는 대각선으로도 간다.",
    ],
    [
      "차",
      "가로·세로로 막힐 때까지 몇 칸이든 간다. 궁성 안 대각선 위에서는 대각선으로도 간다.",
    ],
    [
      "포",
      "가로·세로로 가되, 반드시 기물 하나를 뛰어넘어서 간다. 잡을 때도 기물 하나를 뛰어넘어 잡는다. 포는 다른 포를 뛰어넘지도 잡지도 못한다.",
    ],
    [
      "마",
      "한 칸 곧게 간 뒤 바깥쪽 대각선으로 한 칸 간다. 처음 곧게 가는 칸이 막혀 있으면 못 간다.",
    ],
    [
      "상",
      "한 칸 곧게 간 뒤 바깥쪽 대각선으로 두 칸 간다. 지나는 칸이 하나라도 막혀 있으면 못 간다.",
    ],
    [
      "졸·병",
      "상대 쪽으로 한 칸, 또는 옆으로 한 칸 간다. 뒤로는 못 간다. 상대 궁성 안에서는 상대 쪽 대각선으로도 간다.",
    ],
    [
      "장군과 쉬기",
      "내 궁이 바로 잡히게 되는 수는 둘 수 없다. 장군을 받지 않았을 때는 「한 수 쉬기」 단추로 수를 두지 않고 차례를 넘길 수 있다.",
    ],
    [
      "점수로 가리기",
      "다음 때에는 남은 기물 점수로 이긴 쪽을 가린다. 두 궁이 사이에 아무 기물 없이 같은 세로줄에서 마주 보는 빅장(옵션), 같은 판 모양이 세 번 나옴, 두 편 합쳐 200수가 지남, 두 사람이 이어서 쉼. 차 13점, 포 7점, 마 5점, 상 3점, 사 3점, 졸·병 2점이고, 뒤에 두는 한은 1.5점을 더 받는다. 이 1.5점을 덤이라 한다.",
    ],
  ];
  return (
    <SubScreen title="장기는?" onBack={onBack}>
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

/** 장기 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function JanggiHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: JanggiSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useJanggiSettings();
  const learned = useJanggiTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<JanggiSaved | null>(null);
  useEffect(() => setSaved(loadJanggi()), []);
  const wins = WINS_OPTIONS.find((w) => w.value === s.winsToFinish)?.label;
  const level = JANGGI_LEVELS.find((l) => l.value === s.level)?.label;
  const side = PICK_OPTIONS.find((p) => p.value === s.pick)?.label;
  const token = (text: string, color: string) => (
    <span
      className="inline-flex size-16 items-center justify-center bg-[#f1e2c0] font-black font-serif text-3xl shadow-[2px_5px_8px_rgba(0,0,0,0.55)] [clip-path:polygon(29%_0,71%_0,100%_29%,100%_71%,71%_100%,29%_100%,0_71%,0_29%)]"
      style={{ color }}
    >
      {text}
    </span>
  );

  return (
    <GameHome
      game="janggi"
      theme="janggi"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center gap-1" aria-hidden="true">
            {token("楚", "#0f6b3a")}
            <span className="mt-5">{token("漢", "#b91c1c")}</span>
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">장기</h1>
        </>
      }
      tagline="기물 열여섯 개로 상대 궁을 피할 곳 없이 몰아라"
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "楚",
        title: "나홀로 장기",
        detail: ["컴퓨터와", side, wins, timePresetLabel(s.time), level]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 장기",
        detail: "링크로 친구를 부릅니다. 서버 없이 바로 이어집니다",
        onClick: onOnline,
      }}
      learn={{
        title: "장기 배우기",
        learned,
        total: JANGGI_LESSONS.length,
        firstHint: `처음이라면 여기부터. 기물 움직임부터 ${JANGGI_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="장기는?"
      onAbout={onRules}
      credit={
        // 기물 한자 윤곽의 출처 표기(CC BY 4.0, piece-glyphs-kadagaden.ts)
        <>
          장기 기물 글자:{" "}
          <a
            href={PIECE_GLYPH_CREDIT.source}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            Kadagaden
          </a>
          (pychess-variants),{" "}
          <a
            href={PIECE_GLYPH_CREDIT.license}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            CC BY 4.0
          </a>
        </>
      }
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
  | { kind: "study" }
  | { kind: "puzzle"; puzzleId: string };

/** 수 배우기 목록에 보일 문제 묶음 */
const STUDY_SETS = JANGGI_PUZZLE_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.puzzles.map((p) => p.id),
}));

/** 장기(/janggi): 첫 화면, 옵션, 규칙, 배우기, 다함께 장기 방, 대국 화면 */
export function JanggiApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endJanggiSession();
    useJanggi.getState().leave();
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial", "study"] },
  );
  const view = useJanggi((s) => s.view);
  const bikjang = useJanggiSettings((s) => s.bikjang);
  const winsToFinish = useJanggiSettings((s) => s.winsToFinish);
  const time = useJanggiSettings((s) => s.time);

  // 다 끝난 게임은 이어하기에 남기지 않는다(튜토리얼 미션은 이어하기 저장과 상관없다).
  useEffect(() => {
    if (view?.phase === "gameOver" && !useJanggi.getState().practice)
      clearJanggi();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("janggi");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });

  if (screen.kind === "online")
    return (
      <BoardOnlineScreen
        game={janggiOnline}
        rules={{ bikjang, winsToFinish, ...(time !== "none" ? { time } : {}) }}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <JanggiGame onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={janggiTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
        extra={{
          title: "수 배우기",
          detail: `외통·상대 기물 얻기 문제 ${STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개. 규칙을 익혔다면 여기서 실력을 키웁니다.`,
          onClick: () => setScreen({ kind: "study" }),
        }}
      />
    );
  if (screen.kind === "study")
    return (
      <StudyHome
        title="장기 수 배우기"
        background={BG}
        sets={STUDY_SETS}
        progress={useJanggiStudyProgress}
        onOpen={(puzzleId) => setScreen({ kind: "puzzle", puzzleId })}
        onBack={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "puzzle")
    return (
      <JanggiPuzzleScreen
        key={screen.puzzleId}
        puzzleId={screen.puzzleId}
        onExit={() => setScreen({ kind: "study" })}
        onOpen={(puzzleId) => setScreen({ kind: "puzzle", puzzleId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={janggiTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <JanggiOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <JanggiRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <JanggiHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useJanggi.getState().resume(saved);
        else {
          const s = useJanggiSettings.getState();
          useJanggi.getState().newGame({
            rules: {
              bikjang: s.bikjang,
              winsToFinish: s.winsToFinish,
              ...(s.time !== "none" ? { time: s.time } : {}),
            },
            level: s.level,
            pick: s.pick,
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
