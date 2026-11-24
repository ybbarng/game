/**
 * 브라우저에 저장한 값(zustand persist, `skipHydration: true`)을 첫 그리기 뒤에 읽는 저장소 목록.
 *
 * 미리 그려 둔 HTML(기본값)과 첫 화면이 같아야 하므로 저장값은 첫 그리기 뒤에 읽는다. 예전에는 루트 layout의
 * StoreHydration이 모든 게임의 저장소를 이름으로 불러 모든 화면이 모든 게임 설정(과 그 기본값을 만드는 엔진)을
 * 실었다(2026-11-25 첫 화면 가볍게). 이제 저장소 파일이 만들 때 스스로 여기에 올리고, StoreHydration은 그 화면이
 * 불러온 저장소만 읽는다. 첫 그리기 뒤에 불러온 저장소(동적으로 불러온 화면)는 올리는 순간 바로 읽는다
 * (그 화면은 미리 그린 HTML이 없어 어긋날 것이 없다).
 */
interface Rehydratable {
  persist: { rehydrate(): Promise<void> | void };
}

const stores = new Set<Rehydratable>();
let started = false;

/** 저장소를 첫 그리기 뒤 읽기 목록에 올리고 그대로 돌려준다 */
export function hydrateAfterFirstPaint<T extends Rehydratable>(store: T): T {
  stores.add(store);
  if (started) void store.persist.rehydrate();
  return store;
}

/** 올라온 저장소를 모두 읽는다(StoreHydration이 첫 그리기 뒤 한 번). 그 뒤 올라오는 것은 바로 읽는다 */
export async function rehydrateStores(): Promise<void> {
  started = true;
  await Promise.all([...stores].map((s) => s.persist.rehydrate()));
}
