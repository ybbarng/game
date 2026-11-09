// swift-tools-version: 6.0
// 맥 앱 Cubie(docs/47 15절). Xcode 프로젝트 파일 없이 Swift Package 실행 파일로 두고, `build.sh`가 .app으로 묶는다.
// 최소 macOS 15: 이 맥(15)에서만 빌드·확인한다. 더 낮추려면 그 판에서 확인해야 해서 확인한 판까지만 둔다.
// 화면 없이 시험할 판단(포커스 돌려주기, 키 출처)은 CubieCore에 두고 `swift test`로 본다.
// 자동 업데이트는 Sparkle 2(판 고정, docs/47 15-12). 실행 파일은 .app 안 `Contents/Frameworks`의 Sparkle.framework를 찾는다.
import PackageDescription

let package = Package(
  name: "Cubie",
  platforms: [.macOS(.v15)],
  dependencies: [
    .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.1")
  ],
  targets: [
    .target(name: "CubieCore", path: "Sources/CubieCore"),
    .executableTarget(
      name: "Cubie",
      dependencies: ["CubieCore", .product(name: "Sparkle", package: "Sparkle")],
      path: "Sources/Cubie",
      linkerSettings: [
        .linkedFramework("AppKit"),
        .linkedFramework("WebKit"),
        .linkedFramework("Carbon"),
        .linkedFramework("Network"),
        .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"]),
      ]
    ),
    .testTarget(name: "CubieCoreTests", dependencies: ["CubieCore"], path: "Tests/CubieCoreTests"),
  ]
)
