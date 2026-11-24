import Foundation

/// 보기를 통째로 다시 만든 뒤 키보드 포커스를 어느 보기에 돌려줄지(키 배치 편집기 칩, docs/52 5-20). 칩마다 다시 만들어도
/// 같은 이름을 붙여 두고, 포커스가 있던 이름이 그대로 있으면 그것, 사라졌으면(키를 빼서 그 키 칩이 없어짐) 대신할 이름, 그것도
/// 없으면 nil(창에 둔다)
public enum FocusKeep {
  public static func pick(saved: String?, fallback: [String: String], available: Set<String>) -> String? {
    guard let saved else { return nil }
    if available.contains(saved) { return saved }
    if let f = fallback[saved], available.contains(f) { return f }
    return nil
  }
}
