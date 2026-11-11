//! 조각 묶음 이름표(`packages/cube-engine/src/groups.ts`). 조각 번호는 조각 「자리」 번호다.

use crate::topology::{cube_topology, PieceKind, OPPOSITE_FACE};

/// 조각 자리가 닿은 면들
pub fn piece_faces(n: usize, piece: usize) -> Vec<usize> {
    let topo = cube_topology(n);
    topo.pieces[piece]
        .stickers
        .iter()
        .map(|&s| topo.stickers[s].face)
        .collect()
}

#[derive(Clone, Debug)]
pub struct F2lPair {
    pub corner: usize,
    pub edges: Vec<usize>,
}

#[derive(Clone, Debug)]
pub struct CubeGroups {
    pub cross: Vec<usize>,
    pub first_layer_corners: Vec<usize>,
    pub middle_edges: Vec<usize>,
    pub centers: Vec<usize>,
    pub f2l: Vec<usize>,
    pub last_layer_corners: Vec<usize>,
    pub last_layer_edges: Vec<usize>,
    pub f2l_pairs: Vec<F2lPair>,
}

/// 층별 조각 묶음. `cross_face`는 십자를 만드는 면
pub fn cube_groups(n: usize, cross_face: usize) -> CubeGroups {
    let top = OPPOSITE_FACE[cross_face];
    let topo = cube_topology(n);
    let mut g = CubeGroups {
        cross: vec![],
        first_layer_corners: vec![],
        middle_edges: vec![],
        centers: vec![],
        f2l: vec![],
        last_layer_corners: vec![],
        last_layer_edges: vec![],
        f2l_pairs: vec![],
    };
    for (i, p) in topo.pieces.iter().enumerate() {
        let faces = piece_faces(n, i);
        let at_bottom = faces.contains(&cross_face);
        let at_top = faces.contains(&top);
        match p.kind {
            PieceKind::Center | PieceKind::InnerCenter => g.centers.push(i),
            PieceKind::Corner => {
                if at_bottom {
                    g.first_layer_corners.push(i)
                } else {
                    g.last_layer_corners.push(i)
                }
            }
            _ if at_bottom => g.cross.push(i),
            _ if at_top => g.last_layer_edges.push(i),
            _ => g.middle_edges.push(i),
        }
    }
    let sides = |piece: usize| -> Vec<usize> {
        piece_faces(n, piece)
            .into_iter()
            .filter(|&f| f != cross_face && f != top)
            .collect()
    };
    g.f2l_pairs = g
        .first_layer_corners
        .iter()
        .map(|&corner| {
            let s = sides(corner);
            F2lPair {
                corner,
                edges: g
                    .middle_edges
                    .iter()
                    .copied()
                    .filter(|&e| {
                        let es = sides(e);
                        s.iter().all(|f| es.contains(f))
                    })
                    .collect(),
            }
        })
        .collect();
    let mut f2l: Vec<usize> = [
        &g.cross[..],
        &g.first_layer_corners[..],
        &g.middle_edges[..],
        &g.centers[..],
    ]
    .concat();
    f2l.sort_unstable();
    g.f2l = f2l;
    g
}
