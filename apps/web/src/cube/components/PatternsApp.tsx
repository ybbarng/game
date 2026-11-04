"use client";

import { formatMoves, invertMoves, parseMoves } from "@game/cube-engine";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { faceGrid } from "../bridge";
import {
  LEVEL_LABEL,
  levelOf,
  moveCount,
  PATTERN_LINKS,
  PATTERN_SIZES,
  PATTERNS,
  type Pattern,
  patternById,
} from "../patterns/data";
import {
  addMyPattern,
  loadMyPatterns,
  MAX_PATTERN_NAME,
  type MyPattern,
  readPatternAlg,
  removeMyPattern,
  saveMyPatterns,
} from "../patterns/mine";
import { patternState, repeatOrder } from "../patterns/shape";
import { type CubeSettings, useCubeSettings } from "../settings";
import { CubeNet } from "./CubeNet";
import { DemoCube } from "./DemoCube";
import { PatternTry } from "./PatternTry";

/**
 * 패턴 만들기(`/cube/patterns`). 크기별 패턴 카드 → 카드를 열면 시연과 「직접 만들어 보기」.
 * 패턴은 `?p=<id>`로 연다(내 패턴은 `mine-<id>`). 내 패턴은 이 기기에 둔다.
 */

const MINE_PREFIX = "mine-";
const SIZE_LABEL = (n: number) => `${n}×${n}`;

/** 내 패턴을 패턴 카드 모양으로 */
function fromMine(m: MyPattern): Pattern {
  return {
    id: `${MINE_PREFIX}${m.id}`,
    size: m.size,
    name: m.name,
    alg: m.alg,
    look: "내가 넣은 공식으로 만든 패턴이에요.",
    check: "eye",
  };
}

function newId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Date.now().toString(36);
  }
}

