import type { HostStore } from "./host-store";

/**
 * 시험 도우미: 방장 탭 하나의 저장 창구. 방장 새로고침을 흉내 낼 때 옛 방장은 `reload()`로 보내고 새 방장은 새 창구로 연다.
 *
 * 진짜 새로고침에서는 옛 탭의 메모리가 사라져 그 탭은 아무것도 남기지 못한다. 시험의 옛 방장 객체는 연결만 끊겨 살아
 * 있어서, 그대로 두면 제 엔진의 컴퓨터 자리로 판을 계속 두며 옛 진행을 같은 저장소에 덮어썼다. 새 방장이 마지막으로
 * 남긴 것보다 늦게 쓰면 다음 새로고침이 옛 판으로 돌아갔다(2026-11-17 마이티 6마 방장 새로고침, 부하 아래 30번에 두 번).
 * `reload()`는 창구를 먼저 끊고(뒤의 `close()`가 저장소를 비우지 못하게) 옛 방장을 닫아 남은 계산도 멈춘다
 */
export function reloadTab(store: HostStore): {
  store: HostStore;
  /** 이 탭을 새로고침한다: 창구를 끊고 그 탭의 방장을 닫는다 */
  reload(host: { close(): void }): void;
} {
  let open = true;
  return {
    store: {
      load: () => store.load(),
      save: (saved) => {
        if (open) store.save(saved);
      },
      saveOwn: (deal, messages) => {
        if (open) store.saveOwn(deal, messages);
      },
      clear: () => {
        if (open) store.clear();
      },
    },
    reload: (host) => {
      open = false;
      host.close();
    },
  };
}
