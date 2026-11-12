import Foundation

/// Core Animation 큐브 그리기(docs/52 5-5, 앱 `CACubeView`)의 계산. AppKit·Core Animation 없이 행렬과 자리만 다룬다(시험한다).
///
/// - 행렬은 4×4, CSS `matrix3d`·`CATransform3D`와 같은 배치의 16칸이다(`m[c * 4 + r]`, 점은 `x' = m0·x + m4·y + m8·z + m12`).
///   `CATransform3D`의 m11…m44에 차례로 넣으면 같다.
/// - 좌표는 세계 좌표(+x 오른쪽, +y 위, +z 앞, 조각 간격 1). 맥 층 좌표도 y가 위라 CSS처럼 뒤집지 않는다.
/// - 카메라·거울 판은 사이트 CSS 3D 장면(`apps/web/src/cube/view/css-math.ts`·`mirror.ts`)과 같은 식이라, 같은 창에서 큐브가
///   같은 크기·자리에 온다(세로 시야각 30°, 보는 각 yaw 32°·pitch 26°).
public enum CubeGeometry {
  public typealias Mat4 = [Double]
  public typealias Vec3 = [Double]

  public static let fovDeg = 30.0
  public static let defaultYaw = 32.0
  public static let defaultPitch = 26.0

  // MARK: 행렬

  public static let identity: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

  /// a × b(b를 먼저 적용)
  public static func multiply(_ a: Mat4, _ b: Mat4) -> Mat4 {
    var out = [Double](repeating: 0, count: 16)
    for c in 0..<4 {
      for r in 0..<4 {
        var s = 0.0
        for k in 0..<4 { s += a[k * 4 + r] * b[c * 4 + k] }
        out[c * 4 + r] = s
      }
    }
    return out
  }

