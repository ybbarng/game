import Foundation
import ImageIO
import Testing

@testable import CubieCore

/// 티어표 진열(docs/52 5-11, 사이트 `TierShowcase.tsx`): 무엇을 크게 보일지, 사다리 칸 표시, 글, 흔들기 각과 그림 번호
struct TierShowcaseTests {
  /// 3×3 꼴의 표(아이언 끝없음, 브론즈~그랜드마스터 구간 넷, 챌린저 하나)
  private let table: TierSheet.Table = {
    var rows: [TierSheet.Row] = [TierSheet.Row(tier: 0, cuts: [.infinity, 900, 630, 435])]
    let fours: [[Double]] = [
      [300, 240, 180, 150], [120, 100, 85, 72], [60, 52, 46, 40], [36, 32, 29, 26],
      [24, 22, 20, 18], [17, 16, 15, 14], [13, 12, 11, 10], [9.5, 9, 8.5, 8],
    ]
    for (i, c) in fours.enumerated() { rows.append(TierSheet.Row(tier: i + 1, cuts: c)) }
    rows.append(TierSheet.Row(tier: 9, cuts: [6.5]))
    return TierSheet.Table(n: 3, people: 1, date: "", credit: "", url: "", rows: rows)
  }()

  /// 골드 II(division 2 = 「II」), 최고 Ao5 50.12초
  private let gold = TierInfo(ao5: 50_120, tier: 3, division: 2, name: "골드 II")

  @Test func pickTogglesBackToMine() {
    #expect(TierShowcase.pick(nil, tapped: 9, mine: 3) == 9)
    #expect(TierShowcase.pick(9, tapped: 9, mine: 3) == nil)
    #expect(TierShowcase.pick(9, tapped: 6, mine: 3) == 6)
    #expect(TierShowcase.pick(9, tapped: 3, mine: 3) == nil)
    // 기록이 없으면 내 칸이 없다
    #expect(TierShowcase.pick(nil, tapped: 0, mine: nil) == 0)
  }

  @Test func myTierView() {
    let s = TierShowcase.state(table: table, mine: gold, picked: nil)
    #expect(s.hero == 3 && !s.locked && s.picked == nil)
    #expect(s.pips == 3)
    // 다음 티어: 플래티넘 IV 상한 36초까지 14.12초
    #expect(s.next == TierShowcase.Next(tier: 4, cutMs: 36_000, gapMs: 14_120))
    #expect(s.pickedGapMs == nil)
    #expect(s.cells.filter(\.viewing).map(\.tier) == [3])
    #expect(s.cells.filter(\.mine).map(\.tier) == [3])
    #expect(s.cells[0].cut == "다 맞춤" && s.cells[3].cut == "1:00 이하" && s.cells[9].cut == "6.5초 이하")
  }

  @Test func pickedAboveAndBelow() {
    let up = TierShowcase.state(table: table, mine: gold, picked: 9)
    #expect(up.hero == 9 && up.next == nil && up.pips == nil && !up.locked)
    #expect(up.pickedGapMs == 43_620)
    #expect(up.cells.filter(\.viewing).map(\.tier) == [9])
    #expect(up.cells.filter(\.mine).map(\.tier) == [3])
    let down = TierShowcase.state(table: table, mine: gold, picked: 1)
    #expect(down.hero == 1 && down.pickedGapMs == nil)
  }

  @Test func challengerHasNoNext() {
    let top = TierInfo(ao5: 5_000, tier: 9, division: nil, name: "챌린저")
    let s = TierShowcase.state(table: table, mine: top, picked: nil)
    #expect(s.next == nil && s.pips == nil)
  }

  @Test func noRecordShowsLockedIron() {
    let s = TierShowcase.state(table: table, mine: nil, picked: nil)
    #expect(s.hero == 0 && s.locked && s.next == nil && s.pips == nil)
    // 위에 뜬 아이언이 아래에서도 보고 있는 칸, 내 칸은 없다
    #expect(s.cells.filter(\.viewing).map(\.tier) == [0])
    #expect(s.cells.allSatisfy { !$0.mine })
    // 다른 티어를 고르면 어둡게 두지 않는다
    #expect(!TierShowcase.state(table: table, mine: nil, picked: 6).locked)
  }

  @Test func textsLikeTheSite() {
    #expect(TierShowcase.cutLine(6.5) == "Ao5 6.5초 이하")
    #expect(TierShowcase.cutLine(.infinity) == "다 맞춤")
    #expect(TierShowcase.divisionsLine([60, 52, 46, 40]) == "IV 1:00 · III 52초 · II 46초 · I 40초")
    #expect(TierShowcase.divisionsLine([6.5]) == nil)
  }

