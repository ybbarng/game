"use client";

import { type Clock, realClock } from "@game/fair-play";
import {
  drandRoundForClose,
  drandTime,
  type EntrantSigner,
  fromBase64Url,
  type Rank,
  type RoundRecord,
  registrationProofMessage,
  roundTimes,
  type Ticket,
} from "@game/stardraw-core";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";
import {
  bestRank,
  hillFaces,
  hillRanks,
  marksDelay,
  SPEECH_MS,
  speechAt,
  speechRank,
} from "../after-observe";
import { Avatar } from "../astronaut/Avatar";
import { astronautOf, residentPhrase } from "../astronaut/identity";
import { celebrationPlan } from "../celebrate";
import { errorText } from "../errors";
import { EASE, FX } from "../fx-timing";
import { inAppFailed } from "../passkey-env";
import { ensureRegistered, registering } from "../registrar";
import { drawOrder, myRank } from "../results";
import {
  freshNonce,
  nonceExpired,
  ROOM_TEXT_MAX,
  RoomClient,
  type RoomEvent,
  type RoomPerson,
  type RoomPicks,
  roomCharCount,
  savedPass,
} from "../room-client";
import { roomPhase } from "../room-phase";
import { roomSeat } from "../room-seat";
import { LIVE_LEAD_MS, LIVE_ROULETTE_TIMING, planRoulette } from "../roulette";
import { roundTitle } from "../round-label";
import { type Services, serverApi } from "../services";
import { starOf } from "../sky";
import { rowFaceLimit, useTypingFit } from "../typing-fit";
import type { KeyInfo } from "../wallet";
import { IssuedView, useAstronautSetup, WelcomeFlyer } from "./AstronautSetup";
import { DrawView } from "./DrawView";
import { IdPresentView, useIdPresent } from "./IdPresent";
import { InAppTriedNotice, PasskeyBlockedNotice } from "./InAppNotice";
import { PlaceLabel } from "./PlaceIcons";
import { formatLeft, RANK_LABEL } from "./parts";
import { SkyBoard } from "./SkyBoard";
import { MenuItem } from "./StardrawNav";

/**
 * 회차 방(docs/36 11-23, docs/06): 밤하늘을 보러 모인 사람들. 위쪽은 밤하늘(추첨도 여기)과 진행 상태 한 줄,
 * 아래는 언덕 위에 모여 앉은 우주인 얼굴들. 말은 그 얼굴에서 풍등처럼 떠올라 흐려진다(남기지 않는다).
 * 추첨은 서버 시각 기준으로 모두 같은 장면(방송처럼): 시작 = 추첨 시각 + LIVE_LEAD_MS, 15초 전 안내, 10초 카운트다운
 */

/** 언덕에 보이는 얼굴 수(넘으면 +n) */
const FACES = 12;
/** 동시에 떠 있는 풍등 수 */
const LANTERNS = 6;
export const LANTERN_MS = 7000;

interface Lantern {
  key: string;
  id: string;
  from: string;
  text: string;
  /** 말한 얼굴의 가로 자리(하늘 판 기준 px) */
  x: number;
  /** 떠오르기 시작하는 높이 줄(0~3). 가까운 풍등과 같은 줄을 쓰지 않는다 */
  lane: number;
  /** 띄운 시각(ms) */
  at: number;
  hidden?: boolean;
  /** 국장 화면에서 언덕이 둘 이상일 때만: 말한 사람의 언덕 번호(docs/36 11-56) */
  hill?: number;
}

/** 풍등이 다른 풍등과 겹치지 않을 만큼 위로 떠오르는 시간(ms)과 가로로 떨어져야 하는 거리(px) */
export const LANTERN_CLEAR_MS = 1700;
const LANTERN_GAP = 220;
/** 하늘 판 가장자리 여백(px) */
const LANTERN_EDGE = 6;
/** 풍등을 길게 누르는 시간(ms) */
const HOLD_MS = 500;

/** 말을 길게 누름(신고·국장 조치). 풍등과 당첨 소감이 같이 쓴다. onHold가 없으면 누를 수 없다 */
function useHold(lantern: Lantern, onHold: ((l: Lantern) => void) | undefined) {
  const hold = useRef(0);
  if (!onHold) return {};
  return {
    onPointerDown: () => {
      window.clearTimeout(hold.current);
      hold.current = window.setTimeout(() => onHold(lantern), HOLD_MS);
    },
    onPointerUp: () => window.clearTimeout(hold.current),
    onPointerLeave: () => window.clearTimeout(hold.current),
    onPointerCancel: () => window.clearTimeout(hold.current),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      window.clearTimeout(hold.current);
      onHold(lantern);
    },
  };
}

/** 당첨 소감 하나(관측이 끝난 뒤 1~3등의 첫 말, docs/36 11-44) */
interface Speech {
  lantern: Lantern;
  rank: Rank;
  /** 말한 사람의 공개 열쇠(얼굴·이름) */
  pub: string | null;
  /** 뜨는 시각(서버 ms). 앞 소감이 걷힌 뒤 차례로 */
  at: number;
}

/**
 * 당첨 소감: 하늘 가운데에 크게, 금빛으로 오래(SPEECH_MS) 머문다. 길게 누르면 풍등과 같은 신고·국장 조치
 */
function SpeechBubble({
  speech,
  onHold,
}: {
  speech: Speech;
  onHold?: ((l: Lantern) => void) | undefined;
}) {
  const press = useHold(speech.lantern, onHold);
  const a = speech.pub ? astronautOf(fromBase64Url(speech.pub)) : null;
  return (
    <div className="absolute inset-0 grid place-items-center px-5">
      <div
        data-speech={speech.rank}
        data-lantern={speech.lantern.from}
        {...press}
        className={cn(
          "sd-speech flex max-w-full select-none flex-col items-center gap-2 rounded-3xl border border-amber-200/80 bg-gradient-to-b from-amber-100 to-amber-200 px-5 py-4 text-center text-slate-900 shadow-[0_0_48px_rgba(252,211,77,0.55)]",
          onHold && "pointer-events-auto [-webkit-touch-callout:none]",
        )}
      >
        <span className="flex items-center gap-2 font-semibold text-amber-900 text-xs">
          {a && (
            <span className="size-7 overflow-hidden rounded-full border border-amber-500/60 bg-[#0f1d3a]">
              <Avatar
                face={a.face}
                egg={a.egg}
                label=""
                className="size-full scale-125"
              />
            </span>
          )}
          {RANK_LABEL[speech.rank]}
          {a ? ` · ${a.name}` : ""}
        </span>
        <span className="break-keep font-bold text-lg leading-snug sm:text-xl">
          {speech.lantern.text}
        </span>
      </div>
    </div>
  );
}

/**
 * 풍등 하나: 그 얼굴 위에서 떠오른다. 폭을 재서 하늘 판 안쪽으로 밀어 넣고(가장자리 얼굴이면 안쪽으로), 꼬리는 얼굴 쪽을 가리킨다
 */
function LanternBubble({
  lantern,
  onHold,
}: {
  lantern: Lantern;
  /** 길게 누름(신고·국장 조치). 없으면 누를 수 없다 */
  onHold?: ((l: Lantern) => void) | undefined;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const press = useHold(lantern, onHold);
  const [place, setPlace] = useState<{ left: number; tail: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const w = el.offsetWidth;
    const W = parent.clientWidth;
    const left = Math.min(
      Math.max(lantern.x - w / 2, LANTERN_EDGE),
      Math.max(LANTERN_EDGE, W - w - LANTERN_EDGE),
    );
    setPlace({ left, tail: Math.min(Math.max(lantern.x - left, 14), w - 14) });
  }, [lantern.x]);
  return (
    <span
      ref={ref}
      data-lantern={lantern.from}
      {...press}
      className={cn(
        "sd-lantern absolute w-max max-w-[calc(100%-12px)] select-none break-keep rounded-2xl bg-amber-100/90 px-3 py-1.5 text-center text-slate-900 text-sm shadow-[0_0_24px_rgba(255,214,140,0.45)]",
        onHold && "pointer-events-auto [-webkit-touch-callout:none]",
      )}
      style={{
        left: place ? place.left : lantern.x,
        bottom: `${0.75 + lantern.lane * 2.75}rem`,
        visibility: place ? undefined : "hidden",
      }}
    >
      {lantern.hill !== undefined && (
        <span
          data-lantern-hill={lantern.hill}
          className="mr-1.5 font-semibold text-[10px] text-slate-600"
        >
          {lantern.hill}번 언덕
        </span>
      )}
      {lantern.text}
      {/* 꼬리: 말한 얼굴 쪽 */}
      <span
        aria-hidden="true"
        className="absolute top-full size-0 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[7px] border-t-amber-100/90"
        style={{ left: place?.tail ?? 14 }}
      />
    </span>
  );
}