  public static func translation(_ x: Double, _ y: Double, _ z: Double) -> Mat4 {
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]
  }

  public static func scaling(_ s: Double) -> Mat4 {
    [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]
  }

  /// 세계 축(0 x · 1 y · 2 z) 둘레로 `rad`만큼(오른손 법칙)
  public static func rotation(axis: Int, _ rad: Double) -> Mat4 {
    let c = cos(rad)
    let s = sin(rad)
    switch axis {
    case 0: return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]
    case 1: return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]
    default: return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    }
  }

  /// 열 셋(오른쪽·위·앞이 갈 곳)과 옮김
  public static func basis(_ x: Vec3, _ y: Vec3, _ z: Vec3, _ t: Vec3 = [0, 0, 0]) -> Mat4 {
    [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, t[0], t[1], t[2], 1]
  }

  /// 점 하나(동차 좌표 w로 나누지 않음)
  public static func apply(_ m: Mat4, _ p: Vec3) -> Vec3 {
    [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]
  }

  /// 점 하나를 동차 좌표로(w까지)
  public static func apply4(_ m: Mat4, _ p: Vec3) -> [Double] {
    let w: Double = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]
    var out = apply(m, p)
    out.append(w)
    return out
  }

  // MARK: 조각·수

  /// 조각 면 하나: 앞(+z)을 면 방향 `normal`(축 하나의 ±1)으로 돌린 행렬. 사이트 `faceRotation`과 같다
  public static func faceRotation(_ normal: [Int]) -> Mat4 {
    switch (normal[0], normal[1], normal[2]) {
    case (0, 0, 1): return identity
    case (0, 0, -1): return rotation(axis: 1, .pi)
    case (1, 0, 0): return rotation(axis: 1, .pi / 2)
    case (-1, 0, 0): return rotation(axis: 1, -.pi / 2)
    case (0, 1, 0): return rotation(axis: 0, -.pi / 2)
    default: return rotation(axis: 0, .pi / 2)
    }
  }

  /// 수의 각(라디안, 오른손 방향). 축의 + 쪽에서 시계 90°(turns 1)는 −90°, 반 바퀴는 −180°, 반대(turns 3)는 +90°
  public static func moveAngle(turns: Int) -> Double {
    switch turns {
    case 1: return -.pi / 2
    case 2: return -.pi
    default: return .pi / 2
    }
  }

  /// 조각 좌표(두 배)의 축 값 → 층 번호(1 = + 쪽 바깥층). 코어 `Topology::layer_of`와 같다
  public static func layerOf(n: Int, coord2: Int) -> Int {
    ((n - 1) - coord2) / 2 + 1
  }

  /// 층 번호 → 그 층 조각의 축 좌표(조각 간격 1)
  public static func coordOfLayer(n: Int, _ layer: Int) -> Double {
    Double(n + 1) / 2 - Double(layer)
  }

  /// 조각(두 배 좌표)이 수 하나에 드는가
  public static func inMove(n: Int, axis: Int, from: Int, to: Int, pos2: [Int]) -> Bool {
    let l = layerOf(n: n, coord2: pos2[axis])
    return l >= from && l <= to
  }

  /// 층을 돌릴 때 큐브 속이 드러나는 자르는 면의 축 좌표(큐브 전체 돌리기는 없다)
  public static func cutPlanes(n: Int, from: Int, to: Int) -> [Double] {
    var at: [Double] = []
    if from > 1 { at.append(coordOfLayer(n: n, from) + 0.5) }
    if to < n { at.append(coordOfLayer(n: n, to) - 0.5) }
    return at
  }

  /// 조각 중심 자리(두 배 좌표) 모두. 겉에 있는 조각만(속 조각은 그리지 않는다)
  public static func outerPieces(n: Int) -> [[Int]] {
    let m = n - 1
    var out: [[Int]] = []
    for x in stride(from: -m, through: m, by: 2) {
      for y in stride(from: -m, through: m, by: 2) {
        for z in stride(from: -m, through: m, by: 2) where abs(x) == m || abs(y) == m || abs(z) == m {
          out.append([x, y, z])
        }
      }
    }
    return out
  }

  // MARK: 카메라

  static func rad(_ deg: Double) -> Double { deg * .pi / 180 }
  static func dot(_ a: Vec3, _ b: Vec3) -> Double { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
  static func add(_ a: Vec3, _ b: Vec3, _ s: Double = 1) -> Vec3 { [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s] }
  static func scale(_ a: Vec3, _ s: Double) -> Vec3 { [a[0] * s, a[1] * s, a[2] * s] }
  static func norm(_ a: Vec3) -> Vec3 {
    let l = max(1e-12, (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).squareRoot())
    return scale(a, 1 / l)
  }

  /// 원점에서 카메라 쪽(단위 벡터)
  public static func viewDir(yaw: Double = defaultYaw, pitch: Double = defaultPitch) -> Vec3 {
    let y = rad(yaw)
    let p = rad(pitch)
    return [cos(p) * sin(y), sin(p), cos(p) * cos(y)]
  }

  /// 카메라 화면의 오른쪽·위·카메라 쪽(세계 좌표)
  public static func viewBasis(yaw: Double = defaultYaw, pitch: Double = defaultPitch) -> (right: Vec3, up: Vec3, toward: Vec3) {
    let y = rad(yaw)
    let p = rad(pitch)
    return ([cos(y), 0, -sin(y)], [-sin(p) * sin(y), cos(p), -sin(p) * cos(y)], viewDir(yaw: yaw, pitch: pitch))
  }

  public struct Camera: Equatable, Sendable {
    public var target: Vec3
    public var dist: Double
  }

  /// 큐브만 담는 거리(큐브를 감싸는 공이 화면 짧은 쪽에 들어간다)
  public static func cubeDist(n: Int, aspect: Double) -> Double {
    let radius = Double(n) * 3.0.squareRoot() / 2
    let v = rad(fovDeg)
    let h = 2 * atan(tan(v / 2) * aspect)
    return radius / sin(min(v, h) / 2) * 1.02
  }

  public static func easeInOut(_ p: Double) -> Double {
    p < 0.5 ? 4 * p * p * p : 1 - pow(-2 * p + 2, 3) / 2
  }

  /// 거울 판이 보이는 정도 `fade`(0~1)에 따른 카메라: 판이 보일수록 판까지 담는 자리로 물러난다
  public static func camera(n: Int, aspect: Double, panels: [MirrorPanel]?, fade: Double) -> Camera {
    var dist = cubeDist(n: n, aspect: aspect)
    var target: Vec3 = [0, 0, 0]
    if let panels, fade > 0 {
      let f = mirrorFrame(n: n, panels: panels, aspect: aspect)
      let e = easeInOut(min(1, fade))
      dist += (f.dist - dist) * e
      target = scale(f.target, e)
    }
    return Camera(target: target, dist: dist)
  }

  /// 세계 → 카메라(카메라가 원점, −z를 본다, +y 위)
  public static func viewMatrix(_ c: Camera, yaw: Double = defaultYaw, pitch: Double = defaultPitch) -> Mat4 {
    let b = viewBasis(yaw: yaw, pitch: pitch)
    let eye = add(c.target, b.toward, c.dist)
    let d = { (a: Vec3) in -dot(a, eye) }
    let (r, u, t) = (b.right, b.up, b.toward)
    return [r[0], u[0], t[0], 0, r[1], u[1], t[1], 0, r[2], u[2], t[2], 0, d(r), d(u), d(t), 1]
  }

  /// 원근 거리(pt): 세로 시야각 30°에서 화면 높이의 절반이 보이는 거리. 바깥 층의 `sublayerTransform.m34 = −1 / 이 값`
  public static func perspective(height: Double) -> Double {
    height / 2 / tan(rad(fovDeg) / 2)
  }

  /// 장면 뿌리 층에 걸 행렬. 자식 층은 세계 좌표를 `unit` pt로 늘려 둔다. 카메라 공간 점 q는 (k·x, k·y, k·z + P)로 가서
  /// 원근(m34 = −1/P)을 거치면 화면 자리가 P·x/(−z)가 된다(사이트 투영과 같다). k = `unit`이면 바라보는 점 근처가 1:1이다
  public static func sceneMatrix(
    _ c: Camera, perspective: Double, unit: Double, yaw: Double = defaultYaw, pitch: Double = defaultPitch
  ) -> Mat4 {
    let v = viewMatrix(c, yaw: yaw, pitch: pitch)
    // 세계(×unit pt) → 세계: 1/unit, 보기, 다시 unit 배, 원근 거리만큼 앞으로
    return multiply(translation(0, 0, perspective), multiply(scaling(unit), multiply(v, scaling(1 / unit))))
  }

  /// 세계 점의 화면 자리(창 가운데 기준 pt, y 위). 카메라 뒤면 nil
  public static func project(_ c: Camera, height: Double, _ p: Vec3) -> (x: Double, y: Double)? {
    let q = apply(viewMatrix(c), p)
    guard q[2] < -1e-6 else { return nil }
    let pp = perspective(height: height)
    return (pp * q[0] / -q[2], pp * q[1] / -q[2])
  }

  // MARK: 거울 판(사이트 `mirror.ts`)

  /// 판 위 칸 간격(큐브 칸 간격 1에 대해)
  public static let mirrorCell = 0.6
  /// 판 위 스티커 한 변(판 칸 단위, 사이트 `MIRROR_STICKER`). 스티커 사이 틈은 1 − 이 값
  public static let mirrorSticker = 0.86
  /// 판 테두리 여백(판 칸 단위, 사이트 `MIRROR_PAD`). 바깥 스티커 가장자리에서 판 가장자리까지 0.07 + 이 값.
  /// 큐브처럼 얇게(스티커 사이 틈 정도) 두어 뒤 화면을 덜 가린다(2026-11-12, 예전 0.28)
  public static let mirrorPad = 0.04
  /// 판 모서리 둥글기(판 칸 단위, 사이트 `MIRROR_PLATE_RADIUS`). 판 크기와 상관없이 바깥 스티커 모서리를 따라 돈다
  public static let mirrorPlateRadius = 0.22
  /// 판을 켜고 끌 때 짙어지거나 옅어지는 시간(초)
  public static let mirrorFade = 0.3

  public struct MirrorPanel: Equatable, Sendable {
    /// 그 면의 바깥 방향(뒤 −z, 왼쪽 −x, 아래 −y)
    public var normal: [Int]
    public var center: Vec3
    public var right: Vec3
    public var up: Vec3
    /// 판이 보는 쪽(카메라 쪽)
    public var facing: Vec3

    /// 판 놓임 행렬(판 가운데로 옮기고 판의 오른쪽·위·보는 쪽을 축으로)
    public var matrix: Mat4 { CubeGeometry.basis(right, up, facing, center) }
  }

  /// 판 차례: 뒤, 왼쪽, 아래. 판의 오른쪽·위(그 면의 두 세계 축)
  static let flat: [(normal: [Int], right: Vec3, up: Vec3)] = [
    ([0, 0, -1], [1, 0, 0], [0, 1, 0]),
    ([-1, 0, 0], [0, 0, -1], [0, 1, 0]),
    ([0, -1, 0], [1, 0, 0], [0, 0, -1]),
  ]

  static func cubeCorners(_ n: Int) -> [Vec3] {
    let h = Double(n) / 2
    var out: [Vec3] = []
    for x in [-h, h] { for y in [-h, h] { for z in [-h, h] { out.append([x, y, z]) } } }
    return out
  }

  /// 거울 판 위에 큐브를 납작하게 비추는 행렬(사이트 `css-math.ts` `mirrorFlatten`): 판의 오른쪽·위 성분에 칸 간격을 곱하고,
  /// 판 안쪽 방향 성분은 깊이로 둔다. 판 층(평평한 층) 안에 두면 그 평면에 그려진다
  public static func mirrorFlatten(_ p: MirrorPanel, cell: Double) -> Mat4 {
    let out = scale(p.facing, -1)
    return [
      p.right[0] * cell, p.up[0] * cell, out[0], 0, p.right[1] * cell, p.up[1] * cell, out[1], 0,
      p.right[2] * cell, p.up[2] * cell, out[2], 0, 0, 0, 0, 1,
    ]
  }

  public static func panelCorners(n: Int, _ p: MirrorPanel) -> [Vec3] {
    let s = (Double(n) / 2 + mirrorPad) * mirrorCell
    return [[-s, -s], [s, -s], [s, s], [-s, s]].map { add(add(p.center, p.right, $0[0]), p.up, $0[1]) }
  }

  static func projectFlat(_ pts: [Vec3]) -> [[Double]] {
    let b = viewBasis()
    return pts.map { [dot($0, b.right), dot($0, b.up)] }
  }

  static func hull(_ points: [[Double]]) -> [[Double]] {
    let p = points.sorted { $0[0] != $1[0] ? $0[0] < $1[0] : $0[1] < $1[1] }
    guard p.count >= 3 else { return p }
    func turn(_ o: [Double], _ a: [Double], _ b: [Double]) -> Double {
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    }
    var lower: [[Double]] = []
    for q in p {
      while lower.count >= 2 && turn(lower[lower.count - 2], lower[lower.count - 1], q) <= 0 { lower.removeLast() }
      lower.append(q)
    }
    var upper: [[Double]] = []
    for q in p.reversed() {
      while upper.count >= 2 && turn(upper[upper.count - 2], upper[upper.count - 1], q) <= 0 { upper.removeLast() }
      upper.append(q)
    }
    return Array(lower.dropLast()) + Array(upper.dropLast())
  }

  /// 두 볼록 다각형 사이의 틈(분리축). 양수면 그만큼 떨어져 있고 0 이하면 겹친다
  public static func polygonGap(_ a: [[Double]], _ b: [[Double]]) -> Double {
    var best = -Double.infinity
    for poly in [a, b] {
      for i in 0..<poly.count {
        let p = poly[i]
        let q = poly[(i + 1) % poly.count]
        let ex = q[0] - p[0]
        let ey = q[1] - p[1]
        let l = (ex * ex + ey * ey).squareRoot()
        if l < 1e-9 { continue }
        let nx = -ey / l
        let ny = ex / l
        let pa = a.map { $0[0] * nx + $0[1] * ny }
        let pb = b.map { $0[0] * nx + $0[1] * ny }
        best = max(best, max(pb.min()! - pa.max()!, pa.min()! - pb.max()!))
      }
    }
    return best
  }

  /// 화면에서 큐브와 판 사이에 두는 틈
  static func margin(_ n: Int) -> Double { 0.3 + 0.06 * Double(n) }

  /// 판 셋의 자리: 그 면 바깥으로 조금 띄우고, 기준 각의 화면에서 그 면이 있는 쪽으로 큐브와 겹치지 않을 만큼 옮긴다
  public static func mirrorPanels(n: Int) -> [MirrorPanel] {
    let toward = viewDir()
    let cube = hull(projectFlat(cubeCorners(n)))
    return flat.map { f in
      let out = f.normal.map(Double.init)
      let facing = scale(out, -1)
      let base = scale(out, Double(n) / 2 + 0.35)
      let side = norm(add(out, toward, -dot(out, toward)))
      func make(_ s: Double) -> MirrorPanel {
        MirrorPanel(normal: f.normal, center: add(base, side, s), right: f.right, up: f.up, facing: facing)
      }
      var s = 0.0
      for _ in 0..<400 {
        if polygonGap(cube, hull(projectFlat(panelCorners(n: n, make(s))))) >= margin(n) { break }
        s += 0.05
      }
      return make(s)
    }
  }

  /// 큐브와 판 셋이 화면에 다 들어오는 카메라(바라보는 점과 거리)
  public static func mirrorFrame(n: Int, panels: [MirrorPanel], aspect: Double) -> Camera {
    let b = viewBasis()
    let pts = cubeCorners(n) + panels.flatMap { panelCorners(n: n, $0) }
    let xs = pts.map { dot($0, b.right) }
    let ys = pts.map { dot($0, b.up) }
    let cx = (xs.min()! + xs.max()!) / 2
    let cy = (ys.min()! + ys.max()!) / 2
    let target = add(scale(b.right, cx), b.up, cy)
    let tanV = tan(rad(fovDeg) / 2)
    let tanH = tanV * aspect
    var dist = 0.0
    for q in pts {
      let r = add(q, target, -1)
      let z = dot(r, b.toward)
      dist = max(dist, abs(dot(r, b.right)) / tanH + z, abs(dot(r, b.up)) / tanV + z)
    }
    return Camera(target: target, dist: dist * 1.04)
  }

  /// 스티커 자리(조각 중심 두 배 좌표, 면 방향) → 그 칸이 오를 판 번호와 판 위 자리(칸 단위, 판 가운데 0).
  /// 뒤·왼쪽·아래를 향한 칸만(거울상: 조각 중심을 판의 두 축에 놓은 값, 사이트 `mirrorCells`)
  public static func mirrorCell(pos2: [Int], normal: [Int]) -> (panel: Int, u: Double, v: Double)? {
    guard let i = flat.firstIndex(where: { $0.normal == normal }) else { return nil }
    let c = pos2.map { Double($0) / 2 }
    return (i, dot(c, flat[i].right) + 0, dot(c, flat[i].up) + 0)
  }

  // MARK: 누르는 자리(사이트 `CubeView.hitRects`, 앱이 투명한 빈 곳의 누르기를 아래 앱에 넘긴다)

  /// 큐브(한 변 n의 1.15배 상자)와 보이는 거울 판의 화면 사각형(창 왼쪽 위 기준 pt, y 아래). 첫 칸이 큐브
  public static func hitRects(
    n: Int, width: Double, height: Double, panels: [MirrorPanel], mirrorShown: Bool
  ) -> [CGRect] {
    let cam = camera(n: n, aspect: width / height, panels: panels, fade: mirrorShown ? 1 : 0)
    func rect(_ points: [Vec3]) -> CGRect {
      var x0 = Double.infinity
      var y0 = Double.infinity
      var x1 = -Double.infinity
      var y1 = -Double.infinity
      for p in points {
        guard let s = project(cam, height: height, p) else { continue }
        // 창 가운데 기준 y 위 → 창 왼쪽 위 기준 y 아래
        let x = width / 2 + s.x
        let y = height / 2 - s.y
        x0 = min(x0, x)
        y0 = min(y0, y)
        x1 = max(x1, x)
        y1 = max(y1, y)
      }
      return x0.isFinite ? CGRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0) : .zero
    }
    let h = Double(n) / 2 * 1.15
    var corners: [Vec3] = []
    for x in [-h, h] { for y in [-h, h] { for z in [-h, h] { corners.append([x, y, z]) } } }
    var out = [rect(corners)]
    if mirrorShown {
      for p in panels { out.append(rect(panelCorners(n: n, p))) }
    }
    return out
  }
}
