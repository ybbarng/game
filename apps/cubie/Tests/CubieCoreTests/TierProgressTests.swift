import Foundation
import Testing

@testable import CubieCore

/// 티어를 정한 5판 짚기·다음 판 목표 글·이력 글 읽기(사이트 `progress-view.ts`와 같은 글, 계산 값은 코어가 공통 자료로 맞춘다)
struct TierProgressTests {
  /// 사용자 Cubie 3×3 11판(새것이 앞, 번호 11…1)
  private var user: [[String: Any]] {
    [138_650.0, 139_800, 123_810, 186_830, 249_710, 290_000, 330_000, 370_000, 415_000, 460_000, 508_450]
      .enumerated().map { i, ms in ["no": 11 - i, "at": 1000 * (11 - i), "n": 3, "ms": ms, "penalty": 0, "moves": 1] }
  }

  @Test func marksTheFiveThatSetTheTier() throws {
    // 코어 값: 7~11번, 그 안의 자리 2(9번)가 가장 빠름, 4(7번)가 가장 느림
    let d = TierProgress.BestFive(ms: 155_090, kept: false, at: 0, fast: 2, slow: 4)
    let v = try #require(TierProgress.view(d, records: user, bestFive: []))
    #expect(TierProgress.rangeText(v) == "7~11번")
    #expect(v.marks == [11: .inside, 10: .inside, 9: .fast, 8: .inside, 7: .slow])
    #expect(RecordsSheet.best5Text(v) == "2:35.09 · 7~11번")
    #expect(RecordsSheet.best5Text(nil) == "-")
    #expect(RecordsSheet.timeText("2:03.81", mark: .fast) == "(2:03.81)")
    #expect(RecordsSheet.timeText("2:18.65", mark: .inside) == "2:18.65")
    #expect(RecordsSheet.timeText("2:18.65", mark: nil) == "2:18.65")
  }

  @Test func keptFiveUsesItsOwnNumbers() throws {
    let kept: [[String: Any]] = (1...5).reversed().map { ["no": $0, "ms": 100_000.0] }
    let d = TierProgress.BestFive(ms: 100_000, kept: true, at: 0, fast: 0, slow: 4)
    let v = try #require(TierProgress.view(d, records: user, bestFive: kept))
    #expect(TierProgress.rangeText(v) == "1~5번")
    #expect(v.marks[5] == .fast && v.marks[1] == .slow)
  }

  @Test func nextSolveTextLikeTheSite() {
    #expect(
      TierProgress.nextSolveText(.init(tier: 1, division: 3, cutMs: 150_000, goal: .within(171_560)))
        == "다음 판 2:51.56 안이면 브론즈 I")
    #expect(TierProgress.nextSolveText(.init(tier: 9, division: nil, cutMs: 6_500, goal: .any)) == "다음 판을 맞추면 챌린저")
    #expect(
      TierProgress.nextSolveText(.init(tier: 1, division: 3, cutMs: 150_000, goal: .out(5_090)))
        == "다음 판 하나로는 브론즈 I에 못 닿아요. 최고 5판 평균을 5.09초 줄여야 해요.")
  }

  @Test func parsesCoreHistoryText() {
    let text = "p\t1\t1000\t-\np\t5\t5000\t415000\nc\t5\t5000\t-1\t-1\t0\t3\t415000\nc\t11\t11000\t1\t1\t1\t2\t155090\n"
    let h = TierProgress.parseHistory(text)
    #expect(h.points == [.init(no: 1, at: 1000, ms: nil), .init(no: 5, at: 5000, ms: 415_000)])
    #expect(h.changes.count == 2)
    #expect(h.changes[0].from == nil && h.changes[0].to == (0, 3))
    #expect(h.changes[1].from! == (1, 1) && h.changes[1].to == (1, 2) && h.changes[1].ms == 155_090)
  }
}
