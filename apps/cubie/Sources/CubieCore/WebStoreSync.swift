import Foundation

/// 앱 저장소 ↔ 「모든 설정…」 사이트 창 localStorage(docs/52 5-6·5-19).
/// - 열 때: 앱 저장소의 `cube.*` 글 전부(`snapshot`)를 문서 시작 스크립트(`setItemsJS`)로 넣는다. 사이트 설정 화면은 사이트
///   코드 그대로 이 글을 읽는다.
/// - 닫을 때: `readStoreJS`로 읽은 글을 연 때 넣은 글과 견주어 사이트에서 바뀐 키만 앱 저장소에 쓴다(`applyClosed`,
///   셈은 `WebStoreMerge`).
public enum WebStoreSync {
  /// 앱 저장소의 큐브 글 전부(기록·프로필·키 배치·설정)
  public static func snapshot(_ store: KeyValueStore) -> [String: String] {
    var d: [String: String] = [:]
    for k in store.keys where k.hasPrefix("cube.") { d[k] = store.string(k) }
    return d
  }

  /// 글들을 localStorage에 넣는 스크립트(한 키가 넘쳐도 나머지는 넣는다)
  public static func setItemsJS(_ d: [String: String]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: d, options: [.sortedKeys]),
      let json = String(data: data, encoding: .utf8)
    else { return nil }
    return "(function(d){for(var k in d){try{localStorage.setItem(k,d[k])}catch(e){}}})(" + json + ");"
  }

  /// 웹 화면의 큐브 저장소(`cube.`로 시작하는 키) 전부를 JSON 글로
  public static let readStoreJS =
    "JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('cube.'))"
    + ".map(k => [k, localStorage.getItem(k)])))"

  /// 닫을 때 `readStoreJS`가 돌려준 값(`result`)을 앱 저장소에 옮긴다. 읽은 값이 JSON 글이 아니면 아무것도 하지 않고 nil
  @discardableResult
  public static func applyClosed(result: Any?, opened: [String: String], to store: KeyValueStore)
    -> WebStoreMerge.Changes?
  {
    guard let text = result as? String, let data = text.data(using: .utf8),
      let closed = (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
    else { return nil }
    let c = WebStoreMerge.changes(opened: opened, closed: closed)
    for (k, v) in c.set { store.set(v, for: k) }
    for k in c.removed { store.remove(k) }
    return c
  }
}
