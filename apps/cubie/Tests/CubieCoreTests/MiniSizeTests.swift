import Testing

@testable import CubieCore

/// 상황 놓기는 사용자 크기를 바꾸지 않는다(docs/47 16-24, docs/52 5-21)
struct MiniSizeTests {
  /// 4×4를 고른 기록 책과 그 크기
  private func fourByFour() -> (MiniBook, MiniSize) {
    let book = MiniBook(store: MemoryStore(), math: FakeMath())
    let size = MiniSize(book: book)
    size.pick(4)
    return (book, size)
  }

  @Test func placingOnFourByFourHoldsThreeButKeepsTheSavedSize() {
    let (book, size) = fourByFour()
    #expect(size.holdForPlace() == 3)
    #expect(size.shown == 3)
    #expect(book.n == 4)
    // 다른 상황을 골라도 이미 3×3이라 바꿀 것이 없고 저장된 크기는 4
    #expect(size.holdForPlace() == nil)
    #expect(book.n == 4)
  }

  @Test func endingThePlacementReturnsToTheUserSize() {
    let (book, size) = fourByFour()
    _ = size.holdForPlace()
    #expect(size.release() == 4)
    #expect(size.shown == 4)
    #expect(book.n == 4)
    // 놓은 것이 없으면 돌아갈 크기도 없다
    #expect(size.release() == nil)
  }

  @Test func togglingTheMirrorWhilePlacedSavesTheUserSize() {
    let (book, size) = fourByFour()
    _ = size.holdForPlace()
    size.saveMirror(true)
    #expect(book.n == 4)
    #expect(book.mirror == true)
  }

  @Test func pickingASizeWhilePlacedMakesItTheNewUserSize() {
    let (book, size) = fourByFour()
    _ = size.holdForPlace()
    size.pick(3)
    #expect(size.held == nil)
    #expect(book.n == 3)
    #expect(size.release() == nil)
  }

  @Test func restartingWhilePlacedOpensTheSavedSize() {
    let (book, size) = fourByFour()
    _ = size.holdForPlace()
    // 껐다 켜면 같은 기록 책으로 새로 만든다
    #expect(MiniSize(book: book).shown == 4)
  }

  @Test func placingOnThreeByThreeChangesNothing() {
    let book = MiniBook(store: MemoryStore(), math: FakeMath())
    let size = MiniSize(book: book)
    size.pick(3)
    #expect(size.holdForPlace() == nil)
    #expect(size.release() == nil)
    #expect(book.n == 3)
  }
}
