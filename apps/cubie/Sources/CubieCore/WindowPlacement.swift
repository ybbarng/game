import CoreGraphics

/// 큐브 창의 기본 자리와 「저장된 자리가 아직 화면 안인가」 판단(화면 없이 시험한다).
/// 좌표는 AppKit 화면 좌표(왼쪽 아래 원점, pt). 앱(`CubeWindow`)이 `NSScreen.visibleFrame`을 넘긴다.
public enum WindowPlacement {
  /// 주 화면 보이는 영역(Dock·메뉴 막대 뺀 곳)의 오른쪽 아래 모서리에서 `margin`만큼 띄운 자리
  public static func defaultFrame(visible: CGRect, size: CGSize, margin: CGFloat) -> CGRect {
    CGRect(
      x: visible.maxX - size.width - margin,
      y: visible.minY + margin,
      width: size.width,
      height: size.height)
  }

  // MARK: 모니터를 붙이고 뗄 때(docs/47 15-24)

  /// 「창이 보인다」: 창 넓이의 `share`(기본 70%) 이상이 한 화면 보이는 영역 안에 있다.
  /// 손잡이만 걸친 창(`isOnScreen`)은 보인다고 하지 않는다
  public static func isMostlyVisible(_ frame: CGRect, screens: [CGRect], share: CGFloat = 0.7) -> Bool {
    let area = frame.width * frame.height
    guard area > 0 else { return false }
    return screens.contains { overlapArea(frame, $0) >= area * share }
  }

  /// 창을 그 화면 보이는 영역 안으로 당긴다. 창이 화면보다 크면 화면 크기로 줄인다
  public static func clamped(_ frame: CGRect, into visible: CGRect) -> CGRect {
    let w = min(frame.width, visible.width)
    let h = min(frame.height, visible.height)
    let x = min(max(frame.minX, visible.minX), visible.maxX - w)
    let y = min(max(frame.minY, visible.minY), visible.maxY - h)
    return CGRect(x: x, y: y, width: w, height: h)
  }

  /// 화면 구성이 바뀌었거나 앱을 켤 때 창을 둘 자리. `screens`는 보이는 영역들이고 첫째가 주 화면이다.
  /// 1. 이 구성에서 저장한 자리(`saved`)가 보이면 그 자리
  /// 2. 지금 자리(`current`)가 보이면 그대로
  /// 3. 저장한 자리·지금 자리 차례로, 어느 화면에 조금이라도 걸쳐 있으면 가장 많이 걸친 화면 안으로 당긴다
  /// 4. 어디에도 걸치지 않으면 주 화면 기본 자리(`defaultSize`, 오른쪽 아래)
  /// 화면이 하나도 없으면(잠자기 도중 등) 지금 자리 그대로
  public static func placed(
    saved: CGRect?, current: CGRect, screens: [CGRect], defaultSize: CGSize, margin: CGFloat,
    share: CGFloat = 0.7
  ) -> CGRect {
    guard let primary = screens.first else { return current }
    let candidates = [saved, current].compactMap { $0 }.filter { $0.width > 0 && $0.height > 0 }
    if let f = candidates.first(where: { isMostlyVisible($0, screens: screens, share: share) }) { return f }
    for f in candidates {
      if let i = screenIndex(of: f, screens: screens) { return clamped(f, into: screens[i]) }
    }
    return defaultFrame(visible: primary, size: defaultSize, margin: margin)
  }

  /// 연결된 화면 구성의 이름표(구성마다 창 자리를 따로 기억하는 열쇠). 화면 이름과 화면 전체 자리(보이는 영역 아님:
  /// Dock을 숨기거나 보여도 같은 구성)를 자리 차례로 늘어놓는다. 같은 모니터라도 배치·해상도를 바꾸면 다른 구성이다.
  /// 화면 번호(`CGDirectDisplayID`)는 다시 켜면 바뀔 수 있어 쓰지 않는다. 같은 이름 모니터 둘은 자리로 갈린다
  public static func layoutKey(_ screens: [(name: String, frame: CGRect)]) -> String {
    func n(_ v: CGFloat) -> String { String(Int(v.rounded())) }
    return
      screens
      .map { s in "\(s.name)@\(n(s.frame.minX)),\(n(s.frame.minY)),\(n(s.frame.width))x\(n(s.frame.height))" }
      .sorted()
      .joined(separator: "|")
  }

