import Accelerate
import CoreGraphics
import Foundation
import ImageIO
import Testing

@testable import CubieCore

/// 엠블럼 HDR(docs/52 5-16): HDR 화면의 보석 티어는 생김새는 SDR 그대로, 반짝임만 흰색보다 밝게
struct EmblemHdrTests {
  // MARK: 언제 HDR로 그리나

  @Test func hdrScreenDrawsGemTiersBrighterThanWhite() {
    for id in ["emerald", "diamond", "master", "grandmaster", "challenger"] {
      #expect(EmblemHdr.use(tier: id, screenHeadroom: 16, force: nil), "\(id)")
    }
  }

  @Test func sdrScreenAndMetalTiersStaySdr() {
    #expect(!EmblemHdr.use(tier: "diamond", screenHeadroom: 1, force: nil))
    for id in ["iron", "bronze", "silver", "gold", "platinum"] {
      #expect(!EmblemHdr.use(tier: id, screenHeadroom: 16, force: nil), "\(id)")
      #expect(!EmblemHdr.use(tier: id, screenHeadroom: 16, force: true), "금속은 강제로 켜도 SDR: \(id)")
    }
  }

  @Test func hiddenSettingForcesHdrOnOrOff() {
    #expect(EmblemHdr.force("off") == false)
    #expect(EmblemHdr.force("0") == false)
    #expect(EmblemHdr.force(" ON ") == true)
    #expect(EmblemHdr.force("밝게") == nil)
    #expect(EmblemHdr.force(nil) == nil)
    #expect(!EmblemHdr.use(tier: "diamond", screenHeadroom: 16, force: false))
    #expect(EmblemHdr.use(tier: "diamond", screenHeadroom: 1, force: true))
  }

  // MARK: 화소 셈

  @Test func gainZeroKeepsTheSdrColorAndFullGainTriples() {
    // 불투명 화소 둘: 같은 색, 배율 지도 0과 255
    let px: [UInt8] = [200, 100, 50, 255, 200, 100, 50, 255]
    let out = EmblemHdr.combine(rgba: px, gain: [0, 255])
    let lin = EmblemHdr.toLinear
    #expect(out[0] == lin[200])
    #expect(out[1] == lin[100])
    #expect(out[2] == lin[50])
    #expect(out[3] == 1)
    #expect(out[4] == lin[200] * 3)
    #expect(out[6] == lin[50] * 3)
    #expect(out[7] == 1)
  }

  @Test func translucentPixelsAreUnpremultipliedBeforeLinearizing() {
    // 알파 128에 알파 곱한 sRGB 100 → 곧은 값 199(반올림), 선형으로 편 뒤 다시 알파를 곱한다
    let out = EmblemHdr.combine(rgba: [100, 0, 0, 128], gain: [0])
    #expect(abs(out[0] - EmblemHdr.toLinear[199] * 128 / 255) < 1e-6)
    #expect(abs(out[3] - 128 / 255) < 1e-6)
    // 알파 0은 모두 0
    #expect(EmblemHdr.combine(rgba: [9, 9, 9, 0], gain: [255]) == [0, 0, 0, 0])
  }

  // MARK: 묶은 그림으로 만든 HDR 그림

  private let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../")

