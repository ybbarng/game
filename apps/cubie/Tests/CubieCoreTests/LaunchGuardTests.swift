import Foundation
import Testing

@testable import CubieCore

/// 지난번에 켜다 꺼졌으면 안전하게 켜기(docs/52 5-24)
struct LaunchGuardTests {
  let t0 = Date(timeIntervalSince1970: 1_800_000_000)

  private func marker(_ version: String, runs: Int) -> LaunchGuard.Marker {
    LaunchGuard.Marker(version: version, at: t0, safeRuns: runs)
  }

  @Test func 표시가_없으면_보통으로_켜고_안전_횟수_0인_표시를_쓴다() {
    let r = LaunchGuard.begin(left: nil, version: "0.12.5", now: t0)
    #expect(r.mode == .normal)
    #expect(r.write == marker("0.12.5", runs: 0))
  }

  @Test func 보통으로_켜다_꺼졌으면_안전하게_켜고_새_판_창을_띄운다() {
    let r = LaunchGuard.begin(left: marker("0.12.5", runs: 0), version: "0.12.5", now: t0 + 60)
    #expect(r.mode == .safe)
    #expect(r.mode.skipsSaved == true)
    #expect(r.mode.promptsUpdate == true)
    #expect(r.write == LaunchGuard.Marker(version: "0.12.5", at: t0 + 60, safeRuns: 1))
  }

  @Test func 안전하게_켜다_한_번_꺼지면_한_번_더_안전하게_켠다() {
    let r = LaunchGuard.begin(left: marker("0.12.5", runs: 1), version: "0.12.5", now: t0)
    #expect(r.mode == .safe)
    #expect(r.write.safeRuns == 2)
  }

  @Test func 안전하게_켜도_두_번_연달아_꺼지면_새_판_창을_더_띄우지_않고_창_자리는_계속_건너뛴다() {
    let r = LaunchGuard.begin(left: marker("0.12.5", runs: 2), version: "0.12.5", now: t0)
    #expect(r.mode == .safeQuiet)
    #expect(r.mode.skipsSaved == true)
    #expect(r.mode.promptsUpdate == false)
    #expect(r.write.safeRuns == 3)
    #expect(LaunchGuard.begin(left: r.write, version: "0.12.5", now: t0).mode == .safeQuiet)
  }

  @Test func 판이_바뀌면_안전하게_켜기를_처음부터_센다() {
    let r = LaunchGuard.begin(left: marker("0.12.5", runs: 3), version: "0.12.6", now: t0)
    #expect(r.mode == .safe)
    #expect(r.write == marker("0.12.6", runs: 1))
  }

  @Test func 저장값으로_되읽으면_같은_표시다() {
    let m = marker("0.12.5", runs: 2)
    #expect(LaunchGuard.Marker(stored: m.dictionary) == m)
  }

  @Test func 저장값이_없으면_표시가_없고_모양이_틀려도_표시가_있는_것으로_본다() {
    #expect(LaunchGuard.Marker(stored: nil) == nil)
    let broken = LaunchGuard.Marker(stored: "망가진 값")
    #expect(broken == LaunchGuard.Marker(version: "?", at: Date(timeIntervalSince1970: 0), safeRuns: 0))
    #expect(LaunchGuard.begin(left: broken, version: "0.12.5", now: t0).mode == .safe)
  }
}
