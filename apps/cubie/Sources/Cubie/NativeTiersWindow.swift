import AppKit
import CubieCore
import CubieNativeC

/// 네이티브 티어표 창(docs/52 5-8·5-11): 사이트 티어 화면(`/cube/tiers`, `TiersApp.tsx`·`TierShowcase.tsx`·`TierTable.tsx`)과
/// 같은 글·차례·동작. 크기 단추, 진열(위쪽 큰 칸에 내 티어 엠블럼을 천천히 흔들고 다음 티어까지 줄일 시간, 열 티어 사다리),
/// 티어 매기는 법, 크기별 기준표(구간 상한·WCA 경기자 비율), WCA 출처. 내 티어는 기록 창·메뉴 프로필 칸과 같은 Cubie 기록으로
/// (`TierSheet.mine`, 사이트 `?records=cubie`). 표 값은 코어가 사이트 표에서 만든 자료(`cubie_tier_table`), 엠블럼은 앱에
/// 묶은 그림이다. 사이트로 가는 글(「← 큐브」·WCA 주소)은 기본 브라우저로 연다
@MainActor
final class NativeTiersWindow: NativeSheetWindow {
  static let size = NSSize(width: 760, height: 820)
  private let store: KeyValueStore
  private let math: TierMath
  let page = TiersPageView()
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
    page.onSize = { [weak self] s in self?.show(s) }
    show(self.n)
  }

  /// 크기를 바꿔 다시 그린다(메뉴 「티어표」는 지금 큐브 크기로)
  func show(_ size: Int) {
    n = TierSheet.sizes.contains(size) ? size : 3
    let text = NativeCore.string { cubie_tier_table(UInt32(n), $0, $1) }
    guard let table = TierSheet.parse(n: n, text: text) else { return }
    let mine = TierSheet.mine(store: store, math: math, n: n)
    page.show(table: table, mine: mine)
    page.frame.size.width = scroll.contentSize.width
    page.needsLayout = true
  }

  override func becameKey() { show(n) }
}

/// 티어표 내용(가운데 너비 최대 768pt, 사이트 `max-w-3xl px-4 py-4 gap-4`)
@MainActor
final class TiersPageView: NSView {
  override var isFlipped: Bool { true }
  var onSize: ((Int) -> Void)?
  private var table: TierSheet.Table?
  private var mine: TierInfo?
  /// 사다리에서 고른 티어(nil이면 내 티어). 크기를 바꿔도 남는다(사이트와 같음)
  private(set) var picked: Int?
  private(set) var state: TierShowcase.State?
  private let back = Chip(TierSheet.back, look: Chip.Look(text: NUI.white(0.7), size: 14, padX: 4))
  private let title = NUI.label(TierSheet.title, size: 18, weight: .bold, mono: false)
  private let intro1 = NUI.paragraph(TierSheet.intro1, size: 14, color: NUI.white(0.8), lineHeight: 22.75)
  private let intro2 = NUI.paragraph(TierSheet.intro2, size: 14, color: NUI.white(0.8), lineHeight: 22.75)
  private var sizeButtons: [Chip] = []
  // 진열: 위쪽 큰 칸
  private let heroBox = FlippedView()
  let hero = EmblemSwayView(frame: NSRect(x: 0, y: 0, width: TierShowcase.heroSize, height: TierShowcase.heroSize))
  private let pips = DivisionPipsView()
  private let heroName = NSTextField(labelWithString: "")
  private let heroLine = NSTextField(labelWithString: "")
  private let heroSub = NSTextField(labelWithString: "")
  private let noneLine = NUI.paragraph(TierSheet.none, size: 14, color: NUI.white(0.7), lineHeight: 20)
  private let nextBox = InfoBox()
  private let pickedBox = InfoBox()
  private let device = NUI.paragraph(TierSheet.deviceOnly, color: NUI.white(0.5), lineHeight: 16)
  // 진열: 사다리
  let ladder = TierLadderView()
  private let sizeTitle = NUI.label("", size: 16, weight: .semibold)
  private let note = NUI.paragraph("", color: NUI.white(0.5), lineHeight: 16)
  private let grid = TierGridView()
  private let footLine = FlippedView()
  private let foot1 = NUI.paragraph("", size: 11, color: NUI.white(0.45), lineHeight: 16)
  private let foot2 = NSTextField(wrappingLabelWithString: "")

