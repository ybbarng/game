/** 혼자 하기 새 판을 여는 저장소(`createMatchStore`) */
interface SoloStore<Choice> {
  getState(): {
    newGame(options: Choice & { level: number; seed?: number }): void;
  };
}

/**
 * 혼자 하기 새 판 열기(첫 화면 「시작」과 판 끝 「다시 하기」): 그때의 설정에서 규칙(과 편)을 골라 컴퓨터 단계와 함께
 * `newGame`에 넘긴다. 씨앗을 주면 그 씨앗으로(주소 `?seed=`·시험용 갈고리), 없으면 새로 뽑는다
 */
export function soloStarter<Settings extends { level: number }, Choice>(
  store: SoloStore<Choice>,
  settings: { getState(): Settings },
  choose: (settings: Settings) => Choice,
): (seed?: number) => void {
  return (seed) => {
    const s = settings.getState();
    store.getState().newGame({
      ...choose(s),
      level: s.level,
      ...(seed !== undefined ? { seed } : {}),
    });
  };
}
