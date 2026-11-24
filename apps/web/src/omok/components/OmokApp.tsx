"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { GameHome } from "@/components/GameHome";
import { RoomScreen } from "@/components/LazyRoomScreen";
import { Chip } from "@/components/options/Chip";
import { Section, SubScreen } from "@/components/options/SubScreen";
import { ScreenLoading } from "@/components/ScreenLoading";
import {
  TimePresetPicker,
  timePresetLabel,
} from "@/components/TimePresetPicker";
import { useScreenHistory } from "@/game/screen-history";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { useOmokTutorialProgress } from "@/tutorial/progress";
import { omokOnline } from "../online";
import { endOmokSession } from "../session";
import {
  OMOK_LEVELS,
  type OmokLevel,
  useOmokSettings,
  VARIANT_INFO,
} from "../settings";
import {
  clearOmok,
  loadOmok,
  type OmokSaved,
  type StonePick,
  useOmok,
} from "../store";
import { OMOK_LESSONS } from "../tutorial";
import { OmokGame } from "./OmokGame";

/** 배우기·수 배우기 화면은 「배우기」를 눌렀을 때 불러온다(첫 화면 묶음에서 뺀다) */
const OmokLearn = dynamic(
  () => import("./OmokLearn").then((m) => m.OmokLearn),
  { loading: () => <ScreenLoading /> },
);

/** 오목 화면들의 배경(대국 화면의 짙은 돌색과 이어진다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]";

const WINS_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 2, label: "3판 2승" },
  { value: 3, label: "5판 3승" },
] as const;

const PICK_OPTIONS: readonly { value: StonePick; label: string }[] = [
  { value: "black", label: "● 흑(먼저)" },
  { value: "white", label: "○ 백" },
  { value: "random", label: "무작위" },
];

/** 판 위 돌과 같은 빛(왼쪽 위)과 그림자 */
const STONE = {
  black: "radial-gradient(circle at 36% 32%, #6b6b6b, #2a2a2a 35%, #050505)",
  white: "radial-gradient(circle at 36% 32%, #ffffff, #f1f0ec 55%, #b9b6ae)",
};

