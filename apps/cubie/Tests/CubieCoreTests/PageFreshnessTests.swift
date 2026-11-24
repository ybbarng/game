import Foundation
import Testing

@testable import CubieCore

struct PageFreshnessTests {
  @Test func 사이트_창은_저장본이_있어도_서버에_묻는다() {
    #expect(PageFreshness.load == .reloadRevalidatingCacheData)
  }
}
