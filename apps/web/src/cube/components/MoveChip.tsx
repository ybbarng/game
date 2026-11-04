"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { type KeyChord, type Keymap, loadKeymap } from "../input";
import { keycapLabel, keysForMove, splitMoveText } from "../keys/move-keys";
import { useNoKeyboard } from "./PracticeCube";

/**
 * 배우기·튜토리얼의 수 표기 옆에 그 사람의 키를 키캡으로 함께 보인다(docs/47 4-4·8절, 2026-11-04).
 * 해 보기에서 치는 키와 같은 배치(설정의 「두 손」·「표기」·「사용자」)라 R을 보고 I를 머릿속에서 따로 바꾸지 않는다.
 * 키보드가 없을 기기(휴대폰)는 키캡을 숨기고 표기만 보인다.
 */

/** 수 → 그 배치의 키 차례. 키캡을 보이지 않을 때(휴대폰, 배치를 아직 못 읽음)는 null */
export type MoveKeysOf = (notation: string) => KeyChord[] | null;

export function useMoveKeys(n: number): {
  keymap: Keymap | null;
  keysOf: MoveKeysOf | null;
} {
  const [keymap, setKeymap] = useState<Keymap | null>(null);
  useEffect(() => setKeymap(loadKeymap()), []);
  const noKeyboard = useNoKeyboard();
  const keysOf = useCallback(
    (notation: string) => (keymap ? keysForMove(keymap, n, notation) : null),
    [keymap, n],
  );
  return { keymap, keysOf: keymap && !noKeyboard ? keysOf : null };
}

/** 키캡 줄. `keys`가 null이면 「키 없음」(설정에서 놓을 수 있다) */
export function KeyCaps({
  keys,
  link = false,
  className,
}: {
  keys: KeyChord[] | null;
  /** 「키 없음」을 설정 링크로(버튼 안이 아닐 때만) */
  link?: boolean | undefined;
  className?: string;
}) {
  if (keys === null) {
    const cls = cn(
      "rounded border border-current/30 border-dashed px-1 font-sans text-[10px] leading-4 opacity-70",
      className,
    );
    return link ? (
      <a
        href="/cube/settings"
        data-move-keys=""
        className={cn(cls, "underline-offset-2 hover:underline")}
      >
        키 없음
      </a>
    ) : (
      <span
        data-move-keys=""
        title="설정에서 키를 놓을 수 있어요"
        className={cls}
      >
        키 없음
      </span>
    );
  }
  return (
    <span
      data-move-keys={keys.map(keycapLabel).join(" ")}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {keys.map((k, i) => (
        <kbd
          // biome-ignore lint/suspicious/noArrayIndexKey: 같은 키가 되풀이된다(R2 = I I)
          key={i}
          className="min-w-4 rounded border border-current/40 px-1 text-center font-sans font-semibold text-[11px] leading-4 opacity-90"
        >
          {keycapLabel(k)}
        </kbd>
      ))}
    </span>
  );
}

/** 표기 + 키캡(`R` `I`). `keysOf`가 null이면 표기만 */
export function MoveChip({
  notation,
  keysOf,
  link,
  className,
}: {
  notation: string;
  keysOf: MoveKeysOf | null;
  link?: boolean | undefined;
  className?: string;
}) {
  return (
    <span
      data-move-chip={notation}
      className={cn("inline-flex items-center gap-1", className)}
    >
      <span className="font-mono">{notation}</span>
      {keysOf && <KeyCaps keys={keysOf(notation)} link={link} />}
    </span>
  );
}

/**
 * 레슨 본문. 글 속 수(「L을 쳐 보세요」의 L)를 칩으로 바꿔 그린다. 자료는 그대로 두고 그리는 쪽에서만 바꾼다.
 * `letters`: 스티커를 글자로 부르는 단원(블라인드)은 확실한 공식만 바꾼다(`splitMoveText`).
 */
export function MoveText({
  text,
  n,
  letters = false,
  keys = true,
}: {
  text: string;
  n: number;
  letters?: boolean;
  /** 수 옆에 내 키캡을 붙인다(시연 「보기」 상태에서는 끈다) */
  keys?: boolean;
}) {
  const { keysOf: mine } = useMoveKeys(n);
  const keysOf = keys ? mine : null;
  return (
    <>
      {splitMoveText(text, { letters }).map((p, i) =>
        p.kind === "text" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 글 조각의 차례가 곧 열쇠다
          <Fragment key={i}>{p.text}</Fragment>
        ) : (
          <MoveChip
            // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
            key={i}
            notation={p.text}
            keysOf={keysOf}
            className="mx-0.5 rounded bg-white/10 px-1 align-baseline font-semibold"
          />
        ),
      )}
    </>
  );
}
