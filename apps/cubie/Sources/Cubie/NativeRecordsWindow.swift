import AppKit
import CubieCore
import CubieNativeC

/// 네이티브 기록 창(docs/52 5-8): 사이트 기록 창(`/cube/mini?view=records`, `MiniCubeApp.tsx` `RecordsPage`)과 같은 글·차례·동작.
/// - 위: 크기별 Cubie 티어(엠블럼·최고 Ao5·이름, 누르면 그 크기), 「티어표」(네이티브 티어표 창)
/// - 아래: 크기 단추, 요약(최고·평균·5번·12번 평균, 코어 `summary.rs`), 판마다 줄(번호·때·시간·입력 표시·힌트·수·다시 보기)
/// - 다시 보기 상자: 섞인 모양에서 그때 시각대로(멈춤은 1초까지), 큐브는 큐브 창과 같은 `CACubeView`와 거울
/// 웹 창과 달리 WebKit이 뜨지 않는다. `CUBIE_WEB=1`이면 예전처럼 사이트 창을 연다(`AppDelegate`)
@MainActor
final class NativeRecordsWindow: NativeSheetWindow {
  static let size = NSSize(width: 380, height: 600)

  private let book: MiniBook
  private let settings: () -> CubeSettings
  private let root = RecordsRootView()
  private(set) var n: Int
  private var watching: [String: Any]?
  /// 티어표를 연다(크기)
  var onTiers: ((Int) -> Void)?

  init(book: MiniBook, settings: @escaping () -> CubeSettings) {
    self.book = book
    self.settings = settings
    n = book.n
    super.init(title: "Cubie 기록", size: Self.size, content: root)
    root.owner = self
    reload()
  }

  /// 기록·크기를 다시 읽는다(창이 앞에 올 때, 큐브 창이 기록을 더할 때. 사이트 `focus`·`storage` 다시 읽기)
  func reload() {
    root.show(n: n, book: book, watching: watching)
  }

  override func becameKey() { reload() }

  func pick(_ size: Int) {
    guard size != n else { return }
    n = size
    // 크기를 바꾸면 보던 판을 닫는다
    close(replay: true)
  }

  func watch(_ r: [String: Any]) {
    watching = r
    root.startReplay(r, settings: settings(), mirrorWanted: book.mirror)
    reload()
  }

  func close(replay: Bool) {
    watching = nil
    root.stopReplay()
    reload()
  }

  func openTiers() { onTiers?(n) }

  /// 재기 전용(메모리 저장소): 다시 볼 판이 없으면 3×3 한 판(섞기와 그 거꾸로 푼 다시 보기 글)을 더하고 다시 보기를 연다
  func measureReplay() {
    if !book.records(n).contains(where: RecordsSheet.canReplay) {
      let scramble = "R U R' U' F2 D L2 B' U2 R D' F"
      let solve = scramble.split(separator: " ").reversed().map { m -> String in
        m.hasSuffix("2") ? String(m) : m.hasSuffix("'") ? String(m.dropLast()) : "\(m)'"
      }
      let replay = solve.enumerated().map { "\($0.element)@\($0.offset * 400)" }.joined(separator: " ")
      book.add([
        "at": Date().timeIntervalSince1970 * 1000, "n": n, "mode": "solo", "ms": 4_800, "penalty": 0,
        "moves": solve.count, "scramble": scramble, "replay": replay,
      ])
    }
    reload()
    if let r = book.records(n).first(where: RecordsSheet.canReplay) { watch(r) }
  }

  /// 확인용(스크린샷): 그 판 다시 보기를 열어 둔다
  var replayView: CACubeView? { root.replay?.cube }
}

extension NativeCore {
  /// 기록 창 요약(코어 `summary.rs`, 사이트 `summarize`)
  static func summary(_ records: [[String: Any]]) -> CubieSummary {
    let list = records.map(Timeable.init).map {
      CubieTimeable(ms: $0.ms ?? -1, penalty: $0.penalty, hints: UInt32(max(0, $0.hints)))
    }
    var out = CubieSummary()
    list.withUnsafeBufferPointer { cubie_mini_summary($0.baseAddress, UInt32($0.count), &out) }
    return out
  }
}

