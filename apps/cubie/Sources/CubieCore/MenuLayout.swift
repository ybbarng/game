/// Cubie 메뉴의 짜임(무엇을 어떤 차례로, 어디에 구분선을 둘지, docs/47 15-19). 메뉴 막대 메뉴와 큐브 위 오른쪽 클릭
/// 메뉴가 같이 쓴다. AppKit 항목은 앱(`AppDelegate.buildMenu`)이 이 차례대로 만들고, 차례는 화면 없이 시험한다.
/// - (메뉴 막대 메뉴만) 프로필 칸 / 맞추기(섞기·힌트·공식 연습·큐브 크기) / 기록(기록 보기·티어표) / 사이트로 나가기(대결하기·배우기) /
///   창과 키(창 ▸·키 배치·색…·단축키 보기) / 문제 해결과 앱(다시 불러오기·업데이트 확인…·끝내기)
/// - 「창」 하위 메뉴: 창 크기 넷 / 화면 옮기기(모니터 둘 이상) · 거울 / 자리 처음으로.
///   거울은 창에 무엇을 그릴지 정하는 보기 설정이고 창이 작으면 접히므로 창 크기 옆에 둔다.
/// - 「공식 연습」 하위 메뉴(docs/47 16-11): 묶음(초보자·CFOP)마다 이름 줄과 단계 / 보고 치기 / 연습 끝내기.
public enum MenuEntry: Equatable, Sendable {
  case separator
  /// 맨 위 프로필 칸(이름·사진·지금 크기의 티어, 누르면 기록 보기). 메뉴 막대 메뉴에만
  case profile
  /// 단축키를 다른 앱이 쓴다는 알림(누를 수 없는 줄, 글은 앱이 단축키 이름을 넣어 만든다)
  case hotKeyWarning
  /// 「새 판 … 설치…」(판 번호는 앱이 넣는다)
  case installUpdate
  case focus
  /// 「숨기기」/「보이기」(지금 보이는지에 따라 앱이 고른다)
  case toggleVisible
  case scramble
  case hint
  /// 하위 메뉴: `MenuLayout.practice`
  case practice
  /// 「공식 연습」 안의 묶음 이름 줄(누를 수 없다)
  case practiceGroup(String)
  /// 「공식 연습」 안의 단계 하나(누르면 그 단계 새 판, 지금 하는 단계에 체크)
  case practiceStage(id: String, title: String)
  /// 「공식 연습」 안의 보고 치기 켜고 끄기(체크)
  case practiceSee
  /// 「공식 연습」 맨 아래 연습 끝내기(연습 중일 때만 누를 수 있다)
  case practiceStop
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
    case .hint: "힌트"
    case .practice: "공식 연습"
    case .practiceGroup(let name): name
    case .practiceStage(_, let title): title
    case .practiceSee: "보고 치기"
    case .practiceStop: "연습 끝내기"
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
    case .separator, .profile, .hotKeyWarning, .installUpdate, .toggleVisible, .windowSizes: nil
    }
  }
}

public enum MenuLayout {
  /// 맨 위 메뉴. `forWindow`: 큐브 위 오른쪽 클릭 메뉴(이미 큐브 위라 「큐브로 가기·숨기기」가 없고, 앱 전체의 프로필 칸과
  /// 앱 전체를 다루는 「업데이트 확인…·끝내기」와 새 판 알림은 메뉴 막대 메뉴에만 둔다)
  /// `practiceAvailable`: 웹이 연습 단계를 알려 줬나(0.1.6 이하 화면이면 「공식 연습」을 두지 않는다)
  public static func main(
    forWindow: Bool, hotKeyOK: Bool, pendingUpdate: Bool, updaterAvailable: Bool,
    practiceAvailable: Bool
  ) -> [MenuEntry] {
    var m: [MenuEntry] = []
    if !forWindow { m += [.profile, .separator] }
    if !hotKeyOK { m += [.hotKeyWarning, .separator] }
    if !forWindow, pendingUpdate { m += [.installUpdate, .separator] }
    if !forWindow { m += [.focus, .toggleVisible, .separator] }
    m += [.scramble, .hint]
    if practiceAvailable { m.append(.practice) }
    m += [.cubeSize, .separator]
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

  /// 「공식 연습」 하위 메뉴. 단계는 웹이 보낸 차례대로, 묶음이 바뀔 때마다 구분선과 묶음 이름 줄
  public static func practice(stages: [PracticeStageItem]) -> [MenuEntry] {
    var m: [MenuEntry] = []
    var group: String?
    for s in stages {
      if s.group != group {
        if group != nil { m.append(.separator) }
        m.append(.practiceGroup(s.group))
        group = s.group
      }
      m.append(.practiceStage(id: s.id, title: s.title))
    }
    if !m.isEmpty { m.append(.separator) }
    m += [.practiceSee, .separator, .practiceStop]
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

/// 웹이 `state` 메시지로 알려 주는 연습 단계 하나(`app-bridge.ts` `practiceStages`)
public struct PracticeStageItem: Equatable, Sendable {
  public let id: String
  public let title: String
  /// 묶음 이름(「초보자」·「CFOP」)
  public let group: String

  public init(id: String, title: String, group: String) {
    self.id = id
    self.title = title
    self.group = group
  }

  /// 다리 메시지의 목록을 읽는다. 칸이 모자라거나 꼴이 틀린 줄은 버린다(목록이 없으면 빈 목록)
  public static func list(from value: Any?) -> [PracticeStageItem] {
    guard let rows = value as? [[String: Any]] else { return [] }
    return rows.compactMap { r in
      guard let id = r["id"] as? String, !id.isEmpty, let title = r["title"] as? String,
        let group = r["group"] as? String
      else { return nil }
      return PracticeStageItem(id: id, title: title, group: group)
    }
  }
}
