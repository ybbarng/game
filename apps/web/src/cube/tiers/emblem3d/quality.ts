/**
 * 3D 엠블럼을 돌리는 동안의 해상도 조절(docs/47 14-7 「넷째 시안」). 그리기와 떨어진 순수 계산이다.
 *
 * - 가만히 있을 때(멈춘 장, 끄는 손이 멈췄을 때)는 언제나 제 해상도(배율 1)로 그린다.
 * - 돌리는 동안에는 `MOTION_SCALES[level]` 배율로 그린다. 처음은 1(제 해상도)이고, 그린 장이 GPU에서 끝나기까지
 *   걸린 시간(펜스)이 `SLOW_MS`보다 길면(GPU가 화면 주기를 못 따라오면) 한 단계 낮춘다. 낮춘 단계는 그 페이지가 떠
 *   있는 동안 기억한다.
 * - 장 사이 간격(requestAnimationFrame)으로 재지 않는다: GPU가 밀려도 간격은 60Hz로 와서 소프트웨어 GPU(저전력 기기
 *   대신)에서 초당 7장만 그리는데도 느린 줄 몰랐다(2026-11-12). 배율을 바꾼 장은 버퍼를 다시 만드느라 길어 재지 않는다.
 */

/** 돌리는 동안 해상도 배율 단계(가로·세로 각각) */
export const MOTION_SCALES = [1, 0.75, 0.5, 0.35] as const;
/** 한 장이 GPU에서 이보다 오래(ms) 걸리면 느리다(60Hz 한 장 16.7ms) */
export const SLOW_MS = 16;
/** 이만큼 잰 뒤 가운데 값으로 판단한다 */
export const WINDOW = 6;
/** 끄는 손이 이만큼(ms) 멈춰 있으면 제 해상도로 한 장 그린다 */
export const REST_MS = 140;

export class MotionQuality {
  private samples: number[] = [];
  /** 최근 판단에 쓴 시간 가운데 값(ms). 아직 없으면 0 */
  median = 0;

  constructor(public level = 0) {}

  get scale(): number {
    return MOTION_SCALES[this.level] ?? 1;
  }

  /** 그린 한 장이 GPU에서 끝나기까지 걸린 시간을 적는다. 단계를 낮췄으면 true */
  note(ms: number): boolean {
    this.samples.push(ms);
    if (this.samples.length < WINDOW) return false;
    const sorted = [...this.samples].sort((a, b) => a - b);
    this.median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.samples = [];
    if (this.median > SLOW_MS && this.level < MOTION_SCALES.length - 1) {
      this.level += 1;
      return true;
    }
    return false;
  }
}
