import AppKit
import CubieCore
import Sparkle

/// 자동 업데이트(Sparkle 2, docs/47 15-12·docs/52 5-24).
/// - 목록은 `SUFeedURL`(사이트의 /cubie/appcast.xml), 확인은 하루 한 번(`SUScheduledCheckInterval`), 업데이트 파일은 EdDSA로 확인한다.
/// - 메뉴 막대 앱이라 정해진 확인에서 새 판을 찾아도 창을 띄우지 않는다(하던 앱의 포커스를 빼앗지 않게).
///   메뉴 첫 줄(메뉴 막대·큐브 오른쪽 클릭)에 「새 판 … 설치…」를 보이고, 누르면 그때 Sparkle 창을 연다.
///   사용자가 큐브로 오면 큐브 옆 말풍선으로도 알린다(`AppDelegate.showUpdateNoticeIfDue`, `UpdateNotice`).
/// - 정해진 확인이 찾은 항목은 판 번호만 기억하고 그 세션을 끝낸다(`updater(_:shouldProceedWithUpdate:updateCheck:)`가 오류를
///   던진다, `UpdateFlow.proceeds`). 세션을 열어 두면 사용자가 하루 뒤에 눌러도 Sparkle은 다시 확인하지 않고 그때 찾은 옛 항목을
///   설치한다(0.11.4가 11-25에 찾은 0.11.6을 11-26 0.12.3 대신 설치했다). 사용자가 누르면 늘 새 세션이라 그때의 맨 위 판을 받는다.
///   「이 버전 건너뛰기」는 사용자가 Sparkle 창에서 고를 때만 남는다.
/// - 지난번에 켜다 꺼졌으면(`Launch.mode.promptsUpdate`) 켜자마자 확인하고, 새 판이 있으면 Sparkle 창을 앞에 띄운다.
@MainActor
final class Updater: NSObject, SPUStandardUserDriverDelegate, SPUUpdaterDelegate {
  private var controller: SPUStandardUpdaterController?
  /// 찾았지만 아직 깔지 않은 새 판(메뉴 첫 줄·말풍선). 바뀌는 차례는 `UpdateFlow.pending`
  private(set) var pendingVersion: String?
  /// 안전하게 켠 때: 정해진 확인도 Sparkle 창을 띄운다(그 한 번만)
  private var prompt = false

  /// 정해진 확인을 일부러 끝낼 때 던지는 오류(사용자에게 보이지 않는다)
  static let rememberedDomain = "kr.byb.cubie.update"

