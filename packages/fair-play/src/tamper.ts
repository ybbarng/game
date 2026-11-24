import type { Incident } from "./coordinator";
import type { FairDevice } from "./device";

/*
 * 마이티·하트·화투·원카드가 함께 쓴다. 마이티 판 진행(coordinator.ts)을 끌어오지 않게 따로 둔다(원카드·화투 판
 * 묶음에 마이티 엔진이 실리지 않게, docs/13 13절).
 */

/**
 * 섞기 조작이 드러났다(같은 카드가 두 번 등): 섞기·바꾸기 증명으로 누군지 찾아 알린다.
 * 기기 번호는 그 기기 사람의 자리 번호다
 */
export function reportShuffleTamper(
  device: FairDevice,
  deal: number,
  what: string,
  incident: (incident: Incident) => void,
): void {
  // 같은 카드가 두 번 열린 것은 내 기기가 직접 본 사실이라 판을 바로 멈춘다. 누가 했는지는 뒤따라 알린다.
  incident({
    seat: null,
    reason: `${what}: 섞기 조작이에요. 누가 했는지 섞기 증명으로 확인하는 중이에요.`,
    pending: true,
  });
  void device.shuffleCulprit(deal).then((culprit) =>
    incident(
      culprit
        ? { seat: culprit.device, reason: `${what}: ${culprit.reason}` }
        : {
            seat: null,
            reason: `${what}(섞기를 조작했는데 누군지 가리지 못했다)`,
          },
    ),
  );
}
