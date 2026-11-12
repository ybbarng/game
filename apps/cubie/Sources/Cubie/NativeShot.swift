import AppKit
import CubieNativeC
import ImageIO
import Metal
import QuartzCore
import UniformTypeIdentifiers

/// 네이티브 화면 스크린샷(docs/52 5-5): `CUBIE_NATIVE_SHOT=<폴더> Cubie`. 창을 띄우지 않고 층 트리를
/// `CARenderer`로 Metal 텍스처에 그려 투명 바탕 PNG로 쓴 뒤 끝난다(`layer.render(in:)`은 3D 변환을 납작하게 그려 쓰지 않는다).
/// 창 96pt·배율 2. 결과: native-solved·native-scrambled·native-mirror(포커스 있고 섞인 큐브)·native-turning(R을 돌리는
/// 중간). `scripts/native-compare.mjs <폴더>`가 웹 그림과 바탕 넷 위에 나란히 얹는다.
/// 재기·확인용이라 사용자 앱 흐름에서는 쓰지 않는다. 이 모드에서만 이 프로세스가 GPU로 그린다.
@MainActor
enum NativeShot {
  static func run(dir: String, n: Int) -> Int32 {
    // 말풍선 패널(NSPanel)을 만들려면 앱 객체가 있어야 한다(창은 띄우지 않는다)
    _ = NSApplication.shared
    guard let device = MTLCreateSystemDefaultDevice(), let queue = device.makeCommandQueue() else {
      print("[shot] Metal 장치가 없다")
      return 1
    }
    let side: CGFloat = 96
    let scale: CGFloat = 2
    let px = Int(side * scale)
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)

