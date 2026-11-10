/**
 * 화면 크기(playwright 프로젝트)마다 어느 시험을 돌릴지(2026-11-10, docs/38 17절).
 *
 * 예전에는 시험 안에서 `test.skip(info.project.name !== "desktop")`으로 건너뛰었다. 그러면 건너뛸 시험도 목록에 들어가
 * 브라우저 문맥을 띄웠다 닫고, CI 조각 나누기의 개수에도 들어갔다(한 번 전부 돌 때 484개). 이제는 시험에 태그를 달고
 * 프로젝트 설정의 grepInvert로 아예 목록에서 뺀다. 파일 전체가 한 크기만 볼 때는 파일 이름을 아래 `FILE_ONLY`에 적는다
 * (Playwright는 파일에 태그를 달 수 없다).
 *
 * - `@only-desktop`: 데스크톱에서만
 * - `@only-phone-portrait`: 휴대폰 세로에서만
 * - `@no-phone-landscape`: 데스크톱과 휴대폰 세로에서(휴대폰 가로는 빼기)
 *
 * 태그가 여럿이면 모두 지킨다(describe 태그와 시험 태그가 겹쳐도 그렇다).
 * 화면 크기와 상관없이 환경 변수(FAIR_MULTI, E2E_SCREENSHOTS 등)로 켜는 시험은 그대로 `test.skip`을 쓴다.
 */
export type ProjectName = "phone-portrait" | "desktop" | "phone-landscape";

export const ONLY_DESKTOP = "@only-desktop";
export const ONLY_PHONE_PORTRAIT = "@only-phone-portrait";
export const NO_PHONE_LANDSCAPE = "@no-phone-landscape";

/** 파일 전체가 한 크기(또는 둘)만 보는 spec → 도는 프로젝트 */
export const FILE_ONLY: Record<string, readonly ProjectName[]> = {
  // 부품의 3D 길은 화면 크기와 상관없어 데스크톱 하나로 본다
  "cube-3d.spec.ts": ["desktop"],
  // 휴대폰 세로와 데스크톱으로 본다
  "cube-bots.spec.ts": ["phone-portrait", "desktop"],
  // 키보드 기기만
  "cube-keys-polish.spec.ts": ["desktop"],
  // 웹뷰 띠의 판단은 기기 크기와 상관없어 휴대폰 세로로만 본다
  "stardraw-webview.spec.ts": ["phone-portrait"],
};

const EXCLUDED_TAGS: Record<ProjectName, readonly string[]> = {
  desktop: [ONLY_PHONE_PORTRAIT],
  "phone-portrait": [ONLY_DESKTOP],
  "phone-landscape": [ONLY_DESKTOP, ONLY_PHONE_PORTRAIT, NO_PHONE_LANDSCAPE],
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/** 프로젝트 설정에 펼쳐 넣는 거르기(태그로 빼기 + 파일로 빼기) */
export function projectFilter(name: ProjectName) {
  // 태그 뒤에 글자가 이어지면(예: @only-desktop-x) 다른 태그다
  const tags = EXCLUDED_TAGS[name].map((t) => `${escapeRegExp(t)}(?![\\w-])`);
  const ignored = Object.entries(FILE_ONLY)
    .filter(([, only]) => !only.includes(name))
    .map(([file]) => `**/${file}`);
  return {
    grepInvert: new RegExp(tags.join("|")),
    ...(ignored.length ? { testIgnore: ignored } : {}),
  };
}
