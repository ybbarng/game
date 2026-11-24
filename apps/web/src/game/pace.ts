/**
 * 봇 수 사이에 브라우저가 그림을 그리고 입력을 받게 한다. 모든 게임 저장소가 쓰므로 마이티 컴퓨터(`bots.ts`)와
 * 따로 둔다(2026-11-25 첫 화면 가볍게, 예전에는 bots.ts에 있어 모든 게임이 마이티 컴퓨터를 실었다)
 */
export function browserPace(next: () => void): void {
  setTimeout(next, 0);
}
