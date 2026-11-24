import AppKit
import CubieCore

/// 큐브 화면이 앱에 알려 주는 값(메뉴 체크 표시·단축키 표)
struct CubeState {
  var n = 3
  var mirror = true
  /// 지금 키 배치의 섞기 키(메뉴 「섞기」 옆에 보인다). 모르면 비어 있다
  var scrambleKey: MenuKey?
  /// 공식 연습(docs/47 16-11): 지금 하는 단계 id(안 하면 nil), 보고 치기인가, 메뉴에 보일 단계.
  /// 단계 목록이 비었으면 메뉴에 「공식 연습」을 두지 않는다
  var practice: String?
  var practiceSee = false
  var practiceStages: [PracticeStageItem] = []
}

/// 앱이 큐브 화면(`NativeCubeWindow.send`)에 시키는 일(메뉴·단축키)
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
