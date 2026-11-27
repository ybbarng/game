import AppKit
import CoreGraphics
import CoreText

/// 메뉴 막대 아이콘(docs/52 5-26): 지금 고른 큐브 크기에 티어가 있으면 그 티어 엠블럼 아이콘, 없으면 기본 아이콘.
/// 엠블럼 아이콘은 18pt에 두 층이다. 틀·날개·볏·왕관은 막대 글자색으로 칠한 단색 층(`<티어>-frame`), 가운데 큐브는 칸 없는
/// 한 덩이 티어 재질 컬러 층(`<티어>-cube`, 둘 다 `scripts/make-menu-tier-icons.swift`가 굽는다). 그 위에 크기 숫자(2~7)를
/// 아이콘 왼쪽 아래 모서리에, 단축키 실패면 오른쪽 아래에 느낌표 딱지를 얹는다. 기본 아이콘은 예전 템플릿 그림 그대로다.
/// 판단과 숫자 자리 셈, 층 합치기는 여기(시험 `MenuTierIconTests`), 그림 읽기·막대 밝기 고르기는 앱(`AppDelegate`).
public enum MenuTierIcon {
  /// 무엇을 그릴지
  public enum Look: Equatable, Sendable {
    /// 예전 기본 아이콘(`MenuIcon`, 경고면 `MenuIconWarn`). 막대 색은 맥이 칠한다(템플릿)
    case plain(warn: Bool)
    /// 티어 엠블럼 + 크기 숫자 `n`(+ 경고 딱지)
    case emblem(tier: String, n: Int, warn: Bool)
  }

  /// 티어 id(사이트 `TIER_IDS` 차례). 그림 이름의 앞머리
  public static let tiers = [
    "iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger",
  ]
  /// 숫자를 보이는 크기(앱이 고를 수 있는 크기 모두)
  public static let sizes = 2...7

  /// 지금 크기 `n`의 티어 id(`Profile.emblemTier`, 없으면 nil)와 단축키 실패 여부로 무엇을 그릴지
  public static func look(tier: String?, n: Int, warn: Bool) -> Look {
    guard let tier, tiers.contains(tier), sizes.contains(n) else { return .plain(warn: warn) }
    return .emblem(tier: tier, n: n, warn: warn)
  }

  // MARK: 자리(pt, 위가 0)

  /// 아이콘 한 변
  public static let side: CGFloat = 18
  /// 숫자 높이(대문자 높이 = 4·5·7의 평평한 윗변에서 기준선까지)
  public static let digitHeight: CGFloat = 7
  /// 숫자 글자 상자 왼쪽 끝
  public static let digitLeft: CGFloat = 1
  /// 숫자 기준선(아래 테 1pt가 아이콘 가장자리에서 잘리지 않게)
  public static let digitBaseline: CGFloat = 17
  /// 숫자 둘레 어두운 테 두께
  public static let digitRing: CGFloat = 1
  /// 테 바깥으로 단색 층을 더 비우는 폭(숫자가 틀과 떨어져 보이게)
  public static let digitGap: CGFloat = 0.75
  /// 경고 딱지(예전 `MenuIconWarn`과 같은 자리·크기, `scripts/make-menu-icon.swift`)
  public static let badgeCenter = CGPoint(x: 14.2, y: 13.6)
  public static let badgeRadius: CGFloat = 4.3
  /// 딱지 둘레를 비우는 폭
  public static let badgeRing: CGFloat = 1.2

  /// 숫자 자리(화소). 배율마다 화소 격자에 맞춘다: 대문자 높이·글자 왼쪽 끝·기준선이 화소 경계에 놓인다
  public struct DigitPlace: Equatable, Sendable {
    public var capPx: Int
    public var leftPx: Int
    public var baselinePx: Int
  }

  public static func digitPlace(scale: Int) -> DigitPlace {
    let s = CGFloat(scale)
    return DigitPlace(
      capPx: Int((digitHeight * s).rounded()), leftPx: Int((digitLeft * s).rounded()),
      baselinePx: Int((digitBaseline * s).rounded()))
  }

  /// 숫자 `n`의 글자 모양(SF Heavy). 화소 좌표, 위가 0. 글자 상자 왼쪽이 `leftPx`, 기준선이 `baselinePx`
  public static func digitPath(_ n: Int, scale: Int) -> CGPath {
    let place = digitPlace(scale: scale)
    let unit = NSFont.systemFont(ofSize: 100, weight: .heavy) as CTFont
    // 대문자 높이를 정수 화소로: 평평한 윗변과 기준선이 화소 경계에 놓인다. 3·6처럼 둥근 숫자만 위아래로 조금 넘친다
    let font = CTFontCreateCopyWithAttributes(unit, 100 * CGFloat(place.capPx) / CTFontGetCapHeight(unit), nil, nil)
    let glyphs = glyphPath("\(n)", font)
    let g = glyphs.boundingBoxOfPath
    let t = CGAffineTransform(translationX: -g.minX, y: 0)
      .concatenating(CGAffineTransform(scaleX: 1, y: -1))
      .concatenating(CGAffineTransform(translationX: CGFloat(place.leftPx), y: CGFloat(place.baselinePx)))
    return glyphs.copy(using: [t])!
  }

