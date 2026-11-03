"use client";

import {
  acceptFrom,
  DRAND_DELAY,
  drandRoundForClose,
  drandTime,
  type QualInfo,
  RANKS,
  type RoundRecord,
  roundTimes,
  type Ticket,
  ticketId,
  toHex,
} from "@game/stardraw-core";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNoPullRefresh } from "@/game/no-pull-refresh";
import { cn } from "@/lib/cn";
import { AgencyFooter } from "@/stardraw/components/AgencyFooter";
import { useChunkErrorReload, useStaleBuild } from "@/stardraw/stale-build";
import { skipNextPageview } from "@/stats/analytics";
import type { SdView, SdWhere } from "@/stats/track";
import { astronautOf } from "../astronaut/identity";
import { type CheckSession, isActive } from "../checks";
import { errorText } from "../errors";
import { FX } from "../fx-timing";
import { gateStatusLine } from "../gate-status";
import { type KeptPaper, loadKept } from "../kept-paper";
import type { RoundCheck } from "../ledger";
import type { LedgerStatus } from "../local-ledger";
import { myRecords, newestRecord, recordKeys } from "../my-records";
import { passkeyProblem } from "../passkey-env";
import { qualMarks } from "../qual-judge";
import { ensureRegistered } from "../registrar";
import { myRank, prizeEligible, RANK_RULE, winnerCounts } from "../results";
import { savedPass } from "../room-client";
import { cadenceOf, roundShort, roundTitle } from "../round-label";
import { setWhere, trackArrival, trackKeyEnv, trackView } from "../sd-track";
import { DEMO_NS, GAME_NS, type Services, useLedger } from "../services";
import { NOTHING_SEALED, type Sealed, sealedFor } from "../spoiler";
import type { KeyInfo, MyTicket } from "../wallet";
import { IssuedView, useAstronautSetup, WelcomeFlyer } from "./AstronautSetup";
import { BroadcastToast, onAirRound, watchRound } from "./BroadcastToast";
import { BureauWelcome, letterAutoPending } from "./BureauWelcome";
import { CheckLink } from "./CheckLink";
import { DrawnNotice } from "./DrawnNotice";
import { DrawView } from "./DrawView";
import { EnterView, KeySetup, usePasskeyEnv } from "./EnterView";
import { GameIntro } from "./GameIntro";
import { IdPresentView, useIdPresent } from "./IdPresent";
import { Inbox } from "./Inbox";
import { IntroGate, SkyWait, shouldShowIntro } from "./IntroGate";
import { MyRecordsView, RecordHandover, RecordNotice } from "./MyRecords";
import { OnAirGuide } from "./OnAirGuide";
import {
  DrawFirst,
  formatLeft,
  formatTime,
  LottoBall,
  RANK_LABEL,
  StardrawTitle,
  shortId,
} from "./parts";
import { Receipt } from "./Receipt";
import { ReceiptPrint } from "./ReceiptPrint";
import { liveDrawRound, liveOver, RoomView, roomOpen } from "./RoomView";
import { SkyBoard } from "./SkyBoard";
import { useReducedMotion } from "./StageOverlay";
import { MenuItem, type NavTarget, TabBar, useWideScreen } from "./StardrawNav";
import { StatsView } from "./StatsView";
import { ticketUrl } from "./TicketView";
import { TimetableView } from "./TimetableView";
import { WinNotice } from "./WinNotice";

type View =
  | { name: "home" }
  | { name: "enter" }
  /** 지금 회차(2026-11-02 사용자): 예측 중이면 답안지, 마감부터 관측이 끝날 때까지는 관측지 */
  | { name: "now" }
  | { name: "receipt"; id: string }
  | { name: "draw"; round: number }
  | { name: "mine" }
  /** 내 기록: 관측 수첩·당첨 내역·당첨증·훈장·기념 서류(/stardraw/mine#records) */
  | { name: "records" }
  | { name: "rounds" }
  | { name: "round"; round: number }
  /** 관측 기록(공개 장부 통계) */
  | { name: "stats" }
  /** 관측 시간표: 앞으로의 예측 접수·관측 시각 */
  | { name: "timetable" }
  /** 당첨자가 보낸 확인 링크(/stardraw/check#토큰) */
  | { name: "link"; token: string };

/** 우주국 인사·편지가 걷힌 뒤 홈을 펼치기까지 쉬는 시간(연출은 여유 있게) */
const UNFOLD_PAUSE_MS = 400;

/** 화면마다 자기 주소(정적 내보내기라 실제 경로 페이지). 경로 안의 작은 화면은 # 조각으로 */
export type StardrawPage =
  | "home"
  | "enter"
  | "now"
  | "mine"
  | "rounds"
  | "check"
  | "stats"
  | "timetable";

const PATH: Record<StardrawPage, string> = {
  home: "/stardraw",
  enter: "/stardraw/enter",
  now: "/stardraw/now",
  mine: "/stardraw/mine",
  rounds: "/stardraw/rounds",
  check: "/stardraw/check",
  stats: "/stardraw/stats",
  timetable: "/stardraw/timetable",
};

/** 화면 → 주소. 뒤로가기·새로고침이 그 화면으로 돌아오게 브라우저 기록에 남긴다 */
function urlOf(v: View): string {
  switch (v.name) {
    case "home":
      return PATH.home;
    case "enter":
      return PATH.enter;
    case "now":
      return PATH.now;
    case "mine":
      return PATH.mine;
    case "records":
      return `${PATH.mine}#records`;
    case "receipt":
      return `${PATH.mine}#t-${v.id}`;
    case "rounds":
      return PATH.rounds;
    case "round":
      return `${PATH.rounds}#${v.round}`;
    case "draw":
      return `${PATH.rounds}#draw-${v.round}`;
    case "link":
      return `${PATH.check}#${v.token}`;
    case "stats":
      return PATH.stats;
    case "timetable":
      return PATH.timetable;
  }
}

/** 지금 주소의 경로가 어느 화면 페이지인지(끝 / 하나는 무시한다) */
function pageOf(pathname: string): StardrawPage {
  const p = pathname.replace(/\/+$/, "") || "/";
  const found = (Object.keys(PATH) as StardrawPage[]).find(
    (k) => PATH[k] === p,
  );
  return found ?? "home";
}

/** 지금 주소(경로와 # 조각) → 화면 */
function viewOfLocation(): View {
  return viewOf(pageOf(window.location.pathname), window.location.hash);
}

