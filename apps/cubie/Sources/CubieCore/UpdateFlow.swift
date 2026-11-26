import Foundation

/// 새 판 확인 흐름(docs/52 5-24). Sparkle 대리자가 묻는 것의 판단만 떼어 둔다(Sparkle을 모른다).
/// - 정해진 확인(하루 한 번)이 찾은 새 판은 판 번호만 기억하고 그 업데이트 세션은 거기서 끝낸다. 세션을 열어 두면 사용자가
///   나중에 「업데이트 확인」·「새 판 … 설치…」를 눌러도 Sparkle은 새로 확인하지 않고 열린 세션의 옛 항목을 띄운다
///   (`SPUUpdater.h` `checkForUpdates`: "If the user is already being presented with an update … that notice may be shown").
/// - 사용자가 누른 확인은 늘 새 세션이라 그때 appcast의 맨 위 판을 받는다.
public enum UpdateFlow {
  /// Sparkle `SPUUpdateCheck`와 같은 셋
  public enum Check: Sendable {
    /// 사용자가 누른 확인(`checkForUpdates`)
    case user
    /// 정해진 확인(`checkForUpdatesInBackground`)
    case background
    /// 알아보기만(`checkForUpdateInformation`, 설치를 권하지 않는다)
    case information
  }

  /// 찾은 항목으로 세션을 이어 갈까(이으면 Sparkle 창·내려받기로 간다). false면 판 번호만 기억하고 세션을 끝낸다.
  /// `prompt`: 지난번에 켜다 꺼져 안전하게 켠 때(`LaunchGuard`)는 정해진 확인도 이어 가 Sparkle 창을 띄운다.
  /// `autoDownload`: 사용자가 Sparkle 창에서 「앞으로 자동으로 받아 설치」를 골랐으면(`automaticallyDownloadsUpdates`) 창 없이
  /// 받아 두는 Sparkle 흐름대로 이어 간다(docs/47 15-12)
  public static func proceeds(_ check: Check, prompt: Bool, autoDownload: Bool = false) -> Bool {
    switch check {
    case .user, .information: return true
    case .background: return prompt || autoDownload
    }
  }

  /// 메뉴 첫 줄·말풍선이 알릴 새 판이 바뀌는 일
  public enum Event: Sendable, Equatable {
    /// 어느 확인이든 새 판을 찾았다(그 판으로 바꾼다)
    case found(String)
    /// 새 판이 없다(이미 맨 위 판)
    case notFound
    /// 사용자가 Sparkle 창에서 「이 버전 건너뛰기」를 골랐다
    case skipped
    /// 사용자가 Sparkle 창을 「나중에」로 닫았다
    case dismissed
    /// 확인이 오류로 끝났다(연결 끊김 등, 정해진 확인을 일부러 끝낸 것 포함)
    case failed
  }

  /// 알릴 새 판(`nil`이면 메뉴 첫 줄·말풍선이 없다)
  public static func pending(_ current: String?, after event: Event) -> String? {
    switch event {
    case .found(let v): return v
    case .notFound, .skipped: return nil
    case .dismissed, .failed: return current
    }
  }
}
