import AppKit
import Foundation
import Testing

@testable import CubieCore

/// 기록 창 위쪽 티어 칸의 글(사이트 `MiniTiers`): 시간이 길어도(6×6·7×7 아이언, 5판 평균 100분) 칸 안에 다 보인다.
/// 2026-11-19 앱 칸이 한 줄 16pt 자리에 「6×6 100:00.00」을 넣어 시간이 잘리고 「6×6」만 보였다(사이트는 줄을 바꿔 다 보였다)
struct TierCellTextTests {
  /// 앱 글 칸의 한 줄 폭(`NUI.width`와 같은 셈: 숫자 고른 폭 시스템 글꼴 12pt, 글 칸 좌우 여백 2pt씩 포함)
  private func appWidth(_ s: String, weight: NSFont.Weight = .regular) -> Double {
    let f = NSFont.monospacedDigitSystemFont(ofSize: 12, weight: weight)
    return Double(ceil(NSAttributedString(string: s, attributes: [.font: f]).size().width) + 5)
  }

  private var textWidth: Double {
    RecordsSheet.tierCellTextWidth(cell: RecordsSheet.tierCellWidth(window: RecordsSheet.windowWidth))
  }

  @Test func longTimeWrapsBetweenSizeAndTimeLikeTheSite() {
    let top = RecordsSheet.tierCellTop(size: 6, ms: 6_000_000)
    #expect(top == "6×6 100:00.00")
    let lines = RecordsSheet.wrapLines(top, width: textWidth) { appWidth($0) }
    #expect(lines == ["6×6", "100:00.00"])
    // 위 글 두 줄 + 티어 이름 한 줄
    #expect(RecordsSheet.tierCellHeight(lines: lines.count + 1) == 56)
  }

  @Test func shortTimeStaysOnOneLine() {
    let lines = RecordsSheet.wrapLines(RecordsSheet.tierCellTop(size: 3, ms: 23_450), width: textWidth) { appWidth($0) }
    #expect(lines == ["3×3 23.45"])
    #expect(RecordsSheet.tierCellHeight(lines: lines.count + 1) == 40)
  }

  @Test func everyLineFitsTheCellForLongTimes() {
    // 크기마다 1분·10분·100분대 시간과 가장 긴 티어 이름
    for n in RecordsSheet.sizes {
      for ms in [59_990.0, 754_320, 6_000_000, 8_000_000] {
        let lines = RecordsSheet.wrapLines(RecordsSheet.tierCellTop(size: n, ms: ms), width: textWidth) { appWidth($0) }
        #expect(lines.joined(separator: " ") == RecordsSheet.tierCellTop(size: n, ms: ms))
        for l in lines { #expect(appWidth(l) <= textWidth, "\(l) 폭 \(appWidth(l)) > \(textWidth)") }
      }
    }
    for t in 0..<10 {
      let name = TierSheet.labels[t] + (t < 8 ? " IV" : "")
      #expect(appWidth(name, weight: .semibold) <= textWidth, "\(name)")
    }
  }

  @Test func narrowWindowBreaksLongTimeAfterColon() {
    // 창을 휴대폰 너비(320)만큼 줄이면 「100:00.00」도 칸보다 길다(사이트 320px 시험과 같은 장면)
    let w = RecordsSheet.tierCellTextWidth(cell: RecordsSheet.tierCellWidth(window: 320))
    let lines = RecordsSheet.wrapLines(RecordsSheet.tierCellTop(size: 6, ms: 6_000_000), width: w) { appWidth($0) }
    #expect(lines == ["6×6", "100:", "00.00"])
    for l in lines { #expect(appWidth(l) <= w, "\(l)") }
  }

  @Test func wrapLinesIsGreedyBetweenWords() {
    let count = { (s: String) in Double(s.count) }
    #expect(RecordsSheet.wrapLines("ab cd ef", width: 5, measure: count) == ["ab cd", "ef"])
    #expect(RecordsSheet.wrapLines("ab cd ef", width: 8, measure: count) == ["ab cd ef"])
    // 낱말 하나가 폭보다 길면 그 낱말만 한 줄
    #expect(RecordsSheet.wrapLines("abcdefg hi", width: 4, measure: count) == ["abcdefg", "hi"])
    // 시간이 폭보다 길면 「:」 뒤에서 나눈다(사이트 `<wbr>`)
    #expect(RecordsSheet.wrapLines("6×6 100:00.00", width: 6, measure: count) == ["6×6", "100:", "00.00"])
    #expect(RecordsSheet.wrapLines("7×7 1:10:00.00", width: 7, measure: count) == ["7×7", "1:10:", "00.00"])
    #expect(RecordsSheet.colonPieces("23.45") == ["23.45"])
    // 끝 빈칸(티어가 없을 때 「6×6 」)은 줄을 만들지 않는다
    #expect(RecordsSheet.wrapLines("6×6 ", width: 2, measure: count) == ["6×6"])
  }
}
