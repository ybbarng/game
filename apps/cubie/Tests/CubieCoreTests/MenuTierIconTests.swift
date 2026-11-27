import CoreGraphics
import Foundation
import ImageIO
import Testing

@testable import CubieCore

/// 메뉴 막대 아이콘(docs/52 5-26): 무엇을 그릴지, 크기 숫자 자리, 층 합치기
struct MenuTierIconTests {
  // MARK: 무엇을 그릴지

  @Test func noTierKeepsPlainIcon() {
    #expect(MenuTierIcon.look(tier: nil, n: 3, warn: false) == .plain(warn: false))
    #expect(MenuTierIcon.look(tier: nil, n: 7, warn: true) == .plain(warn: true))
  }

  @Test func tierShowsEmblemWithSizeForEverySize() {
    for n in 2...7 {
      #expect(MenuTierIcon.look(tier: "gold", n: n, warn: false) == .emblem(tier: "gold", n: n, warn: false))
      #expect(MenuTierIcon.look(tier: "challenger", n: n, warn: true) == .emblem(tier: "challenger", n: n, warn: true))
    }
  }

  @Test func unknownTierOrSizeFallsBackToPlain() {
    #expect(MenuTierIcon.look(tier: "wood", n: 3, warn: false) == .plain(warn: false))
    #expect(MenuTierIcon.look(tier: "gold", n: 8, warn: true) == .plain(warn: true))
  }

  @Test func everyTierHasBakedLayers() throws {
    let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent(
      "../../Resources/MenuTier")
    for tier in MenuTierIcon.tiers {
      for layer in ["frame", "cube"] {
        for (suffix, px) in [("", 18), ("@2x", 36)] {
          let url = dir.appendingPathComponent("\(tier)-\(layer)\(suffix).png")
          let src = try #require(CGImageSourceCreateWithURL(url as CFURL, nil), "\(url.lastPathComponent)")
          let img = try #require(CGImageSourceCreateImageAtIndex(src, 0, nil))
          #expect(img.width == px && img.height == px, "\(url.lastPathComponent)")
        }
      }
    }
  }

  // MARK: 숫자 자리

  @Test func digitPlaceSnapsToPixelGrid() {
    #expect(MenuTierIcon.digitPlace(scale: 1) == .init(capPx: 7, leftPx: 1, baselinePx: 17))
    #expect(MenuTierIcon.digitPlace(scale: 2) == .init(capPx: 14, leftPx: 2, baselinePx: 34))
  }

  /// 글자 상자 왼쪽 끝, 평평한 아랫변(2·4·7)의 기준선, 평평한 윗변(4·5·7)의 대문자 높이가 화소 경계에 놓인다
  @Test func digitEdgesLandOnPixelBoundaries() {
    for scale in [1, 2] {
      let place = MenuTierIcon.digitPlace(scale: scale)
      for n in 2...7 {
        let box = MenuTierIcon.digitPath(n, scale: scale).boundingBoxOfPath
        #expect(abs(box.minX - CGFloat(place.leftPx)) < 0.001, "\(n) @\(scale)x 왼쪽 \(box.minX)")
        if [2, 4, 7].contains(n) {
          #expect(abs(box.maxY - CGFloat(place.baselinePx)) < 0.001, "\(n) @\(scale)x 기준선 \(box.maxY)")
        }
        if [4, 5, 7].contains(n) {
          let top = CGFloat(place.baselinePx - place.capPx)
          #expect(abs(box.minY - top) < 0.02 * CGFloat(scale), "\(n) @\(scale)x 윗변 \(box.minY)")
        }
      }
    }
  }

  /// 숫자와 테가 아이콘 안에 들고(둥근 아랫변 3·5·6만 글꼴대로 0.2pt 안쪽 넘침), 오른쪽 아래 경고 딱지 둘레와 겹치지 않는다
  @Test func digitStaysInsideIconAndClearOfBadge() {
    for scale in [1, 2] {
      let s = CGFloat(scale)
      let badgeLeft = (MenuTierIcon.badgeCenter.x - MenuTierIcon.badgeRadius - MenuTierIcon.badgeRing) * s
      for n in 2...7 {
        let box = MenuTierIcon.digitPath(n, scale: scale).boundingBoxOfPath
          .insetBy(dx: -MenuTierIcon.digitRing * s, dy: -MenuTierIcon.digitRing * s)
        let overshoot: CGFloat = [3, 5, 6].contains(n) ? 0.2 * s : 0
        #expect(box.minX >= 0, "\(n) @\(scale)x \(box)")
        #expect(box.maxY <= 18 * s + overshoot, "\(n) @\(scale)x \(box)")
        #expect(box.maxX < badgeLeft, "\(n) @\(scale)x 오른쪽 \(box.maxX) 딱지 \(badgeLeft)")
      }
    }
  }

