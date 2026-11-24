import AppKit
import CubieCore
import CubieNativeC

/// 사용자 키 배치 편집기(설정 창 「사용자」 상자, 사이트 `CubeSettingsApp.tsx` `KeymapSection`의 `data-keymap-editor`). 같은 글·차례·동작:
/// 마우스 돌리기, 동작 목록 크기, 기본으로 되돌리기, 겹친 키 묻기(바꾸기·그만두기), 알림, 키 없는 동작, 겹친 키, 묶음별로 접는 동작 목록
/// (키 빼기 ×·키 지정·비우기). 판단과 알림 글은 코어(`cubie_keymap_*`, 사이트와 공통 시험 자료 어긋남 0)가 만든다. 바꾸면 바로 앱
/// 저장소(`cube.keymap.v1`)에 쓰고 `onChange`로 큐브 창·단축키 표가 다시 읽는다
@MainActor
final class KeymapEditorView: FlippedView {
  private let store: KeyValueStore
  /// 배치를 바꿨다(큐브 창·F1 표 다시 읽기)
  var onChange: (() -> Void)?
  /// 높이가 바뀌었다(설정 창이 다시 놓는다)
  var onLayout: (() -> Void)?

  private(set) var n = 3
  private(set) var capturing: String?
  private(set) var message: String?
  private struct Pending {
    var action: String
    var code: String
    var mods: UInt8
    var question: String
  }
  private var pending: Pending?
  private var openGroups: Set<String> = ["face"]
  private(set) var model = KeymapEditorModel()
  private var monitor: Any?
  private var lastWidth: CGFloat = 0
  private(set) var contentHeight: CGFloat = 0

