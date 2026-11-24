import { hwatuFairTable } from "@/hwatu/fair-table";
import { gostopFair } from "./fair";
import { type GostopKit, gostopKit } from "./kit";

/** 고스톱 멘탈 포커 판. 온라인 방을 열 때만 불러온다(`gostopKit.loadFairTable`) */
export const gostopFairTable: NonNullable<GostopKit["fairTable"]> =
  hwatuFairTable(gostopFair);

/** 멘탈 포커 판을 채운 고스톱 킷(시험이 방을 바로 만들 때. 화면은 `withFairTable`로 불러 채운다) */
export const gostopRoomKit = { ...gostopKit, fairTable: gostopFairTable };
