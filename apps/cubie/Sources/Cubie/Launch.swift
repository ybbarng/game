import AppKit
import CubieCore

/// 이번 켜기가 보통인지 안전하게 켜기인지(`LaunchGuard`, docs/52 5-24). `main.swift`가 다른 무엇보다 먼저 `begin()`을 부른다
/// (큐브 창이 저장된 자리를 읽기 전에 정해야 한다).
@MainActor
enum Launch {
  private(set) static var mode: LaunchGuard.Mode = .normal

  static func begin() {
    // 재기 모드는 사용자 설정을 읽지도 쓰지도 않는다
    if Config.measure { return }
    let d = UserDefaults.standard
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    let left = LaunchGuard.Marker(stored: d.object(forKey: LaunchGuard.key))
    let r = LaunchGuard.begin(left: left, version: version, now: Date())
    mode = r.mode
    d.set(r.write.dictionary, forKey: LaunchGuard.key)
    // 표시가 바로 디스크에 남아야 켜는 중에 꺼져도 다음 켜기가 본다
    d.synchronize()
    if Config.debug {
      print("[cubie] launch mode=\(r.mode) left=\(left.map { "\($0.version)/\($0.safeRuns)" } ?? "none")")
      fflush(stdout)
    }
  }

  /// 무사히 켜졌다(큐브 창을 놓고 `LaunchGuard.clearDelay` 뒤, 또는 앱을 끌 때)
  static func finished() {
    if Config.measure { return }
    let d = UserDefaults.standard
    guard d.object(forKey: LaunchGuard.key) != nil else { return }
    d.removeObject(forKey: LaunchGuard.key)
    if Config.debug { print("[cubie] launch finished"); fflush(stdout) }
  }
}