/// 기록 창 내용(위에서 아래로)
@MainActor
final class RecordsRootView: FlippedView {
  weak var owner: NativeRecordsWindow?
  private let tiers = FlippedView()
  private let tiersTitle = NUI.label(RecordsSheet.tiersTitle, size: 14, weight: .bold)
  private let tiersBasis = NUI.label(RecordsSheet.tiersBasis, color: NUI.white(0.6))
  private let tiersLink = Chip(RecordsSheet.tiersLink, look: Chip.Look(text: NUI.white(0.7), padX: 0))
  private var tierButtons: [TierCell] = []
  private let tiersNote = NUI.paragraph(RecordsSheet.tiersNote, color: NUI.white(0.5), lineHeight: 16)
  private let tiersLine = FlippedView()

  private let title = NUI.label(RecordsSheet.title, size: 14, weight: .bold)
  private var sizeButtons: [Chip] = []
  private let summary = FlippedView()
  private var summaryValues: [NSTextField] = []
  private var summaryLabels: [NSTextField] = []
  private let empty = NUI.label(RecordsSheet.empty, color: NUI.white(0.6))
  private let scroll = NSScrollView()
  private let list = FlippedView()
  private var rows: [RecordRowView] = []
  private(set) var replay: ReplayBoxView?
  private var n = 3

