import type { Clock } from "@game/fair-play";

/**
 * Cubie 「공식 보기」(docs/47 15-15, 2026-11-09): 맞추는 동안 힌트 키를 누르면 지금 상황에 맞는 공식 하나를 잠깐 보인다.
 * 사용자 「단축키로 힌트 보기 같은 느낌, 누르면 현재 상황에서만 뜨고 좀 있다가 사라진다든지, 여러 번 누르기 힘들게」.
 *
 * 이 파일은 가벼운 것만 둔다(규칙 값, 횟수·시간 제한). 공식 고르기는 해법·공식 모음을 불러오는 `hint-pick.ts`(필요할 때 불러옴).
 */

/** 공식 보기 규칙. 바꾸려면 여기만 고친다 */
export const HINT_RULES = {
  /** 보이는 시간(ms). 그 전에 수를 두면 바로 사라진다 */
  showMs: 5000,
  /** 한 번 본 뒤 다시 볼 수 없는 시간(ms, 보기 시작부터) */
  cooldownMs: 20_000,
  /** 한 판에 볼 수 있는 횟수 */
  perSolve: 3,
} as const;

/**
 * 힌트 키(`KeyboardEvent.code`, 조합 키 없이): `\`. 두 기본 배치(「두 손」·「표기」, `input/keymaps.ts`)가 쓰지 않고, 맥
 * 키보드에서 Enter(섞기) 바로 위라 찾기 쉽다. 사용자 배치가 `\`를 쓰면 그 배치를 따른다.
 * 예전(앱 0.1.3~0.1.8)에는 F1도 힌트였지만 2026-11-11부터 F1은 앱의 「단축키 보기」다(docs/47 15-25)
 */
export const HINT_KEYS = ["Backslash"] as const;
export const HINT_KEY_LABEL = "\\";

/** 창 안에 바로 보일 만한 창의 짧은 변(CSS px). 이보다 작으면 앱의 말풍선, 말풍선이 없으면 작게 */
export const HINT_INLINE_MIN = 240;

/** 「배우기」 메뉴가 여는 곳: 사이트 해법 익히기(해법을 고르면 배우기 단원과 공식 연습, docs/47 16-2) */
export const LEARN_PATH = "/cube/methods";

/** 보일 공식 하나 */
export interface FormulaHint {
  /** 단계 이름(「OLL 1단계: 노란 십자」·「F2L 짝」 등) */
  stage: string;
  /** 상황 이름(있으면, 「엣지: 가로줄」) */
  name?: string;
  /** 공식 앞에 쥐는 법(큐브 돌리기·윗면 돌리기, 예 "y2 U"). 없으면 "" */
  before: string;
  /** 공식(WCA 표기) */
  alg: string;
  /** 더 배우는 단원 id(`/cube/learn?lesson=`) */
  lesson?: string;
}

export type HintAnswer =
  | { kind: "hint"; hint: FormulaHint }
  /** 이 크기는 판정이 없다 */
  | { kind: "unsupported" }
  /** 지금 상태에서 낼 공식이 없다(이미 맞음 등) */
  | { kind: "none" };

export type HintRequest =
  | { ok: true; used: number }
  | { ok: false; reason: "cooldown"; seconds: number }
  | { ok: false; reason: "limit" };

/**
 * 한 판의 공식 보기 횟수와 시간 제한. 시계는 넣어 받는다(제품 `realClock`, 시험 `ManualClock`).
 * 보이는 동안이면 `showing`이 참이고, `showMs` 뒤나 `hide()`(수를 둠)에 거짓이 된다
 */
export class HintGate {
  private usedCount = 0;
  private lastAt: number | null = null;
  private cancelHide: (() => void) | null = null;
  showing = false;

  constructor(
    private readonly clock: Clock,
    private readonly onChange: () => void = () => {},
    private readonly rules: typeof HINT_RULES = HINT_RULES,
  ) {}

  /** 이번 판에 본 횟수 */
  get used(): number {
    return this.usedCount;
  }

  /** 새 판(섞기): 횟수와 시간 제한을 처음으로 */
  reset(): void {
    this.hide();
    this.usedCount = 0;
    this.lastAt = null;
  }

  /** 보기를 청한다. 되면 보이는 상태로 바꾸고 `showMs` 뒤 숨긴다 */
  request(): HintRequest {
    if (this.usedCount >= this.rules.perSolve)
      return { ok: false, reason: "limit" };
    const now = this.clock.now();
    if (this.lastAt !== null && now - this.lastAt < this.rules.cooldownMs)
      return {
        ok: false,
        reason: "cooldown",
        seconds: Math.ceil(
          (this.rules.cooldownMs - (now - this.lastAt)) / 1000,
        ),
      };
    this.usedCount++;
    this.lastAt = now;
    this.cancelHide?.();
    this.showing = true;
    this.cancelHide = this.clock.after(this.rules.showMs, () => {
      this.cancelHide = null;
      this.hide();
    });
    this.onChange();
    return { ok: true, used: this.usedCount };
  }

  /** 숨긴다(시간이 다 됨·수를 둠·판이 끝남). 횟수는 그대로 */
  hide(): void {
    this.cancelHide?.();
    this.cancelHide = null;
    if (!this.showing) return;
    this.showing = false;
    this.onChange();
  }

  dispose(): void {
    this.cancelHide?.();
    this.cancelHide = null;
  }
}

/** 공식 한 줄 → 수 낱말들 */
export function algTokens(alg: string): string[] {
  return alg.split(/\s+/).filter(Boolean);
}
