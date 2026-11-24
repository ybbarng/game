import Foundation

/// 「모든 설정…」 사이트 창을 닫을 때 그 창 localStorage의 `cube.*`를 앱 저장소로 옮기는 셈.
/// 창을 열 때 넣은 값(`opened`)과 닫을 때 읽은 값(`closed`)을 견주어 사이트에서 바뀐 키만 옮긴다. 통째로 덮어쓰면 창이 열린
/// 동안 네이티브 설정 창에서 바꾼 값이 열 때 값으로 되돌아갔다. 앱이 쓰는 미니 기록(`cube.mini.*`)은 옮기지 않는다
public enum WebStoreMerge {
  public struct Changes: Equatable, Sendable {
    /// 앱 저장소에 쓸 키와 값
    public var set: [String: String]
    /// 사이트에서 지운 키(열 때는 있었는데 닫을 때 없다)
    public var removed: [String]
    public init(set: [String: String] = [:], removed: [String] = []) {
      self.set = set
      self.removed = removed
    }
  }

  /// 옮기지 않는 키(앱이 쓰는 미니 기록·프로필·연습 기록)
  public static func skipped(_ key: String) -> Bool { key.hasPrefix("cube.mini.") }

  public static func changes(opened: [String: String], closed: [String: String]) -> Changes {
    var out = Changes()
    for (k, v) in closed where k.hasPrefix("cube.") && !skipped(k) && opened[k] != v {
      out.set[k] = v
    }
    out.removed = opened.keys.filter { $0.hasPrefix("cube.") && !skipped($0) && closed[$0] == nil }.sorted()
    return out
  }
}
