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

  // MARK: 화면 옮기기(모니터 두 대)

  /// 노트북(주 화면, 원점) 오른쪽에 위 끝을 맞춰 놓은 1920×1080 모니터(Dock 없음, 메뉴 막대 25)
  let external = CGRect(x: 1512, y: 982 - 1080, width: 1920, height: 1080 - 25)

  @Test func 창이_더_많이_걸친_화면을_지금_화면으로_본다() {
    let screens = [visible, external]
    let onLaptop = WindowPlacement.defaultFrame(visible: visible, size: size, margin: 16)
    #expect(WindowPlacement.screenIndex(of: onLaptop, screens: screens) == 0)
    // 경계에 걸쳐도 더 많이 걸친 쪽(오른쪽으로 60pt 넘어감)
    let straddle = CGRect(x: 1512 - 36, y: 300, width: 96, height: 96)
    #expect(WindowPlacement.screenIndex(of: straddle, screens: screens) == 1)
    #expect(WindowPlacement.screenIndex(of: CGRect(x: 9000, y: 0, width: 96, height: 96), screens: screens) == nil)
  }

  @Test func 다른_화면으로_옮기면_그_화면_오른쪽_아래로_크기는_그대로() {
    let now = CGRect(x: 400, y: 400, width: 140, height: 120)
    let f = WindowPlacement.moved(now, to: external, margin: 16)
    #expect(f == CGRect(x: 1512 + 1920 - 140 - 16, y: external.minY + 16, width: 140, height: 120))
    #expect(WindowPlacement.screenIndex(of: f, screens: [visible, external]) == 1)
    // 왼쪽(음수 좌표) 화면으로도
    let left = CGRect(x: -1920, y: -200, width: 1920, height: 1080)
    let g = WindowPlacement.moved(f, to: left, margin: 16)
    #expect(g.maxX == -16)
    #expect(g.size == f.size)
  }

  // MARK: 공식 보기 말풍선

  let bubble = CGSize(width: 220, height: 90)

  @Test func 말풍선은_화면_안쪽으로_창_옆에_위_끝을_맞춘다() {
    // 기본 자리(오른쪽 아래): 왼쪽에
    let cube = WindowPlacement.defaultFrame(visible: visible, size: size, margin: 16)
    let b = WindowPlacement.bubbleFrame(cube: cube, bubble: bubble, visible: visible)
    #expect(b.maxX == cube.minX - 8)
    #expect(b.maxY == cube.maxY)
    // 화면 왼쪽 위 창: 오른쪽에
    let topLeft = CGRect(x: visible.minX + 16, y: visible.maxY - 16 - 96, width: 96, height: 96)
    let c = WindowPlacement.bubbleFrame(cube: topLeft, bubble: bubble, visible: visible)
    #expect(c.minX == topLeft.maxX + 8)
    #expect(c.maxY == topLeft.maxY)
  }

  @Test func 말풍선은_보이는_영역_밖으로_나가지_않는다() {
    // 아래 끝에 붙은 작은 창: 위 끝을 맞추면 Dock 아래로 내려가므로 올린다
    let low = CGRect(x: 1000, y: visible.minY, width: 48, height: 48)
    let b = WindowPlacement.bubbleFrame(cube: low, bubble: bubble, visible: visible)
    #expect(b.minY == visible.minY)
    // 다른 모니터의 창은 그 모니터 안쪽으로
    let there = WindowPlacement.defaultFrame(visible: external, size: size, margin: 16)
    let c = WindowPlacement.bubbleFrame(cube: there, bubble: bubble, visible: external)
    #expect(external.contains(c))
    #expect(c.maxX == there.minX - 8)
  }
}
