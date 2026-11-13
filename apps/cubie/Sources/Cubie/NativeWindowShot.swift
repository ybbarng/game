import AppKit
import CubieCore
import ImageIO
import Metal
import QuartzCore
import UniformTypeIdentifiers

/// 네이티브 보통 창(기록·티어표·설정, docs/52 5-8)의 스크린샷: `CUBIE_WINDOW_SHOT=<폴더> CUBIE_WINDOW_SHOT_STORE=<JSON> Cubie`.
/// 창을 화면에 띄우지 않고(보이지 않는 창에 붙여 그리기만) PNG로 쓰고 끝난다. 저장소는 JSON 파일(키 → 글, 사이트 localStorage와
/// 같은 꼴)을 읽은 메모리 저장소라 사용자 기록을 읽지도 쓰지도 않는다. `scripts/window-compare.mjs`가 같은 저장소로 사이트
/// 화면을 WebKit으로 찍어 나란히 얹는다. 글·바탕은 층을 CoreGraphics로, 다시 보기 큐브(3D)는 `CARenderer`로 그려 얹는다
@MainActor
enum NativeWindowShot {
  static func run(dir: String) -> Int32 {
    _ = NSApplication.shared
    NSApp.appearance = NSAppearance(named: .darkAqua)
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    var values: [String: String] = [:]
    if let path = ProcessInfo.processInfo.environment["CUBIE_WINDOW_SHOT_STORE"],
      let data = FileManager.default.contents(atPath: path),
      let d = (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
    {
      values = d
    }
    let store = MemoryStore(values)
    let book = MiniBook(store: store, math: RustTierMath())
    let settings = CubeSettings.parse(store.string(CubeSettings.key))
    var ok = true

    let records = NativeRecordsWindow(book: book) { settings }
    ok = shoot(records.window, name: "native-records", dir: dir) && ok
    if let first = book.records(book.n).first(where: RecordsSheet.canReplay) {
      records.watch(first)
      ok = shoot(records.window, name: "native-records-replay", dir: dir) && ok
    }
    let tiers = NativeTiersWindow(store: store, math: RustTierMath(), n: book.n)
    ok = shoot(tiers.window, name: "native-tiers", dir: dir, fullHeight: true) && ok
    let settingsWindow = NativeSettingsWindow(store: store, onChange: {}, openWeb: {})
    ok = shoot(settingsWindow.window, name: "native-settings", dir: dir, fullHeight: true) && ok
    for (name, look) in [("dark", NSAppearance.Name.darkAqua), ("light", .aqua)] {
      ok = shootProfiles(dir: dir, name: "native-profile-\(name)", appearance: NSAppearance(named: look)) && ok
    }
    fflush(stdout)
    return ok ? 0 : 1
  }

  /// 메뉴 막대 메뉴 맨 위 프로필 칸(`ProfileMenuView`)을 열 티어 모두 한 장에(메뉴 바탕 위, 배율 2). 엠블럼은 앱에 묶은 그림
  static func shootProfiles(dir: String, name: String, appearance: NSAppearance?) -> Bool {
    let rows = TierInfo.ids.enumerated().reversed().map { i, id in
      ProfileMenuView(
        profile: Profile(
          name: "익명 큐버 #1234", tierText: "3×3 \(TierSheet.labels[i])", emblem: NativeCubeWindow.emblem(id)),
        onPick: {})
    }
    let w = rows.map(\.frame.width).max() ?? 240
    let h = ProfileMenuView.height * CGFloat(rows.count)
    let box = FlippedView(frame: NSRect(x: 0, y: 0, width: w, height: h))
    box.appearance = appearance
    box.fill = .windowBackgroundColor
    for (i, r) in rows.enumerated() {
      r.frame = NSRect(x: 0, y: CGFloat(i) * ProfileMenuView.height, width: w, height: ProfileMenuView.height)
      box.addSubview(r)
    }
    let window = NSWindow(contentRect: box.frame, styleMask: [.borderless], backing: .buffered, defer: true)
    window.appearance = appearance
    window.contentView = box
    return shoot(window, name: name, dir: dir)
  }


  /// 창 내용을 PNG로(배율 2). `fullHeight`면 굴리는 내용 전체 높이로
  static func shoot(_ window: NSWindow, name: String, dir: String, fullHeight: Bool = false) -> Bool {
    guard var view = window.contentView else { return false }
    if fullHeight, let scroll = view as? NSScrollView, let doc = scroll.documentView {
      doc.layoutSubtreeIfNeeded()
      view = doc
      // 문서 높이를 다시 셈한 뒤 한 번 더 배치한다
      doc.needsLayout = true
      doc.layoutSubtreeIfNeeded()
    }
    view.layoutSubtreeIfNeeded()
    view.displayIfNeeded()
    let scale: CGFloat = 2
    let size = view.bounds.size
    let px = (w: Int(size.width * scale), h: Int(size.height * scale))
    guard
      let ctx = CGContext(
        data: nil, width: px.w, height: px.h, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
    else { return false }
    // 3D 큐브는 따로 그려 얹는다(층 그리기는 3D를 납작하게 그린다)
    let cubes = allSubviews(view).compactMap { $0 as? CACubeView }.filter { !$0.isHiddenOrHasHiddenAncestor }
    for c in cubes { c.isHidden = true }
    view.display()
    // AppKit이 창에 그리는 길(층 바탕·테두리와 글 모두)로 비트맵에 그린다
    guard
      let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: px.w, pixelsHigh: px.h, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
        isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
    else { return false }
    rep.size = size
    view.cacheDisplay(in: view.bounds, to: rep)
    if let flat = rep.cgImage { ctx.draw(flat, in: CGRect(x: 0, y: 0, width: px.w, height: px.h)) }
    for c in cubes {
      c.isHidden = false
      c.layer?.isHidden = false
      c.layoutSubtreeIfNeeded()
      if ProcessInfo.processInfo.environment["CUBIE_DEBUG"] != nil {
        print("[shot] cube bounds=\(c.bounds) layers=\(c.layerCount)")
      }
      let target = (c.superview as? ReplayBoxView)?.shotCube() ?? (c.superview as? SettingsPageView)?.shotCube() ?? c
      guard let img = render3D(target, scale: scale) else { continue }
      // 창 좌표(아래가 0)로 옮긴다
      let r = c.convert(c.bounds, to: view)
      let y = view.isFlipped ? size.height - r.maxY : r.minY
      ctx.draw(img, in: CGRect(x: r.minX * scale, y: y * scale, width: r.width * scale, height: r.height * scale))
    }
    guard let image = ctx.makeImage() else { return false }
    let url = URL(fileURLWithPath: dir).appendingPathComponent("\(name).png")
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
      return false
    }
    CGImageDestinationAddImage(dest, image, nil)
    let ok = CGImageDestinationFinalize(dest)
    print("[shot] \(url.path)")
    return ok
  }

  static func allSubviews(_ v: NSView) -> [NSView] { v.subviews + v.subviews.flatMap(allSubviews) }

  /// 큐브 층 트리를 Metal 텍스처에 그린다(`NativeShot`과 같은 방법). 그린 뒤 그 층은 창에서 떨어진다(스크린샷 끝에만 부른다)
  static func render3D(_ view: CACubeView, scale: CGFloat) -> CGImage? {
    guard let device = MTLCreateSystemDefaultDevice(), let queue = device.makeCommandQueue(), let cubeLayer = view.layer
    else { return nil }
    let w = Int(view.bounds.width * scale)
    let h = Int(view.bounds.height * scale)
    guard w > 0, h > 0 else { return nil }
    let container = CALayer()
    container.bounds = CGRect(x: 0, y: 0, width: w, height: h)
    container.position = CGPoint(x: CGFloat(w) / 2, y: CGFloat(h) / 2)
    cubeLayer.removeFromSuperlayer()
    cubeLayer.anchorPoint = .zero
    cubeLayer.position = .zero
    cubeLayer.transform = CATransform3DMakeScale(scale, scale, 1)
    container.addSublayer(cubeLayer)
    CATransaction.flush()
    let desc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: w, height: h, mipmapped: false)
    desc.usage = [.renderTarget, .shaderRead]
    desc.storageMode = .shared
    guard let tex = device.makeTexture(descriptor: desc) else { return nil }
    let renderer = CARenderer(mtlTexture: tex, options: [kCARendererMetalCommandQueue as String: queue])
    renderer.layer = container
    renderer.bounds = container.bounds
    CATransaction.begin()
    container.opacity = 1
    CATransaction.commit()
    CATransaction.flush()
    renderer.beginFrame(atTime: CACurrentMediaTime() + 1, timeStamp: nil)
    renderer.addUpdate(renderer.bounds)
    renderer.render()
    renderer.endFrame()
    let done = queue.makeCommandBuffer()
    done?.commit()
    done?.waitUntilCompleted()
    var raw = [UInt8](repeating: 0, count: w * h * 4)
    tex.getBytes(&raw, bytesPerRow: w * 4, from: MTLRegionMake2D(0, 0, w, h), mipmapLevel: 0)
    // 텍스처 첫 줄이 층 좌표의 아래다. CGImage는 첫 줄이 위라 뒤집는다
    var bytes = [UInt8](repeating: 0, count: w * h * 4)
    for y in 0..<h {
      let src = (h - 1 - y) * w * 4
      bytes.replaceSubrange(y * w * 4..<(y + 1) * w * 4, with: raw[src..<src + w * 4])
    }
    return bytes.withUnsafeMutableBytes { p in
      CGContext(
        data: p.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)?.makeImage()
    }
  }
}
