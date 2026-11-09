// Cubie 메뉴 막대 아이콘을 그린다(CoreGraphics만 쓴다. 이 맥의 swift로 돈다).
//   swift scripts/make-menu-icon.swift              Resources/MenuIcon*.png 만들기
//   swift scripts/make-menu-icon.swift --preview D  위에 더해 D 폴더에 메뉴 막대 흉내 미리보기 PNG
//
// 템플릿 그림(검은색 + 알파) 18pt 1x·2x. 앱 아이콘(2×2 큐브, scripts/icon/make-art.mjs)에 맞춘 2×2 등각 큐브 실루엣.
// 앱 아이콘은 이 스크립트가 그리지 않는다(Resources/AppIcon.icns는 scripts/icon/make-art.mjs --icns).
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct RGB {
  var r, g, b: CGFloat
  init(_ hex: UInt32) {
    r = CGFloat((hex >> 16) & 0xff) / 255
    g = CGFloat((hex >> 8) & 0xff) / 255
    b = CGFloat(hex & 0xff) / 255
  }
  func cg(_ a: CGFloat = 1) -> CGColor { CGColor(srgbRed: r, green: g, blue: b, alpha: a) }
}

let white = RGB(0xffffff)
let black = RGB(0x000000)

typealias P = CGPoint
func p(_ x: CGFloat, _ y: CGFloat) -> P { P(x: x, y: y) }
func lerp(_ a: P, _ b: P, _ t: CGFloat) -> P { p(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) }

/// 모서리를 둥글린 다각형
func roundedPoly(_ pts: [P], _ r: CGFloat) -> CGPath {
  let path = CGMutablePath()
  let n = pts.count
  path.move(to: lerp(pts[n - 1], pts[0], 0.5))
  for k in 0..<n { path.addArc(tangent1End: pts[k], tangent2End: pts[(k + 1) % n], radius: r) }
  path.closeSubpath()
  return path
}

/// 크기 width × height인 RGBA 그림판. 위가 0(y 아래로)
func canvas(width: Int, height: Int) -> CGContext {
  let ctx = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.translateBy(x: 0, y: CGFloat(height))
  ctx.scaleBy(x: 1, y: -1)
  ctx.setShouldAntialias(true)
  ctx.interpolationQuality = .high
  return ctx
}

func writePNG(_ img: CGImage, _ path: String) {
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, img, nil)
  if !CGImageDestinationFinalize(dest) { fatalError("못 씀: \(path)") }
}

/// 위로 뾰족한 육각형: 위·오른위·오른아래·아래·왼아래·왼위
func hex(_ c: P, _ r: CGFloat) -> [P] {
  let s = r * sqrt(3) / 2
  return [p(c.x, c.y - r), p(c.x + s, c.y - r / 2), p(c.x + s, c.y + r / 2), p(c.x, c.y + r), p(c.x - s, c.y + r / 2), p(c.x - s, c.y - r / 2)]
}

/// 한 면에 칸이 N × N
let N: CGFloat = 2

/// 면 q(꼭짓점 넷)의 칸 (i, j) 안 (u, v)
func cellPt(_ q: [P], _ i: CGFloat, _ j: CGFloat, _ u: CGFloat, _ v: CGFloat) -> P {
  let o = q[0], a = q[1], b = q[3]
  let s = (i + u) / N, t = (j + v) / N
  return p(o.x + (a.x - o.x) * s + (b.x - o.x) * t, o.y + (a.y - o.y) * s + (b.y - o.y) * t)
}

/// 18pt 그림판 좌표로 큐브 실루엣. 면마다 진하기를 달리해 입체로 보이고 칸 틈은 비운다.
/// warn이면 오른쪽 아래에 느낌표 딱지(둘레를 비워 큐브와 떨어져 보이게)
func drawMenuIcon(_ ctx: CGContext, scale: CGFloat, warn: Bool) {
  ctx.saveGState()
  ctx.scaleBy(x: scale, y: scale)
  let c = p(9, 9), r: CGFloat = 8.2
  let h = hex(c, r)
  let (t, ur, lr, b, ll, ul) = (h[0], h[1], h[2], h[3], h[4], h[5])
  let faces: [(q: [P], a: CGFloat)] = [([t, ur, c, ul], 1.0), ([ul, c, b, ll], 0.78), ([c, ur, lr, b], 0.55)]
  // 1x(18px)에서는 칸 틈이 픽셀보다 가늘어 회색 얼룩이 된다: 면을 통째로 칠하고 면 진하기로만 나눈다
  if scale < 2 {
    for f in faces {
      ctx.addPath(roundedPoly(f.q, 0.5))
      ctx.setFillColor(black.cg(f.a))
      ctx.fillPath()
    }
  } else {
    // 2×2라 칸이 커서 틈을 조금 넓히고 모서리를 더 둥글린다(앱 아이콘의 통통한 조각)
    let inset: CGFloat = 0.08
    for f in faces {
      for j in 0..<Int(N) {
        for i in 0..<Int(N) {
          let (fi, fj) = (CGFloat(i), CGFloat(j))
          let q = [
            cellPt(f.q, fi, fj, inset, inset), cellPt(f.q, fi, fj, 1 - inset, inset),
            cellPt(f.q, fi, fj, 1 - inset, 1 - inset), cellPt(f.q, fi, fj, inset, 1 - inset),
          ]
          ctx.addPath(roundedPoly(q, 0.6))
          ctx.setFillColor(black.cg(f.a))
          ctx.fillPath()
        }
      }
    }
  }
  if warn {
    let bc = p(14.2, 13.6), br: CGFloat = 4.3
    // 딱지 둘레를 지운다
    ctx.setBlendMode(.clear)
    ctx.fillEllipse(in: CGRect(x: bc.x - br - 1.2, y: bc.y - br - 1.2, width: (br + 1.2) * 2, height: (br + 1.2) * 2))
    ctx.setBlendMode(.normal)
    ctx.setFillColor(black.cg())
    ctx.fillEllipse(in: CGRect(x: bc.x - br, y: bc.y - br, width: br * 2, height: br * 2))
    // 느낌표는 비워서(딱지 안에 구멍) 보이게
    ctx.setBlendMode(.clear)
    ctx.addPath(CGPath(roundedRect: CGRect(x: bc.x - 0.65, y: bc.y - 2.9, width: 1.3, height: 3.6), cornerWidth: 0.6, cornerHeight: 0.6, transform: nil))
    ctx.fillPath()
    ctx.fillEllipse(in: CGRect(x: bc.x - 0.75, y: bc.y + 1.45, width: 1.5, height: 1.5))
    ctx.setBlendMode(.normal)
  }
  ctx.restoreGState()
}

