// swift-tools-version: 6.0
// 맥 앱 Cubie(docs/47 15절). Xcode 프로젝트 파일 없이 Swift Package 실행 파일로 두고, `build.sh`가 .app으로 묶는다.
// 최소 macOS 15: 이 맥(15)에서만 빌드·확인한다. 더 낮추려면 그 판에서 확인해야 해서 확인한 판까지만 둔다.
// 화면 없이 시험할 판단(포커스 돌려주기, 키 출처)은 CubieCore에 두고 `swift test`로 본다.
// 자동 업데이트는 Sparkle 2(판 고정, docs/47 15-12). 실행 파일은 .app 안 `Contents/Frameworks`의 Sparkle.framework를 찾는다.
// 네이티브 화면 실험(docs/52 5-5, `CUBIE_NATIVE=1`): Rust 정적 라이브러리 `.native/libcubie_native.a`(코어 한 판, wgpu 없음)를
// 링크한다. 그리기는 Swift의 Core Animation 층 트리다. `scripts/build-native.sh`가 만들고 build.sh·test.sh가 먼저 부른다.
// C 머리 파일은 CubieNativeC 타깃에 손으로 쓴다.
import Foundation
import PackageDescription

let nativeLib = Context.packageDirectory + "/.native"

let package = Package(
  name: "Cubie",
  platforms: [.macOS(.v15)],
  dependencies: [
    .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.1")
  ],
  targets: [
    .target(name: "CubieCore", path: "Sources/CubieCore"),
    .target(name: "CubieNativeC", path: "Sources/CubieNativeC"),
    .executableTarget(
      name: "Cubie",
      dependencies: ["CubieCore", "CubieNativeC", .product(name: "Sparkle", package: "Sparkle")],
      path: "Sources/Cubie",
      linkerSettings: [
        .linkedFramework("AppKit"),
        .linkedFramework("WebKit"),
        .linkedFramework("Carbon"),
        .linkedFramework("Network"),
        .linkedFramework("QuartzCore"),
        // 네이티브 화면 스크린샷(`NativeShot`, CARenderer)만 쓴다
        .linkedFramework("Metal"),
        .linkedLibrary("cubie_native"),
        .unsafeFlags([
          "-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks",
          "-L", nativeLib,
        ]),
      ]
    ),
    .testTarget(name: "CubieCoreTests", dependencies: ["CubieCore"], path: "Tests/CubieCoreTests"),
  ]
)
