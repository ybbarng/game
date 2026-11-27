import Foundation

/// 설정 창의 「로그인할 때 열기」(macOS 로그인 항목, `SMAppService.mainApp`).
/// 켜졌는지는 따로 저장하지 않고 시스템 상태를 그대로 읽는다. 시스템 설정 → 일반 → 로그인 항목에서 바꿔도 설정 창을 열 때마다 맞게 보인다.
/// 시스템을 부르는 쪽은 `LoginItemService`로 받아, 시험은 실제 로그인 항목을 건드리지 않는다
public enum LoginItem {
  public static let label = "로그인할 때 열기"

  /// `SMAppService.Status`를 옮긴 것
  public enum Status: Equatable, Sendable {
    case notRegistered
    case enabled
    /// 등록했지만 사용자가 시스템 설정에서 허용해야 켜진다
    case requiresApproval
    case notFound
  }

  /// 항목을 보일지: 앱 묶음(.app)으로 띄웠을 때만. 실행 파일을 바로 띄우면 등록할 앱이 없고,
  /// 측정 모드(`CUBIE_MEASURE=1`)는 사용자 설정을 건드리지 않는다(DEVELOPMENT.md 「메모리 재기」)
  public static func available(bundleExtension: String, measuring: Bool) -> Bool {
    !measuring && bundleExtension == "app"
  }

  /// 켜진 것으로 보일지: 허용을 기다리는 동안은 아직 열리지 않으니 꺼진 것으로 보인다
  public static func isOn(_ status: Status) -> Bool { status == .enabled }

  /// 사용자가 칸을 바꾼 뒤 보일 상태. 등록·해제가 실패하면 시스템 상태가 그대로라 원래대로 돌아간다.
  /// 허용이 필요하면 시스템 설정의 로그인 항목을 연다
  @discardableResult
  public static func set(_ on: Bool, service: LoginItemService) -> Bool {
    let before = service.status
    if on {
      switch before {
      case .enabled: break
      case .requiresApproval: service.openSystemSettings()
      case .notRegistered, .notFound:
        if (try? service.register()) != nil, service.status == .requiresApproval {
          service.openSystemSettings()
        }
      }
    } else if before == .enabled || before == .requiresApproval {
      try? service.unregister()
    }
    return isOn(service.status)
  }
}

/// 로그인 항목을 다루는 시스템 쪽(앱은 `SMAppService.mainApp`)
public protocol LoginItemService {
  var status: LoginItem.Status { get }
  func register() throws
  func unregister() throws
  func openSystemSettings()
}
