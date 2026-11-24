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
  /// 큐브 옆 단축키 표 크기(pt). 웹 `?view=keys&panel=1`이 스크롤 없이 들어가는 크기(화면 시험 `cube-mini.spec.ts`가 같은 값으로 본다)
  static let keysPanelSize = NSSize(width: 560, height: 300)
  /// 메뉴 「배우기」가 여는 곳: 사이트 해법 익히기(웹 `LEARN_PATH`와 같다)
  static let learnPath = "/cube/methods"

  /// 화면 가장자리에서 띄우는 거리
  static let margin: CGFloat = 16

  /// 사이트 주소의 기준(「모든 설정…」 사이트 창·대결·배우기, 웹 저장소 옮기기의 호스트). 차례: 환경 변수 `CUBIE_URL` →
  /// 설정 `defaults write kr.byb.cubie url <주소>` → 사이트. 로컬 빌드를 볼 때는
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

  /// `CUBIE_DEBUG=1`이면 포커스·키 출처와 큐브 화면 상태를 표준 출력에 찍는다(동작 확인용)
  static let debug = ProcessInfo.processInfo.environment["CUBIE_DEBUG"] != nil

  /// `CUBIE_REDUCE_MOTION=1`: 시스템 「동작 줄이기」처럼(티어표 진열·메뉴 프로필 칸 흔들기를 멈춘다, 확인·스크린샷용)
  static let reduceMotion = ProcessInfo.processInfo.environment["CUBIE_REDUCE_MOTION"] == "1"

  /// `CUBIE_MEASURE=1`: 메모리 재기(`scripts/measure-memory.sh`, `NativeMeasure`). 사용자 화면·포커스를 건드리지 않는다:
  /// 앱은 앞으로 나올 수 없고(.prohibited) 창은 화면 밖에 투명하게 두며, 메뉴 막대 아이콘·전역 단축키·마우스 감시·
  /// 업데이트를 켜지 않는다. 저장소는 메모리에만 있어 사용자 기록·설정에 손대지 않는다. 명령은 표준 입력으로만 받는다
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

  /// 같은 사이트의 다른 화면(대결·배우기·「모든 설정…」 사이트 창)
  static func site(_ path: String) -> URL {
    URL(string: path, relativeTo: miniURL)!.absoluteURL
  }
}
