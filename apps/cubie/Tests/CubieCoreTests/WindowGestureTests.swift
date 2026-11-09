import CoreGraphics
import Testing

@testable import CubieCore

struct WindowGestureTests {
  let lo = CGSize(width: 48, height: 48)
  let hi = CGSize(width: 480, height: 480)
  /// 화면 오른쪽 아래 구석의 96pt 창
  let frame = CGRect(x: 1400, y: 86, width: 96, height: 96)

  // MARK: 끌기와 클릭

  @Test func 문턱보다_덜_움직이면_클릭() {
    let p = CGPoint(x: 100, y: 100)
    #expect(!WindowGesture.isDrag(from: p, to: p))
    #expect(!WindowGesture.isDrag(from: p, to: CGPoint(x: 102, y: 102)))  // 약 2.8pt
    #expect(!WindowGesture.isDrag(from: p, to: CGPoint(x: 103.9, y: 100)))
  }

  @Test func 문턱만큼_움직이면_끌기() {
    let p = CGPoint(x: 100, y: 100)
    #expect(WindowGesture.isDrag(from: p, to: CGPoint(x: 104, y: 100)))
    #expect(WindowGesture.isDrag(from: p, to: CGPoint(x: 97, y: 97)))  // 약 4.2pt, 왼쪽 아래로
  }

  @Test func 끌면_움직인_만큼_창이_옮겨진다() {
    let o = WindowGesture.dragged(
      origin: CGPoint(x: 1400, y: 86), from: CGPoint(x: 1450, y: 130), to: CGPoint(x: 1300, y: 400))
    #expect(o == CGPoint(x: 1250, y: 356))
  }

  // MARK: 크기

  @Test func 키우면_오른쪽_아래_구석이_그대로() {
    let f = WindowGesture.scaled(frame, by: 1.5, min: lo, max: hi)
    #expect(f.size == CGSize(width: 144, height: 144))
    #expect(f.maxX == frame.maxX)
    #expect(f.minY == frame.minY)
  }

  @Test func 줄여도_오른쪽_아래_구석이_그대로() {
    let f = WindowGesture.scaled(frame, by: 0.75, min: lo, max: hi)
    #expect(f.size == CGSize(width: 72, height: 72))
    #expect(f.maxX == frame.maxX)
    #expect(f.minY == frame.minY)
  }

  @Test func 가장_작은_크기_아래로_줄지_않는다() {
    let f = WindowGesture.scaled(frame, by: 0.1, min: lo, max: hi)
    #expect(f.size == lo)
    #expect(f.maxX == frame.maxX)
  }

  @Test func 가장_큰_크기_위로_늘지_않는다() {
    let f = WindowGesture.scaled(frame, by: 100, min: lo, max: hi)
    #expect(f.size == hi)
    #expect(f.minY == frame.minY)
  }

  @Test func 직사각형_창은_비율을_지키며_짧은_쪽이_한계에서_멈춘다() {
    let wide = CGRect(x: 0, y: 0, width: 192, height: 96)
    let f = WindowGesture.scaled(wide, by: 0.1, min: lo, max: hi)
    #expect(f.size == CGSize(width: 96, height: 48))
    let g = WindowGesture.scaled(wide, by: 10, min: lo, max: hi)
    #expect(g.size == CGSize(width: 480, height: 240))
  }

  @Test func 메뉴_창_크기는_정사각형으로_구석_기준() {
    let wide = CGRect(x: 1000, y: 86, width: 150, height: 100)
    let f = WindowGesture.resized(wide, side: 200, min: lo, max: hi)
    #expect(f == CGRect(x: 950, y: 86, width: 200, height: 200))
  }

