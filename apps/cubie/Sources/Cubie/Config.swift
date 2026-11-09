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
  /// 「공식 보기」 키 F1(맥북은 fn+F1). 웹의 다른 힌트 키 `\`는 웹이 받는다(`apps/web/src/cube/mini/hint.ts` `HINT_KEYS`)
  static let hintKeyCode = UInt32(kVK_F1)
  /// 메뉴 「배우기」가 여는 곳(웹 `LEARN_PATH`와 같다)
  static let learnPath = "/cube/learn?lesson=cfop-2look-oll"

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

  /// 같은 사이트의 다른 화면(대결·설정)
  static func site(_ path: String) -> URL {
    URL(string: path, relativeTo: miniURL)!.absoluteURL
  }
}
