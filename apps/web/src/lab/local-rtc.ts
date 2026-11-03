/**
 * 측정 화면 전용: 같은 브라우저의 탭끼리 **실제 WebRTC**로 잇는다. 연결 정보만 BroadcastChannel로 넘긴다.
 * 신호 서버 없이도 getStats RTT·순서 없는 채널을 화면 시험에서 쓸 수 있게 한다(docs/43 5절 E5).
 * 탭마다 모두와 잇고(그물), 아이디가 작은 쪽이 연결을 연다. 게임 채널은 협상 없는 0번 채널 하나다.
 */
import { randomId, type Transport } from "@/net/transport";

type Wire =
  | { kind: "hello"; from: string; reply: boolean }
  | { kind: "bye"; from: string }
  | { kind: "offer" | "answer"; from: string; to: string; sdp: string };

/** 연결 정보를 모두 모을 때까지 기다리는 상한(같은 기기라 보통 수십 ms) */
const GATHER_MS = 3000;

async function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, GATHER_MS);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

export interface LocalRtc extends Transport {
  connectionOf(peerId: string): RTCPeerConnection | undefined;
}

export function joinLocalRtc(roomId: string): LocalRtc {
  const selfId = randomId();
  const bus = new BroadcastChannel(`lab-rtc-${roomId}`);
  const pcs = new Map<string, RTCPeerConnection>();
  const channels = new Map<string, RTCDataChannel>();
  const onMessage: ((message: unknown, from: string) => void)[] = [];
  const onJoin: ((peerId: string) => void)[] = [];
  const onLeave: ((peerId: string) => void)[] = [];
  const post = (wire: Wire) => bus.postMessage(wire);

  const drop = (peerId: string) => {
    const pc = pcs.get(peerId);
    if (!pc) return;
    pcs.delete(peerId);
    const wasOpen = channels.get(peerId)?.readyState === "open";
    channels.delete(peerId);
    pc.close();
    if (wasOpen) for (const h of onLeave) h(peerId);
  };

  const connection = (peerId: string) => {
    const pc = new RTCPeerConnection();
    pcs.set(peerId, pc);
    const channel = pc.createDataChannel("m", { negotiated: true, id: 0 });
    channels.set(peerId, channel);
    channel.onopen = () => {
      for (const h of onJoin) h(peerId);
    };
    channel.onmessage = (event) => {
      let message: unknown;
      try {
        message = JSON.parse(event.data as string);
      } catch {
        return;
      }
      for (const h of onMessage) h(message, peerId);
    };
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed")
        drop(peerId);
    });
    return pc;
  };

  bus.onmessage = async (event: MessageEvent<Wire>) => {
    const wire = event.data;
    if (wire.from === selfId) return;
    if (wire.kind === "hello") {
      if (!wire.reply) post({ kind: "hello", from: selfId, reply: true });
      if (pcs.has(wire.from) || selfId > wire.from) return;
      const pc = connection(wire.from);
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      post({
        kind: "offer",
        from: selfId,
        to: wire.from,
        sdp: pc.localDescription?.sdp ?? "",
      });
    } else if (wire.kind === "bye") {
      drop(wire.from);
    } else if (wire.to === selfId) {
      if (wire.kind === "offer") {
        if (pcs.has(wire.from)) drop(wire.from);
        const pc = connection(wire.from);
        await pc.setRemoteDescription({ type: "offer", sdp: wire.sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc);
        post({
          kind: "answer",
          from: selfId,
          to: wire.from,
          sdp: pc.localDescription?.sdp ?? "",
        });
      } else {
        await pcs
          .get(wire.from)
          ?.setRemoteDescription({ type: "answer", sdp: wire.sdp });
      }
    }
  };
  setTimeout(() => post({ kind: "hello", from: selfId, reply: false }), 0);
  const bye = () => post({ kind: "bye", from: selfId });
  window.addEventListener("pagehide", bye);

  return {
    selfId,
    send(message, to) {
      const text = JSON.stringify(message);
      for (const [peerId, channel] of channels)
        if (
          (to === undefined || to === peerId) &&
          channel.readyState === "open"
        )
          channel.send(text);
    },
    onMessage: (h) => onMessage.push(h),
    onPeerJoin: (h) => onJoin.push(h),
    onPeerLeave: (h) => onLeave.push(h),
    leave() {
      bye();
      window.removeEventListener("pagehide", bye);
      for (const peerId of [...pcs.keys()]) drop(peerId);
      bus.close();
    },
    connectionOf: (peerId) => pcs.get(peerId),
  };
}
