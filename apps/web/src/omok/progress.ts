import { createStudyProgress } from "@/study/progress";

/** 오목 수 배우기 진행 기록. 첫 그리기 뒤 OmokApp이 읽는다 */
export const useOmokStudyProgress = createStudyProgress("omok-study");
