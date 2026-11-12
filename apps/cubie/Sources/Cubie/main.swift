import AppKit

// 네이티브 화면 스크린샷(창 없이 PNG를 쓰고 끝난다, docs/52 5-5·5-6)
if !Config.web, let dir = ProcessInfo.processInfo.environment["CUBIE_NATIVE_SHOT"] {
  exit(NativeShot.run(dir: dir, n: Int(ProcessInfo.processInfo.environment["CUBIE_NATIVE_N"] ?? "") ?? 3))
}

// 네이티브 보통 창(기록·티어표·설정) 스크린샷(창을 화면에 띄우지 않고 PNG를 쓰고 끝난다, docs/52 5-7)
if let dir = ProcessInfo.processInfo.environment["CUBIE_WINDOW_SHOT"] {
  exit(NativeWindowShot.run(dir: dir))
}

let app = NSApplication.shared
// 큐브 창은 기본 네이티브 화면, `CUBIE_WEB=1`이면 예전 웹 화면(docs/52 5-6)
let delegate = AppDelegate()
app.delegate = delegate
// Dock 아이콘 없이(Info.plist LSUIElement와 같다. 실행 파일만 바로 띄워도 그렇게)
// 메모리 재기(`Config.measure`)는 앞으로 나올 수조차 없게 한다(사용자 포커스를 빼앗지 않는다)
app.setActivationPolicy(Config.measure ? .prohibited : .accessory)
app.run()
