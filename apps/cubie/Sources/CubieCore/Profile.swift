import Foundation

/// 메뉴 맨 위 프로필 칸에 보일 것(docs/47 15-20). 저장 꼴은 사이트(`apps/web/src/cube/mini/profile.ts`)와 같고, 큐브 창
/// (`NativeCubeWindow.refreshProfile`)이 저장소에서 읽어 이름·티어 글·엠블럼을 채운다.
public struct Profile: Equatable, Sendable {
  public var name: String
  /// 프로필 사진(PNG 등 그림 자료). nil이면 무채색 사람 모양
  public var photo: Data?
  public var signedIn: Bool
  /// 「3×3 골드 II」·「3×3 5판 뒤에」
  public var tierText: String?
  /// 티어 엠블럼 그림(PNG). 티어가 없거나 웹이 그리지 못했으면 nil
  public var emblem: Data?
  /// 엠블럼 티어 id(「gold」). 있으면 메뉴가 열린 동안 앱에 묶은 흔들기 그림으로 천천히 흔든다(네이티브 화면, docs/52 5-11)
  public var emblemTier: String?

  public init(
    name: String, photo: Data? = nil, signedIn: Bool = false, tierText: String? = nil, emblem: Data? = nil,
    emblemTier: String? = nil
  ) {
    self.name = name
    self.photo = photo
    self.signedIn = signedIn
    self.tierText = tierText
    self.emblem = emblem
    self.emblemTier = emblemTier
  }

  /// 프로필을 읽기 전(큐브 창이 뜨기 전)
  public static let placeholder = Profile(name: "익명 큐버")

  /// 저장소 키(사이트 `profile.ts`와 같은 키·같은 JSON 꼴 `{"version":1,"name":"…"}`)
  public static let storeKey = "cube.mini.profile.v1"

  /// 저장된 프로필 글에서 이름. 없거나 빈 이름·모양이 틀린 글이면 nil(새 이름을 지어 저장한다, `madeName`)
  public static func storedName(_ text: String?) -> String? {
    guard let data = text?.data(using: .utf8),
      let d = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let s = d["name"] as? String, !s.trimmingCharacters(in: .whitespaces).isEmpty
    else { return nil }
    return s
  }

  /// 새로 짓는 이름: 「익명 큐버 #1000」~「#9999」(`pick`은 0..<9000 하나)와 그 저장 글
  public static func madeName(_ pick: Int) -> (name: String, stored: String) {
    let name = "익명 큐버 #\(1000 + pick)"
    return (name, #"{"version":1,"name":"\#(name)"}"#)
  }

  /// 메뉴 프로필 칸 티어 글: 「3×3 골드 II」, 티어가 아직 없으면 「3×3 5판 뒤에」
  public static func tierText(n: Int, tierName: String?) -> String {
    "\(n)×\(n) \(tierName ?? "5판 뒤에")"
  }
}