  init(prompt: Bool) {
    super.init()
    // .app 안에서 띄웠을 때만 켠다. 실행 파일을 바로 띄우면(CUBIE_URL 확인용) 앱 묶음이 아니라 Sparkle이 시작하지 못하고 경고 창을 띄운다
    guard !Config.measure, Bundle.main.bundleURL.pathExtension == "app",
      Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") != nil
    else { return }
    let c = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: self)
    controller = c
    // 켜다 꺼진 뒤: 시작한 바로 뒤에 한 번 확인한다(`SPUUpdater.h` `checkForUpdatesInBackground`: 켤 때마다 확인하려면 시작 바로 뒤,
    // 자동 확인이 켜졌을 때만 부르라고 한다). 새 판이 없으면 아무것도 띄우지 않는다
    if prompt, c.updater.automaticallyChecksForUpdates {
      self.prompt = true
      c.updater.checkForUpdatesInBackground()
    }
  }

  var isAvailable: Bool { controller != nil }

  /// 메뉴 「업데이트 확인…」·「새 판 … 설치…」. 늘 새 세션이라 그때 appcast의 맨 위 판을 받는다
  func checkForUpdates() {
    // 사용자가 메뉴에서 고른 것이니 바로 앞으로(`SheetWindows.bringToFront`와 같은 까닭, 2026-11-10)
    NSApp.activate(ignoringOtherApps: true)
    if Config.debug {
      print("[cubie] update check user session=\(controller?.updater.sessionInProgress ?? false)"); fflush(stdout)
    }
    controller?.checkForUpdates(nil)
  }

  private func note(_ event: UpdateFlow.Event) {
    pendingVersion = UpdateFlow.pending(pendingVersion, after: event)
    if Config.debug { print("[cubie] update \(event) pending=\(pendingVersion ?? "nil")"); fflush(stdout) }
  }

  private static func check(_ c: SPUUpdateCheck) -> UpdateFlow.Check {
    switch c {
    case .updates: return .user
    case .updatesInBackground: return .background
    default: return .information
    }
  }

  // MARK: SPUUpdaterDelegate

  func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
    note(.found(item.displayVersionString))
  }

  func updaterDidNotFindUpdate(_ updater: SPUUpdater, error: any Error) {
    note(.notFound)
  }

  func updater(_ updater: SPUUpdater, shouldProceedWithUpdate updateItem: SUAppcastItem, updateCheck: SPUUpdateCheck)
    throws
  {
    let check = Self.check(updateCheck)
    let go = UpdateFlow.proceeds(check, prompt: prompt, autoDownload: updater.automaticallyDownloadsUpdates)
    if Config.debug {
      print("[cubie] update proceed \(updateItem.displayVersionString) check=\(check) go=\(go)"); fflush(stdout)
    }
    if go { return }
    // 정해진 확인: 판 번호만 기억하고(`didFindValidUpdate`는 이어 갈 때만 이 뒤에 불린다, 시험 사본에서 확인) 세션을 여기서 끝내
    // 사용자가 누를 때 새로 확인하게 한다. 오류를 던지면 항목을 보이지도 내려받지도 않고(`SPUUpdaterDelegate.h`), 건너뛰기로 남지도 않는다
    note(.found(updateItem.displayVersionString))
    throw NSError(
      domain: Self.rememberedDomain, code: 1,
      userInfo: [NSLocalizedDescriptionKey: "정해진 확인이 찾은 새 판은 메뉴로 알린다"])
  }

  func updater(
    _ updater: SPUUpdater, userDidMake choice: SPUUserUpdateChoice, forUpdate updateItem: SUAppcastItem,
    state: SPUUserUpdateState
  ) {
    switch choice {
    case .skip: note(.skipped)
    case .dismiss: note(.dismissed)
    default: break
    }
  }

  func updater(_ updater: SPUUpdater, didFinishUpdateCycleFor updateCheck: SPUUpdateCheck, error: (any Error)?) {
    // 켜다 꺼진 뒤 띄우는 창은 켜자마자 한 번만
    if Self.check(updateCheck) == .background { prompt = false }
    if Config.debug {
      print("[cubie] update cycle done check=\(Self.check(updateCheck)) error=\((error as NSError?)?.code ?? 0)")
      fflush(stdout)
    }
  }

  // MARK: SPUStandardUserDriverDelegate

  nonisolated var supportsGentleScheduledUpdateReminders: Bool { true }

  /// 정해진 확인이 찾은 항목은 보통 `shouldProceedWithUpdate`에서 끝나 여기까지 오지 않는다. 켜다 꺼진 뒤에만 와서 창을 띄운다
  nonisolated func standardUserDriverShouldHandleShowingScheduledUpdate(
    _ update: SUAppcastItem, andInImmediateFocus immediateFocus: Bool
  ) -> Bool {
    MainActor.assumeIsolated { prompt }
  }

  nonisolated func standardUserDriverWillHandleShowingUpdate(
    _ handleShowingUpdate: Bool, forUpdate update: SUAppcastItem, state: SPUUserUpdateState
  ) {
    let version = update.displayVersionString
    let userInitiated = state.userInitiated
    MainActor.assumeIsolated {
      if Config.debug { print("[cubie] update show \(version) byDriver=\(handleShowingUpdate)"); fflush(stdout) }
      // 켜다 꺼진 뒤 정해진 확인이 띄우는 창은 메뉴 막대 앱이라 다른 창 뒤에 뜰 수 있다. 눈에 띄게 앞으로
      if handleShowingUpdate, !userInitiated, prompt { NSApp.activate(ignoringOtherApps: true) }
    }
  }
}
