"use client";

import type { PuzzleState } from "@game/puzzle-core";

import { CubePosterPair } from "../components/CubePosterPair";
import type { CubeLook } from "../item-look";
import type { SplitGroup } from "../progress/splits";
import { formatMs } from "../records";
import type { CubeSettings } from "../settings";
import {
  type ActiveHandicap,
  goalLabel,
  handicapTags,
  helpLabel,
  helpOf,
} from "./handicap";
import { ItemIcon } from "./ItemBar";
import { ITEM_LABELS, type ItemKind } from "./items";
import { PartyBar } from "./PartyBar";

/**
 * 대결 화면 테두리의 상대 자리 하나(docs/47 9-9). 작은 큐브 그림(비스듬한 SVG, 3D 장면은 만들지 않는다)이 상대가
 * 돌릴 때마다 바뀌고, 이름·단계 칩·체력바·맞은 방해·끝냄/기권/탈락을 붙인다. 칸 높이는 판 내내 같아(맞은 방해·톡은
 * 그림 위에 겹친다) 위 줄 자리가 내 큐브를 밀지 않는다.
 *
 * 꼴: `top`(데스크톱 위 줄, 그림 왼쪽·글 오른쪽), `side`(데스크톱 양옆, 글 위·그림 아래 크게),
 * `slim`(휴대폰 가로 양옆·휴대폰 세로 한두 자리, 작은 그림 왼쪽), `tiny`(휴대폰 세로 셋 이상, 글 위·작은 그림 아래)
 */
export type SeatLook = "top" | "side" | "slim" | "tiny";

export interface SeatNotice {
  key: string;
  item: ItemKind;
  by: string;
  blocked: boolean;
}

