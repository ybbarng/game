import AppKit

// 네이티브 화면 스크린샷(창 없이 PNG를 쓰고 끝난다, docs/52 5-5)
if Config.native, let dir = ProcessInfo.processInfo.environment["CUBIE_NATIVE_SHOT"] {
  exit(NativeShot.run(dir: dir, n: Int(ProcessInfo.processInfo.environment["CUBIE_NATIVE_N"] ?? "") ?? 3))
}

let app = NSApplication.shared
// `CUBIE_NATIVE=1`이면 웹 화면 대신 네이티브 화면 시제품(Core Animation 3D, docs/52 5-5). 기본은 지금 앱 그대로
let delegate: NSApplicationDelegate = Config.native ? NativeAppDelegate() : AppDelegate()
app.delegate = delegate
// Dock 아이콘 없이(Info.plist LSUIElement와 같다. 실행 파일만 바로 띄워도 그렇게)
// 메모리 재기(`Config.measure`)는 앞으로 나올 수조차 없게 한다(사용자 포커스를 빼앗지 않는다)
app.setActivationPolicy(Config.measure ? .prohibited : .accessory)
app.run()
