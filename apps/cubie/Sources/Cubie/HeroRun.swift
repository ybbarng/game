import Foundation

/// 홈 시연 한 판의 진행(`NativeCubeWindow.startHero`): 섞기를 보이는 동안 화면 스레드 밖에서 만든 풀이를 받아, 섞기와 섞은 뒤
/// 멈춤이 끝나면 풀이를 잇는다. 풀이가 먼저 오면 기다렸다 잇고, 섞기가 먼저 끝나면 풀이가 올 때까지 멈춰 있는다
@MainActor
final class HeroRun {
  /// 멈췄는지(포커스를 받았거나 크기를 바꿨다). 그 뒤 온 풀이는 버린다
  private(set) var stopped = false
  /// 지금 돌리는 걸음들을 멈추는 함수
  var cancel: (() -> Void)?
  /// 풀이를 이어 돌린다(못 만들었으면 nil을 받는다)
  var solve: ((NativeCore.HeroShow?) -> Void)?
  /// 받은 풀이. 아직이면 nil, 받았으면 .some(풀이 또는 nil)
  private var show: NativeCore.HeroShow??
  private var waiting = false

  /// 화면 스레드 밖에서 만든 풀이가 왔다
  func arrive(_ s: NativeCore.HeroShow?) {
    guard !stopped else { return }
    show = .some(s)
    if waiting {
      waiting = false
      solve?(s)
    }
  }

  /// 섞기와 섞은 뒤 멈춤이 끝났다
  func scrambled() {
    guard !stopped else { return }
    if let s = show {
      solve?(s)
    } else {
      waiting = true
    }
  }

  func stop() {
    stopped = true
    cancel?()
    cancel = nil
    solve = nil
  }
}
