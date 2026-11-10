"use client";

import { useEffect, useState } from "react";
import { GameHome } from "@/components/GameHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useScreenHistory } from "@/game/screen-history";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";

import { useGostopTutorialProgress } from "../progress";
import { endGostopSession } from "../session";
import {
  GOSTOP_LEVELS,
  type GostopLevel,
  GUKJIN_INFO,
  gostopRulesOf,
  PLAYER_OPTIONS,
  ROUND_OPTIONS,
  useGostopSettings,
} from "../settings";
import { clearGostop, type GostopSaved, loadGostop, useGostop } from "../store";
import { GOSTOP_LESSONS } from "../tutorial";
import { GostopOnlineScreen } from "./GostopOnlineScreen";
import { GostopTable } from "./GostopTable";
import { gostopTutorial } from "./gostop-tutorial";

/** 고스톱 화면들의 배경(초록 담요) */
const BG = "bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_80%)]";

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

/** 고스톱 옵션: 인원·판 수·국진·컴퓨터. 다함께 고스톱도 여기서 고른 규칙을 쓴다 */
function GostopOptions({ onBack }: { onBack: () => void }) {
  const s = useGostopSettings();
  const gukjin = GUKJIN_INFO.find((g) => g.value === s.gukjin);
  const level = GOSTOP_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="고스톱 옵션" onBack={onBack}>
      <Section title="인원">
        <div className="flex flex-wrap gap-1.5">
          {PLAYER_OPTIONS.map((p) => (
            <Chip
              key={p.value}
              active={s.players === p.value}
              onClick={() => s.set({ players: p.value })}
            >
              {p.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">
          맞고는 10장씩 받고 바닥에 8장을 펼치며, 7점부터 고를 부를 수 있다.
          셋은 7장씩 받고 바닥에 6장을 펼치며, 3점부터 고를 부를 수 있다.
        </p>
      </Section>
      <Section title="판 수">
        <div className="flex flex-wrap gap-1.5">
          {ROUND_OPTIONS.map((r) => (
            <Chip
              key={r}
              active={s.rounds === r}
              onClick={() => s.set({ rounds: r })}
            >
              {r}판
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">
          정한 판 수를 치면 점수 합이 가장 많은 사람이 이긴다.
        </p>
      </Section>
      <Section title="국진(9월 열끗)">
        <div className="flex flex-wrap gap-1.5">
          {GUKJIN_INFO.map((g) => (
            <Chip
              key={g.value}
              active={s.gukjin === g.value}
              onClick={() => s.set({ gukjin: g.value })}
            >
              {g.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{gukjin?.description}</p>
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {GOSTOP_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as GostopLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <p className="text-xs opacity-60">
        다함께 고스톱도 여기서 고른 인원·판 수·국진 규칙으로 방을 연다.
        빈자리에는 컴퓨터(중수)가 앉는다.
      </p>
    </SubScreen>
  );
}

/** 고스톱 규칙 한눈에 */
function GostopRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "화투",
      "화투는 1월부터 12월까지 달마다 넉 장씩, 모두 48장이다. 카드 왼쪽 위 숫자가 그 카드의 달이고, 같은 달 카드끼리 짝이다.",
    ],
    [
      "목표",
      "바닥에 펼친 카드와 같은 달 카드를 맞춰 두 장을 함께 가져온다. 이것을 「먹는다」고 한다. 먹은 카드로 점수를 낸다. 점수가 둘이 치는 맞고에서는 7점, 셋이 칠 때는 3점 이상 나면 고나 스톱을 고른다. 고는 판을 이어 가며 점수를 더 내는 것이고, 스톱은 그 자리에서 판을 끝내고 이기는 것이다.",
    ],
    [
      "한 차례",
      "손에 든 카드 가운데 한 장을 낸다. 바닥에 같은 달 카드가 있으면 둘을 먹고, 없으면 낸 카드는 바닥에 놓인다. 그다음 엎어 쌓아 둔 더미에서 맨 위 카드를 뒤집어 똑같이 맞춘다. 바닥에 같은 달이 두 장이면 그중 하나를 골라 먹는다.",
    ],
    [
      "카드 종류",
      "48장은 광·열끗·띠·피 네 종류로 나뉜다. 광은 붉은 원 안에 「光」이 찍힌 다섯 장(1·3·8·11·12월)이고, 그중 12월 광을 비광이라 한다. 열끗은 새·짐승·물건이 그려진 카드, 띠는 긴 띠가 그려진 카드, 피는 나머지 카드다. 11월과 12월에는 「쌍」 도장이 찍힌 쌍피가 한 장씩 있는데, 피 두 장으로 센다. 9월 열끗인 국진(술잔)은 옵션에 따라 쌍피로도 센다.",
    ],
    [
      "광 점수",
      "광 석 장은 3점인데, 비광이 끼면 2점이다. 넉 장은 4점, 다섯 장은 15점이다.",
    ],
    [
      "열끗·띠 점수",
      "열끗은 5장을 모으면 1점이고, 한 장 더 모을 때마다 1점씩 오른다. 띠도 따로 세어 똑같이 5장부터 점수가 난다. 2·4·8월 열끗의 새 세 마리를 모두 모으면 고도리라 5점이다.",
    ],
    [
      "단",
      "「홍단」 글씨가 쓰인 1·2·3월 띠를 모두 모으면 홍단, 「청단」 글씨가 쓰인 6·9·10월 띠를 모두 모으면 청단, 4·5·7월 띠를 모두 모으면 초단이다. 각각 3점이다.",
    ],
    [
      "피 점수",
      "피는 10장을 모으면 1점이고, 한 장 더 모을 때마다 1점씩 오른다.",
    ],
    [
      "상대 피 가져오기",
      "다음 경우에는 상대가 먹은 피를 한 사람에게서 한 장씩 가져온다. 쪽은 바닥에 짝이 없어 내려놓은 카드를 뒤집은 카드가 바로 먹는 것이다. 따닥은 바닥의 같은 달 두 장 가운데 하나를 먹었는데 뒤집은 카드가 그 달 넷째 장이라 넉 장을 모두 먹는 것이다. 싹쓸이는 먹고 나서 바닥에 카드가 한 장도 남지 않는 것이다.",
    ],
    [
      "뻑",
      "낸 카드로 바닥 카드를 먹었는데 뒤집은 카드도 같은 달이면, 석 장이 먹히지 않고 바닥에 그대로 남는다. 이것을 뻑이라 한다. 나중에 그 달 넷째 장으로 석 장을 먹으면 상대마다 피 한 장씩을 가져오고, 자기가 만든 뻑(자뻑)이면 두 장씩 가져온다.",
    ],
    [
      "흔들기·폭탄·총통",
      "손에 같은 달 석 장이 있고 바닥에 그 달이 없을 때, 석 장을 보여 주고 한 장을 내면 흔들기다. 바닥에 그 달이 한 장 있을 때 석 장을 한꺼번에 내서 넉 장을 모두 먹으면 폭탄이고, 상대마다 피 한 장씩도 가져온다. 흔들기나 폭탄을 한 사람이 이기면 한 번마다 점수가 두 배가 된다. 처음 받은 카드에 같은 달 넉 장이 있으면 총통이라 그 자리에서 10점으로 이긴다.",
    ],
    [
      "고",
      "고를 부른 횟수만큼 점수를 더한다. 1고는 1점, 2고는 2점, 3고는 3점을 더한다. 그리고 3고는 그렇게 더한 점수가 두 배, 4고는 네 배, 5고는 여덟 배가 된다. 고를 부른 뒤에는 점수가 더 나야 다시 고·스톱을 묻는다. 고를 부른 사이 다른 사람이 먼저 스톱하면 고를 부른 사람은 진다.",
    ],
    [
      "박",
      "스톱한 사람이 이기면 진 사람은 그 점수만큼 내준다. 진 사람에게 다음 네 가지를 박이라 한다. 피박은 이긴 사람이 피로 점수를 냈는데 진 사람 피가 5장보다 적은 것, 광박은 이긴 사람이 광으로 점수를 냈는데 진 사람에게 광이 없는 것, 멍박은 이긴 사람 열끗이 7장 이상인 것, 고박은 고를 불렀다가 진 것이다. 진 사람은 걸린 박 하나마다 내줄 점수가 두 배가 된다. 셋이 칠 때 고박이 나오면 고를 부른 사람이 진 두 사람 몫을 혼자 낸다.",
    ],
    [
      "나가리",
      "손에 든 카드를 모두 낼 때까지 아무도 스톱하지 못하면 그 판은 점수 없이 끝난다. 이것을 나가리라 하고, 다음 판 점수가 두 배가 된다.",
    ],
  ];
  return (
    <SubScreen title="고스톱은?" onBack={onBack}>
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

/** 고스톱 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function GostopHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: GostopSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useGostopSettings();
  const learned = useGostopTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<GostopSaved | null>(null);
  useEffect(() => setSaved(loadGostop()), []);
  const level = GOSTOP_LEVELS.find((l) => l.value === s.level)?.label;
  const mode = s.players === 2 ? "맞고" : "셋이서";

  return (
    <GameHome
      game="gostop"
      theme="gostop"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center" aria-hidden="true">
            {["01g", "08g", "12g"].map((id, i) => (
              <span
                key={id}
                className="-mx-1"
                style={{ transform: `rotate(${(i - 1) * 12}deg)` }}
              >
                <HwatuCardView id={id} width={58} />
              </span>
            ))}
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">고스톱</h1>
        </>
      }
      tagline="같은 달끼리 짝 맞추고, 점수가 나면 고? 스톱?"
      {...(saved
        ? {
            resume: () => {
              try {
                onStart(saved);
              } catch {
                clearGostop();
                setSaved(null);
              }
            },
          }
        : {})}
      solo={{
        icon: "🎴",
        title: "나홀로 고스톱",
        detail: [`컴퓨터와 ${mode}`, `${s.rounds}판`, level]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 고스톱",
        detail: "링크로 친구를 부릅니다. 빈자리는 컴퓨터가 앉습니다.",
        onClick: onOnline,
      }}
      learn={{
        title: "고스톱 배우기",
        learned,
        total: GOSTOP_LESSONS.length,
        firstHint: `처음이라면 여기부터. 짝 맞추기부터 ${GOSTOP_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="고스톱은?"
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
  | { kind: "lesson"; lessonId: string };

/** 고스톱(/gostop): 첫 화면, 옵션, 규칙, 배우기, 다함께 고스톱 방, 대국 화면 */
export function GostopApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endGostopSession();
    useGostop.getState().leave();
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial"] },
  );
  const view = useGostop((s) => s.view);
  const players = useGostopSettings((s) => s.players);
  const rounds = useGostopSettings((s) => s.rounds);
  const gukjin = useGostopSettings((s) => s.gukjin);

  // 다 끝난 게임은 이어하기에 남기지 않는다(튜토리얼 미션은 이어하기 저장과 상관없다).
  useEffect(() => {
    if (view?.phase === "gameOver" && !useGostop.getState().practice)
      clearGostop();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("gostop");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });

  if (screen.kind === "online")
    return (
      <GostopOnlineScreen
        rules={gostopRulesOf({ players, rounds, gukjin })}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <GostopTable onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={gostopTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={gostopTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <GostopOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <GostopRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <GostopHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useGostop.getState().resume(saved);
        else {
          const s = useGostopSettings.getState();
          const seed = Number(
            new URLSearchParams(window.location.search).get("seed"),
          );
          useGostop.getState().newGame({
            rules: gostopRulesOf(s),
            level: s.level,
            ...(Number.isInteger(seed) && seed > 0 ? { seed } : {}),
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