  @Test func swayLikeTheSite() {
    var s = TierShowcase.Sway.from(0)
    #expect(s.yaw == 0)
    // 처음 1.5초는 빠르기를 올린다: 사이트 식으로 흔들기 시계가 실제 시간보다 느리게 간다
    for _ in 0..<15 { s = s.step(100) }
    #expect(s.t > 0 && s.t < 1500)
    // 다 올린 뒤에는 실제 시간대로
    let t0 = s.t
    s = s.step(1000)
    #expect(abs(s.t - t0 - 1000) < 1e-9)
    // 폭 안의 각에서 다시 시작하면 같은 각에서 이어진다
    #expect(abs(TierShowcase.Sway.from(0.3).yaw - 0.3) < 1e-12)
    // 끌기는 그림이 덮는 폭 안으로
    #expect(TierShowcase.dragYaw(start: 0, dx: 280, width: 280) == 0.5)
    #expect(abs(TierShowcase.dragYaw(start: 0, dx: 28, width: 280) - Double.pi * 0.11) < 1e-12)
    #expect(TierShowcase.homeYaw(from: 0.4, u: 1) == 0)
  }

  @Test func framesForYaw() {
    let n = TierShowcase.heroFrames
    #expect(TierShowcase.frames(yaw: -0.5, count: n) == (0, 1, 0))
    #expect(TierShowcase.frames(yaw: 0, count: n) == (10, 11, 0))
    #expect(TierShowcase.frames(yaw: 0.5, count: n) == (20, 20, 0))
    let mid = TierShowcase.frames(yaw: 0.025, count: n)
    #expect(mid.lo == 10 && mid.hi == 11 && abs(mid.frac - 0.5) < 1e-9)
    // 폭 밖은 끝 장
    #expect(TierShowcase.frames(yaw: 0.9, count: n).lo == 20)
  }

  @Test func ladderSweepLikeTheSiteCss() {
    #expect(TierShowcase.ladderFrame(step: 0) == 8)
    #expect(TierShowcase.ladderFrame(step: 15) == 16)
    #expect(TierShowcase.ladderFrame(step: 45) == 0)
    #expect(TierShowcase.ladderFrame(step: 60) == 8)
    #expect(TierShowcase.ladderCell(at: 0) == 0)
    #expect(TierShowcase.ladderCell(at: 2_999) == 0)
    #expect(TierShowcase.ladderCell(at: 3_000) == 1)
    #expect(TierShowcase.ladderCell(at: 29_999) == 9)
    #expect(TierShowcase.ladderCell(at: 30_000) == 0)
  }

  @Test func dimLikeCssFilter() {
    // 회색은 채도와 상관없이 밝기만 곱한다
    let g = TierShowcase.rest.apply(100, 100, 100)
    #expect(abs(g.0 - 72) < 1e-9 && abs(g.1 - 72) < 1e-9 && abs(g.2 - 72) < 1e-9)
    // 빨강: saturate(0.55)의 첫 줄(0.213 + 0.787·0.55)에 밝기 0.5
    let r = TierShowcase.locked.apply(255, 0, 0)
    #expect(abs(r.0 - 255 * 0.64585 * 0.5) < 1e-9)
    #expect(abs(r.1 - 255 * (0.213 - 0.213 * 0.55) * 0.5) < 1e-9)
  }

  /// 앱에 묶는 그림이 찍기 스크립트(`render-emblem-posters.mjs` `ONLY=cubie-sway`)와 장 수·크기가 맞는지
  @Test func bundledFramesMatchTheCounts() throws {
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../")
    let sway = root.appendingPathComponent("Resources/Emblems/sway")
    let sprite = root.appendingPathComponent("../web/public/cube/tiers/emblem3d/sprite")
    for id in TierInfo.ids {
      let files = try FileManager.default.contentsOfDirectory(atPath: sway.appendingPathComponent(id).path)
        .filter { $0.hasSuffix(".webp") }
      #expect(files.count == TierShowcase.heroFrames, "\(id) 큰 칸 그림 장 수")
      #expect(size(sway.appendingPathComponent("\(id)/00.webp")) == [560, 560])
      #expect(size(sway.appendingPathComponent("\(id)-menu.webp")) == [64 * TierShowcase.menuFrames, 64])
      #expect(size(sprite.appendingPathComponent("\(id).webp")) == [224 * TierShowcase.ladderFrames, 224])
    }
  }

  private func size(_ url: URL) -> [Int]? {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
      let p = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any],
      let w = p[kCGImagePropertyPixelWidth] as? Int, let h = p[kCGImagePropertyPixelHeight] as? Int
    else { return nil }
    return [w, h]
  }
}
