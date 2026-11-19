import Foundation

/// Cubie 기록 창의 글과 줄(사이트 `apps/web/src/cube/mini/MiniCubeApp.tsx` `RecordsPage`·`MiniTiers`·`RecordsPanel`·`ReplayBox`).
/// 네이티브 기록 창(`NativeRecordsWindow`)이 그리고, 화면 글은 사이트와 같아야 한다(웹 시험 `native-windows-text.test.ts`가 본다).
/// 계산(요약 평균·티어)은 Rust 코어가 하고, 여기서는 기록 JSON → 줄 글만 만든다(화면 없이 시험한다)
public enum RecordsSheet {
  /// 크기 단추(사이트 `MINI_SIZES`)
  public static let sizes = [2, 3, 4, 5, 6, 7]

  // MARK: 글(사이트와 같다)

  public static let tiersTitle = "티어"
  public static let tiersBasis = "Cubie 기록 기준 · 최고 5판 평균(Ao5)"
  public static let tiersLink = "티어표"
  public static let tierPending = "5판 뒤에"
  public static let tiersNote =
    "Cubie는 살펴보기 없이, 큐브에 키 입력이 있는 동안만 재요. 사이트 혼자 맞추기 기록과는 따로 매겨요. 힌트를 쓴 판이 든 5판은 티어에 넣지 않아요."
  public static let title = "기록"
  /// 요약 이름: 최근 n판 평균과 티어를 정한 최고 5판 평균을 이름으로 가른다(2026-11-18)
  public static let summaryLabels = ["최고", "평균", TierProgress.recent5, TierProgress.recent12, TierProgress.best5]

  /// 요약 「최고 5판 평균」 값(「2:35.09 · 7~11번」, 없으면 「-」)
  public static func best5Text(_ v: TierProgress.View?) -> String {
    v.map { "\(MiniBook.formatMs($0.ms)) · \(TierProgress.rangeText($0))" } ?? "-"
  }

  /// 기록 줄 시간 글: 최고 5판 평균에서 빠진 가장 빠른·느린 판은 대회 표기처럼 괄호
  public static func timeText(_ time: String, mark: TierProgress.Mark?) -> String {
    mark == .fast || mark == .slow ? "(\(time))" : time
  }
  public static let empty = "아직 기록이 없어요."
  public static let synthetic = "다른 프로그램 입력"
  public static let swipe = "마우스·화면"
  public static let hintsTip = "힌트를 본 판이 든 5판은 티어에 넣지 않아요"
  public static let replay = "다시 보기"
  public static let pause = "멈추기"
  public static let resume = "이어 보기"
  public static let restart = "처음부터"
  public static let close = "닫기"

  public static func hints(_ n: Int) -> String { "힌트 \(n)번" }
  public static func moves(_ n: Int) -> String { "\(n)수" }
  /// 다시 보기 상자 머리(「12번 · 23.45」)
  public static func replayHead(no: Int, ms: Double?) -> String { "\(no)번 · \(MiniBook.formatMs(ms))" }

  /// 요약 값 글(사이트 `formatMs`): 없음(NaN) 「-」, DNF(무한대) 「DNF」
  public static func summaryText(_ v: Double) -> String {
    if v.isNaN { return "-" }
    if v.isInfinite { return "DNF" }
    return MiniBook.formatMs(v)
  }

  // MARK: 기록 줄

  /// 기록 줄 폭이 이보다 좁으면 입력 표시 칩(다른 프로그램 입력·마우스·화면·힌트) 묶음을 시간 칸 아래 둘째 줄로 내린다.
  /// 가장 작은 창(320, 줄 폭 304)에서 칩과 수·「다시 보기」를 한 줄에 다 넣으면 「다시 보기」가 줄 밖으로 밀렸다.
  /// 사이트 `RecordsPanel`도 같은 폭(`@max-[340px]`)에서 같은 자리로 내린다(docs/52 5-15)
  public static let badgesWrapBelow: Double = 340
  /// 둘째 줄 칩 묶음의 왼쪽 자리(번호 24 + 8 + 때 80 + 8, 시간 칸과 같은 x)
  public static let badgesIndent: Double = 120

  /// 그 폭의 줄에서 칩 묶음을 둘째 줄로 내리나
  public static func badgesOnOwnLine(width: Double, badges: Int) -> Bool { badges > 0 && width < badgesWrapBelow }

  // MARK: 티어 칸

  /// 티어 칸 위 글(「6×6 1:40.00」, 티어가 없으면 「6×6 」, 사이트 `MiniTiers`)
  public static func tierCellTop(size: Int, ms: Double?) -> String {
    "\(size)×\(size) \(ms.map { MiniBook.formatMs($0) } ?? "")"
  }