/**
 * 방 입장 신분증 제시 틀의 작은 글: 무엇을 위해 내는지와 남에게 무엇이 보이는지(docs/36 11-23 ① 사람·고른 별).
 * 얼굴·이름은 등록증의 공개 열쇠에서, 응모했는지는 봉인 전부터, 고른 별은 봉인(마감) 뒤에 보인다
 */
export const ROOM_PASS_NOTE =
  "언덕에 올라 같은 회차를 기다리는 우주인들과 이야기하기 위한 제시예요. 다른 우주인에게는 등록증의 얼굴과 이름, 예측했는지가 보이고, 마감 뒤에는 고른 별도 보여요.";
/** 장부 등록이 아직 없는 등록증으로 방에서 처음 제시할 때(등록 증명 서명) */
export const ROOM_REGISTER_NOTE =
  "언덕에 오르려면 먼저 우주국 장부에 우주인으로 올라야 해요. 장부는 누구나 볼 수 있어요.";

/** 별똥별이 하늘에 머무는 시간(ms, globals.css sd-room-meteor와 같다) */
export const METEOR_MS = 2400;
/**
 * 묶은 응원(서버가 1초마다 한 소식)을 펼치는 시간(ms)과 한 묶음에서 띄우는 별똥별 수. 한꺼번에 몰리지 않게 이 시간에
 * 고르게 나눠 띄운다. 별똥별이 이보다 많이 와도 하늘이 가득 차 보일 뿐이라 이만큼만
 */
export const CHEER_SPREAD_MS = 1000;
export const CHEER_METEORS_MAX = 5;

interface Spark {
  key: string;
  kind: "twinkle" | "meteor";
  to: string | null;
  x: number;
  /** 별똥별만: 출발점 세로 자리(0~1)와 기울기(도). 가로 x와 따로 뽑는다 */
  y: number;
  tilt: number;
}

/**
 * 방 안의 관측 연출. 방은 카운트다운·진행 줄 때문에 0.25초마다 다시 그려지는데, 연출 하늘까지 따라 그리면 휴대폰 관측이
 * 버벅였다(2026-11-02). 연출은 받은 값(기록·예측서·시계)이 같으면 제 시계로만 움직인다
 */
const LiveDraw = memo(DrawView);

/** 방 안 시계: 서버 시각에 맞춘다 */
function roomClock(client: RoomClient, base: Clock): Clock {
  return { now: () => client.serverNow(), after: base.after.bind(base) };
}

