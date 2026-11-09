import AppKit
import CubieCore

/// 「공식 보기」 말풍선(docs/47 15-15): 큐브 창 옆에 잠깐 뜨는 작은 패널. 기본 창(96pt)에는 글이 들어가지 않아 앱이 옆에 그린다.
/// - 내용은 웹이 줄로 보낸다(`app-bridge.ts` `BubbleLine`: 글과 꼴 title·note·alg·keys·plain). 앱은 줄마다 글꼴만 고른다.
/// - 포커스를 빼앗지 않고(키를 받지 않음) 마우스는 지나간다. 숨기기는 웹이 정한다(5초 뒤·수를 둠).
/// - 자리는 `WindowPlacement.bubbleFrame`(창 옆 화면 안쪽, 보이는 영역 안).
@MainActor
final class HintBubble {
  private let panel: NSPanel
  private let label = NSTextField(labelWithString: "")
  private let box = NSView()
  private static let padding: CGFloat = 10
  private static let maxWidth: CGFloat = 300

  init() {
    panel = NSPanel(
      contentRect: NSRect(x: 0, y: 0, width: 200, height: 60),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered, defer: true)
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.level = .floating
    panel.ignoresMouseEvents = true
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.becomesKeyOnlyIfNeeded = true
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]

    box.wantsLayer = true
    box.layer?.backgroundColor = NSColor(white: 0.08, alpha: 0.92).cgColor
    box.layer?.cornerRadius = 10
    box.layer?.borderColor = NSColor(white: 1, alpha: 0.15).cgColor
    box.layer?.borderWidth = 1
    label.maximumNumberOfLines = 0
    label.lineBreakMode = .byWordWrapping
    label.preferredMaxLayoutWidth = Self.maxWidth - Self.padding * 2
    box.addSubview(label)
    panel.contentView = box
  }

  var isShown: Bool { panel.isVisible }

  /// 줄들을 그리고 큐브 창 옆에 띄운다. `cube`는 큐브 창 자리, `visible`은 그 창이 있는 화면의 보이는 영역
  func show(lines: [[String: Any]], cube: NSRect, visible: NSRect) {
    label.attributedStringValue = Self.text(lines)
    let fit = label.sizeThatFits(NSSize(width: Self.maxWidth - Self.padding * 2, height: .greatestFiniteMagnitude))
    let size = NSSize(width: ceil(fit.width) + Self.padding * 2, height: ceil(fit.height) + Self.padding * 2)
    label.frame = NSRect(x: Self.padding, y: Self.padding, width: ceil(fit.width), height: ceil(fit.height))
    let frame = WindowPlacement.bubbleFrame(cube: cube, bubble: size, visible: visible)
    panel.setFrame(frame, display: true)
    panel.orderFrontRegardless()
  }

  /// 창이 옮겨 가면 따라간다(보이는 동안만)
  func follow(cube: NSRect, visible: NSRect) {
    guard panel.isVisible else { return }
    panel.setFrame(
      WindowPlacement.bubbleFrame(cube: cube, bubble: panel.frame.size, visible: visible), display: true)
  }

  func hide() { panel.orderOut(nil) }

  private static func text(_ lines: [[String: Any]]) -> NSAttributedString {
    let out = NSMutableAttributedString()
    let para = NSMutableParagraphStyle()
    para.lineSpacing = 2
    para.paragraphSpacing = 3
    for (i, line) in lines.enumerated() {
      let text = line["text"] as? String ?? ""
      let style = line["style"] as? String ?? "plain"
      let (font, color): (NSFont, NSColor) =
        switch style {
        case "title": (.systemFont(ofSize: 12, weight: .semibold), .white)
        case "note": (.systemFont(ofSize: 11), NSColor(calibratedRed: 0.73, green: 0.87, blue: 1, alpha: 1))
        case "alg": (.monospacedSystemFont(ofSize: 14, weight: .semibold), .white)
        case "keys": (.monospacedSystemFont(ofSize: 11, weight: .regular), NSColor(white: 1, alpha: 0.7))
        default: (.systemFont(ofSize: 12), .white)
        }
      out.append(
        NSAttributedString(
          string: (i > 0 ? "\n" : "") + text,
          attributes: [.font: font, .foregroundColor: color, .paragraphStyle: para]))
    }
    return out
  }
}
