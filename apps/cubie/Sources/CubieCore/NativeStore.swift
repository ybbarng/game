import Foundation

/// 네이티브 앱의 이 기기 저장소(docs/52 5-6). 값은 사이트 localStorage와 같은 키·같은 JSON 글이라(`cube.mini.v1` 등),
/// 기록 창·티어표 같은 사이트 창에 그대로 넣어 줄 수 있고 웹 저장소에서 옮겨 오기도 글을 그대로 옮기면 된다.
public protocol KeyValueStore: AnyObject {
  func string(_ key: String) -> String?
  /// 저장했으면 true(자리가 모자라면 false, 사이트 `setItem`이 던지는 것과 같다)
  @discardableResult func set(_ value: String, for key: String) -> Bool
  /// 저장된 키 전부
  var keys: [String] { get }
}

/// UserDefaults에 둔다(`kr.byb.cubie` 도메인, 키 앞에 `store.`). 기록 한 벌이 수십 KB라 plist에 둬도 가볍다
public final class DefaultsStore: KeyValueStore {
  private let defaults: UserDefaults
  private let prefix = "store."

  public init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  public func string(_ key: String) -> String? { defaults.string(forKey: prefix + key) }

  @discardableResult public func set(_ value: String, for key: String) -> Bool {
    defaults.set(value, forKey: prefix + key)
    return true
  }

  public var keys: [String] {
    defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix(prefix) }.map { String($0.dropFirst(prefix.count)) }
      .sorted()
  }
}

/// 메모리에만 둔다(재기 모드·시험). `limit`(글자 수 합)을 넘는 저장은 거절한다(자리 모자람 흉내)
public final class MemoryStore: KeyValueStore {
  public private(set) var values: [String: String]
  public var limit: Int?

  public init(_ values: [String: String] = [:], limit: Int? = nil) {
    self.values = values
    self.limit = limit
  }

  public func string(_ key: String) -> String? { values[key] }

  @discardableResult public func set(_ value: String, for key: String) -> Bool {
    if let limit {
      let others = values.filter { $0.key != key }.reduce(0) { $0 + $1.value.count }
      if others + value.count > limit { return false }
    }
    values[key] = value
    return true
  }

  public var keys: [String] { values.keys.sorted() }
}
