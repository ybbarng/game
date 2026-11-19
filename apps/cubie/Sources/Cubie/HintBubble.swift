import AppKit
import CubieCore

/// 「공식 보기」 말풍선(docs/47 15-15): 큐브 창 옆에 잠깐 뜨는 작은 패널. 기본 창(96pt)에는 글이 들어가지 않아 앱이 옆에 그린다.
/// - 내용은 웹이 줄로 보낸다(`app-bridge.ts` `BubbleLine`: 글과 꼴 title·note·alg·keys·plain·ok). 앱은 줄마다 글꼴만 고른다.
///   줄에 `spans`가 있으면 그 줄을 낱말마다 색을 달리해 그린다(공식 연습의 친 것·지금 칠 것·틀린 것, docs/47 16-11).
///   키를 적는 줄은 수 표기(move, 고정폭 글자)와 키(key, 키캡 상자)를 갈라 그린다(사이트 `MoveChip`과 같은 규칙, docs/47 4-4).
///   공식 연습도 같은 말풍선을 쓴다(작은 창일 때 공식과 판 끝 결과).
/// - 포커스를 빼앗지 않고(키를 받지 않음) 마우스는 지나간다. 숨기기는 웹이 정한다(5초 뒤·수를 둠).
///   새 판 알림(`UpdateNotice`)일 때만 누를 수 있다(`show(…, onClick:)`, 누르면 Sparkle 창).

/// - 자리는 `WindowPlacement.bubbleFrame`(창 옆 화면 안쪽, 보이는 영역 안).
@MainActor
final class HintBubble {
  private let panel: NSPanel
  private let label = NSTextField(labelWithString: "")
  private let box = BubbleBox()
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

  /// 새 판 알림 말풍선의 줄(판 번호와 「설치」만, `UpdateNotice.text`)
  static func updateLines(version: String) -> [[String: Any]] {
    [["text": UpdateNotice.text(version: version), "style": "title"]]
  }

  /// 줄들을 그리고 큐브 창 옆에 띄운다. `cube`는 큐브 창 자리, `visible`은 그 창이 있는 화면의 보이는 영역.
  /// `onClick`이 있으면 말풍선을 누를 수 있다(없으면 마우스가 지나간다)
  func show(lines: [[String: Any]], cube: NSRect, visible: NSRect, onClick: (() -> Void)? = nil) {
    box.onClick = onClick
    panel.ignoresMouseEvents = onClick == nil
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

  func hide() {
    box.onClick = nil
    panel.ignoresMouseEvents = true
    panel.orderOut(nil)
  }

  /// 스크린샷용: 줄들을 그린 상자(창은 띄우지 않는다)
  func layoutForShot(lines: [[String: Any]]) -> NSView {
    label.attributedStringValue = Self.text(lines)
    let fit = label.sizeThatFits(NSSize(width: Self.maxWidth - Self.padding * 2, height: .greatestFiniteMagnitude))
    label.frame = NSRect(x: Self.padding, y: Self.padding, width: ceil(fit.width), height: ceil(fit.height))
    box.frame = NSRect(x: 0, y: 0, width: ceil(fit.width) + Self.padding * 2, height: ceil(fit.height) + Self.padding * 2)
    return box
  }

  private static func text(_ lines: [[String: Any]]) -> NSAttributedString {
    let out = NSMutableAttributedString()
    let para = NSMutableParagraphStyle()
    para.lineSpacing = 2
    para.paragraphSpacing = 3
    // 사이트 `break-keep`처럼 낱말 가운데서 줄을 바꾸지 않는다(공식 연습·홈 시연 말풍선)
    para.lineBreakStrategy = .hangulWordPriority
    for (i, line) in lines.enumerated() {
      let text = line["text"] as? String ?? ""
      let style = line["style"] as? String ?? "plain"
      let (font, color): (NSFont, NSColor) =
        switch style {
        case "title": (.systemFont(ofSize: 12, weight: .semibold), .white)
        case "note": (.systemFont(ofSize: 11), NSColor(calibratedRed: 0.73, green: 0.87, blue: 1, alpha: 1))
        case "alg": (.monospacedSystemFont(ofSize: 14, weight: .semibold), .white)
        case "keys": (.monospacedSystemFont(ofSize: 11, weight: .regular), NSColor(white: 1, alpha: 0.7))
        case "ok": (.systemFont(ofSize: 12, weight: .semibold), NSColor.systemGreen)
        default: (.systemFont(ofSize: 12), .white)
        }
      let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .paragraphStyle: para]
      if i > 0 { out.append(NSAttributedString(string: "\n", attributes: attrs)) }
      if let spans = line["spans"] as? [[String: Any]], !spans.isEmpty {
        for span in spans {
          var a = attrs
          let text = span["text"] as? String ?? ""
          switch span["style"] as? String {
          case "done": a[.foregroundColor] = NSColor.systemGreen
          case "now": a[.underlineStyle] = NSUnderlineStyle.single.rawValue
          case "wrong": a[.foregroundColor] = NSColor.systemRed
          case "plain": break
          case "move":
            a[.font] = NSFont.monospacedSystemFont(ofSize: max(font.pointSize, 13), weight: .semibold)
            a[.foregroundColor] = NSColor.white
          case "key":
            out.append(Self.keycap(text, line: font, attrs: attrs))
            continue
          case "arrow":
            a[.font] = NSFont.systemFont(ofSize: 9)
            a[.foregroundColor] = NSColor(white: 1, alpha: 0.6)
          default: a[.foregroundColor] = NSColor(white: 1, alpha: 0.6)
          }
          let shown = span["style"] as? String == "move" ? text : TextWrap.keepNumberUnits(text)
          out.append(NSAttributedString(string: shown, attributes: a))
        }
      } else {
        // 수 표기·키 줄은 그대로, 안내 글은 숫자와 단위를 갈라 끊지 않는다(`TextWrap`)
        let shown = style == "alg" || style == "keys" ? text : TextWrap.keepNumberUnits(text)
        out.append(NSAttributedString(string: shown, attributes: attrs))
      }
    }
    return out
  }

