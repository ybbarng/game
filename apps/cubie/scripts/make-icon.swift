// Cubie 앱 아이콘과 메뉴 막대 아이콘을 그린다(CoreGraphics만 쓴다. 이 맥의 swift·iconutil로 돈다).
//   swift scripts/make-icon.swift              Resources/AppIcon.icns, Resources/MenuIcon*.png 만들기
//   swift scripts/make-icon.swift --preview D  위에 더해 D 폴더에 크기별 미리보기 PNG
//
// 그림: 맥 아이콘 판(1024 기준 824×824 둥근 사각형, 아래 그림자) 위에 「작은 반려 큐브」 3×3 등각 큐브.
// 스티커 색과 배치는 사이트 큐브 아이콘(apps/web/src/cube/icon-art.tsx)과 같다(상표 로고처럼 보이지 않게 조금 섞인 큐브).
// 작은 크기는 세부를 줄인 판으로 따로 그린다: 32px 아래는 반사·테두리 빛을 빼고 틈을 굵게, 16px 아래는 면마다 한 색.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// MARK: 색

struct RGB {
  var r, g, b: CGFloat
  init(_ hex: UInt32) {
    r = CGFloat((hex >> 16) & 0xff) / 255
    g = CGFloat((hex >> 8) & 0xff) / 255
    b = CGFloat(hex & 0xff) / 255
  }
  init(r: CGFloat, g: CGFloat, b: CGFloat) { (self.r, self.g, self.b) = (r, g, b) }
  func mix(_ o: RGB, _ t: CGFloat) -> RGB { RGB(r: r + (o.r - r) * t, g: g + (o.g - g) * t, b: b + (o.b - b) * t) }
  func cg(_ a: CGFloat = 1) -> CGColor { CGColor(srgbRed: r, green: g, blue: b, alpha: a) }
}

let white = RGB(0xffffff)
let black = RGB(0x000000)
// 사이트 큐브 아이콘과 같은 여섯 색(흰색만 아주 살짝 따뜻하게 두지 않고 그대로)
let W = RGB(0xf8fafc), Y = RGB(0xfacc15), R = RGB(0xdc2626)
let O = RGB(0xf97316), G = RGB(0x16a34a), B = RGB(0x2563eb)

// 면마다 칸 색. 칸 (i, j): i는 면의 첫 꼭짓점에서 둘째 꼭짓점 쪽, j는 넷째 꼭짓점 쪽(옆면은 j = 0이 맨 윗줄)
// 사이트 icon-art.tsx의 TOP·LEFT·RIGHT를 이 좌표로 옮긴 것
let topCells: [[RGB]] = [[W, W, B], [Y, W, W], [W, R, W]]  // [j][i]
let leftCells: [[RGB]] = [[O, B, O], [W, O, O], [O, O, R]]
let rightCells: [[RGB]] = [[R, G, G], [G, G, Y], [G, G, O]]

// MARK: 그리기 도구

typealias P = CGPoint
func p(_ x: CGFloat, _ y: CGFloat) -> P { P(x: x, y: y) }
func lerp(_ a: P, _ b: P, _ t: CGFloat) -> P { p(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) }

/// 모서리를 둥글린 다각형
func roundedPoly(_ pts: [P], _ r: CGFloat) -> CGPath {
  let path = CGMutablePath()
  let n = pts.count
  let start = lerp(pts[n - 1], pts[0], 0.5)
  path.move(to: start)
  for k in 0..<n {
    let a = pts[k], b = pts[(k + 1) % n]
    path.addArc(tangent1End: a, tangent2End: b, radius: r)
  }
  path.closeSubpath()
  return path
}

func linear(_ ctx: CGContext, _ colors: [CGColor], _ from: P, _ to: P, locations: [CGFloat]? = nil) {
  let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: colors as CFArray, locations: locations)!
  ctx.drawLinearGradient(g, start: from, end: to, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
}

func radial(_ ctx: CGContext, _ colors: [CGColor], _ c: P, _ r: CGFloat, locations: [CGFloat]? = nil) {
  let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: colors as CFArray, locations: locations)!
  ctx.drawRadialGradient(g, startCenter: c, startRadius: 0, endCenter: c, endRadius: r, options: [.drawsAfterEndLocation])
}

/// 크기 `px`인 RGBA 그림판. 그리는 좌표는 `unit` 한 변, 위가 0(y 아래로)
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
  let url = URL(fileURLWithPath: path)
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, img, nil)
  if !CGImageDestinationFinalize(dest) { fatalError("못 씀: \(path)") }
}

// MARK: 큐브