/** 주소 → 화면 */
function viewOf(page: StardrawPage, hash: string): View {
  const h = hash.replace(/^#/, "");
  if (page === "enter") return { name: "enter" };
  if (page === "now") return { name: "now" };
  if (page === "check") return { name: "link", token: h };
  if (page === "stats") return { name: "stats" };
  if (page === "timetable") return { name: "timetable" };
  if (page === "mine") {
    if (h === "records") return { name: "records" };
    const t = /^t-([0-9a-f]{64})$/.exec(h);
    return t ? { name: "receipt", id: t[1] as string } : { name: "mine" };
  }
  if (page === "rounds") {
    let m = /^draw-(\d+)$/.exec(h);
    if (m) return { name: "draw", round: Number(m[1]) };
    m = /^(\d+)$/.exec(h);
    if (m) return { name: "round", round: Number(m[1]) };
    return { name: "rounds" };
  }
  return { name: "home" };
}

/**
 * 하늘의 별 따기(docs/36 11절). 서버 주소가 없으면 이 기기 안 연습 장부로 돈다.
 * `page`는 처음 열린 페이지일 뿐이고, 그 뒤 화면은 늘 지금 주소(경로 + # 조각)에서 읽는다(go 참고)
 */
export function StardrawApp({ page = "home" }: { page?: StardrawPage }) {
  const { services, status, version, refresh } = useLedger();
  const [view, setView] = useState<View>(() =>
    typeof window === "undefined" ? viewOf(page, "") : viewOfLocation(),
  );
  const [mine, setMine] = useState<MyTicket[]>([]);
  /** 지갑을 한 번 읽었는지(그 전에는 영수증을 "찾을 수 없어요"로 보이지 않는다) */
  const [loaded, setLoaded] = useState(false);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  /** 추첨이 끝났다는 알림 띠를 닫은 회차 */
  const [noticeClosed, setNoticeClosed] = useState<Set<number>>(new Set());
  /** 메뉴의 내 등록증 칸에 쓸 이 기기 등록증 */
  const [navKey, setNavKey] = useState<KeyInfo | null>(null);
  /** 장부에 내 등록이 실린 회차(근속 서류의 날짜) */
  const [regRound, setRegRound] = useState<number | null>(null);
  /** 「내 기록」에서 이미 본 기념 서류·당첨증 표시 */
  const [seenRecords, setSeenRecords] = useState<Set<string>>(new Set());
  /** 처음 받은 서류를 건네받는 연출 중인지 */
  const [handover, setHandover] = useState(false);
  const reduceMotion = useReducedMotion();
  /** 배포된 판이 이 화면과 다르다(stale-build.ts). 다음 화면 이동 때 새로 불러온다 */
  const stale = useStaleBuild();
  useChunkErrorReload();
  /**
   * 우주국 인사(IntroGate): 페이지를 불러올 때마다(어느 화면이든, 앱 안에서 오갈 때는 아니다). 홈이면 인사가
   * 물러나는 동안 홈이 차례로 펼쳐진다(unfold: 하늘 → 제목 → 회차 카드 → 나머지, CSS sd-unfold-all)
   */
  const [intro, setIntro] = useState(false);
  /** 홈 펼치기: hold는 처음 온 사람이 편지를 읽는 동안 숨겨 두기, run은 차례로 펼치기 */
  const [unfold, setUnfold] = useState<"hold" | "run" | null>(null);
  useEffect(() => {
    if (shouldShowIntro()) setIntro(true);
  }, []);
  /** 생애 첫 방문인 처음 온 사람: 인사 뒤 편지가 먼저 */
  const letterFirst = useRef(false);
  /** 인사가 물러날 때 홈이었는지(홈만 펼친다. 다른 화면은 인사가 걷히면 그대로 보인다) */
  const unfoldHome = useRef(false);
  /** 인사·편지가 걷힌 뒤 펼치기까지의 쉼 */
  const unfoldAfterPause = () => {
    window.setTimeout(() => setUnfold("run"), UNFOLD_PAUSE_MS);
  };
  useEffect(() => {
    if (unfold !== "run") return;
    const t = window.setTimeout(() => setUnfold(null), 2600);
    return () => window.clearTimeout(t);
  }, [unfold]);
  useEffect(() => {
    if (view.name !== "receipt") setPrinting(null);
  }, [view.name]);
  /**
   * 지금 회차 화면이 보이는 것: 들어올 때 상태로 정하고, 그 뒤로는 사람이 옮길 때만 바꾼다(답안지를 쓰는 중에
   * 마감되어도 화면을 빼앗지 않고 방송 토스트로 알린다, 2026-11-02 사용자). 관측이 끝나면 관측지의 「다음 회차 응모하기」로
   */
  const [nowMode, setNowMode] = useState<
    { kind: "predict" } | { kind: "observe"; round: number } | null
  >(null);
  const watching = services && status ? watchRound(services, status) : null;
  useEffect(() => {
    if (view.name !== "now") {
      setNowMode(null);
      return;
    }
    if (nowMode !== null || !services || !status) return;
    setNowMode(
      watching !== null
        ? { kind: "observe", round: watching }
        : { kind: "predict" },
    );
  }, [view.name, nowMode, services, status, watching]);
  /**
   * 화면에 그릴 지금 회차 갈래. 위 effect가 정하기 전 한 번도 같은 값으로 그린다(예전에는 그 한 번에 본문이 비어
   * footer만 화면 위쪽에 잠깐 보였다, 2026-11-02 사용자, 휴대폰)
   */
  const nowShown: typeof nowMode =
    nowMode ??
    (view.name === "now" && services && status
      ? watching !== null
        ? { kind: "observe", round: watching }
        : { kind: "predict" }
      : null);
  /**
   * 관측은 방송처럼(2026-11-02 사용자): 관측 시간에 홈으로 처음 들어온 사람은 지금 회차 화면의 관측지로 옮긴다
   * (주소는 바꿔치기라 뒤로 가기로 홈에 갇히지 않는다). 들어오는 순간에 한 번만 정한다. 이미 홈에 있던 사람은
   * 끌고 가지 않는다(등록·봉투 열기 같은 하던 일을 끊지 않게, 사용자가 다시 고민해 정함). 그 사람은 홈 회차 카드
   * 「관측지로 가기」와 방송 토스트가 부른다. 홈 탭으로 돌아온 사람도 옮기지 않는다
   */
  const onAir = services && status ? onAirRound(services, status) : null;
  const arrival = useRef<"pending" | "done">(
    view.name === "home" ? "pending" : "done",
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부를 처음 읽었을 때 한 번만 정한다(go는 매번 새로 만든다)
  useEffect(() => {
    if (arrival.current === "done" || !services || !status) return;
    arrival.current = "done";
    if (view.name !== "home" || onAir === null) return;
    go({ name: "now" }, true);
    setNowMode({ kind: "observe", round: onAir });
  }, [services, status]);
  /** 답안지를 쓰는 화면(응모 페이지, 지금 회차의 예측) */
  const picking =
    view.name === "enter" ||
    (view.name === "now" && nowShown?.kind === "predict");
  /** 추첨을 보는 화면(추첨 페이지, 지금 회차의 관측지) */
  const observing =
    view.name === "draw" ||
    (view.name === "now" && nowShown?.kind === "observe");
  // 별을 고르다 화면이 당겨져 새로고침되지 않게(추첨 연출은 DrawFor가, 그 밖의 화면은 당겨서 새로고침이 된다)
  useNoPullRefresh(picking);
  /**
   * 막 응모해 영수증이 인쇄되어 나오는 중인 응모권(한 번만 연출한다). 화면을 옮겨도 이 부품은 그대로라(go)
   * 처음 만들 때 한 번 읽던 값으로는 연출이 나오지 않았다. 응모가 끝날 때 정하고, 영수증을 떠나면 지운다
   */
  const [printing, setPrinting] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 읽는다
  useEffect(() => {
    if (!services) return;
    setMine(services.wallet.loadTickets());
    setLoaded(true);
    setOpened(services.wallet.openedRounds());
    setNoticeClosed(services.wallet.noticeClosedRounds());
    setNavKey(services.wallet.loadKey());
    setSeenRecords(services.wallet.seenRecords());
  }, [version, services]);

  useEffect(() => {
    if (!services || !navKey) return;
    let alive = true;
    void services.ledger
      .registeredRound(navKey.pub)
      .then((r) => {
        if (alive) setRegRound(r);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [services, navKey]);

  // 뒤로가기·앞으로가기로 # 조각이 바뀌면 그 화면으로
  useEffect(() => {
    const sync = () => setView(viewOfLocation());
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  // 추첨(결과)을 열면 그 회차는 "열어 봄": 첫 화면 결과 봉투에서 빠진다. 뒤로가기로 나가도 그대로다
  // (예전에는 「돌아가기」로 닫을 때만 기록해, 열지 못하거나 뒤로가기로 나가면 첫 화면이 그 봉투에 갇혔다)
  const drawRound =
    view.name === "draw"
      ? view.round
      : view.name === "now" && nowShown?.kind === "observe"
        ? nowShown.round
        : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 회차를 열 때 한 번
  useEffect(() => {
    if (!services || !loaded || drawRound === null) return;
    if (!services.ledger.record(drawRound)) return;
    services.wallet.markOpened(drawRound);
    setOpened(services.wallet.openedRounds());
  }, [drawRound, loaded, services, version]);

  /**
   * 다른 화면으로: 주소를 바꿔 기록에 남기고(replace면 지금 기록을 바꾼다) 이 화면 그대로 그 화면을 그린다.
   * 다른 경로(/stardraw → /stardraw/mine#t-…)로 갈 때도 Next 라우터를 쓰지 않는다. 라우터로 페이지를 바꾸면
   * 새 페이지가 그려지는 순간 주소의 # 조각이 아직 없어 목록으로 떨어지는 일이 폰에서 되풀이됐다
   * (2026-10-31 안드로이드: 봉투 → 지난 회차 목록, 첫 화면 「영수증」 → 내 응모 목록). 별 따기 화면은 모두 이
   * 한 부품이 그리니 페이지를 바꿀 까닭이 없다. 주소는 실제 경로라 새로고침·공유하면 그 페이지가 바로 열린다.
   * Next는 history.pushState를 자기 기록과 맞추고, 뒤로가기도 이 부품을 그대로 둔 채 popstate로 알려 준다
   */
  const go = (v: View, replace = false) => {
    const url = urlOf(v);
    // 새 판이 나왔으면 이 이동을 그 주소 새로 불러오기로 바꾼다(조용히 새 화면으로). 별을 고르거나 관측하는 중에는 하지 않는다
    if (stale && !picking && !observing) {
      if (replace) window.location.replace(url);
      else window.location.assign(url);
      return;
    }
    if (replace) window.history.replaceState(window.history.state, "", url);
    else window.history.pushState(window.history.state, "", url);
    setView(v);
    window.scrollTo({ top: 0 });
  };
  /**
   * 메뉴가 없는 예측·휴대폰 추첨·회차 방의 「홈」: 늘 첫 화면으로. 바로 전 화면은 브라우저·기기의 뒤로 가기가
   * 맡는다. 화면 안에 뒤로 가기 단추를 두지 않는다(이름과 다른 곳으로 가고, 탭바·메뉴 줄과 겹쳤다, 2026-11-01 사용자 B안)
   */
  const goHome = () => go({ name: "home" });
  /** 지금 회차로: 예측 중이면 답안지, 관측 중이면 관측지(들어올 때 정한다) */
  const goNow = () => {
    setNowMode(null);
    go({ name: "now" });
  };
  /** 관측지로: 지금 관측할 회차면 지금 회차 화면의 관측지, 아니면 그 회차 추첨 화면 */
  const goWatch = (round: number) => {
    if (watching !== null && round === watching) {
      if (view.name !== "now") go({ name: "now" });
      setNowMode({ kind: "observe", round });
    } else go({ name: "draw", round });
  };
  /**
   * 사이트 통계(docs/33 11절, 실제 게임만 보낸다: sd-track.ts). 지금 화면 이름을 적고, 주소(경로)가 바뀌지 않는
   * 화면은 sd-view로 센다. 공지 링크 꼬리표와 패스키를 못 쓰는 브라우저는 장부를 받은 뒤 한 번
   */
  const sdScreen: SdWhere =
    view.name === "now"
      ? nowShown?.kind === "observe"
        ? "observe"
        : "predict"
      : view.name === "link"
        ? "other"
        : view.name;
  /** 지금 회차 화면이 예측인지 관측인지 정해졌는지(정하기 전에는 세지 않는다) */
  const nowKnown = view.name !== "now" || nowShown !== null;
  /** 예측서를 낸 직후의 접수증 화면은 세지 않는다(접수 시각과 방문을 맞춰 보지 못하게) */
  const skipView = useRef(false);
  const leaveAfterSubmit = () => {
    skipView.current = true;
    skipNextPageview();
  };
  useEffect(() => {
    setWhere(sdScreen);
  }, [sdScreen]);
  useEffect(() => {
    if (!services) return;
    const counted: readonly SdWhere[] = [
      "records",
      "receipt",
      "round",
      "draw",
      "predict",
      "observe",
    ];
    if (!counted.includes(sdScreen)) return;
    if (!nowKnown) return;
    if (sdScreen === "receipt" && skipView.current) {
      skipView.current = false;
      return;
    }
    trackView(services.ns, sdScreen as SdView);
  }, [sdScreen, services, nowKnown]);
  useEffect(() => {
    if (!services) return;
    trackArrival(services.ns);
    trackKeyEnv(services.ns);
  }, [services]);
  /** 추첨을 아직 열어 보지 않은 내 회차(결과를 가린다, spoiler.ts) */
  const sealed: Sealed = services
    ? sealedFor(mine, opened, services.ledger)
    : NOTHING_SEALED;
  /** 알림 띠에 띄울 회차: 가렸고 띠를 닫지 않은 내 회차(추첨 화면에서는 띄우지 않는다) */
  const noticeRounds = observing
    ? []
    : [...new Set(mine.map((m) => m.ticket.round))]
        .filter((r) => sealed(r) && !noticeClosed.has(r))
        .sort((a, b) => a - b);
  const receiptOf = (id: string) =>
    mine.find((m) => toHex(ticketId(m.ticket)) === id);

  /** 내 공개 열쇠들: 이 기기 등록증 + 내 응모권의 열쇠 */
  const myPubs = useMemo(() => {
    const pubs = new Map<string, Uint8Array>();
    if (navKey) pubs.set(toHex(navKey.pub), navKey.pub);
    for (const m of mine) pubs.set(toHex(m.ticket.pub), m.ticket.pub);
    return [...pubs.values()];
  }, [navKey, mine]);
  /**
   * 내 열쇠들의 닫힌 회차 응모권(장부의 머클 증명으로 확인, docs/36 11-30). 다른 기기에서 낸 것도 들어온다.
   * 장부 전체를 받지 않으므로 내 기록은 이것과 회차 요약으로 센다
   */
  const [keyTickets, setKeyTickets] = useState<Ticket[] | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀌거나 내 열쇠·지갑이 바뀔 때 다시 묻는다
  useEffect(() => {
    if (!services || !loaded || myPubs.length === 0) return;
    let alive = true;
    void services.ledger
      .keyTickets(
        myPubs,
        mine.map((m) => m.ticket),
      )
      .then((list) => {
        if (alive) setKeyTickets(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [services, loaded, version, myPubs, mine]);
  /** 내 기록: 회차 기록·요약과 내 응모권으로 계산한다(my-records.ts) */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부·지갑·열어 본 회차가 바뀔 때만 다시 센다
  const records = useMemo(() => {
    if (!services || !loaded || !keyTickets) return null;
    if (myPubs.length === 0) return null;
    return myRecords({
      schedule: services.ledger.schedule,
      closed: services.ledger.closed(),
      mine: keyTickets,
      myPubs,
      registeredRound: regRound,
      now: services.ledger.now(),
      sealed,
    });
  }, [services, loaded, version, keyTickets, myPubs, opened, regRound]);
  const newRecords = records
    ? recordKeys(records).filter((k) => !seenRecords.has(k))
    : [];
  const markSeen = () => {
    if (!services || !records) return;
    services.wallet.markRecordsSeen(recordKeys(records));
    setSeenRecords(services.wallet.seenRecords());
  };
  /** 내 기록으로: 처음 받은 것이 있으면 건네받는 연출부터(움직임 줄이기면 바로) */
  const openRecords = () => {
    go({ name: "records" });
    if (newRecords.length > 0 && !reduceMotion) setHandover(true);
    else markSeen();
  };
  // 주소로 바로 내 기록을 열었으면(연출 없이) 지금 받은 것을 본 것으로 남긴다
  // biome-ignore lint/correctness/useExhaustiveDependencies: 내 기록을 열 때와 받은 것이 늘 때만
  useEffect(() => {
    if (view.name === "records" && !handover && newRecords.length > 0)
      markSeen();
  }, [view.name, handover, newRecords.length]);

  /** 지금 회차(예측)에 이미 낸 답안지: 답안지 대신 그 영수증을 그 자리에서 보인다(주소는 그대로) */
  const enteredHere =
    view.name === "now" && loaded && status?.phase === "open"
      ? mine.find((m) => m.ticket.round === status.round)
      : undefined;
  // 이미 응모한 회차의 응모판으로 들어오면(주소로 바로·뒤로가기) 빈 응모권 대신 그 영수증으로
  const enteredNow =
    view.name === "enter" && loaded && status?.phase === "open"
      ? mine.find((m) => m.ticket.round === status.round)
      : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 응모한 응모권이 정해질 때만 옮긴다
  useEffect(() => {
    if (enteredNow)
      go({ name: "receipt", id: toHex(ticketId(enteredNow.ticket)) }, true);
  }, [enteredNow]);

  // 응모·추첨은 하던 일에 집중하게 휴대폰 탭바를 숨긴다(응모·추첨 모두 머리 줄 「홈」으로 첫 화면에 간다)
  // 마우스로 쓰는 넓은 화면은 위쪽 메뉴 줄(탭바 대신)이라 위에 자리를 둔다. 연출을 가리지 않아 추첨에도 둔다
  // (2026-11-01 사용자: 추첨 화면에서 첫 화면으로 가기 어렵다)
  const wide = useWideScreen();
  // 우주국 인사와 처음 온 사람의 편지 동안에는 감춘다(뒤에 희미하게 비쳤다)
  const showNav =
    !!services &&
    !!status &&
    !picking &&
    (!observing || wide) &&
    !intro &&
    unfold !== "hold";
  // 화면마다 속한 탭 하나: 영수증·내 기록은 내 응모, 회차 결과·관측 기록은 지난 회차(2026-11-01 사용자 B안)
  const navActive: NavTarget | null =
    view.name === "home" || view.name === "timetable"
      ? "home"
      : view.name === "mine" ||
          view.name === "receipt" ||
          view.name === "records"
        ? "mine"
        : view.name === "rounds" ||
            view.name === "round" ||
            view.name === "stats"
          ? "rounds"
          : null;
  // 하위 화면에서 자기 탭을 다시 누르면 그 탭 첫 화면(목록)으로
  const onNav = (t: NavTarget) => {
    if (view.name !== t) go({ name: t });
  };
  return (
    <main
      data-game="stardraw"
      className={cn(
        "sd-night min-h-dvh px-4 pt-6 text-white",
        !showNav ? "pb-12" : wide ? "pt-20 pb-12" : "pb-28",
      )}
    >
      {showNav && services && (
        <TabBar
          services={services}
          keyInfo={navKey}
          active={navActive}
          onGo={onNav}
        />
      )}
      {intro && (
        <IntroGate
          ready={!!services && !!status}
          // 생애 첫 방문인 처음 온 사람은 편지(위에서 내려와 꺼내 읽는다)를 먼저, 닫히면 홈을 펼친다
          // 인사가 물러나는 동안과 사라진 뒤 잠깐은 홈을 숨겨 두고, 여유를 둔 뒤 위에서부터 펼친다(2026-11-02 사용자).
          // 생애 첫 방문인 처음 온 사람은 편지(위에서 내려와 꺼내 읽는다)를 먼저, 닫히면 펼친다
          // 홈이 아닌 화면(지금 회차·내 예측 등)은 편지가 없어, 여기서 편지를 기다리면 탭바가 숨은 채 남는다
          onLeave={() => {
            unfoldHome.current = view.name === "home";
            if (!unfoldHome.current) return;
            letterFirst.current = !navKey && letterAutoPending();
            setUnfold("hold");
          }}
          onDone={() => {
            setIntro(false);
            if (unfoldHome.current && !letterFirst.current) unfoldAfterPause();
          }}
        />
      )}
      <div
        className={cn(
          "sd-wide mx-auto flex max-w-xl flex-col gap-5",
          unfold === "run" && view.name === "home" && "sd-unfold-all",
          unfold === "hold" && view.name === "home" && "sd-unfold-hold",
        )}
      >
        {services && status && (
          <BroadcastToast
            services={services}
            status={status}
            hidden={observing || picking}
            settled={!intro && unfold === null}
            screen={view.name}
            belowBar={wide && showNav}
            onGo={goWatch}
          />
        )}
        {services && (
          <DrawnNotice
            rounds={noticeRounds}
            schedule={services.ledger.schedule}
            onDraw={(round) => go({ name: "draw", round })}
            onClose={() => {
              services.wallet.closeNotice(noticeRounds);
              setNoticeClosed(services.wallet.noticeClosedRounds());
            }}
          />
        )}
        {!observing && !picking && view.name !== "records" && (
          <RecordNotice
            count={newRecords.length}
            onOpen={openRecords}
            onClose={markSeen}
          />
        )}
        {handover && records && services && (
          <RecordHandover
            {...newestRecord(records, newRecords)}
            count={newRecords.length}
            schedule={services.ledger.schedule}
            recipient={navKey ? astronautOf(navKey.pub).name : null}
            onDone={() => {
              setHandover(false);
              markSeen();
            }}
          />
        )}
        {!services || !status || !loaded ? (
          // 장부와 이 기기 지갑을 기다리는 자리: 밤하늘 바탕만(정적 HTML에서부터 보인다). 인사가 떠 있으면 인사가 같은 바탕을 덮는다
          intro ? null : (
            <SkyWait />
          )
        ) : view.name === "now" ? (
          nowShown === null ? null : nowShown.kind === "observe" ? (
            loaded && (
              <DrawFor
                guide={
                  onAir === nowShown.round && (
                    <OnAirGuide
                      services={services}
                      round={nowShown.round}
                      hasKey={navKey !== null}
                      onRegister={() => setNowMode({ kind: "predict" })}
                    />
                  )
                }
                services={services}
                status={status}
                round={nowShown.round}
                mine={mine}
                seen={opened.has(nowShown.round)}
                onSkip={
                  services.practice
                    ? async () => {
                        await services.practice?.skipToNextDraw();
                        await refresh();
                      }
                    : null
                }
                onEnter={() => {
                  // 결과를 봤으니 첫 화면 봉투에서 빠진다
                  services.wallet.markOpened(nowShown.round);
                  setOpened(services.wallet.openedRounds());
                  setNowMode({ kind: "predict" });
                }}
                onHome={wide ? undefined : goHome}
              />
            )
          ) : enteredHere ? (
            <ReceiptView
              services={services}
              mine={enteredHere}
              sealed={sealed(enteredHere.ticket.round)}
              printing={false}
              onDraw={goWatch}
            />
          ) : (
            <EnterView
              services={services}
              status={status}
              onWatchDraw={goWatch}
              onBack={goHome}
              onDone={(ticket, receivedAt) => {
                const m = { ticket, receivedAt };
                services.wallet.addTicket(m);
                setMine(services.wallet.loadTickets());
                void refresh();
                // 응모 화면 기록을 영수증으로 바꾼다: 뒤로가기는 응모 전 화면으로
                const id = toHex(ticketId(ticket));
                leaveAfterSubmit();
                setPrinting(id);
                go({ name: "receipt", id }, true);
              }}
            />
          )
        ) : view.name === "enter" ? (
          <EnterView
            services={services}
            status={status}
            onWatchDraw={(round) => go({ name: "draw", round }, true)}
            onBack={goHome}
            onDone={(ticket, receivedAt) => {
              const m = { ticket, receivedAt };
              services.wallet.addTicket(m);
              setMine(services.wallet.loadTickets());
              void refresh();
              // 응모 화면 기록을 영수증으로 바꾼다: 뒤로가기는 응모 전 화면으로
              const id = toHex(ticketId(ticket));
              leaveAfterSubmit();
              setPrinting(id);
              go({ name: "receipt", id }, true);
            }}
          />
        ) : view.name === "receipt" ? (
          (() => {
            const m = receiptOf(view.id);
            if (!loaded) return null;
            if (!m)
              return (
                <p className="py-10 text-center text-white/60">
                  이 기기에서 이 예측서를 찾을 수 없어요.
                </p>
              );
            return (
              <ReceiptView
                services={services}
                mine={m}
                sealed={sealed(m.ticket.round)}
                printing={printing === view.id}
                onDraw={goWatch}
              />
            );
          })()
        ) : view.name === "draw" ? (
          // 이 기기에서 이미 본 회차인지(열어 본 회차 기록)를 읽은 뒤에 그린다: 본 회차는 연출 없이 결과부터
          loaded && (
            <DrawFor
              services={services}
              status={status}
              round={view.round}
              mine={mine}
              seen={opened.has(view.round)}
              onSkip={
                services.practice
                  ? async () => {
                      await services.practice?.skipToNextDraw();
                      await refresh();
                    }
                  : null
              }
              onEnter={() => {
                // 결과를 봤으니 첫 화면 봉투에서 빠진다
                services.wallet.markOpened(view.round);
                setOpened(services.wallet.openedRounds());
                goNow();
              }}
              onHome={wide ? undefined : goHome}
            />
          )
        ) : view.name === "records" ? (
          records ? (
            <MyRecordsView
              records={records}
              schedule={services.ledger.schedule}
              recipient={navKey ? astronautOf(navKey.pub).name : null}
              onOpenTicket={(w) => {
                if (receiptOf(w.id)) go({ name: "receipt", id: w.id });
              }}
            />
          ) : (
            loaded && (
              <p className="py-10 text-center text-white/60">
                아직 예측한 기록이 없습니다.
              </p>
            )
          )
        ) : view.name === "mine" ? (
          <MineView
            services={services}
            mine={mine}
            sealed={sealed}
            onRecords={openRecords}
            onOpen={(m) =>
              go({ name: "receipt", id: toHex(ticketId(m.ticket)) })
            }
            onDraw={(round) => go({ name: "draw", round })}
            onRecovered={() => setMine(services.wallet.loadTickets())}
          />
        ) : view.name === "rounds" ? (
          <RoundsView
            services={services}
            version={version}
            sealed={sealed}
            onOpen={(round) => go({ name: "round", round })}
            onDraw={(round) => go({ name: "draw", round })}
            onStats={() => go({ name: "stats" })}
          />
        ) : view.name === "stats" ? (
          <StatsView services={services} version={version} sealed={sealed} />
        ) : view.name === "timetable" ? (
          <TimetableView services={services} status={status} />
        ) : view.name === "round" ? (
          <RoundDetail
            services={services}
            round={view.round}
            mine={mine}
            sealed={sealed}
            onList={() => go({ name: "rounds" })}
            onDraw={(round) => go({ name: "draw", round })}
          />
        ) : view.name === "link" ? (
          <CheckLink
            key={view.token}
            services={services}
            token={view.token}
            sealed={sealed}
            onDraw={(round) => go({ name: "draw", round })}
          />
        ) : (
          <Home
            services={services}
            status={status}
            mine={mine}
            opened={opened}
            onEnter={goNow}
            onReceipt={(m) =>
              go({ name: "receipt", id: toHex(ticketId(m.ticket)) })
            }
            onDraw={goWatch}
            onTimetable={() => go({ name: "timetable" })}
            letterAuto={unfold === "hold" && !intro && letterFirst.current}
            onLetterClosed={unfoldAfterPause}
            onMine={() => go({ name: "mine" })}
            onRound={(round) => go({ name: "round", round })}
            onSkip={
              services.practice
                ? async () => {
                    await services.practice?.skipToNextDraw();
                    await refresh();
                  }
                : null
            }
          />
        )}
        {/* 본문이 그려진 뒤에만(본문이 빈 순간 footer가 화면 위쪽에 올라와 보이지 않게) */}
        {services && status && loaded && (
          <footer className="pt-4 text-center text-[11px] text-white/40">
            <AgencyFooter />
          </footer>
        )}
      </div>
    </main>
  );
}

export function Home({
  services,
  status,
  mine,
  opened,
  onEnter,
  onReceipt,
  onDraw,
  onTimetable,
  letterAuto = false,
  onLetterClosed,
  onMine,
  onRound,
  onSkip,
}: {
  services: Services;
  status: LedgerStatus;
  mine: MyTicket[];
  opened: Set<number>;
  /** 응모 화면(등록증이 없으면 우주인 등록부터) */
  onEnter: () => void;
  onReceipt: (m: MyTicket) => void;
  onDraw: (round: number) => void;
  /** 관측 시간표로 */
  onTimetable: () => void;
  /** 생애 첫 방문: 우주국 인사 뒤 편지가 위에서 내려온다(처음 온 사람 입구) */
  letterAuto?: boolean;
  /** 저절로 연 편지가 닫혔다(홈을 펼친다) */
  onLetterClosed?: (() => void) | undefined;
  onMine: () => void;
  /** 지난 회차 한 줄: 그 회차 결과로 */
  onRound: (round: number) => void;
  /** 연습 장부일 때만(서버 장부는 시간을 건너뛸 수 없다) */
  onSkip: (() => Promise<void>) | null;
}) {
  // 이 기기의 등록증. 홈은 장부를 받은 뒤 브라우저에서만 그려져(서버에서 그린 화면에는 없다) 처음 그릴 때 바로 읽는다.
  // 예전에는 첫 그리기 뒤에 읽어, 그 한 번은 홈이 비어 footer만 화면 위쪽에 잠깐 보였다(2026-11-02 사용자, 휴대폰)
  const [key, setKey] = useState<KeyInfo | null | undefined>(() =>
    services.wallet.loadKey(),
  );
  useEffect(() => {
    const found = services.wallet.loadKey();
    setKey(found);
    // 등록이 아직 장부에 오르지 않았으면 이어서 올린다(증명이 없는 예전 열쇠는 첫 응모 때)
    if (found && services.ns === GAME_NS)
      void ensureRegistered(services, found).catch(() => {});
  }, [services]);
  // 처음 온 사람(이 기기에 등록증이 없음)의 입구: 우주인 등록이나 신분증 제시. 등록하면 바로 별 고르기로
  const setup = useAstronautSetup(services, (k, how) => {
    setKey(k);
    if (how === "created") onEnter();
  });
  const env = usePasskeyEnv();
  const reduce = useReducedMotion();
  // 결과 봉투: 추첨이 끝났는데 아직 열어 보지 않은 내 응모권(가장 최근 것)
  const sealed = sealedFor(mine, opened, services.ledger);

  // 이 기기 등록증을 읽기 전에는 그리지 않는다(한 박자). 등록한 사람 모양으로 그렸다가 처음 온 사람 입구(편지)로
  // 바뀌면 하늘이 아래로 밀렸다(2026-11-02 펼치기 녹화). 모양이 정해진 뒤 한 번에 펼친다
  if (key === undefined) return null;

  // 발급한 등록증: 움직임 줄이기면 입구 대신, 아니면 입구 위 화면 전체 오버레이로
  // 게임 목록으로 가는 길은 메뉴(PC 메뉴 줄 맨 왼쪽, 휴대폰 더 보기 맨 위)가 맡아 따로 한 줄을 두지 않는다
  if (setup.issued && reduce)
    return <IssuedView services={services} setup={setup} />;
  // 등록·제시 오버레이는 입구와 첫 화면 두 갈래의 같은 자리(맨 앞)에 둔다: 확인되어 갈래가 바뀌어도 끊기지 않게
  if (key === null)
    return (
      <>
        <WelcomeFlyer services={services} setup={setup} />
        {setup.issued && (
          <IssuedView services={services} setup={setup} overlay />
        )}
        <Gate
          services={services}
          status={status}
          env={env}
          setup={setup}
          onSkip={onSkip}
          onDraw={onDraw}
          onTimetable={onTimetable}
          letterAuto={letterAuto}
          onLetterClosed={onLetterClosed}
        />
      </>
    );
  const envelope = mine
    .filter((m) => sealed(m.ticket.round))
    .sort((a, b) => b.ticket.round - a.ticket.round)[0];

  return (
    <>
      <WelcomeFlyer services={services} setup={setup} />
      <header className="flex flex-col gap-4">
        <StardrawTitle />
      </header>

      {/* 정답 예시 하늘은 처음 온 사람이든 다녀간 사람이든 늘 같은 자리에(첫 화면 모양이 달라 헷갈렸다, 사용자) */}
      <GameIntro cadence={cadenceOf(status.times.entry.length)} />

      <RoundCard
        services={services}
        status={status}
        mine={mine}
        envelope={envelope}
        onEnter={onEnter}
        onReceipt={onReceipt}
        onDraw={onDraw}
      />

      {/* 봉투가 떠 있는 동안은 지난 회차 카드를 두지 않는다(둘이 같은 곳으로 가는 것처럼 보였다, 2026-11-01 사용자). 봉투를 열면 다시 보인다 */}
      {!envelope && (
        <LastRound
          services={services}
          mine={mine}
          sealed={sealed}
          onRound={onRound}
          onDraw={onDraw}
        />
      )}

      <WinNotice
        services={services}
        tickets={mine.map((m) => m.ticket)}
        sealed={sealed}
        compact
        onOpen={onMine}
      />
      <Inbox
        services={services}
        tickets={mine.map((m) => m.ticket)}
        sealed={sealed}
      />

      {/* 앞으로의 회차(2026-11-02 사용자: 홈 아래에 붙인다. 길어지지 않게 세 줄, 전체는 시간표 페이지) */}
      <TimetableView
        services={services}
        status={status}
        compact={{ rows: 3, onMore: onTimetable }}
      />

      {onSkip && <PracticeSkip onSkip={onSkip} />}
    </>
  );
}

/**
 * 건너뛴 뒤 바뀐 회차 카드로 눈이 가게: 화면 가운데로 옮기고 한 번 은은하게 빛낸다.
 * 응모하지 않은 상태에서는 회차 번호와 남은 시간만 바뀌어, 단추가 아래에 있으면 반응이 없는 것처럼 보였다(2026-10-31)
 */
function showSkipped(): void {
  const card = document.querySelector<HTMLElement>(
    "[data-card], [data-gate-round], [data-draw-wait]",
  );
  if (!card) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  card.scrollIntoView({
    block: "center",
    behavior: reduce ? "auto" : "smooth",
  });
  if (reduce) return;
  card.animate(
    [
      { boxShadow: "0 0 0 0 rgba(253, 230, 138, 0)" },
      { boxShadow: "0 0 0 3px rgba(253, 230, 138, 0.55)" },
      { boxShadow: "0 0 0 0 rgba(253, 230, 138, 0)" },
    ],
    { duration: 1200, easing: "ease-out" },
  );
}

/** 연습 장부에서 다음 추첨까지 건너뛰기(서버 장부는 시간을 건너뛸 수 없다) */
function PracticeSkip({ onSkip }: { onSkip: () => Promise<void> }) {
  const [skipping, setSkipping] = useState(false);
  return (
    <button
      type="button"
      disabled={skipping}
      onClick={async () => {
        setSkipping(true);
        try {
          await onSkip();
          showSkipped();
        } finally {
          setSkipping(false);
        }
      }}
      className="self-center rounded-lg border border-white/15 border-dashed px-3 py-1.5 text-sm text-white/60 hover:bg-white/10 disabled:opacity-50"
    >
      {skipping ? "건너뛰고 있습니다" : "연습: 다음 관측까지 건너뛰기"}
    </button>
  );
}

/**
 * 처음 온 사람의 입구(2026-10-31 사용자): 제목 → 카노푸스 우주국 인사(2026-11-01 제목 아래로) → 정답 예시 하늘 → 지금 회차 한 줄 → 등록·제시.
 * 단추는 둘이다. 브라우저는 묻기 전에는 이 사람에게 패스키가 있는지 알 수 없어, 한 단추로 "제시"부터 하면
 * 처음 온 사람에게 다른 기기 QR 같은 엉뚱한 창이 뜬다. 그래서 큰 「우주인 등록」과 작은 「신분증 제시」
 */
export function Gate({
  services,
  status: s,
  env,
  setup,
  onSkip,
  onDraw,
  onTimetable,
  letterAuto = false,
  onLetterClosed,
}: {
  services: Services;
  status: LedgerStatus;
  env: ReturnType<typeof usePasskeyEnv>;
  setup: ReturnType<typeof useAstronautSetup>;
  onSkip: (() => Promise<void>) | null;
  /** 실시간 추첨 중이면 그 추첨으로(누구나 볼 수 있다) */
  onDraw?: (round: number) => void;
  /** 관측 시간표로. 없으면(데모 둘러보기) 시간표를 붙이지 않는다 */
  onTimetable?: (() => void) | undefined;
  letterAuto?: boolean;
  onLetterClosed?: (() => void) | undefined;
}) {
  const open = s.phase === "open";
  const live = liveDrawRound(services, s);
  return (
    <>
      {/* 첫 화면(등록 뒤)의 인사 줄과 같은 자리: 제목·소개 문구 아래, 정답 예시 하늘 위(2026-11-01 사용자) */}
      <StardrawTitle />
      <BureauWelcome
        cadence={cadenceOf(s.times.entry.length)}
        onRegister={() => void setup.create()}
        autoOpen={letterAuto}
        onClosed={onLetterClosed}
      />
      {/* 우주국 인사가 여섯 별 이야기를 이미 해서 소개 줄은 빼고 하늘만 */}
      <GameIntro />
      <p
        className="flex items-center justify-center gap-2.5 text-sm tabular-nums"
        data-gate-round={s.round}
      >
        <span
          aria-hidden="true"
          className="sd-live-dot"
          data-live={live !== null ? "entered" : open ? "open" : "drawing"}
        />
        {gateStatusLine(services.ledger.schedule, s, live)}
      </p>
      {live !== null && onDraw && (
        <button
          type="button"
          onClick={() => onDraw(live)}
          data-gate-live={live}
          className="self-center rounded-2xl border border-amber-200/50 px-5 py-2.5 font-semibold text-amber-100 text-sm hover:bg-amber-200/10"
        >
          관측지로 가기
        </button>
      )}
      <KeySetup
        gate
        demo={services.ns === DEMO_NS}
        env={env}
        working={setup.working}
        note={setup.note}
        error={setup.error}
        onCreate={() => void setup.create()}
        onRecover={() => void setup.recover()}
      />
      {/* 앞으로의 회차(2026-11-02 사용자: 홈 아래에 붙인다. 길어지지 않게 세 줄, 전체는 시간표 페이지) */}
      {onTimetable && (
        <TimetableView
          services={services}
          status={s}
          compact={{ rows: 3, onMore: onTimetable }}
        />
      )}

      {onSkip && <PracticeSkip onSkip={onSkip} />}
    </>
  );
}

/** 시각만 "오후 3:00" */
function clockOf(seconds: number): string {
  return CLOCK.format(new Date(seconds * 1000));
}
const CLOCK = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
});

/**
 * 지금 회차 카드: 지금 할 일 하나와 지금 단계의 시계 하나만 크게.
 * 열지 않은 결과 → 「추첨 보기」, 응모 전 → 마감까지 + 「별 6개 고르기」, 응모함 → 추첨까지 + 고른 별 + 「영수증」,
 * 마감 뒤 추첨 전 → 추첨까지. 지금 아닌 시계는 작게
 */
export function RoundCard({
  services,
  status: s,
  mine,
  envelope,
  onEnter,
  onReceipt,
  onDraw,
}: {
  services: Services;
  status: LedgerStatus;
  mine: MyTicket[];
  envelope: MyTicket | undefined;
  onEnter: () => void;
  onReceipt: (m: MyTicket) => void;
  onDraw: (round: number) => void;
}) {
  const schedule = services.ledger.schedule;
  // 보관한 답안지(반송된 회차보다 뒤 회차에서 쓸 수 있다). 첫 그리기 뒤에 읽는다(서버에서 그린 화면과 어긋나지 않게)
  const [kept, setKept] = useState<KeptPaper | null>(null);
  useEffect(() => {
    setKept(loadKept(services.ns, services.ledger.id()));
  }, [services]);
  // 앞 회차 추첨을 기다리거나 그 관측 1분(모두의 의무 시간) 동안은 그 회차가 지금 회차다
  const drawWaiting = s.phase === "waiting" && s.round > 1;
  const round = drawWaiting ? Math.min(s.nextDrawRound, s.round - 1) : s.round;
  const drawAt = roundTimes(schedule, round).closesAt + DRAND_DELAY;
  /** 다음 회차 예측을 받기 시작하는 때(앞 회차 관측이 끝난 뒤) */
  const nextOpens = acceptFrom(schedule, round + 1);
  const closed = s.phase !== "open";
  const ticket = mine.find((m) => m.ticket.round === round);
  const keptHere = kept !== null && kept.round < round;

  // 실시간 추첨 중(안내 15초 전부터 연출이 끝날 때까지, 서버가 있을 때)에는 그 추첨이 주인공. 다음 회차 응모 안내는
  // 연출이 끝난 뒤에 띄운다(2026-10-31 사용자: 추첨에 집중하는 쪽, 작은 "다음 회차 응모하기"도 두지 않는다)
  const live = liveDrawRound(services, s);
  if (live !== null)
    return (
      <section
        aria-label="실시간 관측"
        data-card="live"
        className="sd-glass sd-live-card flex flex-col items-center gap-4 rounded-3xl px-5 py-6 text-center"
      >
        <span className="flex items-center gap-2.5 break-keep font-bold text-lg tabular-nums">
          <span
            aria-hidden="true"
            className="sd-live-dot"
            data-live="entered"
          />
          지금 {roundShort(schedule, live)} 관측 중이에요.
        </span>
        <button
          type="button"
          onClick={() => onDraw(live)}
          className="sd-cta w-full max-w-xs rounded-2xl py-4 font-black text-slate-950 text-xl"
        >
          관측지로 가기
        </button>
      </section>
    );

  if (envelope) {
    const r = envelope.ticket.round;
    return (
      <section
        aria-label="관측 결과"
        data-card="result"
        className="sd-glass flex flex-col items-center gap-4 rounded-3xl p-6 text-center"
      >
        <span className="font-bold text-lg tabular-nums">
          {roundShort(schedule, r)} 관측 끝
        </span>
        <button
          type="button"
          onClick={() => onDraw(r)}
          data-envelope={r}
          className="sd-envelope flex h-28 w-44 items-end justify-center rounded-xl pb-3 font-bold text-slate-900"
        >
          관측 보기
        </button>
        {!closed && (
          <span className="text-sm text-white/60 tabular-nums">
            {roundShort(schedule, s.round)} 마감까지{" "}
            {formatLeft(s.times.entryDeadline - s.now)}
          </span>
        )}
        {/* 결과를 열어 보지 않아도 지금 회차에 응모할 수 있게 */}
        {!closed && !mine.some((m) => m.ticket.round === s.round) && (
          <button
            type="button"
            onClick={onEnter}
            className="sd-cta w-full max-w-xs rounded-2xl py-3 font-black text-lg text-slate-950"
          >
            별 6개 고르기
          </button>
        )}
      </section>
    );
  }

  const bigLabel = closed || ticket ? "관측까지" : "마감까지";
  const big = closed || ticket ? drawAt - s.now : s.times.entryDeadline - s.now;
  const state = closed ? "drawing" : ticket ? "entered" : "open";
  const name = roundShort(schedule, round);
  return (
    <section
      aria-label="이번 회차"
      data-card={state}
      className={cn(
        "sd-glass sd-live-card flex flex-col items-center gap-4 rounded-3xl px-5 py-6 text-center",
      )}
      data-live={state}
    >
      {/* 지금 이 회차가 살아 있다는 표시: 맥박 점과 한 문장(2026-10-31 사용자: "응모 중"이 눈에 띄지 않았다) */}
      <span
        className="flex items-center gap-2.5 break-keep font-bold text-lg tabular-nums"
        data-round-state
      >
        <span aria-hidden="true" className="sd-live-dot" data-live={state} />
        {state === "open"
          ? `지금 ${name} 예측을 받고 있어요.`
          : state === "entered"
            ? `${name} 예측서를 냈어요.`
            : `${name} 예측을 마감했어요.`}
      </span>
      {/*
        창구 말 한 줄(상태 × 내 응모 여부, 2026-10-31 사용자):
        응모 중·안 함 "아직 이번 회차에 응모하지 않으셨어요." / 응모 중·함 "추첨이 끝나면 이 자리에서 알려 드릴게요."
        응모함·마감 카드는 모두 「관측지로 가기」로 이끈다(2026-10-31 사용자):
        응모 중·함 "(추첨 시각) 추첨을 함께 지켜봐 주세요." / 마감·함 "곧 추첨이 시작됩니다. 관측지로 가 볼까요?" /
        마감·안 함 "관측지는 누구나 들어갈 수 있어요. 관측지로 가 볼까요?" + 아래 작은 줄에 다음 회차 응모 시각
      */}
      <p
        className="-mt-2 break-keep text-sm text-white/70"
        data-round-note={
          closed
            ? ticket
              ? "closed-entered"
              : "closed-none"
            : ticket
              ? "open-entered"
              : "open-none"
        }
      >
        {!closed
          ? ticket
            ? `${clockOf(drawAt)} 관측을 함께 지켜봐 주세요.`
            : "아직 이번 회차에 예측하지 않으셨어요."
          : ticket
            ? "곧 관측이 시작됩니다. 관측지로 가 볼까요?"
            : "관측지는 누구나 들어갈 수 있어요. 관측지로 가 볼까요?"}
      </p>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-sm text-white/60">{bigLabel}</span>
        <span
          className={cn(
            "font-bold font-mono text-6xl tabular-nums tracking-tight",
            bigLabel === "관측까지" && "text-amber-100",
          )}
          data-countdown={bigLabel === "관측까지" ? "draw" : "close"}
        >
          {formatLeft(big)}
        </span>
      </div>
      {ticket ? (
        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex flex-col items-center gap-1.5" data-my-stars>
            <span className="text-white/60 text-xs">내 별</span>
            <span className="flex flex-wrap justify-center gap-1">
              {ticket.ticket.numbers.map((n) => (
                <LottoBall key={n} n={n} size="sm" />
              ))}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onDraw(round)}
            data-go-draw={round}
            className="sd-cta w-full max-w-xs rounded-2xl py-3.5 font-black text-lg text-slate-950"
          >
            관측지로 가기
          </button>
          <button
            type="button"
            onClick={() => onReceipt(ticket)}
            className="w-full max-w-xs rounded-2xl border border-white/25 py-3 font-semibold hover:bg-white/10"
          >
            접수증
          </button>
        </div>
      ) : !closed ? (
        <div className="flex w-full flex-col items-center gap-2">
          <button
            type="button"
            onClick={onEnter}
            className="sd-cta w-full max-w-xs rounded-2xl py-4 font-black text-slate-950 text-xl"
          >
            별 6개 고르기
          </button>
          {/* 보관한 답안지는 응모 페이지에서 고른다(입구는 하나, 2026-11-01 사용자). 카드에는 있다는 것만 */}
          {keptHere && (
            <span className="text-amber-100/80 text-xs" data-kept-note>
              보관한 예측서가 있어요.
            </span>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onDraw(round)}
          data-go-draw={round}
          className="sd-cta w-full max-w-xs rounded-2xl py-3.5 font-black text-lg text-slate-950"
        >
          관측지로 가기
        </button>
      )}
      <span className="text-white/50 text-xs tabular-nums">
        {closed
          ? ticket
            ? `관측 ${clockOf(drawAt)}`
            : `다음 회차는 ${clockOf(nextOpens)}부터 예측할 수 있어요.`
          : ticket
            ? `마감 ${clockOf(s.times.closesAt)} · 예측서 ${s.entries}장`
            : `관측 ${clockOf(drawAt)} · 예측서 ${s.entries}장`}
      </span>
    </section>
  );
}

/** 좁은 휴대폰(390 폭 아래)의 지난 회차 공: 한 줄에 7개가 들게 조금 작게 */
const NARROW_BALL = "max-[389px]:size-6 max-[389px]:text-[11px]";

/**
 * 지난 회차 결과 한 줄(누르면 그 회차 결과. 회차 번호와 공이 보여 그 회차가 열릴 거라 기대한다, 목록은 탭이 맡는다,
 * 2026-11-01 사용자 B안). 내 응모권이 있으면 등수와 「다시 보기」
 */
function LastRound({
  services,
  mine,
  sealed,
  onRound,
  onDraw,
}: {
  services: Services;
  mine: MyTicket[];
  sealed: Sealed;
  onRound: (round: number) => void;
  onDraw: (round: number) => void;
}) {
  const closed = services.ledger.closed();
  const record = closed.at(-1)?.record;
  if (!record) return null;
  const my = mine.find((m) => m.ticket.round === record.round);
  const rank = my && !record.void ? myRank(record, my.ticket) : null;
  if (sealed(record.round))
    return (
      <div className="sd-glass flex items-center gap-2 rounded-2xl px-4 py-3">
        <button
          type="button"
          onClick={() => onRound(record.round)}
          aria-label="지난 회차"
          data-last-round={record.round}
          className="min-w-0 flex-1 text-left text-white/60 text-xs tabular-nums"
        >
          지난 회차 · {roundShort(services.ledger.schedule, record.round)}
        </button>
        <DrawFirst round={record.round} onDraw={() => onDraw(record.round)} />
      </div>
    );
  return (
    <div className="sd-glass flex items-center gap-2 rounded-2xl px-4 py-3">
      <button
        type="button"
        onClick={() => onRound(record.round)}
        aria-label="지난 회차"
        data-last-round={record.round}
        className="flex min-w-0 flex-1 flex-col gap-1.5 text-left"
      >
        <span className="text-white/60 text-xs tabular-nums">
          지난 회차 · {roundShort(services.ledger.schedule, record.round)}
          {my && (
            <b
              className={cn(
                "ml-1.5 font-semibold",
                rank ? "text-amber-200" : "text-white/70",
              )}
            >
              {record.void ? "무효" : rank ? RANK_LABEL[rank] : "등수 밖"}
            </b>
          )}
        </span>
        {/* 375 폭 휴대폰은 「다시 보기」 곁에 공 7개가 한 줄에 들지 않아 보너스 공이 둘째 줄로 내려가 아래 메뉴에
            가려졌다: 좁은 폭에서는 공과 간격을 줄인다 */}
        {record.void ? (
          <span className="text-amber-300/90 text-sm">무효 회차</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1 max-[389px]:gap-0.5">
            {record.numbers.map((n) => (
              <LottoBall
                key={n}
                n={n}
                size="sm"
                ring={!!my?.ticket.numbers.includes(n)}
                className={NARROW_BALL}
              />
            ))}
            <span className="px-0.5 text-white/40">+</span>
            <LottoBall n={record.bonus} size="sm" className={NARROW_BALL} />
          </span>
        )}
      </button>
      {my && !record.void && (
        <button
          type="button"
          onClick={() => onDraw(record.round)}
          className="shrink-0 rounded-lg border border-white/20 px-2.5 py-1.5 text-xs hover:bg-white/10"
        >
          다시 보기
        </button>
      )}
    </div>
  );
}

function ReceiptView({
  services,
  mine,
  sealed,
  printing,
  onDraw,
}: {
  services: Services;
  mine: MyTicket;
  sealed: boolean;
  printing?: boolean | undefined;
  onDraw: (round: number) => void;
}) {
  const record = services.ledger.record(mine.ticket.round);
  // 막 응모했으면 영수증 발급 연출(오버레이)이 끝난 뒤 이 영수증 화면이 드러난다
  const reduce = useReducedMotion();
  const [printed, setPrinted] = useState(false);
  // 머리 줄 단추는 두지 않는다: 내 응모 탭이 켜져 있고, 목록은 그 탭이, 바로 전 화면은 뒤로 가기가 맡는다
  return (
    <section className="flex flex-col gap-4" aria-label="예측서">
      {printing && (
        <p role="status" className="text-center font-semibold text-amber-100">
          예측했습니다.
        </p>
      )}
      {printing && !reduce && !printed && (
        <ReceiptPrint
          ticket={mine.ticket}
          receivedAt={mine.receivedAt}
          schedule={services.ledger.schedule}
          record={record}
          sealed={sealed}
          continued
          onDone={() => setPrinted(true)}
        />
      )}
      <Receipt
        ticket={mine.ticket}
        receivedAt={mine.receivedAt}
        schedule={services.ledger.schedule}
        record={record}
        sealed={sealed}
        onDraw={() => onDraw(mine.ticket.round)}
      />
      <ShareTicket services={services} ticket={mine.ticket} />
      {/*
        결과 전에는 첫 화면 회차 카드와 같은 「관측지로 가기」(서버가 있으면 회차 방, 없으면 추첨 기다림 화면). 장부를
        1초마다 다시 읽어 그리므로 영수증을 열어 둔 채 결과가 나오면 영수증 안 「추첨 보기」로 바뀐다(2026-11-01 사용자).
        막 응모해 영수증이 인쇄되어 나오는 동안에는 두지 않는다(연출과 겹치지 않게)
      */}
      {!record && !(printing && !reduce && !printed) && (
        <button
          type="button"
          onClick={() => onDraw(mine.ticket.round)}
          data-go-draw={mine.ticket.round}
          className="sd-cta rounded-2xl py-3 font-bold text-slate-950"
        >
          관측지로 가기
        </button>
      )}
      {record && !sealed && (
        <button
          type="button"
          onClick={() => onDraw(mine.ticket.round)}
          className="sd-cta rounded-2xl py-3 font-bold text-slate-950"
        >
          관측 다시 보기
        </button>
      )}
    </section>
  );
}

/** 추첨 시각 "오후 3시", 분이 있으면 "오후 3시 20분" */
function koreanHour(seconds: number): string {
  const d = new Date(seconds * 1000);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}시${m ? ` ${m}분` : ""}`;
}

/** 응모권 공유: 공유 시트(Web Share)가 있으면 그것으로, 없으면 링크를 복사한다 */
function ShareTicket({
  services,
  ticket,
}: {
  services: Services;
  ticket: Ticket;
}) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const closesAt = roundTimes(
      services.ledger.schedule,
      ticket.round,
    ).closesAt;
    const text = `하늘의 별 따기 ${roundShort(services.ledger.schedule, ticket.round)} 예측서를 냈어요. 관측은 ${koreanHour(drandTime(drandRoundForClose(closesAt)))}!`;
    const url = ticketUrl(window.location.origin, ticket);
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
      } catch {
        // 공유 시트를 닫았다
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {
      // 복사를 못 하면 아무 일도 하지 않는다
    }
  };
  return (
    <button
      type="button"
      onClick={() => void share()}
      className="rounded-2xl border border-white/20 py-2.5 font-semibold text-sm hover:bg-white/10"
    >
      {copied ? "링크를 복사했어요" : "예측서 공유"}
    </button>
  );
}

function DrawFor({
  services,
  status,
  round,
  mine,
  seen,
  onEnter,
  onSkip,
  onHome,
  guide,
}: {
  services: Services;
  status: LedgerStatus;
  round: number;
  mine: MyTicket[];
  /**
   * 관측 방송 안내(OnAirGuide, 지금 회차 화면만). 관측지에서는 머리(장소·회차) 아래에 두어 화면 위쪽을 한 덩어리로,
   * 다른 화면(다시 보기·기다림)에서는 맨 위에
   */
  guide?: ReactNode;
  /** 이 기기에서 이미 결과까지 본 회차면 연출 없이 결과부터(「추첨 다시 보기」로 다시 돈다) */
  seen: boolean;
  onEnter: () => void;
  /** 연습 장부일 때만: 다음 추첨까지 건너뛰기 */
  onSkip: (() => Promise<void>) | null;
  /** 메뉴 줄이 없는 휴대폰: 머리 줄 왼쪽 「홈」(이 화면의 하나뿐인 출구). PC는 위쪽 메뉴 줄이 있어 넘기지 않는다 */
  onHome?: (() => void) | undefined;
}) {
  const record = services.ledger.record(round);
  const [replays, setReplays] = useState(0);
  /** 이 화면에서 결과를 기다리다 들어온 추첨(실시간)이면 건너뛰기를 두지 않는다 */
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!record) setLive(true);
  }, [record]);
  // 서버가 있고 방이 열려 있으면 회차 방(실시간 추첨, docs/36 11-23). 실시간 추첨이 끝난 뒤에 처음 온 사람은 다시 보기
  // 규칙으로 관측을 먼저 보고(결과를 바로 보이지 않게), 끝까지 보면(이 기기에서 이미 본 회차면 바로) 관측지가 닫히기 전까지
  // 관측지로 들어가 언덕에 오를 수 있다(2026-11-02 사용자). 그때 방에 있던 사람·대화 표가 있는 사람은 그대로 방에 남는다
  const wasInRoom = useRef(false);
  const [watched, setWatched] = useState(seen);
  const showRoom =
    roomOpen(services, round, status.now) &&
    (wasInRoom.current ||
      watched ||
      !liveOver(services, round, record, status.now * 1000) ||
      savedPass(round) !== null);
  wasInRoom.current = showRoom;
  // 추첨 연출을 보다 당겨져 새로고침되지 않게. 회차 방은 오래 머무는 곳이라 당겨서 새로고침이 된다
  // (새로 고쳐도 서버 시각에 맞춰 그 자리로 돌아온다)
  useNoPullRefresh(!showRoom);
  if (showRoom) {
    // 방 머리 줄(「홈」)과 언덕 머리의 사람 수는 방 화면이 그린다
    return (
      <RoomView
        key={round}
        guide={guide}
        services={services}
        round={round}
        record={record}
        ticket={mine.find((m) => m.ticket.round === round)?.ticket}
        onEnter={onEnter}
        onHome={onHome}
      />
    );
  }
  // 아직 결과가 없는 회차: 남은 시간을 보이며 기다리다가 결과가 들어오는 순간 추첨 연출을 시작한다
  if (!record)
    return (
      <>
        {guide}
        <DrawWait
          services={services}
          status={status}
          round={round}
          ticket={mine.find((m) => m.ticket.round === round)?.ticket}
          onSkip={onSkip}
          onHome={onHome}
        />
      </>
    );
  const canEnter =
    status.phase === "open" &&
    status.round > round &&
    !mine.some((m) => m.ticket.round === status.round);
  return (
    <>
      {guide}
      <DrawView
        key={replays}
        instant={seen && replays === 0}
        onReplay={() => setReplays((n) => n + 1)}
        onNext={canEnter ? onEnter : undefined}
        // 첫 추첨은 끝까지 보고, 그 뒤로는 이미 결과가 나온 회차를 나중에 열 때만 건너뛸 수 있다
        canSkip={!live && services.wallet.watchedDraw()}
        onWatched={() => {
          services.wallet.markWatchedDraw();
          setWatched(true);
        }}
        record={record}
        ticket={mine.find((m) => m.ticket.round === round)?.ticket}
        clock={services.clock}
        label={roundTitle(services.ledger.schedule, round)}
        onHome={onHome}
      />
    </>
  );
}

/**
 * 추첨을 기다리는 화면(「관측지로 가기」로 결과 전에 들어왔을 때, 실시간 추첨의 첫걸음). 그 회차 하늘(내 별이 있으면
 * 표시)과 추첨까지 남은 시간. 장부를 매초 다시 읽으므로 결과가 들어오는 순간 DrawFor가 추첨 연출로 바꾼다.
 * 추첨 시각이 지났는데 아직 결과가 없으면(드랜드 값을 받는 중) 그렇게 알린다
 */
function DrawWait({
  services,
  status,
  round,
  ticket,
  onSkip,
  onHome,
}: {
  services: Services;
  status: LedgerStatus;
  round: number;
  ticket: Ticket | undefined;
  onSkip: (() => Promise<void>) | null;
  onHome?: (() => void) | undefined;
}) {
  const schedule = services.ledger.schedule;
  const drawAt = drandTime(
    drandRoundForClose(roundTimes(schedule, round).closesAt),
  );
  const left = drawAt - status.now;
  return (
    <section
      aria-label={`${roundTitle(schedule, round)} 관측`}
      data-draw-wait={round}
      className="flex flex-col gap-4"
    >
      {onHome && (
        <div className="-ml-3 self-start">
          <MenuItem target="home" label="홈" onClick={onHome} />
        </div>
      )}
      <h2 className="text-center font-bold text-xl">
        {roundTitle(schedule, round)} 관측
      </h2>
      <SkyBoard
        state={{
          mode: "draw",
          picked: ticket ? ticket.numbers : [],
          focus: null,
          lit: [],
          bonus: null,
        }}
        label={`${roundTitle(schedule, round)} 관측을 기다리는 하늘`}
        info
      />
      <div className="flex flex-col items-center gap-0.5" role="status">
        {left > 0 ? (
          <>
            <span className="text-sm text-white/60">관측까지</span>
            <span className="font-bold font-mono text-5xl text-amber-100 tabular-nums tracking-tight">
              {formatLeft(left)}
            </span>
            <span className="mt-1 text-white/50 text-xs tabular-nums">
              관측 {clockOf(drawAt)}
            </span>
          </>
        ) : (
          <span className="break-keep text-white/75">곧 별이 빛납니다.</span>
        )}
      </div>
      {onSkip && <PracticeSkip onSkip={onSkip} />}
    </section>
  );
}

export function MineView({
  services,
  mine,
  sealed = NOTHING_SEALED,
  onOpen,
  onDraw,
  onRecovered,
  onRecords,
}: {
  services: Services;
  mine: MyTicket[];
  sealed?: Sealed;
  onOpen: (m: MyTicket) => void;
  onDraw?: (round: number) => void;
  onRecovered: () => void;
  /** 「내 기록」으로(당첨 내역·관측 수첩·당첨증·훈장·기념 서류) */
  onRecords?: (() => void) | undefined;
}) {
  const sorted = [...mine].sort((a, b) => b.ticket.round - a.ticket.round);
  const [key, setKey] = useState(() => services.wallet.loadKey());
  return (
    <section className="flex flex-col gap-4" aria-label="내 예측">
      <h2 className="text-center font-bold text-lg">내 예측</h2>
      {onRecords && (
        <button
          type="button"
          onClick={onRecords}
          data-open-records
          className="sd-glass flex items-center justify-between rounded-2xl px-4 py-3 text-left hover:bg-white/10"
        >
          <span className="flex flex-col">
            <span className="font-semibold">내 기록</span>
            <span className="text-white/55 text-xs">관측 수첩과 기념 서류</span>
          </span>
          <span className="text-sm text-white/60">→</span>
        </button>
      )}
      <WinNotice
        services={services}
        tickets={mine.map((m) => m.ticket)}
        sealed={sealed}
      />
      <Inbox
        services={services}
        tickets={mine.map((m) => m.ticket)}
        sealed={sealed}
      />
      {sorted.length === 0 ? (
        <p className="py-10 text-center text-white/60">
          아직 예측하지 않았습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((m) => {
            const hidden = sealed(m.ticket.round);
            const record = hidden
              ? undefined
              : services.ledger.record(m.ticket.round);
            const rank = record ? myRank(record, m.ticket) : null;
            return (
              <li
                key={toHex(ticketId(m.ticket))}
                className="sd-glass flex items-center gap-2 rounded-2xl pr-3"
              >
                <button
                  type="button"
                  onClick={() => onOpen(m)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pl-4 text-left"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold tabular-nums">
                      {roundTitle(services.ledger.schedule, m.ticket.round)}
                    </span>
                    <span
                      className={cn(
                        "text-sm",
                        rank ? "text-amber-200" : "text-white/60",
                      )}
                    >
                      {hidden
                        ? null
                        : !record
                          ? "관측 전"
                          : record.void
                            ? "무효 회차"
                            : rank
                              ? RANK_LABEL[rank]
                              : "등수 밖"}
                    </span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {m.ticket.numbers.map((n) => (
                      <LottoBall
                        key={n}
                        n={n}
                        size="sm"
                        dim={!!record && !record.numbers.includes(n)}
                      />
                    ))}
                  </span>
                </button>
                {hidden && (
                  <DrawFirst
                    round={m.ticket.round}
                    onDraw={onDraw && (() => onDraw(m.ticket.round))}
                    className="shrink-0"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 게임 화면은 단순하게: 패스키·보안 설명은 설명 페이지(/stardraw/about#passkey)에 둔다 */}
      {!key && (
        <RecoverKey
          services={services}
          onFound={(found) => {
            setKey(found);
            onRecovered();
          }}
        />
      )}
    </section>
  );
}

/**
 * 이 기기에 패스키 기억이 없을 때: 다른 기기에서 만든 패스키(따라온 것)로 한 번 확인하고,
 * 장부에서 그 패스키의 공개 열쇠를 찾아 닫힌 회차의 내 응모권을 모은다
 */
function RecoverKey({
  services,
  onFound,
}: {
  services: Services;
  onFound: (key: KeyInfo) => void;
}) {
  const [state, setState] = useState<
    "idle" | "working" | "missing" | "cancelled" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  /** 내 응모 되찾기도 신분증 제시 틀(단추를 누르자마자 패스키) */
  const idp = useIdPresent(services);
  const find = async () => {
    setState("working");
    try {
      const key = await idp.run(
        () =>
          services.wallet.recoverPasskey((id) =>
            services.ledger.passkeyPub(id),
          ),
        {
          verb: "제시",
          pub: (k) => k.pub,
          blank: true,
          tap: true,
          readFirst: true,
          hold: FX.idHoldSubmit,
        },
      );
      if (!key) {
        setState("missing");
        return;
      }
      // 장부의 증명 API로 내 열쇠의 응모권을 찾는다(docs/36 11-30)
      for (const ticket of await services.ledger.keyTickets([key.pub], []))
        services.wallet.addTicket({
          ticket,
          // 받은 시각은 장부에 없어 그 회차가 열린 시각으로 적는다
          receivedAt: roundTimes(services.ledger.schedule, ticket.round)
            .opensAt,
        });
      onFound(key);
    } catch (err) {
      if (passkeyProblem(err) === "cancelled") setState("cancelled");
      else {
        setState("error");
        setMessage(errorText(err, "예측 기록을 복구", "찾지 않았어요"));
      }
    }
  };
  return (
    <div className="flex flex-col items-center gap-2 text-sm">
      <IdPresentView services={services} id={idp} />
      <button
        type="button"
        disabled={state === "working"}
        onClick={() => void find()}
        className="rounded-lg border border-white/25 px-3 py-1.5 hover:bg-white/10 disabled:opacity-50"
      >
        {state === "working" ? "찾고 있습니다" : "이미 우주인 등록증이 있어요"}
      </button>
      {state === "missing" && (
        <p className="break-keep text-amber-100/85 text-xs">
          장부에 없는 등록증이에요.
        </p>
      )}
      {state === "cancelled" && (
        <p className="text-amber-100/85 text-xs">확인을 취소했어요.</p>
      )}
      {state === "error" && (
        <p className="break-keep text-rose-200 text-xs">
          {message ?? "찾지 못했어요. 잠시 뒤 다시 해 주세요."}
        </p>
      )}
    </div>
  );
}

export function RoundsView({
  services,
  version,
  sealed = NOTHING_SEALED,
  onOpen,
  onDraw,
  onStats,
}: {
  services: Services;
  version: number;
  sealed?: Sealed;
  onOpen: (round: number) => void;
  /** 가린 회차는 회차 결과 대신 추첨으로 */
  onDraw?: (round: number) => void;
  /** 관측 기록(통계)으로. 없으면 링크를 두지 않는다(데모 둘러보기) */
  onStats?: () => void;
}) {
  const [sessions, setSessions] = useState<CheckSession[]>([]);
  const [limit, setLimit] = useState(24);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 읽는다
  useEffect(() => {
    void services.checker.list().then(setSessions);
  }, [services, version]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 읽는다
  const closed = useMemo(
    () => services.ledger.closed().slice().reverse(),
    [services, version],
  );
  const openChecks = sessions.filter(isActive);
  const waitingStars = openChecks.filter((s) => s.status === "signed").length;

  return (
    <section className="flex flex-col gap-4" aria-label="지난 회차">
      <div className="flex items-center justify-between">
        <span className="w-16" />
        <h2 className="font-bold text-lg">지난 회차</h2>
        {onStats ? (
          <button
            type="button"
            onClick={onStats}
            className="w-16 text-right text-sm text-white/70 hover:text-white"
          >
            관측 기록
          </button>
        ) : (
          <span className="w-16" />
        )}
      </div>
      {openChecks.length > 0 && (
        <p className="sd-breathe rounded-xl border border-sky-200/25 bg-sky-300/5 px-4 py-3 text-sm">
          확인 중인 입상자 {openChecks.length}건
          {waitingStars > 0
            ? ` · 별 세 개를 기다리는 중 ${waitingStars}건`
            : ""}
        </p>
      )}
      {closed.length === 0 ? (
        <p className="py-10 text-center text-white/60">
          아직 관측한 회차가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {closed.slice(0, limit).map(({ record }) => (
            <li key={record.round}>
              <RoundRow
                record={record}
                sealed={sealed(record.round)}
                label={roundTitle(services.ledger.schedule, record.round)}
                onOpen={() =>
                  sealed(record.round) && onDraw
                    ? onDraw(record.round)
                    : onOpen(record.round)
                }
              />
            </li>
          ))}
        </ul>
      )}
      {closed.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + 24)}
          className="rounded-xl border border-white/15 py-2 text-sm hover:bg-white/10"
        >
          더 보기
        </button>
      )}
    </section>
  );
}

function RoundRow({
  record,
  sealed,
  label,
  onOpen,
}: {
  record: RoundRecord;
  /** 추첨을 아직 열어 보지 않은 내 회차: 결과와 당첨 수 대신 「추첨 보기」 */
  sealed: boolean;
  /** 보이는 회차 이름(roundTitle) */
  label: string;
  onOpen: () => void;
}) {
  const counts = winnerCounts(record);
  const winners = RANKS.reduce((s, r) => s + counts[r], 0);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-round={record.round}
      className="sd-glass flex w-full flex-col gap-2 rounded-2xl px-4 py-3 text-left"
    >
      <span className="flex items-baseline justify-between">
        <span className="font-semibold tabular-nums">{label}</span>
        <span className="text-white/55 text-xs tabular-nums">
          예측서 {record.count}장{sealed ? "" : ` · 입상 ${winners}장`}
        </span>
      </span>
      {sealed ? (
        <DrawFirst round={record.round} className="self-start" />
      ) : record.void ? (
        <span className="text-amber-300/90 text-sm">무효 회차</span>
      ) : (
        <span className="flex flex-wrap items-center gap-1">
          {record.numbers.map((n) => (
            <LottoBall key={n} n={n} size="sm" />
          ))}
          <span className="px-0.5 text-white/40">+</span>
          <LottoBall n={record.bonus} size="sm" />
        </span>
      )}
    </button>
  );
}

function RoundDetail({
  services,
  round,
  mine,
  sealed,
  onList,
  onDraw,
}: {
  services: Services;
  round: number;
  mine: MyTicket[];
  sealed: Sealed;
  /**
   * 「← 지난 회차」: 어디서 들어왔든 늘 지난 회차 목록으로(뒤로 가기로 두면 첫 화면에서 들어온 사람은 첫 화면으로 갔다,
   * 2026-11-01 사용자 B안)
   */
  onList: () => void;
  onDraw: (round: number) => void;
}) {
  const record = services.ledger.record(round);
  const [report, setReport] = useState<RoundCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  /** 그 회차 응모권(회차 파일 하나, docs/36 11-30). 받기 전에는 소속 표시를 비워 둔다 */
  const [roundTickets, setRoundTickets] = useState<readonly Ticket[]>([]);
  const closedNow = !!record;
  useEffect(() => {
    if (!closedNow) return;
    let alive = true;
    void services.ledger
      .roundTickets(round)
      .then((list) => {
        if (alive) setRoundTickets(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [services, round, closedNow]);
  const [checking, setChecking] = useState(false);
  /** 이 기기에서 당첨자 확인을 마친 응모권 */
  const [checked, setChecked] = useState<Map<string, CheckSession>>(new Map());
  // 소속 표시는 규칙 패키지로 판정한다(도장·자격 서명·기간·중복, 2026-10-31 보안 검토 B1)
  const [qualInfo, setQualInfo] = useState<QualInfo | null>(null);
  useEffect(() => {
    void services.ledger
      .qualInfo()
      .then(setQualInfo)
      .catch(() => {});
  }, [services]);
  useEffect(() => {
    void services.checker.confirmed().then(setChecked);
  }, [services]);
  if (!record) return null;
  const counts = winnerCounts(record);
  const myIds = new Set(mine.map((m) => toHex(ticketId(m.ticket))));
  const prize = prizeEligible(
    roundTickets,
    qualInfo
      ? qualMarks(
          services.ledger.schedule,
          qualInfo,
          round,
          roundTimes(services.ledger.schedule, round).closesAt,
          roundTickets,
        )
      : undefined,
  );
  const myExcluded = mine.some(
    (m) =>
      m.ticket.round === round &&
      m.ticket.qual &&
      !prize.eligible.has(toHex(ticketId(m.ticket))),
  );
  const prizeWinners = RANKS.flatMap((r) =>
    record.winners[r].filter((id) => prize.eligible.has(toHex(id))),
  ).length;
  const hidden = sealed(round);

  return (
    <section
      className="flex flex-col gap-4"
      aria-label={roundTitle(services.ledger.schedule, round)}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onList}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 지난 회차
        </button>
        <h2 className="font-bold text-lg tabular-nums">
          {roundTitle(services.ledger.schedule, round)}
        </h2>
        {hidden ? (
          <span className="w-16" />
        ) : (
          <button
            type="button"
            onClick={() => onDraw(round)}
            className="text-sm text-white/70 hover:text-white"
          >
            관측 보기
          </button>
        )}
      </div>
      {hidden && (
        <div className="sd-glass flex justify-center rounded-2xl p-4">
          <DrawFirst round={round} onDraw={() => onDraw(round)} />
        </div>
      )}
      {!hidden && !record.void && (
        <div className="sd-glass flex flex-wrap items-center justify-center gap-1.5 rounded-2xl p-4">
          {record.numbers.map((n) => (
            <LottoBall key={n} n={n} />
          ))}
          <span className="px-1 text-white/40">+</span>
          <LottoBall n={record.bonus} />
        </div>
      )}
      <p className="text-center text-white/55 text-xs tabular-nums">
        예측서 {record.count}장 · 마감 {formatTime(closesOf(services, round))}
      </p>

      {!hidden && prize.any && (
        <p
          className="break-keep text-center text-amber-100/90 text-sm"
          data-prize-summary
        >
          소속이 표시된 입상 {prizeWinners}장
          {prize.excluded > 0 &&
            ` · 같은 소속 증서로 낸 장은 소속 표시에서 빠졌습니다`}
        </p>
      )}
      {myExcluded && (
        <p
          role="alert"
          className="break-keep rounded-lg bg-rose-500/15 px-3 py-2 text-rose-100 text-sm"
          data-prize-mine-excluded
        >
          이 회차에 내 소속 증서가 다른 곳에서도 쓰였습니다. 복구 코드가 새
          나갔을 수 있습니다. 다음 자격 기간에 새로 받아 주세요.
        </p>
      )}

      {!hidden && (
        <ul className="flex flex-col gap-2" aria-label="등수별 입상자">
          {RANKS.map((rank) => (
            <li
              key={rank}
              data-rank={rank}
              className="sd-glass flex flex-col gap-2 rounded-2xl px-4 py-3"
            >
              <span className="flex items-center justify-between gap-2">
                <span>
                  <b>{RANK_LABEL[rank]}</b>{" "}
                  <span className="text-white/55 text-xs">
                    {RANK_RULE[rank]}
                  </span>
                </span>
                {/* 회차마다 1인 1장이라 예측서 수가 곧 사람 수(관측 뒤 등수별 인원 줄 winnersLine과 같은 「명」) */}
                <span className="text-sm tabular-nums">{counts[rank]}명</span>
              </span>
              {record.winners[rank].map((id) => {
                const hex = toHex(id);
                const done = checked.get(hex);
                const nickname = record.nicknames.find(
                  (n) => toHex(n.ticketId) === hex,
                )?.nickname;
                return (
                  <span
                    key={hex}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-mono text-white/70 tabular-nums">
                      <span className="mr-1.5 font-sans text-white/45 text-xs">
                        일련번호
                      </span>
                      {shortId(hex)}
                    </span>
                    <span className="text-white/80">
                      {myIds.has(hex) ? "내 예측서" : (nickname ?? "익명")}
                      {prize.eligible.has(hex) && (
                        <span
                          className="ml-1.5 rounded bg-amber-200/15 px-1.5 py-0.5 text-amber-100 text-xs"
                          data-prize-eligible
                        >
                          소속
                        </span>
                      )}
                    </span>
                    {done && (
                      <span
                        data-checked={hex}
                        className="w-full text-emerald-200/90 text-xs"
                      >
                        확인함
                        {done.confirmedAt
                          ? ` · ${monthDay(done.confirmedAt)}`
                          : ""}
                      </span>
                    )}
                  </span>
                );
              })}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 p-4">
        <button
          type="button"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            setCheckError(null);
            try {
              setReport(
                await services.ledger.verifyRound(
                  round,
                  mine
                    .filter((m) => m.ticket.round === round)
                    .map((m) => ticketId(m.ticket)),
                ),
              );
            } catch (err) {
              setCheckError(
                errorText(err, "이 회차를 확인", "확인하지 않았어요"),
              );
            } finally {
              setChecking(false);
            }
          }}
          className="self-start rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          {checking ? "확인하고 있습니다" : "이 회차 확인"}
        </button>
        {checkError && (
          <p role="alert" className="break-keep text-rose-200 text-sm">
            {checkError}
          </p>
        )}
        {report && (
          <div
            role="status"
            className="text-sm"
            data-verify={report.problems.length === 0 ? "ok" : "fail"}
          >
            {report.problems.length === 0 ? (
              <p className="text-emerald-200">문제가 없습니다</p>
            ) : (
              <ul className="list-disc pl-5 text-rose-200">
                {/* 가린 회차의 문제는 회차만(문구에 당첨 번호가 들어갈 수 있다) */}
                {report.problems.map((p) => (
                  <li key={`${p.round}-${p.message}`}>
                    {sealed(p.round) ? (
                      <span className="inline-flex items-center gap-2">
                        {roundShort(services.ledger.schedule, p.round)}
                        <DrawFirst
                          round={p.round}
                          onDraw={() => onDraw(p.round)}
                        />
                      </span>
                    ) : (
                      `${roundShort(services.ledger.schedule, p.round)}: ${p.message}`
                    )}
                  </li>
                ))}
              </ul>
            )}
            {services.practice ? (
              <p className="mt-1 text-white/50 text-xs">
                연습 장부라 빛난 별과 마감 시각은 따로 확인하지 않습니다.
              </p>
            ) : (
              <p className="mt-1 text-white/50 text-xs">
                장부 전체는{" "}
                <a href="/stardraw/verify" className="underline">
                  검증하기
                </a>
                에서 처음부터 검사합니다.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function closesOf(services: Services, round: number): number {
  return roundTimes(services.ledger.schedule, round).closesAt;
}

/** 확인한 날짜(예: 10/30) */
function monthDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
