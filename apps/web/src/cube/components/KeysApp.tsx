"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { MAX_N, MIN_N } from "../input/actions";
import { type Keymap, PRESET_LABEL } from "../input/keymaps";
import { loadKeymap } from "../input/storage";
import {
  actionRows,
  LAYER_LABEL,
  type Layer,
  searchRows,
} from "../keys/layout";
import { dotOf, KeyboardMap, KeyLegend, type LayerView } from "./KeyboardMap";

/**
 * 단축키 표(`/cube/keys`, docs/47 4절). 지금 배치를 실제 키보드 모양으로 그리고, 아래에 동작 → 키 목록(찾기)을 둔다.
 * 인쇄하면 흰 바탕으로 키보드와 목록만 나온다.
 */

/** 단축키 표에서 이어지는 곳(키 익히기·조작 훈련은 사이트 쓰는 법으로 합쳤다, docs/47 16-8) */
const TABS = [
  { href: "/cube/keys", title: "단축키 표" },
  { href: "/cube/intro?part=keys", title: "키 익히기" },
  { href: "/cube/intro?part=practice", title: "조작 연습" },
];

/** 단축키 표의 머리말 */
function KeysHeader({
  current,
  keymap,
}: {
  current: string;
  keymap: Keymap | null;
}) {
  return (
    <header className="flex flex-col gap-3 print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/cube"
          className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
        >
          ← 큐브
        </a>
        <h1 className="font-bold text-lg">단축키 표</h1>
        {keymap && (
          <span className="ml-auto text-white/60 text-xs">
            배치 「{PRESET_LABEL[keymap.preset]}」 ·{" "}
            <a
              href="/cube/settings"
              className="underline underline-offset-2 hover:text-white"
            >
              바꾸기
            </a>
          </span>
        )}
      </div>
      <nav className="flex gap-1" aria-label="키 익히기 차례">
        {TABS.map((t) => (
          <a
            key={t.href}
            href={t.href}
            aria-current={t.href === current ? "page" : undefined}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-center text-sm",
              t.href === current
                ? "bg-sky-500/30 font-semibold"
                : "bg-white/5 hover:bg-white/10",
            )}
          >
            {t.title}
          </a>
        ))}
      </nav>
    </header>
  );
}

const LAYER_VIEWS: LayerView[] = ["all", "plain", "shift", "alt", "altShift"];

export function useKeymap(): Keymap | null {
  const [keymap, setKeymap] = useState<Keymap | null>(null);
  useEffect(() => setKeymap(loadKeymap()), []);
  return keymap;
}

export function KeysApp() {
  const keymap = useKeymap();
  const [n, setN] = useState(3);
  const [layer, setLayer] = useState<LayerView>("all");
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () => (keymap ? actionRows(keymap, n) : []),
    [keymap, n],
  );
  const found = useMemo(() => searchRows(rows, query), [rows, query]);

  return (
    <div
      data-game="cube"
      className="min-h-dvh bg-neutral-900 text-white print:bg-white print:text-black"
    >
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-keys-page="map"
        data-keys-ready={keymap ? "" : undefined}
      >
        <KeysHeader current="/cube/keys" keymap={keymap} />
        <h2 className="hidden font-bold text-lg print:block">
          큐브 단축키 표
          {keymap ? ` · 배치 「${PRESET_LABEL[keymap.preset]}」` : ""} · {n}×{n}
        </h2>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm print:hidden">
          <div className="flex items-center gap-1">
            <span className="text-white/60">크기</span>
            {Array.from({ length: MAX_N - MIN_N + 1 }, (_, i) => i + MIN_N).map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={s === n}
                  data-size={s}
                  onClick={() => setN(s)}
                  className={chip(s === n)}
                >
                  {s}
                </button>
              ),
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/60">층</span>
            {LAYER_VIEWS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={l === layer}
                data-layer-view={l}
                onClick={() => setLayer(l)}
                className={chip(l === layer)}
              >
                {l === "all" ? "모두" : LAYER_LABEL[l as Layer]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto rounded-lg bg-white/10 px-3 py-1 hover:bg-white/15"
          >
            인쇄
          </button>
        </div>

        {keymap && (
          <section className="flex flex-col gap-2">
            <KeyboardMap keymap={keymap} n={n} layer={layer} />
            <p className="break-keep text-white/60 text-xs print:text-neutral-600">
              {layer === "all"
                ? "칸마다 맨 위 굵은 글은 그냥 칠 때, 그 아래는 Shift와 함께, 맨 아래는 Alt(그리고 Alt+Shift)와 함께 칠 때예요. 흐린 글은 이 크기에서 쓰지 않아요."
                : `${LAYER_LABEL[layer as Layer]} 층만 보여요. 흐린 글은 이 크기에서 쓰지 않아요.`}
            </p>
            <KeyLegend />
            {keymap.preset === "twoHand" && (
              <p className="break-keep text-white/60 text-xs" data-keys-cstimer>
                「두 손」은 csTimer와 같은 자리예요. 덧붙인 것: Shift + 면 키 =
                넓게. csTimer와 다른 곳: Space는 층 수 되돌리기가 아니라
                살펴보기·블라인드 시작이에요. 큰 큐브의 층 수(3·4·7·8)는
                섞기·맞춘 상태로 때 1로 돌아가요.
              </p>
            )}
          </section>
        )}

        <section className="flex flex-col gap-2" data-keys-table>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">동작 → 키</h2>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="동작이나 키"
              aria-label="동작이나 키로 찾기"
              data-keys-search
              className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm print:hidden"
            />
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-white/50 text-xs print:text-neutral-500">
              <tr>
                <th className="py-1 pr-2 font-normal">동작</th>
                <th className="py-1 font-normal">키</th>
              </tr>
            </thead>
            <tbody>
              {found.map((r) => (
                <tr
                  key={r.action}
                  data-action={r.action}
                  className="border-white/5 border-t print:border-neutral-200"
                >
                  <td className="py-1 pr-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-block h-2 w-2 shrink-0 rounded-sm",
                          dotOf(r),
                        )}
                      />
                      <span className="font-mono">{r.label}</span>
                    </span>
                  </td>
                  <td
                    className={cn(
                      "py-1 font-mono",
                      !r.keys && "text-white/35 print:text-neutral-400",
                    )}
                  >
                    {r.keys ?? "키 없음"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {found.length === 0 && (
            <p className="text-sm text-white/60">찾는 동작이 없어요.</p>
          )}
        </section>
      </main>
    </div>
  );
}

export function chip(on: boolean): string {
  return cn(
    "rounded-lg px-2.5 py-1 text-sm",
    on
      ? "bg-sky-500 font-semibold text-black"
      : "bg-white/10 hover:bg-white/15",
  );
}
