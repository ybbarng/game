import AppKit
import CubieCore
import CubieNativeC

/// 네이티브 설정 창(docs/52 5-8, 메뉴 「키 배치·색…」): 사이트 설정 화면(`/cube/settings`, `CubeSettingsApp.tsx`) 가운데 Cubie가
/// 쓰는 것만 같은 글·차례로 보인다(`SettingsSheet`). 바꾸면 바로 앱 저장소에 쓰고 큐브 창·단축키 표가 다시 읽는다(`onChange`).
/// 사용자 배치 편집(키 지정·겹친 키 묻기·내보내기)과 Cubie가 쓰지 않는 설정은 「사용자 배치 편집…」·「모든 설정…」이 예전 사이트
/// 창을 연다(`openWeb`)
@MainActor
final class NativeSettingsWindow: NativeSheetWindow {
  static let size = NSSize(width: 760, height: 720)
  private let page: SettingsPageView
  private let scroll = NSScrollView()

  init(store: KeyValueStore, onChange: @escaping () -> Void, openWeb: @escaping () -> Void) {
    page = SettingsPageView(store: store)
    scroll.drawsBackground = true
    scroll.backgroundColor = NUI.color(NUI.Hex.neutral900)
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = true
    scroll.documentView = page
    super.init(title: "Cubie 키 배치·색", size: Self.size, content: scroll)
    page.onChange = onChange
    page.openWeb = openWeb
    page.frame.size.width = scroll.contentSize.width
    page.reload()
  }

  /// 다른 곳(사이트 설정 창)에서 바뀐 설정을 다시 읽는다
  func reload() { page.reload() }
  override func becameKey() { page.reload() }
}

@MainActor
final class SettingsPageView: FlippedView {
  private let store: KeyValueStore
  var onChange: (() -> Void)?
  var openWeb: (() -> Void)?

  private let back = Chip(SettingsSheet.back, look: Chip.Look(text: NUI.white(0.7), size: 14, padX: 4))
  private let title = NUI.label(SettingsSheet.title, size: 20, weight: .bold, mono: false)
  private let keymapTitle = NUI.label(SettingsSheet.keymapTitle, size: 18, weight: .semibold, mono: false)
  private let keysMap = Chip(SettingsSheet.keysMapLink, look: Chip.Look(text: NUI.color(NUI.Hex.sky300), size: 14, padX: 0))
  private let keysLearn = Chip(SettingsSheet.keysLearnLink, look: Chip.Look(text: NUI.color(NUI.Hex.sky300), size: 14, padX: 0))
  private var presetChips: [Chip] = []
  private let customBox = FlippedView()
  private let editCustom = Chip(SettingsSheet.editCustom, look: Chip.Look(fill: NUI.white(0.1), size: 12, padX: 8, padY: 4))

  private let colorsTitle = NUI.label(SettingsSheet.colorsTitle, size: 18, weight: .semibold, mono: false)
  private var schemeChips: [Chip] = []
  private let customChip = Chip(SettingsSheet.customScheme)
  private var preview: CACubeView
  private var wells: [NSColorWell] = []
  private var wellLabels: [NSTextField] = []

  private let viewTitle = NUI.label(SettingsSheet.viewTitle, size: 18, weight: .semibold, mono: false)
  private let speedLabel = NUI.label(SettingsSheet.moveSpeed, size: 14, mono: false)
  private let speedValue = NUI.label("", size: 14, weight: .bold)
  private let slider = NSSlider(value: 90, minValue: 0, maxValue: 200, target: nil, action: nil)
  private let showLabel = NUI.label(SettingsSheet.scrambleShow, size: 14, mono: false)
  private var showChips: [Chip] = []
  private let showNote = NUI.paragraph(SettingsSheet.scrambleShowNote, color: NUI.white(0.5), lineHeight: 16)
  private let stickerless = NSButton(checkboxWithTitle: SettingsSheet.stickerless, target: nil, action: nil)
  private let sound = NSButton(checkboxWithTitle: SettingsSheet.sound, target: nil, action: nil)
  private let all = Chip(SettingsSheet.allSettings, look: Chip.Look(fill: NUI.white(0.1), size: 14, padX: 12, padY: 4))

  private var settingsText: String? { store.string(CubeSettings.key) }
  private var keymapText: String? { store.string(StoredKeymap.key) }

