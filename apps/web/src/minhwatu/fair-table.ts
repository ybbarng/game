import { hwatuFairTable } from "@/hwatu/fair-table";
import { minhwatuFair } from "./fair";
import { type MinhwatuKit, minhwatuKit } from "./kit";

/** 민화투 멘탈 포커 판. 온라인 방을 열 때만 불러온다(`minhwatuKit.loadFairTable`) */
export const minhwatuFairTable: NonNullable<MinhwatuKit["fairTable"]> =
  hwatuFairTable(minhwatuFair);

/** 멘탈 포커 판을 채운 민화투 킷(시험이 방을 바로 만들 때. 화면은 `withFairTable`로 불러 채운다) */
export const minhwatuRoomKit = { ...minhwatuKit, fairTable: minhwatuFairTable };
