"use client";

import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChatBox } from "@/components/ChatBox";
import { ConnectingNotice } from "@/components/ConnectingNotice";
import { FairLine, RoomKindPicker } from "@/components/FairLine";
import { HIT_AREA } from "@/components/hit-area";
import { InviteLink } from "@/components/InviteLink";
import {
  NameForm,
  NameInput,
  RoomBackLink,
  RoomError,
  RoomFootnote,
  usePlayerNameField,
} from "@/components/online-room";
import { ActionButton } from "@/components/panels/common";
import { SAFE_P4 } from "@/components/safe-area";
import { workerBotOption } from "@/game/bot-runner";
import type { MatchHost, Snapshot } from "@/game/host";
import type { GameKit, KitBot } from "@/game/kit";
import { useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";
import { recordAudit } from "@/net/audit-history";
import { auditChatText, auditNotice } from "@/net/audit-text";
import { useChat } from "@/net/chat";
import type { ClaimHub } from "@/net/claim-hub";
import {
  announceRoundVerified,
  bindFair,
  endVoteOf,
  reportIncident,
  useFairBar,
} from "@/net/fair-bar";
import { type AuditResult, GuestRoom, OTHER_GAME_ROOM } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import {
  type HostRestore,
  sessionHostStore,
  setHostingRoom,
} from "@/net/host-store";
import type { LobbyState } from "@/net/protocol";
import { roomGameKey, useRematch } from "@/net/rematch-store";
import { endRoomSession } from "@/net/room-session";
import {
  fairStoreFor,
  hostFingerprintFromUrl,
  inviteUrl,
  loadSeatToken,
  openTransport,
  saveSeatToken,
  testVoteDelayMs,
} from "@/net/session";
import { randomId } from "@/net/transport";
import { type ArchiveTarget, saveGuestArchive } from "@/review/recorder";
import { sessionPeople } from "@/stats/people";
import type { StatsTarget } from "@/stats/recorder";

type Phase = "name" | "connecting" | "lobby" | "full" | "kicked" | "error";

/** 빈자리·끊긴 자리를 맡는 컴퓨터의 기본 단계(중수) */
const DEFAULT_BOT_LEVEL = 1;

const EMPTY_LOBBY: LobbyState = { seats: [], ruleCode: "", started: true };

/** 방 화면이 게임 저장소에서 쓰는 부분(모든 게임 저장소가 갖췄다) */
export interface RoomStore {
  reconnecting: boolean;
  hostLeft: boolean;
  /** 내 기기의 판 끝 검증이 실패했으면 그 사유(이 게임은 무효) */
  invalid: string | null;
  offlineSeats: number[];
  notice: string | null;
  setSeatNames(seatNames: string[]): void;
}

/** zustand 저장소 훅에서 이 화면이 쓰는 부분 */
export interface StoreHook<T> {
  <U>(selector: (state: T) => U): U;
  getState(): T;
  setState(partial: Partial<T>): void;
}

/** 방장이 연 대국(`LocalMatch`)이나 참가자가 받은 대국(`RemoteMatch`) */
export type RoomMatch<View, ActionT, Event> = MatchHost<
  View,
  ActionT,
  Event
> & {
  drain(): Snapshot<View, Event>[];
};

/** 대국을 게임 저장소에 붙일 때 넘기는 것 */
export interface RoomAttach<View> {
  seatNames: string[];
  /** 내 기록(같은 방은 같은 대국이라 새로고침해도 같은 판을 두 번 남기지 않는다) */
  stats: StatsTarget;
  /** 방장: 복기용 기록은 방이 내준다(참가자는 판 끝 검증 뒤 방에서 받아 남긴다) */
  archive?: ArchiveTarget;
  /** 방장을 거치지 않고 모두에게 가는 청구(원카드 「원카드!」) */
  claims: ClaimHub<View> | null;
}

/** 이 화면이 그리는 방 단계에서 게임마다 넣는 조각 */
export interface RoomLobbyProps<Rules> {
  lobby: LobbyState;
  isHost: boolean;
  rules: Rules;
}

/**
 * 게임마다 다른 것. 나머지(이름·대기실·초대·채팅·검증·재연결·기록·암호화방)는 `RoomScreen`이 같이 맡는다.
 * 판 게임은 `boardRoom`(board-room.ts)으로 만든다
 */
export interface RoomGame<
  Rules,
  State,
  View extends { decision: unknown },
  ActionT,
  Event,
  Extra,
> {
  kit: GameKit<Rules, State, View, ActionT, Event, Extra>;
  /** 화면에 보이는 게임 이름. 예: "오목" */
  name: string;
  /** 제목. 없으면 「○○ 방 만들기」·「초대받은 ○○ 방에 들어가기」 */
  title?: { host: string; guest: string };
  /** 초대 링크를 보낼 때 제목. 예: "오목 한 판 하자" */
  shareTitle: string;
  /** 지금 들어가 있는 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
  session: {
    host: HostRoom<Rules, State, View, ActionT, Event, Extra> | null;
    guest: GuestRoom<Rules, State, View, ActionT, Event, Extra> | null;
  };
  useStore: StoreHook<RoomStore>;
  /** 대국을 게임 저장소에 붙인다 */
  attach(match: RoomMatch<View, ActionT, Event>, ctx: RoomAttach<View>): void;
  /** 단계별 컴퓨터 */
  botFor(level: number): KitBot<View, ActionT>;
  /** 빈자리·끊긴 자리를 맡는 컴퓨터 단계. 없으면 중수 */
  botLevel?(): number;
  /** 컴퓨터 수를 웹 워커에서 센다(`workerBotOption`). 기본은 켬 */
  workerBot?: boolean;
  /** 컴퓨터 수 사이에 차례를 넘기는 방법. 없으면 바로 */
  pace?(next: () => void): void;
  /** 끊긴 사람 대신 컴퓨터가 두기까지 기다리는 시간. 없으면 방 기본값 */
  standInMs?: number;
  /** 온라인 방에서 쓰는 규칙(혼자 하기 규칙과 다르면) */
  hostRules?(rules: Rules): Rules;
  /** 방장이 저장해 둔 내 규칙이면 그 이름 */
  ruleName?(rules: Rules): string | undefined;
  /** 방장이 방을 만들 때 보이는 규칙 요약(꼬리표) */
  rulesSummary(rules: Rules): string;
  /** 규칙 요약 아래 설명 문장(있으면) */
  rulesNote?(rules: Rules): string;
  /** 친구가 한 명이라도 들어와야 시작할 수 있다 */
  needsFriend?: boolean;
  /** 대기실에서 컴퓨터가 앉은 자리 옆 글 */
  botSeatLabel: string;
  /** 방장이 내보냈을 때 글. 없으면 「방장이 방에서 내보냈어요.」 */
  kickedText?: string;
  /** 맨 아래 연결 안내 글 */
  footnote: string;
  /** 이름 칸 안내 */
  namePlaceholder?: string;
  /** 바탕 */
  theme: { background: string; dataGame?: string };
  /** 제목 위 그림(있으면) */
  header?: ReactNode;
  /**
   * 멘탈 포커(암호화방)를 쓰는 카드 게임. 방 종류 고르기, 대기실 암호화방 줄, 「이 방은 어떻게 지켜지나요?」,
   * 섞는 중·부정 알림·끝내기 투표(`useFairBar`)를 잇는다
   */
  fair?: boolean;
  /** 판 끝 검증 알림 제목과 통과 글. 없으면 「기록 확인」·「진행에 문제가 없어요.」 */
  auditNotice?: { title: string; ok: string };
  /** 참가자: 판 끝 검증 결과를 저장소에도 남긴다(있으면) */
  onAudit?(result: AuditResult): void;
  /** 참가자 복기 기록에 적을 판 번호. 없으면 `view.roundNumber` */
  roundOf?(view: View): number;
  /** 대기실에 규칙 문자열을 보인다 */
  showRuleCode?: boolean;
  /** 대기실 맨 위 규칙 줄(있으면, 예: 마이티 규칙 고르기) */
  LobbyRules?: ComponentType<RoomLobbyProps<Rules>>;
  /** 이름 단계 맨 아래(있으면, 예: 마이티 지난 게임 공정성 검증 기록) */
  NameExtra?: ComponentType;
}

function seatNamesOf(lobby: LobbyState): string[] {
  return lobby.seats.map((s) => s.name);
}

function offlineSeatsOf(lobby: LobbyState): number[] {
  return lobby.seats
    .filter((s) => s.kind === "guest" && !s.connected)
    .map((s) => s.seat);
}

function roundNumberOf(view: unknown): number {
  const round = (view as { roundNumber?: unknown }).roundNumber;
  return typeof round === "number" ? round : 0;
}

/** 친구와 하기: 방장은 방을 만들어 초대 링크를 보내고, 친구는 링크로 들어온다. 빈자리는 컴퓨터가 앉는다 */
export function RoomScreen<
  Rules,
  State,
  View extends { decision: unknown },
  ActionT,
  Event,
  Extra,
>({
  game,
  rules,
  roomFromUrl,
  resume,
  onBack,
  onPlaying,
}: {
  game: RoomGame<Rules, State, View, ActionT, Event, Extra>;
  rules: Rules;
  /** 초대 링크로 들어왔으면 방 코드 */
  roomFromUrl: string | null;
  /** 방장이 새로고침했으면 이 탭이 연 방과 남긴 것 */
  resume?: { room: string; restore: HostRestore };
  onBack: () => void;
  onPlaying: () => void;
}) {
  const { kit, session, useStore, LobbyRules, NameExtra } = game;
  const gameId = kit.id;
  const setPlayerName = useSettings((s) => s.setPlayerName);
  const reconnecting = useStore((s) => s.reconnecting);
  const hostLeft = useStore((s) => s.hostLeft);
  const [name, setName] = usePlayerNameField();
  const [phase, setPhase] = useState<Phase>("name");
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [roomCode] = useState(
    () => roomFromUrl ?? resume?.room ?? randomId(16),
  );
  /** 이 방 `gameNo`번째 게임의 내 기록 대상(한 판 더로 시작한 게임은 따로 남는다) */
  const statsFor = (gameNo: number) => ({
    game: gameId,
    mode: "online" as const,
    key: `online:${roomGameKey(roomCode, gameNo)}`,
    /** 같이 앉은 사람(나와 컴퓨터 빼고). 이 기기 내 기록에만 남는다 */
    people: sessionPeople(session),
  });
  /** 방장: 복기용 기록은 방이 내준다(암호화방이면 판별 실제 패까지) */
  const hostArchive = (
    host: HostRoom<Rules, State, View, ActionT, Event, Extra>,
  ): ArchiveTarget => ({
    ...statsFor(host.gameNo),
    seat: 0,
    seatNames: seatNamesOf(host.lobby()),
    source: () => host.archiveSource(),
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 방장 공개 열쇠 지문. 초대 링크에 넣는다 */
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const isHost = roomFromUrl === null;
  const started = useRef(false);

  // 방장이 새로고침했으면 이름을 다시 묻지 않고 그 방을 다시 연다.
  const resumed = useRef(false);
  useEffect(() => {
    if (!resume || resumed.current) return;
    resumed.current = true;
    void enter();
  });

  /**
   * 판 끝 검증 결과를 채팅에 남긴다. 게임을 무효로 표시하는 것은 **내 기기의 검증**뿐이다.
   * 다른 사람의 실패 알림은 그 사람의 주장으로만 보여 준다. 판 끝 기록은 모두 같은 것을 받으므로,
   * 남이 거짓으로 "실패"라고 알려 게임을 무효로 만드는 것을 막는다(모의 침투 B3). 내 검증인지는 `own`으로만 가린다
   * (이름 「나」로 가리면 이름을 「나」로 지은 참가자의 주장이 내 검증이 된다).
   */
  const onAuditReport = (
    who: string,
    own: boolean,
    ok: boolean,
    reason?: string,
    unchecked?: string,
  ) => {
    useChat.getState().receive({
      id: randomId(8),
      seat: -1,
      name: "검증",
      text: auditChatText(who, own, ok, reason, unchecked),
    });
    if (own) {
      const failure = ok ? null : `${who}: ${reason ?? "알 수 없는 문제"}`;
      if (failure) useStore.setState({ invalid: failure });
      recordAudit(roomGameKey(roomCode, session.guest?.gameNo ?? 1), failure);
    }
  };

  const syncLobby = (l: LobbyState) => {
    setLobby(l);
    if (isHost)
      useRematch.setState({
        blocked:
          game.needsFriend === true &&
          !l.seats.some((s) => s.kind === "guest" && s.connected),
      });
    useStore.getState().setSeatNames(seatNamesOf(l));
    useStore.setState({ offlineSeats: offlineSeatsOf(l) });
    if (game.fair)
      useFairBar.setState({
        endVote: endVoteOf(l),
        names: seatNamesOf(l),
        offline: offlineSeatsOf(l),
      });
  };

  /** 방장: 대국을 저장소에 붙이고, 암호화방이면 섞는 중·부정 알림·끝내기를 화면에 잇는다 */
  const attachHost = (
    host: HostRoom<Rules, State, View, ActionT, Event, Extra>,
    match: RoomMatch<View, ActionT, Event>,
  ) => {
    game.attach(match, {
      seatNames: seatNamesOf(host.lobby()),
      stats: statsFor(host.gameNo),
      archive: hostArchive(host),
      claims: host.claims,
    });
    if (game.fair)
      bindFair(
        host.fair?.coordinator,
        () => host.abandon(),
        (end) => host.vote(end),
      );
  };

  /** 방장: 판 끝 「한 판 더」. 같은 방·같은 규칙으로 새 게임을 시작해 대국 화면에 붙인다 */
  const rematch = async (
    host: HostRoom<Rules, State, View, ActionT, Event, Extra>,
  ) => {
    if (useRematch.getState().busy) return;
    useRematch.setState({ busy: true });
    try {
      const match = await host.rematch();
      if (match && session.host === host) {
        // 앞 게임의 무효 표시·알림·부정 알림·섞는 중 표시는 새 게임에 남기지 않는다.
        useStore.setState({ invalid: null, notice: null });
        useFairBar.getState().clearRound();
        attachHost(host, match);
      }
    } catch (e) {
      useStore.setState({ notice: e instanceof Error ? e.message : String(e) });
    } finally {
      useRematch.setState({ busy: false });
    }
  };

  const enter = async () => {
    const trimmed = name.trim() || (isHost ? "방장" : "손님");
    setPlayerName(trimmed);
    setPhase("connecting");
    try {
      const transport = await openTransport(roomCode, {
        role: isHost ? "host" : "guest",
        game: gameId,
      });
      if (isHost) {
        const level = game.botLevel?.() ?? DEFAULT_BOT_LEVEL;
        const hostRules = game.hostRules ? game.hostRules(rules) : rules;
        const ruleName = game.ruleName?.(hostRules);
        const host = new HostRoom<Rules, State, View, ActionT, Event, Extra>({
          kit,
          transport,
          hostName: resume?.restore.saved.hostName ?? trimmed,
          rules: hostRules,
          ...(ruleName ? { ruleName } : {}),
          store: sessionHostStore(roomCode),
          ...(resume ? { restore: resume.restore } : {}),
          bot: game.botFor(level),
          botLevel: level,
          ...(game.workerBot === false
            ? {}
            : workerBotOption({ game: gameId, level })),
          botNames: useSettings.getState().botNames,
          ...(game.standInMs !== undefined
            ? { standInDelayMs: game.standInMs }
            : {}),
          pace: game.pace ?? ((next) => setTimeout(next, 0)),
          ...(game.fair ? testVoteDelayMs() : {}),
          ...(game.fair && useSettings.getState().fairPlay
            ? { fair: { group: "r255" as const } }
            : {}),
        });
        session.host = host;
        setFingerprint(await host.fingerprint());
        useChat.getState().reset();
        useChat.setState({ send: (text) => host.chat(text) });
        host.onChat((m) => useChat.getState().receive(m));
        host.onReport((r) => onAuditReport(r.name, false, r.ok, r.reason));
        if (game.fair)
          host.onIncident((n) => reportIncident(n, seatNamesOf(host.lobby())));
        host.onOwnError((e) => useStore.setState({ notice: e }));
        useRematch.setState({
          role: "host",
          busy: false,
          start: () => void rematch(host),
        });
        host.onLobby(syncLobby);
        setHostingRoom(gameId, roomCode);
        setPhase("lobby");
        // 새로고침 전에 게임 중이었으면 바로 게임 화면으로 간다. 참가자들은 토큰으로 다시 들어온다.
        if (host.match) {
          started.current = true;
          attachHost(host, host.match);
          onPlaying();
        }
      } else {
        const saved = loadSeatToken(roomCode);
        const guest = new GuestRoom<Rules, State, View, ActionT, Event, Extra>({
          kit,
          transport,
          name: trimmed,
          token: saved?.token ?? null,
          ...(saved ? { secret: saved.secret } : {}),
          ...(hostFingerprintFromUrl()
            ? { hostFingerprint: hostFingerprintFromUrl() as string }
            : {}),
          ...(game.fair ? { fairStore: fairStoreFor(roomCode) } : {}),
        });
        session.guest = guest;
        useChat.getState().reset();
        useChat.setState({ send: (text) => guest.chat(text) });
        guest.on("chat", (m) => useChat.getState().receive(m));
        guest.on("seat", (_seat, token) =>
          saveSeatToken(roomCode, { token, secret: guest.secret }),
        );
        guest.on("lobby", (l) => {
          // 이 기기가 읽지 못하는 규칙(아직 열지 않은 하늘 등)이면 방에 들어가지 않는다.
          const decoded = kit.decodeRules(l.ruleCode);
          if (!decoded.ok) {
            guest.leave();
            session.guest = null;
            setError(`이 방의 규칙을 열 수 없어요: ${decoded.reason}`);
            setPhase("error");
            return;
          }
          syncLobby(l);
          setPhase("lobby");
        });
        guest.on("full", () => setPhase("full"));
        guest.on("kicked", () => setPhase("kicked"));
        useRematch.setState({ role: "guest", busy: false, start: null });
        guest.on("hostLeft", () => {
          useStore.setState({ hostLeft: true, reconnecting: false });
          // 방장이 나갔으니 한 판 더를 기다리지 않는다.
          useRematch.setState({ role: null });
        });
        // 한 판 더: 앞 게임 검증을 마치고 새 게임을 기다린다. 다음 첫 화면을 새 대국으로 붙인다.
        guest.on("rematch", () => {
          started.current = false;
          useStore.setState({ invalid: null, notice: null });
          useFairBar.getState().clearRound();
        });
        guest.on("connection", (state) =>
          useStore.setState({ reconnecting: state === "reconnecting" }),
        );
        guest.on("rejected", (e) => {
          useStore.setState({ notice: e });
          if (e === OTHER_GAME_ROOM) {
            setError(e);
            setPhase("error");
          }
        });
        guest.on("audit", (result) => {
          const texts = game.auditNotice ?? {
            title: "기록 확인",
            ok: "진행에 문제가 없어요.",
          };
          game.onAudit?.(result);
          useStore.setState({
            notice: auditNotice(result, texts.title, texts.ok),
          });
          onAuditReport(
            "나",
            true,
            result.ok,
            result.ok ? undefined : result.reason,
            result.ok ? result.unchecked : undefined,
          );
        });
        guest.on("report", (r) =>
          onAuditReport(r.name, false, r.ok, r.reason, r.unchecked),
        );
        if (game.fair) {
          guest.on("incident", (n) =>
            reportIncident(n, seatNamesOf(guest.lobby ?? EMPTY_LOBBY)),
          );
          guest.on("roundVerified", announceRoundVerified);
        }
        // 판 검증(암호화방)·게임 끝 검증을 통과할 때마다 복기용으로 남긴다.
        guest.on("archive", (source) => {
          const view = guest.match?.current();
          saveGuestArchive(
            {
              ...statsFor(guest.gameNo),
              seat: guest.seat ?? 0,
              seatNames: seatNamesOf(guest.lobby ?? EMPTY_LOBBY),
            },
            source,
            view ? (game.roundOf ?? roundNumberOf)(view) : 0,
            view ? kit.isOver(view) : false,
          );
        });
        guest.on("match", (match) => {
          if (started.current) return;
          started.current = true;
          game.attach(match, {
            seatNames: seatNamesOf(guest.lobby ?? EMPTY_LOBBY),
            stats: statsFor(guest.gameNo),
            claims: guest.claims,
          });
          if (game.fair)
            bindFair(guest.fair?.coordinator, null, (end) => guest.vote(end));
          onPlaying();
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  /** 연결하지 못했을 때 같은 방 주소로 다시 잇는다 */
  const retry = () => {
    endRoomSession(session);
    setError(null);
    void enter();
  };

  const start = async () => {
    const host = session.host;
    if (!host || starting) return;
    setStarting(true);
    try {
      attachHost(host, await host.start());
      onPlaying();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  };

  const link =
    typeof window === "undefined" || !fingerprint
      ? ""
      : inviteUrl(roomCode, fingerprint);
  const friendIn = lobby?.seats.some((s) => s.kind === "guest") ?? false;
  const waitFriend = game.needsFriend === true && !friendIn;
  const title = game.title ?? {
    host: `${game.name} 방 만들기`,
    guest: `초대받은 ${game.name} 방에 들어가기`,
  };

  return (
    <main
      {...(game.theme.dataGame ? { "data-game": game.theme.dataGame } : {})}
      className={cn(
        "flex min-h-dvh items-center justify-center p-4 text-white",
        SAFE_P4,
        game.theme.background,
      )}
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl">
        {game.header}
        <h2 className="text-center font-bold text-lg">
          {isHost ? title.host : title.guest}
        </h2>

        {phase === "name" && (
          <NameForm onSubmit={() => void enter()}>
            <NameInput
              value={name}
              onChange={setName}
              {...(game.namePlaceholder
                ? { placeholder: game.namePlaceholder }
                : {})}
            />
            {isHost && (
              <p className="text-white/60 text-xs">
                {game.rulesSummary(rules)}
              </p>
            )}
            {isHost && game.rulesNote && (
              <p className="text-white/60 text-xs">{game.rulesNote(rules)}</p>
            )}
            {isHost && game.fair && <RoomKindPicker />}
            <ActionButton type="submit" className="py-3 text-base">
              {isHost ? "방 만들기" : "들어가기"}
            </ActionButton>
            {NameExtra && <NameExtra />}
          </NameForm>
        )}

        {phase === "connecting" && <ConnectingNotice isHost={isHost} />}

        {phase === "lobby" && lobby && (
          <>
            {(reconnecting || hostLeft) && (
              <p
                role="status"
                className="rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm"
              >
                {hostLeft
                  ? "방장이 방을 나갔어요."
                  : "방장과 연결이 끊겼어요. 다시 연결하는 중…"}
              </p>
            )}
            {isHost && (
              <InviteLink
                link={link}
                roomCode={roomCode}
                shareTitle={game.shareTitle}
              />
            )}
            {LobbyRules && (
              <LobbyRules lobby={lobby} isHost={isHost} rules={rules} />
            )}
            {game.fair && (
              <FairLine
                lobby={lobby}
                isHost={isHost}
                setFair={(fair) => session.host?.setFair(fair)}
              />
            )}
            {game.showRuleCode && (
              <p className="text-white/70 text-xs">
                규칙 문자열{" "}
                <span className="select-all font-mono">{lobby.ruleCode}</span>
              </p>
            )}
            <div className="flex flex-col gap-1">
              {lobby.seats.map((s) => (
                <div
                  key={s.seat}
                  data-lobby-seat={s.seat}
                  className={cn(
                    "flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-sm",
                    s.kind === "bot" ? "bg-white/5 opacity-60" : "bg-white/10",
                  )}
                >
                  <span>
                    {s.name}
                    {s.kind === "host" && (
                      <span className="ml-2 rounded bg-amber-400 px-1 text-[10px] text-black">
                        방장
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-xs opacity-70">
                    {s.kind === "bot"
                      ? game.botSeatLabel
                      : s.connected
                        ? "들어옴"
                        : "연결 끊김"}
                    {isHost && s.kind === "guest" && (
                      <button
                        type="button"
                        onClick={() => session.host?.kick(s.seat)}
                        className={cn(
                          HIT_AREA,
                          "rounded bg-white/10 px-1.5 py-0.5 hover:bg-red-500/60",
                        )}
                      >
                        내보내기
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <ChatBox mySeat={isHost ? 0 : (session.guest?.seat ?? null)} />
            {isHost ? (
              <ActionButton
                className="py-3 text-base"
                disabled={starting || waitFriend}
                onClick={() => void start()}
              >
                {starting
                  ? "시작하는 중…"
                  : waitFriend
                    ? "친구가 들어오면 시작할 수 있어요."
                    : "시작하기"}
              </ActionButton>
            ) : (
              <p className="text-center text-sm opacity-80">
                방장이 시작하기를 기다리는 중…
              </p>
            )}
          </>
        )}

        {phase === "full" && (
          <p className="text-center text-sm">
            자리가 다 찼거나 이미 시작한 방이에요.
          </p>
        )}
        {phase === "kicked" && (
          <p className="text-center text-sm">
            {game.kickedText ?? "방장이 방에서 내보냈어요."}
          </p>
        )}
        {phase === "error" && (
          <RoomError error={error} onRetry={retry} onBack={onBack} />
        )}

        {game.fair && (
          <a
            href="/security"
            target="_blank"
            rel="noreferrer"
            className="text-center text-sky-300 text-xs underline opacity-80"
          >
            이 방은 어떻게 지켜지나요?
          </a>
        )}
        <RoomFootnote>{game.footnote}</RoomFootnote>
        {phase !== "error" && <RoomBackLink onBack={onBack} phase={phase} />}
      </div>
    </main>
  );
}
