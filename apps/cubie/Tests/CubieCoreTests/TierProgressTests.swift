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

/// 구간 안 자리 막대 글(사이트 `progress-view.test.ts` 「구간 안 자리 막대 글」과 같은 예. 값은 코어가 공통 자료 `tier-band.json`으로 맞춘다)
struct TierBandTests {
  @Test func userExampleTextLikeTheSite() {
    // 코어 값: 브론즈 II(1, 2) 3:10 → 브론즈 I(1, 3) 2:30, 2:35.09
    let b = TierProgress.Band(tier: 1, division: 2, lowMs: 190_000, up: (1, 3), highMs: 150_000, ratio: 0.87275)
    let v = TierProgress.bandView(b, ms: 155_090)
    #expect([v.leftName, v.leftTime, v.rightName, v.rightTime, v.value] == ["브론즈 II", "3:10.00", "브론즈 I", "2:30.00", "2:35.09"])
    #expect(v.label == "브론즈 II 3:10.00 → 브론즈 I 2:30.00 · 최고 5판 평균 2:35.09")
    #expect(v.ratio == 0.87275)
  }

  @Test func topIsZeroSecondsWithoutName() {
    let b = TierProgress.Band(tier: 9, division: nil, lowMs: 6_500, up: nil, highMs: 0, ratio: 0.2)
    let v = TierProgress.bandView(b, ms: 5_200)
    #expect(v.rightName == nil && v.rightTime == "0.00" && v.leftName == "챌린저" && v.leftTime == "6.50")
    #expect(v.label == "챌린저 6.50 → 0.00 · 최고 5판 평균 5.20")
  }

  @Test func lowestHasOpenLeft() {
    let b = TierProgress.Band(tier: 0, division: 0, lowMs: nil, up: (0, 1), highMs: 900_000, ratio: 0.5)
    let v = TierProgress.bandView(b, ms: 1_350_000)
    #expect([v.leftName, v.leftTime, v.rightName, v.rightTime] == ["아이언 IV", "다 맞춤", "아이언 III", "15:00.00"])
  }

  // 좌표 셈: 사이트 `progress-view.test.ts` 「구간 안 자리 막대 좌표」와 같은 예·같은 값
  private func layout(_ r: Double, _ w: Double, _ l: Double, _ rt: Double, _ v: Double) -> TierProgress.BandLayout {
    TierProgress.bandLayout(ratio: r, width: w, leftWidth: l, rightWidth: rt, valueWidth: v)
  }

  @Test func layoutTicksSitInsideByHalfTheLongerBoundaryText() {
    #expect(layout(0.5, 300, 120, 100, 50) == .init(tail: 60, lowX: 60, highX: 240, markX: 150, leftX: 0, rightX: 190, valueX: 125))
  }

  @Test func layoutTopKeepsEqualTailsAndCentersShortRightText() {
    #expect(layout(0, 300, 80, 28, 40) == .init(tail: 40, lowX: 40, highX: 260, markX: 40, leftX: 0, rightX: 246, valueX: 20))
  }

  @Test func layoutPushesValueInsideAtTheRightEnd() {
    let l = layout(1, 300, 60, 60, 80)
    #expect(l.markX == 270 && l.valueX == 220)
  }

  @Test func layoutTailIsAtLeast12AndAtMostAQuarter() {
    #expect(layout(0.5, 300, 10, 10, 30).tail == 12)
    let l = layout(0.5, 200, 140, 140, 30)
    #expect(l.tail == 50 && l.leftX == 0 && l.rightX == 60)
  }

  @Test func layoutClampsRatioToTheTicks() {
    #expect(layout(1.5, 300, 60, 60, 40).markX == 270)
    #expect(layout(-1, 300, 60, 60, 40).markX == 30)
  }

  /// 시험용 막대 셈: 받은 5판 평균을 그대로 담는다
  struct BandFake: TierMath, TierBandMath {
    let inner = FakeMath()
    func ao5(_ five: [Timeable]) -> Double? { inner.ao5(five) }
    func bestAo5(_ records: [Timeable]) -> (ms: Double, at: Int)? { inner.bestAo5(records) }
    func myTier(n: Int, records: [Timeable], bestFive: [Timeable]) -> TierInfo? {
      inner.myTier(n: n, records: records, bestFive: bestFive)
    }
    func band(n: Int, ms: Double) -> TierProgress.Band? {
      TierProgress.Band(tier: 3, division: 1, lowMs: 52_000, up: (3, 2), highMs: 46_000, ratio: (52_000 - ms) / 6_000)
    }
  }

  @Test func bookGivesBandOfTheTierAverageOnlyAfterFiveSolves() throws {
    let book = MiniBook(store: MemoryStore(), math: BandFake())
    for (i, ms) in [50_000.0, 49_000, 48_000, 47_000].enumerated() { _ = book.add(record(ms, at: i + 1)) }
    #expect(book.band(3) == nil)
    _ = book.add(record(51_000, at: 5))
    let got = try #require(book.band(3))
    // 가운데 셋 평균 49.00초
    #expect(got.ms == 49_000)
    #expect(got.band.ratio == 0.5)
    // 막대 셈을 따르지 않는 계산이면 없다
    #expect(MiniBook(store: MemoryStore(), math: FakeMath()).band(3) == nil)
  }
}