  private static func glyphPath(_ text: String, _ font: CTFont) -> CGPath {
    let line = CTLineCreateWithAttributedString(
      NSAttributedString(string: text, attributes: [.font: font]))
    let out = CGMutablePath()
    for run in (CTLineGetGlyphRuns(line) as? [CTRun]) ?? [] {
      let count = CTRunGetGlyphCount(run)
      var glyphs = [CGGlyph](repeating: 0, count: count)
      var pos = [CGPoint](repeating: .zero, count: count)
      CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
      CTRunGetPositions(run, CFRange(location: 0, length: count), &pos)
      for (glyph, p) in zip(glyphs, pos) {
        if let path = CTFontCreatePathForGlyph(font, glyph, nil) {
          out.addPath(path, transform: CGAffineTransform(translationX: p.x, y: p.y))
        }
      }
    }
    return out
  }

  // MARK: 색

  /// 단색 층 색: 밝은 막대는 검정 85%(막대 글자색 남짓), 어두운 막대는 흰색
  public static func ink(dark: Bool) -> CGColor {
    dark ? CGColor(gray: 1, alpha: 1) : CGColor(gray: 0, alpha: 0.85)
  }

  /// 숫자 테 색(막대 밝기와 상관없이 같다. 숫자는 흰색 고정)
  public static let digitRingColor = CGColor(srgbRed: 0.07, green: 0.07, blue: 0.08, alpha: 0.95)

  // MARK: 합치기

  /// 엠블럼 아이콘 한 장(18pt × `scale` 화소). `frame`은 단색 층 알파, `cube`는 컬러 층(둘 다 그 배율 그림)
  public static func render(frame: CGImage, cube: CGImage, n: Int, warn: Bool, dark: Bool, scale: Int) -> CGImage {
    let px = Int(side) * scale
    let s = CGFloat(scale)
    let full = CGRect(x: 0, y: 0, width: px, height: px)
    let color = canvas(px)
    let mono = canvas(px)
    color.draw(cube, in: full)
    mono.draw(frame, in: full)
    if warn {
      clearBadgeRoom(color, s)
      clearBadgeRoom(mono, s)
      drawBadge(mono, s)
    }
    let digit = digitPath(n, scale: scale)
    // 단색 층에서 숫자와 테 둘레를 비운다
    withTopDown(mono) {
      mono.setBlendMode(.clear)
      mono.addPath(digit)
      mono.setLineJoin(.round)
      mono.setLineWidth((digitRing + digitGap) * 2 * s)
      mono.strokePath()
      mono.addPath(digit)
      mono.fillPath()
    }
    // 컬러 층에 흰 숫자 + 어두운 테
    withTopDown(color) {
      color.addPath(digit)
      color.setLineJoin(.round)
      color.setLineWidth(digitRing * 2 * s)
      color.setStrokeColor(digitRingColor)
      color.strokePath()
      color.addPath(digit)
      color.setFillColor(CGColor(gray: 1, alpha: 1))
      color.fillPath()
    }
    if warn { clearBadgeRoom(color, s) }
    // 단색 층을 막대 색으로 칠해 컬러 층 위에 얹는다
    mono.setBlendMode(.sourceIn)
    mono.setFillColor(ink(dark: dark))
    mono.fill(full)
    color.setBlendMode(.normal)
    color.draw(mono.makeImage()!, in: full)
    return color.makeImage()!
  }

  private static func canvas(_ px: Int) -> CGContext {
    let ctx = CGContext(
      data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: px * 4,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.interpolationQuality = .high
    ctx.setShouldAntialias(true)
    return ctx
  }

  /// 화소 좌표(위가 0)로 그린다
  private static func withTopDown(_ ctx: CGContext, _ draw: () -> Void) {
    ctx.saveGState()
    ctx.translateBy(x: 0, y: CGFloat(ctx.height))
    ctx.scaleBy(x: 1, y: -1)
    draw()
    ctx.restoreGState()
  }

  private static func clearBadgeRoom(_ ctx: CGContext, _ s: CGFloat) {
    withTopDown(ctx) {
      ctx.scaleBy(x: s, y: s)
      ctx.setBlendMode(.clear)
      let r = badgeRadius + badgeRing
      ctx.fillEllipse(in: CGRect(x: badgeCenter.x - r, y: badgeCenter.y - r, width: r * 2, height: r * 2))
    }
  }

  /// 느낌표 딱지(단색 층에 검게, 느낌표는 비워서)
  private static func drawBadge(_ ctx: CGContext, _ s: CGFloat) {
    let c = badgeCenter
    withTopDown(ctx) {
      ctx.scaleBy(x: s, y: s)
      ctx.setFillColor(CGColor(gray: 0, alpha: 1))
      ctx.fillEllipse(in: CGRect(x: c.x - badgeRadius, y: c.y - badgeRadius, width: badgeRadius * 2, height: badgeRadius * 2))
      ctx.setBlendMode(.clear)
      ctx.addPath(
        CGPath(
          roundedRect: CGRect(x: c.x - 0.65, y: c.y - 2.9, width: 1.3, height: 3.6), cornerWidth: 0.6,
          cornerHeight: 0.6, transform: nil))
      ctx.fillPath()
      ctx.fillEllipse(in: CGRect(x: c.x - 0.75, y: c.y + 1.45, width: 1.5, height: 1.5))
    }
  }
}
