/**
 * 퍼즐 공통 계약(docs/47 2-1).
 *
 * 큐브가 아닌 퍼즐(피라밍크스·스퀘어-1·메가밍크스)까지 받으려고, 상태를
 * "스티커 자리의 순열 + 스티커 방향"으로 둔다. 엔진은 순열 쪽만, 3D 화면은
 * 그리기 정보(`PuzzleGeometry`) 쪽만 쓴다.
 */

/** 3차원 벡터. 그리기와 회전축에 쓴다. */
export type Vec3 = readonly [number, number, number];

/**
 * 퍼즐 상태.
 * - `perm[i]`: 자리 i에 지금 있는 스티커 번호(맞춘 상태에서는 `perm[i] === i`).
 * - `twist[i]`: 자리 i에 있는 스티커가 그 자리의 기준 방향에서 돌아간 정도
 *   (퍼즐마다 정한 몫으로 센다. 큐브는 90°씩 0~3). 보통 큐브의 판정에는 안 쓰고,
 *   그림 큐브(가운데 방향까지 맞추기)에서 쓴다.
 */
export interface PuzzleState {
  readonly perm: Uint16Array;
  readonly twist: Uint8Array;
}

/** 면 정의. 색은 엔진이 아니라 화면이 면 번호로 고른다. */
export interface FaceDef {
  /** 면 번호(스티커 배치 순서와 같다) */
  readonly id: number;
  /** 표기에 쓰는 이름(큐브: U R F D L B) */
  readonly name: string;
  /** 맞춘 상태에서 이 면이 바라보는 방향 */
  readonly normal: Vec3;
}

/** 조각(물리적인 한 덩어리)의 그리기 정보 */
export interface PieceGeometry {
  /** 조각 중심 좌표 */
  readonly position: Vec3;
  /** 이 조각에 붙은 스티커 자리 번호들 */
  readonly stickers: readonly number[];
}

/** 스티커 자리의 그리기 정보 */
export interface StickerGeometry {
  /** 이 자리가 속한 조각 자리 번호 */
  readonly piece: number;
  /** 이 자리가 있는 면 번호(맞춘 상태에서 이 자리에 있는 스티커의 색 자리) */
  readonly face: number;
  /** 스티커 중심 좌표(조각 표면 위) */
  readonly position: Vec3;
  /** 스티커가 바라보는 방향 */
  readonly normal: Vec3;
  /** 자리의 기준 "위" 방향. `twist`가 0이면 스티커의 위가 이쪽이다 */
  readonly up: Vec3;
}

/** 수 하나의 그리기 정보: 어느 축으로 몇 도, 어떤 조각이 움직이나 */
export interface MoveGeometry {
  /** 회전축(단위 벡터) */
  readonly axis: Vec3;
  /** 회전 각도(라디안, 오른손 법칙. 음수면 축 쪽에서 볼 때 시계 방향) */
  readonly angle: number;
  /** 움직이는 조각 자리 번호(오름차순) */
  readonly pieces: readonly number[];
}

export interface PuzzleGeometry<Move> {
  readonly pieces: readonly PieceGeometry[];
  readonly stickers: readonly StickerGeometry[];
  move(move: Move): MoveGeometry;
}

export interface SolvedOptions {
  /** 가운데 스티커 방향까지 맞아야 맞춤으로 본다(그림 큐브) */
  orientCenters?: boolean;
}

/** 퍼즐 하나의 정의. 표기는 퍼즐마다 달라 `parse`·`format`이 퍼즐 안에 있다. */
export interface PuzzleDef<Move> {
  /** "cube3", "cube4", 나중에 "pyraminx", "sq1" */
  readonly id: string;
  readonly stickerCount: number;
  readonly faces: readonly FaceDef[];
  solved(): PuzzleState;
  /** 표기 → 수. 잘못된 표기는 오류 */
  parse(text: string): Move[];
  format(moves: readonly Move[]): string;
  /** 둘 수 없는 수(스퀘어-1 모양)면 오류 */
  apply(state: PuzzleState, move: Move): PuzzleState;
  canApply?(state: PuzzleState, move: Move): boolean;
  /** 수열을 거꾸로(되돌리는 수열) */
  invert(moves: readonly Move[]): Move[];
  isSolved(state: PuzzleState, opts?: SolvedOptions): boolean;
  readonly geometry: PuzzleGeometry<Move>;
}

/**
 * 수 하나의 순열 표.
 * 자리 i에 있던 스티커는 `dest[i]`로 가고, 방향은 `twistDelta[i]`만큼 더 돈다(`twistMod`로 나눈 나머지).
 */
export interface MoveTable {
  readonly dest: Uint16Array;
  readonly twistDelta: Uint8Array;
  readonly twistMod: number;
}