// MARK: 만들기

let fm = FileManager.default
let scriptDir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
let appDir = scriptDir.deletingLastPathComponent().path
var previewDir: String?
var args = CommandLine.arguments.dropFirst().makeIterator()
while let a = args.next() {
  if a == "--preview" { previewDir = args.next() } else { fatalError("모르는 옵션: \(a)") }
}

func menuIconImage(scale: Int, warn: Bool) -> CGImage {
  let ctx = canvas(width: 18 * scale, height: 18 * scale)
  drawMenuIcon(ctx, scale: CGFloat(scale), warn: warn)
  return ctx.makeImage()!
}

// 18pt 1x·2x, 보통·느낌표
for (name, warn) in [("MenuIcon", false), ("MenuIconWarn", true)] {
  writePNG(menuIconImage(scale: 1, warn: warn), "\(appDir)/Resources/\(name).png")
  writePNG(menuIconImage(scale: 2, warn: warn), "\(appDir)/Resources/\(name)@2x.png")
  print("만듦: \(appDir)/Resources/\(name).png, @2x")
}

// MARK: 미리보기

if let dir = previewDir {
  try fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
  /// 메뉴 막대 흉내(2x): 밝은 막대에 검은색, 어두운 막대에 흰색으로 템플릿을 칠한다
  func menubar(bar: RGB, ink: RGB, name: String) {
    let scale = 2
    let width = 220 * scale, height = 24 * scale
    let ctx = canvas(width: width, height: height)
    ctx.setFillColor(bar.cg())
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    for (k, warn) in [false, true].enumerated() {
      for (m, s) in [2, 1].enumerated() {
        // 맥이 하듯 템플릿의 알파만 남기고 막대 글자색으로 칠한다
        let tpl = menuIconImage(scale: s, warn: warn)
        let tint = CGContext(
          data: nil, width: tpl.width, height: tpl.height, bitsPerComponent: 8, bytesPerRow: 0,
          space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let full = CGRect(x: 0, y: 0, width: tpl.width, height: tpl.height)
        tint.draw(tpl, in: full)
        tint.setBlendMode(.sourceIn)
        tint.setFillColor(ink.cg())
        tint.fill(full)
        let img = tint.makeImage()!
        let ox = CGFloat((20 + k * 100 + m * 40) * scale)
        let oy = CGFloat(3 * scale)
        ctx.saveGState()
        ctx.translateBy(x: ox, y: oy + CGFloat(18 * scale))
        ctx.scaleBy(x: 1, y: -1)
        // 1x 그림은 2x 막대에 픽셀 그대로 두 배로(1x 화면에서 보이는 모양)
        ctx.interpolationQuality = s == 1 ? .none : .high
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: 18 * scale, height: 18 * scale))
        ctx.restoreGState()
      }
    }
    let bar = ctx.makeImage()!
    writePNG(bar, "\(dir)/\(name).png")
    // 4배 확대(픽셀 그대로): 2x 픽셀 하나가 4×4로 보인다
    let zoom = canvas(width: width * 4, height: height * 4)
    zoom.interpolationQuality = .none
    zoom.translateBy(x: 0, y: CGFloat(height * 4))
    zoom.scaleBy(x: 1, y: -1)
    zoom.draw(bar, in: CGRect(x: 0, y: 0, width: width * 4, height: height * 4))
    writePNG(zoom.makeImage()!, "\(dir)/\(name)-zoom.png")
  }
  menubar(bar: RGB(0xe6e6ea), ink: black, name: "menubar-light")
  menubar(bar: RGB(0x2b2b30), ink: white, name: "menubar-dark")
  print("미리보기: \(dir)")
}
