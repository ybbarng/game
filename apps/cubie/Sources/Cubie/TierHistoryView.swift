import AppKit
import CubieCore
import QuartzCore

/// 티어 이력 그래프(docs/47 14-8, 사이트 `TierHistoryChart.tsx`): 자리는 `TierHistoryLayout`(사이트 `history-chart.ts`와 같은
/// 셈)이 내고, 여기서는 층(Core Animation)으로 짓는다. 넓은 칸을 `draw`로 그리면 AppKit이 GPU 비동기 그리기로 돌려 드라이버
/// 메모리가 붙었던 일(docs/52 5-11)이 있어 그리지 않고 층만 쓴다
@MainActor
final class TierHistoryView: NSView {
  override var isFlipped: Bool { true }
  private var table: TierSheet.Table?
  private var history: TierProgress.History = .empty
  private var n = 3
  private var built = NSSize.zero

  override init(frame: NSRect) {
    super.init(frame: frame)
    wantsLayer = true
    layer?.cornerRadius = 12
    layer?.borderWidth = 1
    layer?.borderColor = NUI.white(0.1).cgColor
    layer?.backgroundColor = NSColor(white: 0, alpha: 0.2).cgColor
    setAccessibilityElement(true)
    setAccessibilityRole(.image)
  }

  required init?(coder: NSCoder) { fatalError("코드로만 만든다") }

  func show(n: Int, table: TierSheet.Table, history: TierProgress.History) {
    self.n = n
    self.table = table
    self.history = history
    setAccessibilityLabel(TierHistoryLayout.label(n: n, history: history))
    built = .zero
    needsLayout = true
  }

  override func layout() {
    super.layout()
    guard bounds.size != built, let table, let layer else { return }
    built = bounds.size
    layer.sublayers?.forEach { $0.removeFromSuperlayer() }
    guard
      let c = TierHistoryLayout.layout(
        table: table, history: history, width: Double(bounds.width), height: Double(bounds.height))
    else { return }
    let scale = window?.backingScaleFactor ?? 2
    let ring = TierLadderView.ring
    func color(_ tier: Int, _ a: CGFloat = 1) -> CGColor { NUI.color(ring[min(max(tier, 0), 9)], a).cgColor }
    // 층 좌표는 위가 0(이 보기는 뒤집힌 좌표, 층도 따른다)
    for b in c.bands {
      let r = CALayer()
      r.frame = CGRect(x: c.plot.x, y: b.y0, width: c.width - c.plot.x - 4, height: b.y1 - b.y0)
      r.backgroundColor = color(b.tier, 0.14)
      layer.addSublayer(r)
      if b.label {
        let t = text(TierSheet.labels[b.tier], size: 11, color: color(b.tier), scale: scale)
        let w = t.preferredFrameSize().width
        t.frame = CGRect(x: c.width - 8 - w, y: (b.y0 + b.y1) / 2 - 7, width: w, height: 14)
        layer.addSublayer(t)
      }
    }
    let path = CGMutablePath()
    for (i, p) in c.line.enumerated() {
      let pt = CGPoint(x: p.0, y: p.1)
      if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
    }
    let line = CAShapeLayer()
    line.path = path
    line.fillColor = nil
    line.strokeColor = NSColor.white.cgColor
    line.lineWidth = 2
    line.lineJoin = .round
    layer.addSublayer(line)
    for (i, d) in c.dots.enumerated() {
      let dot = CAShapeLayer()
      dot.path = CGPath(ellipseIn: CGRect(x: d.0 - 4.5, y: d.1 - 4.5, width: 9, height: 9), transform: nil)
      dot.fillColor = color(history.changes[i].to.tier)
      dot.strokeColor = NUI.color(NUI.Hex.neutral900).cgColor
      dot.lineWidth = 1.5
      layer.addSublayer(dot)
    }
    for tick in c.ticks {
      let t = text(tick.label, size: 10, color: NUI.white(0.45).cgColor, scale: scale)
      let w = t.preferredFrameSize().width
      let x =
        switch tick.anchor {
        case .start: tick.x
        case .middle: tick.x - w / 2
        case .end: tick.x - w
        }
      t.frame = CGRect(x: x, y: c.height - 18, width: w, height: 13)
      layer.addSublayer(t)
    }
  }

  private func text(_ s: String, size: CGFloat, color: CGColor, scale: CGFloat) -> CATextLayer {
    let t = CATextLayer()
    t.string = NSAttributedString(
      string: s, attributes: [.font: NUI.font(size, .regular, mono: true), .foregroundColor: NSColor(cgColor: color) ?? .white])
    t.contentsScale = scale
    return t
  }
}