  /// 기록 창 처음 너비(사이트 Cubie 기록 창과 같은 380, `NativeRecordsWindow.size`)
  public static let windowWidth: Double = 380
  /// 티어 칸 너비(창 안쪽 여백 8씩, 칸 사이 4, 세 칸)
  public static func tierCellWidth(window w: Double) -> Double { (w - 16 - 8) / 3 }
  /// 칸 안 글 자리 너비(왼쪽 6 + 엠블럼 28 + 6, 오른쪽 4)
  public static func tierCellTextWidth(cell w: Double) -> Double { w - 44 }
  /// 글 한 줄 높이(사이트 `text-xs` 16px)
  public static let tierCellLine: Double = 16
  /// 칸 높이: 위아래 4씩(사이트 `py-1`)과 글 줄 수. 두 줄(위 글·티어 이름)이면 40
  public static func tierCellHeight(lines: Int) -> Double { max(40, 8 + tierCellLine * Double(lines)) }

  /// 칸 너비에 맞춰 낱말 사이(빈칸)에서 줄을 바꾼다(사이트 칸은 글이 길면 브라우저가 낱말 사이에서 줄을 바꾼다).
  /// `measure`는 한 줄 글의 폭. 낱말 하나(「100:00.00」)가 폭보다 길면 「:」 뒤에서 더 나눈다(사이트는 「:」 뒤 `<wbr>`).
  /// 그래도 긴 조각은 그 조각만 한 줄에 둔다
  public static func wrapLines(_ text: String, width: Double, measure: (String) -> Double) -> [String] {
    var lines: [String] = []
    for word in text.split(separator: " ").map(String.init) {
      if let last = lines.last, measure(last + " " + word) <= width {
        lines[lines.count - 1] = last + " " + word
        continue
      }
      if measure(word) <= width {
        lines.append(word)
        continue
      }
      // 「:」 뒤에서 나눈 조각을 한 줄에 들어가는 만큼 붙인다(빈칸 없이)
      var line = ""
      for piece in colonPieces(word) {
        if line.isEmpty || measure(line + piece) <= width {
          line += piece
        } else {
          lines.append(line)
          line = piece
        }
      }
      lines.append(line)
    }
    return lines
  }

  /// 「100:00.00」 → 「100:」·「00.00」(「:」을 앞 조각 끝에 둔다)
  public static func colonPieces(_ word: String) -> [String] {
    var out: [String] = []
    var cur = ""
    for ch in word {
      cur.append(ch)
      if ch == ":" {
        out.append(cur)
        cur = ""
      }
    }
    if !cur.isEmpty { out.append(cur) }
    return out
  }

  // MARK: 줄

  /// 기록 한 줄
  public struct Row: Equatable, Sendable {
    public var no: Int
    public var at: Double
    /// 「11/12 09:05」
    public var when: String
    /// 「23.45」·「DNF」
    public var time: String
    public var moves: Int
    /// 실제 키보드가 아닌 입력이 섞인 판(막지 않고 표시만)
    public var synthetic: Bool
    public var swipe: Bool
    public var hints: Int
    public var canReplay: Bool
  }

  /// 「월/일 시:분」(사이트 `shortTime`, 이 기기 시간대)
  public static func shortTime(_ at: Double, timeZone: TimeZone = .current) -> String {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let c = cal.dateComponents([.month, .day, .hour, .minute], from: Date(timeIntervalSince1970: at / 1000))
    return "\(c.month ?? 0)/\(c.day ?? 0) \(String(format: "%02d", c.hour ?? 0)):\(String(format: "%02d", c.minute ?? 0))"
  }

  public static func row(_ r: [String: Any], timeZone: TimeZone = .current) -> Row {
    let at = (r["at"] as? NSNumber)?.doubleValue ?? 0
    return Row(
      no: (r["no"] as? NSNumber)?.intValue ?? 0,
      at: at,
      when: shortTime(at, timeZone: timeZone),
      time: MiniBook.formatMs((r["ms"] as? NSNumber)?.doubleValue),
      moves: (r["moves"] as? NSNumber)?.intValue ?? 0,
      synthetic: r["keyOrigin"] as? String == "synthetic",
      swipe: (r["inputs"] as? [String])?.contains("swipe") ?? false,
      hints: (r["hints"] as? NSNumber)?.intValue ?? 0,
      canReplay: canReplay(r))
  }

  /// 다시 볼 수 있는 판: 다시 보기 글·섞기 글이 있고 맞춘 판(사이트 `hasReplay`, `IdleShow.hasReplay`와 같다)
  public static func canReplay(_ r: [String: Any]) -> Bool {
    guard r["ms"] is NSNumber, let replay = r["replay"] as? String, !replay.isEmpty,
      let scramble = r["scramble"] as? String, !scramble.isEmpty
    else { return false }
    return true
  }

  /// 다시 보기 거울: 메뉴 「거울」이 켜져 있고 칸이 거울을 담을 만큼 클 때(짧은 변 ≥ 크기 × 10, 사이트 `MINI_MIRROR_PER_N`)
  public static func replayMirror(wanted: Bool, n: Int, short: CGFloat) -> Bool {
    wanted && short >= CGFloat(10 * n)
  }
}
