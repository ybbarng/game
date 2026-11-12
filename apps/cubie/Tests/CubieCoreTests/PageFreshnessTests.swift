import Foundation
import Testing

@testable import CubieCore

struct PageFreshnessTests {
  // MARK: 불러오기 캐시 정책

  @Test func 처음_불러오기는_저장본이_있어도_서버에_묻는다() {
    #expect(PageFreshness.load == .reloadRevalidatingCacheData)
    #expect(PageFreshness.forceFresh == .reloadIgnoringLocalCacheData)
  }

  // MARK: 실패

  @Test func 연결이_없을_때만_저장본으로_띄운다() {
    for code in [
      NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorCannotFindHost,
      NSURLErrorCannotConnectToHost, NSURLErrorTimedOut,
    ] {
      #expect(PageFreshness.onFailure(domain: NSURLErrorDomain, code: code) == .showCache)
    }
  }

  @Test func 연결과_상관없는_실패는_옛_저장본으로_덮지_않는다() {
    #expect(
      PageFreshness.onFailure(domain: NSURLErrorDomain, code: NSURLErrorServerCertificateUntrusted) == .showOffline)
    #expect(PageFreshness.onFailure(domain: NSURLErrorDomain, code: NSURLErrorBadServerResponse) == .showOffline)
    #expect(PageFreshness.onFailure(domain: "WebKitErrorDomain", code: 101) == .showOffline)
  }

  @Test func 다른_불러오기가_이어받은_실패는_건너뛴다() {
    #expect(PageFreshness.onFailure(domain: NSURLErrorDomain, code: NSURLErrorCancelled) == .ignore)
    #expect(PageFreshness.onFailure(domain: "WebKitErrorDomain", code: 102) == .ignore)
  }

  // MARK: 판 비교

  @Test func 화면_판과_배포_판이_다르면_한_번_더_불러온다() {
    #expect(PageFreshness.needsFreshReload(page: "aaa", deployed: "bbb", alreadyRetried: false))
  }

  @Test func 같거나_한_번_다시_불러왔으면_그대로() {
    #expect(!PageFreshness.needsFreshReload(page: "aaa", deployed: "aaa", alreadyRetried: false))
    #expect(!PageFreshness.needsFreshReload(page: "aaa", deployed: "bbb", alreadyRetried: true))
  }

  @Test func 커밋을_보내지_않는_옛_화면은_한_번_더_불러온다() {
    #expect(PageFreshness.needsFreshReload(page: nil, deployed: "bbb", alreadyRetried: false))
    #expect(!PageFreshness.needsFreshReload(page: nil, deployed: "bbb", alreadyRetried: true))
    #expect(!PageFreshness.needsFreshReload(page: nil, deployed: nil, alreadyRetried: false))
  }

  @Test func 판을_모르면_그대로() {
    #expect(!PageFreshness.needsFreshReload(page: "", deployed: "bbb", alreadyRetried: false))
    #expect(!PageFreshness.needsFreshReload(page: "unknown", deployed: "bbb", alreadyRetried: false))
    #expect(!PageFreshness.needsFreshReload(page: "aaa", deployed: nil, alreadyRetried: false))
    #expect(!PageFreshness.needsFreshReload(page: "aaa", deployed: "unknown", alreadyRetried: false))
  }

  @Test func 배포_판_파일에서_커밋을_꺼낸다() {
    let ok = Data(#"{"commit":"41f66d4956cebcafffea9076147b4102aba28174"}"#.utf8)
    #expect(PageFreshness.deployedCommit(fromVersionJSON: ok) == "41f66d4956cebcafffea9076147b4102aba28174")
    #expect(PageFreshness.deployedCommit(fromVersionJSON: Data(#"{"commit":"unknown"}"#.utf8)) == nil)
    #expect(PageFreshness.deployedCommit(fromVersionJSON: Data("<html>".utf8)) == nil)
  }
}
