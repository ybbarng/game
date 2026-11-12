import Foundation
import SQLite3
import Testing

@testable import CubieCore

/// 시험용 평균 계산(앱은 Rust 코어를 쓴다. 여기서는 기록 책의 보관 규칙만 본다): 가운데 셋 평균, DNF 둘이면 없음
struct FakeMath: TierMath {
  func ao5(_ five: [Timeable]) -> Double? {
    guard five.count == 5 else { return nil }
    let v = five.map { $0.result ?? .infinity }.sorted()
    let mid = v[1...3]
    return mid.contains(.infinity) ? nil : mid.reduce(0, +) / 3
  }

  func bestAo5(_ records: [Timeable]) -> (ms: Double, at: Int)? {
    var best: (Double, Int)?
    guard records.count >= 5 else { return nil }
    for i in 0...(records.count - 5) {
      let five = Array(records[i..<i + 5])
      if five.contains(where: { $0.hints > 0 }) { continue }
      if let v = ao5(five), best == nil || v < best!.0 { best = (v, i) }
    }
    return best
  }

  func myTier(n: Int, records: [Timeable], bestFive: [Timeable]) -> TierInfo? {
    let a = bestAo5(records)?.ms
    let b = bestFive.count == 5 ? ao5(bestFive) : nil
    guard let v = [a, b].compactMap({ $0 }).min() else { return nil }
    return TierInfo(ao5: v, tier: 3, division: 1, name: "골드 III")
  }
}

func record(_ ms: Double?, n: Int = 3, at: Int = 1, hints: Int = 0, replay: String? = "R@0") -> [String: Any] {
  var r: [String: Any] = ["at": at, "n": n, "mode": "solo", "ms": ms.map { $0 as Any } ?? NSNull(), "penalty": 0, "moves": 10]
  if hints > 0 { r["hints"] = hints }
  if let replay { r["replay"] = replay }
  return r
}

@MainActor
struct MiniBookTests {
  @Test func addsWithNumbersAndKeepsUnknownFields() throws {
    let store = MemoryStore()
    let book = MiniBook(store: store, math: FakeMath())
    var first = record(1000)
    first["future"] = "kept"
    book.add(first)
    book.add(record(2000))
    let list = book.records(3)
    #expect(list.count == 2)
    #expect((list[0]["no"] as? NSNumber)?.intValue == 2)
    #expect((list[1]["no"] as? NSNumber)?.intValue == 1)
    #expect(list[1]["future"] as? String == "kept")
    #expect(book.best(3) == 1000)
    #expect(book.records(4).isEmpty)
  }

  @Test func capsAtHundredAndTrimsOldReplays() {
    let book = MiniBook(store: MemoryStore(), math: FakeMath())
    for i in 0..<105 { book.add(record(Double(10_000 + i), at: i)) }
    let list = book.records(3)
    #expect(list.count == 100)
    #expect((list[0]["no"] as? NSNumber)?.intValue == 105)
    #expect(list.prefix(30).allSatisfy { $0["replay"] != nil })
    #expect(list.dropFirst(30).allSatisfy { $0["replay"] == nil })
  }

  @Test func bestFiveSurvivesTheCapAndSkipsHintedRuns() {
    let book = MiniBook(store: MemoryStore(), math: FakeMath())
    for i in 0..<5 { book.add(record(5000 + Double(i), at: i)) }
    #expect(book.bestFive(3).count == 5)
    for i in 0..<120 { book.add(record(60_000, at: 100 + i)) }
    // 최고 5판은 목록에서 밀려도 남고, 다시 보기 글째 남는다
    #expect(book.bestFive(3).count == 5)
    #expect(book.bestFive(3).allSatisfy { $0["replay"] != nil })
    #expect(book.tier(3)?.ao5 == 5002)
    // 힌트를 본 빠른 판들은 최고 5판이 되지 않는다
    let other = MiniBook(store: MemoryStore(), math: FakeMath())
    for i in 0..<5 { other.add(record(1000, n: 2, at: i, hints: 1)) }
    #expect(other.bestFive(2).isEmpty)
    #expect(other.tier(2) == nil)
  }

  @Test func whenStorageIsFullItTrimsReplaysToFive() {
    let store = MemoryStore()
    let book = MiniBook(store: store, math: FakeMath())
    let long = String(repeating: "R@1 ", count: 50)
    for i in 0..<20 { book.add(record(9000, at: i, replay: long)) }
    let full = store.values[MiniBook.key]!.count
    store.limit = full
    book.add(record(9000, at: 99, replay: long))
    let list = book.records(3)
    #expect(list.count == 21)
    #expect(list.filter { $0["replay"] != nil }.count == 5)
  }

