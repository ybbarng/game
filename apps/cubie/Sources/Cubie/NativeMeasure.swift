import AppKit

/// 재기 모드(`CUBIE_MEASURE=1`, `scripts/measure-memory.sh`). 표준 입력 한 줄 명령을 받는다. 창은 `FloatingWindow`가 화면 밖에 투명하게 두고, 저장소는 메모리에만 둔다(사용자 기록에 손대지 않는다).
///
/// 명령: `focus 1|0` · `scramble` · `mirror 1|0` · `size <n>` · `side <pt>` · `turns <개수>`(0.12초마다 손가락 자리 키) ·
/// `show` · `hide` · `keys load|drop`(단축키 표) · `records|tiers|settings open|close`(기록 창·티어표·설정 창, 화면 밖) ·
/// `replay open`(기록 창에서 한 판 다시 보기, 판이 없으면 메모리 저장소에 하나 더함) · `practice start|stop`(공식 연습 첫 단계) ·
/// `hero start|stop`(홈 시연) · `editor open|close`(「사용자」 배치로 두고 설정 창의 키 배치 편집기) ·
/// `pick <0~9>`(티어표 사다리 칸 누르기) · `place tiers <화면 번호|off>`(티어표 창을 그 화면에 거의 투명하게, HDR 판정 확인) · `showcase hidden|shown`(진열을 가려진 창처럼) · `profile open|close`(메뉴 프로필 칸 흔들기) ·
/// `state` · `quit`
@MainActor
final class NativeMeasure {
  private let cube: NativeCubeWindow
  private var turnTimer: Timer?
  /// 단축키 표·기록 창(재기 전용, 화면 밖)
  var openKeys: (() -> Void)?
  var dropKeys: (() -> Void)?
  /// 보통 창(이름 records·tiers·settings) 열기·닫기
  var window: ((String, Bool) -> Void)?
  /// 티어표 사다리 칸 누르기
  var pickTier: ((Int) -> Void)?
  /// 티어표 창을 화면 번호로 옮기고 창 화면·HDR 여부를 돌려준다
  var placeTiers: ((String) -> String)?
  private var profileWindow: NSWindow?

  /// `turns`가 돌아가며 누르는 손가락 자리 키(두 손 배치) J F I E K D H G L S의 맥 키 코드
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
    case "practice":
      // 공식 연습: 메뉴 첫 단계(따라 치기). `practice stop`이면 끝내기
      if arg == "stop" {
        cube.send(.practice(stage: nil, see: false))
      } else if let first = cube.state.practiceStages.first {
        cube.send(.practice(stage: first.id, see: false))
      }
    case "hero":
      // 홈 시연(떠 있을 때 다시 볼 판이 없으면 하는 것)을 바로 시작·멈춤
      cube.measureHero(arg == "start")
    case "records", "tiers", "settings", "replay", "editor":
      window?(cmd, arg == "open")
    case "pick":
      if let t = Int(arg) { pickTier?(t) }
    case "place":
      // `place tiers <화면 번호|off>`: 바로 한 번, 화면 바뀜 알림이 돈 뒤 한 번 더 찍는다
      let where_ = parts.count > 2 ? parts[2] : "off"
      log("place now \(placeTiers?(where_) ?? "")")
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
        self?.log("place later \(self?.placeTiers?("stay") ?? "")")
      }
    case "showcase":
      // 티어표 진열·메뉴 칸을 창이 가려진 것처럼(멈추는지 CPU로 본다): `showcase hidden` · `showcase shown`
      ShowcaseMotion.hidden = arg == "hidden"
    case "profile":
      // 메뉴 프로필 칸을 화면 밖 창에 붙여 메뉴가 열린 동안처럼 흔든다
      if arg == "open" {
        // 재기 저장소는 기록이 없어 티어가 없다: 가장 무거운 챌린저 띠로 잰다
        var p = cube.profile
        if p.emblemTier == nil {
          p.emblemTier = "challenger"
          p.emblem = NativeCubeWindow.emblem("challenger")
        }
        let v = ProfileMenuView(profile: p) {}
        let w = NSWindow(contentRect: v.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        w.isReleasedWhenClosed = false
        w.setFrameOrigin(NSPoint(x: -30000, y: -30000))
        w.contentView = v
        w.orderFrontRegardless()
        profileWindow = w
        log("profile open swaying=\(v.swaying)")
      } else {
        profileWindow?.contentView = nil
        profileWindow?.close()
        profileWindow = nil
      }
    case "state": report("state")
    case "quit": NSApp.terminate(nil)
    default: log("unknown command: \(line)")
    }
  }
}
