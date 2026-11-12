import Foundation

/// 티어표 창의 글과 표(사이트 `apps/web/src/cube/tiers/TiersApp.tsx`·`TierTable.tsx`). 네이티브 티어표 창(`NativeTiersWindow`)이
/// 그린다. 표 값(구간 상한·WCA 경기자 수)은 Rust 코어가 사이트 표에서 만든 자료(`cubie_tier_table`)로 준다. 화면 글은 사이트와
/// 같아야 한다(웹 시험 `native-windows-text.test.ts`가 본다)
public enum TierSheet {
  public static let sizes = [2, 3, 4, 5, 6, 7]
  public static let labels = ["아이언", "브론즈", "실버", "골드", "플래티넘", "에메랄드", "다이아몬드", "마스터", "그랜드마스터", "챌린저"]
  public static let divisions = ["IV", "III", "II", "I"]

  // MARK: 글(사이트와 같다)

  public static let back = "← 큐브"
  public static let title = "티어표"
  public static let intro1 =
    "같은 크기 혼자 맞추기에서 낸 가장 좋은 Ao5로 티어를 매깁니다. Ao5는 연달아 맞춘 5번 가운데 가장 빠른 판과 가장 느린 판을 빼고 남은 3번의 평균입니다."
  public static let intro2 =
    "골드부터 위는 세계 큐브 협회(WCA) 대회 기록의 분포로 정했고, 아이언·브론즈·실버는 대회에 나가지 않는 사람까지 담도록 넓혔습니다. 큰 큐브는 3×3 기록이 같은 사람이 그 크기에서 내는 기록에 맞춰, 크기가 달라도 같은 티어면 비슷한 실력입니다."
  public static let mineLabel = "내 최고 Ao5"
  public static let noneBefore = "이 크기는 아직 Ao5가 없습니다. "
  public static let noneLink = "혼자 맞추기"
  public static let noneAfter = "에서 5번 맞추면 생깁니다."
  public static let deviceOnly = "기록은 이 기기에만 저장됩니다."
  public static let headTier = "티어"
  public static let headWca = "WCA 경기자 중"
  public static let outside = "대회 밖"
  public static let solvedAll = "다 맞춤"

  /// 표 위 설명(사이트 그대로, 경기자 수는 한국식 천 단위 쉼표)
  public static func tableNote(n: Int, people: Int) -> String {
    "칸의 시간은 그 구간에 드는 최고 Ao5의 상한입니다. 「WCA 경기자 중」은 그 티어에 드는 시간 이하인 대회 경기자의 비율입니다(\(n)×\(n) 평균 기록이 있는 약 \(grouped(people))명 가운데)."
  }

  public static func footer(date: String) -> String {
    "WCA 수치: WCA 결과 내보내기 \(date) 판. 그랜드마스터·챌린저 경계는 그때의 세계 약 1,000위·300위 기록이라 해마다 빨라질 수 있습니다."
  }

  /// 「12,345」(사이트 `toLocaleString("ko-KR")`)
  public static func grouped(_ v: Int) -> String {
    let s = String(v)
    var out = ""
    for (i, ch) in s.enumerated() {
      if i > 0, (s.count - i) % 3 == 0 { out.append(",") }
      out.append(ch)
    }
    return out
  }

  /// 상한 시간 글(사이트 `cutText`): 1분 아래 「9.3초」, 1시간 아래 「2:30」, 그 위 「1:10:00」, 끝없음 「다 맞춤」
  public static func cutText(_ sec: Double) -> String {
    if !sec.isFinite { return solvedAll }
    if sec < 60 { return "\(trim(sec))초" }
    let s = Int((sec + 0.5).rounded(.down))
    let h = s / 3600
    let m = (s % 3600) / 60
    let ss = String(format: "%02d", s % 60)
    return h > 0 ? "\(h):\(String(format: "%02d", m)):\(ss)" : "\(m):\(ss)"
  }

  /// 자바스크립트 숫자 글처럼(9.3 → 「9.3」, 14 → 「14」)
  static func trim(_ v: Double) -> String {
    v == v.rounded() ? String(Int(v)) : String(v)
  }

  /// 「상위 1.84% · 1,025명」·「대회 밖」(넓은 창의 오른쪽 칸)
  public static func wcaText(_ row: Row) -> String {
    guard let p = row.people, let pct = row.percent else { return outside }
    return "상위 \(trim(pct))% · \(grouped(p))명"
  }

  /// 한 칸 구간만 있는 줄의 글(「6.5초 이하」·「다 맞춤」)
  public static func singleText(_ cut: Double) -> String {
    cut.isFinite ? "\(cutText(cut)) 이하" : solvedAll
  }

  // MARK: 표

  public struct Row: Equatable, Sendable {
    /// 0 아이언 … 9 챌린저
    public var tier: Int
    /// 구간 상한(초). 넷(IV~I) 또는 하나
    public var cuts: [Double]
    public var people: Int?
    public var percent: Double?
  }

  public struct Table: Equatable, Sendable {
    public var n: Int
    public var people: Int
    public var date: String
    public var credit: String
    public var url: String
    /// 아이언부터
    public var rows: [Row]
  }

  /// 코어 `cubie_tier_table` 글 → 표. 표에 없는 크기·망가진 글이면 nil
  public static func parse(n: Int, text: String) -> Table? {
    let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
    guard lines.count >= 11 else { return nil }
    let head = lines[0].split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
    guard head.count == 4, let people = Int(head[0]) else { return nil }
    var rows: [Row] = []
    for (i, line) in lines[1...10].enumerated() {
      let f = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
      guard f.count == 3 else { return nil }
      let cuts = f[0].split(separator: ",").map { $0 == "inf" ? Double.infinity : Double($0) ?? .nan }
      guard cuts.count == 1 || cuts.count == 4, !cuts.contains(where: \.isNaN) else { return nil }
      rows.append(Row(tier: i, cuts: cuts, people: Int(f[1]), percent: Double(f[2])))
    }
    return Table(n: n, people: people, date: head[1], credit: head[2], url: head[3], rows: rows)
  }

  // MARK: 내 티어(사이트 `useMyTier`: 이 기기의 혼자 맞추기 기록)

  public static let recordsKey = "cube.records.v1"
  public static let bestFiveKey = "cube.best5.v1"

  /// 혼자 맞추기 기록(새것이 앞, 사이트 `loadRecords("solo", n)`)과 최고 5판(`loadBestFive`)
  public static func soloRecords(store: KeyValueStore, n: Int) -> (records: [Timeable], bestFive: [Timeable]) {
    func json(_ key: String) -> [String: Any] {
      guard let t = store.string(key), let d = t.data(using: .utf8),
        let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
      else { return [:] }
      return o
    }
    func valid(_ v: Any) -> [String: Any]? {
      guard let r = v as? [String: Any], r["at"] is NSNumber, r["n"] is NSNumber, r["moves"] is NSNumber else { return nil }
      if let ms = r["ms"], ms is NSNumber || ms is NSNull { return r }
      return nil
    }
    let list = (json(recordsKey)["solo-\(n)"] as? [Any] ?? []).compactMap(valid).map(Timeable.init)
    let raw = json(bestFiveKey)[String(n)] as? [Any] ?? []
    let five = raw.compactMap(valid)
    return (list, five.count == 5 && raw.count == 5 ? five.map(Timeable.init) : [])
  }
}