  init() {
    super.init(frame: NSRect(origin: .zero, size: NativeRecordsWindow.size))
    fill = NUI.color(NUI.Hex.neutral950)
    addSubview(tiers)
    for v in [tiersTitle, tiersBasis, tiersLink, tiersNote, tiersLine] as [NSView] { tiers.addSubview(v) }
    tiersLink.action = { [weak self] in self?.owner?.openTiers() }
    tiersLine.fill = NUI.white(0.1)
    for s in RecordsSheet.sizes {
      let cell = TierCell(size: s)
      cell.action = { [weak self] in self?.owner?.pick(s) }
      tierButtons.append(cell)
      tiers.addSubview(cell)
    }
    addSubview(title)
    for s in RecordsSheet.sizes {
      let b = Chip("\(s)")
      b.action = { [weak self] in self?.owner?.pick(s) }
      sizeButtons.append(b)
      addSubview(b)
    }
    summary.fill = NUI.white(0.05)
    summary.radius = 4
    for t in RecordsSheet.summaryLabels {
      let l = NUI.label(t, color: NUI.white(0.6))
      let v = NUI.label("-")
      summaryLabels.append(l)
      summaryValues.append(v)
      summary.addSubview(l)
      summary.addSubview(v)
    }
    addSubview(summary)
    addSubview(empty)
    scroll.drawsBackground = false
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = true
    scroll.documentView = list
    addSubview(scroll)
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  func show(n: Int, book: MiniBook, watching: [String: Any]?) {
    self.n = n
    for (i, s) in RecordsSheet.sizes.enumerated() {
      tierButtons[i].show(tier: book.tier(s), on: s == n)
      let b = sizeButtons[i]
      b.pressed = s == n
      b.look = Chip.Look(fill: s == n ? NUI.white(0.2) : .clear, text: s == n ? .white : NUI.white(0.6), padX: 4)
    }
    let records = book.records(n)
    let sum = NativeCore.summary(records)
    for (i, v) in [sum.best, sum.mean, sum.ao5, sum.ao12].enumerated() {
      NUI.set(summaryValues[i], RecordsSheet.summaryText(v), color: .white)
    }
    rows.forEach { $0.removeFromSuperview() }
    rows = records.map { r in
      let row = RecordRowView(row: RecordsSheet.row(r))
      let watchingThis =
        watching.map {
          ($0["at"] as? NSNumber)?.doubleValue == row.row.at && ($0["no"] as? NSNumber)?.intValue == row.row.no
        } ?? false
      row.replayButton?.pressed = watchingThis
      row.replayButton?.action = { [weak self] in self?.owner?.watch(r) }
      list.addSubview(row)
      return row
    }
    empty.isHidden = !records.isEmpty
    scroll.isHidden = records.isEmpty
    needsLayout = true
  }

  func startReplay(_ r: [String: Any], settings: CubeSettings, mirrorWanted: Bool) {
    stopReplay()
    let box = ReplayBoxView(record: r, settings: settings, mirrorWanted: mirrorWanted)
    box.onClose = { [weak self] in self?.owner?.close(replay: true) }
    replay = box
    addSubview(box)
    needsLayout = true
    layoutSubtreeIfNeeded()
    box.start()
  }

  func stopReplay() {
    replay?.stop()
    replay?.removeFromSuperview()
    replay = nil
  }

  override func layout() {
    super.layout()
    let w = bounds.width
    // 티어(p-2 gap-1, 아래 선)
    var y: CGFloat = 8
    let inner = w - 16
    tiersTitle.frame = NSRect(x: 8, y: y, width: NUI.width(tiersTitle), height: 20)
    tiersBasis.frame = NSRect(x: tiersTitle.frame.maxX + 8, y: y + 3, width: NUI.width(tiersBasis), height: 16)
    let lf = tiersLink.fit
    tiersLink.frame = NSRect(x: w - 8 - lf.width, y: y + 3, width: lf.width, height: 16)
    y += 20 + 4
    let cellW = (inner - 8) / 3
    for (i, c) in tierButtons.enumerated() {
      c.frame = NSRect(x: 8 + CGFloat(i % 3) * (cellW + 4), y: y + CGFloat(i / 3) * (TierCell.height + 4), width: cellW, height: TierCell.height)
    }
    y += TierCell.height * 2 + 4 + 4
    let nh = NUI.height(tiersNote, width: inner)
    tiersNote.frame = NSRect(x: 8, y: y, width: inner, height: nh)
    y += nh + 8
    tiers.frame = NSRect(x: 0, y: 0, width: w, height: y + 1)
    tiersLine.frame = NSRect(x: 0, y: y, width: w, height: 1)
    y += 1

    // 기록(p-2 gap-1.5)
    y += 8
    title.frame = NSRect(x: 8, y: y, width: NUI.width(title), height: 20)
    var x = title.frame.maxX + 4
    for b in sizeButtons {
      let f = b.fit
      b.frame = NSRect(x: x, y: y + 2, width: f.width, height: 16)
      x += f.width + 2
    }
    y += 20 + 6
    let half = (inner - 12 - 8) / 2
    for i in 0..<summaryLabels.count {
      summaryLabels[i].frame = NSRect(x: 6, y: 6 + CGFloat(i) * 16, width: half, height: 16)
      summaryValues[i].frame = NSRect(x: 6 + half + 8, y: 6 + CGFloat(i) * 16, width: half, height: 16)
    }
    let sh = 12 + CGFloat(summaryLabels.count) * 16
    summary.frame = NSRect(x: 8, y: y, width: inner, height: sh)
    y += sh + 6

    let bottom = bounds.height - 8
    var listTop = y
    if let replay {
      // 다시 보는 동안은 큐브·거울이 남은 높이의 3/4, 기록 목록이 1/4(목록은 그 안에서 굴린다)
      let rest = bottom - y - 6
      let listH = max(48, rest / 4)
      let rh = rest - listH
      replay.frame = NSRect(x: 8, y: y, width: inner, height: rh)
      listTop = y + rh + 6
    }
    empty.frame = NSRect(x: 8, y: listTop, width: inner, height: 16)
    scroll.frame = NSRect(x: 8, y: listTop, width: inner, height: max(0, bottom - listTop))
    let rowH = RecordRowView.height
    for (i, r) in rows.enumerated() {
      r.frame = NSRect(x: 0, y: CGFloat(i) * rowH, width: inner, height: rowH)
    }
    list.frame = NSRect(x: 0, y: 0, width: inner, height: max(scroll.frame.height, CGFloat(rows.count) * rowH))
  }
}

/// 티어 칸 하나(크기 단추: 엠블럼, 「3×3 23.45」, 티어 이름 또는 「5판 뒤에」)
@MainActor
final class TierCell: FlippedView {
  static let height: CGFloat = 40
  let size: Int
  var action: (() -> Void)?
  private let emblem = NSImageView()
  /// 티어가 아직 없으면 점선 동그라미(사이트 `border-dashed`)
  private var ring = false
  private let top = NUI.label("", color: NUI.white(0.6))
  private let name = NUI.label("", weight: .semibold)
  private(set) var on = false

