import Foundation

/// 티어표 진열(사이트 `apps/web/src/cube/tiers/TierShowcase.tsx`, docs/47 14-7 「진열」, docs/52 5-11): 위쪽 큰 칸에 내 티어
/// 엠블럼을 크게 천천히 좌우로 흔들고, 다음 티어까지 줄일 시간, 아래에 열 티어 사다리. 화면은 `NativeTiersWindow`가 그리고,
/// 무엇을 보일지(어느 티어를 크게, 어느 칸이 보고 있는 칸·내 칸인지, 글)와 흔들기 각은 이 순수 함수들이 정한다.
///
/// 앱은 3D를 띄우지 않는다(GPU로 그리면 드라이버가 약 108MB를 붙인다, docs/52 5-3). 사이트 3D가 그리는 장을 좌우 각마다
/// 미리 찍은 그림(`apps/web/scripts/render-emblem-posters.mjs` `ONLY=cubie-sway`)을 넘겨 흔들리게 한다.
public enum TierShowcase {
  // MARK: 그림(찍기 스크립트와 같아야 한다)

  /// 위쪽 큰 칸 한 변(pt, 사이트 `HERO_SIZE`)과 사다리 칸(사이트 `LADDER_SIZE`)
  public static let heroSize: Double = 280
  public static let ladderSize: Double = 112
  /// 큰 칸 흔들기 그림 장 수(`CUBIE_SWAY_FRAMES`, 파일 `Emblems/sway/<티어>/NN.webp`)
  public static let heroFrames = 21
  /// 메뉴 프로필 칸 흔들기 그림 장 수(`CUBIE_MENU_FRAMES`, 가로로 이어 붙인 `Emblems/sway/<티어>-menu.webp`)
  public static let menuFrames = 13
  /// 사다리 칸 그림(사이트 진열 칸 그림 `sprite/<티어>.webp`를 그대로 묶는다, `SPRITE_FRAMES`)
  public static let ladderFrames = 17
  /// 그림이 덮는 좌우 폭(라디안, 사이트 `SPRITE_AMP`·`SWAY_AMP`)
  public static let amp = 0.5

  // MARK: 흔들기(사이트 `emblem3d/spin.ts` `swayFrom`·`swayStep`·`swayYaw`와 같은 셈)

  /// 한 번 왕복(ms), 빠르기를 0에서 올리는 시간(ms), 끌기를 놓고 다시 흔들 때까지(ms)
  public static let swayPeriod = 9000.0
  public static let swayEase = 1500.0
  public static let swayResume = 1600.0
  /// 엠블럼 칸 너비만큼 끌면 도는 각(사이트 `YAW_PER_WIDTH`)
  public static let yawPerWidth = Double.pi * 1.1
  /// 「처음 각도로」 걸리는 시간(ms, 사이트 `HOME_MS`)
  public static let homeMs = 420.0

  public struct Sway: Equatable, Sendable {
    public var center: Double
    public var t: Double
    public var since: Double
    public var offset: Double

    /// 지금 각 `yaw`에서 흔들기를 다시 시작한다(가까운 정면을 가운데로, 폭 안이면 같은 자리 위상에서)
    public static func from(_ yaw: Double) -> Sway {
      let turn = Double.pi * 2
      let center = (yaw / turn).rounded() * turn
      let v = max(-1, min(1, (yaw - center) / amp))
      let t = asin(v) / turn * swayPeriod
      return Sway(center: center, t: t, since: 0, offset: yaw - center - amp * v)
    }

    /// `dt`(ms)만큼 나아간 흔들기
    public func step(_ dt: Double) -> Sway {
      let ramp = min(1, since / swayEase)
      let rate = ramp * ramp * (3 - 2 * ramp)
      return Sway(center: center, t: t + dt * rate, since: since + dt, offset: offset * exp(-dt / swayEase))
    }

    public var yaw: Double { center + amp * sin(Double.pi * 2 * t / swayPeriod) + offset }
  }

  /// 끌기 시작한 각에서 dx(pt, 오른쪽이 +)만큼 끈 각. 그림이 덮는 폭(±`amp`) 안으로 묶는다
  public static func dragYaw(start: Double, dx: Double, width: Double) -> Double {
    max(-amp, min(amp, start + dx / max(1, width) * yawPerWidth))
  }

  /// 「처음 각도로」 돌아가는 중 u(0~1)의 각(사이트 `homeSpin`, 끝에서 느려진다)
  public static func homeYaw(from yaw: Double, u: Double) -> Double {
    let e = 1 - pow(1 - max(0, min(1, u)), 3)
    return yaw * (1 - e)
  }

