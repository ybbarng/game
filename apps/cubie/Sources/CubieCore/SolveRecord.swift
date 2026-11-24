import Foundation

/// 다 맞춘 한 판의 기록 JSON(사이트 `SolveRecord` 꼴, `cube.mini.v1`)을 꾸민다. 코어가 준 부분(시간·수·섞기·씨앗·다시
/// 보기 글·구간·콤보, `cubie_game_take_record`)에 앱이 아는 것을 더한다(사이트 미니 `addMiniRecord`와 같은 칸).
public enum SolveRecord {
  /// 키 출처의 나쁜 차례(한 판에 섞이면 가장 나쁜 것을 남긴다, docs/47 15-8)
  static let originRank = ["hardware": 0, "unknown": 1, "synthetic": 2]

  /// - `inputs`: 이번 판 입력 방식(처음 쓴 차례, 되돌리기는 세지 않음). 비면 칸을 두지 않는다
  /// - `origins`: 이번 판 키 출처들. 가장 나쁜 것 하나를 `keyOrigin`에
  /// - `hints`: 이번 판에 본 힌트 수. 0이면 칸을 두지 않는다
  /// - 혼자 맞추기(`mode: solo`)이고 Cubie는 살펴보기가 없다(`inspection: false`)
  public static func compose(
    partial: [String: Any], n: Int, atMs: Int, inputs: [String], origins: Set<String>, hints: Int
  ) -> [String: Any] {
    var r = partial
    r["at"] = atMs
    r["n"] = n
    r["mode"] = "solo"
    r["inspection"] = false
    if !inputs.isEmpty { r["inputs"] = inputs }
    if let o = origins.max(by: { (originRank[$0] ?? 1) < (originRank[$1] ?? 1) }) { r["keyOrigin"] = o }
    if hints > 0 { r["hints"] = hints }
    return r
  }
}

/// 거울 판을 보일지(사이트 `mirror.ts`, docs/47 15-14): 거울을 켰고, 창 짧은 변이 큐브 크기 n × 10pt 이상이고, 큐브에
/// 포커스가 있고, 맞추는 중(섞은 뒤 아직 맞추지 않은 판·공식 연습)이고, 떠 있을 때 연출 중이 아닐 때만
public enum MirrorRule {
  public static func shows(
    on: Bool, width: Double, height: Double, n: Int, focused: Bool, solving: Bool, idleShowing: Bool
  ) -> Bool {
    let fits = min(width, height) >= Double(10 * n)
    return on && fits && focused && solving && !idleShowing
  }
}
