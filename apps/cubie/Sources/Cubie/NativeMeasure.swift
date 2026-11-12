import AppKit

/// 네이티브 화면의 재기 모드(`CUBIE_MEASURE=1`, `scripts/measure-memory.sh --native`). 웹 쪽 `Measure`와 같은 표준 입력 명령을
/// 받는다. 창은 `FloatingWindow`가 화면 밖에 투명하게 두고, 저장소는 메모리에만 둔다(사용자 기록에 손대지 않는다).
///
/// 명령: `focus 1|0` · `scramble` · `mirror 1|0` · `size <n>` · `side <pt>` · `turns <개수>`(0.12초마다 손가락 자리 키) ·
/// `show` · `hide` · `keys load|drop`(단축키 표) · `records open|close`(기록 창: 사이트 창, 화면 밖) · `state` · `quit`
@MainActor
final class NativeMeasure {
  private let cube: NativeCubeWindow
  private var turnTimer: Timer?
  /// 단축키 표·기록 창(재기 전용, 화면 밖)
  var openKeys: (() -> Void)?
  var dropKeys: (() -> Void)?
  var openRecords: (() -> Void)?
  var closeRecords: (() -> Void)?

  /// `Measure.turns`와 같은 손가락 자리 키(두 손 배치) J F I E K D H G L S의 맥 키 코드
  static let fingerKeys: [UInt16] = [38, 3, 34, 14, 40, 2, 4, 5, 37, 1]

  init(cube: NativeCubeWindow) {
    self.cube = cube
    let input = FileHandle.standardInput
    input.readabilityHandler = { [weak self] h in
      let data = h.availableData
      if data.isEmpty {
        h.readabilityHandler = nil
        Task { @MainActor in NSApp.terminate(nil) }
        return
      }
      let lines = String(decoding: data, as: UTF8.self).split(whereSeparator: \.isNewline).map(String.init)
      Task { @MainActor in
        for l in lines { self?.run(l) }
      }
    }
    cube.panel.orderFrontRegardless()
    log(
      "started pid=\(getpid()) side=\(Int(cube.panel.frame.width)) scale=\(cube.panel.backingScaleFactor) native=ca onscreen=\(Config.measureOnscreen)"
    )
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.report("ready") }
  }

  private func log(_ s: String) {
    print("[measure] \(s)")
    fflush(stdout)
  }

  private func report(_ why: String) {
    let v = cube.cube
    log(
      "\(why) web=0 native=ca n=\(v.n) layers=\(v.layerCount) turns=\(v.turnsStarted) moves=\(v.moveCount) solved=\(v.solved) solves=\(cube.solvedCount)"
    )
  }

  private func run(_ line: String) {
    let parts = line.split(separator: " ").map(String.init)
    guard let cmd = parts.first else { return }
    let arg = parts.count > 1 ? parts[1] : ""
    switch cmd {
    case "focus": cube.measureSetFocus(arg == "1")
    case "scramble": cube.measureScramble()
    case "mirror": cube.measureMirror(arg == "1")
    case "size": cube.measureSize(Int(arg) ?? 3)
    case "side":
      let side = CGFloat(Double(arg) ?? Double(Config.defaultSize.width))
      var f = cube.panel.frame
      f.size = NSSize(width: side, height: side)
      cube.panel.setFrame(f, display: true)
    case "turns":
      var left = Int(arg) ?? 20
      var i = 0
      turnTimer?.invalidate()
      let t = Timer(timeInterval: 0.12, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self else { return }
          guard left > 0 else {
            self.turnTimer?.invalidate()
            self.turnTimer = nil
            return
          }
          self.cube.measurePress(Self.fingerKeys[i % Self.fingerKeys.count])
          i += 1
          left -= 1
        }
      }
      RunLoop.main.add(t, forMode: .common)
      turnTimer = t
    case "show":
      cube.panel.orderFrontRegardless()
      cube.sendFocus()
    case "hide":
      cube.measureFocus = false
      cube.panel.orderOut(nil)
      cube.sendFocus()
    case "keys":
      if arg == "load" { openKeys?() } else { dropKeys?() }
    case "records":
      if arg == "open" { openRecords?() } else { closeRecords?() }
    case "state": report("state")
    case "quit": NSApp.terminate(nil)
    default: log("unknown command: \(line)")
    }
  }
}
