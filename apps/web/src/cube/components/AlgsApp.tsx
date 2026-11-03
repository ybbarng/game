"use client";

import type { Clock } from "@game/fair-play";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import {
  caseById,
  caseStart,
  checkAlg,
  MAX_ALG_LENGTH,
  setOf,
  shortName,
} from "../algs/check";
import { algLink, parseAlgLink } from "../algs/link";
import { useSettled } from "../algs/settle";
import {
  type AlgBook,
  addMine,
  algsOf,
  commitAlgBook,
  exportAlgBook,
  type ImportResult,
  loadAlgBook,
  MAX_IMPORT_BYTES,
  removeMine,
  setAsText,
  setUsed,
  unknownCaseIds,
  usedAlg,
  watchAlgBook,
} from "../algs/store";
import {
  addAuf,
  type Grip,
  inverseAlg,
  type MirrorPlane,
  mirrorAlg,
  moveCounts,
  regripAlg,
  removeRotations,
} from "../algs/transform";
import { ALG_SETS, type AlgCase, type AlgSet, type AlgSetInfo } from "../learn";
import { movesOf } from "../learn/judge";
import { type CubeSettings, useCubeSettings } from "../settings";
import { importAlgsInWorker } from "../worker";
import { AlgPicture } from "./AlgPicture";
import { DemoCube } from "./DemoCube";

/**
 * 공식 모음(`/cube/algs`). 묶음·상황마다 대표·대안·내 공식을 보고, 쓰는 공식을 고르고, 새 공식을 검사해 넣는다.
 * 거울·거꾸로·돌려 쥐기로 만든 공식도 바로 검사한다. 주소 `?case=&alg=`로 받은 공식은 시연하고 넣을 수 있다.
 */

async function copyText(text: string, select?: Element | null) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 클립보드가 막혀 있으면 글을 골라 둔다(직접 복사)
    const sel = window.getSelection();
    if (select && sel) sel.selectAllChildren(select);
    return false;
  }
}

const KIND_LABEL = { main: "대표", alt: "대안", mine: "내 공식" } as const;

/** 가져오기에서 뺀 공식을 몇 개까지 보이나(나머지는 개수만) */
const REJECTED_SHOWN = 100;

