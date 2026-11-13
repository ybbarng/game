/**
 * 3D 엠블럼을 움직이는 동안 GPU가 화면 주기를 따라오게 하는 조절(docs/47 14-7 「넷째 시안」·「진열」). 그리기와 떨어진
 * 순수 계산이다.
 *
 * - 사람이 끄는 동안(끌기·놓은 뒤 미끄러짐·처음 각도로): `MotionQuality`가 해상도 배율을 `MOTION_SCALES[level]`로
 *   낮춘다. 손이 멈추거나 놓으면 제 해상도(배율 1)로 그린다.
 * - 저절로 흔드는 동안(진열): `SwayPacer`가 해상도는 그대로 두고 그리는 횟수를 줄인다(화면 갱신 N번에 한 번). 천천히
 *   흔드니 초당 30장이나 그 아래도 티가 덜 나지만, 흐려진 그림은 바로 눈에 띈다(2026-11-13 사용자 「마우스 올리니까
 *   화질이 열화돼, 왜 그래?」: 흔들기가 늘 「움직이는 중」이라 낮춘 해상도에서 돌아오지 않았다).
 * - 둘 다 무대마다 따로 잰다. 잰 시간이 예산보다 넉넉히 짧은 창이 `UP_WINDOWS`번 이어지면 한 단계 되돌린다(낮출 때와
 *   올릴 때 문턱을 벌려 오르내림이 흔들리지 않게). 예전에는 한 무대가 낮춘 단계를 페이지 전역에 기억해 뒤에 뜨는
 *   모든 무대가 낮은 단계로 시작했고, 다시 올리지 않았다.
 * - 장 사이 간격(requestAnimationFrame)으로 GPU 시간을 재지 않는다: GPU가 밀려도 간격은 60Hz로 와서 소프트웨어 GPU에서
 *   초당 7장만 그리는데도 느린 줄 몰랐다(2026-11-12). 배율을 바꾼 장은 버퍼를 다시 만드느라 길어 재지 않는다.
 */

/** 끄는 동안 해상도 배율 단계(가로·세로 각각) */
export const MOTION_SCALES = [1, 0.75, 0.5, 0.35] as const;
/** 한 장이 GPU에서 이보다 오래(ms) 걸리면 느리다(60Hz 한 장 16.7ms) */
export const SLOW_MS = 16;
/** 이만큼 잰 뒤 가운데 값으로 판단한다 */
export const WINDOW = 6;
/** 끄는 손이 이만큼(ms) 멈춰 있으면 제 해상도로 한 장 그린다 */
export const REST_MS = 140;
/** 넉넉히 짧은 창이 이만큼 이어지면 한 단계 되돌린다 */
export const UP_WINDOWS = 3;
/**
 * 해상도를 한 단계 올려도 되는 몫: 배율 한 단계(0.75)를 올리면 화소가 약 1.8배라, 예산의 절반 아래일 때만 올린다
 * (올린 뒤에도 예산 안에 들게)
 */
export const UP_SHARE = 0.5;

/**
 * 한 장 예산을 화면 주기에서 정한다(열째 시안, 2026-11-13 사용자 「챌린저… 여전히 성능 문제가 살짝 있지 않나」).
 * 120Hz 화면(프로모션)이면 한 장 예산이 8.3ms라, 16ms로 재면 넘치는데도 느린 줄 몰랐다. 움직이는 동안
 * requestAnimationFrame 간격을 재서 그 가운데 값의 이만큼을 예산으로 쓴다(나머지는 주 스레드·합성 몫)
 */
export const BUDGET_SHARE = 0.85;
/** 예산 하한·상한(ms): 240Hz 같은 아주 빠른 화면에서도 지나치게 낮추지 않게, 30Hz로 떨어진 때도 16ms 넘게 두지 않게 */
export const BUDGET_MIN = 6;
export const BUDGET_MAX = SLOW_MS;

/** 화면 주기에서 정하는 한 장 예산. `fixed`를 주면(화면 시험이 120Hz를 흉내 낼 때) 그 값으로 고정 */
export class FrameBudget {
  private intervals: number[] = [];
  value: number;

  constructor(private readonly fixed: number | null = null) {
    this.value = fixed ?? SLOW_MS;
  }

