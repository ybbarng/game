// 그리기 방식별 메모리 바닥 재기(docs/52 5-3). 사용자 화면·포커스를 건드리지 않는다: 활성화 정책 .prohibited,
// 창은 화면 밖(-30000) 또는 화면 안이라도 알파 0~0.01·마우스 통과. 스스로 footprint를 읽어 찍는다.
//
//   swiftc -O -swift-version 5 -o /tmp/memlab apps/cubie/scripts/lab/memlab.swift
//   /tmp/memlab <모드> [창: none|off|on0|on1] [활동 초, 기본 15] [fps, 기본 60]
// 모드: tri(맨 Metal 삼각형 렌더 패스) · empty(빈 렌더 패스) · compute(빈 컴퓨트) · cb(빈 명령 버퍼)
//       · ca3d(Core Animation 3D 큐브, 0.12초마다 한 층 90ms 돌리기) · cpu(CoreGraphics로 그려 층 내용으로) · idle
// 창: none 창 없이 텍스처 · off 화면 밖 창 · on0 화면 안 알파 0 · on1 화면 안 알파 0.01(화면 왼쪽 아래 96pt)
// 환경: DRAWABLES=2|3(CAMetalLayer), SIZE=px(기본 192), MSAA=1|4, DEPTH=1(깊이 버퍼), QUEUE=<명령 큐 크기>,
//       CLOCK=1(ca3d에 0.1초마다 바뀌는 시간 글자)
// 찍는 값: total(phys_footprint) · gfx(IOAccelerator (graphics)) · iosurface · peak(phys_footprint_peak), MB
import AppKit
import Metal
import QuartzCore

func footprintLine() -> String {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: "/usr/bin/footprint")
  p.arguments = ["-p", String(getpid()), "-f", "bytes"]
  let pipe = Pipe()
  p.standardOutput = pipe
  p.standardError = Pipe()
  try? p.run()
  let data = pipe.fileHandleForReading.readDataToEndOfFile()
  p.waitUntilExit()
  let out = String(decoding: data, as: UTF8.self)
  var total = 0.0, peak = 0.0, gfx = 0.0, surf = 0.0
  for l in out.split(separator: "\n") {
    let f = l.split(separator: " ", omittingEmptySubsequences: true)
    if l.contains("phys_footprint_peak:"), f.count > 1 { peak = Double(f[1]) ?? 0 }
    else if l.contains("phys_footprint:"), f.count > 1 { total = Double(f[1]) ?? 0 }
    else if l.hasSuffix("IOAccelerator (graphics)"), let d = Double(f.first ?? "") { gfx += d }
    else if l.hasSuffix("IOSurface"), let d = Double(f.first ?? "") { surf += d }
  }
  let m = 1048576.0
  return String(format: "total %.1f  gfx %.1f  iosurface %.1f  peak %.1f", total / m, gfx / m, surf / m, peak / m)
}

func log(_ s: String) {
  print(s)
  fflush(stdout)
}

let args = CommandLine.arguments
let mode = args.count > 1 ? args[1] : "tri"
let win = args.count > 2 ? args[2] : "none"
let activeSeconds = args.count > 3 ? Double(args[3]) ?? 15 : 15
let fps = args.count > 4 ? Double(args[4]) ?? 60 : 60
let env = ProcessInfo.processInfo.environment
let size = Int(env["SIZE"] ?? "192") ?? 192
let msaa = Int(env["MSAA"] ?? "1") ?? 1

let msl = """
  #include <metal_stdlib>
  using namespace metal;
  struct VOut { float4 pos [[position]]; float4 color; };
  vertex VOut vs(uint vid [[vertex_id]], constant float &t [[buffer(0)]]) {
    float a = t + float(vid) * 2.0944;
    VOut o; o.pos = float4(0.6 * cos(a), 0.6 * sin(a), 0, 1);
    o.color = float4(float(vid == 0), float(vid == 1), float(vid == 2), 1); return o;
  }
  fragment float4 fs(VOut i [[stage_in]]) { return i.color; }
  kernel void nothing(uint i [[thread_position_in_grid]]) {}
  """

@MainActor
final class Lab: NSObject, NSApplicationDelegate {
  var device: MTLDevice!
  var queue: MTLCommandQueue!
  var pipeline: MTLRenderPipelineState?
  var computePipe: MTLComputePipelineState?
  var target: MTLTexture?
  var msaaTex: MTLTexture?
  var depthTex: MTLTexture?
  var window: NSWindow?
  var metalLayer: CAMetalLayer?
  var timer: Timer?
  var t: Float = 0
  var frames = 0
  // ca3d
  var caRoot: CATransformLayer?
  var cubies: [CATransformLayer] = []
  var turnIndex = 0

