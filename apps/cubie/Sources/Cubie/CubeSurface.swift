import AppKit
import CubieCore

/// 큐브 화면이 앱에 알려 주는 값(메뉴 체크 표시·단축키 표)
struct CubeState {
  var n = 3
  var mirror = true
  var records = false
  /// 지금 키 배치의 섞기 키(메뉴 「섞기」 옆에 보인다). 모르면 비어 있다
  var scrambleKey: MenuKey?
  /// 공식 연습(docs/47 16-11): 지금 하는 단계 id(안 하면 nil), 보고 치기인가, 메뉴에 보일 단계.
  /// 단계 목록이 비었으면 메뉴에 「공식 연습」을 두지 않는다
  var practice: String?
  var practiceSee = false
  var practiceStages: [PracticeStageItem] = []
}

/// 앱이 큐브 화면에 시키는 일(메뉴·단축키). 웹 화면은 다리 메시지(`app-bridge.ts` `FromApp`)로, 네이티브 화면은 바로 한다
enum CubeCommand {
  case scramble
  case toggleMirror
  case hint
  case size(Int)
  /// 공식 연습 단계 고르기(nil이면 끝내기)
  case practice(stage: String?, see: Bool)
  /// 단축키 표가 떴는지(떠 있는 동안만 누른 키를 알린다)
  case keysPanel(Bool)
}

/// 떠 있는 큐브 창의 화면. 웹(`CubeWindow`, 되돌림 스위치 `CUBIE_WEB=1`)과 네이티브(`NativeCubeWindow`, 기본)가 따른다.
/// 창 다루기는 둘 다 `FloatingWindow`를 함께 쓰고, 앱 껍데기(`AppDelegate`: 메뉴·단축키·말풍선·단축키 표·업데이트)는
/// 이 약속만 본다
@MainActor
protocol CubeSurface: AnyObject {
  var panel: CubiePanel { get }
  var state: CubeState { get }
  var profile: Profile { get }
  var focused: Bool { get }
  var visible: Bool { get }

  /// 화면이 떴다(앱이 지금 포커스·보임·말풍선 능력을 다시 알려 줄 때)
  var onReady: (() -> Void)? { get set }
  var onState: (() -> Void)? { get set }
  /// 힌트·공식 연습 말풍선 줄들(웹 `BubbleLine` 꼴 `{text, style}`). nil이면 숨기기
  var onHint: (([[String: Any]]?) -> Void)? { get set }
  /// 단축키 표가 떠 있는 동안 누른 키(`KeyboardEvent.code`)
  var onPressed: ((String) -> Void)? { get set }
  var onClick: (() -> Void)? { get set }
  var onPlaced: (() -> Void)? { get set }
  /// 큐브 위 오른쪽 누르기 메뉴
  var menuProvider: (() -> NSMenu)? { get set }

  func send(_ command: CubeCommand)
  /// 포커스·보임이 바뀌었을 수 있다
  func sendFocus()
  /// 메뉴 「다시 불러오기」·설정 창을 닫았을 때(웹은 화면을 다시 불러오고, 네이티브는 설정을 다시 읽는다)
  func reload()
  /// 큐브 화면이 키를 받게
  func takeKeys()
  /// 큐브 창으로 가는 키(웹에 닿기 전): 키 출처를 판에 모은다(docs/47 15-8)
  func keyArriving(_ event: NSEvent)
  /// 연습 전에 메뉴에서 고른 방식(다음 상태 알림이 덮기 전까지)
  func setPracticeSee(_ on: Bool)
  func saveFrame()
  func setSide(_ side: CGFloat)
  func resetFrame()
  /// 확인용(CUBIE_DEBUG): 화면 상태를 찍는다
  func dump(_ why: String)
}
