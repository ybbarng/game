import AppKit
import CubieCore
import ImageIO
import UniformTypeIdentifiers

/// 메뉴 막대 아이콘 확인 그림(docs/52 5-26): `CUBIE_MENU_ICON_SHOT=<폴더> Cubie.app/Contents/MacOS/Cubie`.
/// 메뉴 막대에 아이콘을 두지 않고, 앱이 status item 버튼에 넣는 것과 같은 `NSImage`(`MenuIconArt`)의 1x·2x 장을 밝은·어두운
/// 막대 색으로 PNG에 쓰고 끝난다. 기본 아이콘(템플릿)은 맥이 칠하는 대신 같은 막대 색으로 칠한다.
/// 파일: `menu-<자리>-<1|2>-<light|dark>.png`. 자리는 `none`·`warn-none`(기본), `<티어>@<n>`, `warn-<티어>@<n>`.
/// `scripts/menu-icon-compare.mjs`가 시안과 나란히 얹는다
@MainActor
enum MenuIconShot {
  static func run(dir: String) -> Int32 {
    _ = NSApplication.shared
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    var looks: [(String, MenuTierIcon.Look)] = [("none", .plain(warn: false)), ("warn-none", .plain(warn: true))]
    for tier in MenuTierIcon.tiers {
      for n in MenuTierIcon.sizes { looks.append(("\(tier)@\(n)", .emblem(tier: tier, n: n, warn: false))) }
      for n in [3, 7] { looks.append(("warn-\(tier)@\(n)", .emblem(tier: tier, n: n, warn: true))) }
    }
    var count = 0
    for (key, look) in looks {
      for dark in [false, true] {
        guard let image = MenuIconArt.image(look, dark: dark) else {
          print("[menu-icon-shot] 그림 없음: \(key)")
          return 1
        }
        if case .emblem = look, image.isTemplate {
          print("[menu-icon-shot] 티어 그림을 못 읽어 기본 아이콘이 나왔다: \(key)")
          return 1
        }
        for scale in [1, 2] {
          guard var cg = rep(image, scale) else {
            print("[menu-icon-shot] \(scale)x 장 없음: \(key)")
            return 1
          }
          if image.isTemplate { cg = inked(cg, MenuTierIcon.ink(dark: dark)) }
          write(cg, "\(dir)/menu-\(key)-\(scale)-\(dark ? "dark" : "light").png")
          count += 1
        }
      }
    }
    print("[menu-icon-shot] \(count)장: \(dir)")
    return 0
  }

  /// `NSImage`에서 그 배율 장(18pt × 배율 화소)
  private static func rep(_ image: NSImage, _ scale: Int) -> CGImage? {
    image.representations.compactMap { $0 as? NSBitmapImageRep }.first { $0.pixelsWide == 18 * scale }?.cgImage
  }

  /// 템플릿 그림을 막대 색으로
  private static func inked(_ img: CGImage, _ ink: CGColor) -> CGImage {
    let ctx = CGContext(
      data: nil, width: img.width, height: img.height, bitsPerComponent: 8, bytesPerRow: img.width * 4,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let r = CGRect(x: 0, y: 0, width: img.width, height: img.height)
    ctx.draw(img, in: r)
    ctx.setBlendMode(.sourceIn)
    ctx.setFillColor(ink)
    ctx.fill(r)
    return ctx.makeImage()!
  }

  private static func write(_ img: CGImage, _ path: String) {
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { return }
    CGImageDestinationAddImage(dest, img, nil)
    CGImageDestinationFinalize(dest)
  }
}
