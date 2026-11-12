import Foundation
import SQLite3

/// 웹 저장소(WKWebView localStorage)에서 네이티브 저장소로 한 번 옮기기(docs/52 5-6).
///
/// 0.1.10까지의 앱은 기록·프로필·연습 기록·키 배치·설정을 사이트 화면의 localStorage(앱 것, 브라우저와 따로)에 두었다.
/// WebKit은 그것을 `~/Library/WebKit/kr.byb.cubie/WebsiteData/Default/<출처>/<출처>/LocalStorage/localstorage.sqlite3`의
/// `ItemTable(key TEXT, value BLOB)`에 둔다(값은 UTF-16LE). 출처 폴더의 `origin` 파일에 출처 주소(https·game.byb.kr)가 든다.
/// 웹 프로세스를 띄우지 않고 이 파일을 읽기 전용으로 열어 `cube.`로 시작하는 키를 같은 글 그대로 옮긴다.
/// - 웹 저장소는 지우지 않는다(되돌림 스위치 `CUBIE_WEB=1`로 웹 화면을 다시 써도 그대로 있다).
/// - 옮긴 표시(`cubie.migrated.v1`, 옮긴 때와 키)를 남겨 다시 옮기지 않는다. 이미 네이티브에 같은 키가 있으면 덮지 않는다.
public enum WebStorageMigration {
  public static let markerKey = "cubie.migrated.v1"
  /// 옮기는 키(사이트 큐브 저장소)
  public static let prefix = "cube."

  public struct Result: Equatable, Sendable {
    /// 옮긴 키
    public var moved: [String]
    /// 네이티브에 이미 있어 그대로 둔 키
    public var kept: [String]
    /// 이미 옮겼던 적이 있어 아무것도 하지 않았다
    public var alreadyDone: Bool
  }

  /// 앱의 웹 저장소 폴더(`~/Library/WebKit/<번들 id>/WebsiteData`)
  public static func websiteData(bundleID: String = "kr.byb.cubie", home: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
    home.appendingPathComponent("Library/WebKit/\(bundleID)/WebsiteData")
  }

  /// 한 번 옮긴다. `host`는 사이트 주소의 호스트(기본 game.byb.kr)
  @discardableResult
  public static func run(store: KeyValueStore, websiteData: URL, host: String, now: Date = Date()) -> Result {
    if store.string(markerKey) != nil { return Result(moved: [], kept: [], alreadyDone: true) }
    let items = read(websiteData: websiteData, host: host)
    var moved: [String] = []
    var kept: [String] = []
    for (k, v) in items.sorted(by: { $0.key < $1.key }) {
      if store.string(k) != nil {
        kept.append(k)
      } else if store.set(v, for: k) {
        moved.append(k)
      }
    }
    let marker: [String: Any] = [
      "at": Int(now.timeIntervalSince1970 * 1000), "moved": moved, "kept": kept, "host": host,
    ]
    if let data = try? JSONSerialization.data(withJSONObject: marker, options: [.sortedKeys]),
      let text = String(data: data, encoding: .utf8)
    {
      store.set(text, for: markerKey)
    }
    return Result(moved: moved, kept: kept, alreadyDone: false)
  }

  /// 그 출처의 localStorage에서 `cube.`로 시작하는 키와 글
  public static func read(websiteData: URL, host: String) -> [String: String] {
    var out: [String: String] = [:]
    let fm = FileManager.default
    let base = websiteData.appendingPathComponent("Default")
    guard let tops = try? fm.contentsOfDirectory(atPath: base.path) else { return out }
    let hostBytes = Data(host.utf8)
    for top in tops {
      let dir = base.appendingPathComponent(top).appendingPathComponent(top)
      guard let origin = try? Data(contentsOf: dir.appendingPathComponent("origin")), origin.range(of: hostBytes) != nil
      else { continue }
      let db = dir.appendingPathComponent("LocalStorage/localstorage.sqlite3")
      guard fm.fileExists(atPath: db.path) else { continue }
      for (k, v) in items(db: db) where k.hasPrefix(prefix) { out[k] = v }
    }
    return out
  }

  /// sqlite 파일을 읽기 전용으로 열어 ItemTable을 읽는다(값은 UTF-16LE). 먼저 보통 읽기 전용(쓰기 로그 WAL까지 읽음)으로,
  /// 안 되면 파일만 그대로 읽는 `immutable`로 한 번 더
  static func items(db: URL) -> [String: String] {
    if let r = items(uri: "file:\(db.path)?mode=ro") { return r }
    return items(uri: "file:\(db.path)?mode=ro&immutable=1") ?? [:]
  }

  private static func items(uri: String) -> [String: String]? {
    var out: [String: String] = [:]
    var handle: OpaquePointer?
    guard sqlite3_open_v2(uri, &handle, SQLITE_OPEN_READONLY | SQLITE_OPEN_URI, nil) == SQLITE_OK else {
      sqlite3_close(handle)
      return nil
    }
    defer { sqlite3_close(handle) }
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(handle, "SELECT key, value FROM ItemTable", -1, &stmt, nil) == SQLITE_OK else { return nil }
    defer { sqlite3_finalize(stmt) }
    while true {
      let rc = sqlite3_step(stmt)
      if rc == SQLITE_DONE { break }
      guard rc == SQLITE_ROW else { return nil }
      guard let k = sqlite3_column_text(stmt, 0) else { continue }
      let key = String(cString: k)
      let n = Int(sqlite3_column_bytes(stmt, 1))
      guard let p = sqlite3_column_blob(stmt, 1), n > 0 else {
        out[key] = ""
        continue
      }
      let data = Data(bytes: p, count: n)
      if let v = String(data: data, encoding: .utf16LittleEndian) { out[key] = v }
    }
    return out
  }
}
