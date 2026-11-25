import Foundation

/// 큐브 창의 크기: 사용자 크기(기록 책 `cube.mini.v1`의 `n`)와 상황 놓기가 잠시 드는 3×3(docs/47 16-24).
/// 상황 놓기는 사용자 크기를 저장하지도 바꾸지도 않는다. 놓기가 끝나면(섞기·맞춘 상태로) 사용자 크기로 돌아가고,
/// 크기 고르기로 끝내면 고른 크기가 새 사용자 크기다. 껐다 켜면 저장된 사용자 크기로 연다(사이트 미니 `placeN`과 같다)
public final class MiniSize {
  /// 상황 놓기가 쓰는 크기(공식 연습 자료가 3×3)
  public static let placeN = 3

  private let book: MiniBook
  /// 상황을 놓느라 잠시 든 크기(없으면 nil)
  public private(set) var held: Int?

  public init(book: MiniBook) {
    self.book = book
  }

  /// 저장된 사용자 크기
  public var user: Int { book.n }
  /// 지금 보이는 크기
  public var shown: Int { held ?? user }

  /// 크기를 골랐다(메뉴): 사용자 크기로 저장한다. 잠시 든 크기는 버린다
  public func pick(_ n: Int) {
    held = nil
    book.savePrefs(n: n, mirror: book.mirror)
  }

  /// 상황을 놓는다: 보이는 크기가 3×3이 아니면 3×3을 잠시 들고 그 크기를 돌려준다(바꿀 것이 없으면 nil)
  public func holdForPlace() -> Int? {
    guard shown != Self.placeN else { return nil }
    held = Self.placeN
    return Self.placeN
  }

  /// 놓기가 끝났다(섞기·맞춘 상태로): 잠시 든 크기가 있었으면 내려놓고 돌아갈 사용자 크기를 돌려준다
  public func release() -> Int? {
    guard let h = held else { return nil }
    held = nil
    return user != h ? user : nil
  }

  /// 거울 켜기·끄기를 저장한다(크기는 사용자 크기 그대로)
  public func saveMirror(_ on: Bool) {
    book.savePrefs(n: user, mirror: on)
  }
}
