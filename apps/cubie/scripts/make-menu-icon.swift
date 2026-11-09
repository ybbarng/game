// Cubie 메뉴 막대 아이콘을 그린다(CoreGraphics만 쓴다. 이 맥의 swift로 돈다).
//   swift scripts/make-menu-icon.swift              Resources/MenuIcon*.png 만들기
//   swift scripts/make-menu-icon.swift --preview D [--old O]
//     위에 더해 D 폴더에 메뉴 막대 흉내 미리보기 PNG(밝은·어두운 막대, 실제 크기와 6배 확대).
//     O 폴더에 예전 MenuIcon*.png를 복사해 두면 왼쪽에 예전, 오른쪽에 새 그림을 나란히 둔다
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

/// 메뉴 막대(18pt)에서 2×2로 읽히게 정한 값(0.1.3, 2026-11-09 사용자 「그냥 정육면체 모양인데?」).
/// 0.1.2는 틈이 @2x에서 1px 남짓이고 면 진하기가 1·0.78·0.55라 실제 크기에서 통짜 정육면체로 보였다.
/// - 실루엣 반지름(pt): 위아래 꼭짓점 사이가 18pt를 거의 채운다
let radius: CGFloat = 9.3
/// 칸 사이·면 사이 틈(pt, 수직 거리): @2x 2px, @1x 1px
let gap: CGFloat = 1
/// 면 진하기: 위, 왼쪽, 오른쪽
let faceAlpha: [CGFloat] = [1, 0.7, 0.45]

