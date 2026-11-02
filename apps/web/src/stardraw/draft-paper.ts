/**
 * 쓰다 만 예측지(2026-11-02 사용자): 고르는 동안 고른 별을 이 기기에 저장해 두었다가, 마감으로 내지 못했거나 화면을
 * 닫았으면 다음에 예측하러 왔을 때 「작성하던 예측지」로 불러올 수 있게 한다. 내지 않은 종이라 서명·제출은 없다.
 * 내거나(접수) 다 지우면 사라진다. 한 장만, 장부 표시(`Ledger.id()`)별로 둔다
 */
export interface DraftPaper {
  ledger: string | null;
  /** 쓰던 회차 */
  round: number;
  numbers: number[];
}

const key = (ns: string) => `${ns}-draft-paper`;

export function loadDraft(
  ns: string,
  ledger: string | null,
): DraftPaper | null {
  try {
    const text = localStorage.getItem(key(ns));
    const d = text ? (JSON.parse(text) as DraftPaper) : null;
    return d &&
      d.ledger === ledger &&
      Array.isArray(d.numbers) &&
      d.numbers.length > 0 &&
      d.numbers.length <= 6
      ? d
      : null;
  } catch {
    return null;
  }
}

export function saveDraft(ns: string, paper: DraftPaper): void {
  try {
    if (paper.numbers.length === 0) localStorage.removeItem(key(ns));
    else localStorage.setItem(key(ns), JSON.stringify(paper));
  } catch {
    // 저장소를 못 쓰면 저장되지 않는다
  }
}

export function clearDraft(ns: string): void {
  try {
    localStorage.removeItem(key(ns));
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}
