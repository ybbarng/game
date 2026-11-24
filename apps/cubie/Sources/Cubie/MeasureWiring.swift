import AppKit
import CubieCore
import CubieNativeC

/// 재기 모드(`Config.measure`, `scripts/measure-memory.sh`)의 명령을 큐브 창·단축키 표·보통 창에 잇는다.
/// 메뉴 막대 아이콘·전역 단축키·키 감시 없이 큐브 창만(화면 밖) 띄우고, 단축키 표와 보통 창도 화면 밖에서 띄워 잰다
@MainActor
enum MeasureWiring {
  static func make(cube: NativeCubeWindow, keys: KeysPanel, sheets: SheetWindows) -> NativeMeasure {
    let m = NativeMeasure(cube: cube)
    m.openKeys = { [weak cube] in
      guard let cube else { return }
      keys.show(cube: Config.measureFrame(side: 96), visible: Config.measureFrame(side: 2000), n: cube.state.n)
      cube.send(.keysPanel(true))
    }
    m.dropKeys = { [weak cube] in
      keys.hide()
      keys.reload()
      cube?.send(.keysPanel(false))
    }
    // `records|tiers|settings open|close`, `replay open`(기록 창에서 한 판 다시 보기),
    // `editor open|close`(「사용자」 배치로 두고 설정 창의 키 배치 편집기, docs/52 5-8)
    m.window = { [weak sheets, weak cube] name, open in
      guard let sheets, let cube else { return }
      let kind: SheetWindows.Kind? =
        switch name {
        case "records", "replay": .records
        case "tiers": .tiers
        case "settings", "editor": .settings
        default: nil
        }
      guard let kind else { return }
      if name == "editor", open {
        let custom = "customFrom".withCString { o in
          "twoHand".withCString { a in "".withCString { c in NativeCore.string { cubie_keymap_edit(nil, o, a, c, 0, $0, $1) } } }
        }
        cube.store.set(KeymapEditorModel.parseEdit(custom).stored, for: StoredKeymap.key)
      }
      if open {
        sheets.open(kind)
      } else {
        sheets.close(kind)
      }
      if name == "replay", open { sheets.records?.measureReplay() }
    }
    // `pick <티어 0~9>`: 티어표 사다리 칸 누르기(docs/52 5-11)
    m.pickTier = { [weak sheets] t in sheets?.tiers?.page.pick(t) }
    // `place tiers <화면 번호>`: 티어표 창을 그 화면 가운데로(알파 0.01, 마우스는 지나감, 포커스는 그대로). HDR 판정이 창이
    // 놓인 화면을 따르는지 본다(docs/52 5-16). `place tiers off`면 다시 화면 밖으로
    m.placeTiers = { [weak sheets] arg in
      guard let tiers = sheets?.tiers else { return "no window" }
      let w = tiers.window
      if let i = Int(arg), NSScreen.screens.indices.contains(i) {
        let s = NSScreen.screens[i].frame
        w.ignoresMouseEvents = true
        w.alphaValue = 0.01
        w.setFrameOrigin(NSPoint(x: s.midX - w.frame.width / 2, y: s.midY - w.frame.height / 2))
      } else if arg != "stay" {
        w.setFrameOrigin(NSPoint(x: -30000, y: -30000))
      }
      return "screen=\(w.screen?.localizedName ?? "nil") hdr=\(tiers.page.hero.hdr ? 1 : 0)"
    }
    return m
  }
}