  init(store: KeyValueStore) {
    self.store = store
    preview = CACubeView(frame: NSRect(x: 0, y: 0, width: 192, height: 144), n: 3)
    super.init(frame: NSRect(origin: .zero, size: NativeSettingsWindow.size))
    fill = NUI.color(NUI.Hex.neutral900)
    back.action = { NUI.openSite("/cube") }
    keysMap.action = { NUI.openSite("/cube/keys") }
    keysLearn.action = { NUI.openSite("/cube/intro?part=keys") }
    for (id, label) in SettingsSheet.presets {
      let c = Chip(label)
      c.action = { [weak self] in self?.pickPreset(id) }
      presetChips.append(c)
    }
    customBox.fill = NUI.white(0.05)
    customBox.radius = 12
    customBox.addSubview(editCustom)
    editCustom.action = { [weak self] in self?.openWeb?() }
    for (id, label) in SettingsSheet.schemes {
      let c = Chip(label)
      c.action = { [weak self] in self?.write(settings: SettingsSheet.withScheme(self?.settingsText, id)) }
      schemeChips.append(c)
    }
    preview.reducedMotion = true
    preview.setMirror(true)
    for (f, label) in SettingsSheet.faceLabels.enumerated() {
      let w = NSColorWell(style: .minimal)
      w.tag = f
      w.target = self
      w.action = #selector(colorPicked(_:))
      wells.append(w)
      wellLabels.append(NUI.label(label, size: 14, mono: false))
    }
    // 10ms 단위(사이트 step 10)는 `speedChanged`가 맞춘다. 눈금은 그리지 않는다(사이트 range 입력처럼)
    slider.target = self
    slider.action = #selector(speedChanged)
    for (id, label) in SettingsSheet.scrambleShows {
      let c = Chip(label)
      c.action = { [weak self] in
        self?.write(settings: SettingsSheet.updated(self?.settingsText) { $0["scrambleShow"] = id })
      }
      showChips.append(c)
    }
    for b in [stickerless, sound] {
      b.target = self
      b.action = #selector(toggled(_:))
      b.font = NUI.font(14, mono: false)
    }
    all.action = { [weak self] in self?.openWeb?() }
    var views: [NSView] = [back, title, keymapTitle, keysMap, keysLearn, customBox, colorsTitle, customChip, preview]
    views.append(contentsOf: [viewTitle, speedLabel, speedValue, slider, showLabel, showNote, stickerless, sound, all])
    views.append(contentsOf: presetChips as [NSView])
    views.append(contentsOf: schemeChips as [NSView])
    views.append(contentsOf: wells as [NSView])
    views.append(contentsOf: wellLabels as [NSView])
    views.append(contentsOf: showChips as [NSView])
    views.forEach(addSubview)
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  private static func chipLook(_ on: Bool) -> Chip.Look {
    Chip.Look(
      fill: on ? NUI.color(NUI.Hex.sky500) : NUI.white(0.1), text: on ? .black : .white, radius: 8, size: 14, padX: 12, padY: 4)
  }

  /// 저장소에서 지금 값을 읽어 칸마다 보인다
  func reload() {
    let s = CubeSettings.parse(settingsText)
    let keymap = StoredKeymap.parse(keymapText)
    for (i, (id, _)) in SettingsSheet.presets.enumerated() {
      presetChips[i].look = Self.chipLook(keymap.preset == id)
      presetChips[i].pressed = keymap.preset == id
    }
    customBox.isHidden = keymap.preset != "custom"
    let scheme = SettingsSheet.scheme(settingsText)
    for (i, (id, _)) in SettingsSheet.schemes.enumerated() {
      schemeChips[i].look = Self.chipLook(scheme == id)
      schemeChips[i].pressed = scheme == id
    }
    customChip.look = Self.chipLook(true)
    customChip.isHidden = scheme != "custom"
    preview.setColors(s.colors, masked: s.hiddenColor)
    if preview.stickerless != s.stickerless {
      preview.stickerless = s.stickerless
      preview.rebuild()
    }
    for (f, w) in wells.enumerated() {
      let c = s.colors[f]
      w.color = NUI.color(c)
    }
    slider.doubleValue = s.moveMs
    NUI.set(speedValue, "\(Int(s.moveMs))ms", size: 14, weight: .bold, color: .white)
    for (i, (id, _)) in SettingsSheet.scrambleShows.enumerated() {
      showChips[i].look = Self.chipLook(s.scrambleShow.rawValue == id)
      showChips[i].pressed = s.scrambleShow.rawValue == id
    }
    stickerless.state = s.stickerless ? .on : .off
    sound.state = s.sound ? .on : .off
    needsLayout = true
  }

  private func write(settings: String) {
    store.set(settings, for: CubeSettings.key)
    reload()
    onChange?()
  }

  private func pickPreset(_ id: String) {
    let text =
      id == "custom"
      ? SettingsSheet.toCustom(keymapText) { p in p.withCString { c in NativeCore.string { cubie_preset_bindings(c, $0, $1) } } }
      : SettingsSheet.presetKeymap(id)
    store.set(text, for: StoredKeymap.key)
    reload()
    onChange?()
  }

  @objc private func colorPicked(_ w: NSColorWell) {
    guard let c = w.color.usingColorSpace(.sRGB) else { return }
    let hex =
      (UInt32((c.redComponent * 255).rounded()) << 16) | (UInt32((c.greenComponent * 255).rounded()) << 8)
      | UInt32((c.blueComponent * 255).rounded())
    write(settings: SettingsSheet.withFaceColor(settingsText, face: w.tag, color: hex))
  }

  @objc private func speedChanged() {
    let v = (slider.doubleValue / 10).rounded() * 10
    write(settings: SettingsSheet.updated(settingsText) { $0["moveMs"] = Int(v) })
  }

  @objc private func toggled(_ b: NSButton) {
    let key = b === stickerless ? "stickerless" : "sound"
    write(settings: SettingsSheet.updated(settingsText) { $0[key] = b.state == .on })
  }

  /// 칩 한 줄을 왼쪽부터 놓는다(gap 8). 끝 x를 돌려준다
  @discardableResult
  private func row(_ chips: [Chip], x: CGFloat, y: CGFloat, height: CGFloat = 28) -> CGFloat {
    var x = x
    for c in chips where !c.isHidden {
      let f = c.fit
      c.frame = NSRect(x: x, y: y, width: f.width, height: height)
      x += f.width + 8
    }
    return x
  }

  override func layout() {
    super.layout()
    let w = min(736, bounds.width - 32)
    let x0 = (bounds.width - w) / 2
    var y: CGFloat = 20
    let bf = back.fit
    back.frame = NSRect(x: x0 - 4, y: y, width: bf.width, height: 32)
    title.frame = NSRect(x: back.frame.maxX + 8, y: y + 3, width: NUI.width(title), height: 26)
    y += 32 + 24
    // 키 배치
    keymapTitle.frame = NSRect(x: x0, y: y, width: NUI.width(keymapTitle), height: 24)
    let km = keysMap.fit
    keysMap.frame = NSRect(x: keymapTitle.frame.maxX + 12, y: y + 3, width: km.width, height: 20)
    let kl = keysLearn.fit
    keysLearn.frame = NSRect(x: keysMap.frame.maxX + 12, y: y + 3, width: kl.width, height: 20)
    y += 24 + 12
    row(presetChips, x: x0, y: y)
    y += 28 + 12
    if !customBox.isHidden {
      let ef = editCustom.fit
      editCustom.frame = NSRect(x: 12, y: 12, width: ef.width, height: 24)
      customBox.frame = NSRect(x: x0, y: y, width: w, height: 48)
      y += 48 + 12
    }
    y += 12
    // 색
    colorsTitle.frame = NSRect(x: x0, y: y, width: NUI.width(colorsTitle), height: 24)
    y += 24 + 12
    let end = row(schemeChips, x: x0, y: y)
    let cf = customChip.fit
    customChip.frame = NSRect(x: end, y: y, width: cf.width, height: 28)
    y += 28 + 12
    preview.frame = NSRect(x: x0, y: y, width: 192, height: 144)
    let gx = x0 + 192 + 16
    let colW: CGFloat = 150
    for (f, well) in wells.enumerated() {
      let cx = gx + CGFloat(f % 3) * (colW + 16)
      let cy = y + 40 + CGFloat(f / 3) * 32
      well.frame = NSRect(x: cx, y: cy, width: 36, height: 28)
      wellLabels[f].frame = NSRect(x: cx + 44, y: cy + 4, width: colW - 44, height: 20)
    }
    y += 144 + 24
    // 보기와 소리
    viewTitle.frame = NSRect(x: x0, y: y, width: NUI.width(viewTitle), height: 24)
    y += 24 + 12
    speedLabel.frame = NSRect(x: x0, y: y + 2, width: NUI.width(speedLabel), height: 20)
    speedValue.frame = NSRect(x: speedLabel.frame.maxX + 6, y: y + 2, width: 56, height: 20)
    slider.frame = NSRect(x: speedValue.frame.maxX + 8, y: y, width: 160, height: 28)
    y += 28 + 12
    showLabel.frame = NSRect(x: x0, y: y + 4, width: NUI.width(showLabel), height: 20)
    row(showChips, x: showLabel.frame.maxX + 8, y: y)
    y += 28 + 4
    let nh = NUI.height(showNote, width: w)
    showNote.frame = NSRect(x: x0, y: y, width: w, height: nh)
    y += nh + 12
    for b in [stickerless, sound] {
      b.frame = NSRect(x: x0, y: y, width: w, height: 20)
      y += 20 + 12
    }
    y += 12
    let af = all.fit
    all.frame = NSRect(x: x0, y: y, width: af.width, height: 28)
    y += 28 + 20
    let h = max(y, enclosingScrollView?.contentSize.height ?? 0)
    if abs(frame.height - h) > 0.5 { frame.size.height = h }
  }

  override func viewDidMoveToSuperview() {
    super.viewDidMoveToSuperview()
    autoresizingMask = [.width]
  }

  /// 스크린샷용: 색 미리 보기 큐브(창에 붙지 않은 같은 모양)
  func shotCube() -> CACubeView {
    let s = CubeSettings.parse(settingsText)
    let c = CACubeView(frame: preview.frame, n: 3)
    c.setColors(s.colors, masked: s.hiddenColor)
    c.stickerless = s.stickerless
    c.buildForShot()
    c.reducedMotion = true
    c.setMirror(true)
    return c
  }
}
