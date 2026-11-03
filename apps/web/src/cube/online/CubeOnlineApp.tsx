"use client";

import { BOT_LEVEL_LABELS, BOT_LEVELS, type BotLevel } from "@game/cube-ai";
import { useEffect, useRef, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { ConnectingNotice } from "@/components/ConnectingNotice";
import { InviteLink } from "@/components/InviteLink";
import { useSettings } from "@/game/settings";
import { useChat } from "@/net/chat";
import { raceClock } from "@/net/race/race-session";
import { inviteUrl, isLocalNet } from "@/net/session";
import { joinBroadcast, randomId, type Transport } from "@/net/transport";
import { formatMs } from "../records";
import { planInWorker, scrambleInWorker, warmUpScramble } from "../worker";
import { botSupports } from "./bot-racer";
import { RaceView } from "./RaceView";
import { eventForSize } from "./race-game";
import { CubeRoom, MAX_PLAYERS, NAME_MAX, TIME_LIMIT_SEC } from "./room";
import { FORMAT_LABELS, type MatchFormat, standings } from "./standings";
import { useCubeRoom } from "./use-room";

/**
 * 온라인 n명 경주(`/cube/online`, docs/47 9절). 방장이 방을 만들어 초대 링크를 보내고(`?room=`), 2~8명이 같은 섞기로 겨룬다.
 * 연결은 다른 게임과 같은 WebRTC 그물(`?net=local`이면 같은 브라우저 탭끼리). 판정은 경주 틀이 모든 기기에서 한다.
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
  const [roomCode, setRoomCode] = useState("");
  const [phone, setPhone] = useState(false);
  const [room, setRoom] = useState<CubeRoom | null>(null);
  const version = useCubeRoom(room);
  const roomRef = useRef<CubeRoom | null>(null);
  const transportRef = useRef<Transport | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room");
    setRoomFromUrl(code);
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

  const enter = async () => {
    const trimmed = name.trim() || (isHost ? "방장" : "손님");
    setPlayerName(trimmed);
    setPhase("connecting");
    try {
      const transport = await connect(roomCode, isHost);
      transportRef.current = transport;
      useChat.getState().reset();
      const r = new CubeRoom({
        transport,
        clock: raceClock,
        isHost,
        name: trimmed,
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

  const state = room?.state;
  useEffect(() => {
    if (state) warmUpScramble(eventForSize(state.settings.n));
  }, [state?.settings.n, state]);

  return (
    <div className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-cube-online={state?.status ?? phase}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a href="/cube" className="text-sm text-white/70 hover:text-white">
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">온라인 경주</h1>
          {state && state.round > 0 && (
            <span className="text-sm text-white/60">
              {state.round}번째 판 · {FORMAT_LABELS[state.settings.format]}
            </span>
          )}
        </header>

        {phone && (
          <p
            role="status"
            className="rounded-xl bg-amber-400/15 p-3 text-amber-100 text-sm"
          >
            온라인 경주는 키보드가 있는 기기에서만 참가할 수 있습니다
          </p>
        )}

        {!phone && phase === "name" && roomFromUrl !== undefined && (
          <section className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white/5 p-4">
            <p className="text-sm">
              {isHost
                ? "방을 만들고 친구에게 링크를 보내세요. 2~8명이 같은 섞기로 겨룹니다."
                : "친구의 경주 방에 들어갑니다."}
            </p>
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
            연결하지 못했습니다. 새로고침해 다시 해 보세요.
          </p>
        )}
        {room?.hostLeft && (
          <p role="status" className="text-center text-amber-300 text-sm">
            방장이 나갔습니다. 방장이 돌아오면 이어집니다.
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
              <>
                <RaceView room={room} version={version} />
                <Standings room={room} />
              </>
            )}
            <section className="flex flex-col gap-1">
              <h2 className="font-semibold text-sm">채팅</h2>
              <ChatBox mySeat={0} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Lobby({ room, roomCode }: { room: CubeRoom; roomCode: string }) {
  const state = room.state;
  const [botLevel, setBotLevel] = useState<BotLevel>("intermediate");
  const [link, setLink] = useState("");
  useEffect(() => setLink(inviteUrl(roomCode)), [roomCode]);
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
            shareTitle="큐브 경주하자"
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
                  {p.bot ? ` (${BOT_LEVEL_LABELS[p.bot]})` : ""}
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
                onChange={(e) => setBotLevel(e.target.value as BotLevel)}
                className="rounded bg-white/10 px-2 py-1"
                aria-label="컴퓨터 단계"
              >
                {BOT_LEVELS.map((l) => (
                  <option key={l} value={l} className="bg-neutral-800">
                    {BOT_LEVEL_LABELS[l]}
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
          {host && !bots && (
            <p className="mt-2 text-white/50 text-xs">
              컴퓨터는 2×2·3×3만 있습니다.
            </p>
          )}
        </div>
      </section>
      <section className="flex flex-col gap-3 rounded-2xl bg-white/5 p-3 text-sm">
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
        <Field label="방식">
          <select
            disabled={!host}
            value={s.format}
            onChange={(e) =>
              room.setSettings({ format: e.target.value as MatchFormat })
            }
            className="rounded bg-white/10 px-2 py-1"
          >
            {(Object.keys(FORMAT_LABELS) as MatchFormat[]).map((f) => (
              <option key={f} value={f} className="bg-neutral-800">
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        </Field>
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

function Standings({ room }: { room: CubeRoom }) {
  const state = room.state;
  if (!state || room.rounds.length === 0) return null;
  const s = state.settings;
  const players = state.race?.players ?? state.players.map((p) => p.id);
  const rows = standings(s.format, players, room.rounds);
  const host = room.isHost;
  return (
    <section
      className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3"
      data-cube-standings
    >
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-sm">
          종합 순위 · {FORMAT_LABELS[s.format]}
          {s.format === "firstTo" ? `(${s.target}판)` : ""}
          {state.status === "over" ? " · 경기 끝" : ""}
        </h2>
        {host && state.status === "between" && (
          <button
            type="button"
            data-cube-next
            onClick={() => room.startRound()}
            className="ml-auto rounded-lg bg-sky-500 px-3 py-1 font-semibold text-black text-sm"
          >
            다음 판
          </button>
        )}
        {host && state.status === "over" && (
          <button
            type="button"
            onClick={() => room.newMatch()}
            className="ml-auto rounded-lg bg-sky-500 px-3 py-1 font-semibold text-black text-sm"
          >
            새 경기(대기실로)
          </button>
        )}
      </div>
      <ol className="flex flex-col gap-1 text-sm">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-baseline gap-2">
            <span className="w-5 text-white/50">{i + 1}</span>
            <span>{room.playerName(r.id)}</span>
            <span className="ml-auto font-mono tabular-nums">
              {s.format === "firstTo"
                ? `${r.wins}승`
                : r.value === null
                  ? "DNF"
                  : formatMs(r.value)}
            </span>
            {s.format !== "single" && (
              <span className="hidden font-mono text-white/40 text-xs sm:inline">
                {r.times
                  .map((t) => (t === null ? "DNF" : formatMs(t)))
                  .join(" · ")}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