export function RoomView({
  services,
  round,
  record,
  ticket,
  onEnter,
  onHome,
  guide,
  api = serverApi() as string,
  clock: device = realClock,
}: {
  services: Services;
  round: number;
  /** 서버 주소(시험이 흉내 서버를 넣는다). 기본은 빌드에 들어간 서버 주소 */
  api?: string;
  /**
   * 기기 시계(풍등 차례·사라짐, 별똥별, 다시 연결 기다림). 기본은 realClock, 시험은 ManualClock을 넣어
   * 정확한 순간에 일으킨다
   */
  clock?: Clock;
  /** 머리(장소·회차) 아래에 둘 관측 방송 안내(지금 회차 화면만) */
  guide?: React.ReactNode;
  record: RoundRecord | null | undefined;
  ticket: Ticket | undefined;
  /** 다음 회차 응모(추첨 연출이 끝난 뒤에만 보인다) */
  onEnter: () => void;
  /** 메뉴 줄이 없는 휴대폰: 머리 줄 왼쪽 「홈」(추첨 화면 DrawView와 같은 모양) */
  onHome?: (() => void) | undefined;
}) {
  const client = useMemo(() => new RoomClient(api, round), [api, round]);
  const clock = useMemo(() => roomClock(client, device), [client, device]);
  const schedule = services.ledger.schedule;
  const times = roundTimes(schedule, round);
  const drawAt = drandTime(drandRoundForClose(times.closesAt));
  const showStart = drawAt * 1000 + LIVE_LEAD_MS;
  const showLength = useMemo(
    () =>
      record
        ? planRoulette(drawOrder(record), LIVE_ROULETTE_TIMING).totalMs
        : 46_000,
    [record],
  );

  const [people, setPeople] = useState<Map<string, RoomPerson>>(new Map());
  const [watchers, setWatchers] = useState(0);
  /**
   * 언덕 나누기(docs/36 11-56): 내가 보는 언덕 번호, 언덕 수, 관측지 전체 얼굴 수. 예전 서버는 보내지 않으므로 언덕 하나로
   * 본다(얼굴 수는 내 언덕의 얼굴로 센다)
   */
  const [hillNo, setHillNo] = useState(1);
  const [hills, setHills] = useState(1);
  const [allFaces, setAllFaces] = useState<number | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [pass, setPass] = useState<string | null>(
    () => savedPass(round)?.pass ?? null,
  );
  const [picks, setPicks] = useState<RoomPicks | null>(null);
  const [lanterns, setLanterns] = useState<Lantern[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [closed, setClosed] = useState(false);
  /** 서버에서 언덕 소식(hello)을 받았는지(받기 전에는 언덕이 비었는지 모른다) */
  const [heard, setHeard] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState(() => client.serverNow());
  const order = useRef<string[]>([]);
  /** 떠 있는 풍등(길 고르기용, 상태와 같은 값) */
  const lanternsRef = useRef<Lantern[]>([]);
  /** 풍등 자리 예약(띄울 시각과 가로 자리) */
  const slots = useRef<{ x: number; at: number }[]>([]);
  const skyRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------- 관측이 끝난 뒤(docs/36 11-44)

  /** 관측 연출이 끝나는 때(서버 ms) */
  const showEnd = showStart + showLength;
  /** 내 하늘의 당첨 축하 연출(언덕의 표지는 그 뒤에 붙는다) */
  const myPlan = useMemo(() => {
    const rank = record && ticket ? myRank(record, ticket) : null;
    if (!record || !ticket || !rank) return null;
    const order = drawOrder(record);
    return celebrationPlan(
      rank,
      ticket.numbers.filter(
        (n) => order.slice(0, 6).includes(n) || (rank === 2 && order[6] === n),
      ),
    );
  }, [record, ticket]);
  /** 언덕 위 얼굴에 등수 표지가 붙는 때(서버 ms) */
  const marksAt = showEnd + marksDelay(myPlan);
  const ranks = useMemo(
    () => hillRanks(record, picks?.byPerson),
    [record, picks],
  );
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  /** 내가 관측 뒤에 말했는지(했으면 말하기 칸 자리표시를 되돌린다) */
  const [mySpoke, setMySpoke] = useState(false);
  /** 스트림 소식을 받는 함수가 늘 지금 값을 보게 */
  const live = useRef({ showEnd, marksAt, record });
  live.current = { showEnd, marksAt, record };
  /**
   * 스트림에서 받은 언덕 소식(나·얼굴·고른 별). 인사·봉인 소식과 말이 한 덩이로 오면 다시 그리기 전에 말을 받으므로
   * 상태와 따로 받은 그 자리에서 고친다
   */
  const heardRef = useRef<{
    me: string | null;
    pubs: Map<string, string>;
    byPerson: Record<string, number[]>;
    /** 내가 보는 언덕, 언덕 수, 내가 국장인지(국장은 모든 언덕의 말을 받는다) */
    hill: number;
    hills: number;
    director: boolean;
  }>({
    me: null,
    pubs: new Map(),
    byPerson: {},
    hill: 1,
    hills: 1,
    director: false,
  });
  /** 관측 뒤에 이미 말한 사람(이 화면이 받은 것 기준) */
  const spokeAfter = useRef(new Set<string>());
  /** 앞 소감이 걷히는 때(서버 ms) */
  const speechEnd = useRef(0);

  /**
   * 말이 오면: 관측 뒤 1~3등의 첫 말이면 소감으로 크게, 아니면 풍등. 다른 언덕의 말(서버가 1~3등 말만 모든 언덕에 건넨다)은
   * 소감일 때만 띄운다. 국장은 모든 언덕의 말을 풍등으로 보고, 언덕이 둘 이상이면 언덕 번호를 붙인다
   */
  const said = (e: Extract<RoomEvent, { type: "say" }>) => {
    const { id, from, text, at } = e;
    const v = live.current;
    const h = heardRef.current;
    if (e.pub) h.pubs.set(from, e.pub);
    if (e.picks) h.byPerson[from] = e.picks;
    const elsewhere = e.hill !== undefined && e.hill !== h.hill && !h.director;
    const hill = h.director && h.hills > 1 ? e.hill : undefined;
    const after = at >= v.showEnd;
    const chosen = h.byPerson[from];
    const rank = speechRank({
      after,
      rank: chosen ? hillRanks(v.record, { [from]: chosen }).get(from) : null,
      spokeBefore: spokeAfter.current.has(from),
    });
    if (after) {
      spokeAfter.current.add(from);
      if (from === h.me) setMySpoke(true);
    }
    if (!rank) {
      if (!elsewhere) launch(id, from, text, hill);
      return;
    }
    const now = client.serverNow();
    const start = speechAt(now, v.marksAt, speechEnd.current);
    speechEnd.current = start + SPEECH_MS;
    const lantern: Lantern = {
      key: `${id}-speech`,
      id,
      from,
      text,
      x: 0,
      lane: 0,
      at: start,
    };
    setSpeeches((s) => [
      ...s.filter((x) => x.at + SPEECH_MS > now),
      { lantern, rank, pub: h.pubs.get(from) ?? null, at: start },
    ]);
  };

  // 시각(0.25초마다): 카운트다운·진행 상태
  useEffect(() => {
    const t = window.setInterval(() => setNow(client.serverNow()), 250);
    return () => window.clearInterval(t);
  }, [client]);

  // 스트림: 들어오면 얼굴(표가 있으면), 끊기면 2초 뒤 다시
  // biome-ignore lint/correctness/useExhaustiveDependencies: 표가 바뀔 때만 다시 연결
  useEffect(() => {
    let alive = true;
    let retry = () => {};
    const onEvent = (e: RoomEvent) => {
      if (e.type === "hello") {
        heardRef.current = {
          me: e.me,
          pubs: new Map(e.people.map((p) => [p.id, p.pub])),
          byPerson: { ...(e.picks?.byPerson ?? {}) },
          hill: e.hill ?? 1,
          hills: e.hills ?? 1,
          director: e.people.some((p) => p.id === e.me && p.director === true),
        };
        setMe(e.me);
        setPeople(new Map(e.people.map((p) => [p.id, p])));
        order.current = e.people.map((p) => p.id);
        setWatchers(e.watchers);
        setHillNo(e.hill ?? 1);
        setHills(e.hills ?? 1);
        setAllFaces(e.faces ?? null);
        setPicks(e.picks);
        setHeard(true);
        setProblem(null);
      } else if (e.type === "join") {
        setPeople((m) => new Map(m).set(e.person.id, e.person));
        // 봉인 뒤에 언덕에 오른 사람의 고른 별(봉인 소식에는 없다)
        const chosen = e.person.picks;
        heardRef.current.pubs.set(e.person.id, e.person.pub);
        if (chosen) heardRef.current.byPerson[e.person.id] = chosen;
        if (chosen)
          setPicks((p) =>
            p
              ? { ...p, byPerson: { ...p.byPerson, [e.person.id]: chosen } }
              : p,
          );
        order.current = [
          ...order.current.filter((i) => i !== e.person.id),
          e.person.id,
        ];
      } else if (e.type === "leave" || e.type === "kicked") {
        setPeople((m) => {
          const next = new Map(m);
          next.delete(e.id);
          return next;
        });
        if (e.type === "kicked" && e.id === me) setPass(null);
      } else if (e.type === "watchers") {
        setWatchers(e.count);
        if (e.hills !== undefined) {
          heardRef.current.hills = e.hills;
          setHills(e.hills);
        }
        if (e.faces !== undefined) setAllFaces(e.faces);
      } else if (e.type === "sealed") {
        heardRef.current.byPerson = {
          ...heardRef.current.byPerson,
          ...e.picks.byPerson,
        };
        setPicks(e.picks);
      } else if (e.type === "say") said(e);
      else if (e.type === "hide") {
        lanternsRef.current = lanternsRef.current.map((x) =>
          x.id === e.id ? { ...x, hidden: true } : x,
        );
        setLanterns(lanternsRef.current);
        setSpeeches((s) =>
          s.map((x) =>
            x.lantern.id === e.id
              ? { ...x, lantern: { ...x.lantern, hidden: true } }
              : x,
          ),
        );
      } else if (e.type === "cheer") spark(e.kind, e.to);
      else if (e.type === "cheers") cheerBatch(e.meteor, e.twinkle);
      else if (e.type === "closed") setClosed(true);
    };
    const open = () => {
      if (!alive) return;
      void client.listen(pass, onEvent, (err) => {
        if (!alive) return;
        if (err && err.status === 401 && pass) {
          setPass(null);
          return;
        }
        if (
          err &&
          (err.status === 409 || err.status === 410 || err.status === 404)
        ) {
          setProblem(err.message);
          if (err.status === 410) setClosed(true);
          return;
        }
        retry = device.after(2000, open);
      });
    };
    open();
    return () => {
      alive = false;
      retry();
      client.close();
    };
  }, [client, pass]);

  const xOf = (id: string) => {
    const i = order.current.indexOf(id);
    const shown = Math.min(order.current.length, FACES);
    if (i < 0 || i >= FACES) return 0.15 + Math.random() * 0.7;
    return (i + 0.5) / Math.max(shown, 1);
  };

  /** 말한 얼굴의 가로 자리(하늘 판 기준 px). 얼굴이 언덕에 보이지 않으면(+n) 하늘 가운데쯤 아무 자리 */
  const faceX = (id: string): number => {
    const sky = skyRef.current;
    const width = sky?.clientWidth ?? 360;
    const face = document.querySelector<HTMLElement>(`[data-face="${id}"]`);
    if (!sky || !face) return width * (0.2 + Math.random() * 0.6);
    const s = sky.getBoundingClientRect();
    const f = face.getBoundingClientRect();
    return f.left + f.width / 2 - s.left;
  };

  const launch = (id: string, from: string, text: string, hill?: number) => {
    const key = `${id}-${Math.random()}`;
    const x = faceX(from);
    const now = device.now();
    // 모두 같은 줄에서 같은 빠르기로 떠오르므로, 가로로 가까운 풍등이 한 칸 위로 비켜날 때까지만 기다렸다 띄운다
    // (기다리는 중인 풍등도 자리를 잡아 둔다). 그래서 위아래로도 옆으로도 겹치지 않는다
    const near = slots.current.filter(
      (s) => s.at > now - LANTERN_CLEAR_MS && Math.abs(s.x - x) < LANTERN_GAP,
    );
    const at = Math.max(now, ...near.map((s) => s.at + LANTERN_CLEAR_MS));
    slots.current = [
      ...slots.current.filter((s) => s.at > now - LANTERN_CLEAR_MS),
      { x, at },
    ];
    device.after(at - now, () => {
      const next = [
        ...lanternsRef.current.filter((l) => l.from !== from),
        { key, id, from, text, x, lane: 0, at, ...(hill ? { hill } : {}) },
      ].slice(-LANTERNS);
      lanternsRef.current = next;
      setLanterns(next);
      device.after(LANTERN_MS, () => {
        lanternsRef.current = lanternsRef.current.filter((l) => l.key !== key);
        setLanterns(lanternsRef.current);
      });
    });
  };

  const spark = (kind: "twinkle" | "meteor", to: string | null) => {
    const key = `${kind}-${Math.random()}`;
    setSparks((s) =>
      [
        ...s,
        {
          key,
          kind,
          to,
          x: to ? xOf(to) : Math.random(),
          y: Math.random(),
          tilt: 10 + Math.random() * 28,
        },
      ].slice(-12),
    );
    device.after(kind === "meteor" ? METEOR_MS : 2200, () =>
      setSparks((s) => s.filter((x) => x.key !== key)),
    );
  };

  /** 묶은 응원을 CHEER_SPREAD_MS에 고르게 펼친다(첫 것은 바로) */
  const cheerBatch = (meteor: number, twinkle: Record<string, number>) => {
    const meteors = Math.min(meteor, CHEER_METEORS_MAX);
    const faces = Object.keys(twinkle).slice(0, FACES);
    // 별똥별과 반짝임을 번갈아(한쪽이 몰리지 않게)
    const all: [kind: "twinkle" | "meteor", to: string | null][] = [];
    for (let i = 0; i < Math.max(meteors, faces.length); i++) {
      if (i < meteors) all.push(["meteor", null]);
      const to = faces[i];
      if (to !== undefined) all.push(["twinkle", to]);
    }
    all.forEach(([kind, to], i) => {
      if (i === 0) spark(kind, to);
      else
        device.after((i * CHEER_SPREAD_MS) / all.length, () => spark(kind, to));
    });
  };

  // ---------------------------------------------------------------- 말하기·신분증

  const key = services.wallet.loadKey();
  const id = useIdPresent(services);
  /** 미리 받은 한 번 쓰는 값과 서버가 정한 기한(서버 시각 ms) */
  const [nonce, setNonce] = useState<{
    nonce: string;
    expiresAt: number;
  } | null>(null);
  const [registeringNow, setRegisteringNow] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendNote, setSendNote] = useState<string | null>(null);
  /** 앱 안 브라우저에서 패스키 서명이 실패했으면 그 앱 이름(움직임 줄이기: 신분증 제시 틀 없이 바로 실패한다) */
  const [failApp, setFailApp] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * 말하는 동안 키보드 위에 담기(docs/36 11-61): 입력 칸에 초점이 있고 키보드가 올라온 동안만 관측지를 키보드 위 칸에
   * 하늘 → 얼굴 한 줄 → 입력 칸으로 다시 놓는다. 나머지(머리 줄·상태 줄·언덕 머리·아래 칸)는 그동안 숨긴다
   */
  const typing = useTypingFit();
  const fit = typing.fit;
  /** 말하는 동안 누르는 단추가 입력 칸 초점을 빼앗지 않게(빼앗기면 키보드가 내려가 칸이 원래대로 돌아간다) */
  const keepFocus = fit
    ? (e: React.MouseEvent) => e.preventDefault()
    : undefined;
  /** 평소 관측지 높이: 말하는 동안 칸이 fixed로 빠져도 페이지 길이·스크롤 자리가 그대로 남게 */
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyHeight = useRef(0);
  useLayoutEffect(() => {
    if (!fit && bodyRef.current)
      bodyHeight.current = bodyRef.current.offsetHeight;
  });
  /** 이 기기 등록증의 서명자(미리 만들어 둔다, 누름 직후 바로 패스키를 열게) */
  const signerRef = useRef<EntrantSigner | null>(null);
  /** 방에서 막 등록·제시를 마쳤으면 이어서 방 입장 신분증 제시로 */
  const [continueAfterSetup, setContinueAfterSetup] = useState(false);
  const setup = useAstronautSetup(services, () => setContinueAfterSetup(true));

  // 등록증이 있고 표가 없으면 한 번 쓰는 값을 미리 받아 둔다(누른 그 순간 바로 패스키를 열게, 1분 30초마다 새로)
  const hasKey = key !== null;
  useEffect(() => {
    if (!hasKey || pass || closed) return;
    let alive = true;
    const fetchNonce = () =>
      client
        .challenge()
        .then((c) => alive && setNonce(c))
        .catch(() => alive && setNonce(null));
    void fetchNonce();
    const t = window.setInterval(fetchNonce, 90_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [client, hasKey, pass, closed]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 등록증이 생기거나 바뀔 때만
  useEffect(() => {
    signerRef.current = null;
    if (!key) return;
    let alive = true;
    void services.wallet.signerFor(key).then((s) => {
      if (alive) signerRef.current = s;
    });
    return () => {
      alive = false;
    };
  }, [hasKey, services]);

  /**
   * 장부에 아직 등록이 없는 등록증(방에서 막 발급했고 아직 응모하지 않음)이면, 신분증 제시 누름 안에서 등록 증명에 서명하고
   * 장부 등록을 올린다(docs/36 11-21: 우주인 등록은 패스키 하나, 장부 등록은 첫 응모나 방에서). 방은 등록한 우주인만
   * 말할 수 있어서다. 패스키 창은 누름 하나에 하나만 열 수 있어 방 입장 제시는 등록이 끝난 뒤 한 번 더 누른다
   */
  const registerFirst = async (k: KeyInfo): Promise<"ready" | "new" | null> => {
    const { ledger, wallet } = services;
    if (await ledger.isRegistered(k.pub)) return "ready";
    await registering(services, k)?.catch(() => null);
    if (await ledger.isRegistered(k.pub)) return "ready";
    if (!wallet.loadProof(k.pub)) {
      const signer = signerRef.current ?? (await wallet.signerFor(k));
      const proof = await id
        .run(
          () =>
            signer.sign(
              registrationProofMessage({
                v: 1,
                credentialId: k.credentialId,
                pub: k.pub,
              }),
            ),
          {
            verb: "제시",
            note: ROOM_REGISTER_NOTE,
            pub: k.pub,
            tap: true,
            done: `${residentPhrase(astronautOf(k.pub))} 님, 장부에 등록할게요.`,
          },
        )
        .catch((err) => {
          setSendNote(errorText(err, "신분증을 확인"));
          setFailApp(inAppFailed(err, navigator.userAgent));
          return null;
        });
      if (!proof) return null;
      wallet.saveProof(k.pub, proof);
    }
    setRegisteringNow(true);
    try {
      const at = await ensureRegistered(services, k);
      if (at === null) setSendNote("장부에 등록하지 못했습니다.");
      return at === null ? null : "new";
    } catch (err) {
      setSendNote(errorText(err, "등록"));
      return null;
    } finally {
      setRegisteringNow(false);
    }
  };

  /** 참여 단추(또는 흐린 내 자리)를 누름: 표가 없으면 신분증 제시(등록증 없으면 우주인 등록 신청서) */
  const ensurePass = async (): Promise<string | null> => {
    if (pass) return pass;
    if (!key) {
      void setup.create();
      return null;
    }
    setSendNote(null);
    setFailApp(null);
    const registered = await registerFirst(key);
    if (!registered) return null;
    // 한 번 쓰는 값과 서명자는 미리 준비해 둔다: 등록증을 누른 그 순간 사이에 기다림 없이 패스키를 연다(아이폰 사파리 누름 규칙).
    // 방금 장부 등록을 올렸으면 그사이 미리 받은 값이 낡았을 수 있어 새로 받는다. 기한이 다 됐어도 새로 받는다:
    // 휴대폰은 다른 앱에 다녀오는 동안 탭의 타이머가 멈춰 1분 30초마다 새로 받기가 밀린다(2026-11-03 클로즈 베타 점검,
    // 낡은 값으로 내면 서버가 403을 돌려 「신분증 확인이 맞지 않아」로 보였다)
    const fresh =
      registered === "ready" ? freshNonce(nonce, client.serverNow()) : null;
    const used: string =
      fresh ?? (await client.challenge().then((c) => c.nonce));
    setNonce(null);
    const signer = signerRef.current ?? (await services.wallet.signerFor(key));
    // 신분증 제시 틀(입구·응모와 같은 부품): 오버레이 → "패스키로 신분증을 제시해 주세요." → 등록증이 올라와 기다림 →
    // 누르거나 밀어 올리면 그 동작 직후 패스키 → 확인 → 인사 → 등록증이 내려가고 걷힘
    const present = (value: string) =>
      id.run(() => client.issuePass(signer, value), {
        verb: "제시",
        note: ROOM_PASS_NOTE,
        pub: key.pub,
        tap: true,
        done: `${residentPhrase(astronautOf(key.pub))} 님, 어서 오세요.`,
      });
    // 패스키 창에서 오래 머물러 값의 기한이 지났으면(409) 알리지 않고 새 값으로 한 번 더 제시한다.
    // 서명은 새 값에 다시 해야 하므로 등록증을 한 번 더 내민다(패스키 창은 누름 하나에 하나)
    const got = await present(used)
      .catch(async (err) => {
        if (!nonceExpired(err)) throw err;
        return present((await client.challenge()).nonce);
      })
      .catch((err) => {
        setSendNote(errorText(err, "언덕에 오르지", "언덕에 오르지 않았어요"));
        setFailApp(inAppFailed(err, navigator.userAgent));
        return null;
      });
    if (!got) return null;
    setPass(got.pass);
    setMe(got.id);
    // 쓰던 말 그대로 입력 칸으로
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return got.pass;
  };

  // 방에서 막 등록(발급)·제시를 마쳤으면 이어서 방 입장 신분증 제시(등록증을 누르면 패스키)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 등록이 끝난 순간 한 번
  useEffect(() => {
    if (!continueAfterSetup || !key || pass) return;
    setContinueAfterSetup(false);
    void ensurePass();
  }, [continueAfterSetup, hasKey, pass]);

  const send = async () => {
    const text = draft.replace(/\s+/g, " ").trim();
    if (!text || !pass) return;
    try {
      await client.say(pass, text);
      setDraft("");
      setSendNote(null);
    } catch (err) {
      setSendNote(errorText(err, "말을 보내지"));
    }
  };

  const cheer = (kind: "twinkle" | "meteor", to: string | null) => {
    if (!pass) return void ensurePass();
    // 보내지 못하면(너무 잦음·표 만료 등) 말 보내기처럼 짧게 알린다(예전에는 조용히 삼켜 왜 안 보이는지 알 수 없었다)
    client
      .cheer(pass, kind, to)
      .then(() => setSendNote(null))
      .catch((err) =>
        setSendNote(
          errorText(
            err,
            kind === "meteor" ? "별똥별을 보내지" : "반짝임을 보내지",
          ),
        ),
      );
  };

  // ---------------------------------------------------------------- 신고·국장 조치

  /** 길게 누른 풍등(그 말과 말한 사람). 국장이면 조치 서명에 쓸 한 번 쓰는 값을 미리 받아 둔다 */
  const [menu, setMenu] = useState<{
    lantern: Lantern;
    nonce: string | null;
  } | null>(null);
  const director = me !== null && people.get(me)?.director === true;
  const openMenu = (l: Lantern) => {
    navigator.vibrate?.(15);
    setMenu({ lantern: l, nonce: null });
    if (director)
      void client
        .challenge()
        .then((c) =>
          setMenu((m) =>
            m?.lantern.key === l.key ? { ...m, nonce: c.nonce } : m,
          ),
        )
        .catch(() => {});
  };
  const report = async (l: Lantern) => {
    setMenu(null);
    if (!pass) return;
    try {
      await client.report(pass, l.id);
      setSendNote("신고했어요.");
    } catch (err) {
      setSendNote(errorText(err, "신고"));
    }
  };
  const moderate = async (action: "hide" | "kick") => {
    const m = menu;
    const signer = signerRef.current;
    setMenu(null);
    if (!m?.nonce || !signer) return;
    try {
      await client.moderate(
        signer,
        m.nonce,
        action,
        action === "hide" ? m.lantern.id : m.lantern.from,
      );
    } catch (err) {
      // 값의 기한이 지났으면 알리지 않고 새 값을 받아 조치 창을 다시 연다(서명은 다시 눌러야 한다)
      if (nonceExpired(err)) {
        openMenu(m.lantern);
        return;
      }
      setSendNote(
        errorText(
          err,
          action === "hide" ? "가리지" : "내보내지",
          "조치하지 않았어요",
        ),
      );
    }
  };

  // ---------------------------------------------------------------- 진행 상태

  const toShow = showStart - now;
  const phase = roomPhase(now, times.entryDeadline, showStart, showLength);
  const title = roundTitle(schedule, round);
  const statusLine =
    phase === "open"
      ? // 마감 전에 일찍 온 사람도 언제 관측하는지 알게(2026-11-03 클로즈 베타 점검)
        `지금 ${title} 예측을 받고 있습니다. 관측까지 ${formatLeft(toShow / 1000)}`
      : phase === "closed"
        ? `${title} 예측을 마감했습니다. 관측까지 ${formatLeft(toShow / 1000)}`
        : phase === "announce" || phase === "count"
          ? `이제 ${title} 관측을 시작하겠습니다.`
          : phase === "live"
            ? `${title} 관측 중입니다.`
            : closed
              ? `${title} 관측을 마쳤습니다.`
              : `${title} 관측이 끝났습니다.`;

  // 로컬 데모 바로가기로 왔으면: 이 방의 추첨이 끝난 뒤 잠깐 머물다(결과 이야기) 다음 추첨 회차 방으로
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계가 바뀔 때만
  useEffect(() => {
    if (phase !== "after") return;
    let follow = false;
    try {
      follow = sessionStorage.getItem(ROOM_FOLLOW_KEY) === "1";
    } catch {
      follow = false;
    }
    if (!follow) return;
    const t = window.setInterval(() => {
      const next = nextRoomRound(services, client.serverNow());
      if (next === null || next <= round) return;
      const times = roundTimes(services.ledger.schedule, next);
      const nextShow =
        drandTime(drandRoundForClose(times.closesAt)) * 1000 + LIVE_LEAD_MS;
      // 다음 추첨 2분 전이 되면 옮긴다(그 전에는 이 방에서 결과 이야기를 나눈다)
      if (nextShow - client.serverNow() < 120_000)
        window.location.replace(`/stardraw/rounds#draw-${next}`);
    }, 2000);
    return () => window.clearInterval(t);
  }, [phase, round]);

  const visible = order.current.filter((i) => people.has(i));
  const seat = roomSeat({
    pass: pass !== null,
    hasKey,
    others: visible.filter((i) => i !== me).length,
    over: phase === "after",
    heard,
  });
  const closeIn = drawAt * 1000 + ROOM_CLOSE_AFTER_MS - now;
  /**
   * 관측지에 있는 사람 수: 언덕 위(얼굴) + 언덕 아래(대화 표 없이 보는 연결). 언덕이 둘 이상이면 얼굴은 모든 언덕의 수(서버가
   * 1초마다 알린다), 하나면 내 언덕의 얼굴(드나듦이 바로 보인다)
   */
  const crowd =
    (hills > 1 && allFaces !== null ? allFaces : people.size) + watchers;
  /** 관측이 끝나고 결과(와 내 축하 연출)가 다 나온 뒤: 얼굴마다 등수 표지, 가장 높은 등수는 금빛 테두리 */
  const marked = phase === "after" && now >= marksAt;
  const best = marked ? bestRank(ranks, visible) : null;
  // 말하는 동안은 얼굴 한 줄(칸 너비 max-w-xl 576px에서 좌우 여백 32px를 뺀 만큼, 넘치면 +n)
  const faces = hillFaces(
    visible,
    marked ? ranks : NO_RANKS,
    fit
      ? rowFaceLimit(Math.min(fit.width, 576) - 32, visible.length, FACES)
      : FACES,
  );
  const speech = speeches.find(
    (s) => now >= s.at && now < s.at + SPEECH_MS && !s.lantern.hidden,
  );
  /** 내가 1~3등이고 관측 뒤 아직 말하지 않았으면 말하기 칸이 소감을 청한다 */
  const myTop = me !== null ? ranks.get(me) : undefined;
  const invite = marked && !mySpoke && myTop !== undefined && myTop <= 3;
  const more = visible.length - faces.length;
  const lit = new Set<number>();
  // 방송 중인 장면의 켜진 별(그 별을 고른 사람의 얼굴이 빛난다)
  if (record && (phase === "live" || phase === "after")) {
    const plan = planRoulette(drawOrder(record), LIVE_ROULETTE_TIMING);
    for (const s of plan.stops)
      if (now - showStart >= s.at + LIVE_ROULETTE_TIMING.spinMs)
        lit.add(s.target);
  }
  const glowing = (pid: string) =>
    (picks?.byPerson[pid] ?? []).some((n) => lit.has(n));
  const popular = picks
    ? Object.entries(picks.counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n, c]) => `${starOf(Number(n)).ko} ${c}명`)
    : [];

  return (
    <section
      aria-label={`관측지 · ${title} 관측`}
      data-room={round}
      style={fit ? { minHeight: bodyHeight.current } : undefined}
    >
      {/* 말하는 동안(fit)은 이 칸이 키보드 위 보이는 칸(visualViewport)에 fixed로 놓인다(docs/36 11-61) */}
      <div
        ref={bodyRef}
        data-room-typing={fit ? "" : undefined}
        className={cn(
          "flex flex-col gap-3",
          fit &&
            "fixed inset-x-0 z-[55] mx-auto max-w-xl gap-2 bg-[#070d19] px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2",
        )}
        style={fit ? { top: fit.top, height: fit.height } : undefined}
      >
        {/* 머리 줄: 가운데 장소 이름 「관측지」, 왼쪽은 메뉴가 없는 휴대폰만 「홈」(추첨 화면과 같은 자리·모양), 오른쪽은
          빈 칸. 양쪽 칸이 같은 너비라 「홈」이 없는 넓은 화면에서도 가운데가 어긋나지 않는다(docs/36 11-34) */}
        <div
          className={cn(
            "grid min-h-8 grid-cols-[1fr_auto_1fr] items-center gap-2",
            fit && "hidden",
          )}
        >
          <div className="justify-self-start">
            {onHome && (
              <div className="-ml-3">
                <MenuItem target="home" label="홈" onClick={onHome} />
              </div>
            )}
          </div>
          <h1 data-room-title className="font-bold text-lg">
            <PlaceLabel place="room">관측지</PlaceLabel>
          </h1>
          <span />
        </div>
        <p
          role="status"
          data-room-phase={phase}
          // 회차 이름은 따로 한 줄 두지 않고 상태 줄이 말한다(2026-11-03 사용자: 위쪽에 회차가 두 번 나와 자리를 차지했다)
          data-room-round={round}
          className={cn(
            "text-center break-keep font-semibold text-amber-100",
            fit && "hidden",
          )}
        >
          {statusLine}
        </p>

        {/* 하늘. 말하는 동안은 남은 높이를 다 차지하는 칸 안에서 min(가로, 남은 높이) 정사각형으로 가운데에 줄인다
          (하늘·풍등·별똥별·내 별 고리가 통째로 보이게). 관측 중이면 하늘 아래 공 줄·결과 칸은 정사각형 밖이라 잘린다.
          크기는 키보드 빠르기쯤(FX.typingFit)으로 부드럽게, 움직임 줄이기면 바로 */}
        <div
          className={cn(
            fit &&
              "flex min-h-0 flex-1 items-center justify-center [container-type:size]",
          )}
        >
          <div
            ref={skyRef}
            data-room-sky
            className={cn(
              "relative mx-auto transition-[width] duration-(--fit-ms) ease-(--fit-ease) motion-reduce:transition-none",
              fit && "aspect-square overflow-hidden rounded-xl",
            )}
            style={
              {
                width: fit ? "min(100cqw, 100cqh)" : "100%",
                "--fit-ms": `${FX.typingFit}ms`,
                "--fit-ease": EASE,
              } as React.CSSProperties
            }
          >
            {record && (phase === "live" || phase === "after") ? (
              <LiveDraw
                record={record}
                ticket={ticket}
                clock={clock}
                startedAt={showStart}
                timing={LIVE_ROULETTE_TIMING}
                label={title}
                embedded
              />
            ) : (
              <SkyBoard
                state={{
                  mode: "draw",
                  picked: ticket ? ticket.numbers : [],
                  focus: null,
                  lit: [],
                  bonus: null,
                }}
                label={`${title} 관측을 기다리는 하늘`}
                // 추첨 알림·카운트다운부터는 연출을 가리지 않게 누르기를 막는다
                info={phase === "open" || phase === "closed"}
              />
            )}
            {phase === "count" && (
              <div
                aria-live="assertive"
                data-room-countdown
                className="pointer-events-none absolute inset-0 grid place-items-center"
              >
                <span
                  key={Math.ceil(toShow / 1000)}
                  className="sd-room-count font-black text-8xl text-amber-50 tabular-nums"
                >
                  {Math.ceil(toShow / 1000)}
                </span>
              </div>
            )}
            {phase === "live" && !record && (
              <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white/75">
                곧 별이 빛납니다.
              </p>
            )}
            {/* 풍등: 얼굴에서 떠올라 하늘로 흐려진다. 칸은 하늘 정사각형만: 관측 중·뒤에는 이 칸 아래에 공 줄·결과 칸이
              붙어, 칸 전체에 띄우면 풍등이 결과 글 위에 겹쳤다(docs/36 11-68) */}
            <div
              aria-live="polite"
              data-room-lanterns
              className="pointer-events-none absolute inset-x-0 top-0 aspect-square max-h-full overflow-hidden"
            >
              {lanterns
                .filter((l) => !l.hidden)
                .map((l) => (
                  <LanternBubble
                    key={l.key}
                    lantern={l}
                    onHold={pass && l.from !== me ? openMenu : undefined}
                  />
                ))}
              {speech && (
                <SpeechBubble
                  key={speech.lantern.key}
                  speech={speech}
                  onHold={
                    pass && speech.lantern.from !== me ? openMenu : undefined
                  }
                />
              )}
              {sparks
                .filter((s) => s.kind === "meteor")
                .map((s) => (
                  <span
                    key={s.key}
                    data-room-meteor
                    className="sd-room-meteor absolute"
                    // 하늘 아무 데서나 오른쪽 아래로: 출발점의 가로·세로와 기울기를 따로 뽑는다. 예전에는 한 값으로 가로·세로를 함께
                    // 정해 늘 왼쪽 위 같은 대각선에서만 떨어졌다(2026-11-03 사용자). 넘치는 꼬리는 하늘 칸이 잘라 낸다
                    style={{
                      left: `${s.x * 60}%`,
                      top: `${4 + s.y * 40}%`,
                      transform: `rotate(${s.tilt}deg)`,
                    }}
                  >
                    <span className="sd-room-meteor-streak" />
                  </span>
                ))}
            </div>
          </div>
        </div>

        {popular.length > 0 && phase !== "after" && (
          <p
            className={cn("text-center text-white/55 text-xs", fit && "hidden")}
          >
            가장 많이 고른 별 · {popular.join(" · ")}
          </p>
        )}

        {/* 언덕: 모여 앉은 얼굴들 */}
        <div
          className={cn(
            "sd-room-hill relative -mx-4 px-4",
            fit ? "shrink-0 pt-2 pb-0" : "pt-6 pb-2",
          )}
          data-room-hill
        >
          {/* 언덕 머리: 관측지에 있는 사람 수(언덕 위 얼굴 + 언덕 아래에서 숨어 보는 사람). 나 혼자면 아래 「아직 언덕에…」가
            말하므로 두지 않는다(2026-11-02 사용자: 머리 줄보다 별자리 밑, 웅성거리는 우주인들 곁에 있어야 무슨 숫자인지 안다) */}
          {/* 언덕이 둘 이상일 때만 내가 보는 언덕 이름(docs/36 11-56). 하나면 아무것도 더하지 않는다 */}
          {hills > 1 && (
            <p
              data-room-hill-name={hillNo}
              className={cn(
                "pb-1 text-center font-semibold text-white/70 text-xs tabular-nums",
                fit && "hidden",
              )}
            >
              {hillNo}번 언덕
            </p>
          )}
          {crowd > 1 && (
            <p
              data-room-count={crowd}
              className={cn(
                "pb-2 text-center text-white/60 text-xs tabular-nums",
                fit && "hidden",
              )}
            >
              관측지에 {crowd}명이 있어요.
            </p>
          )}
          <div
            className={cn(
              "flex items-end justify-center gap-1.5",
              fit ? "flex-nowrap" : "flex-wrap",
            )}
          >
            {faces.map((pid) => {
              const p = people.get(pid) as RoomPerson;
              const a = astronautOf(fromBase64Url(p.pub));
              const twinkle = sparks.some(
                (s) => s.kind === "twinkle" && s.to === pid,
              );
              const rank = marked ? ranks.get(pid) : undefined;
              const top = rank !== undefined && rank === best;
              return (
                <div key={pid} className="relative">
                  <button
                    type="button"
                    data-face={pid}
                    data-face-entered={p.entered || undefined}
                    data-face-best={top || undefined}
                    aria-label={`${a.name}${p.entered ? ", 예측함" : ""}${rank ? `, ${RANK_LABEL[rank]}` : ""}${pid === me ? ", 나" : ""}`}
                    onClick={() => cheer("twinkle", pid)}
                    onMouseDown={keepFocus}
                    className={cn(
                      "sd-room-face relative overflow-hidden rounded-full border",
                      fit ? "size-9" : "size-12",
                      p.entered ? "border-amber-200/70" : "border-white/15",
                      pid === me && "ring-2 ring-sky-200/70",
                      // 표지가 붙으면 켜진 별 빛은 걷고 가장 높은 등수만 금빛으로
                      !marked && glowing(pid) && "sd-room-face-glow",
                      top && "sd-room-face-best",
                      twinkle && "sd-room-face-twinkle",
                    )}
                  >
                    <Avatar
                      face={a.face}
                      egg={a.egg}
                      label=""
                      className="size-full scale-125"
                    />
                    {p.director && (
                      <span className="absolute inset-x-0 bottom-0 bg-rose-500/80 text-[8px] text-white">
                        국장
                      </span>
                    )}
                  </button>
                  {rank && (
                    <span
                      aria-hidden="true"
                      data-face-rank={rank}
                      className={cn(
                        "sd-room-rank pointer-events-none absolute inset-x-0 -top-2 mx-auto w-max rounded-full px-1.5 font-bold text-[10px] leading-4 tabular-nums",
                        top
                          ? "bg-amber-300 text-slate-950"
                          : "bg-slate-800 text-amber-100 ring-1 ring-amber-200/40",
                      )}
                    >
                      {RANK_LABEL[rank]}
                    </span>
                  )}
                </div>
              );
            })}
            {more > 0 && (
              <span
                className={cn(
                  "grid place-items-center rounded-full border border-white/15 text-sm text-white/70",
                  fit ? "size-9" : "size-12",
                )}
              >
                +{more}
              </span>
            )}
          </div>
          {seat.hill && (
            <p
              className={cn(
                "pt-2 text-center text-sm text-white/50",
                fit && "hidden",
              )}
            >
              {seat.hill}
            </p>
          )}
        </div>

        {/* 관측이 끝난 뒤: 언덕에서 이야기할 수 있는 남은 시간(서버가 추첨 7분 뒤 닫는다) */}
        {phase === "after" && !closed && (
          <p
            data-room-closing
            className={cn(
              "-mt-2 text-center text-white/60 text-xs tabular-nums",
              fit && "hidden",
            )}
          >
            관측지가 닫히기까지 {formatLeft(closeIn / 1000)}
          </p>
        )}

        {/* 지금 내 자리: 숨어서 관측 중(남의 말은 보이지만 나는 보이지 않음) / 언덕에서 관측 중 */}
        {!closed &&
          (seat.joined ? (
            seat.badge && (
              <p
                data-room-seat="joined"
                className={cn("flex justify-center", fit && "hidden")}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-300/15 px-3 py-1 font-semibold text-sky-100 text-xs">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-sky-200"
                  />
                  {seat.badge}
                </span>
              </p>
            )
          ) : (
            <div
              data-room-seat="watching"
              className="sd-room-under -mx-4 -mt-3 flex flex-col items-center gap-2 px-4 pt-2 pb-4 text-center"
            >
              {/* 언덕 아래 어둠 속의 내 얼굴: 내 화면에만 흐리게(남에게는 보이지 않는다). 언덕에 오르면 위 줄로 옮겨 간다 */}
              <div
                data-face-pending
                role="img"
                aria-label="언덕 아래의 나, 다른 우주인에게 보이지 않음"
                className="sd-room-below relative size-12 overflow-hidden rounded-full border border-white/25 border-dashed"
              >
                {key ? (
                  <Avatar
                    face={astronautOf(key.pub).face}
                    egg={astronautOf(key.pub).egg}
                    label=""
                    className="size-full scale-125 opacity-30 grayscale"
                  />
                ) : (
                  <span className="grid size-full place-items-center text-white/40 text-xs">
                    나
                  </span>
                )}
              </div>
              {seat.badge && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-semibold text-white/80 text-xs">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full border border-white/60"
                  />
                  {seat.badge}
                </span>
              )}
              {seat.note && (
                <p className="text-balance break-keep text-sm text-white/70">
                  {seat.note}
                </p>
              )}
              {seat.join && (
                <button
                  type="button"
                  onClick={() => void ensurePass()}
                  disabled={setup.working !== null || registeringNow}
                  data-room-join={phase === "after" ? "plain" : "cta"}
                  // 관측이 끝난 뒤에는 평범한 단추: 아래 「별 6개 고르기」(다음 회차 예측)가 권장 단추다. 금색 단추 둘이
                  // 나란히 있어 눈이 어지러웠다(2026-11-03 사용자)
                  className={cn(
                    "w-full max-w-xs rounded-2xl py-2.5 font-bold text-sm disabled:opacity-50",
                    phase === "after"
                      ? "border border-white/20 bg-white/5 text-white/85 hover:bg-white/10"
                      : "sd-cta text-slate-950",
                  )}
                >
                  <PlaceLabel place="room">{seat.join}</PlaceLabel>
                </button>
              )}
              {seat.join && !hasKey && (
                <button
                  type="button"
                  onClick={() => void setup.recover()}
                  disabled={setup.working !== null}
                  className="text-sm text-white/70 underline underline-offset-2"
                >
                  이미 등록했어요 · 신분증 제시
                </button>
              )}
              {/* WebAuthn이 없는 브라우저: 누른 단추 바로 아래에 안내(입구와 같은 조각). 앱 안 브라우저에서 시도가 실패했으면
                같은 자리에 바깥 브라우저로 여는 안내(2026-11-03 사용자: 막지 말고 시도한 뒤 실패하면 안내) */}
              {seat.join && setup.blockedHere && (
                <div className="w-full max-w-xs" data-room-blocked>
                  <PasskeyBlockedNotice />
                </div>
              )}
              {seat.join &&
                !setup.blockedHere &&
                (setup.error?.inApp ?? failApp) && (
                  <div className="w-full max-w-xs" data-room-blocked>
                    <InAppTriedNotice
                      app={(setup.error?.inApp ?? failApp) as string}
                    />
                  </div>
                )}
            </div>
          ))}

        {/* 아래: 내가 하는 일(말하기·별똥별). 참여 전에는 위 참여 칸이 이 자리를 맡는다 */}
        {closed && <RoomClosedNotice now={now} onGo={onEnter} />}
        {closed || !seat.joined ? null : (
          <form
            className={cn("flex items-center gap-2", fit && "shrink-0")}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              ref={inputRef}
              aria-label="말하기"
              value={draft}
              maxLength={ROOM_TEXT_MAX * 2}
              onChange={(e) => {
                const v = e.target.value;
                if (roomCharCount(v) <= ROOM_TEXT_MAX) setDraft(v);
              }}
              onFocus={typing.onFocus}
              onBlur={typing.onBlur}
              placeholder={invite ? "입상 소감을 남겨 보세요" : "말하기"}
              // 휴대폰은 16px: 아이폰 사파리는 16px보다 작은 입력 칸에 초점이 가면 화면을 확대해 칸 맞춤이 어긋난다
              className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base placeholder:text-white/35 sm:text-sm"
              data-room-input
            />
            <button
              type="button"
              aria-label="별똥별 보내기"
              onClick={() => cheer("meteor", null)}
              onMouseDown={keepFocus}
              className="grid size-11 place-items-center rounded-full border border-white/15 text-lg"
            >
              ☄
            </button>
            <button
              type="submit"
              onMouseDown={keepFocus}
              className="rounded-2xl bg-amber-100 px-4 py-3 font-bold text-slate-900 text-sm"
            >
              보내기
            </button>
          </form>
        )}
        {registeringNow && (
          <p
            className={cn("text-center text-white/60 text-xs", fit && "hidden")}
          >
            {/* 장부는 응모를 받는 동안만 등록을 받는다(마감부터 추첨 몇 초 뒤 다음 회차가 열릴 때까지는 기다린다) */}
            {services.ledger.status().phase === "open"
              ? "장부에 우주인 등록을 올리고 있습니다."
              : "다음 회차 예측이 열리면 장부에 우주인 등록을 올립니다."}
          </p>
        )}
        {(sendNote ?? setup.error?.text) &&
          !(failApp ?? setup.error?.inApp) && (
            <p className="text-center text-rose-200 text-xs">
              {sendNote ?? setup.error?.text}
            </p>
          )}
        {problem && (
          <p
            className={cn("text-center text-white/60 text-sm", fit && "hidden")}
          >
            {problem}
          </p>
        )}

        {/* 관측(추첨 연출)이 끝나면 다음 회차 예측을 연다(2026-11-02 사용자). 관측지가 닫히기 전에도 언덕에서 이야기는 이어진다.
          닫히면 위 알림이 접수처로 옮기므로 이 칸은 걷는다 */}
        {phase === "after" && !closed && (
          <div
            data-room-next
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-center",
              fit && "hidden",
            )}
          >
            <span className="font-semibold">
              지금 {roundTitle(schedule, round + 1)} 예측을 받고 있어요.
            </span>
            <button
              type="button"
              onClick={onEnter}
              className="sd-cta w-full max-w-xs rounded-2xl py-3 font-bold text-slate-950"
            >
              <PlaceLabel place="desk">별 6개 고르기</PlaceLabel>
            </button>
          </div>
        )}

        {/* 관측 방송 안내(다음 회차 시각, 등록 안 한 사람의 「우주인 등록」)는 맨 아래에: 위쪽에 있으면 하늘을 아래로 밀고
          관측과 상관없는 다음 회차가 먼저 눈에 들어왔다(2026-11-03 사용자: 「불필요하니 없애거나 아래로」). 등록 단추가 있어
          없애지 않고 옮긴다 */}
        {guide && <div className={fit ? "hidden" : "contents"}>{guide}</div>}
      </div>

      {menu && (
        // 말하는 동안의 관측지 칸(z-[55])보다 위에
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4">
          <button
            type="button"
            aria-label="닫기"
            tabIndex={-1}
            onClick={() => setMenu(null)}
            className="absolute inset-0 bg-slate-950/50"
          />
          <div
            role="dialog"
            aria-label="말 다루기"
            className="relative flex w-full max-w-sm flex-col gap-2 rounded-3xl bg-slate-900 p-4 text-center"
            data-room-menu
          >
            <p className="break-keep px-2 py-1 text-sm text-white/80">
              “{menu.lantern.text}”
            </p>
            {director ? (
              <>
                <button
                  type="button"
                  disabled={!menu.nonce}
                  onClick={() => void moderate("hide")}
                  className="rounded-2xl bg-white/10 py-3 font-semibold disabled:opacity-40"
                >
                  가리기
                </button>
                <button
                  type="button"
                  disabled={!menu.nonce}
                  onClick={() => void moderate("kick")}
                  className="rounded-2xl bg-rose-500/80 py-3 font-semibold disabled:opacity-40"
                >
                  내보내기
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void report(menu.lantern)}
                className="rounded-2xl bg-white/10 py-3 font-semibold"
              >
                신고
              </button>
            )}
            <button
              type="button"
              onClick={() => setMenu(null)}
              className="py-2 text-sm text-white/60"
            >
              닫기
            </button>
          </div>
        </div>
      )}
      <IdPresentView services={services} id={id} />
      {/* 등록하지 않은 사람: 참여 단추를 누르면 첫 화면 입구와 같은 「우주인 등록 신청서」, 다른 기기에서 등록했으면 신분증 제시 */}
      <WelcomeFlyer services={services} setup={setup} />
      {setup.issued && (
        <IssuedView
          services={services}
          setup={setup}
          overlay
          goLabel="관측지로 돌아가기"
        />
      )}
    </section>
  );
}

