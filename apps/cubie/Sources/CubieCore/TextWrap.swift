import Foundation

/// 앱 글의 줄바꿈 도우미(docs/52 5-8 「숫자와 단위」). AppKit의 낱말 단위 줄바꿈(`.hangulWordPriority`)은 숫자와 바로 붙은
/// 한글 사이도 끊을 수 있는 자리로 봐서, 좁은 창에서 「힌트를 쓴 판이 든 5 / 판은」처럼 숫자와 단위가 갈렸다. 그런 자리에
/// 줄바꿈을 막는 글자(U+2060 WORD JOINER, 폭 없음)를 넣어 「5판」「7~11번」「12.34초」가 한 덩이로 남게 한다.
/// 앱 글을 그리는 공통 자리(`NUI.attributed`·`NUI.paragraph`, 말풍선 `HintBubble`, 키 그림 아래 글)가 부른다
public enum TextWrap {
  /// 줄바꿈 막는 글자(폭 없음)
  public static let joiner: Character = "\u{2060}"

  /// 숫자 사이에 붙어 한 값을 이루는 글자(소수점·분:초·범위·크기·백분율)
  static let numberGlue: Set<Character> = [".", ":", "~", "×", "%", ","]

  /// 숫자와 그 뒤에 붙은 한글 단위·숫자 사이 기호 둘레에 줄바꿈 막는 글자를 넣는다. 띄어 쓴 자리는 그대로 끊을 수 있다
  public static func keepNumberUnits(_ s: String) -> String {
    var out = ""
    var prev: Character?
    for c in s {
      if let p = prev, joins(p, c) { out.append(joiner) }
      out.append(c)
      prev = c
    }
    return out
  }

  static func joins(_ a: Character, _ b: Character) -> Bool {
    if isDigit(a) { return isHangul(b) || numberGlue.contains(b) }
    if numberGlue.contains(a) && a != "%" { return isDigit(b) }
    // 「12.5%의」 같은 백분율 뒤 조사
    if a == "%" { return isHangul(b) }
    return false
  }

  static func isDigit(_ c: Character) -> Bool { c.isASCII && c.isNumber }

  static func isHangul(_ c: Character) -> Bool {
    guard let u = c.unicodeScalars.first?.value else { return false }
    return (0xAC00...0xD7A3).contains(u)
  }
}