  /**
   * 움직이는 동안 이어진 두 장 사이 간격(requestAnimationFrame, ms)을 적는다. 탭이 가려졌다 돌아온 것 같은 긴 간격(50ms
   * 넘음)은 버린다
   */
  noteInterval(ms: number): void {
    if (this.fixed !== null || !(ms > 0) || ms > 50) return;
    this.intervals.push(ms);
    if (this.intervals.length > 30) this.intervals.shift();
    if (this.intervals.length < 6) return;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 16.7;
    this.value = Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, mid * BUDGET_SHARE));
  }
}

/** 잰 시간을 창마다 모아 가운데 값으로 단계를 오르내리는 공통 뼈대 */
abstract class Stepper {
  private samples: number[] = [];
  private easy = 0;
  /** 최근 판단에 쓴 시간 가운데 값(ms). 아직 없으면 0 */
  median = 0;

  constructor(
    readonly budget: FrameBudget,
    public level = 0,
  ) {}

  protected abstract get maxLevel(): number;
  /** 이 단계에서 한 장이 넘으면 안 되는 시간 */
  protected abstract over(level: number): number;
  /** 한 단계 되돌려도 되는 시간(이보다 짧아야 한다) */
  protected abstract under(level: number): number;

  /** 그린 한 장이 GPU에서 끝나기까지 걸린 시간을 적는다. 단계가 바뀌었으면 true */
  note(ms: number): boolean {
    this.samples.push(ms);
    if (this.samples.length < WINDOW) return false;
    const sorted = [...this.samples].sort((a, b) => a - b);
    this.median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.samples = [];
    if (this.median > this.over(this.level)) {
      this.easy = 0;
      if (this.level < this.maxLevel) {
        this.level += 1;
        return true;
      }
      return false;
    }
    if (this.level > 0 && this.median < this.under(this.level)) {
      this.easy += 1;
      if (this.easy >= UP_WINDOWS) {
        this.easy = 0;
        this.level -= 1;
        return true;
      }
    } else this.easy = 0;
    return false;
  }
}

/** 끄는 동안 해상도 배율 */
export class MotionQuality extends Stepper {
  constructor(budget = new FrameBudget(), level = 0) {
    super(budget, level);
  }
  protected get maxLevel() {
    return MOTION_SCALES.length - 1;
  }
  protected over() {
    return this.budget.value;
  }
  protected under() {
    return this.budget.value * UP_SHARE;
  }
  get scale(): number {
    return MOTION_SCALES[this.level] ?? 1;
  }
}

/** 흔드는 동안 그리는 간격 단계: 화면 갱신 1·2·3·4번에 한 번 */
export const SWAY_EVERY = [1, 2, 3, 4] as const;
/**
 * 그리는 간격을 한 단계 좁혀도 되는 몫: 간격 N-1에서 한 장에 쓸 수 있는 시간(예산 × (N-1))의 이만큼 아래일 때
 * (한 장 시간은 간격과 상관없어 넉넉히 둔다)
 */
export const SWAY_UP_SHARE = 0.75;

/** 흔드는 동안 해상도는 그대로 두고 그리는 횟수를 줄인다 */
export class SwayPacer extends Stepper {
  protected get maxLevel() {
    return SWAY_EVERY.length - 1;
  }
  protected over(level: number) {
    return this.budget.value * (SWAY_EVERY[level] ?? 1);
  }
  protected under(level: number) {
    return this.budget.value * (SWAY_EVERY[level - 1] ?? 1) * SWAY_UP_SHARE;
  }
  /** 화면 갱신 몇 번에 한 번 그리는지 */
  get every(): number {
    return SWAY_EVERY[this.level] ?? 1;
  }
}

/**
 * 진열 흔들기(티어 화면)를 그만둘지: 가장 드물게(화면 갱신 네 번에 한 번) 그려도 한 장이 그 사이에 끝나지 않으면
 * (소프트웨어 GPU·저전력 기기). 끄는 동안은 사람이 움직이니 끊겨도 괜찮지만, 저절로 흔드는 것은 끊긴 장을 쉬지 않고
 * 그리며 CPU를 쓴다
 */
export function tooSlowToSway(p: SwayPacer): boolean {
  return (
    p.level === SWAY_EVERY.length - 1 &&
    p.median > p.budget.value * (SWAY_EVERY[p.level] ?? 1)
  );
}
