import Testing

@testable import CubieCore

/// 「모든 설정…」 사이트 창을 닫을 때 사이트에서 바뀐 키만 옮긴다
struct WebStoreMergeTests {
  @Test func valueChangedInNativeWindowMeanwhileIsNotOverwrittenByOpenTimeValue() {
    // 열 때 회전 시간 90을 넣었고 사이트에서는 그대로. 그 사이 네이티브 창이 앱 저장소를 120으로 바꿨다
    let opened = ["cube.settings.v1": #"{"moveMs":90}"#, "cube.keymap.v1": "A"]
    let closed = ["cube.settings.v1": #"{"moveMs":90}"#, "cube.keymap.v1": "B"]
    let c = WebStoreMerge.changes(opened: opened, closed: closed)
    #expect(c.set == ["cube.keymap.v1": "B"])
    #expect(c.removed == [])
  }

  @Test func keyAddedBySiteIsCopied() {
    let c = WebStoreMerge.changes(opened: [:], closed: ["cube.algs.v1": "[]"])
    #expect(c.set == ["cube.algs.v1": "[]"])
  }

  @Test func keyRemovedBySiteIsRemoved() {
    let c = WebStoreMerge.changes(opened: ["cube.algs.v1": "[]", "cube.keymap.v1": "A"], closed: ["cube.keymap.v1": "A"])
    #expect(c.set == [:])
    #expect(c.removed == ["cube.algs.v1"])
  }

  @Test func appMiniRecordsAndNonCubeKeysAreNeverCopiedOrRemoved() {
    let opened = ["cube.mini.v1": "old", "cube.mini.profile.v1": "p"]
    let closed = ["cube.mini.v1": "new", "other": "x"]
    let c = WebStoreMerge.changes(opened: opened, closed: closed)
    #expect(c.set == [:])
    #expect(c.removed == [])
  }

  @Test func memoryStoreRemoveDropsKey() {
    let s = MemoryStore(["cube.a": "1", "cube.b": "2"])
    s.remove("cube.a")
    #expect(s.keys == ["cube.b"])
  }
}