  /// 각 → 그림 두 장과 섞는 몫. `count`장이 -amp…+amp를 고르게 덮는다. 사이 각은 `lo`를 1 - frac, `hi`를 frac로 겹친다
  public static func frames(yaw: Double, count: Int) -> (lo: Int, hi: Int, frac: Double) {
    guard count > 1 else { return (0, 0, 0) }
    let turn = Double.pi * 2
    let rel = yaw - (yaw / turn).rounded() * turn
    let x = (max(-amp, min(amp, rel)) + amp) / (2 * amp) * Double(count - 1)
    let lo = min(count - 1, Int(x.rounded(.down)))
    let hi = min(count - 1, lo + 1)
    return (lo, hi, hi == lo ? 0 : x - Double(lo))
  }

  // MARK: 사다리 칸 흔들기(사이트 `sweepCss`, `LADDER_SWEEP_MS`)

  /// 칸 하나가 흔드는 시간(ms). 아래 티어부터 한 번에 한 칸씩(한 바퀴 30초)
  public static let ladderSweepMs = 3000.0
  /// 한 칸 흔들기를 나누는 걸음 수(사이트 `steps`)
  public static let ladderSteps = 60

  /// 한 칸 흔들기의 걸음 k(0…ladderSteps)에 보일 그림 번호(사이트 `round(FRONT + FRONT·sin 2πu)`)
  public static func ladderFrame(step k: Int) -> Int {
    let front = Double(ladderFrames - 1) / 2
    let u = Double(k) / Double(ladderSteps)
    return Int((front + front * sin(Double.pi * 2 * u)).rounded())
  }

  /// 흔들기 시작부터 `ms` 지난 때 흔드는 칸(아래 티어부터 0)
  public static func ladderCell(at ms: Double) -> Int {
    Int((max(0, ms) / ladderSweepMs).rounded(.down)) % TierSheet.labels.count
  }

  // MARK: 밝기(사이트 CSS `filter`)

  /// CSS `brightness(b) saturate(s)`: sRGB 값에 곱하는 3×3 행렬(행이 나오는 R·G·B)
  public struct Dim: Equatable, Sendable {
    public var brightness: Double
    public var saturate: Double

    public var matrix: [[Double]] {
      let s = saturate
      let rows = [
        [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
      ]
      return rows.map { $0.map { $0 * brightness } }
    }

    /// 0~255 화소 하나(알파 곱한 값에도 그대로 쓴다: 선형 변환이라 알파와 바꿔 곱해도 같다)
    public func apply(_ r: Double, _ g: Double, _ b: Double) -> (Double, Double, Double) {
      let m = matrix
      func ch(_ i: Int) -> Double { max(0, min(255, m[i][0] * r + m[i][1] * g + m[i][2] * b)) }
      return (ch(0), ch(1), ch(2))
    }
  }

  /// 사다리 칸 쉬는 밝기(사이트 `LADDER_REST`)와 기록이 없을 때 큰 칸의 아이언(`LOCKED`)
  public static let rest = Dim(brightness: 0.72, saturate: 0.85)
  public static let locked = Dim(brightness: 0.5, saturate: 0.55)

  // MARK: 고르기

  /// 사다리 칸을 눌렀을 때 새로 고른 티어(nil이면 내 티어). 같은 칸이나 내 칸을 누르면 내 티어로 돌아온다
  public static func pick(_ current: Int?, tapped: Int, mine: Int?) -> Int? {
    current == tapped || tapped == mine ? nil : tapped
  }

  // MARK: 보일 것

  /// 다음 티어(사이트 `nextTier`): 바로 위 티어의 가장 낮은 구간 상한까지 줄일 시간
  public struct Next: Equatable, Sendable {
    public var tier: Int
    public var cutMs: Double
    public var gapMs: Double
  }

  /// 사다리 칸 하나
  public struct Cell: Equatable, Sendable {
    public var tier: Int
    /// 위쪽 큰 칸에 떠 있는 칸(제 밝기 + 티어 색 테두리)
    public var viewing: Bool
    /// 내 티어 칸(밝은 배경 판)
    public var mine: Bool
    /// 「14초 이하」·「다 맞춤」
    public var cut: String
  }

  public struct State: Equatable, Sendable {
    /// 위쪽 큰 칸 티어
    public var hero: Int
    /// 기록이 없어 큰 칸의 아이언을 어둡게
    public var locked: Bool
    /// 사다리에서 고른 티어(nil이면 내 티어를 보는 중)
    public var picked: Int?
    /// 큰 칸 아래 구간 표시의 켜진 개수(IV 하나 … I 넷). 내 티어를 볼 때만
    public var pips: Int?
    /// 내 티어를 볼 때 다음 티어
    public var next: Next?
    /// 고른 티어가 내 티어보다 위면 거기까지 줄일 시간(ms)
    public var pickedGapMs: Double?
    /// 아이언부터 열 칸(화면은 위 줄에 보석 5…9, 아래 줄에 금속 0…4)
    public var cells: [Cell]
  }

