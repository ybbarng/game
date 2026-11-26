"use client";

import { YAK_DESCRIPTIONS, YAK_NAMES } from "@game/minhwatu-engine";
import { useEffect, useState } from "react";
import { GameHome } from "@/components/GameHome";
import { RoomScreen } from "@/components/LazyRoomScreen";
import { Chip } from "@/components/options/Chip";
import { Section, SubScreen } from "@/components/options/SubScreen";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useScreenHistory } from "@/game/screen-history";
import { soloStarter } from "@/game/solo-start";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import { ro, topic } from "@/lib/josa";
import { type HostRestore, hostedRoom } from "@/net/host-store";

import { minhwatuRoom } from "../online";
import { useMinhwatuTutorialProgress } from "../progress";
import { describeRules } from "../rules-text";
import { endMinhwatuSession } from "../session";
import {
  MINHWATU_LEVELS,
  type MinhwatuLevel,
  PLAYER_OPTIONS,
  ROUND_OPTIONS,
  rulesOf,
  useMinhwatuSettings,
} from "../settings";
import {
  clearMinhwatu,
  loadMinhwatu,
  type MinhwatuSaved,
  useMinhwatu,
} from "../store";
import { MINHWATU_LESSONS } from "../tutorial";
import { MINHWATU_BG, MinhwatuTable } from "./MinhwatuTable";
import { minhwatuTutorial } from "./minhwatu-tutorial";

/** 민화투 옵션: 인원·판 수·약 점수·초단·사오동·컴퓨터. 다함께 민화투도 여기서 고른 규칙을 쓴다 */
function MinhwatuOptions({ onBack }: { onBack: () => void }) {
  const s = useMinhwatuSettings();
  const level = MINHWATU_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen
      title="민화투 옵션"
      onBack={onBack}
      bg={MINHWATU_BG}
      game="minhwatu"
    >
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
      </Section>
      <Section title="판 수">
        <div className="flex flex-wrap gap-1.5">
          {ROUND_OPTIONS.map((r) => (
            <Chip
              key={r.value}
              active={s.rounds === r.value}
              onClick={() => s.set({ rounds: r.value })}
            >
              {r.label}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="약 점수(초약·풍약·비약)">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={s.yakScore === 20}
            onClick={() => s.set({ yakScore: 20 })}
          >
            20점
          </Chip>
          <Chip
            active={s.yakScore === 10}
            onClick={() => s.set({ yakScore: 10 })}
          >
            10점
          </Chip>
        </div>
      </Section>
      <Section title="더 세는 약">
        <div className="flex flex-wrap gap-1.5">
          <ToggleSwitch
            on={s.chodan}
            onChange={(chodan) => s.set({ chodan })}
            className="min-h-11 text-xs"
          >
            초단 30점
          </ToggleSwitch>
          <ToggleSwitch
            on={s.saodong}
            onChange={(saodong) => s.set({ saodong })}
            className="min-h-11 text-xs"
          >
            사오동 40점
          </ToggleSwitch>
        </div>
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {MINHWATU_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as MinhwatuLevel })}
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

/** 민화투 규칙 한눈에 */
function MinhwatuRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "화투",
      "화투는 1월부터 12월까지 달마다 넉 장씩, 모두 48장이에요. 카드 왼쪽 위 숫자가 그 카드의 달이고, 같은 달 카드끼리 짝이에요.",
    ],
    [
      "목표",
      "바닥에 펼친 카드와 같은 달 카드를 맞춰 두 장을 함께 가져와요. 이것을 「먹는다」고 해요. 판이 끝나면 먹은 카드의 점수와, 정해진 카드 묶음을 모아 얻는 약 점수로 겨루고, 남보다 많은 점수를 내면 이겨요.",
    ],
    [
      "나누기",
      "2명이면 손에 10장씩 들고 바닥에 8장, 3명이면 7장씩과 바닥 6장, 4명이면 5장씩과 바닥 8장을 펼쳐요. 남은 카드는 엎어 쌓아 더미로 둬요. 바닥에 같은 달 넉 장이 깔리면 다시 섞어요.",
    ],
    [
      "한 차례",
      "손에 든 카드 가운데 한 장을 내요. 바닥에 같은 달 카드가 있으면 둘을 먹고, 없으면 낸 카드는 바닥에 놓여요. 그다음 더미에서 맨 위 카드를 뒤집어 똑같이 맞춰요.",
    ],
    [
      "같은 달이 여럿",
      "바닥에 같은 달이 두 장이면 하나를 골라 먹고, 석 장이면 낸 카드까지 넉 장을 다 먹어요. 더미에서 뒤집은 카드도 똑같아요.",
    ],
    [
      "카드 점수",
      "48장은 광·열끗·띠·피 네 종류예요. 광은 붉은 원 안에 「光」이 찍힌 카드로 20점, 열끗은 새·짐승·물건이 그려진 카드로 10점, 띠는 긴 띠가 그려진 카드로 5점, 피는 나머지 카드로 0점이에요. 48장을 모두 더하면 240점이에요.",
    ],
    [
      "약",
      [
        "정해진 카드 묶음을 모두 먹으면 약을 이뤄요. 약을 이루면 나머지 사람 한 사람에게서 그 약의 점수씩 받아요.",
        `${topic(YAK_NAMES.choyak)} ${YAK_DESCRIPTIONS.choyak}, ${topic(YAK_NAMES.pungyak)} ${YAK_DESCRIPTIONS.pungyak}, ${topic(YAK_NAMES.biyak)} ${YAK_DESCRIPTIONS.biyak}이고, 옵션에서 고른 대로 20점이나 10점이에요.`,
        `${topic(YAK_NAMES.hongdan)} ${YAK_DESCRIPTIONS.hongdan}, ${topic(YAK_NAMES.cheongdan)} ${ro(YAK_DESCRIPTIONS.cheongdan)} 30점이에요.`,
        `옵션에서 켜면 ${YAK_NAMES.chodan}(${YAK_DESCRIPTIONS.chodan}) 30점과 ${YAK_NAMES.saodong}(${YAK_DESCRIPTIONS.saodong}) 40점도 약으로 세요.`,
      ].join(". "),
    ],
    [
      "판 점수",
      "판 점수는 먹은 카드 점수에 약으로 받은 점수를 더하고, 약으로 준 점수와 본을 뺀 거예요. 본은 240점을 인원수로 나눈 몫으로, 3명이면 80점이에요. 그래서 모두의 판 점수를 더하면 0이 돼요.",
    ],
    [
      "먼저 내는 사람과 판 수",
      "판마다 가장 먼저 카드를 내는 사람을 선이라 해요. 첫 판 선은 무작위로 정하고, 그 뒤로는 앞 판 1등이 선이에요. 정한 판 수만큼 치고 판 점수 합계가 가장 높은 사람이 이겨요.",
    ],
  ];
  return (
    <SubScreen
      title="민화투는?"
      onBack={onBack}
      bg={MINHWATU_BG}
      game="minhwatu"
    >
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

/** 민화투 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function MinhwatuHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: MinhwatuSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useMinhwatuSettings();
  const learned = useMinhwatuTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<MinhwatuSaved | null>(null);
  useEffect(() => setSaved(loadMinhwatu()), []);
  const level = MINHWATU_LEVELS.find((l) => l.value === s.level)?.label;

  return (
    <GameHome
      game="minhwatu"
      theme="minhwatu"
      background={MINHWATU_BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center" aria-hidden="true">
            <span className="-rotate-12 translate-y-2">
              <HwatuCardView id="01g" width={58} />
            </span>
            <span className="z-10 -mx-3">
              <HwatuCardView id="08g" width={58} />
            </span>
            <span className="translate-y-2 rotate-12">
              <HwatuCardView id="03g" width={58} />
            </span>
          </div>
          <h1 className="mt-3 font-black text-4xl tracking-wide">민화투</h1>
        </>
      }
      tagline="같은 달끼리 짝 맞춰 가져와 카드 점수를 모아요."
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "🎴",
        title: "나홀로 민화투",
        detail: [`컴퓨터(${level})와`, describeRules(rulesOf(s))].join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 민화투",
        detail: "링크로 친구를 불러요.",
        onClick: onOnline,
      }}
      learn={{
        title: "민화투 배우기",
        learned,
        total: MINHWATU_LESSONS.length,
        firstHint: `짝 맞추기부터 ${MINHWATU_LESSONS.length}단원이 있어요.`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="민화투는?"
      onAbout={onRules}
    />
  );
}

type Screen =
  | { kind: "start" }
  | {
      kind: "online";
      room: string | null;
      resume?: { room: string; restore: HostRestore };
    }
  | { kind: "playing" }
  | { kind: "options" }
  | { kind: "rules" }
  | { kind: "tutorial" }
  | { kind: "lesson"; lessonId: string };

/** 주소의 `?seed=`(화면 시험이 같은 판을 다시 칠 때) */
function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get("seed");
  const seed = raw === null ? Number.NaN : Number(raw);
  return Number.isInteger(seed) && seed >= 0 ? seed : undefined;
}

