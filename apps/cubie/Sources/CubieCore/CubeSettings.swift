import Foundation

/// 사이트 큐브 설정(`cube.settings.v1`, `apps/web/src/cube/settings.ts` `parseSettings`) 가운데 Cubie가 쓰는 칸.
/// 설정 화면은 사이트 창(앱 안 보통 창)이고, 앱은 그 창이 저장한 글을 읽는다(docs/52 5-6). 읽는 규칙은 사이트와 같다.
public struct CubeSettings: Equatable, Sendable {
  public static let key = "cube.settings.v1"
  /// 대회 표준 색(U R F D L B, 사이트 `DEFAULT_COLORS`)
  public static let standard: [UInt32] = [0xffffff, 0xc8102e, 0x009b48, 0xffd500, 0xff5800, 0x0046ad]
  static let schemes: [String: [UInt32]] = [
    "standard": standard,
    "highContrast": [0xffffff, 0xe00000, 0x00b000, 0xffee00, 0xff8a00, 0x0040ff],
    "colorblind": [0xffffff, 0xd55e00, 0x009e73, 0xf0e442, 0xe69f00, 0x0072b2],
  ]

  public enum ScrambleShow: String, Sendable {
    case auto, instant, moves, spin
  }

  public var colors: [UInt32] = standard
  /// 한 수를 돌리는 시간(ms, 0~200)
  public var moveMs: Double = 90
  public var stickerless = false
  public var sound = true
  public var scrambleShow: ScrambleShow = .auto

  public init() {}

  /// 저장된 글을 읽는다. 없거나 망가졌으면 기본값, 칸마다 맞지 않으면 그 칸만 기본값
  public static func parse(_ text: String?) -> CubeSettings {
    var s = CubeSettings()
    guard let text, let data = text.data(using: .utf8),
      let d = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else { return s }
    let scheme = d["colorScheme"] as? String
    if scheme == "custom" {
      if let arr = d["colors"] as? [NSNumber], arr.count == 6,
        arr.allSatisfy({ isInt($0) && $0.doubleValue >= 0 && $0.doubleValue <= 0xffffff })
      {
        s.colors = arr.map { UInt32($0.intValue) }
      }
    } else if let scheme, let c = schemes[scheme] {
      s.colors = c
    }
    if let m = d["moveMs"] as? NSNumber, !isBool(m), m.doubleValue.isFinite {
      s.moveMs = min(200, max(0, m.doubleValue.rounded(.toNearestOrAwayFromZero)))
    }
    if let b = d["stickerless"] as? NSNumber, isBool(b) { s.stickerless = b.boolValue }
    if let b = d["sound"] as? NSNumber, isBool(b) { s.sound = b.boolValue }
    if let v = d["scrambleShow"] as? String, let show = ScrambleShow(rawValue: v) { s.scrambleShow = show }
    return s
  }

  static func isBool(_ n: NSNumber) -> Bool { CFGetTypeID(n) == CFBooleanGetTypeID() }
  static func isInt(_ n: NSNumber) -> Bool { !isBool(n) && n.doubleValue == n.doubleValue.rounded() }
}

/// 사이트 키 배치(`cube.keymap.v1`, `input/storage.ts` `importKeymap`). 동작 이름이 맞는지는 코어가 본다(모르는 동작은 버림)
public struct StoredKeymap: Equatable, Sendable {
  public static let key = "cube.keymap.v1"

  public struct Binding: Equatable, Sendable {
    public var code: String
    public var shift = false
    public var alt = false
    public var ctrl = false
    public var action: String

    public init(code: String, shift: Bool = false, alt: Bool = false, ctrl: Bool = false, action: String) {
      self.code = code
      self.shift = shift
      self.alt = alt
      self.ctrl = ctrl
      self.action = action
    }

    /// 코어 조합 비트(Shift 1·Alt 2·Ctrl 4)
    public var mods: UInt8 { (shift ? 1 : 0) | (alt ? 2 : 0) | (ctrl ? 4 : 0) }
  }

  /// "twoHand" · "notation" · "custom"
  public var preset: String
  public var bindings: [Binding]

  public init(preset: String = "twoHand", bindings: [Binding] = []) {
    self.preset = preset
    self.bindings = bindings
  }

  /// 저장된 글. 없거나 꼴이 틀리면 「두 손」(사이트 `loadKeymap`)
  public static func parse(_ text: String?) -> StoredKeymap {
    guard let text, let data = text.data(using: .utf8),
      let d = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      (d["version"] as? NSNumber)?.intValue == 1, let preset = d["preset"] as? String,
      ["twoHand", "notation", "custom"].contains(preset)
    else { return StoredKeymap() }
    if preset != "custom" { return StoredKeymap(preset: preset) }
    guard let raw = d["bindings"] as? [Any], raw.count <= 500 else { return StoredKeymap() }
    var out: [Binding] = []
    for b in raw {
      guard let b = b as? [String: Any], let code = b["code"] as? String,
        code.range(of: "^[A-Za-z0-9]{1,32}$", options: .regularExpression) != nil,
        let action = b["action"] as? String
      else { return StoredKeymap() }
      let flag = { (k: String) -> Bool? in
        guard let v = b[k] else { return false }
        guard let n = v as? NSNumber, CubeSettings.isBool(n) else { return nil }
        return n.boolValue
      }
      guard let shift = flag("shift"), let alt = flag("alt"), let ctrl = flag("ctrl") else { return StoredKeymap() }
      out.append(Binding(code: code, shift: shift, alt: alt, ctrl: ctrl, action: action))
    }
    return StoredKeymap(preset: "custom", bindings: out)
  }

  /// 섞기 키(메뉴 「섞기」 옆 표시). 기본 배치 둘은 Enter
  public var scrambleKey: Binding? {
    if preset != "custom" { return Binding(code: "Enter", action: "scramble") }
    return bindings.first { $0.action == "scramble" }
  }

  /// 힌트 키 `\`를 배치가 다른 동작에 썼나(그러면 배치를 따른다, 사이트 `HINT_KEYS`)
  public var usesBackslash: Bool {
    preset == "custom" && bindings.contains { $0.code == "Backslash" && !$0.shift && !$0.alt && !$0.ctrl }
  }
}
