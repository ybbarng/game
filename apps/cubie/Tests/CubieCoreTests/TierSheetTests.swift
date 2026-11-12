import Foundation
import Testing

@testable import CubieCore

/// 네이티브 티어표 창(docs/52 5-8)의 글과 표 읽기(사이트 `TierTable.tsx` `cutText`·WCA 칸과 같은 규칙)
struct TierSheetTests {
  @Test func cutTextLikeTheSite() {
    // 사이트 cutText: 1분 아래 「9.3초」, 1시간 아래 「2:30」, 그 위 「1:10:00」, 끝없음 「다 맞춤」
    #expect(TierSheet.cutText(9.3) == "9.3초")
    #expect(TierSheet.cutText(14) == "14초")
    #expect(TierSheet.cutText(60) == "1:00")
    #expect(TierSheet.cutText(150) == "2:30")
    #expect(TierSheet.cutText(4200) == "1:10:00")
    #expect(TierSheet.cutText(.infinity) == "다 맞춤")
    #expect(TierSheet.singleText(6.5) == "6.5초 이하")
    #expect(TierSheet.singleText(.infinity) == "다 맞춤")
    #expect(TierSheet.grouped(284_562) == "284,562")
    #expect(TierSheet.grouped(295) == "295")
    #expect(TierSheet.grouped(1_000) == "1,000")
  }

  /// 코어 `cubie_tier_table` 글 꼴(머리 줄 + 티어 열 줄)
  @Test func parsesCoreTableText() throws {
    var lines = ["284562\t2026-11-09\tThis information … https://x.org/r as of …\thttps://x.org/r"]
    lines.append("inf,900,630,435\t\t")
    for i in 1..<8 { lines.append("\(100 - i),\(90 - i),\(80 - i),\(70 - i)\t\(1000 * i)\t\(Double(i) * 1.5)") }
    lines.append("7.5\t1209\t0.42")
    lines.append("6.5\t295\t0.1")
    let t = try #require(TierSheet.parse(n: 3, text: lines.joined(separator: "\n") + "\n"))
    #expect(t.people == 284_562 && t.date == "2026-11-09" && t.url == "https://x.org/r")
    #expect(t.rows.count == 10)
    #expect(t.rows[0].cuts.first == .infinity && t.rows[0].people == nil)
    #expect(TierSheet.wcaText(t.rows[0]) == "대회 밖")
    #expect(TierSheet.wcaText(t.rows[8]) == "상위 0.42% · 1,209명")
    #expect(TierSheet.wcaText(t.rows[9]) == "상위 0.1% · 295명")
    #expect(TierSheet.parse(n: 8, text: "") == nil)
    #expect(TierSheet.tableNote(n: 3, people: 284_562).hasSuffix("(3×3 평균 기록이 있는 약 284,562명 가운데)."))
  }

  @Test func readsSoloRecordsNotMiniRecords() {
    let solo = (1...5).map { record(Double(10_000 + $0 * 100), at: $0) }
    let five = (1...5).map { record(Double(9_000 + $0), at: $0) }
    let store = MemoryStore([
      TierSheet.recordsKey: json(["solo-3": solo, "blind-3": [record(1)]]),
      TierSheet.bestFiveKey: json(["3": five]),
      MiniBook.key: json(["version": 1, "records": ["3": [record(1)]]]),
    ])
    let got = TierSheet.soloRecords(store: store, n: 3)
    #expect(got.records.count == 5 && got.records.first?.ms == 10_100)
    #expect(got.bestFive.count == 5)
    #expect(TierSheet.soloRecords(store: store, n: 4).records.isEmpty)
    // 최고 5판은 딱 5판일 때만
    let broken = MemoryStore([TierSheet.bestFiveKey: json(["3": Array(five.prefix(4))])])
    #expect(TierSheet.soloRecords(store: broken, n: 3).bestFive.isEmpty)
  }

  private func json(_ v: Any) -> String {
    String(data: try! JSONSerialization.data(withJSONObject: v), encoding: .utf8)!
  }
}
