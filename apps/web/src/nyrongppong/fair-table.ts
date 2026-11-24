import { hwatuFairTable } from "@/hwatu/fair-table";
import { nyrongppongFair } from "./fair";
import { type NyrongppongKit, nyrongppongKit } from "./kit";

/** 나이롱뽕 멘탈 포커 판. 온라인 방을 열 때만 불러온다(`nyrongppongKit.loadFairTable`) */
export const nyrongppongFairTable: NonNullable<NyrongppongKit["fairTable"]> =
  hwatuFairTable(nyrongppongFair);

/** 멘탈 포커 판을 채운 나이롱뽕 킷(시험이 방을 바로 만들 때. 화면은 `withFairTable`로 불러 채운다) */
export const nyrongppongRoomKit = {
  ...nyrongppongKit,
  fairTable: nyrongppongFairTable,
};
