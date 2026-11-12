import AppKit
import Carbon.HIToolbox
import CubieCore

/// 바꿀 일이 있는 값을 한곳에 둔다.
enum Config {
  /// 전역 단축키 ⌃⌥⌘C. 바꾸려면 여기만 고친다(키 코드는 Carbon `kVK_*`, 조합은 `controlKey` 등).
  static let hotKeyCode = UInt32(kVK_ANSI_C)
  static let hotKeyModifiers = UInt32(controlKey | optionKey | cmdKey)
  static let hotKeyLabel = "⌃⌥⌘C"
  /// 메뉴 「큐브로 가기」 옆에 보일 같은 키(위 셋과 함께 고친다)
  static let hotKeyMenuKey = MenuKey(key: "c", option: true, control: true, command: true)

  /// 기본 창 크기(이름처럼 작게. 웹 미니 화면은 짧은 변이 큐브 크기 n × 10px보다 작으면 거울을 접는데,
  /// 96이면 7×7(70)까지 거울이 남는다)와 가장 작은 크기(큐브 색을 알아보고 끌어 돌릴 수 있는 만큼)
  static let defaultSize = NSSize(width: 96, height: 96)
  static let minSize = NSSize(width: 48, height: 48)
  /// 가장 큰 크기(핀치·⌘ + 스크롤·손잡이 모두). 화면 구석에 작게 띄우는 앱이라 넉넉히만 둔다
  static let maxSize = NSSize(width: 480, height: 480)
  /// 메뉴 「창」의 크기 항목(작게·보통·크게·아주 크게, pt). 보통은 `defaultSize`와 같다
  static let sizePresets: [(label: String, side: CGFloat)] = [
    ("작게", 72), ("보통", 96), ("크게", 144), ("아주 크게", 200),
  ]
  /// 「단축키 보기」 키 F1(맥북은 fn+F1, docs/47 15-25). 앱이 가로채 큐브 옆 단축키 표를 켜고 끈다(메뉴 표시는
  /// `MenuKey.shortcuts`). 힌트 키 `\`는 웹이 받는다(`apps/web/src/cube/mini/hint.ts` `HINT_KEYS`, 메뉴 표시 `MenuKey.hint`)
  static let shortcutsKeyCode = UInt32(kVK_F1)
  /// 큐브 옆 단축키 표 크기(pt). 웹 `?view=keys&panel=1`이 스크롤 없이 들어가는 크기(화면 시험 `cube-mini.spec.ts`가 같은 값으로 본다)
  static let keysPanelSize = NSSize(width: 560, height: 300)
  /// 메뉴 「배우기」가 여는 곳: 사이트 해법 익히기(웹 `LEARN_PATH`와 같다)
  static let learnPath = "/cube/methods"

  /// 화면 가장자리에서 띄우는 거리
  static let margin: CGFloat = 16

  /// 여는 주소. 차례: 환경 변수 `CUBIE_URL` → 설정 `defaults write kr.byb.cubie url <주소>` → 사이트.
  /// 로컬 빌드를 볼 때: `CUBIE_URL=http://localhost:4391/cube/mini open Cubie.app` 대신
  /// `CUBIE_URL=… ./Cubie.app/Contents/MacOS/Cubie`로 띄운다(`open`은 환경 변수를 넘기지 않는다).
  static var miniURL: URL {
    if let env = ProcessInfo.processInfo.environment["CUBIE_URL"], let u = URL(string: env) {
      return u
    }
    if let saved = UserDefaults.standard.string(forKey: "url"), let u = URL(string: saved) {
      return u
    }
    return URL(string: "https://game.byb.kr/cube/mini")!
  }

  /// `CUBIE_DEBUG=1`이면 포커스·다리 메시지와 웹 화면 상태를 표준 출력에 찍는다(동작 확인용)
  static let debug = ProcessInfo.processInfo.environment["CUBIE_DEBUG"] != nil

  /// `CUBIE_MEASURE=1`: 메모리 재기(`scripts/measure-memory.sh`, `Measure`). 사용자 화면·포커스를 건드리지 않는다:
  /// 앱은 앞으로 나올 수 없고(.prohibited) 창은 화면 밖에 투명하게 두며, 메뉴 막대 아이콘·전역 단축키·마우스 감시·
  /// 업데이트를 켜지 않는다. 웹 저장소는 비영속이라 사용자 기록·설정에 손대지 않는다. 명령은 표준 입력으로만 받는다
  static let measure = ProcessInfo.processInfo.environment["CUBIE_MEASURE"] != nil
  /// 재는 창 한 변(pt). 기본은 `defaultSize`
  static let measureSide: CGFloat = {
    if let s = ProcessInfo.processInfo.environment["CUBIE_MEASURE_SIZE"], let v = Double(s), v > 0 {
      return CGFloat(v)
    }
    return defaultSize.width
  }()

  /// `CUBIE_MEASURE_ONSCREEN=1`: 재는 창을 화면 밖 대신 주 화면 왼쪽 아래 구석에 거의 투명하게(알파 0.01) 둔다. 화면 밖
  /// 창은 WindowServer가 합성하지 않을 수 있어, WindowServer 쪽 메모리·CPU를 볼 때만 쓴다. 마우스는 지나가고 앞으로 나오지
  /// 않는다(포커스를 빼앗지 않는다)
  static let measureOnscreen = ProcessInfo.processInfo.environment["CUBIE_MEASURE_ONSCREEN"] == "1"

  /// 재는 창 자리: 화면 밖, 또는 `measureOnscreen`이면 주 화면 보이는 영역 왼쪽 아래
  @MainActor static func measureFrame(side: CGFloat) -> NSRect {
    if measureOnscreen, let v = (NSScreen.screens.first ?? NSScreen.main)?.visibleFrame {
      return NSRect(x: v.minX, y: v.minY, width: side, height: side)
    }
    return NSRect(x: -30000, y: -30000, width: side, height: side)
  }

  /// `CUBIE_WEB=1`: 큐브 창을 예전 웹 화면(사이트 `/cube/mini`를 WKWebView로)으로 띄우는 되돌림 스위치(docs/52 5-6).
  /// 기본은 네이티브 화면(Rust 코어 + Core Animation 3D, `NativeCubeWindow`)이라 WebKit 프로세스가 뜨지 않는다.
  /// 예전 확인용 `CUBIE_NATIVE=1`은 이제 기본과 같다
  static let web = ProcessInfo.processInfo.environment["CUBIE_WEB"] == "1"
  /// `CUBIE_WEB_WINDOWS=1`: 큐브 창은 네이티브인 채 기록 창·티어표·설정 창만 예전 사이트 창으로 연다(docs/52 5-7, 견주기·되돌림).
  /// `CUBIE_WEB=1`이면 이것과 상관없이 셋 다 사이트 창이다
  static let webWindows = ProcessInfo.processInfo.environment["CUBIE_WEB_WINDOWS"] == "1"

  /// 같은 사이트의 다른 화면(대결·설정)
  static func site(_ path: String) -> URL {
    URL(string: path, relativeTo: miniURL)!.absoluteURL
  }
}
