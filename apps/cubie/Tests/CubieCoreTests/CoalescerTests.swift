import Testing

@testable import CubieCore

/// 끄는 동안 몰려온 설정 바뀜은 다음 차례에 한 번만 다시 읽는다
@MainActor
struct CoalescerTests {
  @MainActor
  final class Turns {
    var queued: [@MainActor () -> Void] = []
    func next() {
      let q = queued
      queued = []
      q.forEach { $0() }
    }
  }

  @Test func thirtyRequestsInOneTurnRunOnce() {
    let turns = Turns()
    var runs = 0
    let c = Coalescer(schedule: { turns.queued.append($0) }) { runs += 1 }
    for _ in 0..<30 { c.request() }
    #expect(runs == 0)
    turns.next()
    #expect(runs == 1)
  }

  @Test func requestAfterRunSchedulesAgain() {
    let turns = Turns()
    var runs = 0
    let c = Coalescer(schedule: { turns.queued.append($0) }) { runs += 1 }
    c.request()
    turns.next()
    c.request()
    turns.next()
    #expect(runs == 2)
  }
}
