import Foundation

/// 사이트 창(설정 창의 「모든 설정…」)을 늘 사이트의 최신 배포로 띄우기 위한 캐시 정책(2026-11-12, 배포한 변경이 앱에 안
/// 보인다는 지적). 저장해 둔 HTML이 있어도 서버에 바뀌었는지 묻는다(바뀌지 않았으면 304라 가볍다).
///
/// 예전 웹 큐브 창이 쓰던 「실패하면 연결이 없을 때만 저장본」·「빌드 커밋이 배포와 다르면 한 번 더 불러오기」는 그 창과
/// 함께 지웠다(git 태그 `cubie-web-fallback-last`, docs/52 5-20)
public enum PageFreshness {
  /// 사이트 창을 띄울 때의 캐시 정책: 저장본이 있어도 서버에 묻는다
  public static let load: URLRequest.CachePolicy = .reloadRevalidatingCacheData
}