  init(size: Int) {
    self.size = size
    super.init(frame: .zero)
    radius = 4
    emblem.imageScaling = .scaleProportionallyUpOrDown
    for v in [emblem, top, name] as [NSView] { addSubview(v) }
  }

  private var emblemRect: NSRect { NSRect(x: 6, y: (bounds.height - 28) / 2, width: 28, height: 28) }

  override func draw(_ dirtyRect: NSRect) {
    super.draw(dirtyRect)
    guard ring else { return }
    let p = NSBezierPath(ovalIn: emblemRect.insetBy(dx: 0.5, dy: 0.5))
    p.lineWidth = 1
    p.setLineDash([3, 2], count: 2, phase: 0)
    NUI.white(0.15).setStroke()
    p.stroke()
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  func show(tier: TierInfo?, on: Bool) {
    self.on = on
    fill = on ? NUI.white(0.15) : NUI.white(0.05)
    if let tier {
      emblem.image = NUI.emblem(tier.id)
      emblem.isHidden = false
      ring = false
      NUI.set(top, "\(size)×\(size) \(MiniBook.formatMs(tier.ao5))", color: NUI.white(0.6))
      NUI.set(name, tier.name, weight: .semibold, color: NUI.color(NUI.tierTone[min(max(tier.tier, 0), 9)]))
    } else {
      emblem.isHidden = true
      ring = true
      NUI.set(top, "\(size)×\(size) ", color: NUI.white(0.6))
      NUI.set(name, RecordsSheet.tierPending, color: NUI.white(0.4))
    }
    needsLayout = true
    needsDisplay = true
  }

  override func layout() {
    super.layout()
    let e = emblemRect
    emblem.frame = e
    let tx = e.maxX + 6
    top.frame = NSRect(x: tx, y: 4, width: bounds.width - tx - 4, height: 16)
    name.frame = NSRect(x: tx, y: 20, width: bounds.width - tx - 4, height: 16)
  }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  override func mouseUp(with event: NSEvent) {
    if bounds.contains(convert(event.locationInWindow, from: nil)) { action?() }
  }
  override func mouseDown(with event: NSEvent) {}
}

/// 기록 한 줄
@MainActor
final class RecordRowView: FlippedView {
  static let height: CGFloat = 21
  let row: RecordsSheet.Row
  private(set) var replayButton: Chip?
  private var parts: [NSView] = []
  private let line = FlippedView()

