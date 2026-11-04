"use client";

import {
  ALG_SETS,
  type AlgSet,
  BLD_CORNER_TARGETS,
  BLD_EDGE_TARGETS,
  type Course,
  nextCourses,
  type SheetName,
} from "../learn";
import { MoveText } from "./MoveChip";

/** 배우기 화면의 연결 조각: 공식 훈련 단추, 과정 끝 「다음에 할 것」, 블라인드 글자 표(docs/47 8-1) */

export const trainHref = (set: AlgSet) => `/cube/train?set=${set}`;
export const lessonHref = (id: string) => `/cube/learn?lesson=${id}`;

export function drillTitle(set: AlgSet): string {
  return ALG_SETS.find((s) => s.set === set)?.title ?? set;
}

const linkClass =
  "rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15";

/** 과정 마지막 단원의 마지막 단계에 보이는 「다음에 할 것」 */
export function CourseNext({ course }: { course: Course }) {
  const next = nextCourses(course);
  // 다음 과정 셋이 같은 무게면 무엇부터 할지 헷갈린다: 「이 과정 뒤 추천」으로 둔 과정(없으면 첫째)만 강조
  const recommended =
    next.find((c) => c.recommendAfter === course.id) ?? next[0];
  const drills = [
    ...new Set(course.lessons.flatMap((l) => (l.drill ? [l.drill] : []))),
  ];
  return (
    <section
      data-course-next={course.id}
      className="flex flex-col gap-3 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4"
    >
      <h2 className="font-bold">다음에 할 것</h2>
      <p className="break-keep text-sm text-white/70">
        「{course.title}」 과정을 다 봤어요. 손에 익을 때까지 여러 번 맞춰 보고,
        다음 것으로 넓혀 보세요.
      </p>
      {next.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-white/60 text-xs">다음 과정</h3>
          <div className="flex flex-wrap gap-2">
            {next.map((c) => {
              const pick = c.id === recommended?.id;
              return (
                <a
                  key={c.id}
                  data-next-course={c.id}
                  data-next-recommended={pick ? "" : undefined}
                  href={lessonHref(c.lessons[0]?.id ?? "")}
                  className={
                    pick
                      ? "flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-black text-sm transition active:scale-[0.97]"
                      : linkClass
                  }
                >
                  {pick && (
                    <span className="rounded-full bg-black/15 px-1.5 text-[11px]">
                      추천
                    </span>
                  )}
                  {c.title} →
                </a>
              );
            })}
          </div>
        </div>
      )}
      {drills.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-white/60 text-xs">공식 훈련</h3>
          <div className="flex flex-wrap gap-2">
            {drills.map((d) => (
              <a
                key={d}
                data-next-drill={d}
                href={trainHref(d)}
                className={linkClass}
              >
                {drillTitle(d)}
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-white/60 text-xs">혼자 연습</h3>
        <div className="flex flex-wrap gap-2">
          <a data-next-solo href="/cube/solo" className={linkClass}>
            혼자 맞추기(화면 큐브)
          </a>
          <a data-next-timer href="/cube/timer" className={linkClass}>
            타이머(실물 큐브)
          </a>
        </div>
      </div>
    </section>
  );
}

const FACE_WORD: Record<string, string> = {
  U: "위",
  D: "아래",
  F: "앞",
  B: "뒤",
  L: "왼쪽",
  R: "오른쪽",
};
/** 자리 이름 차례: 위·아래 → 앞·뒤 → 왼쪽·오른쪽 */
const RANK: Record<string, number> = { U: 0, D: 0, F: 1, B: 1, L: 2, R: 2 };

/** 스티커 자리(첫 글자가 그 칸의 면) → 「앞면 칸 · 앞-오른쪽」 */
export function stickerPlace(sticker: string): string {
  const face = FACE_WORD[sticker[0] as string];
  const piece = [...sticker]
    .sort((a, b) => (RANK[a] as number) - (RANK[b] as number))
    .map((c) => FACE_WORD[c])
    .join("-");
  return `${face}면 칸 · ${piece}`;
}

const SHEET_DATA = {
  "bld-edges": {
    title: "모서리 글자마다 준비 수",
    note: "버퍼 B(위-오른쪽)와 같은 조각의 M은 없어요. 준비 → T퍼뮤 → 준비 거꾸로.",
    rows: BLD_EDGE_TARGETS,
  },
  "bld-corners": {
    title: "꼭짓점 글자마다 준비 수",
    note: "버퍼 A(위-뒤-왼쪽)와 같은 조각의 E·R은 없어요. 준비 → 변형 Y퍼뮤 → 준비 거꾸로.",
    rows: BLD_CORNER_TARGETS,
  },
} as const;

/** 단계 아래에 펼쳐 두는 표 */
export function LessonSheet({ name }: { name: SheetName }) {
  const sheet = SHEET_DATA[name];
  return (
    <details
      open
      data-sheet={name}
      className="rounded-xl bg-black/25 p-3 text-sm"
    >
      <summary className="cursor-pointer font-semibold">{sheet.title}</summary>
      <p className="mt-1 break-keep text-white/60 text-xs">{sheet.note}</p>
      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {sheet.rows.map((r) => (
          <div
            key={r.letter}
            data-sheet-letter={r.letter}
            className="flex items-baseline gap-2"
          >
            <span className="w-5 shrink-0 font-bold text-sky-300">
              {r.letter}
            </span>
            <span className="w-36 shrink-0 text-white/60 text-xs">
              {stickerPlace(r.sticker)}
            </span>
            <span>
              {r.setup ? (
                <MoveText text={r.setup} n={3} />
              ) : (
                <span className="text-white/50 text-xs">준비 없음</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
