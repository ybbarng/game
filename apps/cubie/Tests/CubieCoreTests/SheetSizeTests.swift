import Testing

@testable import CubieCore

/// 네이티브 보통 창의 가장 작은 크기(docs/52 5-8 「창 최소 크기」). 창은 `NativeSheetWindow(size: SheetSize)`로만 만들어
/// 가장 작은 크기 없이 만들 수 없고, 값은 화면 밖 스크린샷 `native-*-min`으로 글이 잘리지 않는지 본 것이다
struct SheetSizeTests {
  @Test func recordsWindowShrinksTo320Wide() {
    #expect(SheetSize.records.minWidth == 320)
    // 320 너비에서는 티어 칸이 세 줄로 높아져, 다시 보기를 연 채로 큐브가 보이려면 처음 높이 600이 필요했다
    #expect(SheetSize.records.minHeight == 600)
  }

  @Test func tiersAndSettingsWindowsKeepTheirFirstWidth() {
    // 진열 사다리·기준표, 키 배치 편집기 두 줄 칸이 760보다 좁으면 겹쳤다(560에서 확인)
    #expect(SheetSize.tiers.minWidth == SheetSize.tiers.width)
    #expect(SheetSize.settings.minWidth == SheetSize.settings.width)
  }

  @Test func everyWindowOpensAtOrAboveItsMinimum() {
    for s in [SheetSize.records, .tiers, .settings] {
      #expect(s.minWidth > 0 && s.minHeight > 0)
      #expect(s.width >= s.minWidth)
      #expect(s.height >= s.minHeight)
    }
  }
}
