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

  // MARK: 보이는가(창 넓이의 70%가 한 화면 안)

  @Test func 화면_안이면_보인다() {
    let f = WindowPlacement.defaultFrame(visible: visible, size: size, margin: 16)
    #expect(WindowPlacement.isMostlyVisible(f, screens: [visible]))
  }

  @Test func 떼어_낸_모니터_자리는_보이지_않는다() {
    let gone = CGRect(x: 2000, y: 300, width: 96, height: 96)
    #expect(!WindowPlacement.isMostlyVisible(gone, screens: [visible]))
  }

  @Test func 가장자리에_걸치면_70퍼센트부터_보인다() {
    // 오른쪽으로 밀려 30pt만 보인다(손잡이는 잡히지만 큐브는 거의 안 보인다)
    let edge = CGRect(x: 1512 - 30, y: 300, width: 96, height: 96)
    #expect(!WindowPlacement.isMostlyVisible(edge, screens: [visible]))
    // 72pt(75%) 보이면 보인다
    let enough = CGRect(x: 1512 - 72, y: 300, width: 96, height: 96)
    #expect(WindowPlacement.isMostlyVisible(enough, screens: [visible]))
  }

  @Test func 두_화면에_반씩_걸치면_보이지_않는다() {
    // 한 화면 안에 70%가 있어야 한다(경계에 걸친 창은 어느 화면에서도 반쪽만 보인다)
    let second = CGRect(x: 1512, y: 70, width: 1920, height: 1080)
    let half = CGRect(x: 1512 - 48, y: 300, width: 96, height: 96)
    #expect(!WindowPlacement.isMostlyVisible(half, screens: [visible, second]))
  }

  @Test func 여러_화면_중_하나에_있으면_보인다() {
    let second = CGRect(x: 1512, y: 0, width: 1920, height: 1080)
    let there = CGRect(x: 2500, y: 500, width: 96, height: 96)
    #expect(WindowPlacement.isMostlyVisible(there, screens: [visible, second]))
  }

  @Test func 화면이_없으면_보이지_않는다() {
    #expect(!WindowPlacement.isMostlyVisible(CGRect(x: 0, y: 0, width: 96, height: 96), screens: []))
  }

  // MARK: 화면 안으로 당기기

  @Test func 당기면_창이_화면_안으로_들어온다() {
    let edge = CGRect(x: 1512 - 30, y: 20, width: 96, height: 96)
    let f = WindowPlacement.clamped(edge, into: visible)
    #expect(f == CGRect(x: 1512 - 96, y: 70, width: 96, height: 96))
  }

  @Test func 화면보다_큰_창은_화면_크기로_줄인다() {
    let small = CGRect(x: 0, y: 0, width: 400, height: 300)
    let f = WindowPlacement.clamped(CGRect(x: 200, y: 100, width: 480, height: 480), into: small)
    #expect(f == small)
  }

  // MARK: 화면 구성이 바뀐 뒤 창 자리

  /// 노트북 오른쪽 모니터(1920×1080, 메뉴 막대 25)
  var monitor: CGRect { CGRect(x: 1512, y: 982 - 1080, width: 1920, height: 1080 - 25) }

  @Test func 저장한_자리가_보이면_그리로() {
    let saved = CGRect(x: 3000, y: 400, width: 144, height: 144)
    let now = WindowPlacement.defaultFrame(visible: visible, size: size, margin: 16)
    let f = WindowPlacement.placed(
      saved: saved, current: now, screens: [visible, monitor], defaultSize: size, margin: 16)
    #expect(f == saved)
  }

  @Test func 저장한_자리가_없고_지금_자리가_보이면_그대로() {
    let now = CGRect(x: 300, y: 300, width: 144, height: 144)
    let f = WindowPlacement.placed(saved: nil, current: now, screens: [visible], defaultSize: size, margin: 16)
    #expect(f == now)
  }

  @Test func 모니터를_떼면_노트북_기본_자리로() {
    // 모니터에 있던 창, 모니터를 뗀 뒤 노트북 화면만 남음
    let now = CGRect(x: 3000, y: 400, width: 144, height: 144)
    let f = WindowPlacement.placed(saved: nil, current: now, screens: [visible], defaultSize: size, margin: 16)
    #expect(f == WindowPlacement.defaultFrame(visible: visible, size: size, margin: 16))
  }

  @Test func 저장한_자리도_사라진_화면이면_지금_자리를_본다() {
    let saved = CGRect(x: 3000, y: 400, width: 144, height: 144)
    let now = CGRect(x: 300, y: 300, width: 96, height: 96)
    let f = WindowPlacement.placed(saved: saved, current: now, screens: [visible], defaultSize: size, margin: 16)
    #expect(f == now)
  }

  @Test func 조금_걸쳐_있으면_가장_많이_걸친_화면_안으로_당긴다() {
    // 노트북 오른쪽 끝에 20pt만 남은 창
    let now = CGRect(x: 1512 - 20, y: 300, width: 96, height: 96)
    let f = WindowPlacement.placed(saved: nil, current: now, screens: [visible], defaultSize: size, margin: 16)
    #expect(f == CGRect(x: 1512 - 96, y: 300, width: 96, height: 96))
    #expect(WindowPlacement.isMostlyVisible(f, screens: [visible]))
  }

  @Test func 저장한_자리가_조금_걸치면_그_자리를_당긴다() {
    let saved = CGRect(x: 1512 - 20, y: 500, width: 144, height: 144)
    let now = CGRect(x: 9000, y: 9000, width: 96, height: 96)
    let f = WindowPlacement.placed(saved: saved, current: now, screens: [visible], defaultSize: size, margin: 16)
    #expect(f == CGRect(x: 1512 - 144, y: 500, width: 144, height: 144))
  }

  @Test func 걸친_화면보다_큰_창은_줄여서_당긴다() {
    let tiny = CGRect(x: 0, y: 0, width: 320, height: 240)
    let now = CGRect(x: 200, y: 100, width: 480, height: 480)
    let f = WindowPlacement.placed(saved: nil, current: now, screens: [tiny], defaultSize: size, margin: 16)
    #expect(f == tiny)
  }

  @Test func 왼쪽_모니터를_떼도_주_화면으로() {
    let left = CGRect(x: -1920, y: -200, width: 1920, height: 1080)
    let now = WindowPlacement.defaultFrame(visible: left, size: size, margin: 16)
    let both = WindowPlacement.placed(
      saved: nil, current: now, screens: [visible, left], defaultSize: size, margin: 16)
    #expect(both == now)
    let f = WindowPlacement.placed(saved: nil, current: now, screens: [visible], defaultSize: size, margin: 16)
    #expect(f == WindowPlacement.defaultFrame(visible: visible, size: size, margin: 16))
  }

  @Test func 화면이_하나도_없으면_그대로_둔다() {
    let now = CGRect(x: 3000, y: 400, width: 96, height: 96)
    #expect(WindowPlacement.placed(saved: nil, current: now, screens: [], defaultSize: size, margin: 16) == now)
  }

  // MARK: 화면 구성 이름표

  @Test func 화면_차례가_달라도_같은_구성이면_같은_이름표() {
    let a = (name: "Built-in Retina Display", frame: CGRect(x: 0, y: 0, width: 1512, height: 982))
    let b = (name: "DELL U2720Q", frame: CGRect(x: 1512, y: -98, width: 1920, height: 1080))
    #expect(WindowPlacement.layoutKey([a, b]) == WindowPlacement.layoutKey([b, a]))
  }

  @Test func 모니터를_떼거나_옮기면_다른_이름표() {
    let a = (name: "Built-in Retina Display", frame: CGRect(x: 0, y: 0, width: 1512, height: 982))
    let b = (name: "DELL U2720Q", frame: CGRect(x: 1512, y: -98, width: 1920, height: 1080))
    let bLeft = (name: "DELL U2720Q", frame: CGRect(x: -1920, y: -98, width: 1920, height: 1080))
    let two = WindowPlacement.layoutKey([a, b])
    #expect(two != WindowPlacement.layoutKey([a]))
    #expect(two != WindowPlacement.layoutKey([a, bLeft]))
  }

  @Test func 같은_이름_모니터_둘은_자리로_갈린다() {
    let a = (name: "LG", frame: CGRect(x: 0, y: 0, width: 1920, height: 1080))
    let b = (name: "LG", frame: CGRect(x: 1920, y: 0, width: 1920, height: 1080))
    let c = (name: "LG", frame: CGRect(x: -1920, y: 0, width: 1920, height: 1080))
    #expect(WindowPlacement.layoutKey([a, b]) != WindowPlacement.layoutKey([a, c]))
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
