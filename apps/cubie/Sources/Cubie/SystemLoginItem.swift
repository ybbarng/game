import CubieCore
import Foundation
import ServiceManagement

/// 설정 창 「로그인할 때 열기」의 시스템 쪽: 이 앱 자신을 로그인 항목으로 등록한다(`SMAppService.mainApp`, macOS 13부터).
/// 판단은 `CubieCore/LoginItem.swift`
struct SystemLoginItem: LoginItemService {
  /// 앱 묶음으로 띄웠고 측정 모드가 아닐 때만(아니면 설정 창에 항목을 보이지 않는다)
  static func ifAvailable() -> SystemLoginItem? {
    LoginItem.available(bundleExtension: Bundle.main.bundleURL.pathExtension, measuring: Config.measure)
      ? SystemLoginItem() : nil
  }

  var status: LoginItem.Status {
    switch SMAppService.mainApp.status {
    case .enabled: .enabled
    case .requiresApproval: .requiresApproval
    case .notFound: .notFound
    default: .notRegistered
    }
  }

  func register() throws { try SMAppService.mainApp.register() }
  func unregister() throws { try SMAppService.mainApp.unregister() }
  func openSystemSettings() { SMAppService.openSystemSettingsLoginItems() }
}
