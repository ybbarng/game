/// Cubie 메뉴의 짜임(무엇을 어떤 차례로, 어디에 구분선을 둘지, docs/47 15-19). 메뉴 막대 메뉴와 큐브 위 오른쪽 클릭
/// 메뉴가 같이 쓴다. AppKit 항목은 앱(`AppDelegate.buildMenu`)이 이 차례대로 만들고, 차례는 화면 없이 시험한다.
/// - 맞추기(섞기·공식 보기·큐브 크기) / 기록(기록 보기·티어표) / 사이트로 나가기(대결하기·배우기) /
///   창과 키(창 ▸·키 배치·색…·단축키 보기) / 문제 해결과 앱(다시 불러오기·업데이트 확인…·끝내기)
/// - 「창」 하위 메뉴: 창 크기 넷 / 화면 옮기기(모니터 둘 이상) · 거울 / 자리 처음으로.
///   거울은 창에 무엇을 그릴지 정하는 보기 설정이고 창이 작으면 접히므로 창 크기 옆에 둔다.
public enum MenuEntry: Equatable, Sendable {
  case separator
  /// 단축키를 다른 앱이 쓴다는 알림(누를 수 없는 줄, 글은 앱이 단축키 이름을 넣어 만든다)
  case hotKeyWarning
  /// 「새 판 … 설치…」(판 번호는 앱이 넣는다)
  case installUpdate
  case focus
  /// 「숨기기」/「보이기」(지금 보이는지에 따라 앱이 고른다)
  case toggleVisible
  case scramble
  case hint
  /// 하위 메뉴: 2×2 … 7×7
  case cubeSize
  case records
  case tiers
  /// 하위 메뉴: 친구와 대결 · 컴퓨터와 대결
  case versus
  case learn
  /// 하위 메뉴: `MenuLayout.window`
  case window
  /// 「창」 안의 창 크기 항목들(작게 72 … 아주 크게 200, `Config.sizePresets`)
  case windowSizes
  /// 하위 메뉴: 화면마다 한 줄
  case moveScreen
  case mirror
  case resetFrame
  case keySettings
  case shortcuts
  case reload
  case checkForUpdates
  case quit

  /// 메뉴에 보일 이름. 앱이 상황에 맞춰 글을 만드는 항목과 구분선·묶음은 nil
  public var title: String? {
    switch self {
    case .focus: "큐브로 가기"
    case .scramble: "섞기"
    case .hint: "공식 보기"
    case .cubeSize: "큐브 크기"
    case .records: "기록 보기"
    case .tiers: "티어표"
    case .versus: "대결하기"
    case .learn: "배우기"
    case .window: "창"
    case .moveScreen: "화면 옮기기"
    case .mirror: "거울"
    case .resetFrame: "자리 처음으로"
    case .keySettings: "키 배치·색…"
    case .shortcuts: "단축키 보기"
    case .reload: "다시 불러오기"
    case .checkForUpdates: "업데이트 확인…"
    case .quit: "Cubie 끝내기"
    case .separator, .hotKeyWarning, .installUpdate, .toggleVisible, .windowSizes: nil
    }
  }
}

public enum MenuLayout {
  /// 맨 위 메뉴. `forWindow`: 큐브 위 오른쪽 클릭 메뉴(이미 큐브 위라 「큐브로 가기·숨기기」가 없고,
  /// 앱 전체를 다루는 「업데이트 확인…·끝내기」와 새 판 알림은 메뉴 막대 메뉴에만 둔다)
  public static func main(
    forWindow: Bool, hotKeyOK: Bool, pendingUpdate: Bool, updaterAvailable: Bool
  ) -> [MenuEntry] {
    var m: [MenuEntry] = []
    if !hotKeyOK { m += [.hotKeyWarning, .separator] }
    if !forWindow, pendingUpdate { m += [.installUpdate, .separator] }
    if !forWindow { m += [.focus, .toggleVisible, .separator] }
    m += [.scramble, .hint, .cubeSize, .separator]
    m += [.records, .tiers, .separator]
    m += [.versus, .learn, .separator]
    m += [.window, .keySettings, .shortcuts, .separator]
    m += [.reload]
    if !forWindow {
      if updaterAvailable { m.append(.checkForUpdates) }
      m.append(.quit)
    }
    return m
  }

  /// 「창」 하위 메뉴. 「화면 옮기기」는 모니터가 둘 이상일 때만
  public static func window(multipleScreens: Bool) -> [MenuEntry] {
    var m: [MenuEntry] = [.windowSizes, .separator]
    if multipleScreens { m.append(.moveScreen) }
    m += [.mirror, .separator, .resetFrame]
    return m
  }
}
