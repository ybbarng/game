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

  /// 2026-11-18 사용자 「내 기록에 맞게 티어가 보이지 않는 것 같은데」: 기록 창·메뉴 프로필 칸은 Cubie 기록으로 3×3 브론즈 II인데
  /// 티어표 창만 사이트 혼자 맞추기 기록(앱에는 없음)을 읽어 「아직 없음」이었다. 앱의 티어 표시는 모두 Cubie 기록 하나로
  @MainActor
  @Test func tiersWindowUsesCubieRecordsLikeRecordsWindow() {
    let store = MemoryStore()
    let book = MiniBook(store: store, math: FakeMath())
    for ms in [100_000.0, 120_000, 110_000, 130_000, 105_000] { book.add(record(ms)) }
    #expect(book.tier(3) != nil)
    #expect(TierSheet.mine(store: store, math: FakeMath(), n: 3) == book.tier(3))
    // 사이트 혼자 맞추기 기록(사이트 창에서 옮겨 온 옛 글)이 남아 있어도 앱 티어는 Cubie 기록으로
    store.set(json(["solo-4": (1...5).map { record(Double(1_000 * $0), n: 4, at: $0) }]), for: "cube.records.v1")
    #expect(TierSheet.mine(store: store, math: FakeMath(), n: 4) == nil)
  }

  private func json(_ v: Any) -> String {
    String(data: try! JSONSerialization.data(withJSONObject: v), encoding: .utf8)!
  }
}
