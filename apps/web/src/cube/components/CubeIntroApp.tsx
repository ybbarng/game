"use client";

import { solvedCube } from "@game/cube-engine";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { presetKeymap } from "../input";
import { COURSES, type Lesson, type LessonStep } from "../learn";
import { useCubeSettings } from "../settings";
import { KeyGuide } from "./KeyGuide";
import { KeyTryBox } from "./KeyTryBox";
import { FindPanel, TurnPanel } from "./LessonActs";

/**
 * 처음 오셨나요(`/cube/intro`). 다른 게임의 튜토리얼 첫 단원처럼 짧게: 조각 → 표기 읽기(R 한 수 쳐 보기) →
 * 키 배치 → 배우기로 이어 가기. 큐브는 판 게임과 달리 미션(대국)이 없어 공통 TutorialKit 대신
 * 설명과 작은 퀴즈만 두고, 자세한 표기(x·y·z, 큰 큐브)와 해보기는 배우기(`/cube/learn`) 첫 과정에 맡긴다.
 * 시간 규칙(살펴보기·+2·DNF)은 맞출 줄 모르는 사람에게 이르므로 타이머 화면에 맡긴다(2026-11-04).
 * 맨 앞은 조각(2026-11-04): 공식보다 먼저 「색이 아니라 조각을 옮긴다」를 맛본다. 아무 칸이나 누르면 그 조각 전체가
 * 밝아지고 무슨 조각인지 알려 준다. 세기·놀이판 같은 깊은 상호작용은 배우기 「큐브의 조각」 단원에 둔다(겹치지 않게).
 */

interface Quiz {
  question: string;
  choices: string[];
  answer: number;
  why: string;
}

interface Step {
  id: string;
  title: string;
  quiz?: Quiz;
}

const STEPS: Step[] = [
  { id: "pieces", title: "조각" },
  {
    id: "notation",
    title: "표기 읽기",
    quiz: {
      question: "U' 는 어떻게 돌리나요?",
      choices: [
        "윗면을 위에서 볼 때 시계 방향으로 90°",
        "윗면을 위에서 볼 때 반시계 방향으로 90°",
        "윗면을 180°",
      ],
      answer: 1,
      why: "' (프라임)은 반대 방향이에요. 2가 붙으면 두 번(180°)이에요.",
    },
  },
  {
    id: "keys",
    title: "키 배치",
    quiz: {
      question: "「표기」 배치에서 Shift를 누른 채 R을 치면 어떤 수가 될까요?",
      choices: ["R", "R'", "R2"],
      answer: 1,
      why: "Shift는 반대 방향이에요. 같은 키를 두 번 치면 R2예요. 「키 익히기」에서 직접 쳐 볼 수 있어요.",
    },
  },
  { id: "next", title: "이제 배우러 가기" },
];

/** 배우기 첫 단원: 3×3 초보자 과정의 맨 앞(지금은 「큐브의 조각」). 과정이 바뀌어도 따라간다 */
const FIRST_LESSON = COURSES.find((c) => c.id === "333-beginner")?.lessons[0];

/** 조각 맛보기(배우기의 찾기 부품을 「눌러 보기」로 쓴다) */
const PIECE_LESSON: Lesson = {
  id: "intro-pieces",
  size: 3,
  title: "조각",
  summary: "",
  steps: [],
};
const PIECE_TASTE: LessonStep = { kind: "find", body: "", find: {} };

const LETTERS: [string, string][] = [
  ["R", "오른쪽 면"],
  ["L", "왼쪽 면"],
  ["U", "윗면"],
  ["D", "아랫면"],
  ["F", "앞면"],
  ["B", "뒷면"],
];