  @Test func 메뉴_체크는_지금_크기가_그_정사각형일_때만() {
    let presets: [CGFloat] = [72, 96, 144, 200]
    #expect(WindowGesture.preset(of: CGSize(width: 96, height: 96), in: presets) == 96)
    #expect(WindowGesture.preset(of: CGSize(width: 143.7, height: 144.2), in: presets) == 144)
    #expect(WindowGesture.preset(of: CGSize(width: 96, height: 120), in: presets) == nil)
    #expect(WindowGesture.preset(of: CGSize(width: 100, height: 100), in: presets) == nil)
  }

  // MARK: 핀치·스크롤 배율

  @Test func 핀치는_벌리면_커지고_오므리면_작아진다() {
    #expect(WindowGesture.pinchFactor(magnification: 0.1) > 1)
    #expect(WindowGesture.pinchFactor(magnification: -0.1) < 1)
    #expect(WindowGesture.pinchFactor(magnification: 0) == 1)
    // 한 번에 너무 크게 바뀌지 않는다
    #expect(WindowGesture.pinchFactor(magnification: -5) == 0.5)
    #expect(WindowGesture.pinchFactor(magnification: 5) == 2)
  }

  @Test func 스크롤은_위로_굴리면_커진다() {
    #expect(WindowGesture.scrollFactor(deltaY: 10, precise: true) > 1)
    #expect(WindowGesture.scrollFactor(deltaY: -10, precise: true) < 1)
    #expect(abs(WindowGesture.scrollFactor(deltaY: 1, precise: false) - 1.1) < 1e-9)
    #expect(abs(WindowGesture.scrollFactor(deltaY: -1, precise: false) - 1 / 1.1) < 1e-9)
    #expect(WindowGesture.scrollFactor(deltaY: .nan, precise: true) == 1)
    #expect(WindowGesture.scrollFactor(deltaY: 10_000, precise: true) == 2)
  }

  @Test func 스크롤을_올렸다_내리면_제자리() {
    let up = WindowGesture.scrollFactor(deltaY: 30, precise: true)
    let down = WindowGesture.scrollFactor(deltaY: -30, precise: true)
    #expect(abs(up * down - 1) < 1e-9)
  }

  // MARK: 잇단 사건 모으기

  @Test func 작은_핀치를_모아_크기가_바뀐다() {
    var zoom = WindowZoom()
    var f = frame
    // 창이 픽셀에 맞춰 반올림되어도(앱이 넘기는 지금 자리) 모은 배율로 계산한다
    for _ in 0..<50 {
      f = zoom.apply(step: 1.004, current: f.integral, min: lo, max: hi)
    }
    #expect(f.width > 115)
    #expect(abs(f.maxX - frame.maxX) < 1)
    #expect(abs(f.minY - frame.minY) < 1)
  }

  @Test func 한계에_닿은_뒤_반대로_움직이면_바로_돌아온다() {
    var zoom = WindowZoom()
    var f = frame
    for _ in 0..<20 { f = zoom.apply(step: 2, current: f, min: lo, max: hi) }
    #expect(f.size == hi)
    f = zoom.apply(step: 0.5, current: f, min: lo, max: hi)
    #expect(f.size == CGSize(width: 240, height: 240))
  }

  @Test func 그_사이_창이_바뀌었으면_새로_시작한다() {
    var zoom = WindowZoom()
    _ = zoom.apply(step: 1.5, current: frame, min: lo, max: hi)
    // 손잡이로 크기를 바꿨다
    let other = CGRect(x: 500, y: 500, width: 100, height: 100)
    let f = zoom.apply(step: 1.2, current: other, min: lo, max: hi)
    #expect(f == CGRect(x: 480, y: 500, width: 120, height: 120))
  }

  @Test func 끝내면_다음은_새로_시작한다() {
    var zoom = WindowZoom()
    let a = zoom.apply(step: 1.5, current: frame, min: lo, max: hi)
    zoom.end()
    let b = zoom.apply(step: 1.5, current: a, min: lo, max: hi)
    #expect(b.size == CGSize(width: 216, height: 216))
  }
}