const NO_RANKS: ReadonlyMap<string, Rank> = new Map();

/** 관측지가 닫히는 때(추첨 시각 뒤 ms, 서버 room.ts closeAfterMs와 같다) */
const ROOM_CLOSE_AFTER_MS = 7 * 60_000;

/** 이 회차를 방으로 보여 줄지: 서버가 있고, 방이 아직 열려 있는 동안(추첨 7분 뒤까지) */
export function roomOpen(
  services: Services,
  round: number,
  nowSec: number,
): boolean {
  if (!serverApi()) return false;
  const times = roundTimes(services.ledger.schedule, round);
  const drawAt = drandTime(drandRoundForClose(times.closesAt));
  return (
    nowSec >= times.opensAt && nowSec < drawAt + ROOM_CLOSE_AFTER_MS / 1000
  );
}

/** 실시간 추첨이 끝났는지(시작 + 연출 길이). 끝났으면 방에서도 다시 보기 규칙을 따른다 */
export function liveOver(
  services: Services,
  round: number,
  record: RoundRecord | null | undefined,
  nowMs: number,
): boolean {
  const times = roundTimes(services.ledger.schedule, round);
  const drawAt = drandTime(drandRoundForClose(times.closesAt));
  const length = record
    ? planRoulette(drawOrder(record), LIVE_ROULETTE_TIMING).totalMs
    : 46_000;
  return nowMs >= drawAt * 1000 + LIVE_LEAD_MS + length;
}