  init(row: RecordsSheet.Row) {
    self.row = row
    super.init(frame: .zero)
    line.fill = NUI.white(0.1)
    addSubview(line)
    let no = NUI.label("\(row.no)", color: NUI.white(0.4))
    let when = NUI.label(row.when, color: NUI.white(0.6))
    let time = NUI.label(row.time, weight: .semibold)
    parts = [no, when, time]
    var badges: [NSView] = []
    if row.synthetic {
      badges.append(Chip(RecordsSheet.synthetic, look: Chip.Look(fill: NUI.color(NUI.Hex.amber500, 0.25), text: NUI.color(NUI.Hex.amber200))))
    }
    if row.swipe {
      badges.append(Chip(RecordsSheet.swipe, look: Chip.Look(fill: NUI.white(0.1), text: NUI.white(0.7))))
    }
    if row.hints > 0 {
      let h = Chip(RecordsSheet.hints(row.hints), look: Chip.Look(fill: NUI.color(NUI.Hex.sky500, 0.25), text: NUI.color(NUI.Hex.sky200)))
      h.toolTip = RecordsSheet.hintsTip
      badges.append(h)
    }
    parts += badges
    parts.append(NUI.label(RecordsSheet.moves(row.moves), color: NUI.white(0.6)))
    if row.canReplay {
      let b = Chip(RecordsSheet.replay, look: Chip.Look(fill: NUI.white(0.1)))
      replayButton = b
      parts.append(b)
    }
    parts.forEach(addSubview)
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  override func layout() {
    super.layout()
    let h: CGFloat = 16
    let y: CGFloat = 2
    // 번호 w-6, 때 w-20, 시간은 남은 자리(flex-1), 나머지는 글 폭대로. 칸 사이 8
    parts[0].frame = NSRect(x: 0, y: y, width: 24, height: h)
    parts[1].frame = NSRect(x: 32, y: y, width: 80, height: h)
    // 시간 칸은 글보다 줄지 않는다(사이트 flex-1의 최소 폭). 자리가 모자라면 오른쪽 칸들이 밀린다
    let widths = parts[3...].map { ($0 as? Chip)?.fit.width ?? NUI.width($0 as! NSTextField) }
    let rightW = widths.reduce(0, +) + CGFloat(widths.count) * 8
    let timeW = max(NUI.width(parts[2] as! NSTextField), bounds.width - 120 - rightW)
    parts[2].frame = NSRect(x: 120, y: y, width: timeW, height: h)
    var x = 120 + timeW + 8
    for (v, w) in zip(parts[3...], widths) {
      v.frame = NSRect(x: x, y: y, width: w, height: h)
      x += w + 8
    }
    line.frame = NSRect(x: 0, y: bounds.height - 1, width: bounds.width, height: 1)
  }
}

/// 다시 보기 상자(사이트 `ReplayBox`): 머리(번호·시간·힌트, 멈추기·처음부터·닫기)와 큐브
@MainActor
final class ReplayBoxView: FlippedView {
  let record: [String: Any]
  let n: Int
  private(set) var cube: CACubeView
  private let head: NSTextField
  private let hints: NSTextField?
  private let toggle = Chip(RecordsSheet.pause, look: Chip.Look(padX: 6, padY: 2))
  private let restart = Chip(RecordsSheet.restart, look: Chip.Look(padX: 6, padY: 2))
  private let closeButton = Chip(RecordsSheet.close, look: Chip.Look(padX: 6, padY: 2))
  private var player: ReplayPlayer?
  private let clock = RealClock()
  private let scrambleText: String
  private let baseMs: Double
  private let mirrorWanted: Bool
  private let colors: [UInt32]
  private(set) var status: ReplayPlayer.Status = .paused
  var onClose: (() -> Void)?

