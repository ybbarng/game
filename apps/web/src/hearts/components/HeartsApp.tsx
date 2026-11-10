"use client";

import {
  encodeHeartsRules,
  type HeartsRules,
  WINDOWS_RULE_CODE,
} from "@game/hearts-engine";
import { type ReactNode, useEffect, useState } from "react";
import { GameHome } from "@/components/GameHome";
import { ActionButton } from "@/components/panels/common";
import { SuitStylePicker } from "@/components/SuitStylePicker";
import { SuitText } from "@/components/SuitText";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useScreenHistory } from "@/game/screen-history";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { useHeartsTutorialProgress } from "@/tutorial/progress";

import { HEARTS_LEVELS } from "../bots";
import { endHeartsSession } from "../session";
import { heartsRules, useHeartsSettings } from "../settings";
import { clearHearts, type HeartsSaved, loadHearts, useHearts } from "../store";
import { HEARTS_LESSONS } from "../tutorial";
import { HeartsOnlineScreen } from "./HeartsOnlineScreen";
import { HeartsTable } from "./HeartsTable";
import { heartsTutorial } from "./hearts-tutorial";

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

const BG =
  "flex min-h-dvh justify-center bg-[radial-gradient(ellipse_at_center,#7f1d1d_0%,#3b0a0a_80%)] p-4";

/** 하트(/hearts) */
export function HeartsApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endHeartsSession();
    useHearts.setState({
      seatNames: null,
      audit: null,
      hostLeft: false,
      reconnecting: false,
      offlineSeats: [],
      endVote: null,
    });
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial"] },
  );
  const [saved, setSaved] = useState<HeartsSaved | null>(null);
  const ruleCode = useHeartsSettings((s) => s.ruleCode);
  const level = useHeartsSettings((s) => s.level);
  const newGame = useHearts((s) => s.newGame);
  const resume = useHearts((s) => s.resume);
  const learned = useHeartsTutorialProgress((s) => s.completed.length);

  useEffect(() => {
    if (screen.kind === "start") setSaved(loadHearts());
  }, [screen.kind]);

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("hearts");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });

  const rules = heartsRules(ruleCode);

  if (screen.kind === "online")
    return (
      <HeartsOnlineScreen
        rules={rules}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <HeartsTable onExit={backToStart} />;
  if (screen.kind === "options")
    return <HeartsOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <HeartsRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={heartsTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={heartsTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );

  const levelLabel = HEARTS_LEVELS.find((l) => l.value === level)?.label;
  return (
    <GameHome
      game="hearts"
      background="bg-[radial-gradient(ellipse_at_center,#7f1d1d_0%,#3b0a0a_80%)]"
      primaryClass="border-rose-300 bg-rose-500 text-white hover:bg-rose-400"
      hero={
        <>
          <div className="text-7xl text-red-500 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
            ♥
          </div>
          <h1 className="mt-1 font-black text-4xl tracking-wide">하트</h1>
        </>
      }
      tagline={
        <SuitText text="하트와 ♠Q를 가져오지 않게 피하고, 벌점이 가장 적은 사람이 이긴다" />
      }
      {...(saved
        ? {
            resume: () => {
              try {
                resume(saved);
                setScreen({ kind: "playing" });
              } catch {
                clearHearts();
                setSaved(null);
              }
            },
          }
        : {})}
      solo={{
        icon: "♥",
        title: "나홀로 하트",
        detail: `컴퓨터 3명과 · ${ruleCode === WINDOWS_RULE_CODE ? "윈도우 하트" : "직접 정한 규칙"} · ${levelLabel ?? ""}`,
        onClick: () => {
          const seed = Number(
            new URLSearchParams(window.location.search).get("seed"),
          );
          newGame({
            rules,
            ...(Number.isInteger(seed) && seed > 0 ? { seed } : {}),
          });
          setScreen({ kind: "playing" });
        },
      }}
      together={{
        icon: "👥",
        title: "다함께 하트",
        detail: "링크로 친구를 부릅니다. 빈자리는 컴퓨터가 앉습니다",
        onClick: () => setScreen({ kind: "online", room: null }),
      }}
      learn={{
        title: "하트 배우기",
        learned,
        total: HEARTS_LESSONS.length,
        firstHint: `처음이라면 여기부터. ${HEARTS_LESSONS.length}단원, 미션 3개`,
        onClick: () => setScreen({ kind: "tutorial" }),
      }}
      onOptions={() => setScreen({ kind: "options" })}
      aboutLabel="하트는?"
      onAbout={() => setScreen({ kind: "rules" })}
      credit="윈도우에 들어 있던 하트 규칙을 따라 만들었습니다"
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold text-sm">{title}</h2>
      {children}
    </section>
  );
}

const chip = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-xs",
    on ? "border-amber-300 bg-white text-black" : "border-white/15 bg-white/5",
  );

