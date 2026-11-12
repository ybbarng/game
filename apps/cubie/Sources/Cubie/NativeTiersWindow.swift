import AppKit
import CubieCore
import CubieNativeC

/// 네이티브 티어표 창(docs/52 5-8): 사이트 티어표(`/cube/tiers`, `TiersApp.tsx`·`TierTable.tsx`)와 같은 글·차례·동작.
/// 크기 단추, 내 티어 상자(사이트처럼 이 기기의 혼자 맞추기 기록으로), 크기별 기준표(구간 상한·WCA 경기자 비율), WCA 출처.
/// 표 값은 코어가 사이트 표에서 만든 자료(`cubie_tier_table`), 엠블럼은 앱에 묶은 PNG다. 사이트로 가는 글(「← 큐브」·「혼자
/// 맞추기」·WCA 주소)은 기본 브라우저로 연다
@MainActor
final class NativeTiersWindow: NativeSheetWindow {
  static let size = NSSize(width: 760, height: 760)
  private let store: KeyValueStore
  private let math: TierMath
  private let page = TiersPageView()
  private let scroll = NSScrollView()
  private(set) var n: Int

  init(store: KeyValueStore, math: TierMath, n: Int) {
    self.store = store
    self.math = math
    self.n = TierSheet.sizes.contains(n) ? n : 3
    scroll.drawsBackground = true
    scroll.backgroundColor = NUI.color(NUI.Hex.neutral900)
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = true
    scroll.documentView = page
    super.init(title: "Cubie 티어표", size: Self.size, content: scroll)
    page.onPick = { [weak self] s in self?.show(s) }
    show(self.n)
  }

  /// 크기를 바꿔 다시 그린다(메뉴 「티어표」는 지금 큐브 크기로)
  func show(_ size: Int) {
    n = TierSheet.sizes.contains(size) ? size : 3
    let text = NativeCore.string { cubie_tier_table(UInt32(n), $0, $1) }
    guard let table = TierSheet.parse(n: n, text: text) else { return }
    let solo = TierSheet.soloRecords(store: store, n: n)
    let mine = math.myTier(n: n, records: solo.records, bestFive: solo.bestFive)
    page.show(table: table, mine: mine)
    page.frame.size.width = scroll.contentSize.width
    page.needsLayout = true
  }

  override func becameKey() { show(n) }
}

/// 티어표 내용(가운데 너비 최대 672pt, 사이트 `max-w-2xl px-4 py-4 gap-4`)
@MainActor
final class TiersPageView: FlippedView {
  var onPick: ((Int) -> Void)?
  private var table: TierSheet.Table?
  private var mine: TierInfo?
  private let back = Chip(TierSheet.back, look: Chip.Look(text: NUI.white(0.7), size: 14, padX: 4))
  private let title = NUI.label(TierSheet.title, size: 18, weight: .bold, mono: false)
  private let intro1 = NUI.paragraph(TierSheet.intro1, size: 14, color: NUI.white(0.8), lineHeight: 22.75)
  private let intro2 = NUI.paragraph(TierSheet.intro2, size: 14, color: NUI.white(0.8), lineHeight: 22.75)
  private var sizeButtons: [Chip] = []
  private let mineBox = FlippedView()
  private let mineEmblem = NSImageView()
  private let mineName = NUI.label("", size: 16, weight: .bold)
  private let mineLine = NSTextField(labelWithString: "")
  private let noneLine = NSTextField(labelWithString: "")
  private let noneLink = Chip(TierSheet.noneLink, look: Chip.Look(text: NUI.color(NUI.Hex.sky300), size: 14, padX: 0))
  private let noneAfter = NUI.label(TierSheet.noneAfter, size: 14, color: NUI.white(0.7))
  private let device = NUI.label(TierSheet.deviceOnly, color: NUI.white(0.5))
  private let sizeTitle = NUI.label("", size: 16, weight: .semibold)
  private let note = NUI.paragraph("", color: NUI.white(0.5), lineHeight: 16)
  private let grid = TierGridView()
  private let footLine = FlippedView()
  private let foot1 = NUI.paragraph("", size: 11, color: NUI.white(0.45), lineHeight: 16)
  private let foot2 = NSTextField(wrappingLabelWithString: "")

