import Foundation

/// 메뉴 맨 위 프로필 칸에 보일 것(docs/47 15-20). 자료 꼴을 정하는 곳은 웹(`apps/web/src/cube/mini/profile.ts`)이고,
/// 앱은 다리 메시지 `profile`을 받아 그리기만 한다. 나중에 사이트 패스키 로그인이 생겨 이름·사진이 바뀌어도
/// 웹만 바뀌면 되게, 앱은 이름·사진·티어 글·엠블럼 그림을 받은 그대로 쓴다.
public struct Profile: Equatable, Sendable {
  public var name: String
  /// 프로필 사진(PNG 등 그림 자료). nil이면 무채색 사람 모양
  public var photo: Data?
  public var signedIn: Bool
  /// 「3×3 골드 II」·「3×3 5판 뒤에」
  public var tierText: String?
  /// 티어 엠블럼 그림(PNG). 티어가 없거나 웹이 그리지 못했으면 nil
  public var emblem: Data?

  public init(
    name: String, photo: Data? = nil, signedIn: Bool = false, tierText: String? = nil, emblem: Data? = nil
  ) {
    self.name = name
    self.photo = photo
    self.signedIn = signedIn
    self.tierText = tierText
    self.emblem = emblem
  }

  /// 웹이 아직 알려 주지 않았을 때(화면이 뜨기 전, 프로필을 모르는 옛 웹). 번호는 웹이 정하므로 붙이지 않는다
  public static let placeholder = Profile(name: "익명 큐버")

  /// 다리 메시지 → 프로필. 이름이 없으면 nil. 모르는 칸은 버리고, 모양이 틀린 칸은 없는 것으로 본다
  public static func from(message d: [String: Any]) -> Profile? {
    guard let name = (d["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty
    else { return nil }
    let tierText = (d["tierText"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    return Profile(
      name: name,
      photo: (d["photo"] as? String).flatMap(dataURL),
      signedIn: d["signedIn"] as? Bool ?? false,
      tierText: tierText,
      emblem: (d["emblem"] as? String).flatMap(dataURL))
  }

  /// `data:image/png;base64,…` → 그림 자료. base64 그림 주소만 받는다(바깥 주소는 앱이 받으러 가지 않는다)
  public static func dataURL(_ s: String) -> Data? {
    guard s.hasPrefix("data:image/"), let comma = s.firstIndex(of: ",") else { return nil }
    let head = s[..<comma]
    guard head.hasSuffix(";base64") else { return nil }
    return Data(base64Encoded: String(s[s.index(after: comma)...]))
  }
}
