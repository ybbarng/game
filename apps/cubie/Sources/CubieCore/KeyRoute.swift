import Foundation

/// 앱 안 키 감시(`AppDelegate`의 지역 키 감시)가 키 하나를 어디로 보낼지(화면 없이 시험한다).
/// 큐브 화면·보통 창보다 먼저 본다.
/// 1. 큐브 창 옆에 새 판 말풍선이 떠 있으면(docs/47 15-12): Enter는 설치(Sparkle 창), Esc는 말풍선 닫기만, 다른 키는 말풍선을
///    닫고 그대로 아래 차례로.
/// 2. F1(맥북은 fn+F1, docs/47 15-25): 큐브 옆 단축키 표 켜고 끄기(누르고 있어 되풀이되는 키는 먹기만).
/// 3. Esc가 아닌 키: 그대로 보낸다. 큐브 창으로 가는 키면 그 전에 키 출처를 알린다(docs/47 15-8).
/// 4. Esc, 큐브 창이 키를 받는 중: 단축키 표 닫기 → 공식 연습 끝내기 → 이전 앱으로(차례대로 하나).
/// 5. Esc, 다른 창: 보통 창이면 닫는다(`EscClose`, 글 칸에 쓰는 중·「모든 설정…」 사이트 창은 그대로 보낸다).
public enum KeyRoute {
  /// `NSEvent.ModifierFlags`와 같은 비트(장치와 상관없는 것만)
  public struct Mods: OptionSet, Sendable {
    public let rawValue: UInt
    public init(rawValue: UInt) { self.rawValue = rawValue }
    public static let capsLock = Mods(rawValue: 1 << 16)
    public static let shift = Mods(rawValue: 1 << 17)
    public static let control = Mods(rawValue: 1 << 18)
    public static let option = Mods(rawValue: 1 << 19)
    public static let command = Mods(rawValue: 1 << 20)
    public static let numericPad = Mods(rawValue: 1 << 21)
    public static let function = Mods(rawValue: 1 << 23)
  }

  /// 맥 키 코드(Carbon `kVK_*`)
  public static let returnKey: UInt16 = 36
  public static let keypadEnter: UInt16 = 76
  public static let escape: UInt16 = 53
  /// 「단축키 보기」 키 F1(`kVK_F1`). 메뉴 표시는 `MenuKey.shortcuts`
  public static let shortcutsKey: UInt16 = 122

  /// 키가 어디로 가는지와 그때 앱 상태
  public struct Context: Sendable {
    /// 키가 큐브 창으로 간다
    public var toCube: Bool
    /// 큐브 창이 키를 받는 창이다(키가 다른 창으로 가도 Esc는 이것을 본다)
    public var cubeIsKey: Bool
    /// 키가 가는 창의 갈래(Esc 닫기 판단). 창이 없으면 nil
    public var window: EscClose.Window?
    /// 키가 가는 창에서 글 칸에 쓰는 중이다
    public var editingText: Bool
    public var noticeUp: Bool
    public var keysShown: Bool
    public var practicing: Bool
    public init(
      toCube: Bool = false, cubeIsKey: Bool = false, window: EscClose.Window? = nil, editingText: Bool = false,
      noticeUp: Bool = false, keysShown: Bool = false, practicing: Bool = false
    ) {
      self.toCube = toCube
      self.cubeIsKey = cubeIsKey
      self.window = window
      self.editingText = editingText
      self.noticeUp = noticeUp
      self.keysShown = keysShown
      self.practicing = practicing
    }
  }

  public enum Action: Equatable, Sendable {
    /// 그대로 보낸다. `keyOrigin`이면 그 전에 큐브 창에 키 출처를 알린다
    case pass(keyOrigin: Bool)
    /// 먹기만 한다
    case swallow
    case installUpdate
    case toggleKeys
    case hideKeys
    case stopPractice
    case returnFocus
    /// 키가 가는 보통 창을 닫는다
    case closeWindow
  }

  public struct Decision: Equatable, Sendable {
    /// 새 판 말풍선을 먼저 닫는다
    public var dismissNotice: Bool
    public var action: Action
    public init(dismissNotice: Bool = false, _ action: Action) {
      self.dismissNotice = dismissNotice
      self.action = action
    }
  }

  public static func route(keyCode: UInt16, mods: Mods, isRepeat: Bool, _ c: Context) -> Decision {
    var dismiss = false
    if c.noticeUp, c.toCube, !isRepeat {
      let plain = mods.subtracting([.function, .numericPad, .capsLock]).isEmpty
      if plain, keyCode == returnKey || keyCode == keypadEnter { return Decision(.installUpdate) }
      dismiss = true
      if plain, keyCode == escape { return Decision(dismissNotice: true, .swallow) }
    }
    let bare = mods.subtracting([.function, .numericPad]).isEmpty
    if keyCode == shortcutsKey, c.toCube, bare {
      return Decision(dismissNotice: dismiss, isRepeat ? .swallow : .toggleKeys)
    }
    guard keyCode == escape, bare else { return Decision(dismissNotice: dismiss, .pass(keyOrigin: c.toCube)) }
    if c.cubeIsKey {
      if c.keysShown { return Decision(dismissNotice: dismiss, .hideKeys) }
      if c.practicing { return Decision(dismissNotice: dismiss, .stopPractice) }
      return Decision(dismissNotice: dismiss, .returnFocus)
    }
    guard let w = c.window, EscClose.closes(w, editingText: c.editingText) else {
      return Decision(dismissNotice: dismiss, .pass(keyOrigin: false))
    }
    return Decision(dismissNotice: dismiss, .closeWindow)
  }
}
