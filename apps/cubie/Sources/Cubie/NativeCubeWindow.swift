import AppKit
import CubieCore
import CubieNativeC

/// 네이티브 큐브 화면(기본, docs/52 5-6): 웹 미니 모드(`apps/web/src/cube/mini/MiniCubeApp.tsx`)가 하던 일을 앱이 한다.
/// - 그리기: `CACubeView`(Core Animation 3D), 큐브 상태·키 해석·섞기·판정·티어: Rust 코어(C ABI)
/// - 시간(포커스 있을 때만)·기록(사이트와 같은 JSON 꼴, `MiniBook`)·힌트 제한·떠 있을 때 움직임·축하·소리
/// - 기록 창·티어표·설정은 사이트 창(앱 안 보통 창)이 그대로 맡고, 앱 저장소의 글을 그 창에 넣어 준다(`AppDelegate`)
@MainActor
final class NativeCubeWindow: FloatingWindow, CubeSurface {
  private(set) var cube: CACubeView
  let store: KeyValueStore
  let book: MiniBook
  private(set) var settings = CubeSettings()
  private(set) var keymap = StoredKeymap()
  private(set) var state = CubeState()
  private(set) var profile = Profile.placeholder
  private let realClock = RealClock()
  private let clock: FocusClock
  private var hintGate: HintGate!
  private let sound = CubieSound()
  private var idle: IdleShow!
  private var idleTurn = 0
  /// 이번 판의 입력 방식(사이트 `inputs`, 처음 쓴 차례)과 키 출처(`keyOrigin`)
  private var inputs: [String] = []
  private var origins: Set<String> = []
  /// 앱이 키마다 바로 앞에 알린 출처(다음 키 하나가 꺼내 쓴다)
  private var pendingOrigin: String?
  private var peekKey: UInt16?
  private var hintMsgCancel: (() -> Void)?
  private var mirrorRecheck: (() -> Void)?

  var onReady: (() -> Void)?
  var onState: (() -> Void)?
  var onHint: (([[String: Any]]?) -> Void)?
  var onPressed: ((String) -> Void)?
  var menuProvider: (() -> NSMenu)?
  /// 단축키 표가 떠 있는가(떠 있는 동안 누른 키를 알린다)
  private var keysPanelOpen = false
  /// 기록을 남겼다(열린 기록 창에 넣는다)
  var onRecorded: (() -> Void)?
  /// 다 맞춘 판(확인·재기용)
  private(set) var solvedCount = 0

  /// 동작 줄이기(시스템 설정)
  var reducedMotion: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

