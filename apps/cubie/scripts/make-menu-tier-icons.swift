// Cubie 메뉴 막대 티어 아이콘 그림(docs/52 5-26)을 굽는다(CoreGraphics만 쓴다. 이 맥의 swift로 돈다).
//   OUT=<원본 폴더> node apps/web/scripts/render-menubar-icons.mjs   # 3D 엠블럼에서 원본을 찍는다
//   swift apps/cubie/scripts/make-menu-tier-icons.swift <원본 폴더>   # Resources/MenuTier/*.png 만들기
//
// 티어마다 18pt 1x·2x 두 층을 굽는다. 크기 숫자·경고 딱지·막대 색은 앱이 그릴 때 얹는다(`CubieCore/MenuTierIcon`).
// - `<티어>-frame.png`: 틀·날개·볏·왕관 단색 층(검은색 + 알파). 엠블럼 전체의 밝기로 진하기를 정하고(어두운 금속 테두리도 30%는
//   남긴다) 큐브 자리(조각 27개와 한 덩이)를 비운다. 앱이 막대 글자색으로 칠한다
// - `<티어>-cube.png`: 가운데 큐브, 칸 없는 한 덩이 티어 재질 그대로(컬러)
// 1x는 2x를 줄이지 않고 원본(144px)에서 바로 18px로 줄인다.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 2 else { fatalError("쓰는 법: swift make-menu-tier-icons.swift <원본 폴더>") }
let rawDir = args[1]
let appDir = URL(fileURLWithPath: args[0]).deletingLastPathComponent().deletingLastPathComponent().path
let outDir = "\(appDir)/Resources/MenuTier"
try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let tiers = ["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger"]
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
/// 원본 한 변(px)
let rawN = 144

func canvas(_ w: Int, _ h: Int) -> CGContext {
  let ctx = CGContext(
    data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
    space: srgb, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.interpolationQuality = .high
  ctx.setShouldAntialias(true)
  return ctx
}

func readPNG(_ path: String) -> CGImage {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
    let img = CGImageSourceCreateImageAtIndex(src, 0, nil)
  else { fatalError("못 읽음: \(path)") }
  return img
}

func writePNG(_ img: CGImage, _ name: String) {
  let url = URL(fileURLWithPath: "\(outDir)/\(name)")
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, img, nil)
  if !CGImageDestinationFinalize(dest) { fatalError("못 씀: \(name)") }
  print("\(outDir)/\(name)")
}

func pixels(_ img: CGImage) -> (CGContext, UnsafeMutablePointer<UInt8>) {
  let ctx = canvas(rawN, rawN)
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: rawN, height: rawN))
  return (ctx, ctx.data!.bindMemory(to: UInt8.self, capacity: rawN * rawN * 4))
}

func smooth(_ a: Double, _ b: Double, _ x: Double) -> Double {
  let t = min(1, max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/// 단색 층(원본 크기): 엠블럼 전체 알파 × 밝기 진하기, 큐브 자리는 비운다
func frameMask(_ tier: String) -> CGImage {
  let (eCtx, e) = pixels(readPNG("\(rawDir)/emblem-\(tier).png"))
  let (cCtx, c) = pixels(readPNG("\(rawDir)/core-\(tier).png"))
  let (bCtx, b) = pixels(readPNG("\(rawDir)/block-\(tier).png"))
  defer { withExtendedLifetime((eCtx, cCtx, bCtx)) {} }
  let out = canvas(rawN, rawN)
  let o = out.data!.bindMemory(to: UInt8.self, capacity: rawN * rawN * 4)
  for i in 0..<(rawN * rawN) {
    let a = Double(e[i * 4 + 3]) / 255
    guard a > 0 else { continue }
    let r = Double(e[i * 4]) / 255 / a
    let g = Double(e[i * 4 + 1]) / 255 / a
    let bl = Double(e[i * 4 + 2]) / 255 / a
    let lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl
    let ink = a * (0.3 + 0.7 * smooth(0.08, 0.6, lum))
    let core = max(Double(c[i * 4 + 3]), Double(b[i * 4 + 3])) / 255
    o[i * 4 + 3] = UInt8(min(255, ink * (1 - min(1, core * 1.6)) * 255))
  }
  return out.makeImage()!
}

/// 원본을 18pt × 배율 그림으로 줄인다
func shrink(_ img: CGImage, _ s: Int) -> CGImage {
  let ctx = canvas(18 * s, 18 * s)
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: 18 * s, height: 18 * s))
  return ctx.makeImage()!
}

for tier in tiers {
  let frame = frameMask(tier)
  let cube = readPNG("\(rawDir)/block-\(tier).png")
  for s in [1, 2] {
    let suffix = s == 1 ? "" : "@2x"
    writePNG(shrink(frame, s), "\(tier)-frame\(suffix).png")
    writePNG(shrink(cube, s), "\(tier)-cube\(suffix).png")
  }
}
