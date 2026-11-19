import Foundation
import Testing

@testable import CubieCore

/// 흔들기 끊김(docs/52 5-16): 흔드는 길은 미리 만든 그림만 꺼내고, 그림 풀기·HDR 셈은 백그라운드에서 앞질러 한다
struct SwayFramesTests {
  /// 그림 대신 「몇 번 장, 몇 세대」
  struct Pic: Equatable {
    let i: Int
    let gen: Int
  }

  /// 흔들기 `seconds`초를 시계 한 칸(50ms)씩 흉내 낸다. 백그라운드는 칸마다 `perTick`장만 만든다(HDR 한 장 가운데 8.6ms라 50ms에
  /// 한 장은 넉넉히 느리게 잡은 것). 흔드는 길이 원한 두 장 가운데 아직 없는 장을 만난 횟수와 가장 많이 쥔 장 수를 돌려준다
  private func simulate(reach: Int, seconds: Double = 18, perTick: Int = 1) -> (misses: Int, most: Int) {
    var store = SwayFrames<Pic>(count: TierShowcase.heroFrames, reach: reach)
    // 티어를 고르면 정면 한 장은 바로(임시 그림) 넣는다
    let f0 = TierShowcase.frames(yaw: 0, count: TierShowcase.heroFrames)
    store.placeholder(f0.lo, Pic(i: f0.lo, gen: -1))
    store.placeholder(f0.hi, Pic(i: f0.hi, gen: -1))
    var queue: [Int] = []
    var sway = TierShowcase.Sway.from(0)
    var misses = 0
    var most = 0
    for _ in 0..<Int(seconds / 0.05) {
      sway = sway.step(50)
      let f = TierShowcase.frames(yaw: sway.yaw, count: TierShowcase.heroFrames)
      queue += store.need(lo: f.lo, hi: f.hi)
      if store.frame(f.lo) == nil || store.frame(f.hi) == nil { misses += 1 }
      most = max(most, store.heldCount)
      // 다음 칸까지 백그라운드가 만든 장
      for _ in 0..<perTick where !queue.isEmpty {
        let i = queue.removeFirst()
        store.deliver(i, Pic(i: i, gen: store.generation), generation: store.generation)
      }
    }
    return (misses, most)
  }

  @Test func swayingNeverWaitsForAFrameBecauseNeighborsArePreparedAhead() {
    let r = simulate(reach: 2)
    #expect(r.misses == 0)
  }

  @Test func storeHoldsAtMostSixFramesSoHdrStaysNearFifteenMegabytes() {
    // HDR 560px 한 장 2.5MB × 6 = 15MB(예전 최근 네 장 10MB)
    #expect(simulate(reach: 2).most <= 6)
  }

  @Test func newTierShowsTheFrontPlaceholderAtOnceThenSwapsInTheRealFrame() {
    var store = SwayFrames<Pic>(count: 21)
    store.placeholder(10, Pic(i: 10, gen: -1))
    #expect(store.frame(10) == Pic(i: 10, gen: -1))
    // 임시 그림도 다시 만들도록 원한다(가까운 차례)
    let todo = store.need(lo: 10, hi: 10)
    #expect(todo == [10, 9, 11, 8, 12])
    store.deliver(10, Pic(i: 10, gen: 0), generation: 0)
    #expect(store.frame(10) == Pic(i: 10, gen: 0))
    // 제 그림 위에는 임시 그림을 덮지 않는다
    store.placeholder(10, Pic(i: 10, gen: -1))
    #expect(store.frame(10) == Pic(i: 10, gen: 0))
  }

  @Test func lateFramesFromAnOldTierOrHdrSettingAreDropped() {
    var store = SwayFrames<Pic>(count: 21)
    _ = store.need(lo: 10, hi: 11)
    store.reset()
    let took = store.deliver(10, Pic(i: 10, gen: 0), generation: 0)
    #expect(!took)
    #expect(store.frame(10) == nil)
  }

