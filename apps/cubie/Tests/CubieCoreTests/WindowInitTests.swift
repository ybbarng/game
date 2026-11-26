import Foundation
import Testing

/// 떠 있는 창 초기화 중 트랩(2026-11-26, Cubie 0.11.6 켜자마자 충돌):
/// `FloatingWindow.init`은 저장해 둔 창 자리를 놓으며(`placeWindow` → `fitToScreens` → `setFrame`) 크기 바뀜 알림을 낸다.
/// 이 알림은 하위 클래스(`NativeCubeWindow.windowDidResize` → `updateMirror`)를 하위 클래스의 `super.init()` 뒤 줄보다 먼저 부른다.
/// 그 사이 nil인 암묵적 언래핑 속성(`var idle: IdleShow!`)을 읽으면 트랩한다. 화면 배치별 저장 크기가 기본(96×96)과 다른
/// 사용자는 켤 때마다 충돌했다. 그래서 떠 있는 창과 그 하위 클래스에는 `!` 저장 속성을 두지 않는다(`lazy var`나 옵셔널로).
struct WindowInitTests {
  private let sources = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent(
    "../../Sources/Cubie")

  /// `FloatingWindow.swift`와 `: FloatingWindow`를 이어받는 클래스가 있는 파일
  private func floatingWindowFiles() throws -> [String] {
    let names = try FileManager.default.contentsOfDirectory(atPath: sources.path).filter { $0.hasSuffix(".swift") }
    return try names.filter { name in
      let text = try String(contentsOf: sources.appendingPathComponent(name), encoding: .utf8)
      return name == "FloatingWindow.swift" || text.contains(": FloatingWindow")
    }.sorted()
  }

  /// 암묵적 언래핑 형식으로 선언한 저장 속성 줄(`var a: T!`, `let a: T! = …`)
  static func implicitlyUnwrappedStored(_ text: String) -> [String] {
    let pattern =
      #"^[ \t]*(?:@\w+[ \t]+)*(?:(?:private|fileprivate|internal|public)(?:\(set\))?[ \t]+)*(?:var|let)[ \t]+\w+[ \t]*:[^=/{]*![ \t]*(?:=.*|//.*)?$"#
    let re = try! NSRegularExpression(pattern: pattern)
    return text.split(separator: "\n").map(String.init).filter { line in
      re.firstMatch(in: line, range: NSRange(location: 0, length: (line as NSString).length)) != nil
    }.map { $0.trimmingCharacters(in: .whitespaces) }
  }

  @Test func theCheckFindsImplicitlyUnwrappedStoredProperties() {
    let found = Self.implicitlyUnwrappedStored(
      """
        private var idle: IdleShow!
        private(set) var gate: HintGate! // 나중에
        var ok: Int?
        private lazy var later = IdleShow()
        let flag = a != b
      """)
    #expect(found == ["private var idle: IdleShow!", "private(set) var gate: HintGate! // 나중에"])
  }

  @Test func floatingWindowsHaveNoImplicitlyUnwrappedStoredProperties() throws {
    let files = try floatingWindowFiles()
    #expect(files.contains("FloatingWindow.swift"))
    #expect(files.contains("NativeCubeWindow.swift"))
    for file in files {
      let text = try String(contentsOf: sources.appendingPathComponent(file), encoding: .utf8)
      #expect(Self.implicitlyUnwrappedStored(text) == [], "\(file): super.init() 안 창 알림이 nil을 읽을 수 있다")
    }
  }
}
