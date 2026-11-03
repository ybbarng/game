"use client";

import {
  boardOfSky,
  createGalaxyScenario,
  type GalaxyRules,
  NUMBERS,
  type ScenarioStar,
} from "@game/galaxy-engine";
import { useEffect, useState } from "react";
import { GameHome } from "@/components/GameHome";
import { useScreenHistory } from "@/game/screen-history";
import { cn } from "@/lib/cn";

import { GalaxyIconArt } from "../icon-art";
import {
  GALAXY_LENGTHS,
  GALAXY_LEVELS,
  type GalaxyLevel,
  lengthDetail,
  rulesFromSettings,
  useGalaxySettings,
} from "../settings";
import { clearGalaxy, type GalaxySaved, loadGalaxy, useGalaxy } from "../store";
import { GALAXY_BG, GalaxyGame } from "./GalaxyGame";
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

/** 은하 한 바퀴 옵션: 인원·판 길이·거래·제철 하늘·컴퓨터 실력·따라가는 시점 */
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
      <Section title="거래">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={s.trade} onClick={() => s.set({ trade: true })}>
            켬
          </Chip>
          <Chip active={!s.trade} onClick={() => s.set({ trade: false })}>
            끔
          </Chip>
        </div>
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
      </Section>
    </SubScreen>
  );
}

/** 은하 한 바퀴 규칙 한눈에 */
function GalaxyRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "주사위를 굴려 계절 하늘 32칸을 돌며 별을 사고 정거장을 지어, 판이 끝날 때 자산이 가장 많으면 1등이에요. 자산은 별빛과 가진 별·정거장 값, 완성한 별자리마다 100을 더한 것이에요.",
    ],
    [
      "별 사기",
      "주인 없는 별에 멈추면 살 수 있어요. 사지 않으면 모두가 한 번에 몰래 값을 적어 내는 봉인 입찰로 넘어가요. 밝은 별자리일수록 비싸요.",
    ],
    [
      "이용료",
      "남의 별에 멈추면 정거장 이용료를 내요. 같은 별자리 별을 둘 가지면 선이 이어져 1.5배, 셋 모두면 별자리 완성으로 2배이고 정거장을 올릴 수 있어요.",
    ],
    [
      "모퉁이",
      `카노푸스 우주국을 지나면 지원금 ${NUMBERS.salary}, 관측지에 멈추면 뒤처진 사람일수록 많은 관측 지원금, 혜성에서는 한 번 더 굴려 더 가요. 소행성대에 걸리면 ${NUMBERS.asteroidFine}을 내거나 같은 눈이 나와야 나가요(한 차례만 쉬어요).`,
    ],
    [
      "우주국 공문",
      "공문 칸에 멈추면 한 장을 펴요. 별의 밝기·온도·거리로 셈하는 공문이 있어 별을 알면 판을 더 잘 읽어요.",
    ],
    [
      "끝",
      "정한 차례 수를 마치거나 누가 운항을 멈추면(파산) 끝나요. 긴 판은 한 사람만 남을 때까지예요.",
    ],
    [
      "별빛",
      "별빛은 이 판 안에서만 쓰는 점수예요. 실제 돈과 바꿀 수 없고 판이 끝나면 사라져요.",
    ],
    [
      "공정한 주사위",
      "주사위와 공문은 모든 자리가 판 처음에 약속한 해시 사슬에서 한 고리씩 꺼내 정해요. 누구도 결과를 고르거나 미리 알 수 없어요.",
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
  onOptions,
  onRules,
}: {
  onStart: (saved?: GalaxySaved) => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useGalaxySettings();
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
        title: "컴퓨터와 시작",
        detail: [
          `${s.players}명`,
          length,
          lengthDetail(rules).split(" · ")[1],
          s.trade ? "거래" : "거래 없음",
          s.seasonal ? "제철 하늘" : null,
          `컴퓨터 ${level}`,
        ]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
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
  };
}

type Screen =
  | { kind: "start" }
  | { kind: "playing" }
  | { kind: "options" }
  | { kind: "rules" };

/** 은하 한 바퀴(/galaxy): 첫 화면, 옵션, 규칙, 대국. 친구와 하기(G5)·배우기(G6)는 아직 없다 */
export function GalaxyApp() {
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    {
      leavePlay: () => useGalaxy.getState().leave(),
      restorable: ["options", "rules"],
    },
  );
  const view = useGalaxy((s) => s.view);

  // 다 끝난 게임은 이어하기에 남기지 않는다.
  useEffect(() => {
    if (view?.phase === "gameOver") clearGalaxy();
  }, [view?.phase]);

  const backToStart = () => setScreen({ kind: "start" });
  if (screen.kind === "playing") return <GalaxyGame onExit={backToStart} />;
  if (screen.kind === "options") return <GalaxyOptions onBack={backToStart} />;
  if (screen.kind === "rules")
    return <GalaxyRulesScreen onBack={backToStart} />;
  return (
    <GalaxyHome
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        const hooks = window as GalaxyTestHooks;
        const scene = hooks.__galaxyScenario;
        if (saved) useGalaxy.getState().resume(saved);
        else if (scene) {
          const { level, ...options } = scene;
          useGalaxy.getState().startPractice(
            createGalaxyScenario({
              ...options,
              board: boardOfSky(scene.rules.sky),
            }),
            level,
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