  init(store: KeyValueStore) {
    self.store = store
    super.init(frame: .zero)
    reload()
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  private var stored: String? { store.string(StoredKeymap.key) }

  /// 저장소에서 다시 읽는다
  func reload() {
    let s = stored
    let text = s.withOptionalCString { p in NativeCore.string { cubie_keymap_view(p, UInt32(n), $0, $1) } }
    model = KeymapEditorModel.parse(text)
    rebuild()
  }

  /// 묶음 고르기(설정 창 「두 손」·「표기」)는 알림을 지운다(사이트 `setMessage(null)`)
  func clearMessage() {
    message = nil
    pending = nil
    stopCapture()
  }

  // MARK: 편집

  private func edit(_ op: String, _ arg: String = "", code: String = "", mods: UInt8 = 0) -> KeymapEditorModel.Edit {
    let s = stored
    let text = s.withOptionalCString { sp in
      op.withCString { o in
        arg.withCString { a in
          code.withCString { c in NativeCore.string { cubie_keymap_edit(sp, o, a, c, mods, $0, $1) } }
        }
      }
    }
    let e = KeymapEditorModel.parseEdit(text)
    if e.error == nil {
      store.set(e.stored, for: StoredKeymap.key)
      onChange?()
    }
    return e
  }

  private func apply(_ action: String, code: String, mods: UInt8) {
    let e = edit("assign", action, code: code, mods: mods)
    pending = nil
    message = e.message
    reload()
  }

  /// 가져오기(내보내기·가져오기 상자). 오류 글을 돌려준다
  func importText(_ text: String) -> String? {
    let e = edit("import", text)
    if let err = e.error { return err }
    message = e.message
    reload()
    return nil
  }

  private func startCapture(_ action: String) {
    capturing = action
    message = nil
    pending = nil
    if monitor == nil {
      monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] ev in
        guard let self, self.capturing != nil, ev.window === self.window else { return ev }
        self.captured(ev)
        return nil
      }
    }
    reload()
  }

  private func stopCapture() {
    capturing = nil
    if let m = monitor {
      NSEvent.removeMonitor(m)
      monitor = nil
    }
  }

  /// 키 지정 중 창을 닫거나 보기가 창에서 빠지면 키 감시를 뗀다(남으면 다음에 연 창의 키를 먹을 수 있다)
  private var closeWatch: NSObjectProtocol?

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    if let closeWatch { NotificationCenter.default.removeObserver(closeWatch) }
    closeWatch = nil
    guard let window else {
      stopCapture()
      return
    }
    closeWatch = NotificationCenter.default.addObserver(
      forName: NSWindow.willCloseNotification, object: window, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self, self.capturing != nil else { return }
        self.stopCapture()
        self.reload()
      }
    }
  }

  /// 시험·재기: 키 감시가 걸려 있는지
  var watchingKeys: Bool { monitor != nil }

  /// 키 지정 중 키 누름(사이트 `onKey`: Esc는 그만두기, 조합 키만이면 계속 기다림, 겹치면 묻기)
  private func captured(_ ev: NSEvent) {
    guard let action = capturing else { return }
    let f = ev.modifierFlags
    let (shift, alt, ctrl, meta) = (f.contains(.shift), f.contains(.option), f.contains(.control), f.contains(.command))
    let code = WebKeyCode.of(ev.keyCode) ?? ""
    if code == "Escape" && !shift && !alt && !ctrl {
      stopCapture()
      message = nil
      reload()
      return
    }
    let bits = code.withCString { cubie_keymap_chord($0, shift, alt, ctrl, meta) }
    guard bits >= 0 else { return }
    let mods = UInt8(bits)
    stopCapture()
    let s = stored
    let q = s.withOptionalCString { sp in
      action.withCString { a in code.withCString { c in NativeCore.string { cubie_keymap_ask(sp, a, c, mods, $0, $1) } } }
    }
    if !q.isEmpty {
      pending = Pending(action: action, code: code, mods: mods, question: q)
      message = nil
      reload()
      return
    }
    apply(action, code: code, mods: mods)
  }

  /// 스크린샷: 겹친 키 묻기에 「바꾸기」
  func shotAnswerYes() {
    if let p = pending { apply(p.action, code: p.code, mods: p.mods) }
  }

  /// 스크린샷: 키 지정을 누르고 그 키를 친 것처럼
  func shotPress(action: String, code: String, mods: UInt8) {
    let s = stored
    let q = s.withOptionalCString { sp in
      action.withCString { a in code.withCString { c in NativeCore.string { cubie_keymap_ask(sp, a, c, mods, $0, $1) } } }
    }
    if q.isEmpty { apply(action, code: code, mods: mods) } else {
      pending = Pending(action: action, code: code, mods: mods, question: q)
      reload()
    }
  }

  // MARK: 그리기

  override func layout() {
    super.layout()
    if abs(bounds.width - lastWidth) > 0.5 { rebuild() }
  }

  private static let rowH: CGFloat = 28

  /// `focus`: 다시 만들어도 같은 칩을 알아볼 이름(키보드 포커스를 돌려줄 때 쓴다, `rebuild`)
  private func chip(
    _ title: String, focus: String, fill: NSColor, text: NSColor = .white, size: CGFloat = 12, bold: Bool = false,
    action: @escaping () -> Void
  ) -> Chip {
    let c = Chip(
      title, look: Chip.Look(fill: fill, text: text, radius: 4, size: size, weight: bold ? .bold : .regular, padX: 6, padY: 2))
    c.action = action
    c.identifier = NSUserInterfaceItemIdentifier(focus)
    return c
  }

  /// 지난번에 만든 칩마다, 그 칩이 사라졌을 때 대신 포커스를 줄 칩(키를 빼면 그 동작의 「키 지정」)
  private var focusFallback: [String: String] = [:]

  /// 지금 상태로 보기들을 새로 놓는다(동작이 100개 남짓이라 통째로 새로 만든다). 키보드 포커스가 안에 있었으면 같은 칩에
  /// 돌려준다(`keepingFocus`)
  private func rebuild() {
    let fallback = focusFallback
    keepingFocus(fallback: fallback) {
      focusFallback = [:]
      build()
    }
  }

  private func build() {
    subviews.forEach { $0.removeFromSuperview() }
    let w = bounds.width
    lastWidth = w
    guard w > 0 else { return }
    let pad: CGFloat = 12
    let inner = w - pad * 2
    var y: CGFloat = pad

    // 마우스 돌리기
    let mouse = NSButton(checkboxWithTitle: SettingsSheet.mouseRotate, target: self, action: #selector(mouseToggled(_:)))
    mouse.font = NUI.font(14, mono: false)
    mouse.state = model.mouseRotate ? .on : .off
    mouse.identifier = NSUserInterfaceItemIdentifier("mouse")
    mouse.frame = NSRect(x: pad, y: y, width: inner, height: 20)
    addSubview(mouse)
    y += 20 + 12

    // 동작 목록 크기 · 기본으로 되돌리기
    let sizeLabel = NUI.label(SettingsSheet.listSize, size: 14, mono: false)
    sizeLabel.frame = NSRect(x: pad, y: y + 4, width: NUI.width(sizeLabel), height: 20)
    addSubview(sizeLabel)
    let pop = NSPopUpButton(frame: NSRect(x: sizeLabel.frame.maxX + 4, y: y, width: 76, height: 26), pullsDown: false)
    pop.addItems(withTitles: (2...7).map { "\($0)×\($0)" })
    pop.selectItem(at: n - 2)
    pop.target = self
    pop.action = #selector(sizePicked(_:))
    pop.font = NUI.font(13, mono: false)
    pop.identifier = NSUserInterfaceItemIdentifier("size")
    addSubview(pop)
    var right = pad + inner
    for (id, label) in SettingsSheet.presets.filter({ $0.id != "custom" }).reversed() {
      let c = chip(label, focus: "preset:\(id)", fill: NUI.white(0.1)) { [weak self] in
        guard let self else { return }
        let e = self.edit("customFrom", id)
        self.message = e.message
        self.reload()
      }
      let f = c.fit
      right -= f.width
      c.frame = NSRect(x: right, y: y + 3, width: f.width, height: 22)
      addSubview(c)
      right -= 8
    }
    let resetLabel = NUI.label(SettingsSheet.resetTo, size: 12, color: NUI.white(0.6), mono: false)
    let rw = NUI.width(resetLabel)
    resetLabel.frame = NSRect(x: right - rw, y: y + 6, width: rw, height: 16)
    addSubview(resetLabel)
    y += 28 + 12

    // 겹친 키 묻기
    if let p = pending {
      let box = FlippedView()
      box.fill = NUI.color(NUI.Hex.amber200, 0.1)
      box.border = NUI.color(NUI.Hex.amber200, 0.4)
      box.radius = 16
      let yes = chip(
        SettingsSheet.conflictYes, focus: "conflict-yes", fill: NUI.color(NUI.Hex.amber200), text: .black, size: 14, bold: true
      ) {
        [weak self] in self?.apply(p.action, code: p.code, mods: p.mods)
      }
      yes.look.radius = 8
      yes.look.padX = 12
      let no = chip(
        SettingsSheet.conflictNo, focus: "conflict-no", fill: .clear, text: NUI.color(NUI.Hex.amber100, 0.8), size: 14
      ) { [weak self] in
        self?.pending = nil
        self?.reload()
      }
      no.look.padX = 12
      // 답하면 묻는 상자가 사라진다: 그 동작의 「키 지정」으로
      focusFallback["conflict-yes"] = "assign:\(p.action)"
      focusFallback["conflict-no"] = "assign:\(p.action)"
      let yf = yes.fit
      let nf = no.fit
      let qw = inner - 16 - yf.width - nf.width - 16 - 8
      let q = NUI.paragraph(p.question, size: 14, color: NUI.color(0xfffbeb))
      q.attributedStringValue = NUI.attributed(p.question, size: 14, color: NUI.color(0xfffbeb), weight: .semibold)
      let qh = NUI.height(q, width: qw)
      let bh = max(36 + 8, qh + 16)
      box.frame = NSRect(x: pad, y: y, width: inner, height: bh)
      q.frame = NSRect(x: 16, y: (bh - qh) / 2, width: qw, height: qh)
      yes.frame = NSRect(x: inner - 8 - nf.width - 8 - yf.width, y: (bh - 36) / 2, width: yf.width, height: 36)
      no.frame = NSRect(x: inner - 8 - nf.width, y: (bh - 36) / 2, width: nf.width, height: 36)
      [q, yes, no].forEach(box.addSubview)
      addSubview(box)
      y += bh + 12
    }
    // 알림 · 키 없는 동작 · 겹친 키
    for (text, color) in [
      (message ?? "", NUI.color(NUI.Hex.amber200)), (model.keylessText, NUI.color(NUI.Hex.rose200)),
      (model.conflictsText, NUI.color(NUI.Hex.red300)),
    ] where !text.isEmpty {
      let l = NUI.paragraph(text, size: 12, color: color)
      let h = NUI.height(l, width: inner)
      l.frame = NSRect(x: pad, y: y, width: inner, height: h)
      addSubview(l)
      y += h + 12
    }

    // 묶음별 동작 목록(사이트 상자는 `gap-3`이라 묶음 사이도 12)
    for (gi, g) in model.groups.enumerated() {
      if gi > 0 { y += 12 }
      let open = openGroups.contains(g.id)
      let head = FlippedView()
      // 사이트 묶음 제목(`summary`, flex)에는 펼침 표시가 없다
      let title = NUI.label(g.label, size: 12, weight: .semibold, color: NUI.white(0.8), mono: false)
      let count = NUI.label("\(g.count)", size: 12, color: NUI.white(0.45))
      var hx: CGFloat = 0
      for v in [title, count] {
        let vw = NUI.width(v)
        v.frame = NSRect(x: hx, y: 8, width: vw, height: 16)
        head.addSubview(v)
        hx += vw + 6
      }
      if g.missing > 0 {
        let badge = Chip(
          "\(SettingsSheet.noKey) \(g.missing)",
          look: Chip.Look(fill: NUI.color(NUI.Hex.rose500, 0.2), text: NUI.color(NUI.Hex.rose200), radius: 4, size: 12, padX: 6))
        let bf = badge.fit
        badge.frame = NSRect(x: hx, y: 6, width: bf.width, height: 20)
        head.addSubview(badge)
      }
      let toggle = Chip("", look: Chip.Look(padX: 0))
      toggle.identifier = NSUserInterfaceItemIdentifier("group:\(g.id)")
      toggle.setAccessibilityLabel(g.label)
      toggle.setAccessibilityExpanded(open)
      toggle.action = { [weak self] in
        guard let self else { return }
        if self.openGroups.contains(g.id) { self.openGroups.remove(g.id) } else { self.openGroups.insert(g.id) }
        self.rebuild()
      }
      toggle.frame = NSRect(x: 0, y: 0, width: inner, height: 32)
      head.addSubview(toggle)
      head.frame = NSRect(x: pad, y: y, width: inner, height: 32)
      addSubview(head)
      y += 32
      guard open else { continue }
      y += 4
      let colW = (inner - 4) / 2
      var col = 0
      var rowTop = y
      var rowMax: CGFloat = 0
      for a in g.actions {
        let row = actionRow(a, width: colW)
        row.frame.origin = NSPoint(x: pad + CGFloat(col) * (colW + 4), y: rowTop)
        addSubview(row)
        rowMax = max(rowMax, row.frame.height)
        col += 1
        if col == 2 {
          col = 0
          rowTop += rowMax + 4
          rowMax = 0
        }
      }
      y = col == 0 ? rowTop - 4 : rowTop + rowMax
    }
    y += pad
    if abs(contentHeight - y) > 0.5 {
      contentHeight = y
      onLayout?()
    }
  }

  /// 동작 한 줄: 이름 · (키 없음) · 키들(누르면 빼기) · 키 지정 · 비우기
  private func actionRow(_ a: KeymapEditorModel.Action, width: CGFloat) -> NSView {
    let row = FlippedView()
    row.fill = NSColor(white: 0, alpha: 0.2)
    row.radius = 4
    let name = NUI.label(a.label, size: 12)
    name.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
    let waiting = capturing == a.id
    let assignFocus = "assign:\(a.id)"
    let assign = chip(
      waiting ? SettingsSheet.waiting : SettingsSheet.assign, focus: assignFocus,
      fill: waiting ? NUI.color(NUI.Hex.amber400) : NUI.white(0.1), text: waiting ? .black : .white
    ) { [weak self] in self?.startCapture(a.id) }
    var tail: [Chip] = [assign]
    if !a.keys.isEmpty {
      let clear = chip(SettingsSheet.clear, focus: "clear:\(a.id)", fill: .clear, text: NUI.white(0.4)) { [weak self] in
        _ = self?.edit("clear", a.id)
        self?.reload()
      }
      clear.toolTip = SettingsSheet.clearTip
      focusFallback["clear:\(a.id)"] = assignFocus
      tail.append(clear)
    }
    var keys: [Chip] = []
    if a.keyless {
      keys.append(
        Chip(
          SettingsSheet.noKey,
          look: Chip.Look(fill: NUI.color(NUI.Hex.rose500, 0.2), text: NUI.color(NUI.Hex.rose200), radius: 4, size: 12, padX: 6)))
    }
    for k in a.keys {
      let c = chip("\(k.label) ×", focus: "unbind:\(k.id)", fill: NUI.white(0.15)) { [weak self] in
        _ = self?.edit("unbind", k.id)
        self?.reload()
      }
      c.toolTip = SettingsSheet.unbindTip
      focusFallback["unbind:\(k.id)"] = assignFocus
      keys.append(c)
    }
    // 이름 112 · 키들(줄 바꿈) · 뒤 단추들
    let nameW: CGFloat = 112
    let tailW = tail.reduce(CGFloat(0)) { $0 + $1.fit.width + 8 }
    let keysX = 8 + nameW + 8
    let keysW = max(40, width - keysX - tailW - 4)
    var kx: CGFloat = 0
    var ky: CGFloat = 0
    let lineH: CGFloat = 22
    for c in keys {
      let f = c.fit
      if kx > 0 && kx + f.width > keysW {
        kx = 0
        ky += lineH
      }
      c.frame = NSRect(x: keysX + kx, y: 4 + ky, width: f.width, height: 20)
      row.addSubview(c)
      kx += f.width + 4
    }
    let h = max(Self.rowH, ky + lineH + 6)
    name.frame = NSRect(x: 8, y: (h - 16) / 2, width: nameW, height: 16)
    row.addSubview(name)
    var tx = width - 4
    for c in tail.reversed() {
      let f = c.fit
      tx -= f.width
      c.frame = NSRect(x: tx, y: (h - 20) / 2, width: f.width, height: 20)
      row.addSubview(c)
      tx -= 8
    }
    row.frame.size = NSSize(width: width, height: h)
    return row
  }

  @objc private func mouseToggled(_ b: NSButton) {
    _ = edit("mouse", b.state == .on ? "1" : "0")
    reload()
  }

  @objc private func sizePicked(_ p: NSPopUpButton) {
    n = p.indexOfSelectedItem + 2
    reload()
  }
}