    func shoot(_ name: String, after: Double, setup: (CACubeView) -> Void) -> Bool {
      let view = CACubeView(frame: NSRect(x: 0, y: 0, width: side, height: side), n: n)
      view.buildForShot()
      setup(view)
      guard let cubeLayer = view.layer else { return false }
      let container = CALayer()
      container.bounds = CGRect(x: 0, y: 0, width: px, height: px)
      container.position = CGPoint(x: CGFloat(px) / 2, y: CGFloat(px) / 2)
      cubeLayer.removeFromSuperlayer()
      // 보기 층(NSView 뒷받침 층)은 기준점이 왼쪽 아래(0, 0)다
      cubeLayer.anchorPoint = .zero
      cubeLayer.position = .zero
      cubeLayer.transform = CATransform3DMakeScale(scale, scale, 1)
      container.addSublayer(cubeLayer)
      CATransaction.flush()

      let desc = MTLTextureDescriptor.texture2DDescriptor(
        pixelFormat: .bgra8Unorm, width: px, height: px, mipmapped: false)
      desc.usage = [.renderTarget, .shaderRead]
      desc.storageMode = .shared
      guard let tex = device.makeTexture(descriptor: desc) else { return false }
      let renderer = CARenderer(mtlTexture: tex, options: [kCARendererMetalCommandQueue as String: queue])
      renderer.layer = container
      renderer.bounds = container.bounds
      // 렌더러에 붙인 뒤 한 번 더 커밋해야 그릴 곳(updateBounds)이 생긴다
      CATransaction.begin()
      container.opacity = 1
      CATransaction.commit()
      CATransaction.flush()
      renderer.beginFrame(atTime: CACurrentMediaTime() + after, timeStamp: nil)
      renderer.addUpdate(renderer.bounds)
      renderer.render()
      renderer.endFrame()
      let done = queue.makeCommandBuffer()
      done?.commit()
      done?.waitUntilCompleted()

      var raw = [UInt8](repeating: 0, count: px * px * 4)
      tex.getBytes(&raw, bytesPerRow: px * 4, from: MTLRegionMake2D(0, 0, px, px), mipmapLevel: 0)
      // 텍스처 첫 줄이 층 좌표의 아래(y 위)라 위아래를 뒤집는다
      var bytes = [UInt8](repeating: 0, count: px * px * 4)
      for y in 0..<px {
        let src = (px - 1 - y) * px * 4
        bytes.replaceSubrange(y * px * 4..<(y + 1) * px * 4, with: raw[src..<src + px * 4])
      }
      guard
        let ctx = CGContext(
          data: &bytes, width: px, height: px, bitsPerComponent: 8, bytesPerRow: px * 4,
          space: CGColorSpace(name: CGColorSpace.sRGB)!,
          bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue),
        let image = ctx.makeImage()
      else { return false }
      let url = URL(fileURLWithPath: dir).appendingPathComponent("\(name).png")
      guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)
      else { return false }
      CGImageDestinationAddImage(dest, image, nil)
      let ok = CGImageDestinationFinalize(dest)
      print("[shot] \(url.path) layers=\(view.layerCount)")
      return ok
    }

    /// 2D 화면(말풍선·단축키 표)을 PNG로(배율 2). 층으로 칠한 바탕·테두리까지 들게 층을 그린다
    func shoot2D(_ name: String, _ v: NSView) -> Bool {
      v.wantsLayer = true
      v.layoutSubtreeIfNeeded()
      v.display()
      guard
        let rep = NSBitmapImageRep(
          bitmapDataPlanes: nil, pixelsWide: Int(v.bounds.width * scale), pixelsHigh: Int(v.bounds.height * scale),
          bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
          bytesPerRow: 0, bitsPerPixel: 0),
        let layer = v.layer, let ctx = NSGraphicsContext(bitmapImageRep: rep)
      else { return false }
      rep.size = v.bounds.size
      let cg = ctx.cgContext
      // 바탕·테두리(층): 층 좌표(왼쪽 위 기준)로 뒤집고 배율을 건다
      cg.saveGState()
      cg.translateBy(x: 0, y: CGFloat(rep.pixelsHigh))
      cg.scaleBy(x: scale, y: -scale)
      layer.render(in: cg)
      cg.restoreGState()
      // 글(보기가 그리는 것)은 보기 그리기로 위에 얹는다
      cg.saveGState()
      cg.scaleBy(x: scale, y: scale)
      v.displayIgnoringOpacity(v.bounds, in: ctx)
      cg.restoreGState()
      let url = URL(fileURLWithPath: dir).appendingPathComponent("\(name).png")
      let ok = (try? rep.representation(using: .png, properties: [:])?.write(to: url)) != nil
      print("[shot] \(url.path)")
      return ok
    }

    var ok = true
    ok = shoot("native-solved", after: 1) { _ in } && ok
    ok = shoot("native-scrambled", after: 1) { $0.scramble(seed: 42, show: Int32(CUBIE_SHOW_INSTANT)) } && ok
    ok =
      shoot("native-mirror", after: 1) {
        $0.scramble(seed: 42, show: Int32(CUBIE_SHOW_INSTANT))
        $0.setMirror(true)
      } && ok
    // I = R(두 손 배치). 90ms 가운데쯤
    ok =
      shoot("native-turning", after: 0.04) {
        $0.scramble(seed: 42, show: Int32(CUBIE_SHOW_INSTANT))
        $0.press(keyCode: 34)
      } && ok
    // 거울 판이 돌리는 동안 따라 도는지: 거울 보임 + R 가운데쯤
    ok =
      shoot("native-mirror-turning", after: 0.045) {
        $0.scramble(seed: 42, show: Int32(CUBIE_SHOW_INSTANT))
        $0.setMirror(true)
        $0.press(keyCode: 34)
      } && ok
    // 다 맞춘 축하: 빛 고리가 퍼지고 시간 숫자가 보이는 순간(0.7초쯤)
    ok = shoot("native-cheer", after: 0.75) { $0.cheer(text: "12.34", best: true) } && ok

    // 힌트 말풍선: 3×3 섞기(F2L 전, 사람 해법의 다음 단계)와 마지막 층(코어가 쓰는 같은 판)
    let hintView = CACubeView(frame: NSRect(x: 0, y: 0, width: side, height: side), n: n)
    hintView.scramble(seed: 42, show: Int32(CUBIE_SHOW_INSTANT))
    let bubble = HintBubble()
    ok = shoot2D("native-hint", bubble.layoutForShot(lines: NativeCubeWindow.hintLines(game: hintView.game).lines)) && ok
    // 공식 연습 말풍선(메뉴 첫 단계 따라 치기, 한 수 친 뒤)
    let practiceView = CACubeView(frame: NSRect(x: 0, y: 0, width: side, height: side), n: 3)
    let first = NativeCore.string { cubie_practice_menu($0, $1) }.split(separator: "\n").first.map {
      String($0.split(separator: "\t")[0])
    } ?? ""
    if cubie_game_practice_start(practiceView.game, first, false, "", "", "", 7) {
      let lines = "Enter".withCString { a in NativeCore.string { cubie_game_practice_lines(practiceView.game, a, $0, $1) } }
      let parsed = lines.split(separator: "\n").map { NativeCubeWindow.bubbleLine(String($0)) }
      ok = shoot2D("native-practice", HintBubble().layoutForShot(lines: parsed)) && ok
    }
    // F1 단축키 표(두 손): 3×3(J 누름 빛남)과 7×7
    for (size, name) in [(3, "native-keys"), (7, "native-keys-7")] {
      let keys = NativeKeysView(frame: NSRect(origin: .zero, size: Config.keysPanelSize))
      keys.n = size
      keys.source = .of(game: hintView.game, n: size, preset: "twoHand")
      if size == 3 { keys.press("KeyJ") }
      ok = shoot2D(name, keys) && ok
    }
    fflush(stdout)
    return ok ? 0 : 1
  }
}