function Choice<T extends string | number | boolean>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={chip(o.value === value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 하트 옵션: 컴퓨터 실력과 규칙 */
function HeartsOptions({ onBack }: { onBack: () => void }) {
  const ruleCode = useHeartsSettings((s) => s.ruleCode);
  const setRuleCode = useHeartsSettings((s) => s.setRuleCode);
  const level = useHeartsSettings((s) => s.level);
  const setLevel = useHeartsSettings((s) => s.setLevel);
  const rules = heartsRules(ruleCode);
  const update = (patch: Partial<HeartsRules>) =>
    setRuleCode(encodeHeartsRules({ ...rules, ...patch }));
  const onOff = [
    { value: true, label: "켜기" },
    { value: false, label: "끄기" },
  ] as const;

  return (
    <main className={BG}>
      <div className="flex w-full max-w-md flex-col gap-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">하트 옵션</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            처음으로
          </button>
        </div>
        <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur">
          <Section title="컴퓨터 실력">
            <Choice value={level} options={HEARTS_LEVELS} onChange={setLevel} />
            <p className="text-xs opacity-60">
              {HEARTS_LEVELS.find((l) => l.value === level)?.description}
            </p>
          </Section>
          <Section title="무늬 표기">
            <SuitStylePicker detail />
          </Section>
          <Section title="규칙">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs opacity-70">{ruleCode}</span>
              {ruleCode !== WINDOWS_RULE_CODE && (
                <button
                  type="button"
                  onClick={() => setRuleCode(WINDOWS_RULE_CODE)}
                  className="rounded bg-white/10 px-2 py-0.5 text-xs"
                >
                  윈도우 하트로 되돌리기
                </button>
              )}
            </div>
            <span className="text-xs opacity-70">카드 넘기기</span>
            <Choice
              value={rules.passing}
              options={[
                { value: "cycle", label: "왼·오른·맞은편·안 넘김" },
                { value: "left", label: "늘 왼쪽" },
                { value: "none", label: "안 넘김" },
              ]}
              onChange={(passing) => update({ passing })}
            />
            <span className="text-xs opacity-70">
              <SuitText text="문 슛(하트 13장과 ♠Q 독차지)" />
            </span>
            <Choice
              value={rules.moon}
              options={[
                { value: "others", label: "다른 사람 +26" },
                { value: "self", label: "내 점수 −26" },
                { value: "off", label: "없음" },
              ]}
              onChange={(moon) => update({ moon })}
            />
            <span className="text-xs opacity-70">
              하트 깨기(하트가 나오기 전에는 선일 때 하트를 못 낸다)
            </span>
            <Choice
              value={rules.heartsBreak}
              options={onOff}
              onChange={(heartsBreak) => update({ heartsBreak })}
            />
            <span className="text-xs opacity-70">
              <SuitText text="♠Q가 나와도 하트가 깨진다" />
            </span>
            <Choice
              value={rules.queenBreaksHearts}
              options={onOff}
              onChange={(queenBreaksHearts) => update({ queenBreaksHearts })}
            />
            <span className="text-xs opacity-70">
              <SuitText text="첫 턴에 하트·♠Q를 낼 수 있다" />
            </span>
            <Choice
              value={rules.firstTrickPoints}
              options={onOff}
              onChange={(firstTrickPoints) => update({ firstTrickPoints })}
            />
            <span className="text-xs opacity-70">
              <SuitText text="◆J를 먹으면 −10점" />
            </span>
            <Choice
              value={rules.jackOfDiamonds}
              options={onOff}
              onChange={(jackOfDiamonds) => update({ jackOfDiamonds })}
            />
            <span className="text-xs opacity-70">게임이 끝나는 점수</span>
            <Choice
              value={rules.endScore}
              options={[50, 100, 150].map((v) => ({
                value: v,
                label: `${v}점`,
              }))}
              onChange={(endScore) => update({ endScore })}
            />
          </Section>
          <p className="text-xs opacity-60">
            카드 디자인, 진행 속도, 효과음, 컴퓨터 이름은 마이티 옵션 화면에서
            고른 것을 함께 쓴다.
          </p>
        </div>
      </div>
    </main>
  );
}

/** 하트 규칙 한눈에 */
function HeartsRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "네 명이 13장씩 받아 겨룬다. 가져간 하트와 ♠Q가 벌점이고, 누군가 벌점이 옵션에서 정한 점수(기본 100점) 이상이 되면 게임이 끝난다. 그때 벌점이 가장 낮은 사람이 이긴다.",
    ],
    [
      "한 턴",
      "넷이 자리 순서대로 한 장씩 내는 한 바퀴를 턴이라 한다. 그 턴에 맨 처음 카드를 내는 사람을 선이라 한다. 선이 낸 무늬에서 가장 높은 카드를 낸 사람이 턴을 이겨 나온 카드 넉 장을 모두 가져가고, 다음 턴의 선이 된다. 가져가는 것을 「먹는다」고 한다. 높은 차례는 A, K, Q, J, 10 … 2다.",
    ],
    ["벌점", "하트 한 장은 1점, ♠Q는 13점이다. 한 판에 모두 26점이다."],
    [
      "카드 넘기기",
      "판을 시작하기 전에 고른 카드 3장을 다른 사람에게 넘긴다. 받는 사람은 판마다 왼쪽 → 오른쪽 → 맞은편 → 안 넘김 차례로 바뀐다.",
    ],
    [
      "시작",
      "♣2를 가진 사람이 첫 턴의 선이 되어 ♣2를 낸다. 첫 턴에는 하트와 ♠Q를 낼 수 없다.",
    ],
    [
      "따라 내기",
      "선이 낸 무늬가 손에 있으면 그 무늬를 내야 한다. 없으면 아무 카드나 낼 수 있고, 이것을 「버린다」고 한다. 버린 카드는 턴을 이기지 못한다. 다른 무늬를 모두 이기는 무늬는 없다.",
    ],
    [
      "하트 깨기",
      "누군가 하트를 한 장이라도 내기 전에는, 선일 때 하트를 낼 수 없다. 손에 하트뿐이면 낼 수 있다. 하트가 처음 나오는 것을 「하트가 깨진다」고 한다.",
    ],
    [
      "문 슛",
      "하트 13장과 ♠Q를 혼자 다 먹으면 나는 0점, 다른 사람이 26점씩 받는다.",
    ],
    [
      "요령",
      "넘길 때는 높은 카드와 ♠Q·♠A·♠K를 넘긴다. 따라 낼 때는 지금 이기고 있는 카드보다 바로 아래 카드를 내 턴을 피한다. 선이 낸 무늬가 손에 없으면 ♠Q와 높은 하트를 버린다.",
    ],
  ];
  return (
    <main className={BG}>
      <div className="flex w-full max-w-md flex-col gap-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">하트는?</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            처음으로
          </button>
        </div>
        <dl className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/40 p-5 text-sm shadow-2xl">
          {items.map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-bold text-rose-200">{term}</dt>
              <dd className="leading-relaxed opacity-85">
                <SuitText text={meaning} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-center text-xs opacity-50">
          윈도우 하트의 규칙을 따랐다. 규칙은 옵션에서 바꿀 수 있다. 친구와 할
          때의 공정성은{" "}
          <a href="/security" className="underline">
            어떻게 지켜지나요?
          </a>
        </p>
        <ActionButton onClick={onBack}>처음으로</ActionButton>
      </div>
    </main>
  );
}