/// 위로 뾰족한 육각형: 위·오른위·오른아래·아래·왼아래·왼위
func hex(_ c: P, _ r: CGFloat) -> [P] {
  let s = r * sqrt(3) / 2
  return [p(c.x, c.y - r), p(c.x + s, c.y - r / 2), p(c.x + s, c.y + r / 2), p(c.x, c.y + r), p(c.x - s, c.y + r / 2), p(c.x - s, c.y - r / 2)]
}

/// 면 q(꼭짓점 넷)의 칸 (i, j) 안 (u, v)
func cellPt(_ q: [P], _ i: CGFloat, _ j: CGFloat, _ u: CGFloat, _ v: CGFloat) -> P {
  let o = q[0], a = q[1], b = q[3]
  let s = (i + u) / 3, t = (j + v) / 3
  return p(o.x + (a.x - o.x) * s + (b.x - o.x) * t, o.y + (a.y - o.y) * s + (b.y - o.y) * t)
}

enum Detail { case tiny, small, full }

/// 큐브 한 개. c: 가운데, r: 육각형 반지름(그리는 좌표 단위)
func drawCube(_ ctx: CGContext, c: P, r: CGFloat, detail: Detail) {
  let h = hex(c, r)
  let (t, ur, lr, b, ll, ul) = (h[0], h[1], h[2], h[3], h[4], h[5])
  let faces: [(q: [P], cells: [[RGB]], lit: CGFloat)] = [
    ([t, ur, c, ul], topCells, 1.0),
    ([ul, c, b, ll], leftCells, 0.80),
    ([c, ur, lr, b], rightCells, 0.64),
  ]

  // 몸: 둥근 육각형. 스티커 사이 틈 색
  let bodyR = r * (detail == .tiny ? 0.10 : 0.13)
  let body = roundedPoly(h, bodyR)
  ctx.saveGState()
  ctx.addPath(body)
  ctx.clip()
  linear(ctx, [RGB(0x2a2d3a).cg(), RGB(0x0d0e14).cg()], t, b)
  ctx.restoreGState()

  if detail != .full {
    // 작은 판: 면마다 가운데 칸 색 한 가지. 칸 틈은 픽셀보다 가늘어 계단이 지므로,
    // 32px 판은 가는 선으로만 3×3을 그리고 16px 판은 그것도 뺀다
    for f in faces {
      let base = f.cells[1][1].mix(black, 1 - f.lit)
      let inset: CGFloat = 0.15
      let q = [
        cellPt(f.q, 0, 0, inset, inset), cellPt(f.q, 2, 0, 1 - inset, inset),
        cellPt(f.q, 2, 2, 1 - inset, 1 - inset), cellPt(f.q, 0, 2, inset, 1 - inset),
      ]
      ctx.addPath(roundedPoly(q, r * 0.06))
      ctx.setFillColor(base.cg())
      ctx.fillPath()
      if detail == .small {
        let grid = CGMutablePath()
        for k in [1, 2] {
          let kk = CGFloat(k)
          grid.move(to: cellPt(f.q, kk, 0, 0, 0)); grid.addLine(to: cellPt(f.q, kk, 3, 0, 0))
          grid.move(to: cellPt(f.q, 0, kk, 0, 0)); grid.addLine(to: cellPt(f.q, 3, kk, 0, 0))
        }
        ctx.addPath(grid)
        ctx.setStrokeColor(RGB(0x0d0e14).cg(0.55))
        ctx.setLineWidth(r * 0.05)
        ctx.strokePath()
      }
    }
    return
  }

  let inset: CGFloat = 0.085
  let round = r * 0.065
  for f in faces {
    for j in 0..<3 {
      for i in 0..<3 {
        // 작은 판은 섞인 색이 어지러워 면마다 가운데 칸 색 하나로
        let col = detail == .small ? f.cells[1][1] : f.cells[j][i]
        let (fi, fj) = (CGFloat(i), CGFloat(j))
        let q = [
          cellPt(f.q, fi, fj, inset, inset), cellPt(f.q, fi, fj, 1 - inset, inset),
          cellPt(f.q, fi, fj, 1 - inset, 1 - inset), cellPt(f.q, fi, fj, inset, 1 - inset),
        ]
        let path = roundedPoly(q, round)
        let shade = col.mix(black, 1 - f.lit)
        ctx.saveGState()
        ctx.addPath(path)
        ctx.clip()
        if detail == .full {
          // 칸 안: 빛 받는 모서리(첫 꼭짓점 쪽)가 조금 밝다
          linear(ctx, [shade.mix(white, 0.16 * f.lit).cg(), shade.cg(), shade.mix(black, 0.10).cg()], q[0], q[2], locations: [0, 0.55, 1])
          // 반사: 첫 꼭짓점 쪽 작은 둥근 빛
          let spot = cellPt(f.q, fi, fj, 0.32, 0.30)
          radial(ctx, [white.cg(0.32 * f.lit), white.cg(0)], spot, r * 0.07)
        } else {
          ctx.setFillColor(shade.cg())
          ctx.fill(CGRect(x: -10000, y: -10000, width: 20000, height: 20000))
        }
        ctx.restoreGState()
      }
    }
  }

  if detail == .full {
    // 몸 둘레 빛: 위 두 모서리를 따라 가는 흰 선(왼위에서 빛이 온다), 아래쪽은 옅게
    ctx.saveGState()
    ctx.addPath(body)
    ctx.setLineWidth(r * 0.012)
    ctx.replacePathWithStrokedPath()
    ctx.clip()
    linear(ctx, [white.cg(0.55), white.cg(0.12), white.cg(0.0)], p(ul.x, t.y), p(lr.x, b.y), locations: [0, 0.45, 1])
    ctx.restoreGState()
    // 면 전체에 걸친 은은한 빛(위에서 아래로 사그라든다). 둥근 입체감
    ctx.saveGState()
    ctx.addPath(body)
    ctx.clip()
    radial(ctx, [white.cg(0.10), white.cg(0)], p(c.x - r * 0.25, c.y - r * 0.55), r * 0.9)
    ctx.restoreGState()
  }
}