  // MARK: 층 합치기

  /// 단색 층이 꽉 찬(알파 1) 그림, 컬러 층이 빈 그림으로 합쳐 화소를 본다
  private func compose(warn: Bool, dark: Bool, scale: Int, n: Int = 3) -> (Int, Int) -> [UInt8] {
    let px = 18 * scale
    let full = solid(px, gray: 0, alpha: 1)
    let empty = solid(px, gray: 0, alpha: 0)
    let img = MenuTierIcon.render(frame: full, cube: empty, n: n, warn: warn, dark: dark, scale: scale)
    let ctx = CGContext(
      data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: px * 4,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: px, height: px))
    let p = Array(UnsafeBufferPointer(start: ctx.data!.bindMemory(to: UInt8.self, capacity: px * px * 4), count: px * px * 4))
    // (x, y) 위가 0인 화소의 RGBA(미리 곱한 값)
    return { x, y in
      let i = (y * px + x) * 4
      return [p[i], p[i + 1], p[i + 2], p[i + 3]]
    }
  }

  private func solid(_ px: Int, gray: CGFloat, alpha: CGFloat) -> CGImage {
    let ctx = CGContext(
      data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: px * 4,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setFillColor(CGColor(gray: gray, alpha: alpha))
    ctx.fill(CGRect(x: 0, y: 0, width: px, height: px))
    return ctx.makeImage()!
  }

  @Test func frameLayerTakesMenuBarInk() {
    // 숫자·딱지와 먼 위 가운데
    #expect(compose(warn: false, dark: true, scale: 2)(18, 4) == [255, 255, 255, 255])
    #expect(compose(warn: false, dark: false, scale: 2)(18, 4) == [0, 0, 0, 217])
  }

  @Test func digitIsWhiteWithDarkRingAndFrameClearedAround() {
    for scale in [1, 2] {
      let at = compose(warn: false, dark: true, scale: scale, n: 7)
      // 7의 윗변 가운데(대문자 높이 바로 아래 화소)는 흰 글자
      let place = MenuTierIcon.digitPlace(scale: scale)
      #expect(at(place.leftPx + 2 * scale, place.baselinePx - place.capPx) == [255, 255, 255, 255], "@\(scale)x")
      // 윗변 위 테 자리(1pt 안)는 어두운 테 색, 흰 틀이 아니다
      let ring = at(place.leftPx + 2 * scale, place.baselinePx - place.capPx - 1)
      #expect(ring[0] < 40 && ring[3] > 200, "@\(scale)x 테 \(ring)")
      // 테 바깥 비운 틈(0.75pt): 2배는 틈에 온전히 든 화소가 투명, 1배는 틈이 3/4 걸친 화소가 그만큼 옅다
      let gap = at(place.leftPx + 2 * scale, place.baselinePx - place.capPx - 2 * scale + (scale == 2 ? 1 : 0))
      #expect(Int(gap[3]) <= (scale == 2 ? 2 : 70), "@\(scale)x 틈 \(gap)")
    }
  }

  @Test func warnBadgeSitsLowerRightInBothScales() {
    for scale in [1, 2] {
      let s = CGFloat(scale)
      let c = MenuTierIcon.badgeCenter
      let plain = compose(warn: false, dark: true, scale: scale)
      let warn = compose(warn: true, dark: true, scale: scale)
      // 딱지 둘레 비운 띠(반지름 4.3~5.5pt): 경고면 투명
      let ringX = Int(((c.x - MenuTierIcon.badgeRadius - 0.6) * s).rounded(.down))
      let y = Int((c.y * s).rounded(.down))
      // 1배는 띠·획이 화소 하나보다 가늘어 걸친 화소가 옅게만 남는다
      let faint = scale == 2 ? 0 : 60
      #expect(plain(ringX, y)[3] == 255)
      #expect(Int(warn(ringX, y)[3]) <= faint, "@\(scale)x")
      // 딱지 몸(느낌표 옆)은 막대 색
      let bodyX = Int(((c.x + 2.4) * s).rounded(.down))
      #expect(warn(bodyX, y) == [255, 255, 255, 255], "@\(scale)x")
      // 느낌표 획은 비어 있다
      let stem = warn(Int((c.x * s).rounded(.down)), Int(((c.y - 1) * s).rounded(.down)))
      #expect(Int(stem[3]) < (scale == 2 ? 1 : 128), "@\(scale)x \(stem)")
    }
  }
}
