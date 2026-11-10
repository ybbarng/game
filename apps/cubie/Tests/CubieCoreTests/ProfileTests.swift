import Foundation
import Testing

@testable import CubieCore

struct ProfileTests {
  /// 1×1 투명 PNG(웹 `canvas.toDataURL("image/png")`과 같은 꼴)
  private let png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

  @Test func 웹이_보낸_프로필을_읽는다() {
    let p = Profile.from(message: [
      "type": "profile", "name": "익명 큐버 #4821", "photo": NSNull(), "signedIn": false, "n": 3,
      "tier": "gold", "tierText": "3×3 골드 II", "emblem": png,
    ])
    #expect(p?.name == "익명 큐버 #4821")
    #expect(p?.tierText == "3×3 골드 II")
    #expect(p?.emblem?.prefix(4) == Data([0x89, 0x50, 0x4E, 0x47]))
    #expect(p?.photo == nil)
    #expect(p?.signedIn == false)
  }

  @Test func 티어가_없으면_엠블럼_없이_글만() {
    let p = Profile.from(message: [
      "type": "profile", "name": "익명 큐버 #1000", "tier": NSNull(), "tierText": "3×3 5판 뒤에", "emblem": NSNull(),
    ])
    #expect(p?.tierText == "3×3 5판 뒤에")
    #expect(p?.emblem == nil)
  }

  @Test func 이름이_없거나_비면_버린다() {
    #expect(Profile.from(message: ["type": "profile"]) == nil)
    #expect(Profile.from(message: ["type": "profile", "name": "  "]) == nil)
    #expect(Profile.from(message: ["type": "profile", "name": 3]) == nil)
  }

  @Test func 모르는_칸과_모양이_틀린_칸은_버린다() {
    let p = Profile.from(message: [
      "name": "익명 큐버 #2000", "signedIn": "yes", "tierText": 5, "emblem": "https://example.com/a.png",
      "future": ["x": 1],
    ])
    #expect(p == Profile(name: "익명 큐버 #2000"))
  }

  @Test func 그림은_base64_data_URL만() {
    #expect(Profile.dataURL(png) != nil)
    #expect(Profile.dataURL("data:image/svg+xml;utf8,<svg/>") == nil)
    #expect(Profile.dataURL("data:text/plain;base64,aGk=") == nil)
    #expect(Profile.dataURL("data:image/png;base64,@@@") == nil)
  }

  @Test func 웹이_알려_주기_전에는_번호_없는_익명_이름() {
    #expect(Profile.placeholder.name == "익명 큐버")
    #expect(Profile.placeholder.emblem == nil)
  }
}
