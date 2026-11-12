import Foundation

/// 설정 창의 글과 저장 글 고치기(사이트 `apps/web/src/cube/components/CubeSettingsApp.tsx`, `settings.ts`, `input/storage.ts`).
/// 네이티브 설정 창(`NativeSettingsWindow`)은 사이트 설정 가운데 Cubie가 쓰는 것만 같은 글·차례로 보인다: 키 배치(두 손·표기·사용자),
/// 색, 회전 속도, 섞기 연출, 스티커 없는 모양, 큐브 소리. 사용자 배치 편집과 Cubie가 쓰지 않는 설정(그리기 품질·첫 화면 큐브 등)은
/// 「모든 설정…」이 여는 사이트 창이 맡는다. 저장 글은 사이트와 같은 키·같은 JSON이고 모르는 칸은 그대로 둔다
public enum SettingsSheet {
  // MARK: 글(사이트와 같다)

  public static let title = "큐브 설정"
  public static let back = "← 큐브"
  public static let keymapTitle = "키 배치"
  public static let keysMapLink = "키보드 그림으로 보기"
  public static let keysLearnLink = "키 익히기"
  public static let presets: [(id: String, label: String)] = [("twoHand", "두 손"), ("notation", "표기"), ("custom", "사용자")]
  public static let colorsTitle = "색"
  public static let schemes: [(id: String, label: String)] = [
    ("standard", "표준"), ("highContrast", "높은 대비"), ("colorblind", "색약 친화"),
  ]
  public static let customScheme = "직접 고름"
  public static let faceLabels = ["위(U)", "오른쪽(R)", "앞(F)", "아래(D)", "왼쪽(L)", "뒤(B)"]
  public static let viewTitle = "보기와 소리"
  public static let moveSpeed = "회전 속도"
  public static let scrambleShow = "섞기 연출"
  public static let scrambleShows: [(id: String, label: String)] = [
    ("auto", "크기에 맞게"), ("instant", "바로"), ("moves", "하나씩 빠르게"), ("spin", "짧은 연출"),
  ]
  public static let scrambleShowNote = "크기에 맞게는 5×5까지 하나씩 빠르게, 6×6·7×7은 짧은 연출이에요."
  public static let stickerless = "스티커 없는 모양"
  public static let sound = "큐브 소리"
  /// 앱에만 있는 단추: 사용자 배치 편집·나머지 설정은 사이트 설정 창에서
  public static let editCustom = "사용자 배치 편집…"
  public static let allSettings = "모든 설정…"

  // MARK: 설정 글(`cube.settings.v1`)

  static func object(_ text: String?) -> [String: Any] {
    guard let text, let data = text.data(using: .utf8),
      let d = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else { return [:] }
    return d
  }

  static func text(_ d: [String: Any]) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: d, options: [.sortedKeys]),
      let s = String(data: data, encoding: .utf8)
    else { return "{}" }
    return s
  }

  /// 칸 몇 개를 바꾼 설정 글(모르는 칸은 그대로)
  public static func updated(_ settings: String?, _ change: (inout [String: Any]) -> Void) -> String {
    var d = object(settings)
    change(&d)
    return text(d)
  }

  /// 지금 색 묶음 이름(사이트 `parseSettings`: 모르는 이름이면 표준)
  public static func scheme(_ settings: String?) -> String {
    let s = object(settings)["colorScheme"] as? String ?? "standard"
    return s == "custom" || CubeSettings.schemes[s] != nil ? s : "standard"
  }

  /// 색 묶음 고르기(사이트 `withScheme`)
  public static func withScheme(_ settings: String?, _ scheme: String) -> String {
    guard let colors = CubeSettings.schemes[scheme] else { return settings ?? "{}" }
    return updated(settings) {
      $0["colorScheme"] = scheme
      $0["colors"] = colors.map(Int.init)
    }
  }

  /// 한 면 색 바꾸기(사이트 `withFaceColor`): 「직접 고름」이 되고 나머지 면은 지금 색 그대로
  public static func withFaceColor(_ settings: String?, face: Int, color: UInt32) -> String {
    var colors = CubeSettings.parse(settings).colors
    guard colors.indices.contains(face) else { return settings ?? "{}" }
    colors[face] = color & 0xffffff
    return updated(settings) {
      $0["colorScheme"] = "custom"
      $0["colors"] = colors.map(Int.init)
    }
  }

  // MARK: 키 배치 글(`cube.keymap.v1`)

  /// 기본 배치(사이트 `saveKeymap`: 기본 묶음은 이름만 남긴다)
  public static func presetKeymap(_ preset: String, mouseRotate: Bool = false) -> String {
    text(["version": 1, "preset": preset, "bindings": [Any](), "mouseRotate": mouseRotate])
  }

  /// 지금 배치를 「사용자」로(사이트 `toCustom`): 기본 배치면 그 키 전부를 사용자 배치로 옮긴다. 이미 사용자면 그대로
  /// `presetBindings`는 코어 `cubie_preset_bindings` 글(줄마다 「code\t조합\t동작」)
  public static func toCustom(_ keymap: String?, presetBindings: (String) -> String) -> String {
    let d = object(keymap)
    let stored = StoredKeymap.parse(keymap)
    if stored.preset == "custom" { return keymap ?? presetKeymap("twoHand") }
    let bindings: [[String: Any]] = presetBindings(stored.preset).split(separator: "\n").compactMap { line in
      let f = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
      guard f.count == 3, let mods = Int(f[1]) else { return nil }
      var b: [String: Any] = ["code": f[0], "action": f[2]]
      if mods & 1 != 0 { b["shift"] = true }
      if mods & 2 != 0 { b["alt"] = true }
      if mods & 4 != 0 { b["ctrl"] = true }
      return b
    }
    let mouse = (d["mouseRotate"] as? NSNumber).flatMap { CubeSettings.isBool($0) ? $0.boolValue : nil } ?? false
    return text(["version": 1, "preset": "custom", "bindings": bindings, "mouseRotate": mouse])
  }

  /// 「#c8102e」(색 칸에 보일 글)
  public static func hex(_ c: UInt32) -> String { String(format: "#%06x", c & 0xffffff) }
}
