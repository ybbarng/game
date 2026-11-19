import Foundation

/// 네이티브 보통 창(기록 창·티어표·설정 창, docs/52 5-8)의 처음 크기와 가장 작은 크기(내용 칸, pt).
/// 창은 크기를 바꿀 수 있는데, 가장 작은 크기 아래로 줄이면 칸 글이 잘리거나 겹친다. 창을 만드는 `NativeSheetWindow`는
/// 이 꼴만 받으므로 가장 작은 크기 없이 창을 만들 수 없다. 값은 화면 밖 스크린샷(`CUBIE_WINDOW_SHOT`, `native-*-min`)으로
/// 가장 작은 크기에서 글이 잘리지 않는지 보고 정했다(docs/52 5-8 「창 최소 크기」)
public struct SheetSize: Equatable, Sendable {
  public let width: Double
  public let height: Double
  public let minWidth: Double
  public let minHeight: Double

  /// 기록 창: 사이트 기록 창(`/cube/mini?view=records`)과 같은 380×600. 가장 좁게는 320(줄 칸·요약·구간 막대가 들어가는 폭),
  /// 높이는 처음 높이 600(320 너비에서는 티어 칸이 세 줄로 높아져, 그보다 낮으면 다시 보기를 연 채로 큐브가 알아보기 어렵게
  /// 작아졌다)
  public static let records = SheetSize(width: RecordsSheet.windowWidth, height: 600, minWidth: 320, minHeight: 600)
  /// 티어표: 진열 큰 칸(엠블럼 280 + 글)과 열 칸 사다리, 기준표 열 칸이 한 줄로 드는 처음 너비 760을 가장 좁은 너비로.
  /// 높이는 굴려 보므로 머리·크기 단추·진열 큰 칸 위쪽이 보이는 400
  public static let tiers = SheetSize(width: 760, height: 820, minWidth: 760, minHeight: 400)
  /// 설정 창: 키보드 그림(열다섯 칸)·배치 단추 줄·색 단추 줄이 한 줄로 드는 처음 너비 760을 가장 좁은 너비로. 높이는 굴려 본다
  public static let settings = SheetSize(width: 760, height: 720, minWidth: 760, minHeight: 400)
}