// MARK: 앱 아이콘

/// 1024 기준 좌표로 앱 아이콘 하나를 `px` 크기로 (ox, oy)에 그린다
func drawAppIcon(_ ctx: CGContext, px: Int, ox: CGFloat = 0, oy: CGFloat = 0) {
  let s = CGFloat(px) / 1024
  let detail: Detail = px <= 16 ? .tiny : (px <= 40 ? .small : .full)
  ctx.saveGState()
  ctx.translateBy(x: ox, y: oy)
  ctx.scaleBy(x: s, y: s)

  // 판: 824×824, 모서리 반지름 185(macOS 11 아이콘 격자). 아래 그림자
  let plateRect = CGRect(x: 100, y: 100, width: 824, height: 824)
  let plate = CGPath(roundedRect: plateRect, cornerWidth: 185, cornerHeight: 185, transform: nil)
  if detail != .tiny {
    ctx.saveGState()
    // 좌표를 뒤집어 그리므로 그림자 y는 그림판 기준(위가 +)이다: 아래로 떨어지게 음수
    ctx.setShadow(offset: CGSize(width: 0, height: -12 * s), blur: 28 * s, color: black.cg(0.30))
    ctx.addPath(plate)
    ctx.setFillColor(RGB(0x1b2033).cg())
    ctx.fillPath()
    ctx.restoreGState()
  }
  ctx.saveGState()
  ctx.addPath(plate)
  ctx.clip()
  // 밤하늘 남색 판: 위가 조금 밝고, 큐브 뒤로 옅은 보랏빛 빛무리
  linear(ctx, [RGB(0x323b63).cg(), RGB(0x1a1f38).cg(), RGB(0x0e1122).cg()], p(512, 100), p(512, 924), locations: [0, 0.55, 1])
  radial(ctx, [RGB(0x9aa6ff).cg(0.60), RGB(0x6b78e6).cg(0.22), RGB(0x6b78e6).cg(0)], p(512, 470), 470, locations: [0, 0.6, 1])
  ctx.restoreGState()
  if detail == .full {
    // 판 테두리 안쪽 빛(위가 밝다)
    ctx.saveGState()
    ctx.addPath(CGPath(roundedRect: plateRect.insetBy(dx: 2, dy: 2), cornerWidth: 183, cornerHeight: 183, transform: nil))
    ctx.setLineWidth(3)
    ctx.replacePathWithStrokedPath()
    ctx.clip()
    linear(ctx, [white.cg(0.22), white.cg(0.04), white.cg(0.0)], p(512, 100), p(512, 924))
    ctx.restoreGState()
  }

  // 큐브와 그 아래 그림자
  let (cr, cy): (CGFloat, CGFloat) = switch detail {
  case .tiny: (330, 512)
  case .small: (305, 500)
  case .full: (282, 490)
  }
  if detail != .tiny {
    ctx.saveGState()
    ctx.translateBy(x: 512, y: cy + cr + 26)
    ctx.scaleBy(x: 1, y: 0.17)
    radial(ctx, [black.cg(0.70), black.cg(0.35), black.cg(0)], .zero, cr * 1.0, locations: [0, 0.5, 1])
    ctx.restoreGState()
  }
  drawCube(ctx, c: p(512, cy), r: cr, detail: detail)
  ctx.restoreGState()
}