  /// 키 하나를 키캡 상자로(사이트 `KeyCaps`의 `<kbd>`: 둥근 테두리, 보통 글꼴 굵게 11, docs/47 4-4 「수 표기와 키」).
  /// 수 표기는 고정폭 글자라 상자 안의 키와 한눈에 갈린다. 상자는 줄 글자의 가운데 높이에 맞춘다
  static func keycap(_ label: String, line: NSFont, attrs: [NSAttributedString.Key: Any]) -> NSAttributedString {
    let font = NSFont.systemFont(ofSize: 11, weight: .semibold)
    let textAttrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(white: 1, alpha: 0.92)]
    let textSize = (label as NSString).size(withAttributes: textAttrs)
    let height: CGFloat = 16
    let width = max(16, ceil(textSize.width) + 8)
    let image = NSImage(size: NSSize(width: width + 2, height: height), flipped: false) { _ in
      let box = NSRect(x: 1.5, y: 0.5, width: width - 1, height: height - 1)
      let path = NSBezierPath(roundedRect: box, xRadius: 3, yRadius: 3)
      NSColor(white: 1, alpha: 0.08).setFill()
      path.fill()
      NSColor(white: 1, alpha: 0.45).setStroke()
      path.lineWidth = 1
      path.stroke()
      let origin = NSPoint(x: 1 + (width - textSize.width) / 2, y: (height - textSize.height) / 2)
      (label as NSString).draw(at: origin, withAttributes: textAttrs)
      return true
    }
    let attachment = NSTextAttachment()
    attachment.image = image
    // 줄 글자의 x 높이 가운데에 상자 가운데를 맞춘다
    let y = round((line.xHeight - height) / 2)
    attachment.bounds = NSRect(x: 0, y: y, width: image.size.width, height: height)
    let s = NSMutableAttributedString(attachment: attachment)
    s.addAttributes(attrs, range: NSRange(location: 0, length: s.length))
    return s
  }
}

/// 말풍선 바탕. 누를 수 있는 말풍선(새 판 알림)이면 누르기를 받는다. 창이 키가 아니어도 첫 누름을 받는다
private final class BubbleBox: NSView {
  var onClick: (() -> Void)?
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  override func hitTest(_ point: NSPoint) -> NSView? {
    onClick != nil && frame.contains(point) ? self : nil
  }
  // 누름은 여기서 받고(다음 응답자로 넘기지 않는다), 뗄 때 말풍선 안이면 누른 것으로
  override func mouseDown(with event: NSEvent) {}
  override func mouseUp(with event: NSEvent) {
    if bounds.contains(convert(event.locationInWindow, from: nil)) { onClick?() }
  }
  override func resetCursorRects() {
    if onClick != nil { addCursorRect(bounds, cursor: .pointingHand) }
  }
}
