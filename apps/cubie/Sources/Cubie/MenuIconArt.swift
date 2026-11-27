import AppKit
import CubieCore
import ImageIO

/// 메뉴 막대 아이콘 그림(docs/52 5-26). 무엇을 그릴지·숫자 자리·층 합치기는 `CubieCore.MenuTierIcon`, 여기서는 .app 안
/// 그림을 읽어 1x·2x 두 장을 한 `NSImage`로 묶는다(맥이 화면 배율에 맞는 장을 고른다).
@MainActor
enum MenuIconArt {
  /// 접근성 이름(예전과 같다)
  static func label(warn: Bool) -> String { warn ? "Cubie 단축키 실패" : "Cubie" }

  /// `dark`는 막대 밝기(status item 버튼의 `effectiveAppearance`). 기본 아이콘은 맥이 막대 색으로 칠하는 템플릿이라 상관없다.
  /// 티어 그림을 못 읽으면(.app 밖에서 실행 파일만 띄움) 기본 아이콘으로
  static func image(_ look: MenuTierIcon.Look, dark: Bool) -> NSImage? {
    switch look {
    case .plain(let warn):
      return plain(warn: warn)
    case .emblem(let tier, let n, let warn):
      return emblem(tier: tier, n: n, warn: warn, dark: dark) ?? plain(warn: warn)
    }
  }

  /// 예전 기본 아이콘: .app 안 Resources의 템플릿 그림(1x·2x). 그림이 없으면 SF Symbol
  static func plain(warn: Bool) -> NSImage? {
    let name = warn ? "MenuIconWarn" : "MenuIcon"
    if let image = Bundle.main.image(forResource: name) {
      image.size = NSSize(width: MenuTierIcon.side, height: MenuTierIcon.side)
      image.isTemplate = true
      image.accessibilityDescription = label(warn: warn)
      return image
    }
    return NSImage(
      systemSymbolName: warn ? "exclamationmark.triangle" : "cube", accessibilityDescription: label(warn: warn))
  }

  /// 엠블럼 아이콘. 컬러 큐브가 지워지지 않게 템플릿이 아닌 그림으로 둔다(단색 층 색은 `dark`로 미리 고른다)
  static func emblem(tier: String, n: Int, warn: Bool, dark: Bool) -> NSImage? {
    let side = MenuTierIcon.side
    let image = NSImage(size: NSSize(width: side, height: side))
    for scale in [1, 2] {
      guard let frame = layer(tier, "frame", scale), let cube = layer(tier, "cube", scale) else { return nil }
      let cg = MenuTierIcon.render(frame: frame, cube: cube, n: n, warn: warn, dark: dark, scale: scale)
      let rep = NSBitmapImageRep(cgImage: cg)
      rep.size = NSSize(width: side, height: side)
      image.addRepresentation(rep)
    }
    image.isTemplate = false
    image.accessibilityDescription = label(warn: warn)
    return image
  }

  /// 티어 층 그림(`Resources/MenuTier/<티어>-frame|cube[@2x].png`). 한 번 푼 것은 둔다(티어 열 × 층 둘 × 배율 둘, 모두 합쳐 수십 KB)
  private static var layers: [String: CGImage] = [:]

  private static func layer(_ tier: String, _ kind: String, _ scale: Int) -> CGImage? {
    let name = "\(tier)-\(kind)\(scale == 2 ? "@2x" : "")"
    if let hit = layers[name] { return hit }
    guard let url = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: "MenuTier"),
      let img = EmblemArt.decode(url)
    else { return nil }
    layers[name] = img
    return img
  }
}