export function RaceSeat({
  id,
  name,
  shape: seatLook,
  status,
  done,
  out,
  connected,
  botPlanned,
  peerStatus,
  hp,
  groups,
  toast,
  handicap,
  n,
  item,
  guard,
  hits,
  state,
  settings,
  look,
  showCube,
  chips,
  progress,
  stageText,
}: {
  /** 단계 칩으로 보이나. 대결 알림 「끔」이면 예전처럼 진행 막대와 단계 이름 */
  chips: boolean;
  /** 맞은 조각 비율(0~1, 칩을 끈 때) */
  progress: number;
  /** 단계 이름(칩을 끈 때) */
  stageText: string;
  id: string;
  name: string;
  shape: SeatLook;
  /** 끝낸 시간·「기권」·「탈락」·「DNF」(맞추는 중이면 빈 글) */
  status: string;
  done: boolean;
  /** 판에서 빠졌다(기권·탈락·DNF): 자리를 흐리게 */
  out: boolean;
  connected: boolean;
  botPlanned: boolean;
  peerStatus: string;
  hp: number | undefined;
  groups: readonly SplitGroup[];
  toast: { key: string; text: string } | undefined;
  handicap: ActiveHandicap | undefined;
  n: number;
  /** 아이템전이 아니면 undefined */
  item: ItemKind | null | undefined;
  guard: boolean;
  hits: readonly SeatNotice[];
  state: PuzzleState | undefined;
  settings: CubeSettings;
  /** 내 화면 방해(흑백 화면·색 뒤집기)는 상대 그림에도 같이 */
  look: CubeLook | null;
  showCube: boolean;
}) {
  const row = seatLook === "top" || seatLook === "slim";
  const small = seatLook === "slim" || seatLook === "tiny";
  const art =
    showCube && state ? (
      <div className={`relative ${artClass[seatLook]}`}>
        <CubePosterPair
          n={n}
          state={state}
          settings={settings}
          look={look}
          captions={false}
          frontOnly={small}
          className="w-full"
        />
        <SeatHits hits={hits} small={small} />
      </div>
    ) : null;
  return (
    <div
      data-cube-peer={id}
      data-cube-peer-status={peerStatus}
      data-cube-seat={seatLook}
      data-cube-bot-planned={botPlanned ? "" : undefined}
      className={`relative flex min-w-0 rounded-xl border border-white/10 bg-white/5 ${
        row ? "flex-row items-center gap-2" : "flex-col gap-1"
      } ${small ? "p-1.5" : "p-2"} ${out ? "opacity-55" : ""}`}
    >
      {row && art}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          className={`flex min-w-0 items-baseline gap-1.5 ${
            seatLook === "tiny" ? "text-xs" : "text-sm"
          }`}
        >
          <b className="min-w-0 truncate">{name}</b>
          {!connected && (
            <span className="shrink-0 text-red-300 text-xs">끊김</span>
          )}
          {item !== undefined && (
            <PeerItems id={id} item={item} guard={guard} />
          )}
          {status && (
            <span
              className={`ml-auto shrink-0 font-mono text-xs tabular-nums ${
                done ? "text-emerald-300" : "text-white/70"
              }`}
            >
              {status}
            </span>
          )}
        </div>
        {handicap && seatLook !== "tiny" && (
          <PeerHandicap handicap={handicap} n={n} id={id} />
        )}
        {chips ? (
          <PeerStages groups={groups} lastOnly={small} />
        ) : (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full ${done ? "bg-emerald-400" : "bg-sky-400"}`}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="truncate text-white/60 text-xs">{stageText}</span>
          </>
        )}
        {hp !== undefined && <PartyBar id={id} hp={hp} out={out} />}
        {/* 그림을 끄면 맞은 방해를 글 줄에 */}
        {!art && <SeatHits hits={hits} small inline />}
      </div>
      {!row && art}
      {toast && (
        <span
          key={toast.key}
          data-cube-race-toast={id}
          data-toast-key={toast.key}
          className="cube-race-toast pointer-events-none absolute -top-2 right-1 z-10 whitespace-nowrap rounded-full border border-sky-200/40 bg-neutral-900/90 px-2 py-0.5 font-semibold text-sky-100 text-xs shadow-lg"
        >
          {toast.text}
        </span>
      )}
    </div>
  );
}

const artClass: Record<SeatLook, string> = {
  top: "w-32 shrink-0",
  side: "w-full",
  slim: "w-14 shrink-0",
  tiny: "mx-auto w-12",
};

/** 그 사람이 맞은 방해(그림 위에 겹쳐 칸 높이가 바뀌지 않는다). 막았으면 방패 */
function SeatHits({
  hits,
  small,
  inline = false,
}: {
  hits: readonly SeatNotice[];
  small: boolean;
  inline?: boolean;
}) {
  const h = hits[0];
  if (!h) return null;
  return (
    <span
      data-cube-seat-hit={h.item}
      data-cube-item-blocked={h.blocked ? "" : undefined}
      title={
        h.blocked
          ? `방패로 막음 · ${ITEM_LABELS[h.item]}`
          : `${ITEM_LABELS[h.item]} 맞음`
      }
      className={`flex items-center gap-1 whitespace-nowrap rounded-full border font-semibold shadow ${
        inline
          ? "self-start"
          : "absolute bottom-0 left-1/2 z-10 -translate-x-1/2"
      } ${small ? "px-1 py-px text-[10px]" : "px-2 py-0.5 text-xs"} ${
        h.blocked
          ? "border-sky-200/50 bg-sky-950/90 text-sky-100"
          : "border-rose-200/50 bg-rose-950/90 text-rose-100"
      }`}
    >
      <ItemIcon
        item={h.blocked ? "shield" : h.item}
        className={small ? "h-3 w-3" : "h-3.5 w-3.5"}
      />
      {small ? null : h.blocked ? "막음" : ITEM_LABELS[h.item]}
    </span>
  );
}

/** 자리 이름 옆의 가진 아이템·방패(아이콘만, 이름은 마우스를 올리면) */
function PeerItems({
  id,
  item,
  guard,
}: {
  id: string;
  item: ItemKind | null;
  guard: boolean;
}) {
  if (!item && !guard) return null;
  return (
    <span
      data-cube-peer-item={id}
      data-item={item ?? undefined}
      className="flex shrink-0 items-center gap-0.5 text-amber-200/80"
      title={[item ? ITEM_LABELS[item] : "", guard ? ITEM_LABELS.shield : ""]
        .filter(Boolean)
        .join(" · ")}
    >
      {item && <ItemIcon item={item} className="h-3.5 w-3.5" />}
      {guard && (
        <ItemIcon item="shield" className="h-3.5 w-3.5 text-sky-200/80" />
      )}
    </span>
  );
}

/** 자리의 짧은 핸디캡 표시(「+5초」·「첫 두 층」) */
function PeerHandicap({
  handicap,
  n,
  id,
}: {
  handicap: ActiveHandicap;
  n: number;
  id: string;
}) {
  const d = handicap.delaySec[id];
  const g = handicap.goal[id];
  const help = helpOf(handicap, id);
  if (!d && !g && !help) return null;
  return (
    <span
      data-cube-peer-handicap={id}
      title={handicapTags(handicap, n, id).join(" · ")}
      className="truncate text-[11px] text-white/45"
    >
      {[
        d ? `+${d}초` : "",
        g ? goalLabel(n, g) : "",
        help ? helpLabel(n, help) : "",
      ]
        .filter(Boolean)
        .join(" · ")}
    </span>
  );
}

/**
 * 단계 칩 한 줄(docs/51 1-3). 수마다 움직이지 않고 이정표를 지날 때만 칩이 하나 는다. 최근 셋, 마지막 칩만
 * 시각을 붙이고 앞 칩은 흐리게. 좁은 자리(`lastOnly`)는 마지막 칩만. 지난 것이 없으면 `empty`(기본 「-」)
 */
export function PeerStages({
  groups,
  lastOnly = false,
  empty = "-",
  className = "",
}: {
  groups: readonly SplitGroup[];
  lastOnly?: boolean;
  empty?: string | null;
  className?: string;
}) {
  const shown = groups.slice(lastOnly ? -1 : -3);
  return (
    <ol
      data-cube-peer-stages={groups.map((g) => g.ids.join("+")).join(" ")}
      className={`flex h-5 min-w-0 items-center gap-1 overflow-hidden ${className}`}
    >
      {shown.length === 0 && empty && (
        <li className="text-[11px] text-white/35">{empty}</li>
      )}
      {shown.map((g, i) => {
        const last = i === shown.length - 1;
        return (
          <li
            key={`${g.ms}-${g.ids.join("+")}`}
            data-milestone={g.ids.join("+")}
            title={`${g.full} ${formatMs(g.ms)}`}
            className={`min-w-0 truncate rounded-full border px-1.5 py-px text-[11px] ${
              last
                ? "cube-milestone-in shrink border-sky-300/35 bg-sky-400/10 text-sky-100"
                : "shrink-0 border-white/10 text-white/45"
            }`}
          >
            {g.label}
            {last && (
              <span className="ml-1 font-mono text-sky-200/75 tabular-nums">
                {formatMs(g.ms)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