/// 18pt 그림판 좌표로 큐브 실루엣. 면마다 진하기를 달리해 입체로 보이고 칸 틈은 투명하게 판다.
/// 칸은 면 마름모를 넷으로 나눈 평행사변형을 변마다 틈의 반만큼 안으로 줄여 그린다.
/// warn이면 오른쪽 아래에 느낌표 딱지(둘레를 비워 큐브와 떨어져 보이게)
func drawMenuIcon(_ ctx: CGContext, scale: CGFloat, warn: Bool) {
  ctx.saveGState()
  ctx.scaleBy(x: scale, y: scale)
  // 1x는 가운데 세로 틈(1px)이 픽셀 한 줄에 딱 맞게 반 픽셀 옮긴다(2x는 9pt = 18px 경계라 2px 틈이 맞는다)
  let c = p(scale < 2 ? 9.5 : 9, 9)
  let h = hex(c, radius)
  let (t, ur, lr, b, ll, ul) = (h[0], h[1], h[2], h[3], h[4], h[5])
  let faces: [[P]] = [[t, ur, c, ul], [ul, c, b, ll], [c, ur, lr, b]]
  // 면 변은 서로 60°라 변에서 수직으로 d만큼 들어가려면 다른 변을 따라 d / sin 60° 간다. 칸 변 길이는 radius / N
  let inset = (gap / 2) / (sqrt(3) / 2) / (radius / N)
  let corner: CGFloat = scale < 2 ? 0.3 : 0.55
  for (f, a) in zip(faces, faceAlpha) {
    for j in 0..<Int(N) {
      for i in 0..<Int(N) {
        let (fi, fj) = (CGFloat(i), CGFloat(j))
        let q = [
          cellPt(f, fi, fj, inset, inset), cellPt(f, fi, fj, 1 - inset, inset),
          cellPt(f, fi, fj, 1 - inset, 1 - inset), cellPt(f, fi, fj, inset, 1 - inset),
        ]
        ctx.addPath(roundedPoly(q, corner))
        ctx.setFillColor(black.cg(a))
        ctx.fillPath()
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
var oldDir: String?
var args = CommandLine.arguments.dropFirst().makeIterator()
while let a = args.next() {
  switch a {
  case "--preview": previewDir = args.next()
  case "--old": oldDir = args.next()
  default: fatalError("모르는 옵션: \(a)")
  }
}

func menuIconImage(scale: Int, warn: Bool) -> CGImage {
  let ctx = canvas(width: 18 * scale, height: 18 * scale)
  drawMenuIcon(ctx, scale: CGFloat(scale), warn: warn)
  return ctx.makeImage()!
}

func readPNG(_ path: String) -> CGImage {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
    let img = CGImageSourceCreateImageAtIndex(src, 0, nil)
  else { fatalError("못 읽음: \(path)") }
  return img
}

// 미리보기에서 비교할 예전 그림(덮어쓰기 전에 읽는다)
let oldIcons: [String: CGImage]? = oldDir.map { dir in
  var m: [String: CGImage] = [:]
  for name in ["MenuIcon", "MenuIconWarn"] {
    m["\(name)@1"] = readPNG("\(dir)/\(name).png")
    m["\(name)@2"] = readPNG("\(dir)/\(name)@2x.png")
  }
  return m
}

// 18pt 1x·2x, 보통·느낌표
for (name, warn) in [("MenuIcon", false), ("MenuIconWarn", true)] {
  writePNG(menuIconImage(scale: 1, warn: warn), "\(appDir)/Resources/\(name).png")
  writePNG(menuIconImage(scale: 2, warn: warn), "\(appDir)/Resources/\(name)@2x.png")
  print("만듦: \(appDir)/Resources/\(name).png, @2x")
}

// MARK: 미리보기

/// 실제 크기 미리보기는 144 dpi로 적어 미리보기 앱이 pt 그대로(레티나 화면에서 메뉴 막대와 같은 크기로) 연다
func writePNG(_ img: CGImage, _ path: String, dpi: Int) {
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  let props = [kCGImagePropertyDPIWidth: dpi, kCGImagePropertyDPIHeight: dpi] as CFDictionary
  CGImageDestinationAddImage(dest, img, props)
  if !CGImageDestinationFinalize(dest) { fatalError("못 씀: \(path)") }
}

if let dir = previewDir {
  try fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
  /// 그림 묶음 하나(왼쪽부터 보통 @2x, 느낌표 @2x, 보통 @1x, 느낌표 @1x)
  typealias Icons = (_ name: String, _ scale: Int) -> CGImage
  let newIcons: Icons = { name, s in menuIconImage(scale: s, warn: name == "MenuIconWarn") }
  var groups: [Icons] = []
  if let old = oldIcons { groups.append { name, s in old["\(name)@\(s)"]! } }
  groups.append(newIcons)
  /// 메뉴 막대 흉내(2x): 밝은 막대에 검은색, 어두운 막대에 흰색으로 템플릿을 칠한다.
  /// `--old`가 있으면 왼쪽 묶음이 예전, 오른쪽 묶음이 새 그림
  func menubar(bar: RGB, ink: RGB, name: String) {
    let scale = 2
    let groupWidth = 4 * 26 + 24
    let width = (16 + groups.count * groupWidth) * scale, height = 24 * scale
    let ctx = canvas(width: width, height: height)
    ctx.setFillColor(bar.cg())
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    for (g, icons) in groups.enumerated() {
      for (k, (icon, s)) in [("MenuIcon", 2), ("MenuIconWarn", 2), ("MenuIcon", 1), ("MenuIconWarn", 1)].enumerated() {
        // 맥이 하듯 템플릿의 알파만 남기고 막대 글자색으로 칠한다
        let tpl = icons(icon, s)
        let tint = CGContext(
          data: nil, width: tpl.width, height: tpl.height, bitsPerComponent: 8, bytesPerRow: 0,
          space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let full = CGRect(x: 0, y: 0, width: tpl.width, height: tpl.height)
        tint.draw(tpl, in: full)
        tint.setBlendMode(.sourceIn)
        tint.setFillColor(ink.cg())
        tint.fill(full)
        let img = tint.makeImage()!
        let ox = CGFloat((16 + g * groupWidth + k * 26) * scale)
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
    writePNG(bar, "\(dir)/\(name).png", dpi: 144)
    // 6배 확대(실제 크기 기준, 픽셀 그대로): @2x 픽셀 하나가 3×3, @1x 픽셀 하나가 6×6
    let zoom = canvas(width: width * 3, height: height * 3)
    zoom.interpolationQuality = .none
    zoom.translateBy(x: 0, y: CGFloat(height * 3))
    zoom.scaleBy(x: 1, y: -1)
    zoom.draw(bar, in: CGRect(x: 0, y: 0, width: width * 3, height: height * 3))
    writePNG(zoom.makeImage()!, "\(dir)/\(name)-zoom6.png")
  }
  menubar(bar: RGB(0xe6e6ea), ink: black, name: "menubar-light")
  menubar(bar: RGB(0x2b2b30), ink: white, name: "menubar-dark")
  print("미리보기: \(dir)")
}