// MARK: 메뉴 막대 아이콘(템플릿: 검은색 + 알파)

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
  }
  let inset: CGFloat = 0.12
  for f in faces where scale >= 2 {
    for j in 0..<3 {
      for i in 0..<3 {
        let (fi, fj) = (CGFloat(i), CGFloat(j))
        let q = [
          cellPt(f.q, fi, fj, inset, inset), cellPt(f.q, fi, fj, 1 - inset, inset),
          cellPt(f.q, fi, fj, 1 - inset, 1 - inset), cellPt(f.q, fi, fj, inset, 1 - inset),
        ]
        ctx.addPath(roundedPoly(q, 0.35))
        ctx.setFillColor(black.cg(f.a))
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
var args = CommandLine.arguments.dropFirst().makeIterator()
while let a = args.next() {
  if a == "--preview" { previewDir = args.next() } else { fatalError("모르는 옵션: \(a)") }
}

func appIconImage(_ px: Int) -> CGImage {
  let ctx = canvas(width: px, height: px)
  drawAppIcon(ctx, px: px)
  return ctx.makeImage()!
}

func menuIconImage(scale: Int, warn: Bool) -> CGImage {
  let ctx = canvas(width: 18 * scale, height: 18 * scale)
  drawMenuIcon(ctx, scale: CGFloat(scale), warn: warn)
  return ctx.makeImage()!
}

// 앱 아이콘: iconset → icns
let tmp = fm.temporaryDirectory.appendingPathComponent("cubie-icon-\(ProcessInfo.processInfo.processIdentifier)")
let iconset = tmp.appendingPathComponent("AppIcon.iconset")
try fm.createDirectory(at: iconset, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
  writePNG(appIconImage(base), iconset.appendingPathComponent("icon_\(base)x\(base).png").path)
  writePNG(appIconImage(base * 2), iconset.appendingPathComponent("icon_\(base)x\(base)@2x.png").path)
}
let icns = "\(appDir)/Resources/AppIcon.icns"
let iconutil = Process()
iconutil.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
iconutil.arguments = ["-c", "icns", iconset.path, "-o", icns]
try iconutil.run()
iconutil.waitUntilExit()
if iconutil.terminationStatus != 0 { fatalError("iconutil 실패") }
try? fm.removeItem(at: tmp)
print("만듦: \(icns)")

// 메뉴 막대: 18pt 1x·2x, 보통·느낌표
for (name, warn) in [("MenuIcon", false), ("MenuIconWarn", true)] {
  writePNG(menuIconImage(scale: 1, warn: warn), "\(appDir)/Resources/\(name).png")
  writePNG(menuIconImage(scale: 2, warn: warn), "\(appDir)/Resources/\(name)@2x.png")
  print("만듦: \(appDir)/Resources/\(name).png, @2x")
}

// MARK: 미리보기

if let dir = previewDir {
  try fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
  for px in [1024, 512, 128, 32, 16] { writePNG(appIconImage(px), "\(dir)/icon-\(px).png") }

  /// 밝은·어두운 바탕에 실제 픽셀 크기로 늘어놓고, 32·16은 8배 확대(픽셀 그대로)도 붙인다
  func sheet(bg: RGB, name: String) {
    let sizes = [512, 256, 128, 64, 32, 16]
    let gap = 40
    let width = sizes.reduce(0, +) + gap * (sizes.count + 1)
    let height = 512 + 2 * gap + 256 + gap
    let ctx = canvas(width: width, height: height)
    ctx.setFillColor(bg.cg())
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    var x = gap
    for px in sizes {
      drawAppIcon(ctx, px: px, ox: CGFloat(x), oy: CGFloat(gap + 512 - px))
      x += px + gap
    }
    ctx.interpolationQuality = .none
    var zx = gap
    for px in [32, 16] {
      let img = appIconImage(px)
      let z = 256
      // 그림판이 뒤집혀 있어 그림을 다시 뒤집어 놓는다
      ctx.saveGState()
      ctx.translateBy(x: CGFloat(zx), y: CGFloat(512 + 2 * gap + z))
      ctx.scaleBy(x: 1, y: -1)
      ctx.draw(img, in: CGRect(x: 0, y: 0, width: z, height: z))
      ctx.restoreGState()
      zx += z + gap
    }
    writePNG(ctx.makeImage()!, "\(dir)/\(name).png")
  }
  sheet(bg: RGB(0xf2f2f5), name: "sheet-light")
  sheet(bg: RGB(0x1e1e22), name: "sheet-dark")

  /// 메뉴 막대 흉내(2x): 밝은 막대에 검은색, 어두운 막대에 흰색으로 템플릿을 칠한다. 옆에 SF Symbol 크기 비교용 네모 없음
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
