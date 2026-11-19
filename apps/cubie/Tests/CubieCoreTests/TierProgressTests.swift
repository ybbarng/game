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
    // 1분 넘게 줄여야 하면 분:초 꼴 뒤에 「초」를 붙이지 않는다(「20:00.00초」는 20초처럼 읽힌다, 사이트 같은 예)
    #expect(
      TierProgress.nextSolveText(.init(tier: 1, division: 0, cutMs: 4_800_000, goal: .out(1_200_000)))
        == "다음 판 하나로는 브론즈 IV에 못 닿아요. 최고 5판 평균을 20:00.00 줄여야 해요.")
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
    // 코어 값: 브론즈 III(1, 1) 아래, 브론즈 II(1, 2) 3:10 → 브론즈 I(1, 3) 2:30, 2:35.09
    let b = TierProgress.Band(
      down: (1, 1), tier: 1, division: 2, lowMs: 190_000, up: (1, 3), highMs: 150_000, ratio: 0.87275)
    let v = TierProgress.bandView(b, ms: 155_090)
    #expect(
      [v.downName, v.hereName, v.upName, v.lowTime, v.highTime, v.value]
        == ["브론즈 III", "브론즈 II", "브론즈 I", "3:10.00", "2:30.00", "2:35.09"])
    #expect(v.label == "브론즈 II 3:10.00 → 브론즈 I 2:30.00 · 최고 5판 평균 2:35.09")
    #expect(v.ratio == 0.87275)
  }

  @Test func topHasNoUpCellAndZeroSeconds() {
    let b = TierProgress.Band(down: (8, nil), tier: 9, division: nil, lowMs: 6_500, up: nil, highMs: 0, ratio: 0.2)
    let v = TierProgress.bandView(b, ms: 5_200)
    #expect([v.downName, v.hereName, v.upName, v.lowTime, v.highTime] == ["그랜드마스터", "챌린저", nil, "6.50", "0.00"])
    #expect(v.label == "챌린저 6.50 → 0.00 · 최고 5판 평균 5.20")
  }

  @Test func lowestHasNoDownCellAndOpenLeft() {
    let b = TierProgress.Band(down: nil, tier: 0, division: 0, lowMs: nil, up: (0, 1), highMs: 900_000, ratio: 0.5)
    let v = TierProgress.bandView(b, ms: 1_350_000)
    #expect([v.downName, v.hereName, v.upName, v.lowTime, v.highTime] == [nil, "아이언 IV", "아이언 III", "다 맞춤", "15:00.00"])
  }

  // 좌표 셈: 사이트 `progress-view.test.ts` 「구간 안 자리 막대 좌표(세 칸 사다리)」와 같은 예·같은 값
  private func widths(
    width: Double = 320, down: Double? = 60, here: Double = 80, up: Double? = 70, low: Double = 40, high: Double = 36,
    value: Double = 50
  ) -> TierProgress.BandWidths {
    .init(width: width, down: down, here: here, up: up, low: low, high: high, value: value)
  }

  @Test func layoutSideCellsFitTheLongerSideNameAndTextsCenterUnderCellsAndEdges() {
    #expect(
      TierProgress.bandLayout(ratio: 0.5, widths())
        == .init(
          side: 70, lowX: 70, highX: 250, markX: 160, downX: 5, hereX: 120, upX: 250, downShort: false, upShort: false,
          lowTimeX: 50, highTimeX: 232, valueX: 135))
  }

  @Test func layoutTopWidensTheCurrentCellToTheRightEnd() {
    #expect(
      TierProgress.bandLayout(ratio: 0.2, widths(here: 60, up: nil, low: 30, high: 28, value: 40))
        == .init(
          side: 60, lowX: 60, highX: 320, markX: 112, downX: 0, hereX: 160, upX: nil, downShort: false, upShort: false,
          lowTimeX: 45, highTimeX: 292, valueX: 92))
  }

  @Test func layoutLowestStartsTheCurrentCellAtTheLeftEnd() {
    #expect(
      TierProgress.bandLayout(ratio: 0.75, widths(down: nil, here: 70, low: 44, high: 52, value: 50))
        == .init(
          side: 70, lowX: 0, highX: 250, markX: 187.5, downX: nil, hereX: 90, upX: 250, downShort: false,
          upShort: false, lowTimeX: 0, highTimeX: 224, valueX: 162.5))
  }

  @Test func layoutNarrowBarCapsSideCellsAndShowsOnlyEmblems() {
    let l = TierProgress.bandLayout(ratio: 0.5, widths(width: 200, down: 70, up: 60))
    #expect(l.side == 50 && l.downShort && l.upShort && l.downX == 18 && l.upX == 168)
  }

  @Test func layoutSideCellIsAtLeast24() {
    #expect(TierProgress.bandLayout(ratio: 0.5, widths(down: 10, up: 10)).side == 24)
  }

  @Test func layoutPushesValueInsideAtTheRightEnd() {
    let l = TierProgress.bandLayout(ratio: 1, widths(up: nil, value: 80))
    #expect(l.markX == 320 && l.valueX == 240)
  }

  @Test func layoutClampsRatioToTheEdges() {
    #expect(TierProgress.bandLayout(ratio: 1.5, widths()).markX == 250)
    #expect(TierProgress.bandLayout(ratio: -1, widths()).markX == 70)
  }

  @Test func alphaStepsMatchTheSite() {
    // 사이트 `BAND_ALPHA`: 지나온 부분 > 남은 부분 > 옆 칸
    let a = TierProgress.bandAlpha
    #expect(a.done == 1 && a.rest == 0.4 && a.side == 0.16)
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
      TierProgress.Band(down: (3, 0), tier: 3, division: 1, lowMs: 52_000, up: (3, 2), highMs: 46_000, ratio: (52_000 - ms) / 6_000)
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
