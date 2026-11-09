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
}
