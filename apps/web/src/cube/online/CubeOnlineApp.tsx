"use client";

import { botSkillLabel, levelText } from "@game/cube-ai";
import { useEffect, useRef, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { ConnectingNotice } from "@/components/ConnectingNotice";
import { InviteLink } from "@/components/InviteLink";
import { useSettings } from "@/game/settings";
import { useChat } from "@/net/chat";
import { raceClock } from "@/net/race/race-session";
import { inviteUrl, isLocalNet } from "@/net/session";
import { joinBroadcast, randomId, type Transport } from "@/net/transport";
import { planInWorker, scrambleInWorker, warmUpScramble } from "../worker";
import { botChoices } from "./bot-choices";
import { botSupports } from "./bot-racer";
import { HandicapPanel } from "./HandicapPanel";
import { localAverages } from "./handicap";
import { nextLabel } from "./MatchBoard";
import { PARTY_MODE_LABELS, PARTY_MODES } from "./party";
import { RaceView } from "./RaceView";
import { eventForSize } from "./race-game";
import { CubeRoom, MAX_PLAYERS, NAME_MAX, TIME_LIMIT_SEC } from "./room";
import {
  FORMAT_LABELS,
  type MatchFormat,
  POINTS_ROUNDS,
  SCORING_LABELS,
  type Scoring,
} from "./standings";
import { useCubeRoom } from "./use-room";

/**
 * 온라인 n명 대결(`/cube/online`, docs/47 9절). 방장이 방을 만들어 초대 링크를 보내고(`?room=`), 2~8명이 같은 섞기로 겨룬다.
 * 연결은 다른 게임과 같은 WebRTC 그물(`?net=local`이면 같은 브라우저 탭끼리). 판정은 대결 틀이 모든 기기에서 한다.
 * 키보드 기기만 참가한다(휴대폰은 안내만).
 */

type Phase = "name" | "connecting" | "room" | "error";

const TIME_CHOICES = [60, 120, 180, 300, 600];

/** 키보드가 없을 것 같은 기기(손가락만 쓰는 휴대폰·태블릿) */
function touchOnly(): boolean {
  try {
    return (
      window.matchMedia("(pointer: coarse)").matches &&
      !window.matchMedia("(any-pointer: fine)").matches
    );
  } catch {
    return false;
  }
}

/**
 * 손님이 이 탭에서 들어간 방(sessionStorage, 탭을 닫으면 사라진다). 판 중에 새로 고쳐도 이름 화면에서 멈추지 않고
 * 기억한 이름으로 바로 다시 들어간다(자리 되찾기는 아니고 새 손님으로, docs/map.json 남은 일)
 */
const REJOIN_KEY = "cube.online.joined";

function joinedRoom(): string | null {
  try {
    return sessionStorage.getItem(REJOIN_KEY);
  } catch {
    return null;
  }
}

function rememberJoined(room: string): void {
  try {
    sessionStorage.setItem(REJOIN_KEY, room);
  } catch {
    // 저장소가 막혀 있으면 새로 고칠 때 이름 화면부터
  }
}

async function connect(room: string, isHost: boolean): Promise<Transport> {
  if (isLocalNet()) return joinBroadcast(room);
  const { joinP2P } = await import("@/net/p2p-transport");
  return joinP2P(room, { role: isHost ? "host" : "guest", game: "cube" });
}

export function CubeOnlineApp() {
  const savedName = useSettings((s) => s.playerName);
  const setPlayerName = useSettings((s) => s.setPlayerName);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("name");
  const [roomFromUrl, setRoomFromUrl] = useState<string | null | undefined>(
    undefined,
  );
  /** 초대 링크에 실린 방장 연결 아이디(`k`). 옛 링크면 없다 */
  const [hostFromUrl, setHostFromUrl] = useState<string | undefined>();
  const [roomCode, setRoomCode] = useState("");
  const [phone, setPhone] = useState(false);
  const [room, setRoom] = useState<CubeRoom | null>(null);
  const version = useCubeRoom(room);
  const roomRef = useRef<CubeRoom | null>(null);
  const transportRef = useRef<Transport | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("room");
    setRoomFromUrl(code);
    setHostFromUrl(params.get("k") ?? undefined);
    setRoomCode(code ?? randomId(16));
    setPhone(touchOnly());
  }, []);
  useEffect(() => {
    if (savedName && !name) setName(savedName);
  }, [savedName, name]);
  useEffect(
    () => () => {
      roomRef.current?.dispose();
      transportRef.current?.leave();
      useChat.getState().reset();
    },
    [],
  );

  const isHost = roomFromUrl === null;

  const enter = async (as: string = name) => {
    const trimmed = as.trim() || (isHost ? "방장" : "손님");
    setPlayerName(trimmed);
    setPhase("connecting");
    if (!isHost) rememberJoined(roomCode);
    try {
      const transport = await connect(roomCode, isHost);
      transportRef.current = transport;
      useChat.getState().reset();
      const r = new CubeRoom({
        transport,
        clock: raceClock,
        isHost,
        ...(!isHost && hostFromUrl ? { hostId: hostFromUrl } : {}),
        name: trimmed,
        ...withAverages(),
        scrambler: scrambleInWorker,
        botPlan: planInWorker,
        onChat: (m) =>
          useChat.getState().receive({
            id: m.id,
            seat: m.mine ? 0 : 1,
            name: m.name,
            text: m.text,
          }),
      });
      useChat.setState({ send: (text) => r.chat(text) });
      roomRef.current = r;
      setRoom(r);
      setPhase("room");
    } catch {
      setPhase("error");
    }
  };

  // 이 탭에서 이미 들어갔던 방을 새로 고쳤으면 기억한 이름으로 바로 다시 들어간다
  const rejoined = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 주소를 읽은 뒤 한 번만 본다
  useEffect(() => {
    if (rejoined.current || phase !== "name" || !roomFromUrl || phone) return;
    if (!savedName || joinedRoom() !== roomFromUrl) return;
    rejoined.current = true;
    void enter(savedName);
  }, [roomFromUrl, savedName, phone]);

  const state = room?.state;
  useEffect(() => {
    if (state) warmUpScramble(eventForSize(state.settings.n));
  }, [state?.settings.n, state]);

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-cube-online={state?.status ?? phase}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">온라인 대결</h1>
          {state && state.round > 0 && (
            <span className="text-sm text-white/60">
              {state.round}번째 판 · {FORMAT_LABELS[state.settings.format]}
              {state.settings.party
                ? ` · ${PARTY_MODE_LABELS[state.settings.party].replace("파티: ", "")}`
                : ""}
            </span>
          )}
        </header>

        {phone && (
          <p
            role="status"
            className="rounded-xl bg-amber-400/15 p-3 text-amber-100 text-sm"
          >
            온라인 대결은 키보드가 있는 기기에서만 참가할 수 있어요. 컴퓨터나
            키보드를 연결한 태블릿으로 들어와 주세요.
          </p>
        )}

        {!phone && phase === "name" && roomFromUrl !== undefined && (
          <section className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white/5 p-4">
            <input
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              aria-label="이름"
              className="rounded-lg border border-white/15 bg-black/40 px-2 py-1.5"
            />
            <button
              type="button"
              data-cube-enter
              onClick={() => void enter()}
              className="rounded-xl bg-sky-500 py-2 font-semibold text-black"
            >
              {isHost ? "방 만들기" : "들어가기"}
            </button>
          </section>
        )}
        {phase === "connecting" && <ConnectingNotice isHost={isHost} />}
        {phase === "error" && (
          <p className="text-center text-red-300 text-sm">
            연결하지 못했어요. 잠시 뒤 다시 들어와 보세요.
          </p>
        )}
        {room?.hostLeft && (
          <p role="status" className="text-center text-amber-300 text-sm">
            방장 연결이 끊김
          </p>
        )}
        {phase === "room" && room && !state && (
          <ConnectingNotice isHost={false} />
        )}

        {room && state && (
          <>
            {state.status === "lobby" ? (
              <Lobby room={room} roomCode={roomCode} />
            ) : (
              <RaceView
                room={room}
                version={version}
                resultActions={<NextActions room={room} />}
              />
            )}
            <section className="flex flex-col gap-1">
              <h2 className="font-semibold text-sm">채팅</h2>
              <ChatBox mySeat={0} emptyText="아직 아무 말도 없어요" />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Lobby({ room, roomCode }: { room: CubeRoom; roomCode: string }) {
  const state = room.state;
  const [botLevel, setBotLevel] = useState(levelText("casual"));
  const [link, setLink] = useState("");
  // 방장 연결 아이디를 실어 손님이 처음부터 방장을 알게 한다(먼저 방 상태를 보낸 다른 손님을 믿지 않게)
  useEffect(() => setLink(inviteUrl(roomCode, room.me)), [roomCode, room.me]);
  if (!state) return null;
  const s = state.settings;
  const host = room.isHost;
  const bots = botSupports(s.n);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="flex flex-col gap-3">
        {host && (
          <InviteLink
            link={link}
            roomCode={roomCode}
            shareTitle="큐브 대결하자"
          />
        )}
        <div className="rounded-2xl bg-white/5 p-3">
          <h2 className="mb-2 font-semibold text-sm">
            참가자 {state.players.length}/{MAX_PLAYERS}
          </h2>
          <ul className="flex flex-col gap-1" data-cube-players>
            {state.players.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span>{p.bot ? "🤖" : "🧑"}</span>
                <span className={p.id === room.me ? "text-amber-200" : ""}>
                  {p.name}
                  {p.bot ? ` (${botSkillLabel(p.bot, s.n)})` : ""}
                  {p.id === state.host ? " · 방장" : ""}
                </span>
                {!p.bot && !room.isConnected(p.device) && (
                  <span className="text-red-300 text-xs">끊김</span>
                )}
                {host && p.id !== room.me && (
                  <button
                    type="button"
                    onClick={() => room.removePlayer(p.id)}
                    className="ml-auto text-white/50 text-xs hover:text-white"
                  >
                    빼기
                  </button>
                )}
              </li>
            ))}
          </ul>
          {host && bots && state.players.length < MAX_PLAYERS && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <select
                value={botLevel}
                onChange={(e) => setBotLevel(e.target.value)}
                className="rounded bg-white/10 px-2 py-1"
                aria-label="컴퓨터 단계"
                data-cube-bot-level
              >
                {botChoices(s.n, room.myAverage(s.n)).map((c) => (
                  <option
                    key={c.value}
                    value={c.value}
                    className="bg-neutral-800"
                  >
                    {c.label} · {c.time}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => room.addBot(botLevel)}
                className="rounded-lg bg-white/10 px-3 py-1"
              >
                컴퓨터 더하기
              </button>
              <button
                type="button"
                onClick={() => room.fillWithBots(botLevel)}
                className="rounded-lg bg-white/10 px-3 py-1"
              >
                빈자리 모두 채우기
              </button>
            </div>
          )}
        </div>
        <HandicapPanel room={room} />
      </section>
      <section className="flex flex-col gap-3 self-start rounded-2xl bg-white/5 p-3 text-sm">
        <h2 className="font-semibold">판 설정 {host ? "" : "(방장이 정함)"}</h2>
        <Field label="종목">
          <select
            disabled={!host}
            value={s.n}
            onChange={(e) => {
              const k = Number(e.target.value);
              room.setSettings({
                n: k,
                timeLimitSec: TIME_LIMIT_SEC[k] ?? s.timeLimitSec,
              });
            }}
            className="rounded bg-white/10 px-2 py-1"
          >
            {[2, 3, 4, 5].map((k) => (
              <option key={k} value={k} className="bg-neutral-800">
                {k}×{k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="규칙">
          <select
            disabled={!host}
            data-cube-party
            value={s.party ?? "normal"}
            onChange={(e) =>
              room.setParty(
                PARTY_MODES.find((m) => m === e.target.value) ?? null,
              )
            }
            className="rounded bg-white/10 px-2 py-1"
          >
            <option value="normal" className="bg-neutral-800">
              일반
            </option>
            {PARTY_MODES.map((m) => (
              <option key={m} value={m} className="bg-neutral-800">
                {PARTY_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="방식">
          <select
            disabled={!host}
            value={s.format}
            onChange={(e) =>
              room.setSettings({ format: e.target.value as MatchFormat })
            }
            className="rounded bg-white/10 px-2 py-1"
          >
            {(Object.keys(FORMAT_LABELS) as MatchFormat[])
              // 체력바는 시간 평균을 내지 않는다
              .filter((f) => !(s.party && f === "ao5"))
              .map((f) => (
                <option key={f} value={f} className="bg-neutral-800">
                  {FORMAT_LABELS[f]}
                </option>
              ))}
          </select>
        </Field>
        {s.format === "points" && (
          <>
            <Field label="판 수">
              <select
                disabled={!host}
                data-cube-rounds
                value={s.rounds ?? 5}
                onChange={(e) =>
                  room.setSettings({ rounds: Number(e.target.value) })
                }
                className="rounded bg-white/10 px-2 py-1"
              >
                {POINTS_ROUNDS.map((k) => (
                  <option key={k} value={k} className="bg-neutral-800">
                    {k}판
                  </option>
                ))}
              </select>
            </Field>
            <Field label="점수">
              <select
                disabled={!host}
                data-cube-scoring
                value={s.scoring ?? "wins"}
                onChange={(e) =>
                  room.setSettings({ scoring: e.target.value as Scoring })
                }
                className="rounded bg-white/10 px-2 py-1"
              >
                {(Object.keys(SCORING_LABELS) as Scoring[]).map((k) => (
                  <option key={k} value={k} className="bg-neutral-800">
                    {SCORING_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {s.format === "firstTo" && (
          <Field label="몇 판 먼저">
            <select
              disabled={!host}
              value={s.target}
              onChange={(e) =>
                room.setSettings({ target: Number(e.target.value) })
              }
              className="rounded bg-white/10 px-2 py-1"
            >
              {[2, 3, 4, 5].map((k) => (
                <option key={k} value={k} className="bg-neutral-800">
                  {k}판
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="살펴보기">
          <select
            disabled={!host}
            value={s.inspection ? "15" : "0"}
            onChange={(e) =>
              room.setSettings({ inspection: e.target.value === "15" })
            }
            className="rounded bg-white/10 px-2 py-1"
          >
            <option value="15" className="bg-neutral-800">
              15초
            </option>
            <option value="0" className="bg-neutral-800">
              없음
            </option>
          </select>
        </Field>
        <Field label="제한 시간">
          <select
            disabled={!host}
            value={s.timeLimitSec}
            onChange={(e) =>
              room.setSettings({ timeLimitSec: Number(e.target.value) })
            }
            className="rounded bg-white/10 px-2 py-1"
          >
            {TIME_CHOICES.map((t) => (
              <option key={t} value={t} className="bg-neutral-800">
                {t / 60}분
              </option>
            ))}
          </select>
        </Field>
        {host ? (
          <button
            type="button"
            data-cube-start
            disabled={state.players.length < 2}
            onClick={() => room.startRound()}
            className="rounded-xl bg-sky-500 py-2 font-semibold text-black disabled:opacity-50"
          >
            {state.players.length < 2 ? "두 명부터 시작" : "시작"}
          </button>
        ) : (
          <p className="text-white/60 text-xs">방장이 시작하기를 기다리는 중</p>
        )}
      </section>
    </div>
  );
}

/** 이 기기의 크기별 내 평균(핸디캡 「평균 대비」·출발 늦추기 추천에 방으로 알린다) */
function withAverages(): { avgs?: Record<string, number> } {
  const avgs = localAverages();
  return avgs ? { avgs } : {};
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: 고르기 칸(select)을 children으로 받아 label 안에 둔다
    <label className="flex items-center justify-between gap-2">
      {label}
      {children}
    </label>
  );
}

/**
 * 판이 끝난 뒤 다음 길(결과 상자 안). 방장은 「다음 판」·「새 경기」, 손님은 기다린다는 글.
 * 예전에는 종합 순위 옆에 있어 휴대폰·작은 창에서 화면 밖으로 밀렸다(2026-11-04 점검)
 */
function NextActions({ room }: { room: CubeRoom }) {
  const state = room.state;
  if (!state || (state.status !== "between" && state.status !== "over"))
    return null;
  if (!room.isHost)
    return (
      <span className="text-white/60 text-xs">
        {room.matchOver()
          ? "경기가 끝났어요. 방장이 새 경기를 열기를 기다리는 중"
          : "방장이 다음 판을 열기를 기다리는 중"}
      </span>
    );
  return state.status === "between" ? (
    <button
      type="button"
      data-cube-next
      onClick={() => room.startRound()}
      className="min-h-10 rounded-lg bg-sky-500 px-4 font-semibold text-black text-sm hover:bg-sky-400"
    >
      {nextLabel(room)}
    </button>
  ) : (
    <button
      type="button"
      data-cube-new-match
      onClick={() => room.newMatch()}
      className="min-h-10 rounded-lg bg-sky-500 px-4 font-semibold text-black text-sm hover:bg-sky-400"
    >
      새 경기(대기실로)
    </button>
  );
}
