import Foundation

/// 웹 화면을 늘 사이트의 최신 배포로 띄우기 위한 판단(2026-11-12, 배포한 변경이 앱에 안 보인다는 지적).
///
/// - 불러오기는 저장해 둔 HTML이 있어도 서버에 바뀌었는지 묻는다(`load`, 바뀌지 않았으면 304라 가볍다).
/// - 불러오기가 실패했을 때 저장본으로 띄우는 것은 연결이 없을 때만이다(`showsCacheOnFailure`). 연결과 상관없는 실패까지
///   저장본으로 띄우면 옛 화면이 조용히 남는다.
/// - 화면이 「준비됨」 알림에 실어 보낸 빌드 커밋(`ready.build`, 화면의 `main[data-mini-build]`와 같은 값)과 사이트에 배포된
///   커밋(`/version.json`)을 견줘 다르면 저장본을
///   쓰지 않고 한 번 더 불러온다(`needsFreshReload`). 어디서 옛 HTML이 남았든(HTTP 캐시·서비스 워커·실패 뒤 저장본) 같은
///   검사로 잡는다.
public enum PageFreshness {
  /// 웹 화면을 처음 띄우거나 메뉴 「다시 불러오기」로 띄울 때의 캐시 정책: 저장본이 있어도 서버에 묻는다
  public static let load: URLRequest.CachePolicy = .reloadRevalidatingCacheData
  /// 판이 어긋났을 때 한 번 더 불러오는 캐시 정책: 저장본을 쓰지 않는다
  public static let forceFresh: URLRequest.CachePolicy = .reloadIgnoringLocalCacheData

  /// 불러오기 실패를 어떻게 다룰지
  public enum FailureAction: Equatable, Sendable {
    /// 다른 불러오기가 이어받아 생긴 실패(취소·끼어든 불러오기). 아무것도 하지 않는다
    case ignore
    /// 연결이 없다: 저장해 둔 화면을 띄우고, 연결이 돌아오면 다시 불러온다
    case showCache
    /// 그 밖의 실패: 옛 저장본으로 덮지 않고 연결 없음 화면(다시 시도)을 띄운다
    case showOffline
  }

  /// WebKit이 「다른 불러오기가 끼어들어 이 불러오기를 멈췄다」고 알리는 코드(`WebKitErrorFrameLoadInterruptedByPolicyChange`)
  public static let webKitDomain = "WebKitErrorDomain"
  public static let webKitInterrupted = 102

  /// 연결이 없을 때 생기는 실패 코드(`NSURLError…`). 이때만 저장본으로 띄운다
  public static let offlineCodes: Set<Int> = [
    NSURLErrorNotConnectedToInternet,
    NSURLErrorNetworkConnectionLost,
    NSURLErrorCannotFindHost,
    NSURLErrorCannotConnectToHost,
    NSURLErrorDNSLookupFailed,
    NSURLErrorTimedOut,
    NSURLErrorInternationalRoamingOff,
    NSURLErrorDataNotAllowed,
    NSURLErrorCallIsActive,
  ]

  /// 처음 실패(저장본을 아직 시도하지 않음)를 어떻게 다룰지
  public static func onFailure(domain: String, code: Int) -> FailureAction {
    if domain == NSURLErrorDomain && code == NSURLErrorCancelled { return .ignore }
    if domain == webKitDomain && code == webKitInterrupted { return .ignore }
    if domain == NSURLErrorDomain && offlineCodes.contains(code) { return .showCache }
    return .showOffline
  }

  /// 띄운 화면을 저장본 없이 한 번 더 불러와야 하는가.
  /// - `page`: 화면이 「준비됨」 알림에 실어 보낸 빌드 커밋. nil은 커밋을 보내기 전(2026-11-12 이전) 화면이라 배포 판보다 옛것이다.
  ///   빈 값·`unknown`은 판을 모르는 빌드(개발 서버 등)라 그대로 둔다.
  /// - `deployed`: 사이트의 `/version.json` 커밋. 받지 못했거나 모르면 그대로 둔다.
  /// 한 번 다시 불러온 뒤에도 어긋나면 되풀이하지 않는다(배포가 막 바뀌는 순간 등에서 끝없이 불러오지 않게)
  public static func needsFreshReload(page: String?, deployed: String?, alreadyRetried: Bool) -> Bool {
    guard !alreadyRetried, let deployed = known(deployed) else { return false }
    guard let page else { return true }
    guard let mine = known(page) else { return false }
    return mine != deployed
  }

  /// `/version.json` 본문(`{"commit":"…"}`)에서 배포된 커밋을 꺼낸다
  public static func deployedCommit(fromVersionJSON data: Data) -> String? {
    guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    return known(obj["commit"] as? String)
  }

  private static func known(_ s: String?) -> String? {
    guard let t = s?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty, t != "unknown" else { return nil }
    return t
  }
}