  override init() {
    // 재기는 사용자 기록·설정을 읽지도 쓰지도 않는다(늘 같은 처음 상태에서 잰다)
    store = Config.measure ? MemoryStore() : DefaultsStore()
    book = MiniBook(store: store, math: RustTierMath())
    clock = FocusClock(base: realClock)
    if !Config.measure {
      let r = WebStorageMigration.run(
        store: store, websiteData: WebStorageMigration.websiteData(), host: Config.miniURL.host ?? "game.byb.kr")
      if Config.debug { print("[cubie] migrate \(r)"); fflush(stdout) }
    }
    let n = book.n
    cube = CACubeView(frame: NSRect(origin: .zero, size: Config.defaultSize), n: n)
    super.init()
    hintGate = HintGate(clock: realClock) { [weak self] in
      guard let self, !self.hintGate.showing, self.hintMsgCancel == nil else { return }
      self.onHint?(nil)
    }
    idle = IdleShow(clock: realClock, hooks: idleHooks())
    state.n = n
    state.mirror = book.mirror
    readSettings()
    install(cube)
    refreshProfile()
    NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in MainActor.assumeIsolated { self?.applySettings() } }
  }

  // MARK: 화면 만들기

  private func install(_ view: CACubeView) {
    view.frame = host.bounds
    view.autoresizingMask = [.width, .height]
    host.subviews.forEach { $0.removeFromSuperview() }
    host.addSubview(view)
    view.onKeyDown = { [weak self] e in self?.keyDown(e) ?? false }
    view.onKeyUp = { [weak self] e in self?.keyUp(e) }
    view.onLayout = { [weak self] in self?.sendHit() }
    applySettings()
    if panel.isKeyWindow { panel.makeFirstResponder(view) }
    sendHit()
  }

  private func sendHit() {
    hitRects = cube.hitRects
  }

  /// 앱 저장소의 설정·키 배치를 읽는다(설정 창을 닫은 뒤에도)
  private func readSettings() {
    settings = CubeSettings.parse(store.string(CubeSettings.key))
    keymap = StoredKeymap.parse(store.string(StoredKeymap.key))
    state.scrambleKey = keymap.scrambleKey.flatMap {
      MenuKey.fromWeb(code: $0.code, shift: $0.shift, alt: $0.alt, ctrl: $0.ctrl)
    }
  }

  private func applySettings() {
    cube.reducedMotion = reducedMotion
    cube.setColors(settings.colors)
    cube.setMoveMs(settings.moveMs)
    cube.setScrambleShow(scrambleShow)
    sound.enabled = settings.sound
    if cube.stickerless != settings.stickerless {
      cube.stickerless = settings.stickerless
      cube.rebuild()
    }
    applyKeymap()
  }

  private func applyKeymap() {
    let codes = keymap.bindings.map { strdup($0.code) }
    let actions = keymap.bindings.map { strdup($0.action) }
    defer {
      codes.forEach { free($0) }
      actions.forEach { free($0) }
    }
    let mods = keymap.bindings.map(\.mods)
    let ok = keymap.preset.withCString { preset in
      codes.map { UnsafePointer($0) }.withUnsafeBufferPointer { cp in
        actions.map { UnsafePointer($0) }.withUnsafeBufferPointer { ap in
          mods.withUnsafeBufferPointer { mp in
            cubie_game_set_keymap(cube.game, preset, cp.baseAddress, mp.baseAddress, ap.baseAddress, UInt32(cp.count))
          }
        }
      }
    }
    if !ok, Config.debug { print("[cubie] keymap rejected preset=\(keymap.preset)"); fflush(stdout) }
  }

  /// 크기를 바꾼다(새 한 판, 기록도 크기별). 맞추던 판은 버린다(사이트와 같다)
  private func setSize(_ n: Int) {
    guard MiniBook.sizes.contains(n) else { return }
    idle.reset()
    hintGate.reset()
    hideHint()
    cube = CACubeView(frame: host.bounds, n: n)
    install(cube)
    state.n = n
    book.savePrefs(n: n, mirror: state.mirror)
    refreshProfile()
    updateMirror()
    onState?()
  }

  // MARK: CubeSurface

  func send(_ command: CubeCommand) {
    switch command {
    case .scramble:
      scramble()
    case .toggleMirror:
      state.mirror.toggle()
      book.savePrefs(n: state.n, mirror: state.mirror)
      updateMirror()
      onState?()
    case .hint:
      requestHint()
    case .size(let n):
      setSize(n)
    case .practice:
      // 공식 연습은 코어 진행기를 옮긴 뒤(docs/52 5-6 남은 것). 지금은 메뉴에 단계가 없다
      break
    case .keysPanel(let open):
      keysPanelOpen = open
    }
  }

  func reload() {
    readSettings()
    applySettings()
    refreshProfile()
    onReady?()
  }

  func takeKeys() { panel.makeFirstResponder(cube) }
  func setPracticeSee(_ on: Bool) { state.practiceSee = on }

  func keyArriving(_ event: NSEvent) {
    let source = KeySource.of(event)
    if Config.debug, let f = KeySource.fields(event) {
      print("[cubie] key code=\(event.keyCode) repeat=\(event.isARepeat) source=\(source.rawValue) \(f)")
      fflush(stdout)
    }
    pendingOrigin = source == .keyboard ? "hardware" : "synthetic"
  }

  func sendFocus() {
    let f = focused
    clock.setFocused(f)
    idle.setActive(!f && visible && !reducedMotion)
    updateMirror()
    if Config.debug { dump("focus=\(f) visible=\(visible)") }
  }

  func dump(_ why: String) {
    print(
      "[cubie] \(why) native n=\(cube.n) solved=\(cube.solved) scrambled=\(cube.scrambled) moves=\(cube.moveCount) mirror=\(cube.mirrorShown) idle=\(idle.showing?.rawValue ?? "none") ignores=\(panel.ignoresMouseEvents)"
    )
    fflush(stdout)
  }

  override func becameKey() {
    panel.makeFirstResponder(cube)
    sendFocus()
  }

  override func resignedKey() { sendFocus() }
  override func occlusionChanged() { sendFocus() }

  // MARK: 키

  /// 큐브 화면이 받은 키. 먹었으면 true
  private func keyDown(_ e: NSEvent) -> Bool {
    let origin = pendingOrigin ?? "unknown"
    pendingOrigin = nil
    if keysPanelOpen, let code = WebKeyCode.of(e.keyCode), !e.isARepeat { onPressed?(code) }
    let mods = e.modifierFlags.intersection(.deviceIndependentFlagsMask).subtracting([.function, .numericPad, .capsLock])
    // 힌트 키 `\`(사용자 배치가 `\`를 쓰면 배치를 따른다, 사이트 `HINT_KEYS`)
    if e.keyCode == 42, mods.isEmpty, !keymap.usesBackslash {
      if !e.isARepeat { requestHint() }
      return true
    }
    // 떠 있을 때 연출 중이면 멈추고 장면을 되돌린 뒤 받는다
    idle.setActive(false)
    let seed = UInt32.random(in: 0...UInt32.max)
    cubie_game_set_now(cube.game, clock.now())
    let r = cube.press(keyCode: e.keyCode, flags: CACubeView.flags(e), seed: seed)
    switch r {
    case Int32(CUBIE_KEY_SCRAMBLED):
      startedScramble()
    case Int32(CUBIE_KEY_MOVED), Int32(CUBIE_KEY_SOLVED):
      moved(origin: origin)
    case Int32(CUBIE_KEY_PEEK_BACK):
      cube.setPeek(CACubeView.peekBack)
      peekKey = e.keyCode
    case Int32(CUBIE_KEY_PEEK_DOWN):
      cube.setPeek(CACubeView.peekDown)
      peekKey = e.keyCode
    case Int32(CUBIE_KEY_VIEW_HOME):
      cube.setPeek(nil)
    default:
      break
    }
    return r != Int32(CUBIE_KEY_IGNORED)
  }

  private func keyUp(_ e: NSEvent) {
    guard let k = peekKey, k == e.keyCode else { return }
    peekKey = nil
    cube.setPeek(nil)
  }

  /// 섞기(메뉴·재기). 섞기 연출은 설정을 따르고, 동작 줄이기면 바로
  private func scramble() {
    idle.setActive(false)
    let seed = UInt32.random(in: 0...UInt32.max)
    cubie_game_set_now(cube.game, clock.now())
    cube.scramble(seed: seed, show: scrambleShow)
    startedScramble()
    sendFocus()
  }

  private var scrambleShow: Int32 {
    if reducedMotion { return Int32(CUBIE_SHOW_INSTANT) }
    switch settings.scrambleShow {
    case .auto: return Int32(CUBIE_SHOW_AUTO)
    case .instant: return Int32(CUBIE_SHOW_INSTANT)
    case .moves: return Int32(CUBIE_SHOW_MOVES)
    case .spin: return Int32(CUBIE_SHOW_SPIN)
    }
  }

  /// 섞었다: 새 판(섞기 글·씨앗·시간은 코어 한 판 세션이 들고 있다)
  private func startedScramble() {
    hintGate.reset()
    hideHint()
    inputs = []
    origins = []
    idle.reset()
    updateMirror()
  }

  private func moved(origin: String) {
    let undo = cubie_game_last_undo(cube.game)
    hintGate.hide()
    // 맞춰서 기록이 생기는 수도 그 판에 든다. 되돌리기는 입력 방식에 세지 않지만 키 출처에는 넣는다(사이트와 같다)
    if !undo, !inputs.contains("keyboard") { inputs.append("keyboard") }
    origins.insert(origin)
    sound.play(.turn)
    let text = NativeCore.string { cubie_game_take_record(cube.game, $0, $1) }
    if let data = text.data(using: .utf8), let rec = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
      finish(rec)
    }
    updateMirror()
  }

  /// 다 맞춘 판: 기록에 남기고 축하(이 판 전의 최고보다 빠르면 금색)
  private func finish(_ partial: [String: Any]) {
    var r = partial
    let n = cube.n
    r["at"] = Int(Date().timeIntervalSince1970 * 1000)
    r["n"] = n
    r["mode"] = "solo"
    r["inspection"] = false
    if !inputs.isEmpty { r["inputs"] = inputs }
    let rank = ["hardware": 0, "unknown": 1, "synthetic": 2]
    if let o = origins.max(by: { (rank[$0] ?? 1) < (rank[$1] ?? 1) }) { r["keyOrigin"] = o }
    if hintGate.used > 0 { r["hints"] = hintGate.used }
    let before = book.best(n)
    let ms = Timeable(record: r).result ?? 0
    book.add(r)
    hintGate.hide()
    hideHint()
    solvedCount += 1
    sound.play(.solved)
    cube.cheer(text: MiniBook.formatMs(ms), best: before.map { ms < $0 } ?? false)
    refreshProfile()
    onRecorded?()
    if Config.debug || Config.measure { print("[cubie] solved n=\(n) ms=\(Int(ms)) moves=\(r["moves"] ?? "")"); fflush(stdout) }
  }

  // MARK: 힌트(docs/47 15-15)

  private func requestHint() {
    guard cubie_game_solving(cube.game) else { return flash("섞은 뒤 맞추는 동안 볼 수 있어요") }
    guard cube.n == 2 || cube.n == 3 else { return flash("이 크기는 힌트 없음") }
    let lines = NativeCore.string { cubie_game_hint(cube.game, $0, $1) }.components(separatedBy: "\n")
    let kind = lines.first ?? "none"
    switch kind {
    case "hint": break
    case "unsupported": return flash("이 크기는 힌트 없음")
    default: return flash("지금은 보일 공식이 없어요")
    }
    switch hintGate.request() {
    case .limit: return flash("이번 판 \(HintGate.perSolve)번 다 봤어요")
    case .cooldown(let s): return flash("\(s)초 뒤에 다시 볼 수 있어요")
    case .ok: break
    }
    hintMsgCancel?()
    hintMsgCancel = nil
    let field = { (i: Int) in i < lines.count ? lines[i] : "" }
    let (stage, name, before, alg, keys, beforeKeys) = (field(1), field(2), field(3), field(4), field(6), field(7))
    // 사이트 `hintBubbleLines`와 같은 줄: 단계·상황, 쥐는 법(키캡), 공식, 공식 키캡
    var out: [[String: Any]] = [["text": name.isEmpty ? stage : "\(stage) · \(name)", "style": "title"]]
    if !before.isEmpty {
      out.append(["text": beforeKeys.isEmpty ? "\(before) 뒤" : "\(before) 뒤  (\(beforeKeys))", "style": "note"])
    }
    out.append(["text": alg, "style": "alg"])
    if !keys.isEmpty { out.append(["text": keys, "style": "keys"]) }
    onHint?(out)
  }

  /// 짧은 알림 한 줄(1.5초)
  private func flash(_ text: String) {
    hintGate.hide()
    hintMsgCancel?()
    onHint?([["text": text, "style": "plain"]])
    hintMsgCancel = realClock.after(1500) { [weak self] in
      self?.hintMsgCancel = nil
      self?.onHint?(nil)
    }
  }

  private func hideHint() {
    hintMsgCancel?()
    hintMsgCancel = nil
    onHint?(nil)
  }

  // MARK: 거울(사이트 `mirror.ts`, docs/47 15-14)

  private func updateMirror() {
    mirrorRecheck?()
    mirrorRecheck = nil
    // 섞기 연출 동안은 연출 전 그대로 두고, 끝난 뒤에 바꾼다(docs/47 3-1)
    if cube.showing {
      mirrorRecheck = realClock.after(120) { [weak self] in
        self?.mirrorRecheck = nil
        self?.updateMirror()
      }
      return
    }
    let fits = min(host.bounds.width, host.bounds.height) >= CGFloat(10 * cube.n)
    let want = state.mirror && fits && focused && cubie_game_solving(cube.game) && !cube.solved && idle.showing == nil
    cube.setMirror(want)
  }

  override func windowDidResize(_ notification: Notification) {
    super.windowDidResize(notification)
    updateMirror()
  }

  // MARK: 프로필(docs/47 15-20)

  static let profileKey = "cube.mini.profile.v1"

  private func refreshProfile() {
    var name: String?
    if let text = store.string(Self.profileKey), let data = text.data(using: .utf8),
      let d = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let s = d["name"] as? String, !s.trimmingCharacters(in: .whitespaces).isEmpty
    {
      name = s
    }
    if name == nil {
      let made = "익명 큐버 #\(1000 + Int.random(in: 0..<9000))"
      if !Config.measure { store.set(#"{"version":1,"name":"\#(made)"}"#, for: Self.profileKey) }
      name = made
    }
    let n = state.n
    let tier = book.tier(n)
    profile = Profile(
      name: name ?? "익명 큐버", tierText: "\(n)×\(n) \(tier?.name ?? "5판 뒤에")",
      emblem: tier.flatMap { Self.emblem($0.id) })
  }

  /// 티어 엠블럼 그림(앱에 묶은 PNG, `Resources/Emblems/<티어>.png`)
  static func emblem(_ id: String) -> Data? {
    guard let url = Bundle.main.url(forResource: id, withExtension: "png", subdirectory: "Emblems") else { return nil }
    return try? Data(contentsOf: url)
  }

  // MARK: 떠 있을 때(docs/47 15-5)

  private func idleHooks() -> IdleShow.Hooks {
    IdleShow.Hooks(
      solved: { [weak self] in self?.cube.solved ?? true },
      replay: { [weak self] done in self?.startReplay(done) },
      hero: { _ in nil },
      jiggle: { [weak self] done in self?.startJiggle(done) ?? {} },
      restore: { [weak self] in
        self?.cube.showJump(solved: false)
        self?.updateMirror()
      },
      started: { [weak self] kind in
        if Config.debug { print("[cubie] idle \(kind.rawValue)"); fflush(stdout) }
        self?.updateMirror()
      })
  }

  /// 걸음들을 차례로 돌린다. 멈추는 함수를 돌려준다
  private func play(_ steps: [IdleShow.Step], moveMs: @escaping (Int) -> Double, hold: Double, done: @escaping @MainActor () -> Void)
    -> () -> Void
  {
    var cancel: (() -> Void)?
    var stopped = false
    func step(_ i: Int) {
      guard !stopped else { return }
      if i >= steps.count {
        cancel = realClock.after(hold) { done() }
        return
      }
      cube.showPush(steps[i].moves, ms: moveMs(i))
      let wait = i + 1 < steps.count ? steps[i + 1].at - steps[i].at : 0
      cancel = realClock.after(max(0, wait)) { step(i + 1) }
    }
    cancel = realClock.after(steps.first?.at ?? 0) { step(0) }
    return {
      stopped = true
      cancel?()
    }
  }

  private func startReplay(_ done: @escaping @MainActor () -> Void) -> (() -> Void)? {
    let n = cube.n
    guard let r = IdleShow.pickReplay(records: book.records(n), best5: book.bestFive(n), turn: idleTurn),
      let scramble = r["scramble"] as? String
    else { return nil }
    let steps = IdleShow.replaySteps(
      record: r, scrambleMoves: scramble.split(separator: " ").map(String.init),
      solveSteps: { NativeCore.replaySteps(n: n, text: $0, maxPauseMs: IdleShow.maxPauseMs, offset: $1) })
    guard !steps.isEmpty else { return nil }
    idleTurn += 1
    cube.showJump(solved: true)
    let base = settings.moveMs
    return play(
      steps,
      moveMs: { i in
        steps[i].scramble ? min(IdleShow.scrambleMoveMs, base) : IdleShow.replayMoveMs(steps, i, base: base)
      }, hold: IdleShow.endHoldMs, done: done)
  }

  private func startJiggle(_ done: @escaping @MainActor () -> Void) -> () -> Void {
    let plan = IdleShow.jigglePlan(count: idle.timing.jiggleMoves) { Double.random(in: 0..<1) }
    let every = idle.timing.jiggleStepMs
    let steps = plan.enumerated().map { IdleShow.Step(at: Double($0.offset) * every, moves: $0.element, scramble: false) }
    let ms = settings.moveMs
    return play(steps, moveMs: { _ in ms }, hold: every, done: done)
  }

  // MARK: 재기(`NativeMeasure`)

  /// 재기 명령: 포커스 알림(앱은 앞으로 나올 수 없다)
  func measureSetFocus(_ on: Bool) {
    measureFocus = on
    sendFocus()
  }

  func measureScramble() { scramble() }
  func measureMirror(_ on: Bool) {
    state.mirror = on
    updateMirror()
  }
  func measureSize(_ n: Int) { setSize(n) }

  /// 키 하나를 실제 키처럼(재기의 돌리기)
  func measurePress(_ keyCode: UInt16) {
    cubie_game_set_now(cube.game, clock.now())
    let r = cube.press(keyCode: keyCode, flags: 0)
    if r == Int32(CUBIE_KEY_MOVED) || r == Int32(CUBIE_KEY_SOLVED) { moved(origin: "synthetic") }
  }
}

/// 맥 키 코드 → `KeyboardEvent.code`(단축키 표의 칸 빛내기). 배치 키 표와 같은 값(코어 `keycode.rs`)
enum WebKeyCode {
  static func of(_ key: UInt16) -> String? {
    let s = NativeCore.string { cubie_mac_key_code(key, $0, $1) }
    return s.isEmpty ? nil : s
  }
}
