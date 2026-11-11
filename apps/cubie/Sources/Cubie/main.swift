import AppKit

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
// Dock 아이콘 없이(Info.plist LSUIElement와 같다. 실행 파일만 바로 띄워도 그렇게)
// 메모리 재기(`Config.measure`)는 앞으로 나올 수조차 없게 한다(사용자 포커스를 빼앗지 않는다)
app.setActivationPolicy(Config.measure ? .prohibited : .accessory)
app.run()