/// 내보내기·가져오기(JSON) 상자(사이트 `<details>`): 지금 배치(읽기만, 복사)와 가져올 배치(가져오기, 오류 글)
@MainActor
final class KeymapPortView: FlippedView {
  var onImport: ((String) -> String?)?
  var onLayout: (() -> Void)?
  private(set) var open = false
  private var error: String?
  private let exportView = KeymapPortView.textView(editable: false)
  private let importView = KeymapPortView.textView(editable: true)
  private(set) var contentHeight: CGFloat = 44

  override init(frame: NSRect) {
    super.init(frame: frame)
    fill = NUI.white(0.05)
    radius = 12
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  private static func textView(editable: Bool) -> NSScrollView {
    let s = NSTextView.scrollableTextView()
    s.drawsBackground = true
    s.backgroundColor = NSColor(white: 0, alpha: 0.3)
    s.borderType = .noBorder
    if let t = s.documentView as? NSTextView {
      t.isEditable = editable
      t.isSelectable = true
      t.isRichText = false
      t.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
      t.textColor = .white
      t.backgroundColor = .clear
      t.drawsBackground = false
      t.isAutomaticQuoteSubstitutionEnabled = false
      t.isAutomaticDashSubstitutionEnabled = false
      // 사이트 글 칸 `p-2`
      t.textContainerInset = NSSize(width: 4, height: 8)
    }
    s.wantsLayer = true
    s.layer?.cornerRadius = 4
    return s
  }

  private func text(_ s: NSScrollView) -> NSTextView? { s.documentView as? NSTextView }

  /// 지금 배치 글을 넣는다(저장 글이 바뀔 때마다)
  func setExport(_ text: String) {
    if self.text(exportView)?.string != text { self.text(exportView)?.string = text }
  }

  func setOpen(_ on: Bool) {
    open = on
    rebuild()
  }

  private var lastWidth: CGFloat = 0

  override func layout() {
    super.layout()
    if abs(bounds.width - lastWidth) > 0.5 { rebuild() }
  }

  /// 다시 놓는다. 키보드 포커스(펼침 단추·복사·가져오기·글 칸)는 그대로 둔다(`keepingFocus`)
  private func rebuild() {
    keepingFocus(fallback: [:]) { build() }
  }

  private func build() {
    subviews.forEach { $0.removeFromSuperview() }
    let w = bounds.width
    lastWidth = w
    guard w > 0 else { return }
    let pad: CGFloat = 12
    let marker = NUI.label(open ? "▼" : "▶", size: 9, color: .white, mono: false)
    let title = NUI.label(SettingsSheet.port, size: 14, mono: false)
    marker.frame = NSRect(x: pad, y: pad + 4, width: NUI.width(marker), height: 14)
    title.frame = NSRect(x: marker.frame.maxX + 4, y: pad, width: NUI.width(title), height: 20)
    let toggle = Chip("", look: Chip.Look(padX: 0))
    toggle.identifier = NSUserInterfaceItemIdentifier("port-toggle")
    toggle.setAccessibilityLabel(SettingsSheet.port)
    toggle.setAccessibilityExpanded(open)
    toggle.action = { [weak self] in self?.setOpen(!(self?.open ?? false)) }
    toggle.frame = NSRect(x: 0, y: 0, width: w, height: pad + 20 + 4)
    [marker, title, toggle].forEach(addSubview)
    var y = pad + 20
    var errorH: CGFloat = 0
    if open {
      y += 8
      let colW = (w - pad * 2 - 8) / 2
      for (i, (label, view)) in [(SettingsSheet.exportLabel, exportView), (SettingsSheet.importLabel, importView)].enumerated() {
        let x = pad + CGFloat(i) * (colW + 8)
        let l = NUI.label(label, size: 12, mono: false)
        l.frame = NSRect(x: x, y: y, width: colW, height: 16)
        view.frame = NSRect(x: x, y: y + 20, width: colW, height: 108)
        if let t = text(view) {
          t.frame = NSRect(origin: .zero, size: view.contentSize)
          t.minSize = NSSize(width: 0, height: view.contentSize.height)
          t.textContainer?.containerSize = NSSize(width: view.contentSize.width, height: .greatestFiniteMagnitude)
          if let c = t.textContainer { t.layoutManager?.ensureLayout(for: c) }
          t.sizeToFit()
        }
        let b = Chip(
          i == 0 ? SettingsSheet.copy : SettingsSheet.importButton,
          look: Chip.Look(fill: NUI.white(0.1), radius: 4, size: 12, padX: 8, padY: 4))
        b.identifier = NSUserInterfaceItemIdentifier(i == 0 ? "port-copy" : "port-import")
        let bf = b.fit
        b.frame = NSRect(x: x, y: y + 20 + 108 + 6, width: bf.width, height: 24)
        if i == 0 {
          b.action = { [weak self] in
            guard let self, let t = self.text(self.exportView)?.string else { return }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(t, forType: .string)
          }
        } else {
          b.action = { [weak self] in
            guard let self, let t = self.text(self.importView)?.string else { return }
            self.error = self.onImport?(t)
            self.rebuild()
          }
        }
        [l, view, b].forEach(addSubview)
        if i == 1, let err = error {
          let e = NUI.paragraph(err, size: 12, color: NUI.color(NUI.Hex.red300))
          let eh = NUI.height(e, width: colW)
          e.frame = NSRect(x: x, y: b.frame.maxY + 4, width: colW, height: eh)
          addSubview(e)
          errorH = eh + 4
        }
      }
      y += 20 + 108 + 6 + 24 + errorH
    }
    y += pad
    if abs(contentHeight - y) > 0.5 {
      contentHeight = y
      onLayout?()
    }
  }
}

extension Optional where Wrapped == String {
  /// NULL이거나 C 글로 부른다
  func withOptionalCString<R>(_ body: (UnsafePointer<CChar>?) -> R) -> R {
    switch self {
    case .some(let s): return s.withCString { body($0) }
    case .none: return body(nil)
    }
  }
}
