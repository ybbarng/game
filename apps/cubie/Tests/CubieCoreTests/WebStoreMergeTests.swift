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

/// 사이트 창을 열 때 넣는 글과 닫을 때 옮기는 길(`WebStoreSync`)
struct WebStoreSyncTests {
  @Test func snapshotTakesOnlyCubeKeys() {
    let s = MemoryStore(["cube.settings.v1": "S", "cube.mini.v1": "M", "cubie.migrated.v1": "x"])
    #expect(WebStoreSync.snapshot(s) == ["cube.settings.v1": "S", "cube.mini.v1": "M"])
  }

  @Test func setItemsScriptCarriesEveryKeyAsJSON() {
    let js = WebStoreSync.setItemsJS(["cube.a": "1", "cube.b": #"{"q":"\""}"#])
    #expect(js == #"(function(d){for(var k in d){try{localStorage.setItem(k,d[k])}catch(e){}}})({"cube.a":"1","cube.b":"{\"q\":\"\\\"\"}"});"#)
  }

  @Test func closedSiteChangesAreWrittenAndRemovedKeysDropped() {
    let s = MemoryStore(["cube.keymap.v1": "A", "cube.algs.v1": "[]", "cube.mini.v1": "app"])
    let opened = WebStoreSync.snapshot(s)
    let result = #"{"cube.keymap.v1":"B","cube.mini.v1":"site"}"#
    let c = WebStoreSync.applyClosed(result: result, opened: opened, to: s)
    #expect(c == WebStoreMerge.Changes(set: ["cube.keymap.v1": "B"], removed: ["cube.algs.v1"]))
    #expect(s.values == ["cube.keymap.v1": "B", "cube.mini.v1": "app"])
  }

  @Test func unreadableResultLeavesStoreAlone() {
    let s = MemoryStore(["cube.keymap.v1": "A"])
    #expect(WebStoreSync.applyClosed(result: nil, opened: ["cube.keymap.v1": "A"], to: s) == nil)
    #expect(WebStoreSync.applyClosed(result: "not json", opened: ["cube.keymap.v1": "A"], to: s) == nil)
    #expect(s.values == ["cube.keymap.v1": "A"])
  }
}
