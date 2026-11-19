/**
 * 2D 윷가락이 공중에서 돌다 떨어지는 시간(ms). 이 시간이 지나면 앞뒷면(결과)을 보인다.
 * CSS 연출 `yut-toss`(yut.css)도 이 값으로 끝난다: `YutSticks`가 `--yut-roll`로 넘기고, 가락마다 늦게 출발한 만큼
 * 짧게 돌아 넷 모두 이 시간에 멈춘다(결과 면을 보인 채 가락이 아직 도는 일이 없게). 움직임 줄이기면 굴리지 않는다
 */
export const FLAT_ROLL_MS = 650;

/** 2D 윷가락 넷이 차례로 떠오르는 간격(ms) */
export const STICK_STAGGER_MS = 40;
