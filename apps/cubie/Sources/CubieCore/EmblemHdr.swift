import Accelerate
import CoreGraphics
import Foundation

/// 엠블럼 HDR(docs/52 5-16, 사이트 docs/47 14-7 「HDR 길」과 같은 규칙): HDR 화면에서 보석 티어 엠블럼은 생김새는 SDR과
/// 같고 반짝임만 흰색보다 밝게 그린다. 앱은 3D를 띄우지 않으므로, 흔들기 그림(SDR 색)과 같은 각의 배율 지도(회색,
/// `apps/web/scripts/render-emblem-posters.mjs` `ONLY=cubie-hdr`)를 묶어 두고 화소마다 선형 색 × 배율로 편다.
/// 배율은 사이트 HDR 길이 그 화소를 키운 몫(1~`headroom`)이라 반짝임이 아닌 곳은 배율 1, 곧 SDR 그림 그대로다.
public enum EmblemHdr {
  /// HDR로 그리는 티어(사이트 `poster.ts` `HDR_POSTERS`·찍기 스크립트 `HDR_TIERS`)
  public static let tiers: Set<String> = ["emerald", "diamond", "master", "grandmaster", "challenger"]
  /// 가장 크게 키우는 배율(사이트 `stage.ts` `HDR_HEADROOM`). 배율 지도 255가 이 값
  public static let headroom: Float = 3

  /// 이 티어·화면이면 HDR로 그리는지. `force`(숨은 설정)가 있으면 화면과 상관없이 그것을 따른다
  public static func use(tier: String, screenHeadroom: Double, force: Bool?) -> Bool {
    guard tiers.contains(tier) else { return false }
    return force ?? (screenHeadroom > 1)
  }

  /// 숨은 설정 글(환경 변수 `CUBIE_EMBLEM_HDR`, `defaults write kr.byb.cubie emblemHdr …`) → 강제 켜기·끄기. 모르는 값은 nil
  public static func force(_ raw: String?) -> Bool? {
    switch raw?.trimmingCharacters(in: .whitespaces).lowercased() {
    case "1", "on", "yes", "true": return true
    case "0", "off", "no", "false": return false
    default: return nil
    }
  }

  /// 배율 지도 값(0~255) → 배율(1~`headroom`)
  public static func gain(_ v: UInt8) -> Float { 1 + (headroom - 1) * Float(v) / 255 }

  /// sRGB 8비트 → 선형(0~1)
  public static let toLinear: [Float] = (0..<256).map { i in
    let c = Double(i) / 255
    return Float(c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4))
  }

  /// 색(RGBA 8비트, sRGB, 알파 곱함)과 배율 지도(화소마다 `gainStride`바이트, 첫 바이트를 읽는다) → 선형 RGBA(알파 곱함).
  /// 화소 수는 `out.count / 4`
  public static func combine(
    rgba: UnsafePointer<UInt8>, gain: UnsafePointer<UInt8>, gainStride: Int, out: UnsafeMutableBufferPointer<Float>
  ) {
    let lut = toLinear
    lut.withUnsafeBufferPointer { lin in
      for p in 0..<(out.count / 4) {
        let i = p * 4
        let a = rgba[i + 3]
        guard a > 0 else {
          out[i] = 0
          out[i + 1] = 0
          out[i + 2] = 0
          out[i + 3] = 0
          continue
        }
        let k = Self.gain(gain[p * gainStride])
        let af = Float(a) / 255
        for c in 0..<3 {
          // 알파를 풀어 sRGB 값으로 되돌린 뒤 선형으로 펴고 배율을 곱해 다시 알파를 곱한다
          let v = a == 255 ? Int(rgba[i + c]) : min(255, (Int(rgba[i + c]) * 255 + Int(a) / 2) / Int(a))
          out[i + c] = lin[v] * k * af
        }
        out[i + 3] = af
      }
    }
  }

  /// 색 그림(SDR)에 같은 크기 배율 지도를 곱한 HDR 그림: 선형 sRGB 확장 범위, 반 정밀도 실수, 흰색의 `headroom`배까지
  /// (`CGImageCreateWithContentHeadroom`). 크기가 다르거나 만들지 못하면 nil(그때는 SDR 그대로 쓴다)
  public static func image(color: CGImage, gain: CGImage) -> CGImage? {
    let w = color.width
    let h = color.height
    guard gain.width == w, gain.height == h, let srgb = CGColorSpace(name: CGColorSpace.sRGB),
      let ext = CGColorSpace(name: CGColorSpace.extendedLinearSRGB)
    else { return nil }
    let rgba = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
    guard
      let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: srgb, bitmapInfo: rgba),
      let g = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: srgb, bitmapInfo: rgba)
    else { return nil }
    let r = CGRect(x: 0, y: 0, width: w, height: h)
    c.draw(color, in: r)
    g.setFillColor(CGColor(gray: 0, alpha: 1))
    g.fill(r)
    g.draw(gain, in: r)
    guard let cd = c.data, let gd = g.data else { return nil }
    var lin = [Float](repeating: 0, count: w * h * 4)
    lin.withUnsafeMutableBufferPointer { out in
      combine(rgba: cd.assumingMemoryBound(to: UInt8.self), gain: gd.assumingMemoryBound(to: UInt8.self), gainStride: 4, out: out)
    }
    // 반 정밀도로(x86_64에는 Float16 꼴이 없어 vImage로 바꾼다)
    var half = Data(count: w * h * 8)
    let ok = lin.withUnsafeMutableBytes { src in
      half.withUnsafeMutableBytes { dst in
        var s = vImage_Buffer(data: src.baseAddress, height: vImagePixelCount(h), width: vImagePixelCount(w * 4), rowBytes: w * 16)
        var d = vImage_Buffer(data: dst.baseAddress, height: vImagePixelCount(h), width: vImagePixelCount(w * 4), rowBytes: w * 8)
        return vImageConvert_PlanarFtoPlanar16F(&s, &d, vImage_Flags(kvImageNoFlags)) == kvImageNoError
      }
    }
    guard ok, let provider = CGDataProvider(data: half as CFData) else { return nil }
    let info = CGBitmapInfo(
      rawValue: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.floatComponents.rawValue
        | CGBitmapInfo.byteOrder16Little.rawValue)
    return CGImage(
      headroom: headroom, width: w, height: h, bitsPerComponent: 16, bitsPerPixel: 64, bytesPerRow: w * 8,
      space: ext, bitmapInfo: info, provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
  }

  /// 시험용: 배열로
  public static func combine(rgba: [UInt8], gain: [UInt8], gainStride: Int = 1) -> [Float] {
    var out = [Float](repeating: 0, count: rgba.count)
    rgba.withUnsafeBufferPointer { c in
      gain.withUnsafeBufferPointer { g in
        out.withUnsafeMutableBufferPointer { o in
          combine(rgba: c.baseAddress!, gain: g.baseAddress!, gainStride: gainStride, out: o)
        }
      }
    }
    return out
  }
}