/** 민화투(/minhwatu): 첫 화면, 옵션, 규칙, 배우기, 다함께 민화투 방, 대국 화면 */
export function MinhwatuApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endMinhwatuSession();
    useMinhwatu.getState().leave();
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial"] },
  );
  const view = useMinhwatu((s) => s.view);
  const settings = useMinhwatuSettings();

  // 다 끝난 게임은 이어하기에 남기지 않는다.
  useEffect(() => {
    if (view?.phase === "gameOver" && !useMinhwatu.getState().practice)
      clearMinhwatu();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("minhwatu");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });
  /**
   * 컴퓨터와 새 판(첫 화면 「시작」과 판 끝 「다시 하기」). 고른 설정 그대로.
   * 씨앗은 첫 화면에서만 주소 `?seed=`를 따르고, 「다시 하기」는 새로 뽑는다
   */
  const startSolo = soloStarter(useMinhwatu, useMinhwatuSettings, (s) => ({
    rules: rulesOf(s),
  }));

  if (screen.kind === "online")
    return (
      <RoomScreen
        game={minhwatuRoom}
        rules={rulesOf(settings)}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing")
    return <MinhwatuTable onExit={backToStart} onRestart={() => startSolo()} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={minhwatuTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={minhwatuTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <MinhwatuOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <MinhwatuRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <MinhwatuHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useMinhwatu.getState().resume(saved);
        else startSolo(seedFromUrl());
        setScreen({ kind: "playing" });
      }}
    />
  );
}