export function PatternsApp() {
  const settings = useCubeSettings();
  // undefined: 주소를 아직 안 읽음(미리 그린 HTML과 첫 그리기를 맞춘다)
  const [openId, setOpenId] = useState<string | null | undefined>();
  const [mine, setMine] = useState<MyPattern[]>([]);

  useEffect(() => {
    const read = () =>
      setOpenId(new URLSearchParams(window.location.search).get("p"));
    read();
    setMine(loadMyPatterns());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const open = (id: string | null) => {
    setOpenId(id);
    window.history.pushState(
      null,
      "",
      id ? `?p=${encodeURIComponent(id)}` : window.location.pathname,
    );
    window.scrollTo(0, 0);
  };

  const updateMine = (list: MyPattern[]) => {
    setMine(list);
    saveMyPatterns(list);
  };

  const opened: Pattern | undefined = openId
    ? openId.startsWith(MINE_PREFIX)
      ? (() => {
          const m = mine.find((p) => `${MINE_PREFIX}${p.id}` === openId);
          return m ? fromMine(m) : undefined;
        })()
      : patternById(openId)
    : undefined;

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-cube-patterns={opened ? opened.id : "list"}
      >
        {openId === undefined ? null : opened ? (
          <PatternView
            key={opened.id}
            pattern={opened}
            settings={settings}
            onBack={() => open(null)}
            onOpen={open}
          />
        ) : (
          <PatternList
            settings={settings}
            mine={mine}
            onOpen={open}
            onMine={updateMine}
          />
        )}
      </main>
    </div>
  );
}

// ---------- 목록 ----------

function PatternList({
  settings,
  mine,
  onOpen,
  onMine,
}: {
  settings: CubeSettings;
  mine: MyPattern[];
  onOpen: (id: string) => void;
  onMine: (list: MyPattern[]) => void;
}) {
  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <a href="/cube" className="text-sm text-white/70 hover:text-white">
          ← 큐브
        </a>
        <h1 className="font-bold text-lg">패턴 만들기</h1>
        <nav
          aria-label="크기"
          className="ml-auto flex flex-wrap gap-1.5 text-sm"
        >
          {PATTERN_SIZES.map((n) => (
            <a
              key={n}
              href={`#size-${n}`}
              className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/15"
            >
              {SIZE_LABEL(n)}
            </a>
          ))}
          <a
            href="#mine"
            className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/15"
          >
            내 패턴
          </a>
        </nav>
      </header>
      <p className="text-sm text-white/70">
        맞춘 큐브에 공식 하나만 하면 예쁜 무늬가 생겨요. 카드를 열어 한 수씩
        보고, 내 키로 직접 만들어 보세요.
      </p>

      {PATTERN_SIZES.map((n) => (
        <section
          key={n}
          id={`size-${n}`}
          className="flex scroll-mt-4 flex-col gap-2"
          data-pattern-size={n}
        >
          <h2 className="font-semibold text-white/90">{SIZE_LABEL(n)}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {PATTERNS.filter((p) => p.size === n).map((p) => (
              <li key={p.id}>
                <PatternCard pattern={p} settings={settings} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <MinePatterns
        settings={settings}
        mine={mine}
        onOpen={onOpen}
        onMine={onMine}
      />
    </>
  );
}

function PatternCard({
  pattern: p,
  settings,
  onOpen,
}: {
  pattern: Pattern;
  settings: CubeSettings;
  onOpen: (id: string) => void;
}) {
  const faces = useMemo(
    () => faceGrid(p.size, patternState(p.size, p.alg)),
    [p.size, p.alg],
  );
  const count = moveCount(p.size, p.alg);
  const level = levelOf(count);
  return (
    <button
      type="button"
      data-pattern-card={p.id}
      onClick={() => onOpen(p.id)}
      className="flex h-full w-full flex-col items-stretch gap-1.5 rounded-xl bg-white/5 p-2.5 text-left hover:bg-white/10"
    >
      <CubeNet
        n={p.size}
        faces={faces}
        colors={settings.colors}
        hidden={settings.hidden}
        className="h-auto w-full"
      />
      <span className="font-semibold leading-tight">{p.name}</span>
      {p.en && (
        <span className="-mt-1 text-[11px] text-white/50 leading-tight">
          {p.en}
        </span>
      )}
      <span className="mt-auto flex items-center gap-1.5 text-white/70 text-xs">
        <span>{count}수</span>
        <LevelBadge level={level} />
      </span>
    </button>
  );
}

function LevelBadge({ level }: { level: ReturnType<typeof levelOf> }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-px font-semibold text-[11px]",
        level === "easy" && "bg-emerald-400/20 text-emerald-300",
        level === "normal" && "bg-amber-400/20 text-amber-300",
        level === "hard" && "bg-rose-400/20 text-rose-300",
      )}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

// ---------- 내 패턴 ----------

function MinePatterns({
  settings,
  mine,
  onOpen,
  onMine,
}: {
  settings: CubeSettings;
  mine: MyPattern[];
  onOpen: (id: string) => void;
  onMine: (list: MyPattern[]) => void;
}) {
  const [size, setSize] = useState(3);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const read = useMemo(
    () => (text.trim() ? readPatternAlg(size, text) : null),
    [size, text],
  );
  const preview = useMemo(
    () => (read?.ok ? faceGrid(size, patternState(size, read.alg)) : null),
    [read, size],
  );

  return (
    <section
      id="mine"
      className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-white/10 p-3"
      data-pattern-mine
    >
      <h2 className="font-semibold text-white/90">내 패턴</h2>
      <p className="text-sm text-white/70">
        공식을 넣으면 맞춘 큐브에 했을 때의 모양을 바로 보여 줘요. 마음에 들면
        이 기기에 저장해 두세요.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <form
          className="flex flex-1 flex-col gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (!read?.ok) return;
            onMine(addMyPattern(mine, { size, name, alg: read.alg }, newId()));
            setName("");
            setText("");
          }}
        >
          <fieldset aria-label="크기" className="flex gap-1.5">
            {[2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={n === size}
                onClick={() => setSize(n)}
                className={cn(
                  "rounded-full px-3 py-1",
                  n === size
                    ? "bg-sky-500 font-semibold text-black"
                    : "bg-white/10 hover:bg-white/15",
                )}
              >
                {SIZE_LABEL(n)}
              </button>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="text-white/70 text-xs">공식</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="예: R2 L2 U2 D2 F2 B2"
              spellCheck={false}
              autoCapitalize="off"
              data-mine-alg
              className="rounded-lg bg-white/10 px-3 py-2 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-white/70 text-xs">이름</span>
            <input
              value={name}
              maxLength={MAX_PATTERN_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="내 패턴"
              data-mine-name
              className="rounded-lg bg-white/10 px-3 py-2"
            />
          </label>
          {read && !read.ok && (
            <p className="text-rose-300 text-xs" role="alert">
              {read.message}
            </p>
          )}
          <button
            type="submit"
            disabled={!read?.ok}
            data-mine-save
            className="self-start rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-black disabled:opacity-40"
          >
            저장
          </button>
        </form>
        <div className="flex w-full flex-col items-center justify-center gap-1 sm:w-56">
          {preview ? (
            <CubeNet
              n={size}
              faces={preview}
              colors={settings.colors}
              hidden={settings.hidden}
              className="h-auto w-full max-w-56"
            />
          ) : (
            <p className="text-white/40 text-xs">공식을 넣으면 모양이 보여요</p>
          )}
        </div>
      </div>
      {mine.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {mine.map((m) => (
            <li key={m.id} className="flex flex-col gap-1">
              <PatternCard
                pattern={fromMine(m)}
                settings={settings}
                onOpen={onOpen}
              />
              <button
                type="button"
                onClick={() => onMine(removeMyPattern(mine, m.id))}
                className="self-end text-white/50 text-xs hover:text-white"
              >
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- 패턴 하나 ----------

function PatternView({
  pattern: p,
  settings,
  onBack,
  onOpen,
}: {
  pattern: Pattern;
  settings: CubeSettings;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const n = p.size;
  const start = useMemo(() => patternState(n, ""), [n]);
  const count = moveCount(n, p.alg);
  const order = useMemo(() => repeatOrder(n, p.alg), [n, p.alg]);
  const undo = useMemo(
    () => formatMoves(n, invertMoves(parseMoves(n, p.alg))),
    [n, p.alg],
  );
  const links = PATTERN_LINKS.filter((l) => l.from === p.id);

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 패턴 모음
        </button>
        <h1 className="font-bold text-lg">
          {p.name}
          {p.en && (
            <span className="ml-2 font-normal text-sm text-white/50">
              {p.en}
            </span>
          )}
        </h1>
        <span className="flex items-center gap-1.5 text-sm text-white/70">
          {SIZE_LABEL(n)} · {count}수 <LevelBadge level={levelOf(count)} />
        </span>
      </header>
      <p className="text-white/80">{p.look}</p>

      <section className="flex flex-col gap-2" aria-label="시연">
        <h2 className="font-semibold">한 수씩 보기</h2>
        <DemoCube
          n={n}
          start={start}
          alg={p.alg}
          mask={null}
          settings={settings}
        />
        {p.alt && (
          <p className="text-center text-sm text-white/70">
            같은 모양을 만드는 다른 공식:{" "}
            <span className="font-mono text-white">{p.alt}</span>
          </p>
        )}
      </section>

      <section
        className="flex flex-col gap-1.5 rounded-xl bg-white/5 p-3 text-sm"
        aria-label="패턴에서 패턴으로"
      >
        <h2 className="font-semibold">패턴에서 패턴으로</h2>
        {order !== null && (
          <p>
            {order === 2
              ? "이 공식을 한 번 더 하면 다시 맞춘 큐브로 돌아가요."
              : `이 공식을 모두 ${order}번 하면 다시 맞춘 큐브로 돌아가요. 그 사이에 다른 무늬도 보여요.`}
          </p>
        )}
        <p>
          거꾸로 하면 바로 돌아가요:{" "}
          <span className="font-mono text-white/90">{undo}</span>
        </p>
        {links.map((l) => {
          const next = patternById(l.next);
          if (!next) return null;
          return (
            <p key={l.next}>
              이 모양에서{" "}
              <button
                type="button"
                onClick={() => onOpen(next.id)}
                className="font-semibold text-sky-300 underline-offset-2 hover:underline"
              >
                「{next.name}」
              </button>{" "}
              공식을 이어 하면 {l.result}
            </p>
          );
        })}
      </section>

      <section className="flex flex-col gap-2" aria-label="직접 만들어 보기">
        <h2 className="font-semibold">직접 만들어 보기</h2>
        <PatternTry n={n} alg={p.alg} settings={settings} />
      </section>
    </>
  );
}
