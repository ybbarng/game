/**
 * 잠그기 군 준비만 부르는 작은 진입점(`@game/fair-play/group`). 웹은 멘탈 포커를 쓰는 방에서만 이 길을 동적으로
 * 불러, 판 게임 방 묶음에 기기·증명 코드와 libsodium이 실리지 않게 한다(docs/54 4절).
 * 준비한 군은 `device.ts`의 같은 표에 남아, 따로 불러온 멘탈 포커 판의 기기가 그대로 쓴다
 */
export { type GroupName, prepareGroup } from "./device";
