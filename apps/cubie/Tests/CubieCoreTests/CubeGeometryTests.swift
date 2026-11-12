import Testing

@testable import CubieCore

struct CubeGeometryTests {
  typealias G = CubeGeometry

  func close(_ a: [Double], _ b: [Double], _ eps: Double = 1e-9) -> Bool {
    a.count == b.count && zip(a, b).allSatisfy { abs($0 - $1) < eps }
  }

  @Test func 면_행렬은_앞을_그_면_쪽으로_돌린다() {
    for n in [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] {
      let v = G.apply(G.faceRotation(n), [0, 0, 1])
      #expect(close(v, n.map(Double.init)), "\(n)")
    }
  }

  /// R(x축 1층, 시계 90°)은 윗면 칸을 뒷면으로 보낸다: 그리는 각의 방향이 코어의 수와 같다
  @Test func 수의_각은_코어_방향과_같다() {
    let r = G.rotation(axis: 0, G.moveAngle(turns: 1))
    #expect(close(G.apply(r, [0, 1, 0]).map { $0.rounded() + 0 }, [0, 0, -1]))
    // U(y축 1층): 앞면 칸이 왼쪽으로
    let u = G.rotation(axis: 1, G.moveAngle(turns: 1))
    #expect(close(G.apply(u, [0, 0, 1]).map { $0.rounded() + 0 }, [-1, 0, 0]))
    // F(z축 1층): 윗면 칸이 오른쪽으로
    let f = G.rotation(axis: 2, G.moveAngle(turns: 1))
    #expect(close(G.apply(f, [0, 1, 0]).map { $0.rounded() + 0 }, [1, 0, 0]))
    #expect(G.moveAngle(turns: 3) == -G.moveAngle(turns: 1))
  }

  @Test func 층_번호와_조각_고르기는_코어와_같다() {
    // 3×3: x = +2(두 배)는 1층(R), 0은 2층(M), −2는 3층(L)
    #expect(G.layerOf(n: 3, coord2: 2) == 1)
    #expect(G.layerOf(n: 3, coord2: 0) == 2)
    #expect(G.layerOf(n: 3, coord2: -2) == 3)
    // 4×4: +3 → 1층, +1 → 2층
    #expect(G.layerOf(n: 4, coord2: 1) == 2)
    #expect(G.coordOfLayer(n: 4, 1) == 1.5)
    #expect(G.inMove(n: 3, axis: 0, from: 1, to: 1, pos2: [2, 0, -2]))
    #expect(!G.inMove(n: 3, axis: 0, from: 1, to: 1, pos2: [0, 2, 2]))
    // 겉 조각 수: 3×3 26, 2×2 8, 7×7 218
    #expect(G.outerPieces(n: 3).count == 26)
    #expect(G.outerPieces(n: 2).count == 8)
    #expect(G.outerPieces(n: 7).count == 218)
  }

  @Test func 자르는_면은_층_사이에만() {
    #expect(G.cutPlanes(n: 3, from: 1, to: 1) == [0.5])
    #expect(G.cutPlanes(n: 3, from: 2, to: 2) == [0.5, -0.5])
    #expect(G.cutPlanes(n: 3, from: 1, to: 3).isEmpty)
    #expect(G.cutPlanes(n: 4, from: 1, to: 2) == [0])
  }

  /// 장면 행렬 + 원근(m34 = −1/P)으로 옮긴 화면 자리가 카메라 투영과 같다(층 트리가 사이트와 같은 자리에 그린다)
  @Test func 장면_행렬과_원근은_카메라_투영과_같다() {
    let height = 96.0
    let p = G.perspective(height: height)
    let cam = G.camera(n: 3, aspect: 1, panels: nil, fade: 0)
    let unit = 9.0
    var persp = G.identity
    persp[11] = -1 / p
    let m = G.multiply(persp, G.sceneMatrix(cam, perspective: p, unit: unit))
    for q in [[0.0, 0, 0], [1.5, 1.5, 1.5], [-1.5, 0.5, 1.5], [1, -1.5, -1.5]] {
      let h = G.apply4(m, q.map { $0 * unit })
      let want = G.project(cam, height: height, q)!
      #expect(abs(h[0] / h[3] - want.x) < 1e-9)
      #expect(abs(h[1] / h[3] - want.y) < 1e-9)
    }
    // 가운데는 화면 가운데, 큐브는 창 안에
    #expect(abs(G.project(cam, height: height, [0, 0, 0])!.x) < 1e-9)
    for c in G.cubeCorners(3) {
      let s = G.project(cam, height: height, c)!
      #expect(abs(s.x) < height / 2 && abs(s.y) < height / 2)
    }
  }

  /// 사이트 `mirror.test.ts` 「판 테두리는 큐브처럼 얇다」와 같은 값(2026-11-12)
  @Test func 거울_판_테두리는_큐브처럼_얇다() {
    let gap = 1 - G.mirrorSticker
    let rim = gap / 2 + G.mirrorPad
    #expect(gap > 0)
    #expect(rim <= gap)
    #expect(G.mirrorPlateRadius <= 0.16 + rim)
    let c = G.panelCorners(n: 3, G.mirrorPanels(n: 3)[0])
    let d = (0..<3).map { c[1][$0] - c[0][$0] }
    let side = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).squareRoot()
    #expect(abs(side / G.mirrorCell - (3 + 2 * G.mirrorPad)) < 1e-9)
  }

  @Test func 거울_판은_큐브와_겹치지_않고_판까지_화면에_든다() {
    for n in 2...7 {
      let panels = G.mirrorPanels(n: n)
      #expect(panels.count == 3)
      let cube = G.hull(G.projectFlat(G.cubeCorners(n)))
      for p in panels {
        #expect(G.polygonGap(cube, G.hull(G.projectFlat(G.panelCorners(n: n, p)))) >= G.margin(n) - 1e-9)
      }
      let cam = G.camera(n: n, aspect: 1, panels: panels, fade: 1)
      let pts = G.cubeCorners(n) + panels.flatMap { G.panelCorners(n: n, $0) }
      for q in pts {
        let s = G.project(cam, height: 100, q)!
        #expect(abs(s.x) <= 50 && abs(s.y) <= 50, "\(n)")
      }
      // 판이 보이면 카메라가 물러난다
      #expect(cam.dist > G.camera(n: n, aspect: 1, panels: panels, fade: 0).dist)
    }
  }

  /// 사이트 `mirrorCells`와 같은 거울상: 큐브 위-오른쪽-뒤 꼭짓점에 붙은 뒷면 칸은 뒤 판의 위-오른쪽
  @Test func 거울_칸_자리() {
    let back = G.mirrorCell(pos2: [2, 2, -2], normal: [0, 0, -1])!
    #expect(back.panel == 0 && back.u == 1 && back.v == 1)
    // 왼쪽 면: 판 오른쪽이 −z(뒤), 위가 +y
    let left = G.mirrorCell(pos2: [-2, -2, -2], normal: [-1, 0, 0])!
    #expect(left.panel == 1 && left.u == 1 && left.v == -1)
    // 아랫면: 판 오른쪽 +x, 위 −z
    let down = G.mirrorCell(pos2: [2, -2, 2], normal: [0, -1, 0])!
    #expect(down.panel == 2 && down.u == 1 && down.v == -1)
    #expect(G.mirrorCell(pos2: [2, 2, 2], normal: [0, 1, 0]) == nil)
  }
}
