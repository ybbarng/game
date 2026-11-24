"use client";

import { useEffect, useState } from "react";
import { GameHome } from "@/components/GameHome";
import { RoomScreen } from "@/components/RoomScreen";
import {
  TimePresetPicker,
  timePresetLabel,
} from "@/components/TimePresetPicker";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useScreenHistory } from "@/game/screen-history";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { canVibrate } from "../haptics";
import { YutIconArt } from "../icon-art";
import { yutOnline, yutRulesSummary } from "../online";
import { useYutTutorialProgress } from "../progress";
import { endYutSession } from "../session";
import {
  rulesFromSettings,
  useYutSettings,
  YUT_LEVELS,
  YUT_LINEUPS,
  type YutLevel,
} from "../settings";
import { clearYut, loadYut, useYut, type YutSaved } from "../store";
import { YUT_LESSONS } from "../tutorial";
import { YUT_BG, YutGame } from "./YutGame";
import { yutTutorial } from "./yut-tutorial";

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
    <main
      data-game="yut"
      className={cn("flex min-h-dvh justify-center p-4 text-white", YUT_BG)}
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

/** 윷놀이 옵션. 다함께도 여기서 고른 판 짜기·규칙을 쓴다(빈자리는 컴퓨터) */
function YutOptions({ onBack }: { onBack: () => void }) {
  const s = useYutSettings();
  const lineup = YUT_LINEUPS.find((l) => l.value === s.lineup);
  const level = YUT_LEVELS.find((l) => l.value === s.level);
  // 진동 줄은 진동 함수가 있는 기기에만(첫 그리기 뒤에 알아본다)
  const [vibrates, setVibrates] = useState(false);
  useEffect(() => setVibrates(canVibrate()), []);
  return (
    <SubScreen title="윷놀이 옵션" onBack={onBack}>
      <Section title="판 짜기">
        <div className="flex flex-wrap gap-1.5">
          {YUT_LINEUPS.map((l) => (
            <Chip
              key={l.value}
              active={s.lineup === l.value}
              onClick={() => s.set({ lineup: l.value })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{lineup?.description}</p>
      </Section>
      <Section title="말 수">
        <div className="flex flex-wrap gap-1.5">
          {[2, 3, 4, 5].map((n) => (
            <Chip
              key={n}
              active={s.pieces === n}
              onClick={() => s.set({ pieces: n })}
            >
              {n}개
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="빽도">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={s.backDo} onClick={() => s.set({ backDo: true })}>
            있음
          </Chip>
          <Chip active={!s.backDo} onClick={() => s.set({ backDo: false })}>
            없음
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          표시가 있는 가락 하나만 배가 위면 빽도이고, 한 칸 뒤로 가요.
        </p>
      </Section>
      <Section title="던지기 확률">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={s.flatPercent === 60}
            onClick={() => s.set({ flatPercent: 60 })}
          >
            실제 윷처럼
          </Chip>
          <Chip
            active={s.flatPercent === 50}
            onClick={() => s.set({ flatPercent: 50 })}
          >
            고르게
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          {s.flatPercent === 60
            ? "가락마다 배가 위로 올 확률이 60%예요."
            : "가락마다 배가 위로 올 확률이 반반이에요."}
        </p>
      </Section>
      <Section title="참먹이">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={!s.landOnHome}
            onClick={() => s.set({ landOnHome: false })}
          >
            지나야 남
          </Chip>
          <Chip
            active={s.landOnHome}
            onClick={() => s.set({ landOnHome: true })}
          >
            서도 남
          </Chip>
        </div>
      </Section>
      <Section title="낙">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={s.nak} onClick={() => s.set({ nak: true })}>
            있음
          </Chip>
          <Chip active={!s.nak} onClick={() => s.set({ nak: false })}>
            없음
          </Chip>
        </div>
        {s.nak && (
          <p className="text-xs opacity-60">
            윷을 던져 받는 짚 깔개(멍석) 밖으로 윷가락이 떨어지면 낙이에요.
          </p>
        )}
      </Section>
      <Section title="개인 시간">
        <TimePresetPicker value={s.time} onChange={(time) => s.set({ time })} />
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {YUT_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as YutLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      {vibrates && (
        <Section title="진동">
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={s.vibrate !== false}
              onClick={() => s.set({ vibrate: true })}
            >
              켬
            </Chip>
            <Chip
              active={s.vibrate === false}
              onClick={() => s.set({ vibrate: false })}
            >
              끔
            </Chip>
          </div>
        </Section>
      )}
    </SubScreen>
  );
}

/** 윷놀이 규칙 한눈에 */
function YutRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "윷판 오른쪽 아래 모서리 자리를 참먹이라 해요. 판 밖에서 기다리던 말은 던진 칸 수만큼 참먹이 다음 칸부터 세어 판에 들어오고, 판을 시계 반대 방향으로 한 바퀴 돌아요. 참먹이를 지나면 판에서 나가는데, 이것을 「난다」고 해요. 옵션에 따라 참먹이에 딱 멈춰도 나요. 내 말을 모두 먼저 내보내면 이겨요.",
    ],
    [
      "윷",
      "윷가락 넷을 던져 평평한 면(배)이 위로 온 가락 수만큼 가요. 하나면 도로 1칸, 둘이면 개로 2칸, 셋이면 걸로 3칸, 넷이면 윷으로 4칸, 하나도 없으면 모로 5칸 가요. 빽도(기본으로 켜져 있고 옵션에서 끌 수 있다)는 표시가 있는 가락 하나만 배가 위일 때이고, 1칸 뒤로 가요.",
    ],
    [
      "던지기",
      "윷은 짚으로 엮은 둥근 깔개(멍석) 위에 던져요. 화면 아래 윷가락을 쥔 손 그림을 잡고 아래로 당겼다가 위로 튕겨 놓아요. PC는 마우스로 끌었다 놓아요. 키보드로 Enter나 Space를 누르면 절반쯤 당겨 곧장 위로 천천히 튕긴 것과 같아요. 많이 당길수록 높이, 튕긴 쪽으로, 빨리 튕길수록 세게 던져요. 아주 조금만 당기고 놓으면 던지지 않고 다시 던지게 해요.",
    ],
    [
      "낙",
      "윷가락이 멍석 밖으로 떨어지면 낙이에요. 낙이 난 던지기는 없던 일이 되고, 윷·모로 한 번 더 던질 수 있었더라도 더 던지지 못해요. 그 차례에 먼저 나온 결과는 그대로 써요. 옆으로 치우칠수록, 빨리 튕길수록, 끝까지 다 당겨 아주 높이 던질수록 낙이 잘 나요. 옆으로 쓸어 던지면 반드시 낙이에요. 절반쯤 당겨 곧장 위로 천천히 튕기면 낙이 나지 않아요. 낙은 기본으로 켜져 있고 옵션에서 끌 수 있어요.",
    ],
    [
      "한 번 더",
      "윷·모가 나오거나 상대 말을 잡으면 한 번 더 던져요. 나온 결과는 모아 두었다가 원하는 말에 나눠 써요.",
    ],
    [
      "지름길",
      "오른쪽 위 모서리(모 자리), 왼쪽 위 모서리(뒷모 자리), 판 한가운데(방)에 멈춘 말은 다음에 대각선 지름길로 가요. 방에서는 참먹이 쪽으로 가요. 지나가기만 하면 가던 길을 그대로 가요.",
    ],
    [
      "업기·잡기",
      "내 말이 있는 자리에 서면 두 말이 업혀 함께 움직여요. 상대 말이 있는 자리에 서면 그 말을 잡아, 업힌 말까지 모두 판 밖 출발 전으로 돌려보내요.",
    ],
    [
      "공정한 던지기",
      "친구와 할 때는 온라인 대전을 연 사람(방장)의 기기가 결과를 계산하지만, 방장도 결과를 고를 수 없어요. 판을 시작할 때 모두의 기기가 던지기마다 하나씩 쓸 비밀 값을 여럿 정해 봉인해 둬요. 봉인은 봉투에 넣고 봉한 것처럼 넣은 사람 말고는 안을 볼 수 없지만, 나중에 열었을 때 바뀌지 않았는지 누구나 확인할 수 있게 하는 거예요. 던지면 던진 사람의 기기가 몸짓(당긴 길이·튕긴 쪽·빠르기)을 봉인해 먼저 보내고, 모두가 다음 비밀 값을 연 뒤에 몸짓을 열어요. 결과는 몸짓과 모두의 값을 모두가 아는 같은 계산법으로 섞어 정해요. 던진 사람은 몸짓을 정할 때 남의 값을 모르고, 다른 사람은 봉인된 몸짓을 몰라, 던지기 전에는 아무도 결과를 고르거나 미리 알 수 없어요. 몸짓으로 노릴 수 있는 것은 낙이 날지 말지뿐이에요. 모두의 값이 열린 뒤 20초 안에 몸짓을 열지 않으면 그 던지기는 낙처럼 없던 일이 돼요. 판이 끝나면 모두의 기기가 봉인과 연 값을 모두 다시 계산해 결과가 맞는지 확인해요.",
    ],
  ];
  return (
    <SubScreen title="윷놀이는?" onBack={onBack}>
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

/** 윷놀이 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function YutHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: YutSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useYutSettings();
  const learned = useYutTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<YutSaved | null>(null);
  useEffect(() => setSaved(loadYut()), []);
  const level = YUT_LEVELS.find((l) => l.value === s.level)?.label;
  const rules = rulesFromSettings(s);

  return (
    <GameHome
      game="yut"
      theme="yut"
      background={YUT_BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div aria-hidden="true" className="mx-auto size-24 drop-shadow-xl">
            <YutIconArt />
          </div>
          <h1 className="mt-3 font-black text-4xl tracking-wide drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]">
            윷놀이
          </h1>
        </>
      }
      tagline="윷가락을 던져 말을 몰고, 상대 말을 잡아요."
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "🪵",
        title: "나홀로 윷놀이",
        detail: [
          yutRulesSummary(rules),
          timePresetLabel(rules.time),
          `컴퓨터 ${level ?? ""}`,
        ]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 윷놀이",
        detail: "링크로 친구를 불러요. 던지기는 모두의 기기가 함께 정해요.",
        onClick: onOnline,
      }}
      learn={{
        title: "윷놀이 배우기",
        learned,
        total: YUT_LESSONS.length,
        firstHint: `${YUT_LESSONS.length}단원이 있어요.`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="윷놀이는?"
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

/** 윷놀이(/yut): 첫 화면, 옵션, 규칙, 배우기, 다함께 방, 대국 화면 */
export function YutApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endYutSession();
    useYut.getState().leave();
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial"] },
  );
  const view = useYut((s) => s.view);
  const settings = useYutSettings();

  // 다 끝난 게임은 이어하기에 남기지 않는다.
  useEffect(() => {
    if (view?.phase === "gameOver" && !useYut.getState().practice) clearYut();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("yut");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });
  /** 컴퓨터와 새 판(첫 화면 「시작」과 판 끝 「다시 하기」). 고른 설정 그대로, 씨앗은 새로 */
  const startSolo = () => {
    const s = useYutSettings.getState();
    useYut.getState().newGame({
      rules: rulesFromSettings(s),
      level: s.level,
    });
  };

  if (screen.kind === "online")
    return (
      <RoomScreen
        game={yutOnline}
        rules={rulesFromSettings(settings)}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing")
    return <YutGame onExit={backToStart} onRestart={startSolo} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={yutTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={yutTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <YutOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <YutRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <YutHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useYut.getState().resume(saved);
        else startSolo();
        setScreen({ kind: "playing" });
      }}
    />
  );
}
