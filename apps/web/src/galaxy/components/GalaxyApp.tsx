"use client";

import {
  boardOfSky,
  createGalaxyScenario,
  type GalaxyRules,
  NUMBERS,
  type ScenarioStar,
} from "@game/galaxy-engine";
import { useEffect, useState } from "react";
import { BoardOnlineScreen } from "@/components/BoardOnlineScreen";
import { GameHome } from "@/components/GameHome";
import {
  TimePresetPicker,
  timePresetLabel,
} from "@/components/TimePresetPicker";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useScreenHistory } from "@/game/screen-history";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";

import { BureauLogo } from "@/stardraw/components/BureauMarks";

import { GalaxyIconArt } from "../icon-art";
import { galaxyOnline } from "../online";
import { useGalaxyTutorialProgress } from "../progress";
import { endGalaxySession } from "../session";
import {
  GALAXY_LENGTHS,
  GALAXY_LEVELS,
  type GalaxyLevel,
  lengthDetail,
  rulesFromSettings,
  useGalaxySettings,
} from "../settings";
import { clearGalaxy, type GalaxySaved, loadGalaxy, useGalaxy } from "../store";
import { GALAXY_LESSONS } from "../tutorial";
import { GALAXY_BG, GalaxyGame } from "./GalaxyGame";
import { GalaxyStarQuiz } from "./GalaxyStarQuiz";
import { galaxyTutorial } from "./galaxy-tutorial";
import { GalaxySources } from "./Sources";

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
        "rounded-full border px-3 py-1 text-xs transition",
        active
          ? "border-amber-200 bg-amber-100 text-slate-950"
          : "border-white/15 bg-white/5 hover:bg-white/10",
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
    <main
      data-game="galaxy"
      className={cn("flex min-h-dvh justify-center p-4 text-white", GALAXY_BG)}
    >
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
        <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-slate-950/50 p-5 shadow-2xl backdrop-blur">
          {children}
        </div>
      </div>
    </main>
  );
}

