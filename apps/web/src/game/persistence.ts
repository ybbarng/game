import type { SavedMatch } from "./local-match";
import { savedMatchSlot } from "./saved-slot";

/** 마이티 진행 중인 대국 저장(이어하기) */
const slot = savedMatchSlot<SavedMatch>("mighty-save");
export const saveGame = slot.save;
export const loadGame = slot.load;
export const clearGame = slot.clear;
