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

  /// 창이 어느 화면에든 붙잡을 만큼 걸쳐 있는가. 한 화면과 겹친 부분이 가로·세로 모두
  /// `grab`(창이 그보다 작으면 창 크기) 이상이어야 한다. 모니터를 떼어 낸 뒤 저장된 자리가
  /// 없어진 화면에 남아 창을 찾지 못하는 일을 막는다.
  public static func isOnScreen(_ frame: CGRect, screens: [CGRect], grab: CGFloat = 24) -> Bool {
    let needW = min(grab, frame.width)
    let needH = min(grab, frame.height)
    return screens.contains { s in
      let i = s.intersection(frame)
      return !i.isNull && i.width >= needW && i.height >= needH
    }
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