  @Test func switchingHdrKeepsTheShownFramesUntilTheNewOnesArrive() {
    var store = SwayFrames<Pic>(count: 21)
    _ = store.need(lo: 10, hi: 11)
    store.deliver(10, Pic(i: 10, gen: 0), generation: 0)
    store.reset(keep: true)
    #expect(store.frame(10) == Pic(i: 10, gen: 0))
    let todo = store.need(lo: 10, hi: 11)
    #expect(todo.contains(10))
  }

  @Test func framesOutsideTheWantedRangeAreDropped() {
    var store = SwayFrames<Pic>(count: 21)
    for i in store.need(lo: 0, hi: 1) { store.deliver(i, Pic(i: i, gen: 0), generation: 0) }
    #expect(store.frame(0) != nil)
    _ = store.need(lo: 10, hi: 11)
    #expect(store.frame(0) == nil)
    #expect(store.wanted(lo: 20, hi: 20) == 18...20)
  }

  // MARK: 흔드는 길에 비싼 셈이 없다(앱 소스)

  private let sources = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent(
    "../../Sources/Cubie")

  /// `start`로 시작하는 함수(또는 속성) 몸통: 같은 들여쓰기의 닫는 괄호까지
  private func body(_ file: String, from start: String) throws -> String {
    let text = try String(contentsOf: sources.appendingPathComponent(file), encoding: .utf8)
    let head = try #require(text.range(of: start), "\(file)에 \(start) 없음")
    let line = text[..<head.lowerBound].split(separator: "\n", omittingEmptySubsequences: false).last ?? ""
    let indent = String(line.prefix { $0 == " " })
    let rest = text[head.lowerBound...]
    let end = try #require(rest.range(of: "\n\(indent)}\n"))
    return String(rest[..<end.upperBound])
  }

  /// 그림을 풀거나(WebP) HDR로 만들거나 그림을 베껴 칠하는 셈. 한 번에 수 ms라 흔드는 길(시계 한 칸)에 두면 120Hz 예산을 넘는다
  private let costly = ["EmblemArt.decode", "EmblemArt.hdr(", "EmblemHdr.image", "EmblemArt.copy", "makeFrame(", "makeStrip(", "split(",
    // 예전 큰 칸: 없으면 그 자리에서 풀고 HDR로 만드는 `image(_:)`
    "image(f.",
  ]

  @Test func heroSwayPathOnlyPicksPreparedFrames() throws {
    for start in ["private func render(", "private func tick("] {
      let b = try body("NativeTierShowcase.swift", from: start)
      for c in costly { #expect(!b.contains(c), "큰 칸 \(start)…에 \(c)") }
    }
  }

  /// 흔드는 길이 부르는 만들기 부탁(`prepare`·`prepareStrip`)은 셈을 백그라운드 줄에 넘기기만 한다
  @Test func frameRequestsRunTheCostlyWorkOnTheBackgroundQueue() throws {
    for (start, make) in [("private func prepare(", "makeFrame("), ("private func prepareStrip(", "makeStrip(")] {
      let b = try body("NativeTierShowcase.swift", from: start)
      let queue = try #require(b.range(of: "EmblemArt.work.async"), "\(start)…에 백그라운드 줄 없음")
      let work = try #require(b.range(of: make), "\(start)…에 \(make) 없음")
      #expect(queue.lowerBound < work.lowerBound, "\(start)…: \(make)가 백그라운드 줄 밖에 있다")
    }
  }

  @Test func ladderSweepOnlyPicksAPreparedStrip() throws {
    let b = try body("NativeTierShowcase.swift", from: "private func nextSweep(")
    for c in costly { #expect(!b.contains(c), "사다리 칸 흔들기에 \(c)") }
  }

  @Test func menuSwayPathOnlyPicksPreparedFrames() throws {
    let b = try body("ProfileMenuView.swift", from: "var yaw: Double = 0 {")
    for c in costly { #expect(!b.contains(c), "메뉴 칸 흔들기에 \(c)") }
  }
}