/** 오목 옵션: 규칙·판 수·컴퓨터·내 돌·금지 표시. 다함께 오목도 여기서 고른 규칙과 판 수를 쓴다 */
function OmokOptions({ onBack }: { onBack: () => void }) {
  const s = useOmokSettings();
  const variant = VARIANT_INFO.find((v) => v.value === s.variant);
  const level = OMOK_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="오목 옵션" onBack={onBack} bg={BG}>
      <Section title="규칙">
        <div className="flex flex-wrap gap-1.5">
          {VARIANT_INFO.map((v) => (
            <Chip
              key={v.value}
              active={s.variant === v.value}
              onClick={() => s.set({ variant: v.value })}
            >
              {v.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{variant?.description}</p>
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
          {OMOK_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as OmokLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <Section title="나홀로 오목에서 내 돌">
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
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.showForbidden}
          onChange={(e) => s.set({ showForbidden: e.target.checked })}
          className="size-4 accent-amber-300"
        />
        내 차례에 금지 자리를 ×로 보이기
      </label>
    </SubScreen>
  );
}

/** 오목 규칙 한눈에 */
function OmokRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "가로·세로·대각선 어느 쪽이든 내 돌 다섯 개를 한 줄로 먼저 이으면 이겨요.",
    ],
    [
      "두기",
      "15줄 판의 줄이 만나는 점에 둬요. 흑이 먼저 두고 한 수씩 번갈아 둬요. 둔 돌은 옮기지 않아요.",
    ],
    [
      "넷과 셋",
      "한 줄에 내 돌이 넷 있어 한 수만 더 두면 다섯이 되는 모양을 넷이라 해요. 다섯이 될 자리가 양쪽에 있어 상대가 한쪽을 막아도 다른 쪽으로 다섯을 만들 수 있는 넷은 열린 넷이에요. 한 수 더 두면 열린 넷이 되는 셋을 열린 셋이라 해요.",
    ],
    [
      "금지 자리",
      "규칙에 따라 둘 수 없는 자리가 있어요. 한 수로 열린 셋 두 개가 함께 생기는 자리를 3·3, 넷 두 개가 함께 생기는 자리를 4·4, 돌이 여섯 개 이상 이어지는 자리를 장목이라 해요. 아래 세 규칙 가운데 옵션에서 하나를 골라요.",
    ],
    [
      "일반 규칙",
      "정확히 다섯이어야 이겨요. 여섯 이상은 이긴 것으로 치지 않아요. 흑백 모두 3·3 자리에 둘 수 없어요.",
    ],
    ["자유 규칙", "다섯 이상이면 이겨요. 금지 자리가 없어요."],
    [
      "렌주 규칙",
      "먼저 두는 흑이 유리해서 흑만 3·3, 4·4, 장목 자리에 둘 수 없어요. 백은 다섯 이상이면 이겨요.",
    ],
    [
      "요령",
      "한 수 두기 전에 차례로 살펴요. 첫째, 내가 다섯을 만들 수 있나요? 둘째, 상대 넷을 막아야 하나요? 셋째, 내가 열린 넷을 만들 수 있나요? 넷째, 상대 열린 셋을 막아야 하나요?",
    ],
  ];
  return (
    <SubScreen title="오목은?" onBack={onBack} bg={BG}>
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

/** 오목 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function OmokHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: OmokSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useOmokSettings();
  const learned = useOmokTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<OmokSaved | null>(null);
  useEffect(() => setSaved(loadOmok()), []);
  const variant = VARIANT_INFO.find((v) => v.value === s.variant)?.label;
  const wins = WINS_OPTIONS.find((w) => w.value === s.winsToFinish)?.label;
  const level = OMOK_LEVELS.find((l) => l.value === s.level)?.label;

  return (
    <GameHome
      game="omok"
      theme="omok"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center" aria-hidden="true">
            <span
              className="size-16 rounded-full shadow-[2px_5px_8px_rgba(0,0,0,0.55)]"
              style={{ background: STONE.black }}
            />
            <span
              className="-ml-4 mt-5 size-16 rounded-full shadow-[2px_5px_8px_rgba(0,0,0,0.55)]"
              style={{ background: STONE.white }}
            />
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">오목</h1>
        </>
      }
      tagline="가로·세로·대각선으로 다섯 개를 먼저 잇는 사람이 이겨요."
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: (
          <span
            className="inline-block size-6 rounded-full align-middle shadow-[1px_2px_3px_rgba(0,0,0,0.5)]"
            style={{ background: STONE.black }}
          />
        ),
        title: "나홀로 오목",
        detail: [
          "컴퓨터와",
          `${variant ?? ""} 규칙`,
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
        title: "다함께 오목",
        detail: "링크로 친구를 불러요.",
        onClick: onOnline,
      }}
      learn={{
        title: "오목 배우기",
        learned,
        total: OMOK_LESSONS.length,
        firstHint: `${OMOK_LESSONS.length}단원과 직접 둬 보는 과제 4개가 있어요.`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="오목은?"
      onAbout={onRules}
    />
  );
}

export type Screen =
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
  | { kind: "puzzle"; puzzleId: string; review?: Review };

/** 「오늘 복습」으로 연 문제의 복습 줄(없으면 보통으로 연 문제) */
type Review = readonly string[] | undefined;

/** 배우기 묶음(OmokLearn)이 그리는 화면 */
const LEARN_KINDS = ["tutorial", "lesson", "study", "puzzle"] as const;
export type LearnScreen = Extract<
  Screen,
  { kind: (typeof LEARN_KINDS)[number] }
>;
const isLearn = (s: Screen): s is LearnScreen =>
  (LEARN_KINDS as readonly string[]).includes(s.kind);

/** 오목(/omok): 첫 화면, 옵션, 규칙, 배우기, 다함께 오목 방, 대국 화면 */
export function OmokApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endOmokSession();
    useOmok.getState().leave();
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial", "study"] },
  );
  const view = useOmok((s) => s.view);
  const variant = useOmokSettings((s) => s.variant);
  const winsToFinish = useOmokSettings((s) => s.winsToFinish);
  const time = useOmokSettings((s) => s.time);

  // 다 끝난 게임은 이어하기에 남기지 않는다.
  useEffect(() => {
    // 튜토리얼 미션은 이어하기 저장과 상관없다.
    if (view?.phase === "gameOver" && !useOmok.getState().practice) clearOmok();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("omok");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });
  /** 컴퓨터와 새 판(첫 화면 「시작」과 판 끝 「다시 하기」). 고른 설정 그대로, 씨앗은 새로 */
  const startSolo = () => {
    const s = useOmokSettings.getState();
    useOmok.getState().newGame({
      rules: {
        variant: s.variant,
        winsToFinish: s.winsToFinish,
        ...(s.time !== "none" ? { time: s.time } : {}),
      },
      level: s.level,
      pick: s.pick,
    });
  };
  if (screen.kind === "online")
    return (
      <RoomScreen
        game={omokOnline}
        rules={{ variant, winsToFinish, ...(time !== "none" ? { time } : {}) }}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing")
    return <OmokGame onExit={backToStart} onRestart={startSolo} />;
  if (isLearn(screen))
    return (
      <OmokLearn screen={screen} setScreen={setScreen} onBack={backToStart} />
    );
  if (screen.kind === "options")
    return <OmokOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <OmokRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <OmokHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useOmok.getState().resume(saved);
        else startSolo();
        setScreen({ kind: "playing" });
      }}
    />
  );
}