/** 은하 한 바퀴 옵션: 인원·판 길이·사들이기·제철 하늘·컴퓨터 실력·따라가는 시점 */
function GalaxyOptions({ onBack }: { onBack: () => void }) {
  const s = useGalaxySettings();
  const rules = rulesFromSettings(s);
  const level = GALAXY_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="은하 한 바퀴 옵션" onBack={onBack}>
      <Section title="인원">
        <div className="flex flex-wrap gap-1.5">
          {([2, 3, 4] as const).map((n) => (
            <Chip
              key={n}
              active={s.players === n}
              onClick={() => s.set({ players: n })}
            >
              {n}명
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="판 길이">
        <div className="flex flex-wrap gap-1.5">
          {GALAXY_LENGTHS.map((l) => (
            <Chip
              key={l.value}
              active={s.length === l.value}
              onClick={() => s.set({ length: l.value })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{lengthDetail(rules)}</p>
      </Section>
      <Section title="사들이기">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={s.takeover} onClick={() => s.set({ takeover: true })}>
            켬
          </Chip>
          <Chip active={!s.takeover} onClick={() => s.set({ takeover: false })}>
            끔
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          남의 별에 멈춰 이용료를 낸 뒤, 그 별을 값의 1.5배에 주인에게서 살 수
          있어요.
        </p>
      </Section>
      <Section title="제철 하늘">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={s.seasonal} onClick={() => s.set({ seasonal: true })}>
            켬
          </Chip>
          <Chip active={!s.seasonal} onClick={() => s.set({ seasonal: false })}>
            끔
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          판 길이의 4분의 1마다 계절이 바뀌고, 지금 계절 별자리 별의 이용료가
          1.5배예요.
        </p>
      </Section>
      {s.length !== "long" && (
        <Section title="유성우의 밤">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={s.meteor} onClick={() => s.set({ meteor: true })}>
              켬
            </Chip>
            <Chip active={!s.meteor} onClick={() => s.set({ meteor: false })}>
              끔
            </Chip>
          </div>
          <p className="text-xs opacity-60">
            모두에게 두 차례씩 남았을 때부터 모든 별 이용료가 2배예요.
          </p>
        </Section>
      )}
      <Section title="달의 길">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={rules.moon} onClick={() => s.set({ moon: true })}>
            켬
          </Chip>
          <Chip active={!rules.moon} onClick={() => s.set({ moon: false })}>
            끔
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          달이 한 칸씩 돌고, 달이 떠 있는 칸의 별자리는 이용료가 절반이에요.
        </p>
      </Section>
      <Section title="관측 의뢰">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={rules.requests}
            onClick={() => s.set({ requests: true })}
          >
            켬
          </Chip>
          <Chip
            active={!rules.requests}
            onClick={() => s.set({ requests: false })}
          >
            끔
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          판 처음에 몰래 받은 의뢰서의 목표를 이루면 판이 끝날 때{" "}
          {NUMBERS.requestBonus}을 더 받아요.
        </p>
      </Section>
      <Section title="개인 시간">
        <TimePresetPicker value={s.time} onChange={(time) => s.set({ time })} />
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {GALAXY_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as GalaxyLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <Section title="따라가는 시점(휴대폰 세로)">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={s.follow} onClick={() => s.set({ follow: true })}>
            켬
          </Chip>
          <Chip active={!s.follow} onClick={() => s.set({ follow: false })}>
            끔
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          켜면 우주선이 움직이는 동안 판을 살짝 당겨 따라가요. 끄면 판 전체를
          보여 줘요.
        </p>
      </Section>
    </SubScreen>
  );
}

/** 은하 한 바퀴 규칙 한눈에 */
function GalaxyRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "카노푸스 우주국",
      "카노푸스 우주국이 우주인 훈련용으로 만든 판 놀이예요. 판은 계절마다 뜨는 별자리를 따라 도는 32칸이고, 출발 칸은 우주국 건물이라 「카노푸스 우주국」 칸이라고 불러요.",
    ],
    [
      "별빛",
      "별빛은 이 판 안에서만 쓰는 점수예요. 별을 사고 정거장을 짓고 이용료를 낼 때 써요. 실제 돈과 바꿀 수 없고 판이 끝나면 사라져요.",
    ],
    [
      "한 차례",
      "자기 차례에는 주사위 두 개를 굴려 나온 눈의 합만큼 칸을 가요. 두 주사위가 같은 숫자(더블)면 한 번 더 굴려요.",
    ],
    [
      "별과 정거장",
      "판의 칸 대부분은 별이에요. 별자리 하나는 판 위에 별 셋으로 놓이고, 해가 지나는 길의 별자리(황도 12궁)만 별 둘이에요. 별을 사면 그 별에 정거장 1단이 함께 서고, 정거장은 2단·3단·큰 정거장까지 한 단씩 올릴 수 있어요. 올린 정거장은 내리면 지은 값의 절반을 돌려받아요.",
    ],
    [
      "목표",
      "판이 끝날 때 자산이 가장 많으면 1등이에요. 자산은 별빛, 가진 별 값의 80%, 정거장을 내릴 때 돌려받는 값(지은 값의 절반), 완성한 별자리마다 그 별자리 별 하나 값을 더한 것이에요.",
    ],
    [
      "별 사기",
      "주인 없는 별에 멈추면 그 값을 내고 살 수 있어요. 사지 않으면 모두가 한 번에 몰래 값을 적어 내고, 가장 높게 적은 사람이 적은 값에 사요. 이것을 봉투 입찰이라 해요. 밝은 별이 든 별자리일수록 비싸고, 이용료와 완성했을 때 더하는 자산도 그만큼 커요.",
    ],
    [
      "이용료",
      "남의 별에 멈추면 그 주인에게 정거장 이용료를 내요. 같은 별자리 별을 둘 가지면 둘 사이에 별자리 선이 이어져 이용료가 1.5배, 그 별자리 별을 모두 가지면 별자리 완성으로 2배예요. 완성한 별자리라야 정거장을 2단 이상으로 올릴 수 있고, 단이 높을수록 이용료가 커져요.",
    ],
    [
      "사들이기·내 별",
      "옵션에서 사들이기를 켜면, 남의 별에 멈춰 이용료를 낸 뒤 그 별을 값의 1.5배에 주인에게서 사들일 수 있어요. 주인이 완성한 별자리의 별은 사들일 수 없어요. 내 별에 멈춘 차례에는, 정거장을 올릴 수 있는 별자리라면 한 단을 반값에 올릴 수 있어요.",
    ],
    [
      "제철 하늘·유성우의 밤",
      "옵션에서 제철 하늘을 켜면 판 길이의 4분의 1마다 계절이 바뀌고, 지금 계절 별자리 별은 「제철」이라 이용료가 1.5배예요. 유성우의 밤을 켜면 모두에게 두 차례씩 남았을 때부터 모든 별 이용료가 2배예요.",
    ],
    [
      "우주국 공문",
      "공문 칸에 멈추면 우주국이 보낸 공문 한 장을 펴고, 거기 적힌 대로 해요. 별의 밝기·온도·거리로 셈하는 공문이 있어 별을 알면 판을 더 잘 읽어요.",
    ],
    [
      "모퉁이",
      `판의 네 모서리 칸은 가는 차례대로 카노푸스 우주국, 소행성대, 관측지, 혜성이에요. 카노푸스 우주국 칸을 지나가거나 멈추면 지원금 ${NUMBERS.salary}을 받아요. 다만 별빛이 ${NUMBERS.salaryFree}보다 많으면 넘는 몫의 5분의 1만큼 덜 받아요. 관측지에 멈추면 관측 지원금을 받는데, 자산 순위가 낮을수록 많이 받아요. 혜성에서는 한 번 더 굴려 더 가요. 소행성대는 그냥 멈추면 아무 일도 없고, 공문 「궤도 이탈」을 받거나 한 차례에 더블이 세 번 나오면 소행성대에 갇혀요. 갇히면 다음 차례에 ${NUMBERS.asteroidFine}을 내거나 더블이 나오면 바로 나가고, 아니면 한 차례만 쉬어요.`,
    ],
    [
      "달의 길",
      "옵션에서 달의 길을 켜면, 달이 관측지에서 떠서 차례가 넘어갈 때마다 한 칸씩 돌아요. 달이 떠 있는 칸의 별자리는 달빛에 별이 흐려 이용료가 절반이에요.",
    ],
    [
      "관측 의뢰",
      `옵션에서 관측 의뢰를 켜면, 판 처음에 우주국 의뢰서 한 장을 몰래 받아요. 의뢰서에는 「1등성 둘 갖기」, 「겨울 별자리 하나 완성」 같은 목표가 적혀 있어요. 별 밝기는 등급 숫자가 작을수록 밝고, 1.5등급까지를 1등성이라 해요. 판이 끝날 때 모두의 의뢰서를 펼쳐, 이룬 사람은 ${NUMBERS.requestBonus}을 더 받아요.`,
    ],
    [
      "끝",
      "정한 차례 수를 마치거나, 누군가 낼 별빛이 모자라 더 할 수 없게 되면(파산) 판이 끝나요. 긴 판은 한 사람만 남을 때까지 해요.",
    ],
    [
      "공정한 주사위",
      "주사위와 공문은 모든 참가자의 기기가 판을 시작할 때 미리 정해 잠가 둔 값을, 굴릴 때마다 하나씩 열어 함께 섞어 정해요. 누구도 결과를 고르거나 미리 알 수 없어요.",
    ],
  ];
  return (
    <SubScreen title="은하 한 바퀴는?" onBack={onBack}>
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

function GalaxyHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: GalaxySaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useGalaxySettings();
  const learned = useGalaxyTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<GalaxySaved | null>(null);
  useEffect(() => setSaved(loadGalaxy()), []);
  const rules = rulesFromSettings(s);
  const level = GALAXY_LEVELS.find((l) => l.value === s.level)?.label ?? "";
  const length = GALAXY_LENGTHS.find((l) => l.value === s.length)?.label;
  return (
    <GameHome
      game="galaxy"
      theme="galaxy"
      background={GALAXY_BG}
      primaryClass="border-amber-200 bg-amber-200 text-slate-950 hover:bg-amber-100"
      hero={
        <>
          {/* 이 판 놀이를 낸 곳(별 따기와 같은 우주국, docs/48 15-4) */}
          <a
            href="/stardraw/bureau"
            data-galaxy-bureau
            className="mx-auto mb-3 flex w-fit items-center gap-1.5 font-semibold text-amber-100/70 text-xs tracking-[0.2em] hover:text-amber-100"
          >
            <BureauLogo className="size-5" />
            카노푸스 우주국
          </a>
          <div aria-hidden="true" className="mx-auto size-24 drop-shadow-xl">
            <GalaxyIconArt />
          </div>
          <h1 className="mt-3 font-black text-4xl tracking-wide drop-shadow-[0_2px_8px_rgba(147,197,253,0.35)]">
            은하 한 바퀴
          </h1>
        </>
      }
      tagline="계절 하늘을 돌며 별을 사고, 별자리를 잇는다"
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "🚀",
        title: "나홀로 은하 한 바퀴",
        detail: [
          `컴퓨터 ${level} ${s.players - 1}명`,
          length,
          lengthDetail(rules).split(" · ")[1],
          s.takeover ? "사들이기" : "사들이기 없음",
          s.seasonal ? "제철 하늘" : null,
          s.meteor && s.length !== "long" ? "유성우의 밤" : null,
          rules.moon ? "달의 길" : null,
          rules.requests ? "관측 의뢰" : null,
          timePresetLabel(rules.time),
        ]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 은하 한 바퀴",
        detail: "링크로 2~4명 · 빈자리는 컴퓨터",
        onClick: onOnline,
      }}
      learn={{
        title: "은하 한 바퀴 배우기",
        learned,
        total: GALAXY_LESSONS.length,
        firstHint: `처음이라면 여기부터. ${GALAXY_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="은하 한 바퀴는?"
      onAbout={onRules}
      footer={
        <>
          <p className="mt-1 text-center text-white/60 text-xs">
            별빛은 이 판 안에서만 쓰는 점수예요. 실제 돈과 바꿀 수 없어요.
          </p>
          <GalaxySources />
        </>
      }
    />
  );
}

/**
 * 화면 시험이 정해진 시드·장면으로 시작하게 하는 손잡이(window에 시험이 넣는다, 화면에는 없다).
 * 장면으로 시작한 판은 저장·내 기록에 남지 않는다
 */
interface GalaxyTestHooks {
  __galaxySeed?: number;
  __galaxyScenario?: {
    rules: GalaxyRules;
    level: number;
    seed?: number;
    stars?: ScenarioStar[];
    cash?: number[];
    positions?: number[];
    round?: number;
    /** 굴림 눈을 차례로(누가 굴리든, 다 쓰면 보통 사슬) */
    dice?: [number, number][];
  };
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
  | { kind: "starQuiz" };

/** 은하 한 바퀴(/galaxy): 첫 화면, 옵션, 규칙, 배우기·별자리 퀴즈, 친구와 하기 방, 대국 */
export function GalaxyApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endGalaxySession();
    useGalaxy.getState().leave();
  }
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial", "starQuiz"] },
  );
  const view = useGalaxy((s) => s.view);
  const settings = useGalaxySettings();

  // 다 끝난 게임은 이어하기에 남기지 않는다(온라인 판은 저장하지 않는다).
  useEffect(() => {
    // 배우기 미션 판은 저장하지 않으므로 이어하기 저장도 건드리지 않는다.
    const { local, practice } = useGalaxy.getState();
    if (view?.phase === "gameOver" && local && !practice) clearGalaxy();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("galaxy");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });
  if (screen.kind === "online")
    return (
      <BoardOnlineScreen
        game={galaxyOnline}
        rules={rulesFromSettings(settings)}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <GalaxyGame onExit={backToStart} />;
  if (screen.kind === "options") return <GalaxyOptions onBack={backToStart} />;
  if (screen.kind === "rules")
    return <GalaxyRulesScreen onBack={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={galaxyTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
        extra={{
          icon: "✦",
          title: "별자리 퀴즈",
          detail: "사계절 하늘 8 별자리·24별로 끝없이 풀어요",
          onClick: () => setScreen({ kind: "starQuiz" }),
        }}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={galaxyTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "starQuiz")
    return <GalaxyStarQuiz onBack={() => setScreen({ kind: "tutorial" })} />;
  return (
    <GalaxyHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        const hooks = window as GalaxyTestHooks;
        const scene = hooks.__galaxyScenario;
        if (saved) useGalaxy.getState().resume(saved);
        else if (scene) {
          const { level, dice, ...options } = scene;
          useGalaxy.getState().startPractice(
            createGalaxyScenario({
              ...options,
              board: boardOfSky(scene.rules.sky),
            }),
            level,
            dice,
          );
        } else {
          const s = useGalaxySettings.getState();
          useGalaxy.getState().newGame({
            rules: rulesFromSettings(s),
            level: s.level,
            ...(hooks.__galaxySeed !== undefined
              ? { seed: hooks.__galaxySeed }
              : {}),
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