/**
 * 지금 실시간 추첨 중인 회차(안내 15초 전부터 연출이 끝날 때까지). 서버가 없으면(연습 장부) 늘 null.
 * 첫 화면은 이 동안 그 추첨을 주인공으로, 다음 회차 응모는 연출이 끝난 뒤에 띄운다
 */
export function liveDrawRound(
  services: Services,
  status: { round: number; now: number },
): number | null {
  if (!serverApi()) return null;
  const nowMs = status.now * 1000;
  for (const r of [status.round - 1, status.round]) {
    if (r < 1) continue;
    const times = roundTimes(services.ledger.schedule, r);
    const drawAt = drandTime(drandRoundForClose(times.closesAt));
    const start = drawAt * 1000 + LIVE_LEAD_MS;
    if (
      nowMs >= start - 15_000 &&
      !liveOver(services, r, services.ledger.record(r), nowMs)
    )
      return r;
  }
  return null;
}

/** 로컬 데모 바로가기로 들어왔으면 추첨이 끝난 뒤 다음 회차 방으로 따라간다(탭 안에서만 기억) */
export const ROOM_FOLLOW_KEY = "stardraw-room-follow";

/**
 * 다음 추첨(또는 지금 실시간 추첨 중인) 회차: 열린 회차 가운데 실시간 연출이 아직 끝나지 않은 가장 이른 회차.
 * 장부(일정표)를 아직 받지 못했으면 null
 */
