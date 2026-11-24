import Foundation

/// 여러 번 온 요청을 다음 차례에 한 번만 한다(설정 창 슬라이더·색 칸을 끄는 동안 바뀔 때마다 큐브 창이 다시 읽던 것을
/// 모은다). 차례를 넘기는 길(`schedule`)은 앱이 주 큐로, 시험은 손으로 돌리는 목록으로 넣는다
@MainActor
public final class Coalescer {
  private let schedule: @MainActor (@escaping @MainActor () -> Void) -> Void
  private let run: @MainActor () -> Void
  private var pending = false

  public init(
    schedule: @escaping @MainActor (@escaping @MainActor () -> Void) -> Void, run: @escaping @MainActor () -> Void
  ) {
    self.schedule = schedule
    self.run = run
  }

  public func request() {
    guard !pending else { return }
    pending = true
    schedule { [weak self] in
      guard let self else { return }
      self.pending = false
      self.run()
    }
  }
}