  private func load(_ path: String) -> CGImage? {
    let url = root.appendingPathComponent(path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
  }

  /// HDR 그림의 화소(선형, RGBA 실수)
  private func floats(_ img: CGImage) -> [Float] {
    guard let data = img.dataProvider?.data as Data? else { return [] }
    var out = [Float](repeating: 0, count: img.width * img.height * 4)
    var src = data
    src.withUnsafeMutableBytes { s in
      out.withUnsafeMutableBytes { d in
        var a = vImage_Buffer(
          data: s.baseAddress, height: vImagePixelCount(img.height), width: vImagePixelCount(img.width * 4),
          rowBytes: img.bytesPerRow)
        var b = vImage_Buffer(
          data: d.baseAddress, height: vImagePixelCount(img.height), width: vImagePixelCount(img.width * 4),
          rowBytes: img.width * 16)
        _ = vImageConvert_Planar16FtoPlanarF(&a, &b, vImage_Flags(kvImageNoFlags))
      }
    }
    return out
  }

  @Test func bundledDiamondFrameShinesAboveWhiteOnlyWhereTheGainMapSays() throws {
    let color = try #require(load("Resources/Emblems/sway/diamond/10.webp"))
    let gain = try #require(load("Resources/Emblems/hdr/diamond/10.webp"))
    let img = try #require(EmblemHdr.image(color: color, gain: gain))
    #expect(img.contentHeadroom == EmblemHdr.headroom)
    #expect(img.bitsPerComponent == 16)
    #expect(img.bitmapInfo.contains(.floatComponents))
    let px = floats(img)
    let n = img.width * img.height
    var over = 0
    for p in 0..<n where max(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]) > 1.01 { over += 1 }
    let share = Double(over) / Double(n)
    // 사이트 HDR 길(280px 칸)에서 흰색보다 밝은 화소는 다이아몬드 0.9%. 반짝임만이고 엠블럼 전체가 밝아지지 않는다
    #expect(share > 0.001, "흰색보다 밝은 화소 \(share)")
    #expect(share < 0.05, "흰색보다 밝은 화소 \(share)")
    // 모서리 바탕(반짝임 아님)은 SDR 색을 선형으로 편 값 그대로
    let sdr = EmblemHdr.combine(rgba: rgba(color), gain: [UInt8](repeating: 0, count: n))
    for k in 0..<3 { #expect(abs(px[k] - sdr[k]) < 0.002) }
  }

  private func rgba(_ img: CGImage) -> [UInt8] {
    var out = [UInt8](repeating: 0, count: img.width * img.height * 4)
    out.withUnsafeMutableBytes { b in
      let ctx = CGContext(
        data: b.baseAddress, width: img.width, height: img.height, bitsPerComponent: 8, bytesPerRow: img.width * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
      ctx?.draw(img, in: CGRect(x: 0, y: 0, width: img.width, height: img.height))
    }
    return out
  }

  /// 배율 지도가 찍기 스크립트(`ONLY=cubie-hdr`)와 같은 장 수·크기이고 보석 티어에만 있는지
  @Test func bundledGainMapsMatchTheSwayFrames() throws {
    let hdr = root.appendingPathComponent("Resources/Emblems/hdr")
    for id in TierInfo.ids {
      let dir = hdr.appendingPathComponent(id).path
      if EmblemHdr.tiers.contains(id) {
        let files = try FileManager.default.contentsOfDirectory(atPath: dir).filter { $0.hasSuffix(".webp") }
        #expect(files.count == TierShowcase.heroFrames, "\(id) 큰 칸 배율 지도 장 수")
        #expect(load("Resources/Emblems/hdr/\(id)/00.webp").map { [$0.width, $0.height] } == [560, 560])
        #expect(
          load("Resources/Emblems/hdr/\(id)-menu.webp").map { [$0.width, $0.height] } == [64 * TierShowcase.menuFrames, 64])
      } else {
        #expect(!FileManager.default.fileExists(atPath: dir), "\(id)는 HDR 없음")
      }
    }
  }

  // MARK: 미리보기

  @Test func previewSettingAcceptsOnlyKnownTierIds() {
    #expect(EmblemPreview.tier("diamond") == "diamond")
    #expect(EmblemPreview.tier(" Challenger\n") == "challenger")
    #expect(EmblemPreview.tier("다이아몬드") == nil)
    #expect(EmblemPreview.tier("") == nil)
    #expect(EmblemPreview.tier(nil) == nil)
  }

  @Test func previewChangesOnlyTheEmblem() {
    let mine = Profile(name: "익명 큐버 #1234", tierText: "3×3 브론즈 II", emblem: Data([1]), emblemTier: "bronze")
    let p = EmblemPreview.apply(mine, tier: "diamond") { Data($0.utf8) }
    #expect(p.emblemTier == "diamond")
    #expect(p.emblem == Data("diamond".utf8))
    #expect(p.name == mine.name)
    #expect(p.tierText == "3×3 브론즈 II")
    #expect(EmblemPreview.apply(mine, tier: nil) { _ in nil } == mine)
  }
}
