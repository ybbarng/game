/// 흔드는 엠블럼의 각도 그림 창고(docs/52 5-16 「흔들기 끊김」). 흔드는 길(시계 한 칸마다 층 그림·투명도 바꾸기)은 이미 만든
/// 그림만 꺼내고 그림을 풀거나 HDR로 만들지 않는다. 그 셈(HDR 한 장 이 맥 릴리스 빌드 가운데 8.6ms, 최대 15.6ms)은
/// 120Hz 한 주기 예산 7.1ms를 넘어, 각이 바뀔 때마다 주 스레드에서 하면 흔들기가 끊긴다.
///
/// - 지금 보이는 두 장(`lo`·`hi`)과 그 앞뒤 `reach`장을 원한다(`need`). 앱은 원하는 장을 백그라운드에서 만들어 `deliver`로 넣는다.
/// - 원하는 범위 밖의 장은 버린다(HDR 560px 한 장 2.5MB, 기본 `reach` 2면 많아야 여섯 장).
/// - 임시 그림(`final: false`): 티어를 고를 때 정면 SDR 한 장을 바로 넣어 두거나, HDR을 켜고 끌 때 있던 그림을 남겨 둔다.
///   임시 그림도 보이지만 다시 만들도록 원한다. 제 그림이 오면 같은 번호에 바꿔 끼운다(자리·각은 그대로).
/// - `reset`마다 세대가 바뀌어, 옛 티어·옛 HDR 설정으로 만든 그림이 늦게 와도 버린다.
public struct SwayFrames<Image> {
  public let count: Int
  public let reach: Int
  public private(set) var generation = 0
  private var held: [Int: (image: Image, final: Bool)] = [:]
  private var pending: Set<Int> = []

  public init(count: Int, reach: Int = 2) {
    self.count = count
    self.reach = reach
  }

  /// 지금 가진 그림(흔드는 길은 이것만 쓴다. 없으면 nil이고 앞 그림을 그대로 둔다)
  public func frame(_ i: Int) -> Image? { held[i]?.image }

  /// 지금 가진 장 수(메모리 확인용)
  public var heldCount: Int { held.count }

  /// 두 장 `lo`·`hi`를 보일 때 미리 둘 범위
  public func wanted(lo: Int, hi: Int) -> ClosedRange<Int> {
    max(0, min(lo, hi) - reach)...min(count - 1, max(lo, hi) + reach)
  }

  /// 범위 밖 그림을 버리고, 새로 만들 번호를 가까운 차례로 돌려준다(돌려준 번호는 만드는 중으로 둔다)
  public mutating func need(lo: Int, hi: Int) -> [Int] {
    let w = wanted(lo: lo, hi: hi)
    for i in held.keys where !w.contains(i) { held[i] = nil }
    let mid = Double(lo + hi) / 2
    let todo = w.filter { held[$0]?.final != true && !pending.contains($0) }
      .sorted { abs(Double($0) - mid) < abs(Double($1) - mid) }
    pending.formUnion(todo)
    return todo
  }

  /// 임시 그림을 넣는다(제 그림이 이미 있으면 그대로)
  public mutating func placeholder(_ i: Int, _ image: Image) {
    guard held[i]?.final != true else { return }
    held[i] = (image, false)
  }

  /// 만든 그림을 넣는다. 세대가 다르면(옛 티어·옛 설정) 버리고 false
  @discardableResult
  public mutating func deliver(_ i: Int, _ image: Image?, generation g: Int) -> Bool {
    guard g == generation else { return false }
    pending.remove(i)
    guard let image else { return false }
    held[i] = (image, true)
    return true
  }

  /// 새 세대로. `keep`이면 가진 그림을 임시 그림으로 남겨(HDR을 켜고 끌 때 제 그림이 올 때까지 보인다), 아니면 비운다
  public mutating func reset(keep: Bool = false) {
    generation += 1
    pending = []
    if keep {
      for (i, h) in held { held[i] = (h.image, false) }
    } else {
      held = [:]
    }
  }
}
