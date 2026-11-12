import Foundation
import Testing

@testable import CubieCore

/// 네이티브 기록 창(docs/52 5-8)의 줄 글과 다시 보기 재생기(사이트 `ReplayPlayer`·`RecordsPanel`과 같은 규칙)
@MainActor
struct RecordsSheetTests {
  @Test func rowShowsWhatTheSiteShows() {
    let seoul = TimeZone(identifier: "Asia/Seoul")!
    // 2026-11-12 10:05(서울)
    let at = 1_762_909_500_000.0
    var r = record(23_456, at: Int(at), hints: 2)
    r["no"] = 7
    r["keyOrigin"] = "synthetic"
    r["inputs"] = ["key", "swipe"]
    r["scramble"] = "R U"
    let row = RecordsSheet.row(r, timeZone: seoul)
    #expect(row.no == 7)
    #expect(row.when == "11/12 10:05")
    #expect(row.time == "23.45")
    #expect(row.synthetic && row.swipe && row.hints == 2 && row.canReplay)
    #expect(RecordsSheet.moves(row.moves) == "10수")

    // DNF·다시 보기 글 없음
    let dnf = RecordsSheet.row(record(nil, replay: nil), timeZone: seoul)
    #expect(dnf.time == "DNF")
    #expect(!dnf.canReplay && !dnf.synthetic && !dnf.swipe && dnf.hints == 0)
    // 섞기 글이 없으면 다시 볼 수 없다
    #expect(!RecordsSheet.canReplay(record(1000)))
  }

  @Test func summaryTextAndMirrorFit() {
    #expect(RecordsSheet.summaryText(.nan) == "-")
    #expect(RecordsSheet.summaryText(.infinity) == "DNF")
    #expect(RecordsSheet.summaryText(61_234) == "1:01.23")
    #expect(RecordsSheet.replayHead(no: 12, ms: 24_660) == "12번 · 24.66")
    // 짧은 변이 크기 × 10 이상일 때만 거울
    #expect(RecordsSheet.replayMirror(wanted: true, n: 7, short: 70))
    #expect(!RecordsSheet.replayMirror(wanted: true, n: 7, short: 69))
    #expect(!RecordsSheet.replayMirror(wanted: false, n: 2, short: 300))
  }

  @Test func playerStepsPausesAndRestarts() {
    let clock = ManualClock()
    var got: [(String, Int)] = []
    var statuses: [ReplayPlayer.Status] = []
    var resets = 0
    let steps = [
      ReplayPlayer.Step(at: 0, moves: "R"), ReplayPlayer.Step(at: 300, moves: "U"),
      ReplayPlayer.Step(at: 1000, moves: "R'"),
    ]
    let p = ReplayPlayer(
      clock: clock, steps: steps,
      hooks: .init(
        onStep: { s, i in got.append((s.moves, i)) }, onReset: { resets += 1 }, onStatus: { statuses.append($0) }))
    p.play()
    clock.advance(0)
    #expect(got.map(\.0) == ["R"])
    clock.advance(200)
    p.pause()
    // 멈춘 동안은 내보내지 않는다
    clock.advance(5000)
    #expect(got.count == 1 && p.status == .paused)
    p.toggle()
    clock.advance(99)
    #expect(got.count == 1)
    clock.advance(1)
    #expect(got.map(\.0) == ["R", "U"])
    clock.advance(700 + 600)
    #expect(got.count == 3 && p.status == .done)
    #expect(statuses == [.playing, .paused, .playing, .done])
    // 끝난 뒤 이어 보기는 처음부터
    p.play()
    #expect(resets == 1)
    clock.advance(0)
    #expect(got.last?.0 == "R" && got.last?.1 == 0)
    p.stop()
    clock.advance(10_000)
    #expect(got.count == 4)
  }

  @Test func moveMsFollowsTheGap() {
    let steps = [ReplayPlayer.Step(at: 0, moves: "R"), ReplayPlayer.Step(at: 50, moves: "U"), ReplayPlayer.Step(at: 150, moves: "F")]
    // 다음 걸음까지 50ms → 45ms, 100ms → 90ms(설정 90), 마지막은 설정 그대로, 40ms 아래로 줄이지 않는다
    #expect(ReplayPlayer.moveMs(steps, 0, base: 90) == 45)
    #expect(ReplayPlayer.moveMs(steps, 1, base: 90) == 90)
    #expect(ReplayPlayer.moveMs(steps, 2, base: 90) == 90)
    #expect(ReplayPlayer.moveMs([ReplayPlayer.Step(at: 0, moves: "R"), ReplayPlayer.Step(at: 10, moves: "U")], 0, base: 90) == 40)
  }
}
