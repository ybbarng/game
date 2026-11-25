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
  /// 「맞춘 상태로」 키(메뉴 옆에 보인다, docs/47 16-24). 모르거나 Esc 자리뿐이면 비어 있다
  var resetKey: MenuKey?
  /// 상황 놓기(docs/47 16-24): 메뉴에 보일 묶음과 지금 놓은 상황(묶음 id·상황 id, 안 했으면 nil)
  var placeSets: [PlaceSetItem] = []
  var placedSet: String?
  var placedCase: String?
}

/// 앱이 큐브 화면(`NativeCubeWindow.send`)에 시키는 일(메뉴·단축키)
enum CubeCommand {
  case scramble
  /// 맞춘 상태로(맞추던 판은 기록 없이 끝난다)
  case reset
  /// 상황 놓기(그 상황을 처음부터)
  case place(set: String, id: String)
  case toggleMirror
  case hint
  case size(Int)
  /// 공식 연습 단계 고르기(nil이면 끝내기)
  case practice(stage: String?, see: Bool)
  /// 단축키 표가 떴는지(떠 있는 동안만 누른 키를 알린다)
  case keysPanel(Bool)
}
