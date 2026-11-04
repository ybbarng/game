import { GAMES } from "@/games/registry";

import { EGGS, type Egg, type EggKey } from "./eggs";

/**
 * 콘솔 인사를 고르고 찍는다. 화면(`ConsoleEgg.tsx`)은 주소가 바뀔 때마다 `createConsoleEgg`가 만든 함수를 부른다.
 *
 * - 주소의 첫 마디로 고른다: `/cube/learn` → 큐브. 홈·게임·보안 설명·보안 배우기만 인사가 있고 그 밖은 찍지 않는다.
 * - 같은 인사는 이어서 두 번 찍지 않는다(같은 게임 안에서 옮겨 다닐 때, 인사 없는 페이지를 거쳐 돌아올 때).
 * - `log`·`group`·`groupEnd`·`table`만 쓴다. `error`·`warn`은 화면 시험이 실패로 본다.
 */
export type EggConsole = Pick<Console, "log" | "group" | "groupEnd" | "table">;

const BY_SEGMENT: ReadonlyMap<string, EggKey> = new Map<string, EggKey>([
  ...GAMES.map((game) => [game.path.slice(1), game.id] as const),
  ["security", "security"],
  ["learn", "learn"],
]);

/** 주소 → 인사 열쇠. 인사가 없는 페이지면 null */
export function eggKeyFor(pathname: string): EggKey | null {
  const first = pathname.split("/").find((part) => part !== "") ?? "";
  if (first === "") return "home";
  return BY_SEGMENT.get(first) ?? null;
}

const MONO = "font-family:ui-monospace,Menlo,Consolas,monospace";

function chip(accent: string): string {
  return `background:${accent};color:#fff;font-weight:bold;font-size:13px;padding:2px 8px;border-radius:4px`;
}

/** 링크 값이 사이트 안 주소면 사이트 주소를 앞에 붙인다 */
function linkValue(value: string, origin: string): string {
  return value.startsWith("/") ? `${origin}${value}` : value;
}

/** 인사 하나를 찍는다 */
export function printEgg(egg: Egg, out: EggConsole, origin: string): void {
  out.group(`%c ${egg.title} `, chip(egg.accent));
  out.log(
    `%c${egg.art.join("\n")}`,
    `${MONO};font-weight:bold;line-height:1.25`,
  );
  out.log(egg.lines.join("\n\n"));
  if (egg.table) {
    out.log(egg.table.caption);
    out.table(egg.table.rows.map((row) => ({ ...row })));
  }
  for (const link of egg.links) {
    out.log(
      `%c${link.label}%c ${linkValue(link.value, origin)}`,
      "font-weight:bold",
      MONO,
    );
  }
  out.groupEnd();
}

/** 주소를 받을 때마다 필요하면 인사를 찍는 함수. 찍었으면 true */
export function createConsoleEgg(
  out: EggConsole,
  origin: string,
): (pathname: string) => boolean {
  let last: EggKey | null = null;
  return (pathname) => {
    const key = eggKeyFor(pathname);
    if (key === null || key === last) return false;
    last = key;
    printEgg(EGGS[key], out, origin);
    return true;
  };
}
