"use client";

import { MAX_PLAYERS, MIN_PLAYERS } from "@game/onecard-engine";
import { useEffect, useState } from "react";

import { GameHome } from "@/components/GameHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useScreenHistory } from "@/game/screen-history";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { useOnecardTutorialProgress } from "@/tutorial/progress";

import { endOnecardSession } from "../session";
import {
  ONECARD_LEVELS,
  type OnecardLevel,
  rulesOf,
  useOnecardSettings,
} from "../settings";
import {
  clearOnecard,
  loadOnecard,
  type OnecardSaved,
  useOnecard,
} from "../store";
import { ONECARD_LESSONS } from "../tutorial/lessons";
import { OnecardCardView } from "./OnecardCard";
import { ONECARD_BG, OnecardGame } from "./OnecardGame";
import { OnecardOnlineScreen } from "./OnecardOnlineScreen";
import { onecardTutorial } from "./onecard-tutorial";

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
      data-game="onecard"
      className={cn("flex min-h-dvh justify-center p-4 text-white", ONECARD_BG)}
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
        <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur">
          {children}
        </div>
      </div>
    </main>
  );
}

const PLAYER_OPTIONS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i,
);

/** 원카드 옵션: 인원·처음 장 수·판 끝·컴퓨터 단계 */
function OnecardOptions({ onBack }: { onBack: () => void }) {
  const s = useOnecardSettings();
  const level = ONECARD_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="원카드 옵션" onBack={onBack}>
      <Section title="인원">
        <div className="flex flex-wrap gap-1.5">
          {PLAYER_OPTIONS.map((p) => (
            <Chip
              key={p}
              active={s.players === p}
              onClick={() => s.set({ players: p })}
            >
              {p}명
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">
          나홀로 원카드는 나머지 자리에 컴퓨터가 앉는다.
        </p>
      </Section>
      <Section title="처음 받는 카드">
        <div className="flex flex-wrap gap-1.5">
          {([7, 5] as const).map((h) => (
            <Chip
              key={h}
              active={s.handSize === h}
              onClick={() => s.set({ handSize: h })}
            >
              {h}장
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="판 끝">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={!s.endOnFirst}
            onClick={() => s.set({ endOnFirst: false })}
          >
            한 사람 남을 때까지
          </Chip>
          <Chip
            active={s.endOnFirst}
            onClick={() => s.set({ endOnFirst: true })}
          >
            한 명이 다 내면 끝
          </Chip>
        </div>
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {ONECARD_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as OnecardLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
    </SubScreen>
  );
}

/** 원카드 규칙 한눈에 */
function OnecardRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "손에 든 카드를 먼저 다 내면 이긴다. 다 낸 순서대로 등수가 매겨지고, 끝까지 남은 사람은 남은 장 수로 가린다.",
    ],
    [
      "내기",
      "카드는 ♠◆♥♣ 52장과 조커 둘(흑백 조커, 컬러 조커)이다. 판 가운데에는 엎어 둔 더미와, 낸 카드를 펼쳐 쌓는 버린 더미가 있다. 버린 더미 맨 위 카드와 무늬나 숫자가 같은 카드를 낸다. 조커는 아무 때나 낼 수 있다. 낼 카드가 없거나 내기 싫으면 엎어 둔 더미에서 한 장 가져온다. 이것을 「먹는다」고 한다.",
    ],
    [
      "공격",
      "2·A·조커는 다음 사람에게 카드를 먹게 하는 공격 카드다. 2는 2장, A는 3장, ♠A는 5장, 흑백 조커는 5장, 컬러 조커는 7장이다. 공격을 받은 사람은 받아칠 카드를 내 공격을 더 쌓아 다음 사람에게 넘기거나, 쌓인 장수만큼 먹는다. 2에는 2나 같은 무늬 A, A에는 A, 조커에는 조커로 받아칠 수 있고, 조커는 2와 A에도 받아칠 수 있다.",
    ],
    ["7", "낸 사람이 다음 무늬를 고른다."],
    [
      "J·Q·K",
      "J를 내면 다음 사람을 건너뛰고, Q를 내면 도는 방향이 바뀌고, K를 낸 사람은 한 번 더 낸다.",
    ],
    [
      "원카드!",
      "누군가 손에 한 장만 남으면 3초 동안 겨루기가 열린다. 버린 더미를 치는 사람(PC는 스페이스) 가운데 가장 빨리 반응한 사람이 이긴다. 한 장이 된 본인이 가장 빠르면 안전하고, 남이 더 빠르면 본인이 한 장 먹는다. 아무도 안 치면 그냥 지나간다. 한 장이 되기 전에 미리 치거나 겨루기가 없을 때 치면 헛외침이라 친 사람이 한 장 먹는다.",
    ],
    [
      "누가 빨랐나",
      "각자 자기 기기에서 '한 장이 된 화면이 뜬 때부터 친 때까지'를 재서 견준다. 그래서 인터넷이 느려도 손해를 덜 본다. 0.1초보다 빠른 반응은 미리 짐작한 것으로 보고 모두 0.1초로 친다. 0.01초 안쪽으로 비기면 한 장이 된 본인이 이긴다.",
    ],
    [
      "한계",
      "정직하게 하는 사람끼리는 공정하다. 다만 마음먹고 앱을 고쳐 반응 시간을 꾸미고 인터넷이 느린 척하면, 최대 0.15초 남짓 이득을 볼 수 있다. 기기마다 화면과 터치가 늦는 정도(0.01초에서 0.1초 사이)의 차이도 지울 수 없다.",
    ],
    [
      "끝낼 수 없는 카드",
      "공격 카드(2·A·조커)를 마지막 한 장으로 낼 수는 없다.",
    ],
    ["파산", "손에 든 카드가 20장이 되면 파산이라 판에서 빠진다."],
  ];
  return (
    <SubScreen title="원카드는?" onBack={onBack}>
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

function OnecardHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: OnecardSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useOnecardSettings();
  const learned = useOnecardTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<OnecardSaved | null>(null);
  useEffect(() => setSaved(loadOnecard()), []);
  const level = ONECARD_LEVELS.find((l) => l.value === s.level)?.label;
  return (
    <GameHome
      game="onecard"
      theme="onecard"
      background={ONECARD_BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center -space-x-5" aria-hidden="true">
            <OnecardCardView card="S7" width={52} className="-rotate-12" />
            <OnecardCardView
              card="JC"
              width={52}
              className="z-10 -translate-y-2"
            />
            <OnecardCardView card="HA" width={52} className="rotate-12" />
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">원카드</h1>
        </>
      }
      tagline={
        <>
          무늬나 숫자를 맞춰 먼저 다 내세요.
          <br />
          <strong className="text-amber-200">
            버린 더미를 탁 치면 원카드!
          </strong>
        </>
      }
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "🃏",
        title: "나홀로 원카드",
        detail: [`컴퓨터 ${s.players - 1}명과`, `${s.handSize}장`, level]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 원카드",
        detail: `${s.players}명 · 링크로 초대`,
        onClick: onOnline,
      }}
      learn={{
        title: "원카드 배우기",
        learned,
        total: ONECARD_LESSONS.length,
        firstHint: `처음이라면 여기부터. 카드 내기부터 원카드 외치기까지 ${ONECARD_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="원카드는?"
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

/** 원카드(/onecard): 첫 화면, 옵션, 규칙, 배우기, 친구와 하기(온라인 방), 대국 화면 */
export function OnecardApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endOnecardSession();
    useOnecard.getState().leave();
  }
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial"] },
  );
  const view = useOnecard((s) => s.view);

  // 끝난 게임은 이어하기에 남기지 않는다(튜토리얼 미션은 이어하기 저장과 상관없다).
  useEffect(() => {
    if (view?.phase === "over" && !useOnecard.getState().practice)
      clearOnecard();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("onecard");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });

  if (screen.kind === "online")
    return (
      <OnecardOnlineScreen
        rules={rulesOf(useOnecardSettings.getState())}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <OnecardGame onExit={backToStart} />;
  if (screen.kind === "options") return <OnecardOptions onBack={backToStart} />;
  if (screen.kind === "rules")
    return <OnecardRulesScreen onBack={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={onecardTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={onecardTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  return (
    <OnecardHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) {
          try {
            useOnecard.getState().resume(saved);
          } catch {
            clearOnecard();
            return;
          }
        } else {
          const s = useOnecardSettings.getState();
          const seed = Number(
            new URLSearchParams(window.location.search).get("seed"),
          );
          useOnecard.getState().newGame({
            rules: rulesOf(s),
            level: s.level,
            ...(Number.isInteger(seed) && seed > 0 ? { seed } : {}),
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
