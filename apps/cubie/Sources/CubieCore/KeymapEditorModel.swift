import Foundation

/// 사용자 키 배치 편집기 화면 자료(코어 `cubie_keymap_view` 줄을 읽은 것, docs/52 5-8). 판단과 글은 코어가 만들고 여기서는 꼴만 바꾼다
public struct KeymapEditorModel: Equatable, Sendable {
  public struct Key: Equatable, Sendable {
    /// 겹침 찾기용 이름(사이트 `chordKey`, 키 빼기에 넘긴다)
    public var id: String
    /// 보이는 이름(사이트 `chordLabel`)
    public var label: String
  }

  public struct Action: Equatable, Sendable {
    public var id: String
    public var label: String
    public var keyless: Bool
    public var keys: [Key]
  }

  public struct Group: Equatable, Sendable {
    public var id: String
    public var label: String
    public var count: Int
    public var missing: Int
    public var actions: [Action]
  }

  public var preset = "twoHand"
  public var mouseRotate = false
  /// 키 없는 동작 알림(없으면 빈 글)
  public var keylessText = ""
  /// 겹친 키 알림(없으면 빈 글)
  public var conflictsText = ""
  public var groups: [Group] = []

  public init() {}

  public static func parse(_ text: String) -> KeymapEditorModel {
    var m = KeymapEditorModel()
    for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
      let f = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
      switch f.first ?? "" {
      case "preset" where f.count >= 2: m.preset = f[1]
      case "mouse" where f.count >= 2: m.mouseRotate = f[1] == "1"
      case "keyless" where f.count >= 2: m.keylessText = f[1]
      case "conflicts" where f.count >= 2: m.conflictsText = f[1]
      case "group" where f.count >= 5:
        m.groups.append(Group(id: f[1], label: f[2], count: Int(f[3]) ?? 0, missing: Int(f[4]) ?? 0, actions: []))
      case "action" where f.count >= 5 && !m.groups.isEmpty:
        let keys = f[4].isEmpty
          ? []
          : f[4].split(separator: "\u{1e}").compactMap { k -> Key? in
            let p = k.split(separator: "\u{1f}", omittingEmptySubsequences: false)
            return p.count == 2 ? Key(id: String(p[0]), label: String(p[1])) : nil
          }
        m.groups[m.groups.count - 1].actions.append(Action(id: f[1], label: f[2], keyless: f[3] == "1", keys: keys))
      default: break
      }
    }
    return m
  }

  /// 편집 결과(코어 `cubie_keymap_edit`): 새 저장 글과 알림(`msg`)·가져오기 오류(`err`)
  public struct Edit: Equatable, Sendable {
    public var stored: String
    public var message: String?
    public var error: String?
  }

  public static func parseEdit(_ text: String) -> Edit {
    let lines = text.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
    var e = Edit(stored: lines.first ?? "", message: nil, error: nil)
    if lines.count > 1 {
      if lines[1].hasPrefix("msg\t") { e.message = String(lines[1].dropFirst(4)) }
      if lines[1].hasPrefix("err\t") { e.error = String(lines[1].dropFirst(4)) }
    }
    return e
  }
}
