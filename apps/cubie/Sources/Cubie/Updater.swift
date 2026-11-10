import AppKit
import Sparkle

/// 자동 업데이트(Sparkle 2, docs/47 15-12).
/// - 목록은 `SUFeedURL`(사이트의 /cubie/appcast.xml), 확인은 하루 한 번(`SUScheduledCheckInterval`), 업데이트 파일은 EdDSA로 확인한다.
/// - 메뉴 막대 앱이라 정해진 확인에서 새 판을 찾아도 창을 띄우지 않는다(하던 앱의 포커스를 빼앗지 않게).
///   메뉴 첫 줄에 「새 판 … 설치…」를 보이고, 누르면 그때 Sparkle 창을 연다.
@MainActor
final class Updater: NSObject, SPUStandardUserDriverDelegate {
  private var controller: SPUStandardUpdaterController?
  /// 정해진 확인에서 찾았지만 아직 보이지 않은 새 판(메뉴 첫 줄)
  private(set) var pendingVersion: String?

  override init() {
    super.init()
    // .app 안에서 띄웠을 때만 켠다. 실행 파일을 바로 띄우면(CUBIE_URL 확인용) 앱 묶음이 아니라 Sparkle이 시작하지 못하고 경고 창을 띄운다
    guard Bundle.main.bundleURL.pathExtension == "app",
      Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") != nil
    else { return }
    controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: self)
  }

  var isAvailable: Bool { controller != nil }

  /// 메뉴 「업데이트 확인…」·「새 판 … 설치…」
  func checkForUpdates() {
    // 사용자가 메뉴에서 고른 것이니 바로 앞으로(`AppDelegate.bringToFront`와 같은 까닭, 2026-11-10)
    NSApp.activate(ignoringOtherApps: true)
    controller?.checkForUpdates(nil)
  }

  // MARK: SPUStandardUserDriverDelegate

  nonisolated var supportsGentleScheduledUpdateReminders: Bool { true }

  nonisolated func standardUserDriverShouldHandleShowingScheduledUpdate(
    _ update: SUAppcastItem, andInImmediateFocus immediateFocus: Bool
  ) -> Bool {
    false
  }

  nonisolated func standardUserDriverWillHandleShowingUpdate(
    _ handleShowingUpdate: Bool, forUpdate update: SUAppcastItem, state: SPUUserUpdateState
  ) {
    let version = update.displayVersionString
    MainActor.assumeIsolated {
      if !handleShowingUpdate { pendingVersion = version }
    }
  }

  nonisolated func standardUserDriverWillFinishUpdateSession() {
    MainActor.assumeIsolated { pendingVersion = nil }
  }
}
