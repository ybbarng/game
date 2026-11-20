import Foundation

/// 스크롤 보기 안 내용 폭(docs/52 5-8). 막대가 내용 폭을 차지하는 꼴(macOS 「스크롤 막대 보기: 항상」이나 마우스를 이은 맥,
/// AppKit `.legacy`)에서는 내용이 보이는 높이보다 길면 세로 막대가 생기고 그만큼 내용 폭이 좁아진다. 겹치는 막대(`.overlay`)는
/// 폭을 차지하지 않는다(`scroller` 0). 스크롤 보기 바깥 폭으로 줄을 놓으면 오른쪽 끝(기록 창 「다시 보기」)이 막대 밑에 가려
/// 잘린다(2026-11-20)
public enum ScrollContent {
  /// 바깥 폭 `frame`, 보이는 높이 `visibleHeight`, 막대 폭 `scroller`일 때 내용 폭. `contentHeight`는 그 폭에서 내용 높이
  /// (좁을수록 높아지기만 하므로 바깥 폭에서 넘치지 않으면 막대가 생기지 않는다. AppKit `autohidesScrollers`와 같은 판단)
  public static func width(
    frame: Double, visibleHeight: Double, scroller: Double, contentHeight: (Double) -> Double
  ) -> Double {
    guard scroller > 0, contentHeight(frame) > visibleHeight else { return frame }
    return max(0, frame - scroller)
  }
}
