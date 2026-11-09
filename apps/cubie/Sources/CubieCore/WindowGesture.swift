import CoreGraphics
import Foundation

/// 큐브 창을 마우스로 옮기고 크기를 바꾸는 계산(화면 없이 시험한다, docs/47 15-18).
/// 좌표는 AppKit 화면 좌표(왼쪽 아래 원점, pt).
/// - 큐브·거울을 끌면 창이 옮겨진다. 누른 자리에서 `dragThreshold`보다 덜 움직이고 떼면 클릭(큐브가 키를 받는다).
/// - 핀치·⌘ + 스크롤·메뉴 「창 크기」는 오른쪽 아래 구석을 그대로 두고 줄고 는다(화면 구석 자리가 유지된다).
public enum WindowGesture {
  /// 이만큼(pt) 넘게 움직여야 끌기로 본다. 그보다 덜 움직이고 떼면 클릭
  public static let dragThreshold: CGFloat = 4

  /// 누른 자리 `from`에서 지금 자리 `to`까지가 끌기인가
  public static func isDrag(from: CGPoint, to: CGPoint, threshold: CGFloat = dragThreshold) -> Bool {
    hypot(to.x - from.x, to.y - from.y) >= threshold
  }

  /// 끌기: 누를 때 창 자리 `origin`에서 마우스가 움직인 만큼 옮긴 자리
  public static func dragged(origin: CGPoint, from: CGPoint, to: CGPoint) -> CGPoint {
    CGPoint(x: origin.x + (to.x - from.x), y: origin.y + (to.y - from.y))
  }

  /// 오른쪽 아래 구석을 그대로 두고 크기만 바꾼 자리
  public static func anchored(_ frame: CGRect, size: CGSize) -> CGRect {
    CGRect(x: frame.maxX - size.width, y: frame.minY, width: size.width, height: size.height)
  }

  /// `frame`을 `factor`배로(가로세로 비율 그대로). 짧은 쪽이 `min`, 긴 쪽이 `max`를 넘지 않게 배율을 당긴다.
  /// 비율이 아주 길어 둘을 함께 지킬 수 없으면 가로·세로를 따로 당긴다
  public static func scaled(_ frame: CGRect, by factor: CGFloat, min lo: CGSize, max hi: CGSize) -> CGRect {
    guard frame.width > 0, frame.height > 0, factor.isFinite, factor > 0 else { return frame }
    let fLo = Swift.max(lo.width / frame.width, lo.height / frame.height)
    let fHi = Swift.min(hi.width / frame.width, hi.height / frame.height)
    let size: CGSize
    if fLo <= fHi {
      let f = Swift.min(Swift.max(factor, fLo), fHi)
      size = CGSize(width: frame.width * f, height: frame.height * f)
    } else {
      size = clamped(CGSize(width: frame.width * factor, height: frame.height * factor), min: lo, max: hi)
    }
    return anchored(frame, size: size)
  }

  /// 메뉴 「창 크기」: 정사각형 `side`로(오른쪽 아래 구석 그대로)
  public static func resized(_ frame: CGRect, side: CGFloat, min lo: CGSize, max hi: CGSize) -> CGRect {
    anchored(frame, size: clamped(CGSize(width: side, height: side), min: lo, max: hi))
  }

  /// 메뉴 「창 크기」의 체크 표시: 지금 크기가 그 정사각형이면(0.5pt 안쪽) 그 값
  public static func preset(of size: CGSize, in presets: [CGFloat]) -> CGFloat? {
    presets.first { abs(size.width - $0) < 0.5 && abs(size.height - $0) < 0.5 }
  }

  /// 트랙패드 핀치 한 번(`NSEvent.magnification`, 벌리면 +)의 배율
  public static func pinchFactor(magnification: CGFloat) -> CGFloat {
    stepClamp(1 + magnification)
  }

  /// ⌘ + 스크롤 한 번(`NSEvent.scrollingDeltaY`)의 배율. 위로 굴리면(값이 +) 커진다.
  /// 트랙패드·매직 마우스(`precise`, pt 단위)는 100pt에 약 1.5배, 칸 단위 휠은 한 칸에 1.1배
  public static func scrollFactor(deltaY: CGFloat, precise: Bool) -> CGFloat {
    guard deltaY.isFinite else { return 1 }
    return stepClamp(precise ? exp(deltaY * 0.004) : pow(1.1, deltaY))
  }

  /// 사건 하나로 너무 크게 바뀌지 않게(한 번에 0.5~2배)
  private static func stepClamp(_ f: CGFloat) -> CGFloat {
    guard f.isFinite else { return 1 }
    return Swift.min(Swift.max(f, 0.5), 2)
  }

  private static func clamped(_ s: CGSize, min lo: CGSize, max hi: CGSize) -> CGSize {
    CGSize(
      width: Swift.min(Swift.max(s.width, lo.width), hi.width),
      height: Swift.min(Swift.max(s.height, lo.height), hi.height))
  }
}

/// 핀치·스크롤이 잇달아 올 때 작은 배율을 모아 둔다. 사건마다 지금 창 크기에 곱하면 창 크기가 화면 픽셀에
/// 맞춰 반올림될 때 아주 작은 변화가 사라져 천천히 벌리면 크기가 움직이지 않는다. 그래서 처음 크기(`base`)와
/// 모은 배율로 매번 다시 계산한다. 창이 그 사이 다른 까닭(손잡이·메뉴·옮기기)으로 바뀌었으면 새로 시작한다
public struct WindowZoom {
  private var base: CGRect?
  private var factor: CGFloat = 1
  private var last: CGRect?

  public init() {}

  /// 이번 사건 배율 `step`을 더한 새 자리. `current`는 지금 창 자리
  public mutating func apply(step: CGFloat, current: CGRect, min lo: CGSize, max hi: CGSize) -> CGRect {
    if base == nil || last.map({ !Self.near($0, current) }) ?? true {
      base = current
      factor = 1
    }
    let b = base!
    let next = WindowGesture.scaled(b, by: factor * step, min: lo, max: hi)
    // 한계에 닿았으면 모은 배율도 거기서 멈춘다(반대로 움직이면 바로 돌아온다)
    factor = next.width / b.width
    last = next
    return next
  }

  /// 손을 뗐다(핀치 끝): 다음 사건은 새로 시작한다
  public mutating func end() {
    base = nil
    last = nil
    factor = 1
  }

  private static func near(_ a: CGRect, _ b: CGRect) -> Bool {
    abs(a.minX - b.minX) < 1 && abs(a.minY - b.minY) < 1 && abs(a.width - b.width) < 1
      && abs(a.height - b.height) < 1
  }
}