  public static func state(table: TierSheet.Table, mine: TierInfo?, picked: Int?) -> State {
    let hero = picked ?? mine?.tier ?? 0
    var next: Next?
    if picked == nil, let mine, mine.tier + 1 < table.rows.count, let cut = table.rows[mine.tier + 1].cuts.first {
      let cutMs = (cut * 1000).rounded()
      next = Next(tier: mine.tier + 1, cutMs: cutMs, gapMs: max(0, mine.ao5 - cutMs))
    }
    var gap: Double?
    if let picked, let mine, picked > mine.tier, let cut = table.rows[picked].cuts.first {
      gap = max(0, mine.ao5 - (cut * 1000).rounded())
    }
    let cells = (0..<TierSheet.labels.count).map { i in
      Cell(
        tier: i, viewing: i == hero, mine: mine?.tier == i,
        cut: table.rows.indices.contains(i) ? ladderCut(table.rows[i].cuts.first) : "")
    }
    return State(
      hero: hero, locked: mine == nil && picked == nil, picked: picked,
      pips: picked == nil ? mine?.division.map { $0 + 1 } : nil, next: next, pickedGapMs: gap, cells: cells)
  }

  // MARK: 글(사이트와 같다, 웹 시험 `native-windows-text.test.ts`)

  public static let ladderLabel = "모든 티어"

  /// 「실버가 되시려면 평균을 1.23초 줄여야 해요.」(다음 티어 상자, 고른 티어의 내 기록 상자 둘째 줄). 시간은 내 최고 5판 평균을
  /// 그 티어 기준까지 줄여야 하는 만큼(2026-11-20 사용자: 「챌린저까지 2:08.98」만 두면 무슨 시간인지 헷갈렸다). 사이트
  /// `progress-view.ts` `GAP_MIDDLE`·`GAP_END`·`gapText`와 같다
  public static let gapMiddle = " 되시려면 평균을 "
  public static let gapEnd = " 줄여야 해요."

  /// 티어 이름 + 「이/가」(받침이 있으면 「이」: 아이언·플래티넘). 사이트 `subj`(`@game/mighty-engine/josa`)와 같은 셈
  public static func subject(_ label: String) -> String { label + subjectJosa(label) }

  /// 「이/가」 조사만(이름은 티어 색으로 따로 칠할 때, 사이트 `josaOf(이름, subj)`)
  public static func subjectJosa(_ label: String) -> String {
    guard let ch = label.unicodeScalars.last, (0xAC00...0xD7A3).contains(ch.value) else { return "이(가)" }
    return (ch.value - 0xAC00) % 28 == 0 ? "가" : "이"
  }

  /// 줄일 시간 글. 1/100초 아래 나머지는 올린다(1ms만 남아도 「0.00초」가 되지 않게, 사이트 `gapTime`)
  public static func gapTime(_ ms: Double) -> String {
    MiniBook.formatSeconds((ms / 10).rounded(.up) * 10)
  }

  /// 한 줄 글(사이트 `gapText`). 화면은 이름·시간을 따로 칠해 조각을 쓴다
  public static func gapText(_ label: String, _ ms: Double) -> String {
    subject(label) + gapMiddle + gapTime(ms) + gapEnd
  }

  /// 사다리 칸 시간(「14초 이하」, 아이언 「다 맞춤」)
  public static func ladderCut(_ cut: Double?) -> String {
    guard let cut else { return "" }
    return cut.isFinite ? "\(TierSheet.cutText(cut)) 이하" : TierSheet.cutText(cut)
  }

  public static let average = "5판 평균 "

  /// 고른 티어의 기준(「5판 평균 6.5초 이하」, 아이언 「다 맞춤」)
  public static func cutLine(_ cut: Double) -> String {
    cut.isFinite ? "\(average)\(TierSheet.cutText(cut)) 이하" : TierSheet.solvedAll
  }

  /// 구간 넷의 기준(「IV 1:00 · III 52초 · II 46초 · I 40초」). 구간이 하나면 nil
  public static func divisionsLine(_ cuts: [Double]) -> String? {
    guard cuts.count == 4 else { return nil }
    return zip(TierSheet.divisions, cuts).map { "\($0) \(TierSheet.cutText($1))" }.joined(separator: " · ")
  }
}
