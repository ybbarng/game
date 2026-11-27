import Foundation
import Testing

@testable import CubieCore

/// 설정 창 「로그인할 때 열기」: 시스템 로그인 항목 대신 흉내 낸 것을 넣어, 칸을 바꾼 뒤 보일 상태와 시스템에 한 일을 본다
struct LoginItemTests {
  struct Failure: Error {}

  final class FakeService: LoginItemService {
    var status: LoginItem.Status
    /// 등록하면 바뀔 상태(허용이 필요한 맥이면 `.requiresApproval`)
    var afterRegister: LoginItem.Status = .enabled
    var fails = false
    var calls: [String] = []

    init(_ status: LoginItem.Status) { self.status = status }

    func register() throws {
      calls.append("register")
      if fails { throw Failure() }
      status = afterRegister
    }

    func unregister() throws {
      calls.append("unregister")
      if fails { throw Failure() }
      status = .notRegistered
    }

    func openSystemSettings() { calls.append("openSystemSettings") }
  }

  @Test func showsOnlyInAppBundleOutsideMeasureMode() {
    #expect(LoginItem.available(bundleExtension: "app", measuring: false))
    #expect(!LoginItem.available(bundleExtension: "app", measuring: true))
    #expect(!LoginItem.available(bundleExtension: "", measuring: false))
    #expect(!LoginItem.available(bundleExtension: "release", measuring: false))
  }

  @Test func onlyEnabledShowsAsOn() {
    #expect(LoginItem.isOn(.enabled))
    #expect(!LoginItem.isOn(.requiresApproval))
    #expect(!LoginItem.isOn(.notRegistered))
    #expect(!LoginItem.isOn(.notFound))
  }

  @Test func turningOnRegisters() {
    let s = FakeService(.notRegistered)
    #expect(LoginItem.set(true, service: s) == true)
    #expect(s.calls == ["register"])
    #expect(s.status == .enabled)
  }

  @Test func turningOffUnregisters() {
    let s = FakeService(.enabled)
    #expect(LoginItem.set(false, service: s) == false)
    #expect(s.calls == ["unregister"])
  }

  @Test func failedRegisterStaysOffQuietly() {
    let s = FakeService(.notRegistered)
    s.fails = true
    #expect(LoginItem.set(true, service: s) == false)
    #expect(s.calls == ["register"])
  }

  @Test func failedUnregisterStaysOn() {
    let s = FakeService(.enabled)
    s.fails = true
    #expect(LoginItem.set(false, service: s) == true)
  }

  @Test func needingApprovalStaysOffAndOpensSystemSettings() {
    let s = FakeService(.notRegistered)
    s.afterRegister = .requiresApproval
    #expect(LoginItem.set(true, service: s) == false)
    #expect(s.calls == ["register", "openSystemSettings"])
    // 다시 켜려 하면 등록은 그대로 두고 시스템 설정만 연다
    s.calls = []
    #expect(LoginItem.set(true, service: s) == false)
    #expect(s.calls == ["openSystemSettings"])
  }

  @Test func alreadyEnabledDoesNothing() {
    let s = FakeService(.enabled)
    #expect(LoginItem.set(true, service: s) == true)
    #expect(s.calls.isEmpty)
    let off = FakeService(.notRegistered)
    #expect(LoginItem.set(false, service: off) == false)
    #expect(off.calls.isEmpty)
  }
}
