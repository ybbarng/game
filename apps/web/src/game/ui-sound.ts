import { useSettings } from "./settings";
import { type Cue, type PlayOptions, play } from "./sound";

/** 버튼·카드 고르기처럼 화면 조작에서 내는 소리. 소리를 꺼 두었으면 내지 않는다 */
export function playUiCue(cue: Cue, options?: PlayOptions): void {
  if (useSettings.getState().sound) play(cue, options);
}