  func applicationDidFinishLaunching(_ n: Notification) {
    log("시작 \(footprintLine())")
    if mode == "ca3d" { setupCA() } else if mode == "cpu" { setupCPU() } else if mode != "idle" { setupMetal() }
    log("준비 \(footprintLine())")
    if let w = window { log("창 occlusion visible=\(w.occlusionState.contains(.visible)) frame=\(w.frame)") }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.measureIdleThenRun() }
  }

  func makeWindow() -> NSWindow? {
    if win == "none" { return nil }
    let side = CGFloat(size) / 2
    var origin = NSPoint(x: -30000, y: -30000)
    if win.hasPrefix("on"), let s = NSScreen.screens.first?.visibleFrame {
      origin = NSPoint(x: s.minX, y: s.minY)
    }
    let w = NSPanel(
      contentRect: NSRect(origin: origin, size: NSSize(width: side, height: side)),
      styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    w.isOpaque = false
    w.backgroundColor = .clear
    w.hasShadow = false
    w.ignoresMouseEvents = true
    w.alphaValue = win == "on1" ? 0.01 : 0
    w.level = .floating
    w.collectionBehavior = [.transient, .ignoresCycle, .canJoinAllSpaces]
    w.isReleasedWhenClosed = false
    return w
  }

  func setupMetal() {
    device = MTLCreateSystemDefaultDevice()
    queue = env["QUEUE"].flatMap { Int($0) }.map { device.makeCommandQueue(maxCommandBufferCount: $0)! } ?? device.makeCommandQueue()
    let lib = try! device.makeLibrary(source: msl, options: nil)
    let d = MTLRenderPipelineDescriptor()
    d.vertexFunction = lib.makeFunction(name: "vs")
    d.fragmentFunction = lib.makeFunction(name: "fs")
    d.colorAttachments[0].pixelFormat = .bgra8Unorm
    d.rasterSampleCount = msaa
    if env["DEPTH"] != nil {
      d.depthAttachmentPixelFormat = .depth32Float
      let t = MTLTextureDescriptor.texture2DDescriptor(
        pixelFormat: .depth32Float, width: size, height: size, mipmapped: false)
      t.textureType = msaa > 1 ? .type2DMultisample : .type2D
      t.sampleCount = msaa
      t.usage = .renderTarget
      t.storageMode = .private
      depthTex = device.makeTexture(descriptor: t)
    }
    pipeline = try! device.makeRenderPipelineState(descriptor: d)
    computePipe = try! device.makeComputePipelineState(function: lib.makeFunction(name: "nothing")!)
    if msaa > 1 {
      let md = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: size, height: size, mipmapped: false)
      md.textureType = .type2DMultisample
      md.sampleCount = msaa
      md.usage = .renderTarget
      md.storageMode = .private
      msaaTex = device.makeTexture(descriptor: md)
    }
    if let w = makeWindow() {
      let v = NSView(frame: NSRect(x: 0, y: 0, width: w.frame.width, height: w.frame.height))
      let l = CAMetalLayer()
      l.device = device
      l.pixelFormat = .bgra8Unorm
      l.isOpaque = false
      l.framebufferOnly = true
      l.drawableSize = CGSize(width: size, height: size)
      if let n = Int(env["DRAWABLES"] ?? "") { l.maximumDrawableCount = n }
      v.layer = l
      v.wantsLayer = true
      w.contentView = v
      w.orderFrontRegardless()
      window = w
      metalLayer = l
      log("drawables=\(l.maximumDrawableCount)")
    } else {
      let td = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: size, height: size, mipmapped: false)
      td.usage = .renderTarget
      td.storageMode = .private
      target = device.makeTexture(descriptor: td)
    }
  }

  func step() {
    frames += 1
    t += 0.05
    switch mode {
    case "cb":
      let cb = queue.makeCommandBuffer()!
      cb.commit()
    case "compute":
      let cb = queue.makeCommandBuffer()!
      let e = cb.makeComputeCommandEncoder()!
      e.setComputePipelineState(computePipe!)
      e.dispatchThreads(MTLSize(width: 1, height: 1, depth: 1), threadsPerThreadgroup: MTLSize(width: 1, height: 1, depth: 1))
      e.endEncoding()
      cb.commit()
    case "ca3d":
      turnCA()
    case "cpu":
      drawCPU()
    default:
      let cb = queue.makeCommandBuffer()!
      var drawable: CAMetalDrawable?
      let tex: MTLTexture
      if let l = metalLayer {
        guard let d = l.nextDrawable() else { cb.commit(); return }
        drawable = d
        tex = d.texture
      } else {
        tex = target!
      }
      let rp = MTLRenderPassDescriptor()
      if let m = msaaTex {
        rp.colorAttachments[0].texture = m
        rp.colorAttachments[0].resolveTexture = tex
        rp.colorAttachments[0].storeAction = .multisampleResolve
      } else {
        rp.colorAttachments[0].texture = tex
        rp.colorAttachments[0].storeAction = .store
      }
      rp.colorAttachments[0].loadAction = .clear
      rp.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
      if let dt = depthTex { rp.depthAttachment.texture = dt; rp.depthAttachment.loadAction = .clear; rp.depthAttachment.storeAction = .dontCare }
      let e = cb.makeRenderCommandEncoder(descriptor: rp)!
      if mode == "tri" {
        e.setRenderPipelineState(pipeline!)
        e.setVertexBytes(&t, length: 4, index: 0)
        e.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
      }
      e.endEncoding()
      if let d = drawable { cb.present(d) }
      cb.commit()
    }
  }

  func measureIdleThenRun() {
    log("가만히 3초 \(footprintLine())")
    let start = CACurrentMediaTime()
    let interval = mode == "ca3d" ? 0.12 : 1.0 / fps
    if mode != "idle" {
      let tm = Timer(timeInterval: interval, repeats: true) { _ in MainActor.assumeIsolated { self.step() } }
      RunLoop.main.add(tm, forMode: .common)
      timer = tm
    }
    var marks: [Double] = [2, 5, 10, activeSeconds].filter { $0 <= activeSeconds }
    marks = Array(Set(marks)).sorted()
    for m in marks {
      DispatchQueue.main.asyncAfter(deadline: .now() + m) {
        log(String(format: "도는 중 %4.0f초 (%d장) ", CACurrentMediaTime() - start, self.frames) + footprintLine())
        if m == activeSeconds {
          self.timer?.invalidate()
          self.timer = nil
          for s in [1.0, 3.0, 8.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + s) {
              log(String(format: "멈추고 %.0f초 ", s) + footprintLine())
              if s == 8 { NSApp.terminate(nil) }
            }
          }
        }
      }
    }
  }

  // ---- CPU로 그려 층 내용으로 ----
  var cpuLayer: CALayer?
  func setupCPU() {
    guard let w = makeWindow() else { log("cpu는 창이 필요하다"); exit(2) }
    let v = NSView(frame: NSRect(x: 0, y: 0, width: w.frame.width, height: w.frame.height))
    let l = CALayer()
    l.contentsScale = 2
    v.layer = l
    v.wantsLayer = true
    w.contentView = v
    w.orderFrontRegardless()
    window = w
    cpuLayer = l
  }
  func drawCPU() {
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: cs,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.clear(CGRect(x: 0, y: 0, width: size, height: size))
    for i in 0..<54 {
      let a = CGFloat(t) + CGFloat(i) * 0.3
      ctx.setFillColor(CGColor(red: CGFloat(i % 3) / 2, green: CGFloat(i % 5) / 4, blue: 0.5, alpha: 1))
      ctx.fillEllipse(in: CGRect(x: 96 + 60 * cos(a), y: 96 + 60 * sin(a), width: 14, height: 14))
    }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    cpuLayer?.contents = ctx.makeImage()
    CATransaction.commit()
  }

  // ---- Core Animation 3D 큐브 ----
  func setupCA() {
    guard let w = makeWindow() else {
      log("ca3d는 창이 필요하다(off|on0|on1)")
      exit(2)
    }
    let side = w.frame.width
    let host = NSView(frame: NSRect(x: 0, y: 0, width: side, height: side))
    host.wantsLayer = true
    let base = CALayer()
    base.frame = host.bounds
    host.layer = base
    let root = CATransformLayer()
    root.frame = base.bounds
    var persp = CATransform3DIdentity
    persp.m34 = -1.0 / 500
    base.sublayerTransform = persp
    root.transform = CATransform3DRotate(CATransform3DMakeRotation(-0.6, 1, 0, 0), 0.75, 0, 1, 0)
    base.addSublayer(root)
    let unit = side * 0.18
    let colors: [CGColor] = [
      NSColor.white.cgColor, NSColor.yellow.cgColor, NSColor.red.cgColor,
      NSColor.orange.cgColor, NSColor.green.cgColor, NSColor.blue.cgColor,
    ]
    let body = NSColor(white: 0.08, alpha: 1).cgColor
    for x in -1...1 {
      for y in -1...1 {
        for z in -1...1 where !(x == 0 && y == 0 && z == 0) {
          let c = CATransformLayer()
          c.frame = CGRect(x: side / 2 - unit / 2, y: side / 2 - unit / 2, width: unit, height: unit)
          c.transform = CATransform3DMakeTranslation(CGFloat(x) * unit, CGFloat(y) * unit, CGFloat(z) * unit)
          // 여섯 면: (축, 부호) → 몸통 판 + 바깥이면 스티커
          let faces: [(CATransform3D, Bool, Int)] = [
            (CATransform3DMakeTranslation(0, 0, unit / 2), z == 1, 2),
            (CATransform3DRotate(CATransform3DMakeTranslation(0, 0, -unit / 2), .pi, 0, 1, 0), z == -1, 3),
            (CATransform3DRotate(CATransform3DMakeTranslation(unit / 2, 0, 0), .pi / 2, 0, 1, 0), x == 1, 4),
            (CATransform3DRotate(CATransform3DMakeTranslation(-unit / 2, 0, 0), -.pi / 2, 0, 1, 0), x == -1, 5),
            (CATransform3DRotate(CATransform3DMakeTranslation(0, unit / 2, 0), -.pi / 2, 1, 0, 0), y == 1, 0),
            (CATransform3DRotate(CATransform3DMakeTranslation(0, -unit / 2, 0), .pi / 2, 1, 0, 0), y == -1, 1),
          ]
          for (tf, outer, color) in faces {
            let f = CALayer()
            f.bounds = CGRect(x: 0, y: 0, width: unit, height: unit)
            f.position = CGPoint(x: unit / 2, y: unit / 2)
            f.backgroundColor = body
            f.cornerRadius = unit * 0.12
            f.isDoubleSided = false
            f.transform = tf
            if outer {
              let s = CALayer()
              s.frame = f.bounds.insetBy(dx: unit * 0.08, dy: unit * 0.08)
              s.backgroundColor = colors[color]
              s.cornerRadius = unit * 0.1
              f.addSublayer(s)
            }
            c.addSublayer(f)
          }
          c.setValue([x, y, z], forKey: "slot")
          root.addSublayer(c)
          cubies.append(c)
        }
      }
    }
    w.contentView = host
    w.orderFrontRegardless()
    window = w
    caRoot = root
    // CLOCK=1: 0.1초마다 바뀌는 시간 글자(웹은 글자를 다시 그릴 때도 GPU 몫이 붙었다)
    if env["CLOCK"] != nil {
      let text = CATextLayer()
      text.frame = CGRect(x: 4, y: side - 16, width: 60, height: 14)
      text.fontSize = 11
      text.contentsScale = 2
      text.foregroundColor = NSColor.white.cgColor
      base.addSublayer(text)
      let start = CACurrentMediaTime()
      let tm = Timer(timeInterval: 0.1, repeats: true) { _ in
        MainActor.assumeIsolated {
          CATransaction.begin()
          CATransaction.setDisableActions(true)
          text.string = String(format: "%.1f", CACurrentMediaTime() - start)
          CATransaction.commit()
        }
      }
      RunLoop.main.add(tm, forMode: .common)
    }
  }

  /// 바깥층 하나(축 번갈아)를 90ms 동안 90도 돌린다: 그 층 조각을 묶음 층에 옮겨 묶음을 돌리고, 끝나면 각을 조각에 굳힌다
  func turnCA() {
    guard let root = caRoot else { return }
    let axis = turnIndex % 3
    turnIndex += 1
    let members = cubies.filter { c in
      let p = c.presentation() ?? c
      let m = p.transform
      let v = [m.m41, m.m42, m.m43][axis]
      return v > 1
    }
    let pivot = CATransformLayer()
    pivot.frame = root.bounds
    root.addSublayer(pivot)
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    for c in members {
      c.removeFromSuperlayer()
      pivot.addSublayer(c)
    }
    CATransaction.commit()
    let key = ["transform.rotation.x", "transform.rotation.y", "transform.rotation.z"][axis]
    CATransaction.begin()
    CATransaction.setCompletionBlock {
      MainActor.assumeIsolated {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let r = CATransform3DMakeRotation(.pi / 2, axis == 0 ? 1 : 0, axis == 1 ? 1 : 0, axis == 2 ? 1 : 0)
        for c in members {
          c.transform = CATransform3DConcat(c.transform, r)
          c.removeFromSuperlayer()
          root.addSublayer(c)
        }
        pivot.removeFromSuperlayer()
        CATransaction.commit()
      }
    }
    let a = CABasicAnimation(keyPath: key)
    a.fromValue = 0
    a.toValue = Double.pi / 2
    a.duration = 0.09
    a.fillMode = .forwards
    a.isRemovedOnCompletion = false
    pivot.add(a, forKey: "turn")
    CATransaction.commit()
  }
}

MainActor.assumeIsolated {
  let app = NSApplication.shared
  app.setActivationPolicy(.prohibited)
  let lab = Lab()
  app.delegate = lab
  app.run()
}
