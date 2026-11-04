"use client";

import { solvedCube } from "@game/cube-engine";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { presetKeymap } from "../input";
import { COURSES, type Lesson, type LessonStep } from "../learn";
import { useCubeSettings } from "../settings";
import { DemoCube } from "./DemoCube";
import { KeyGuide } from "./KeyGuide";
import { FindPanel } from "./LessonActs";

/**
 * 처음 오셨나요(`/cube/intro`). 다른 게임의 튜토리얼 첫 단원처럼 짧게: 조각 → 표기 읽기 → 키 배치 →
 * 살펴보기·시간 규칙 → 배우기로 이어 가기. 큐브는 판 게임과 달리 미션(대국)이 없어 공통 TutorialKit 대신
 * 설명과 작은 퀴즈만 두고, 직접 해보기는 배우기(`/cube/learn`) 첫 과정에 맡긴다.
 * 맨 앞은 조각(2026-11-04): 공식보다 먼저 「색이 아니라 조각을 옮긴다」를 세 종류의 조각 찾기로 익힌다.
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
  {
    id: "time",
    title: "살펴보기와 시간",
    quiz: {
      question: "살펴보기 16초째에 첫 면을 돌리면?",
      choices: ["그대로 인정", "기록에 2초를 더해요(+2)", "기록 없음(DNF)"],
      answer: 1,
      why: "15초를 넘기면 +2, 17초를 넘기면 DNF예요(대회 규칙).",
    },
  },
  { id: "next", title: "이제 배우러 가기" },
];

/** 배우기 첫 단원: 3×3 초보자 과정의 맨 앞(지금은 「큐브의 조각」). 과정이 바뀌어도 따라간다 */
const FIRST_LESSON = COURSES.find((c) => c.id === "333-beginner")?.lessons[0];

/** 조각 찾기 셋(배우기의 찾기 판정을 그대로 쓴다) */
const PIECE_LESSON: Lesson = {
  id: "intro-pieces",
  size: 3,
  title: "조각",
  summary: "",
  steps: [],
};
const PIECE_FINDS: { name: string; step: LessonStep }[] = [
  {
    name: "가운데(색 하나)",
    step: { kind: "find", body: "", find: { piece: "center" } },
  },
  {
    name: "모서리(색 둘)",
    step: { kind: "find", body: "", find: { piece: "edge" } },
  },
  {
    name: "꼭짓점(색 셋)",
    step: { kind: "find", body: "", find: { piece: "corner" } },
  },
];

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
  // 조각 찾기를 몇 개 했나(가운데 → 모서리 → 꼭짓점)
  const [piecesFound, setPiecesFound] = useState(0);
  const step = STEPS[index] ?? (STEPS[0] as Step);
  const start = useMemo(() => solvedCube(3), []);
  const twoHand = useMemo(() => presetKeymap("twoHand"), []);
  const notation = useMemo(() => presetKeymap("notation"), []);

  const quiz = step.quiz;
  const choice = picked[step.id];
  const quizDone =
    (!quiz || choice === quiz.answer) &&
    (step.id !== "pieces" || piecesFound >= PIECE_FINDS.length);
  const pieceFind = PIECE_FINDS[piecesFound];

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
              <ol className="flex gap-1 text-xs" data-intro-pieces>
                {PIECE_FINDS.map((f, i) => (
                  <li
                    key={f.name}
                    className={cn(
                      "flex-1 rounded-lg px-2 py-1.5 text-center",
                      i < piecesFound
                        ? "bg-emerald-500/30"
                        : i === piecesFound
                          ? "bg-sky-500/30 font-semibold"
                          : "bg-white/5 text-white/60",
                    )}
                  >
                    {i < piecesFound ? "✓ " : ""}
                    {f.name}
                  </li>
                ))}
              </ol>
              {pieceFind ? (
                <>
                  <p className="break-keep text-sm" data-intro-piece-ask>
                    {pieceFind.name.split("(")[0]} 조각을 아무거나 눌러 보세요.
                  </p>
                  <FindPanel
                    key={piecesFound}
                    lesson={PIECE_LESSON}
                    step={pieceFind.step}
                    start={start}
                    mask={null}
                    settings={settings}
                    onPassed={() => setPiecesFound((k) => k + 1)}
                  />
                </>
              ) : (
                <p
                  className="break-keep text-emerald-300 text-sm"
                  role="status"
                >
                  세 종류를 다 찾았어요. 앞으로 배울 공식은 모두 「어떤 조각을
                  어디로 옮기는가」예요.
                </p>
              )}
            </>
          )}
          {step.id === "notation" && (
            <>
              <p className="break-keep text-sm text-white/85">
                공식은 글자로 적어요. 글자 하나가 면 하나이고, 그 면을{" "}
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
                <li>
                  <b>x·y·z</b>는 큐브 전체 돌리기(x는 R, y는 U, z는 F와 같은
                  방향)
                </li>
                <li>
                  큰 큐브: <b>Rw</b>는 바깥 두 층, <b>2R</b>은 안쪽 한 층
                </li>
              </ul>
              <div className="mx-auto w-full max-w-xs">
                <DemoCube
                  n={3}
                  start={start}
                  alg="R U R' U'"
                  mask={null}
                  settings={settings}
                  tps={1}
                  autoPlay
                  loop
                />
              </div>
            </>
          )}
          {step.id === "keys" && (
            <>
              <p className="break-keep text-sm text-white/85">
                큐브는 키보드로 돌려요. 배치는 둘 가운데 고르고, 설정에서 아무
                키로나 바꿀 수 있어요. 칸의 굵은 글은 그냥 칠 때, 흐린 글은
                Shift와 함께 칠 때 도는 수예요.
              </p>
              <h3 className="font-semibold text-sm">
                「표기」: 글자 그대로(처음에 쉽다)
              </h3>
              <KeyGuide n={3} keymap={notation} lit={null} />
              <h3 className="mt-2 font-semibold text-sm">
                「두 손」: 실물에서 그 면을 돌리는 손으로(빠르다, 기본)
              </h3>
              <KeyGuide n={3} keymap={twoHand} lit={null} />
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
          {step.id === "time" && (
            <ul className="list-disc space-y-1.5 break-keep pl-5 text-sm text-white/85">
              <li>
                섞은 뒤 <b>15초 살펴보기</b>가 있어요. 이때는 큐브 전체
                돌리기(x·y·z)와 보기만 되고, 면을 돌리면 그 순간 시간이
                시작돼요.
              </li>
              <li>8초·12초에 알림 소리가 나요.</li>
              <li>
                15초를 넘겨 시작하면 <b>+2초</b>, 17초를 넘기면 <b>DNF</b>(기록
                없음)이에요. 설정에서 살펴보기를 끌 수 있어요.
              </li>
              <li>
                <b>5번 평균</b>은 가장 좋은 것과 나쁜 것을 빼고 셋의
                평균이에요(대회 방식). 기록은 이 기기에만 남아요.
              </li>
            </ul>
          )}
          {step.id === "next" && (
            <>
              <p className="break-keep text-sm text-white/85">
                처음이라면 배우기의 첫 단원부터 따라 하세요. 조각을 직접 찾아
                따라가 보고, 표기를 쳐 보고, 흰 십자부터 마지막 층까지 차례로
                맞춰요.
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
