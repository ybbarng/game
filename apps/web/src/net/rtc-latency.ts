/**
 * WebRTC 연결에서 지연 측정 재료를 얻는다(latency.ts가 쓴다).
 * - `rtcSample`: 지금 쓰는 경로 쌍의 `currentRoundTripTime`(브라우저가 STUN 확인 메시지 왕복으로 잰다)과 경로
 * - `negotiatedUnordered`: 순서 없는·재전송 없는 데이터 채널(ordered:false, maxRetransmits:0)
 *
 * trystero 0.26은 연결마다 채널 하나("data", 협상 방식)만 열고 채널 설정을 열어 주지 않는다. 그래서 trystero가
 * 만든 RTCPeerConnection(`room.getPeers()`)에 **미리 정한 번호의 협상 없는 채널**(`negotiated: true`)을 양쪽이
 * 따로 연다. 협상 없는 채널은 상대에게 `datachannel` 이벤트를 일으키지 않아 trystero의 채널 받기를 건드리지 않고,
 * SCTP가 이미 이어져 있어 다시 협상할 일도 없다.
 */
import type { RtcSample, UnorderedLink } from "./latency";

/** trystero의 "data" 채널(0·1번)과 겹치지 않는 번호 */
const UNORDERED_ID = 900;

type Stat = RTCStats & Record<string, unknown>;

export async function rtcSample(
  pc: RTCPeerConnection,
): Promise<RtcSample | null> {
  if (pc.connectionState === "closed") return null;
  const stats = [...(await pc.getStats()).values()] as Stat[];
  const byId = new Map(stats.map((s) => [s.id, s]));
  const transport = stats.find(
    (s) => s.type === "transport" && s.selectedCandidatePairId,
  );
  const pair =
    (transport && byId.get(transport.selectedCandidatePairId as string)) ??
    stats.find(
      (s) =>
        s.type === "candidate-pair" && s.nominated && s.state === "succeeded",
    );
  if (!pair) return null;
  const local = byId.get(pair.localCandidateId as string);
  const remote = byId.get(pair.remoteCandidateId as string);
  return {
    rttMs:
      typeof pair.currentRoundTripTime === "number"
        ? pair.currentRoundTripTime * 1000
        : null,
    path:
      local && remote ? `${local.candidateType}-${remote.candidateType}` : null,
  };
}

export function negotiatedUnordered(
  connectionOf: (peerId: string) => RTCPeerConnection | undefined,
): UnorderedLink {
  const channels = new Map<string, RTCDataChannel>();
  const handlers: ((message: unknown, from: string) => void)[] = [];
  return {
    open(peerId) {
      const existing = channels.get(peerId);
      if (existing && existing.readyState !== "closed") return;
      const pc = connectionOf(peerId);
      if (!pc || pc.connectionState === "closed") return;
      try {
        const channel = pc.createDataChannel("lat-u", {
          negotiated: true,
          id: UNORDERED_ID,
          ordered: false,
          maxRetransmits: 0,
        });
        channel.onmessage = (event) => {
          if (typeof event.data !== "string") return;
          let message: unknown;
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }
          for (const h of handlers) h(message, peerId);
        };
        channels.set(peerId, channel);
      } catch {
        // 열지 못하면 앱 핑만 잰다(요약에서 보낸 수 0으로 보인다)
      }
    },
    send(peerId, message) {
      const channel = channels.get(peerId);
      if (channel?.readyState !== "open") return false;
      try {
        channel.send(JSON.stringify(message));
        return true;
      } catch {
        return false;
      }
    },
    onMessage(handler) {
      handlers.push(handler);
    },
    close(peerId) {
      channels.get(peerId)?.close();
      channels.delete(peerId);
    },
  };
}