  init() {
    super.init(frame: NSRect(origin: .zero, size: NativeTiersWindow.size))
    fill = NUI.color(NUI.Hex.neutral900)
    back.action = { NUI.openSite("/cube") }
    noneLink.action = { NUI.openSite("/cube/solo") }
    for v in [back, title, intro1, intro2, mineBox, sizeTitle, note, grid, footLine, foot1, foot2] as [NSView] { addSubview(v) }
    for s in TierSheet.sizes {
      let b = Chip("\(s)×\(s)")
      b.action = { [weak self] in self?.onPick?(s) }
      sizeButtons.append(b)
      addSubview(b)
    }
    mineBox.fill = NUI.white(0.05)
    mineBox.radius = 12

    mineBox.border = NUI.white(0.15)
    mineEmblem.imageScaling = .scaleProportionallyUpOrDown
    for v in [mineEmblem, mineName, mineLine, noneLine, noneLink, noneAfter, device] as [NSView] { mineBox.addSubview(v) }
    footLine.fill = NUI.white(0.1)
    foot2.isSelectable = false
    foot2.drawsBackground = false
    let tap = NSClickGestureRecognizer(target: self, action: #selector(openCredit))
    foot2.addGestureRecognizer(tap)
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  @objc private func openCredit() {
    if let u = table.flatMap({ URL(string: $0.url) }) { NSWorkspace.shared.open(u) }
  }

  func show(table: TierSheet.Table, mine: TierInfo?) {
    self.table = table
    self.mine = mine
    for (i, s) in TierSheet.sizes.enumerated() {
      let on = s == table.n
      sizeButtons[i].pressed = on
      sizeButtons[i].look = Chip.Look(
        fill: on ? NUI.color(NUI.Hex.sky500, 0.25) : NUI.white(0.05), text: .white,
        border: on ? NUI.color(NUI.Hex.sky300, 0.7) : NUI.white(0.15), radius: 8, size: 14, weight: .semibold, padX: 0, padY: 8)
    }
    let has = mine != nil
    for v in [mineEmblem, mineName, mineLine] as [NSView] { v.isHidden = !has }
    noneLine.isHidden = has
    noneLink.isHidden = has
    noneAfter.isHidden = has
    if let mine {
      mineEmblem.image = NUI.emblem(mine.id, big: true)
      NUI.set(mineName, mine.name, size: 16, weight: .bold, color: NUI.color(NUI.tierTone[min(max(mine.tier, 0), 9)]))
      let s = NSMutableAttributedString(
        attributedString: NUI.attributed(TierSheet.mineLabel + " ", size: 14, color: .white))
      s.append(
        NSAttributedString(
          string: MiniBook.formatMs(mine.ao5),
          attributes: [.font: NSFont.monospacedSystemFont(ofSize: 14, weight: .semibold), .foregroundColor: NSColor.white]))
      mineLine.attributedStringValue = s
    } else {
      noneLine.attributedStringValue = NUI.attributed(TierSheet.noneBefore, size: 14, color: NUI.white(0.7))
    }
    NUI.set(sizeTitle, "\(table.n)×\(table.n)", size: 16, weight: .semibold, color: .white)
    note.attributedStringValue = NUI.attributed(
      TierSheet.tableNote(n: table.n, people: table.people), size: 12, color: NUI.white(0.5), lineHeight: 16)
    grid.show(table: table, mine: mine)
    foot1.attributedStringValue = NUI.attributed(TierSheet.footer(date: table.date), size: 11, color: NUI.white(0.45), lineHeight: 16)
    let credit = NSMutableAttributedString(
      attributedString: NUI.attributed(table.credit, size: 11, color: NUI.white(0.45), lineHeight: 16))
    if let r = table.credit.range(of: table.url) {
      credit.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: NSRange(r, in: table.credit))
    }
    foot2.attributedStringValue = credit
    needsLayout = true
  }

  /// 차례대로 쌓고 내용 높이를 정한다
  override func layout() {
    super.layout()
    let w = min(672, bounds.width - 32)
    let x0 = (bounds.width - w) / 2
    var y: CGFloat = 16
    let bf = back.fit
    back.frame = NSRect(x: x0 - 4, y: y, width: bf.width, height: 32)
    title.frame = NSRect(x: back.frame.maxX + 8, y: y + 4, width: NUI.width(title), height: 24)
    y += 32 + 16
    for p in [intro1, intro2] {
      let h = NUI.height(p, width: w)
      p.frame = NSRect(x: x0, y: y, width: w, height: h)
      y += h + 6
    }
    y += 10
    let bw = (w - 6 * 5) / 6
    for (i, b) in sizeButtons.enumerated() {
      b.frame = NSRect(x: x0 + CGFloat(i) * (bw + 6), y: y, width: bw, height: 38)
    }
    y += 38 + 16
    // 내 티어 상자(px-4 py-3)
    let iw = w - 32
    var by: CGFloat = 12
    if mine != nil {
      mineEmblem.frame = NSRect(x: 16, y: by, width: 64, height: 64)
      mineName.frame = NSRect(x: 92, y: by + 12, width: iw - 76, height: 22)
      mineLine.frame = NSRect(x: 92, y: by + 34, width: iw - 76, height: 20)
      by += 64
    } else {
      let nw = NUI.width(noneLine)
      noneLine.frame = NSRect(x: 16, y: by, width: nw, height: 20)
      let lf = noneLink.fit
      noneLink.frame = NSRect(x: 16 + nw, y: by, width: lf.width, height: 20)
      let after = noneAfter
      after.frame = NSRect(x: noneLink.frame.maxX, y: by, width: NUI.width(after), height: 20)
      by += 20
    }
    by += 4
    device.frame = NSRect(x: 16, y: by, width: iw, height: 16)
    by += 16 + 12
    mineBox.frame = NSRect(x: x0, y: y, width: w, height: by)
    y += by + 16
    // 크기 표
    sizeTitle.frame = NSRect(x: x0, y: y, width: w, height: 24)
    y += 24 + 4
    let nh = NUI.height(note, width: w)
    note.frame = NSRect(x: x0, y: y, width: w, height: nh)
    y += nh + 4
    let gh = grid.contentHeight
    grid.frame = NSRect(x: x0, y: y, width: w, height: gh)
    y += gh + 16
    footLine.frame = NSRect(x: x0, y: y, width: w, height: 1)
    y += 13
    let f1 = NUI.height(foot1, width: w)
    foot1.frame = NSRect(x: x0, y: y, width: w, height: f1)
    y += f1 + 4
    let f2 = NUI.height(foot2, width: w)
    foot2.frame = NSRect(x: x0, y: y, width: w, height: f2)
    y += f2 + 16
    if abs(frame.height - y) > 0.5 {
      frame.size.height = max(y, enclosingScrollView?.contentSize.height ?? 0)
    }
  }

  override func resize(withOldSuperviewSize oldSize: NSSize) {
    super.resize(withOldSuperviewSize: oldSize)
    if let s = enclosingScrollView { frame.size.width = s.contentSize.width }
  }

  override func viewDidMoveToSuperview() {
    super.viewDidMoveToSuperview()
    autoresizingMask = [.width]
  }
}

/// 크기 하나의 기준표(사이트 `TierTable`, 넓은 창 꼴: 티어 · IV III II I · WCA 경기자 중). 챌린저가 맨 위
@MainActor
final class TierGridView: FlippedView {
  static let rowH: CGFloat = 40
  static let headH: CGFloat = 20
  private var views: [NSView] = []