  @Test func prefsAndBrokenText() {
    let store = MemoryStore([MiniBook.key: "{nope"])
    let book = MiniBook(store: store, math: FakeMath())
    #expect(book.n == 3 && book.mirror)
    book.savePrefs(n: 5, mirror: false)
    #expect(book.n == 5 && !book.mirror)
    book.savePrefs(n: 9, mirror: true)
    #expect(book.n == 5)
    // 사이트가 쓴 글도 그대로 읽는다
    let site = MemoryStore([
      MiniBook.key:
        #"{"version":1,"n":2,"mirror":false,"records":{"2":[{"at":1,"n":2,"mode":"solo","ms":null,"penalty":0,"moves":3,"scramble":"R"},{"bad":1}]},"best5":{}}"#
    ])
    let b2 = MiniBook(store: site, math: FakeMath())
    #expect(b2.n == 2 && !b2.mirror)
    #expect(b2.records(2).count == 1)
    #expect(b2.best(2) == nil)
  }
}

struct SettingsTests {
  @Test func parsesLikeTheSite() {
    #expect(CubeSettings.parse(nil) == CubeSettings())
    let s = CubeSettings.parse(
      #"{"colorScheme":"highContrast","moveMs":250,"sound":false,"stickerless":true,"scrambleShow":"spin"}"#)
    #expect(s.colors[1] == 0xe00000)
    #expect(s.moveMs == 200)
    #expect(!s.sound && s.stickerless && s.scrambleShow == .spin)
    let custom = CubeSettings.parse(#"{"colorScheme":"custom","colors":[1,2,3,4,5,6],"moveMs":"x","sound":1}"#)
    #expect(custom.colors == [1, 2, 3, 4, 5, 6])
    #expect(custom.moveMs == 90 && custom.sound)
    let badCustom = CubeSettings.parse(#"{"colorScheme":"custom","colors":[1,2,3]}"#)
    #expect(badCustom.colors == CubeSettings.standard)
    #expect(CubeSettings.parse(#"{"moveMs":44.5}"#).moveMs == 45)
  }

  @Test func keymapLikeTheSite() {
    #expect(StoredKeymap.parse(nil).preset == "twoHand")
    #expect(StoredKeymap.parse(#"{"version":1,"preset":"notation","bindings":[{"code":"X"}]}"#).preset == "notation")
    let k = StoredKeymap.parse(
      #"{"version":1,"preset":"custom","bindings":[{"code":"KeyJ","action":"R'"},{"code":"Enter","shift":true,"action":"scramble"},{"code":"Backslash","action":"U"}]}"#
    )
    #expect(k.preset == "custom" && k.bindings.count == 3)
    #expect(k.bindings[1].mods == 1)
    #expect(k.scrambleKey?.code == "Enter" && k.scrambleKey?.shift == true)
    #expect(k.usesBackslash)
    // 한 칸이라도 틀리면 배치 전체를 버린다(사이트 가져오기와 같다)
    #expect(StoredKeymap.parse(#"{"version":1,"preset":"custom","bindings":[{"code":"Key J","action":"R"}]}"#).preset == "twoHand")
    #expect(StoredKeymap.parse(#"{"version":2,"preset":"custom","bindings":[]}"#).preset == "twoHand")
    #expect(StoredKeymap().scrambleKey?.code == "Enter")
  }
}

@MainActor
struct ClockAndSessionTests {
  @Test func focusClockOnlyRunsWhileFocused() {
    let base = ManualClock(1000)
    let c = FocusClock(base: base)
    base.advance(500)
    #expect(c.now() == 0)
    c.setFocused(true)
    base.advance(300)
    c.setFocused(false)
    base.advance(10_000)
    c.setFocused(true)
    base.advance(200)
    #expect(c.now() == 500)
  }

  @Test func hintGateRules() {
    let clock = ManualClock()
    let g = HintGate(clock: clock)
    #expect(g.request() == .ok(used: 1))
    #expect(g.showing)
    clock.advance(5000)
    #expect(!g.showing)
    #expect(g.request() == .cooldown(seconds: 15))
    clock.advance(15_000)
    #expect(g.request() == .ok(used: 2))
    g.hide()
    #expect(!g.showing)
    clock.advance(20_000)
    #expect(g.request() == .ok(used: 3))
    clock.advance(20_000)
    #expect(g.request() == .limit)
    g.reset()
    #expect(g.request() == .ok(used: 1))
  }

  @Test func soloSessionTimesFromFirstFaceTurn() {
    let s = MiniSolve(n: 3)
    // 섞기 전 수는 기록에 들지 않는다
    #expect(s.input(notation: "R", rotation: false, solvedAfter: false, now: 10) == nil)
    s.start(scramble: "R U", seed: 7)
    #expect(s.moveCount == 0 && s.phase == .ready)
    // 시작 전 큐브 돌리기는 수로 세지 않고, 시각은 시작 기준 음수
    _ = s.input(notation: "y", rotation: true, solvedAfter: false, now: 1000)
    _ = s.input(notation: "U'", rotation: false, solvedAfter: false, now: 1400)
    #expect(s.phase == .solving)
    let r = s.input(notation: "R'", rotation: false, solvedAfter: true, now: 2000.6)
    #expect(s.phase == .done)
    #expect(abs(((r?["ms"] as? Double) ?? 0) - 600.6) < 1e-9)
    #expect(r?["moves"] as? Int == 2)
    #expect(r?["replay"] as? String == "y@-400 U'@0 R'@601")
    #expect(r?["seed"] as? UInt32 == 7)
    #expect(r?["scramble"] as? String == "R U")
    // 끝난 판에 수를 더 둬도 기록은 다시 생기지 않는다
    #expect(s.input(notation: "R", rotation: false, solvedAfter: true, now: 3000) == nil)
  }

  @Test func timeTextLikeTheSite() {
    #expect(MiniSolve.formatMs(3000) == "3.00")
    #expect(MiniSolve.formatMs(12_349.9) == "12.34")
    #expect(MiniSolve.formatMs(62_050) == "1:02.05")
    #expect(MiniSolve.formatMs(nil) == "DNF")
  }

  @Test func replayRoundsLikeJavaScript() {
    #expect(MiniSolve.formatReplay([("R", 0.5), ("U", -0.5), ("F", -1.5), ("B", 2.4999)]) == "R@1 U@0 F@-1 B@2")
  }
}

struct HitRectTests {
  @Test func cubeRectIsCenteredAndPanelsAddThree() {
    let panels = CubeGeometry.mirrorPanels(n: 3)
    let only = CubeGeometry.hitRects(n: 3, width: 96, height: 96, panels: panels, mirrorShown: false)
    #expect(only.count == 1)
    let c = only[0]
    #expect(abs(c.midX - 48) < 4 && abs(c.midY - 48) < 8, "\(c)")
    // 원근이라 가까운 모서리 쪽으로 조금 치우친다. 큐브 상자(1.15배)는 창을 조금 넘을 수 있지만 지나치지 않는다
    #expect(c.width > 60 && c.width < 130)
    let all = CubeGeometry.hitRects(n: 3, width: 96, height: 96, panels: panels, mirrorShown: true)
    #expect(all.count == 4)
    // 거울이 보이면 카메라가 물러나 큐브가 작아진다
    #expect(all[0].width < c.width)
  }
}

struct MigrationTests {
  /// WebKit과 같은 꼴의 폴더·출처 파일·sqlite(UTF-16LE 값)를 만들어 옮긴다
  @Test func movesCubeKeysOnceWithoutOverwriting() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("cubie-mig-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    func origin(_ name: String, host: String, items: [String: String]) throws {
      let dir = root.appendingPathComponent("Default/\(name)/\(name)")
      try FileManager.default.createDirectory(
        at: dir.appendingPathComponent("LocalStorage"), withIntermediateDirectories: true)
      var bytes = Data([5, 0, 0, 0, 1])
      bytes.append(contentsOf: Array("https".utf8))
      bytes.append(contentsOf: [UInt8(host.utf8.count), 0, 0, 0, 1])
      bytes.append(contentsOf: Array(host.utf8))
      try bytes.write(to: dir.appendingPathComponent("origin"))
      var db: OpaquePointer?
      #expect(sqlite3_open(dir.appendingPathComponent("LocalStorage/localstorage.sqlite3").path, &db) == SQLITE_OK)
      sqlite3_exec(db, "CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB NOT NULL)", nil, nil, nil)
      for (k, v) in items {
        var stmt: OpaquePointer?
        sqlite3_prepare_v2(db, "INSERT INTO ItemTable VALUES (?, ?)", -1, &stmt, nil)
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        sqlite3_bind_text(stmt, 1, k, -1, transient)
        let data = v.data(using: .utf16LittleEndian)!
        _ = data.withUnsafeBytes { sqlite3_bind_blob(stmt, 2, $0.baseAddress, Int32(data.count), transient) }
        sqlite3_step(stmt)
        sqlite3_finalize(stmt)
      }
      sqlite3_close(db)
    }
    try origin("AAA", host: "game.byb.kr", items: ["cube.mini.v1": #"{"n":4,"한":"글"}"#, "cube.keymap.v1": "{}", "other": "x"])
    try origin("BBB", host: "evil.example", items: ["cube.mini.profile.v1": "nope"])
    let store = MemoryStore(["cube.keymap.v1": "native"])
    let r = WebStorageMigration.run(store: store, websiteData: root, host: "game.byb.kr")
    #expect(r.moved == ["cube.mini.v1"])
    #expect(r.kept == ["cube.keymap.v1"])
    #expect(store.string("cube.mini.v1") == #"{"n":4,"한":"글"}"#)
    #expect(store.string("cube.keymap.v1") == "native")
    #expect(store.string("cube.mini.profile.v1") == nil)
    #expect(store.string("other") == nil)
    #expect(store.string(WebStorageMigration.markerKey) != nil)
    // 두 번째는 하지 않는다(웹 저장소는 지우지 않았다)
    store.set("changed", for: "cube.mini.v1")
    #expect(WebStorageMigration.run(store: store, websiteData: root, host: "game.byb.kr").alreadyDone)
    #expect(store.string("cube.mini.v1") == "changed")
    #expect(WebStorageMigration.read(websiteData: root, host: "game.byb.kr").count == 2)
    // 폴더가 없으면 옮길 것 없이 표시만
    let empty = MemoryStore()
    #expect(WebStorageMigration.run(store: empty, websiteData: root.appendingPathComponent("none"), host: "x").moved.isEmpty)
  }
}