  init() {
    super.init(frame: NSRect(origin: .zero, size: NativeTiersWindow.size))
    back.action = { NUI.openSite("/cube") }
    for v in [back, title, heroBox, ladder, intro1, intro2, sizeTitle, note, grid, footLine, foot1, foot2] as [NSView] {
      addSubview(v)
    }
    for s in TierSheet.sizes {
      let b = Chip("\(s)×\(s)")
      b.action = { [weak self] in self?.onSize?(s) }
      sizeButtons.append(b)
      addSubview(b)
    }
    heroBox.radius = 16
    heroBox.border = NUI.white(0.1)
    // 테두리 상자는 넓다(736×312pt). 그리면 AppKit이 GPU 비동기 그리기로 돌려 창을 열 때 앱에 드라이버 메모리가 붙었다
    heroBox.layerDrawn = true
    for l in [heroName, heroLine, heroSub] {
      l.drawsBackground = false
      l.isSelectable = false
      l.lineBreakMode = .byTruncatingTail
    }
    // 큰 칸 안의 것들은 테두리 상자(heroBox) 위에 겹쳐 이 쪽에 바로 둔다(위치만 상자 기준)
    for v in heroParts { addSubview(v) }
    ladder.onPick = { [weak self] t in self?.pick(t) }
    footLine.fill = NUI.white(0.1)
    foot2.isSelectable = false
    foot2.drawsBackground = false
    let tap = NSClickGestureRecognizer(target: self, action: #selector(openCredit))
    foot2.addGestureRecognizer(tap)
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  /// 위쪽 큰 칸 안의 것들(테두리 상자 위에 겹쳐 놓는다)
  private var heroParts: [NSView] {
    [hero, pips, heroName, heroLine, heroSub, noneLine, nextBox, pickedBox, device]
  }

  @objc private func openCredit() {
    if let u = table.flatMap({ URL(string: $0.url) }) { NSWorkspace.shared.open(u) }
  }

  /// 사다리 칸을 눌렀다(같은 칸·내 칸이면 내 티어로)
  func pick(_ tier: Int) {
    picked = TierShowcase.pick(picked, tapped: tier, mine: mine?.tier)
    if let table { show(table: table, mine: mine) }
  }

  func show(table: TierSheet.Table, mine: TierInfo?) {
    self.table = table
    self.mine = mine
    let st = TierShowcase.state(table: table, mine: mine, picked: picked)
    state = st
    for (i, s) in TierSheet.sizes.enumerated() {
      let on = s == table.n
      sizeButtons[i].pressed = on
      sizeButtons[i].look = Chip.Look(
        fill: on ? NUI.color(NUI.Hex.sky500, 0.25) : NUI.white(0.05), text: .white,
        border: on ? NUI.color(NUI.Hex.sky300, 0.7) : NUI.white(0.15), radius: 8, size: 14, weight: .semibold, padX: 0, padY: 8)
    }
    showHero(st, table: table)
    ladder.show(st)
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

  private func tone(_ t: Int) -> NSColor { NUI.color(NUI.tierTone[min(max(t, 0), 9)]) }

  private func text(_ s: String, _ size: CGFloat, _ weight: NSFont.Weight = .regular, _ color: NSColor = .white, mono: Bool = false)
    -> NSAttributedString
  {
    NSAttributedString(
      string: s,
      attributes: [
        .font: mono ? NSFont.monospacedSystemFont(ofSize: size, weight: weight) : NUI.font(size, weight, mono: true),
        .foregroundColor: color,
      ])
  }

  private func join(_ parts: [NSAttributedString]) -> NSAttributedString {
    let s = NSMutableAttributedString()
    parts.forEach { s.append($0) }
    return s
  }

  /// 위쪽 큰 칸(사이트 `TierHero`)
  private func showHero(_ st: TierShowcase.State, table: TierSheet.Table) {
    let label = TierSheet.labels[st.hero]
    hero.show(tier: st.hero, locked: st.locked, label: "\(label) 엠블럼")
    pips.isHidden = st.pips == nil
    pips.tier = st.hero
    pips.count = st.pips ?? 0
    let row = table.rows.indices.contains(st.hero) ? table.rows[st.hero] : nil
    let none = mine == nil && st.picked == nil
    noneLine.isHidden = !none
    heroName.isHidden = none
    heroLine.isHidden = none
    heroSub.isHidden = true
    if st.picked != nil {
      heroName.attributedStringValue = text(label, 24, .bold, tone(st.hero))
      if let cut = row?.cuts.first {
        heroLine.attributedStringValue = text(TierShowcase.cutLine(cut), 14, .semibold)
      }
      if let d = row.flatMap({ TierShowcase.divisionsLine($0.cuts) }) {
        heroSub.attributedStringValue = text(d, 12, .regular, NUI.white(0.5))
        heroSub.isHidden = false
      }
    } else if let mine {
      heroName.attributedStringValue = text(mine.name, 24, .bold, tone(st.hero))
      heroLine.attributedStringValue = join([
        text(TierSheet.mineLabel + " ", 14, .regular, NUI.white(0.7)),
        text(MiniBook.formatMs(mine.ao5), 14, .semibold, .white, mono: true),
      ])
    }
    nextBox.isHidden = st.next == nil
    if let next = st.next {
      nextBox.show(
        emblem: TierInfo.ids[next.tier],
        line1: join([
          text(TierSheet.labels[next.tier], 14, .semibold, tone(next.tier)),
          text(TierShowcase.until + " ", 14),
          text(MiniBook.formatMs(next.gapMs) + "초", 14, .semibold, .white, mono: true),
        ]),
        line2: text(TierShowcase.cutLine(next.cutMs / 1000), 12, .regular, NUI.white(0.5)))
    }
    pickedBox.isHidden = !(st.picked != nil && mine != nil)
    if let mine, st.picked != nil {
      pickedBox.show(
        emblem: mine.id,
        line1: join([
          text(mine.name, 14, .semibold, tone(mine.tier)), text(" ", 14),
          text(MiniBook.formatMs(mine.ao5), 14, .semibold, .white, mono: true),
        ]),
        line2: st.pickedGapMs.map { gap in
          join([
            text(label + TierShowcase.until + " ", 12, .regular, NUI.white(0.5)),
            text(MiniBook.formatMs(gap) + "초", 12, .regular, NUI.white(0.5), mono: true),
          ])
        })
    }
  }

  /// 차례대로 쌓고 내용 높이를 정한다(사이트 차례: 머리 → 크기 단추 → 진열 → 매기는 법 → 기준표 → 출처)
  override func layout() {
    super.layout()
    let w = min(736, bounds.width - 32)
    let x0 = (bounds.width - w) / 2
    var y: CGFloat = 16
    let bf = back.fit
    back.frame = NSRect(x: x0 - 4, y: y, width: bf.width, height: 32)
    title.frame = NSRect(x: back.frame.maxX + 8, y: y + 4, width: NUI.width(title), height: 24)
    y += 32 + 16
    let bw = (w - 6 * 5) / 6
    for (i, b) in sizeButtons.enumerated() {
      b.frame = NSRect(x: x0 + CGFloat(i) * (bw + 6), y: y, width: bw, height: 38)
    }
    y += 38 + 16
    // 위쪽 큰 칸(px-4 py-4, 왼쪽 엠블럼·구간 표시, 오른쪽 글 gap-3, 둘 다 가운데 맞춤)
    let hs = CGFloat(TierShowcase.heroSize)
    let leftH = hs + (pips.isHidden ? 0 : 4 + 15)
    let rx: CGFloat = 16 + hs + 24
    let rw = w - rx - 16
    var blocks: [(NSView, CGFloat)] = []
    if !noneLine.isHidden {
      blocks.append((noneLine, NUI.height(noneLine, width: rw)))
    } else {
      let nameH: CGFloat = 32
      var h = nameH + 20
      if !heroSub.isHidden { h += 16 }
      blocks.append((heroName, h))
    }
    if !nextBox.isHidden { blocks.append((nextBox, nextBox.height)) }
    if !pickedBox.isHidden { blocks.append((pickedBox, pickedBox.height)) }
    blocks.append((device, NUI.height(device, width: rw)))
    let rightH = blocks.map(\.1).reduce(0, +) + CGFloat(blocks.count - 1) * 12
    let boxH = max(leftH, rightH) + 32
    heroBox.frame = NSRect(x: x0, y: y, width: w, height: boxH)
    let ly = (boxH - leftH) / 2
    hero.frame = NSRect(x: 16, y: ly, width: hs, height: hs)
    pips.frame = NSRect(x: 16 + (hs - 96) / 2, y: ly + hs + 4, width: 96, height: 15)
    var ry = (boxH - rightH) / 2
    for (v, h) in blocks {
      switch v {
      case heroName:
        heroName.frame = NSRect(x: rx, y: ry, width: rw, height: 32)
        heroLine.frame = NSRect(x: rx, y: ry + 32, width: rw, height: 20)
        heroSub.frame = NSRect(x: rx, y: ry + 52, width: rw, height: 16)
      default:
        v.frame = NSRect(x: rx, y: ry, width: rw, height: h)
      }
      ry += h + 12
    }
    // 숨긴 작은 상자도 제 크기를 준다(크기 0인 채 두면 그 안의 글 칸이 음수 너비가 된다)
    for b in [nextBox, pickedBox] where b.isHidden {
      b.frame = NSRect(x: rx, y: 0, width: rw, height: b.height)
    }
    // 위에서는 상자 기준으로 놓았다. 쪽 기준으로 옮긴다
    for v in heroParts { v.frame = v.frame.offsetBy(dx: x0, dy: y) }
    y += boxH + 16
    // 사다리(둘레 빛이 잘리지 않게 여백을 두른다)
    let b = TierLadderView.bleed
    ladder.frame = NSRect(x: x0 - b, y: y - b, width: w + b * 2, height: TierLadderView.contentHeight + b * 2)
    y += TierLadderView.contentHeight + 16
    for p in [intro1, intro2] {
      let h = NUI.height(p, width: w)
      p.frame = NSRect(x: x0, y: y, width: w, height: h)
      y += h + 6
    }
    y += 10
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

/// 진열 큰 칸 오른쪽의 작은 상자(사이트 `rounded-xl bg-white/5 px-3 py-2`): 정지 엠블럼 48pt와 글 두 줄(다음 티어, 고른 티어를
/// 보는 동안의 내 기록)
@MainActor
final class InfoBox: FlippedView {
  private let emblem = NSImageView()
  private let line1 = NSTextField(labelWithString: "")
  private let line2 = NSTextField(labelWithString: "")

  override init(frame: NSRect) {
    super.init(frame: frame)
    fill = NUI.white(0.05)
    radius = 12
    emblem.imageScaling = .scaleProportionallyUpOrDown
    for l in [line1, line2] {
      l.drawsBackground = false
      l.isSelectable = false
      l.lineBreakMode = .byTruncatingTail
    }
    for v in [emblem, line1, line2] as [NSView] { addSubview(v) }
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  var height: CGFloat { 48 + 16 }

  func show(emblem id: String, line1 a: NSAttributedString, line2 b: NSAttributedString?) {
    emblem.image = NUI.emblem(id, big: true)
    line1.attributedStringValue = a
    line2.attributedStringValue = b ?? NSAttributedString()
    line2.isHidden = b == nil
    needsLayout = true
  }

  override func layout() {
    super.layout()
    emblem.frame = NSRect(x: 12, y: 8, width: 48, height: 48)
    let tx: CGFloat = 12 + 48 + 12
    let th: CGFloat = line2.isHidden ? 20 : 36
    let ty = max(0, (bounds.height - th) / 2)
    // 숨긴 상자는 크기가 0일 수 있다(글 칸이 음수 너비가 되지 않게)
    let tw = max(0, bounds.width - tx - 12)
    line1.frame = NSRect(x: tx, y: ty, width: tw, height: 20)
    line2.frame = NSRect(x: tx, y: ty + 20, width: tw, height: 16)
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