  var contentHeight: CGFloat { Self.headH + CGFloat(views.isEmpty ? 0 : 10) * (Self.rowH + 4) }

  func show(table: TierSheet.Table, mine: TierInfo?) {
    self.table = table
    self.mine = mine
    build()
  }

  private var table: TierSheet.Table?
  private var mine: TierInfo?
  private var built: CGFloat = 0

  override func layout() {
    super.layout()
    if built != bounds.width { build() }
  }

  private func build() {
    views.forEach { $0.removeFromSuperview() }
    views = []
    built = bounds.width
    guard let table, bounds.width > 0 else { return }
    let w = bounds.width
    // 너비: 티어 24%, 구간 넷이 나눔, WCA 24%
    let tierW = w * 0.24
    let wcaW = w * 0.24
    let cellW = (w - tierW - wcaW) / 4
    func add(_ v: NSView, _ r: NSRect) {
      v.frame = r
      addSubview(v)
      views.append(v)
    }
    let head = NUI.label(TierSheet.headTier, color: NUI.white(0.5))
    add(head, NSRect(x: 0, y: 2, width: tierW, height: 16))
    for (i, d) in TierSheet.divisions.enumerated() {
      let l = NUI.label(d, color: NUI.white(0.5))
      l.alignment = .center
      add(l, NSRect(x: tierW + CGFloat(i) * cellW, y: 2, width: cellW, height: 16))
    }
    let wh = NUI.label(TierSheet.headWca, color: NUI.white(0.5))
    wh.alignment = .right
    add(wh, NSRect(x: w - wcaW, y: 2, width: wcaW, height: 16))
    var y = Self.headH + 4
    let here = mine
    for row in table.rows.reversed() {
      let mineRow = here?.tier == row.tier
      let bg = FlippedView()
      bg.fill = mineRow ? NUI.white(0.1) : .clear
      bg.radius = 8
      add(bg, NSRect(x: 0, y: y, width: w, height: Self.rowH))
      let emb = NSImageView()
      emb.imageScaling = .scaleProportionallyUpOrDown
      emb.image = NUI.emblem(TierInfo.ids[row.tier])
      add(emb, NSRect(x: 8, y: y + (Self.rowH - 28) / 2, width: 28, height: 28))
      let name = NUI.label(TierSheet.labels[row.tier], size: 14, weight: .semibold, color: NUI.color(NUI.tierTone[row.tier]))
      add(name, NSRect(x: 42, y: y + (Self.rowH - 20) / 2, width: tierW - 44, height: 20))
      if row.cuts.count == 4 {
        for (d, cut) in row.cuts.enumerated() {
          let on = mineRow && here?.division == d
          let l = NUI.label(TierSheet.cutText(cut), size: 14, weight: on ? .bold : .regular, color: on ? NUI.color(NUI.Hex.amber200) : .white)
          l.alignment = .center
          let r = NSRect(x: tierW + CGFloat(d) * cellW + 2, y: y + (Self.rowH - 26) / 2, width: cellW - 4, height: 26)
          if on {
            let box = FlippedView()

            box.radius = 6

            box.border = NUI.color(NUI.Hex.amber300, 0.7)
            add(box, r)
          }
          add(l, NSRect(x: r.minX, y: y + (Self.rowH - 18) / 2, width: r.width, height: 18))
        }
      } else {
        let on = mineRow
        let l = NUI.label(
          TierSheet.singleText(row.cuts[0]), size: 14, weight: on ? .bold : .regular, color: on ? NUI.color(NUI.Hex.amber200) : .white)
        l.alignment = .center
        add(l, NSRect(x: tierW, y: y + (Self.rowH - 18) / 2, width: cellW * 4, height: 18))
      }
      let wca = NUI.label(TierSheet.wcaText(row), color: NUI.white(0.6))
      wca.alignment = .right
      add(wca, NSRect(x: w - wcaW, y: y + (Self.rowH - 16) / 2, width: wcaW - 8, height: 16))
      y += Self.rowH + 4
    }
  }
}