  private static func overlapArea(_ a: CGRect, _ b: CGRect) -> CGFloat {
    let r = a.intersection(b)
    return r.isNull ? 0 : r.width * r.height
  }

  /// 창이 가장 많이 걸친 화면의 번호(메뉴 「화면 옮기기」의 체크 표시). 어느 화면과도 겹치지 않으면 nil
  public static func screenIndex(of frame: CGRect, screens: [CGRect]) -> Int? {
    var best: (index: Int, area: CGFloat)?
    for (i, s) in screens.enumerated() {
      let r = s.intersection(frame)
      guard !r.isNull, r.width > 0, r.height > 0 else { continue }
      let area = r.width * r.height
      if best == nil || area > best!.area { best = (i, area) }
    }
    return best?.index
  }

  /// 「화면 옮기기」: 그 화면 보이는 영역의 기본 자리(오른쪽 아래)로, 지금 크기 그대로
  public static func moved(_ frame: CGRect, to visible: CGRect, margin: CGFloat) -> CGRect {
    defaultFrame(visible: visible, size: frame.size, margin: margin)
  }

  /// 단축키 표 자리(docs/47 15-25): 큐브 창 위(자리가 모자라면 아래), 가로는 창이 화면 오른쪽 반이면 오른쪽 끝을, 왼쪽 반이면
  /// 왼쪽 끝을 창에 맞춘다. 말풍선(`bubbleFrame`)은 창 옆 위 끝에 붙으니 위·아래에 두면 둘이 겹치지 않는다.
  /// 위·아래 모두 자리가 모자라면 말풍선처럼 옆에 둔다. 어느 쪽이든 보이는 영역 안으로 당긴다
  public static func keysFrame(cube: CGRect, panel: CGSize, visible: CGRect, gap: CGFloat = 8) -> CGRect {
    let above = visible.maxY - cube.maxY
    let below = cube.minY - visible.minY
    let need = panel.height + gap
    let y: CGFloat
    if above >= need {
      y = cube.maxY + gap
    } else if below >= need {
      y = cube.minY - gap - panel.height
    } else {
      return bubbleFrame(cube: cube, bubble: panel, visible: visible, gap: gap)
    }
    var x = cube.midX > visible.midX ? cube.maxX - panel.width : cube.minX
    x = min(max(x, visible.minX), visible.maxX - panel.width)
    return CGRect(x: x, y: y, width: panel.width, height: panel.height)
  }

  /// 「공식 보기」 말풍선 자리: 큐브 창 옆, 화면 안쪽 방향(창이 화면 오른쪽 반에 있으면 왼쪽에). 위 끝을 창 위 끝에 맞추고
  /// 보이는 영역 밖으로 나가지 않게 당긴다. 양옆 모두 자리가 모자라면 더 넓은 쪽에 두고 화면 안으로 당긴다(창과 겹칠 수 있다)
  public static func bubbleFrame(cube: CGRect, bubble: CGSize, visible: CGRect, gap: CGFloat = 8) -> CGRect {
    let leftRoom = cube.minX - visible.minX
    let rightRoom = visible.maxX - cube.maxX
    let need = bubble.width + gap
    let toLeft: Bool
    if cube.midX > visible.midX {
      toLeft = leftRoom >= need || leftRoom >= rightRoom
    } else {
      toLeft = !(rightRoom >= need || rightRoom >= leftRoom)
    }
    var x = toLeft ? cube.minX - gap - bubble.width : cube.maxX + gap
    var y = cube.maxY - bubble.height
    x = min(max(x, visible.minX), visible.maxX - bubble.width)
    y = min(max(y, visible.minY), visible.maxY - bubble.height)
    return CGRect(x: x, y: y, width: bubble.width, height: bubble.height)
  }
}