export function AlgsApp() {
  const settings = useCubeSettings();
  const [book, setBookState] = useState<AlgBook>({});
  const [setId, setSetId] = useState<AlgSet>("oll");
  const [openId, setOpenId] = useState<string | null>(null);
  const [linked, setLinked] = useState<{ id: string; alg: string } | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [imported, setImported] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const setTextRef = useRef<HTMLPreElement>(null);
  const bookRef = useRef<AlgBook>({});
  const setBook = useCallback((b: AlgBook) => {
    bookRef.current = b;
    setBookState(b);
  }, []);

  useEffect(() => {
    setBook(loadAlgBook());
    const l = parseAlgLink(window.location.search);
    const c = l && caseById(l.caseId);
    if (l && c) {
      setSetId(c.set);
      setOpenId(c.id);
      if (l.alg) setLinked({ id: c.id, alg: l.alg });
    }
    // 다른 탭(훈련 등)이 저장하면 다시 읽는다
    return watchAlgBook(setBook);
  }, [setBook]);

  /** prev에서 next로 바뀐 상황만 저장하고(다른 탭 변경과 합친다) 합친 것을 보인다 */
  const commitBook = useCallback(
    (prev: AlgBook, next: AlgBook) => setBook(commitAlgBook(prev, next)),
    [setBook],
  );
  const updateBook = useCallback(
    (b: AlgBook) => commitBook(bookRef.current, b),
    [commitBook],
  );
  const unknown = unknownCaseIds(book).length;

  const set =
    ALG_SETS.find((s) => s.set === setId) ?? (ALG_SETS[0] as AlgSetInfo);
  const open = openId ? caseById(openId) : undefined;

  const openCase = (id: string | null) => {
    setOpenId(id);
    setNotice("");
    if (id === null) return;
    const q = new URLSearchParams({ case: id });
    window.history.replaceState(null, "", `?${q.toString()}`);
  };

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4"
        data-cube-algs={setId}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a href="/cube" className="text-sm text-white/70 hover:text-white">
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">공식 모음</h1>
          <a
            href="/cube/train"
            className="ml-auto text-sm text-white/70 hover:text-white"
          >
            훈련
          </a>
          <a
            href="/cube/learn"
            className="text-sm text-white/70 hover:text-white"
          >
            배우기
          </a>
        </header>

        <fieldset
          className="flex min-w-0 flex-wrap gap-1.5"
          aria-label="공식 묶음"
        >
          {ALG_SETS.map((s) => (
            <button
              key={s.set}
              type="button"
              aria-pressed={s.set === setId}
              data-algs-set={s.set}
              onClick={() => {
                setSetId(s.set);
                openCase(null);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                s.set === setId
                  ? "bg-sky-500 font-semibold text-black"
                  : "bg-white/10 hover:bg-white/15",
              )}
            >
              {s.title}
            </button>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ToolButton
            onClick={async () => {
              const ok = await copyText(
                setAsText(book, set),
                setTextRef.current,
              );
              setNotice(ok ? "묶음 복사함" : "복사 못 함, 글을 골라 둠");
            }}
          >
            묶음 복사
          </ToolButton>
          <ToolButton
            onClick={() => {
              const blob = new Blob([exportAlgBook(book)], {
                type: "application/json",
              });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "cube-algs.json";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            내보내기
          </ToolButton>
          <ToolButton onClick={() => fileRef.current?.click()}>
            가져오기
          </ToolButton>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-algs-import
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              if (file.size > MAX_IMPORT_BYTES) {
                setNotice("파일이 너무 큼");
                return;
              }
              setNotice("가져오는 중");
              setImported(null);
              try {
                const base = bookRef.current;
                const r = await importAlgsInWorker(base, await file.text());
                commitBook(base, r.book);
                setImported(r);
                setNotice(`가져옴 ${r.added} · 뺌 ${r.rejected.length}`);
              } catch (err) {
                setNotice(
                  err instanceof Error
                    ? err.message.replace(/^Error: /, "")
                    : "가져오지 못함",
                );
              }
            }}
          />
          {unknown > 0 && (
            <span data-algs-unknown className="text-amber-200">
              모르는 상황 {unknown}개
            </span>
          )}
          {notice && (
            <span role="status" data-algs-notice className="text-white/70">
              {notice}
            </span>
          )}
        </div>
        {imported && imported.rejected.length > 0 && (
          <ul
            className="flex flex-col gap-0.5 rounded-lg bg-red-500/10 p-2 text-red-200 text-xs"
            data-algs-rejected
          >
            {imported.rejected.slice(0, REJECTED_SHOWN).map((x, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: 같은 공식이 되풀이될 수 있어 순번을 더한다(목록은 바뀌지 않는다)
                key={`${i}|${x.caseId}|${x.alg}`}
              >
                {caseById(x.caseId)
                  ? shortName(caseById(x.caseId) as AlgCase)
                  : x.caseId}
                : <span className="font-mono">{x.alg}</span> · {x.message}
              </li>
            ))}
            {imported.rejected.length > REJECTED_SHOWN && (
              <li>외 {imported.rejected.length - REJECTED_SHOWN}개</li>
            )}
          </ul>
        )}
        <pre ref={setTextRef} className="sr-only">
          {setAsText(book, set)}
        </pre>

        {open && (
          <CaseDetail
            key={open.id}
            c={open}
            book={book}
            onBook={updateBook}
            initialAlg={linked?.id === open.id ? linked.alg : null}
            settings={settings}
            onClose={() => openCase(null)}
            onNotice={setNotice}
          />
        )}

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {set.cases.map((c) => {
            const used = usedAlg(book, c);
            const mine = (book[c.id]?.mine ?? []).includes(used);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  data-case-open={c.id}
                  aria-pressed={openId === c.id}
                  onClick={() => openCase(c.id)}
                  className={cn(
                    "flex h-full w-full flex-col items-center gap-1 rounded-xl p-2 text-left",
                    openId === c.id
                      ? "bg-sky-500/20 ring-1 ring-sky-400"
                      : "bg-white/5 hover:bg-white/10",
                  )}
                >
                  <AlgPicture
                    set={c.set}
                    n={set.size}
                    state={caseStart(c)}
                    colors={settings.colors}
                    className="h-16 w-auto"
                  />
                  <span className="w-full truncate text-center font-semibold text-xs">
                    {shortName(c)}
                  </span>
                  <span
                    className={cn(
                      "w-full truncate text-center font-mono text-[11px]",
                      mine ? "text-amber-200" : "text-white/60",
                    )}
                  >
                    {used}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

const MIRRORS: [MirrorPlane, string][] = [
  ["M", "좌우 대칭"],
  ["S", "앞뒤 대칭"],
  ["E", "위아래 대칭"],
];
const GRIPS: Grip[] = ["y", "y'", "y2"];

function CaseDetail({
  c,
  book,
  onBook,
  initialAlg,
  settings,
  onClose,
  onNotice,
  clock,
}: {
  c: AlgCase;
  book: AlgBook;
  onBook: (b: AlgBook) => void;
  initialAlg: string | null;
  settings: CubeSettings;
  onClose: () => void;
  onNotice: (s: string) => void;
  /** 입력이 멈췄는지 재는 시계(없으면 실제 시계) */
  clock?: Clock;
}) {
  const set = setOf(c);
  const n = set.size;
  const rootRef = useRef<HTMLElement>(null);
  const [draft, setDraftOnly] = useState(initialAlg ?? "");
  // 검사는 입력이 멈춘 뒤 한 번만(칠 때마다 하면 긴 공식에서 멈춘다)
  const [checked, settler] = useSettled(initialAlg ?? "", clock);
  const result = useMemo(
    () => (checked.trim() ? checkAlg(c, checked) : null),
    [c, checked],
  );
  /** 지금 입력칸의 글을 검사한 결과인가(아직 기다리는 중이면 넣지 않는다) */
  const fresh = checked === draft;
  const typeDraft = (v: string) => {
    setDraftOnly(v);
    settler.push(v);
  };
  const setDraft = (v: string) => {
    setDraftOnly(v);
    settler.now(v);
  };
  // 받은 공식이 맞으면 그것을, 아니면 쓰는 공식을 시연한다
  const [demo, setDemo] = useState(() => {
    if (initialAlg) {
      const r = checkAlg(c, initialAlg);
      if (r.ok) return r.text;
    }
    return usedAlg(book, c);
  });
  const used = usedAlg(book, c);
  const list = algsOf(book, c);
  const start = caseStart(c);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const base = draft.trim() || used;
  const baseReadable =
    !fresh || !result || result.ok || result.errorAt === undefined;
  const transform = (f: (alg: string) => string) => {
    try {
      setDraft(f(base));
    } catch {
      // 읽지 못하는 공식은 바꾸지 않는다(검사 결과에 위치가 나온다)
    }
  };

  const add = () => {
    const r = addMine(book, c, draft);
    onNotice(r.message);
    if (!r.ok) return;
    onBook(r.book);
    setDraft("");
  };

  return (
    <section
      ref={rootRef}
      data-alg-case={c.id}
      className="flex flex-col gap-3 rounded-xl bg-white/5 p-3"
    >
      <div className="flex items-start gap-3">
        <AlgPicture
          set={c.set}
          n={n}
          state={start}
          colors={settings.colors}
          className="h-24 w-auto shrink-0"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-bold">{c.name}</h2>
          {c.note && (
            <p className="break-keep text-white/60 text-xs">{c.note}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-white/10 px-2 py-1 text-sm hover:bg-white/15"
        >
          닫기
        </button>
      </div>

      <ol className="flex flex-col gap-1.5" data-alg-list>
        {list.map(({ alg, kind }, i) => {
          const counts = moveCounts(n, movesOf(n, alg));
          const isUsed = alg === used;
          return (
            <li
              key={alg}
              data-alg-row={kind}
              data-alg-used={isUsed ? "" : undefined}
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5",
                isUsed ? "bg-sky-500/15" : "bg-white/5",
              )}
            >
              <span className="w-14 shrink-0 text-white/50 text-xs">
                {kind === "alt" ? `대안 ${i}` : KIND_LABEL[kind]}
              </span>
              <span
                data-alg-text
                className="min-w-0 flex-1 break-words font-mono text-sm"
              >
                {alg}
              </span>
              <span className="text-white/50 text-xs tabular-nums">
                {counts.htm} HTM · {counts.stm} STM
              </span>
              <span className="flex flex-wrap gap-1 text-xs">
                <RowButton
                  pressed={isUsed}
                  onClick={() => onBook(setUsed(book, c, alg))}
                  data-alg-use
                >
                  {isUsed ? "쓰는 중" : "쓰기"}
                </RowButton>
                <RowButton onClick={() => setDemo(alg)}>시연</RowButton>
                <RowButton
                  onClick={async (e) => {
                    const row = e.currentTarget.closest("li");
                    const ok = await copyText(
                      alg,
                      row?.querySelector("[data-alg-text]"),
                    );
                    onNotice(ok ? "복사함" : "복사 못 함, 글을 골라 둠");
                  }}
                >
                  복사
                </RowButton>
                <RowButton
                  onClick={async () => {
                    const ok = await copyText(
                      algLink(c.id, alg, window.location.origin),
                    );
                    onNotice(ok ? "링크 복사함" : "복사 못 함");
                  }}
                >
                  링크
                </RowButton>
                {kind === "mine" && (
                  <RowButton
                    onClick={() => onBook(removeMine(book, c, alg))}
                    data-alg-remove
                  >
                    지우기
                  </RowButton>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-white/60">새 공식</span>
          <input
            data-alg-input
            value={draft}
            maxLength={MAX_ALG_LENGTH}
            onChange={(e) => typeDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && fresh && result?.ok) add();
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            placeholder={used}
            className="rounded-lg bg-black/40 px-3 py-2 font-mono outline-none ring-1 ring-white/15 focus:ring-sky-400"
          />
        </label>
        {result && (
          <p
            role="status"
            data-alg-check={result.ok ? "ok" : "bad"}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
              result.ok ? "text-emerald-300" : "text-red-300",
            )}
          >
            <span data-alg-check-message>{result.message}</span>
            {!result.ok && result.other && (
              <span className="text-amber-200" data-alg-check-other>
                이건 {result.other.name}
                {result.other.slot && `(${result.other.slot} 칸)`}
              </span>
            )}
            {result.htm !== undefined && (
              <span className="text-white/50 text-xs tabular-nums">
                {result.htm} HTM · {result.stm} STM
              </span>
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 text-sm">
          <button
            type="button"
            data-alg-add
            disabled={!fresh || !result?.ok}
            onClick={add}
            className="rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-black disabled:opacity-40"
          >
            내 공식에 넣기
          </button>
          <button
            type="button"
            disabled={!fresh || !result?.ok}
            onClick={() => fresh && result?.ok && setDemo(result.text)}
            className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15 disabled:opacity-40"
          >
            시연
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs" data-alg-tools>
          {MIRRORS.map(([plane, label]) => (
            <ToolButton
              key={plane}
              disabled={!baseReadable}
              data-alg-mirror={plane}
              onClick={() => transform((a) => mirrorAlg(n, a, plane))}
            >
              {label}
            </ToolButton>
          ))}
          <ToolButton
            disabled={!baseReadable}
            data-alg-inverse
            onClick={() => transform((a) => inverseAlg(n, a))}
          >
            거꾸로
          </ToolButton>
          <ToolButton
            disabled={!baseReadable}
            onClick={() => transform((a) => addAuf(n, a, "pre"))}
          >
            앞에 U
          </ToolButton>
          <ToolButton
            disabled={!baseReadable}
            onClick={() => transform((a) => addAuf(n, a, "post"))}
          >
            뒤에 U
          </ToolButton>
          {GRIPS.map((g) => (
            <ToolButton
              key={g}
              disabled={!baseReadable}
              onClick={() => transform((a) => regripAlg(n, a, g))}
            >
              {g}로 쥐기
            </ToolButton>
          ))}
          <ToolButton
            disabled={!baseReadable}
            onClick={() => transform((a) => removeRotations(n, a))}
          >
            큐브 돌리기 빼기
          </ToolButton>
        </div>
      </div>

      <DemoCube
        key={demo}
        n={n}
        start={start}
        alg={demo}
        mask={null}
        settings={settings}
        arrowKeys
      />
    </section>
  );
}

function ToolButton({
  children,
  onClick,
  disabled,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-white/10 px-2.5 py-1 hover:bg-white/15 disabled:opacity-40"
      {...rest}
    >
      {children}
    </button>
  );
}

function RowButton({
  children,
  onClick,
  pressed,
  ...rest
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  pressed?: boolean;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        "rounded-md px-2 py-0.5",
        pressed
          ? "bg-sky-500 font-semibold text-black"
          : "bg-white/10 hover:bg-white/15",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
