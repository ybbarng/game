import CoreGraphics
import Testing

@testable import CubieCore

struct WindowPlacementTests {
  /// 1512×982 화면에서 메뉴 막대 33, 아래 Dock 70을 뺀 보이는 영역
  let visible = CGRect(x: 0, y: 70, width: 1512, height: 982 - 70 - 33)
  let size = CGSize(width: 96, height: 96)

  @Test func 기본_자리는_보이는_영역_오른쪽_아래에서_여백만큼() {
    let f = WindowPlacement.defaultFrame(visible: visible, size: size, margin: 16)
    #expect(f == CGRect(x: 1512 - 96 - 16, y: 70 + 16, width: 96, height: 96))
  }

  @Test func 기본_자리는_보조_화면_좌표도_따른다() {
    // 주 화면 왼쪽에 놓인 화면(원점이 음수)
    let left = CGRect(x: -1920, y: -200, width: 1920, height: 1080)
    let f = WindowPlacement.defaultFrame(visible: left, size: size, margin: 16)
    #expect(f.maxX == -16)
    #expect(f.minY == -184)
  }

  @Test func 화면_안이면_그대로() {
    let f = WindowPlacement.defaultFrame(visible: visible, size: size, margin: 16)
    #expect(WindowPlacement.isOnScreen(f, screens: [visible]))
  }

  @Test func 떼어_낸_모니터_자리는_화면_밖() {
    let gone = CGRect(x: 2000, y: 300, width: 96, height: 96)
    #expect(!WindowPlacement.isOnScreen(gone, screens: [visible]))
  }

  @Test func 가장자리에_조금만_걸치면_화면_밖으로_본다() {
    // 오른쪽으로 밀려 10pt만 보인다
    let edge = CGRect(x: 1512 - 10, y: 300, width: 96, height: 96)
    #expect(!WindowPlacement.isOnScreen(edge, screens: [visible]))
    // 30pt 보이면 손잡이를 잡을 수 있다
    let enough = CGRect(x: 1512 - 30, y: 300, width: 96, height: 96)
    #expect(WindowPlacement.isOnScreen(enough, screens: [visible]))
  }

  @Test func 여러_화면_중_하나에_있으면_화면_안() {
    let second = CGRect(x: 1512, y: 0, width: 1920, height: 1080)
    let there = CGRect(x: 2500, y: 500, width: 96, height: 96)
    #expect(WindowPlacement.isOnScreen(there, screens: [visible, second]))
  }

  @Test func 화면이_없으면_화면_밖() {
    #expect(!WindowPlacement.isOnScreen(CGRect(x: 0, y: 0, width: 96, height: 96), screens: []))
  }
}
