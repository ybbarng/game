// README 그림용: 메뉴 막대 메뉴 맨 위 프로필 칸을 앱을 띄우지 않고 그린다(readme-shots.mjs가 부른다).
// 프로필 칸은 앱의 `ProfileMenuView`를 그대로 쓰고, 그 아래 메뉴 몇 줄과 메뉴 바탕은 흉내다(실제 메뉴 창이 아니다).
// readme-shots.mjs가 `Sources/CubieCore/Profile.swift`, `Sources/Cubie/ProfileMenuView.swift`(import CubieCore 줄을 뺀 것)와
// 함께 컴파일한다. 인자: <엠블럼 PNG> <이름> <티어 글> <출력 PNG> <dark|light>
import AppKit

let a = CommandLine.arguments
guard a.count == 6 else {
  FileHandle.standardError.write("인자: <엠블럼 PNG> <이름> <티어 글> <출력 PNG> <dark|light>\n".data(using: .utf8)!)
  exit(2)
}
let dark = a[5] == "dark"
let profile = Profile(name: a[2], tierText: a[3], emblem: try? Data(contentsOf: URL(fileURLWithPath: a[1])))
let appearance = NSAppearance(named: dark ? .darkAqua : .aqua)!
let view = ProfileMenuView(profile: profile) {}
let w = view.frame.width
let rowH: CGFloat = 22
let rows = ["큐브로 가기", "숨기기", nil, "섞기", "공식 보기", "큐브 크기"]
let H = 6 + ProfileMenuView.height + 11 + rows.reduce(0) { $0 + ($1 == nil ? 11 : rowH) } + 6
let root = NSView(frame: NSRect(x: 0, y: 0, width: w, height: H))
root.appearance = appearance
root.wantsLayer = true
root.layer?.backgroundColor = (dark ? NSColor(white: 0.17, alpha: 0.97) : NSColor(white: 0.95, alpha: 0.97)).cgColor
root.layer?.cornerRadius = 8
view.frame.origin = NSPoint(x: 0, y: H - 6 - ProfileMenuView.height)
root.addSubview(view)

func separator(at y: CGFloat) {
  let sep = NSBox(frame: NSRect(x: 12, y: y, width: w - 24, height: 1))
  sep.boxType = .separator
  root.addSubview(sep)
}
var y = view.frame.minY - 6
separator(at: y)
y -= 5
for r in rows {
  guard let r else {
    y -= 5
    separator(at: y)
    y -= 6
    continue
  }
  y -= rowH
  let l = NSTextField(labelWithString: r)
  l.font = .menuFont(ofSize: 13)
  l.frame = NSRect(x: 22, y: y + 3, width: w - 30, height: 17)
  root.addSubview(l)
}

let scale: CGFloat = 2
let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: Int(w * scale), pixelsHigh: Int(H * scale), bitsPerSample: 8, samplesPerPixel: 4,
  hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = root.bounds.size
appearance.performAsCurrentDrawingAppearance { root.cacheDisplay(in: root.bounds, to: rep) }
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[4]))