export function nextRoomRound(
  services: Services,
  nowMs: number,
): number | null {
  try {
    const schedule = services.ledger.schedule;
    const nowSec = nowMs / 1000;
    for (let r = 1; r < 1_000_000; r++) {
      const times = roundTimes(schedule, r);
      if (times.opensAt > nowSec) return null;
      if (!liveOver(services, r, services.ledger.record(r), nowMs)) return r;
    }
  } catch {
    return null;
  }
  return null;
}

/** 관측지가 닫힌 뒤 접수처로 옮기기까지(초) */
const ROOM_CLOSED_GO_SECONDS = 5;

/**
 * 관측지가 닫히면(추첨 7분 뒤) 몇 초 세다가 접수처(다음 회차 예측)로 옮긴다(2026-11-02 사용자).
 * 서버 시각(ms)으로 센다
 */
function RoomClosedNotice({ now, onGo }: { now: number; onGo: () => void }) {
  const [since] = useState(now);
  const left = Math.max(
    0,
    Math.ceil(ROOM_CLOSED_GO_SECONDS - (now - since) / 1000),
  );
  const gone = useRef(false);
  useEffect(() => {
    if (left > 0 || gone.current) return;
    gone.current = true;
    onGo();
  }, [left, onGo]);
  return (
    <div
      className="sd-text-in flex flex-col items-center gap-2 py-2 text-center"
      data-room-closed
    >
      <p className="break-keep font-semibold text-amber-100">
        관측지가 닫혔습니다.
      </p>
      <p className="break-keep text-sm text-white/70 tabular-nums">
        {left}초 뒤 접수처로 이동합니다.
      </p>
      <button
        type="button"
        onClick={() => {
          gone.current = true;
          onGo();
        }}
        className="sd-cta w-full max-w-xs rounded-2xl py-3 font-bold text-slate-950"
      >
        접수처로 가기
      </button>
    </div>
  );
}
