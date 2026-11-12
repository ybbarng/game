//! 가리기(사이트 `packages/cube-engine/src/mask.ts`, 웹 `learn/judge.ts` `maskFor`). 스티커 번호(맞춘 큐브에서의
//! 자리)마다 보임·까맣게·회색. 스티커 번호에 붙으므로 조각이 움직이면 가리기도 따라간다. 화면은 [`mask_at_slots`]로
//! 자리마다의 값을 얻어 칠한다(사이트처럼 까맣게·회색 모두 설정의 「가린 칸 색」 하나로 칠한다).
//!
//! 공식 연습 단계가 쓰는 이름은 모두 옮겼다(공통 시험 자료 `fixtures/mask.json`이 단계마다 본다). 배우기 화면만 쓰는
//! 이름(`centers:UF`·`piece:*`·루 블록·`cmll`)은 앱에 없어 옮기지 않았고, [`mask_for`]가 `None`(가리지 않음)을 준다.

use crate::groups::cube_groups;
use crate::state::State;
use crate::topology::{cube_topology, PieceKind, OPPOSITE_FACE, U};

/// 스티커 하나를 어떻게 보일지(사이트 `StickerVisibility`)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Visibility {
    Visible,
    Hidden,
    Gray,
}

impl Visibility {
    /// 시험 자료 글자(v·h·g)
    pub fn letter(self) -> char {
        match self {
            Visibility::Visible => 'v',
            Visibility::Hidden => 'h',
            Visibility::Gray => 'g',
        }
    }
}

/// 노랑(맞춘 큐브에서 U 맞은편 면)
const YELLOW: usize = OPPOSITE_FACE[U];

fn sticker_face(n: usize, s: usize) -> usize {
    s / (n * n)
}

/// 고른 조각들의 스티커만 보이고 나머지는 `rest`(사이트 `maskFromPieces`)
pub fn mask_from_pieces(n: usize, visible: &[usize], rest: Visibility) -> Vec<Visibility> {
    let topo = cube_topology(n);
    let mut out = vec![rest; topo.sticker_count];
    for &p in visible {
        if let Some(piece) = topo.pieces.get(p) {
            for &s in &piece.stickers {
                out[s] = Visibility::Visible;
            }
        }
    }
    out
}

fn pieces_of_kind(n: usize, kinds: &[PieceKind]) -> Vec<usize> {
    cube_topology(n)
        .pieces
        .iter()
        .enumerate()
        .filter(|(_, p)| kinds.contains(&p.kind))
        .map(|(i, _)| i)
        .collect()
}

/// 자료의 가리기 이름 → 스티커 가리기. `"all"`·모르는 이름은 `None`(가리지 않음). 십자 면은 U(사이트와 같다)
pub fn mask_for(n: usize, name: &str) -> Option<Vec<Visibility>> {
    use Visibility::{Gray, Hidden, Visible};
    let g = cube_groups(n, U);
    let topo = cube_topology(n);
    let cat = |a: &[usize], b: &[usize]| [a, b].concat();
    Some(match name {
        "none" => mask_from_pieces(n, &[], Hidden),
        "centers" => mask_from_pieces(n, &g.centers, Hidden),
        "corners" => mask_from_pieces(n, &pieces_of_kind(n, &[PieceKind::Corner]), Hidden),
        "first-layer" => {
            let pieces = [&g.cross[..], &g.first_layer_corners[..], &g.centers[..]].concat();
            mask_from_pieces(n, &pieces, Hidden)
        }
        "cross" => mask_from_pieces(n, &cat(&g.cross, &g.centers), Hidden),
        "f2l" => mask_from_pieces(n, &g.f2l, Hidden),
        "oll" => (0..topo.sticker_count)
            .map(|s| {
                if sticker_face(n, s) == YELLOW {
                    Visible
                } else {
                    Gray
                }
            })
            .collect(),
        "pll" => {
            let last = cat(&g.last_layer_corners, &g.last_layer_edges);
            mask_from_pieces(n, &cat(&last, &g.centers), Gray)
        }
        "all-hidden" => vec![Hidden; topo.sticker_count],
        "eo-edges" => {
            let edges = pieces_of_kind(n, &[PieceKind::Edge, PieceKind::Wing]);
            mask_from_pieces(n, &cat(&edges, &g.centers), Gray)
        }
        // 윗층 엣지의 노란 칸만 보이고 코너의 노란 칸·엣지의 옆 칸은 회색(노란 십자 모양만 드러난다)
        "ll-cross" => {
            let mut out = mask_from_pieces(n, &g.f2l, Gray);
            for &p in &g.last_layer_edges {
                for &s in &topo.pieces[p].stickers {
                    if sticker_face(n, s) == YELLOW {
                        out[s] = Visible;
                    }
                }
            }
            out
        }
        "ll-edges" => mask_from_pieces(n, &cat(&g.f2l, &g.last_layer_edges), Gray),
        _ => return None,
    })
}

/// 자리마다 칠할 값(자리 i에 있는 스티커의 가리기 값, 사이트 `maskAtSlots`)
pub fn mask_at_slots(state: &State, mask: &[Visibility]) -> Vec<Visibility> {
    state
        .perm
        .iter()
        .map(|&s| mask.get(s as usize).copied().unwrap_or(Visibility::Visible))
        .collect()
}
