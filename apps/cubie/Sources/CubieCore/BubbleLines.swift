import Foundation

/// 코어가 준 글 → 말풍선 줄(사이트 `BubbleLine` 꼴 `{text, style, spans?}`). 키 칸은 코어가 낱말 꼴(「꼴:글」을 0x1f로 이음)로
/// 주고, 수 표기(`move`)와 키(`key`, 키캡 상자)를 갈라 그린다(docs/47 4-4)
public enum BubbleLines {
  public typealias Line = [String: Any]

  /// 힌트(`cubie_game_hint`의 줄들: 갈래·단계·상황·앞 수·공식·…·공식 키·앞 수 키) → 갈래와 말풍선 줄
  /// (사이트 `hintBubbleLines`: 단계·상황, 쥐는 법과 그 키, 공식, 공식의 키). 갈래가 비면 「none」
  public static func hint(_ raw: String) -> (kind: String, lines: [Line]) {
    let lines = raw.components(separatedBy: "\n")
    let field = { (i: Int) in i < lines.count ? lines[i] : "" }
    let (stage, name, before, alg, keys, beforeKeys) = (field(1), field(2), field(3), field(4), field(6), field(7))
    var out: [Line] = [["text": name.isEmpty ? stage : "\(stage) · \(name)", "style": "title"]]
    if !before.isEmpty {
      var s: [Line] = [["style": "move", "text": before], ["style": "plain", "text": " 뒤"]]
      if !beforeKeys.isEmpty { s += [["style": "plain", "text": "  "]] + spans(beforeKeys) }
      out.append(["text": text(of: s), "style": "note", "spans": s])
    }
    out.append(["text": alg, "style": "alg"])
    if !keys.isEmpty {
      let s = spans(keys)
      out.append(["text": text(of: s), "style": "keys", "spans": s])
    }
    return (field(0).isEmpty ? "none" : field(0), out)
  }

  /// 「꼴:글」을 0x1f로 이은 낱말들 → 말풍선 낱말
  public static func spans(_ raw: String) -> [Line] {
    raw.split(separator: "\u{1f}").map { sp -> Line in
      let p = sp.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
      return ["style": p[0], "text": p.count > 1 ? p[1] : ""]
    }
  }

  /// 낱말들을 이은 글
  public static func text(of spans: [Line]) -> String {
    spans.map { $0["text"] as? String ?? "" }.joined()
  }

  /// 공식 연습 줄 하나(「꼴\t글[\t낱말들]」) → 말풍선 줄
  public static func line(_ raw: String) -> Line {
    let f = raw.split(separator: "\t", maxSplits: 2, omittingEmptySubsequences: false).map(String.init)
    var line: Line = ["style": f.first ?? "plain", "text": f.count > 1 ? f[1] : ""]
    if f.count > 2 { line["spans"] = spans(f[2]) }
    return line
  }

  /// 키 이름(사이트 `codeLabel`의 줄인 꼴): `KeyR` → R, `Digit3` → 3, 그 밖은 그대로
  public static func keyLabel(_ code: String) -> String {
    if code.hasPrefix("Key") { return String(code.dropFirst(3)) }
    if code.hasPrefix("Digit") { return String(code.dropFirst(5)) }
    return code
  }
}