export function CubeIntroApp() {
  const settings = useCubeSettings();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Record<string, number>>({});
  // 조각 맛보기: 칸을 한 번이라도 눌렀나
  const [tasted, setTasted] = useState(false);
  const step = STEPS[index] ?? (STEPS[0] as Step);
  const start = useMemo(() => solvedCube(3), []);
  const twoHand = useMemo(() => presetKeymap("twoHand"), []);
  const notation = useMemo(() => presetKeymap("notation"), []);

  const quiz = step.quiz;
  const choice = picked[step.id];
  const quizDone =
    (!quiz || choice === quiz.answer) && (step.id !== "pieces" || tasted);

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4"
        data-cube-intro={step.id}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a href="/cube" className="text-sm text-white/70 hover:text-white">
            ← 큐브
          </a>
          <h1 className="font-bold text-xl">처음 오셨나요?</h1>
          <span className="ml-auto text-white/60 text-xs" data-intro-progress>
            {index + 1}/{STEPS.length}
          </span>
        </header>
        <nav className="flex gap-1" aria-label="안내 차례">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-xs",
                i === index ? "bg-sky-500/30 font-semibold" : "bg-white/5",
              )}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <section className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4">
          <h2 className="font-bold text-lg">{step.title}</h2>
          {step.id === "pieces" && (
            <>
              <p className="break-keep text-sm text-white/85">
                큐브는 스티커 54장이 아니라 <b>조각 26개</b>예요. 색이 하나인
                가운데 6, 둘인 모서리 12, 셋인 꼭짓점 8. 돌리면 조각이 통째로
                움직여요. <b>색이 아니라 조각을 옮겨요.</b>
              </p>
              <p className="break-keep text-sm" data-intro-piece-ask>
                아무 칸이나 눌러 보세요. 그 칸이 든 조각 전체가 밝아져요.
              </p>
              <FindPanel
                lesson={PIECE_LESSON}
                step={PIECE_TASTE}
                start={start}
                mask={null}
                settings={settings}
                onPassed={() => setTasted(true)}
                explore
              />
              {tasted && (
                <p
                  className="break-keep text-emerald-300 text-sm"
                  role="status"
                  data-intro-tasted
                >
                  다른 칸도 눌러 보세요. 세 종류를 세어 보고 직접 돌려 보는 것은
                  배우기 「큐브의 조각」에서 해요.
                </p>
              )}
            </>
          )}
          {step.id === "notation" && (
            <>
              <p className="break-keep text-sm text-white/85">
                면을 돌리면 그 면에 붙은 <b>조각 아홉 개</b>(가운데 1·모서리
                4·꼭짓점 4)가 통째로 돌아요. 공식은 어느 면을 돌릴지 글자로
                적어요. 글자 하나가 면 하나이고, 그 면을{" "}
                <b>그 면 쪽에서 바라볼 때 시계 방향</b>으로 90° 돌린다는
                뜻이에요.
              </p>
              <ul className="grid grid-cols-3 gap-1 text-sm sm:grid-cols-6">
                {LETTERS.map(([l, name]) => (
                  <li
                    key={l}
                    className="flex flex-col items-center rounded-lg bg-white/5 py-1.5"
                  >
                    <b className="font-mono text-lg">{l}</b>
                    <span className="text-white/70 text-xs">{name}</span>
                  </li>
                ))}
              </ul>
              <ul className="list-disc space-y-1 break-keep pl-5 text-sm text-white/80">
                <li>
                  <b>'</b>(프라임)은 반대 방향: R' = 오른쪽 면 반시계
                </li>
                <li>
                  <b>2</b>는 두 번: U2 = 윗면 180°
                </li>
              </ul>
              <p className="break-keep text-white/70 text-xs">
                큐브 전체를 돌려 쥐는 x·y·z와 큰 큐브의 표기는 배우기에서 직접
                돌려 보며 익혀요.
              </p>
              <p className="break-keep text-sm" data-intro-turn-ask>
                R을 직접 쳐 보세요. 오른쪽 층이 통째로 돌아 앞면 칸이 위로
                올라가요.
              </p>
              <TurnPanel
                n={3}
                start={start}
                alg="R"
                mask={null}
                settings={settings}
                onPassed={() => {}}
              />
            </>
          )}
          {step.id === "keys" && (
            <>
              <p className="break-keep text-sm text-white/85">
                큐브는 키보드로 돌려요. 배치는 둘 가운데 고르고, 설정에서 아무
                키로나 바꿀 수 있어요. 칸의 굵은 글은 그냥 칠 때, 흐린 글은
                Shift와 함께 칠 때 도는 수예요.
              </p>
              <KeyTryBox />
              <details className="text-sm" data-intro-presets>
                <summary className="cursor-pointer text-white/70 text-xs">
                  두 배치 견주어 보기
                </summary>
                <h3 className="mt-2 font-semibold text-sm">
                  「표기」: 글자 그대로(처음에 쉽다)
                </h3>
                <KeyGuide n={3} keymap={notation} lit={null} />
                <h3 className="mt-2 font-semibold text-sm">
                  「두 손」: 실물에서 그 면을 돌리는 손으로(빠르다, 기본)
                </h3>
                <KeyGuide n={3} keymap={twoHand} lit={null} />
              </details>
              <p className="break-keep text-white/70 text-xs">
                휴대폰은 큐브를 밀어서 돌려요. 칸 위를 밀면 그 줄이, 빈 곳을
                밀면 큐브 전체가 돌아요. 화면 아래 표기 단추도 있어요. 마우스로
                끌면 보는 각만 바뀌어요.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/cube/keys/learn"
                  data-intro-keys
                  className="rounded-xl border border-sky-300/60 bg-sky-500/25 px-3 py-1.5 text-sm hover:bg-sky-500/35"
                >
                  키 익히기
                </a>
                <a
                  href="/cube/keys"
                  className="rounded-xl bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
                >
                  단축키 표
                </a>
                <a
                  href="/cube/settings"
                  className="rounded-xl bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
                >
                  키·색 설정 열기
                </a>
              </div>
            </>
          )}
          {step.id === "next" && (
            <>
              <p className="break-keep text-sm text-white/85">
                처음이라면 배우기의 첫 단원부터 따라 하세요. 조각을 직접 찾아
                따라가 보고, 표기를 쳐 보고, 흰 십자부터 마지막 층까지 차례로
                맞춰요. 시간 재기 규칙(15초 살펴보기 등)은 맞출 줄 알게 된 뒤
                타이머에서 알려 줘요.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href={`/cube/learn?lesson=${FIRST_LESSON?.id ?? ""}`}
                  data-intro-learn
                  className="flex-1 rounded-xl border border-sky-300/60 bg-sky-500/25 px-4 py-3 text-center font-semibold hover:bg-sky-500/35"
                >
                  배우기 첫 단원: {FIRST_LESSON?.title}
                </a>
                <a
                  href="/cube/solo"
                  className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-center hover:bg-white/15"
                >
                  바로 혼자 맞추기
                </a>
                <a
                  href="/cube/timer"
                  className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-center hover:bg-white/15"
                >
                  실물 큐브 타이머
                </a>
              </div>
            </>
          )}

          {quiz && (
            <div
              className="mt-2 flex flex-col gap-2 rounded-xl bg-black/25 p-3"
              data-intro-quiz
            >
              <p className="font-semibold text-sm">{quiz.question}</p>
              {quiz.choices.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  data-choice={i}
                  onClick={() => setPicked((p) => ({ ...p, [step.id]: i }))}
                  className={cn(
                    "rounded-lg px-3 py-2 text-left text-sm",
                    choice === i
                      ? i === quiz.answer
                        ? "bg-emerald-500/30"
                        : "bg-red-500/30"
                      : "bg-white/5 hover:bg-white/10",
                  )}
                >
                  {c}
                </button>
              ))}
              {choice !== undefined && (
                <p role="status" className="text-white/80 text-xs">
                  {choice === quiz.answer ? "맞아요! " : "다시 골라 보세요. "}
                  {quiz.why}
                </p>
              )}
            </div>
          )}
        </section>

        <div className="flex justify-between">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm disabled:opacity-30"
          >
            이전
          </button>
          {index < STEPS.length - 1 && (
            <button
              type="button"
              data-intro-next
              disabled={!quizDone}
              onClick={() => setIndex((i) => i + 1)}
              className="rounded-xl bg-sky-500 px-4 py-2 font-semibold text-black text-sm disabled:opacity-40"
            >
              다음
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