  init(record: [String: Any], settings: CubeSettings, mirrorWanted: Bool) {
    self.record = record
    n = (record["n"] as? NSNumber)?.intValue ?? 3
    scrambleText = record["scramble"] as? String ?? ""
    baseMs = settings.moveMs
    self.mirrorWanted = mirrorWanted
    colors = settings.colors
    head = NUI.label(
      RecordsSheet.replayHead(no: (record["no"] as? NSNumber)?.intValue ?? 0, ms: (record["ms"] as? NSNumber)?.doubleValue),
      weight: .semibold)
    let h = (record["hints"] as? NSNumber)?.intValue ?? 0
    hints = h > 0 ? NUI.label("· " + RecordsSheet.hints(h), color: NUI.color(NUI.Hex.sky200)) : nil
    cube = CACubeView(frame: NSRect(x: 0, y: 0, width: 200, height: 200), n: n)
    super.init(frame: .zero)
    fill = NUI.white(0.05)
    radius = 4
    cube.reducedMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    cube.setColors(settings.colors, masked: settings.hiddenColor)
    cube.setMoveMs(settings.moveMs)
    if settings.stickerless {
      cube.stickerless = true
      cube.rebuild()
    }
    for v in [head, toggle, restart, closeButton, cube] as [NSView] { addSubview(v) }
    if let hints { addSubview(hints) }
    toggle.action = { [weak self] in self?.player?.toggle() }
    restart.action = { [weak self] in self?.player?.restart() }
    closeButton.action = { [weak self] in self?.onClose?() }
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  /// 섞인 모양에 두고 재생을 시작한다
  func start() {
    let steps = NativeCore.replaySteps(n: n, text: record["replay"] as? String ?? "", maxPauseMs: IdleShow.maxPauseMs)
      .map { ReplayPlayer.Step(at: $0.at, moves: $0.moves) }
    jumpToStart()
    let base = baseMs
    let p = ReplayPlayer(
      clock: clock, steps: steps,
      hooks: ReplayPlayer.Hooks(
        onStep: { [weak self] s, i in
          guard let self else { return }
          // 떠 있을 때 다시 보기와 같이: 설정 회전 시간, 다음 수가 더 빨리 오면 그 간격에 맞춰 줄인다
          let ms = ReplayPlayer.moveMs(steps, i, base: base)
          let count = max(1, s.moves.split(separator: " ").count)
          self.cube.showPush(s.moves, ms: ms * Double(count))
        },
        onReset: { [weak self] in self?.jumpToStart() },
        onStatus: { [weak self] s in self?.setStatus(s) }))
    player = p
    p.play()
  }

  func stop() {
    player?.stop()
    player = nil
  }

  var played: Int { player?.played ?? 0 }
  var total: Int { player?.steps.count ?? 0 }

  /// 스크린샷용: 창에 붙지 않은 같은 모양의 큐브(창에 붙은 층은 `CARenderer`로 따로 그릴 수 없다)
  func shotCube() -> CACubeView {
    let c = CACubeView(frame: cube.frame, n: n)
    c.setColors(colors, masked: cube.maskedColor)
    if cube.stickerless { c.stickerless = true }
    c.buildForShot()
    c.showJump(solved: true)
    _ = scrambleText.withCString { cubie_game_show_push(c.game, $0, 0) }
    c.finishShow()
    c.reducedMotion = true
    c.setMirror(cube.mirrorShown)
    return c
  }

  private func jumpToStart() {
    cube.showJump(solved: true)
    // 섞기 수를 줄에 넣고 바로 끝낸 자리로(연출 없이 섞인 모양)
    _ = scrambleText.withCString { cubie_game_show_push(cube.game, $0, 0) }
    cube.finishShow()
  }

  private func setStatus(_ s: ReplayPlayer.Status) {
    status = s
    toggle.title = s == .paused ? RecordsSheet.resume : RecordsSheet.pause
    toggle.enabled = s != .done
    needsLayout = true
  }

  override func layout() {
    super.layout()
    let w = bounds.width
    var x: CGFloat = 6
    head.frame = NSRect(x: x, y: 6, width: NUI.width(head), height: 18)
    x = head.frame.maxX + 4
    if let hints { hints.frame = NSRect(x: x, y: 6, width: NUI.width(hints), height: 18) }
    var right = w - 6
    for b in [closeButton, restart, toggle] {
      let f = b.fit
      right -= f.width
      b.frame = NSRect(x: right, y: 6, width: f.width, height: 18)
      right -= 2
    }
    let area = NSRect(x: 6, y: 28, width: w - 12, height: max(0, bounds.height - 34))
    if cube.frame != area { cube.frame = area }
    cube.setMirror(RecordsSheet.replayMirror(wanted: mirrorWanted, n: n, short: min(area.width, area.height)))
  }
}
