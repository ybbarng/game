//! wgpu(Metal) 그리기. 두 번에 나눠 그린다.
//!
//! 1. 장면: 조각 몸통·스티커를 4배 다중 표본(MSAA)으로 그려 투명 바탕의 텍스처 하나로 푼다. 색은 셰이더가 sRGB로
//!    바꿔 쓰고(브라우저처럼 sRGB 값끼리 섞인다), 알파는 덮인 정도라 곱해진 알파(premultiplied)다.
//! 2. 윤곽: 화면 하나를 덮는 삼각형으로 장면 텍스처를 읽어, 큐브 실루엣을 따라 흐림 없는 흰 선(실루엣을 사방으로
//!    `rim_px`만큼 넓힌 자리)과 그 바깥의 어두운 그림자(흐림 `blur_px`)를 깔고 큐브를 얹는다. 사이트 Cubie 윤곽
//!    (`apps/web/src/cube/mini/backdrop.ts` `outlineFilter`)과 같은 값을 쓴다.
//!
//! 대상은 앱 창의 `CAMetalLayer`(투명, 곱해진 알파로 합성) 또는 스크린샷용 화면 밖 텍스처다.

use std::future::Future;
use std::pin::pin;
use std::task::{Context, Poll, Waker};

use crate::math::Mat4;
use crate::scene::{self, HomeInstance, Vertex};
use cube_core::state::State;
use cube_core::CubeMove;

/// 창에 그리지 못한 까닭
pub const DRAW_NO_SURFACE: i32 = 1;
pub const DRAW_TIMEOUT: i32 = 2;
pub const DRAW_OCCLUDED: i32 = 3;
pub const DRAW_OUTDATED: i32 = 4;
pub const DRAW_OTHER: i32 = 5;

const SAMPLES: u32 = 4;
const SCENE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;

/// 사이트 윤곽 값(`OUTLINE`): 흰 선 굵기(짧은 변 비율, 하한 1 CSS px), 흐림 없는 흰 그림자 네 겹이 겹친 진하기,
/// 바깥 그림자 진하기와 흐림 폭(짧은 변 비율, 하한 0.5 CSS px)
pub const RIM_WIDTH: f32 = 0.005;
pub const RIM_WIDTH_MIN: f32 = 1.0;
/// 네 겹(각 0.55)이 곧은 가장자리에서 겹치면 약 0.8
pub const RIM_ALPHA: f32 = 0.8;
pub const SHADE_ALPHA: f32 = 0.55;
pub const SHADE_BLUR: f32 = 0.022;

const SCENE_WGSL: &str = r#"
// 창 크기·큐브 크기가 바뀔 때만 올리는 값: 보기·투영, 눈 자리, 색(면 여섯 + 몸통, sRGB와 광택)
struct Globals { view_proj: mat4x4<f32>, eye: vec4<f32>, palette: array<vec4<f32>, 7> };
@group(0) @binding(0) var<uniform> g: Globals;

// 장마다 바뀌는 값은 immediates로 넘긴다(버퍼에 쓰지 않는다. 쓰면 장마다 복사 명령이 끼어 드라이버 메모리가 크게 붙는다):
// anim = (축, 첫 층, 끝 층, 각 라디안), info.x = 큐브 크기, colors = 스티커 자리마다 색 번호 한 바이트
// (immediates 상한 256바이트라 색은 216칸, 6×6까지. 7×7은 4단계에서 저장 버퍼로 옮긴다)
struct Imm { anim: vec4<f32>, info: vec4<f32>, colors: array<vec4<u32>, 14> };
var<immediate> im: Imm;

struct VIn {
  @location(0) pos: vec3<f32>, @location(1) normal: vec3<f32>,
  @location(2) m0: vec4<f32>, @location(3) m1: vec4<f32>, @location(4) m2: vec4<f32>, @location(5) m3: vec4<f32>,
  // 조각 가운데(맞춘 자리)와 스티커 자리 번호(몸통은 -1)
  @location(6) extra: vec4<f32>,
};
struct VOut {
  @builtin(position) clip: vec4<f32>, @location(0) world: vec3<f32>, @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
};

fn color_index(slot: u32) -> u32 {
  let word = im.colors[slot / 16u][(slot / 4u) % 4u];
  return (word >> ((slot % 4u) * 8u)) & 0xffu;
}

/// 축(0 x·1 y·2 z) 둘레 오른손 방향 각
fn turn(axis: u32, a: f32) -> mat3x3<f32> {
  let c = cos(a);
  let s = sin(a);
  if (axis == 0u) { return mat3x3<f32>(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  if (axis == 1u) { return mat3x3<f32>(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  return mat3x3<f32>(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

@vertex fn vs(v: VIn) -> VOut {
  let m = mat4x4<f32>(v.m0, v.m1, v.m2, v.m3);
  var w = (m * vec4<f32>(v.pos, 1.0)).xyz;
  var nrm = (m * vec4<f32>(v.normal, 0.0)).xyz;
  // 돌리는 층: 조각 가운데의 축 값으로 층 번호(1 = + 쪽 바깥층)를 구한다(코어 topology.layer_of와 같다)
  let axis = u32(im.anim.x);
  let n = im.info.x;
  let layer = (n - 1.0 - 2.0 * v.extra[axis]) / 2.0 + 1.0;
  if (im.anim.w != 0.0 && layer > im.anim.y - 0.5 && layer < im.anim.z + 0.5) {
    let r = turn(axis, im.anim.w);
    w = r * w;
    nrm = r * nrm;
  }
  var o: VOut;
  o.clip = g.view_proj * vec4<f32>(w, 1.0);
  o.world = w;
  o.normal = nrm;
  o.color = select(g.palette[color_index(u32(v.extra.w))], g.palette[6], v.extra.w < 0.0);
  return o;
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
  return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn to_srgb(c: vec3<f32>) -> vec3<f32> {
  return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}

fn lamp(n: vec3<f32>, v: vec3<f32>, dir: vec3<f32>, power: f32, shine: f32) -> vec2<f32> {
  let l = normalize(dir);
  let h = normalize(l + v);
  return vec2<f32>(max(dot(n, l), 0.0) * power, pow(max(dot(n, h), 0.0), 60.0) * power * shine);
}

@fragment fn fs(i: VOut) -> @location(0) vec4<f32> {
  let n = normalize(i.normal);
  let v = normalize(g.eye.xyz - i.world);
  let albedo = to_linear(i.color.rgb);
  // 사이트 장면의 빛: 하늘빛(위 흰, 아래 어두운 회색)과 위-앞·오른쪽·왼쪽-앞 세 방향
  let sky = mix(vec3<f32>(0.042), vec3<f32>(1.0), 0.5 * n.y + 0.5) * 0.7;
  var lit = lamp(n, v, vec3<f32>(3.0, 5.0, 4.0), 1.15, i.color.a);
  lit += lamp(n, v, vec3<f32>(5.0, 0.5, 1.0), 0.75, i.color.a);
  lit += lamp(n, v, vec3<f32>(-4.0, 1.0, 3.0), 0.5, i.color.a);
  let rgb = albedo * (sky * 0.68 + vec3<f32>(lit.x * 0.58)) + vec3<f32>(lit.y * 0.22);
  return vec4<f32>(to_srgb(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0))), 1.0);
}
"#;

const OUTLINE_WGSL: &str = r#"
struct Params { rim_px: f32, blur_px: f32, rim_alpha: f32, shade_alpha: f32 };
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var<uniform> p: Params;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let x = f32(i32(i & 1u) * 4 - 1);
  let y = f32(i32(i >> 1u) * 4 - 1);
  return vec4<f32>(x, y, 0.0, 1.0);
}

fn alpha_at(c: vec2<i32>) -> f32 {
  let size = vec2<i32>(textureDimensions(scene));
  if (c.x < 0 || c.y < 0 || c.x >= size.x || c.y >= size.y) { return 0.0; }
  return textureLoad(scene, c, 0).a;
}

@fragment fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let c = vec2<i32>(pos.xy);
  let s = textureLoad(scene, c, 0);
  if (s.a >= 0.999) { return s; }
  // 흰 선: 실루엣을 사방으로 rim_px만큼 넓힌 자리(흐림 없음)
  let r = max(i32(round(p.rim_px)), 1);
  var d = 0.0;
  for (var y = -r; y <= r; y++) {
    for (var x = -r; x <= r; x++) {
      d = max(d, alpha_at(c + vec2<i32>(x, y)));
    }
  }
  // 바깥 그림자: 넓힌 실루엣을 가우스로 흐린 것(표준편차 = 흐림 폭의 절반, CSS drop-shadow와 같다)
  let sigma = max(p.blur_px * 0.5, 0.5);
  let reach = i32(ceil(sigma * 2.5)) + r;
  var sum = 0.0;
  var wsum = 0.0;
  for (var y = -reach; y <= reach; y++) {
    for (var x = -reach; x <= reach; x++) {
      let dist = max(length(vec2<f32>(f32(x), f32(y))) - f32(r), 0.0);
      let w = exp(-(dist * dist) / (2.0 * sigma * sigma));
      sum += w * alpha_at(c + vec2<i32>(x, y));
      wsum += w;
    }
  }
  let shade = p.shade_alpha * (sum / max(wsum, 1e-4));
  let rim = p.rim_alpha * d;
  // 흰 선을 그림자 위에, 큐브를 맨 위에(곱해진 알파)
  let under_a = rim + (1.0 - rim) * shade;
  let under = vec4<f32>(vec3<f32>(rim), under_a);
  return s + (1.0 - s.a) * under;
}
"#;

fn bytes<T: Copy>(v: &[T]) -> &[u8] {
    // 안전: repr(C)인 f32·u16 묶음만 넘긴다
    unsafe { std::slice::from_raw_parts(v.as_ptr().cast::<u8>(), std::mem::size_of_val(v)) }
}

/// wgpu의 미래 값을 기다린다(이 장치들은 바로 끝나거나 장치 poll로 끝난다)
pub fn block_on<F: Future>(f: F) -> F::Output {
    let mut f = pin!(f);
    let mut cx = Context::from_waker(Waker::noop());
    loop {
        if let Poll::Ready(v) = f.as_mut().poll(&mut cx) {
            return v;
        }
        std::thread::yield_now();
    }
}

#[repr(C)]
#[derive(Clone, Copy)]
struct Globals {
    view_proj: Mat4,
    eye: [f32; 4],
    palette: [[f32; 4]; 7],
}

/// 장마다 넘기는 값(셰이더 `Imm`과 같은 배치)
#[repr(C)]
#[derive(Clone, Copy)]
struct Imm {
    anim: [f32; 4],
    info: [f32; 4],
    colors: [u32; 56],
}

const IMM_SIZE: u32 = std::mem::size_of::<Imm>() as u32;

struct Mesh {
    vertices: wgpu::Buffer,
    indices: wgpu::Buffer,
    count: u32,
}

/// 창 크기에 따라 다시 만드는 텍스처
struct Frames {
    msaa: wgpu::TextureView,
    depth: wgpu::TextureView,
    scene: wgpu::TextureView,
    outline_bind: wgpu::BindGroup,
}

pub struct Renderer {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: Option<(wgpu::Surface<'static>, wgpu::SurfaceConfiguration)>,
    target_format: wgpu::TextureFormat,
    scene_pipeline: wgpu::RenderPipeline,
    outline_pipeline: wgpu::RenderPipeline,
    outline_layout: wgpu::BindGroupLayout,
    globals: wgpu::Buffer,
    globals_bind: wgpu::BindGroup,
    params: wgpu::Buffer,
    instances: wgpu::Buffer,
    instance_capacity: usize,
    body: Mesh,
    sticker: Mesh,
    frames: Frames,
    /// 그릴 곳(창)이 없을 때 대신 그리는 텍스처(재기 모드: 화면 밖 창은 wgpu가 가려진 창으로 보고 그릴 곳을 내주지 않는다)
    stand_in: Option<(u32, u32, wgpu::TextureView)>,
    /// 마지막으로 버퍼에 올린 (큐브 크기, 너비, 높이, 배율)
    uploaded: Option<(usize, u32, u32, u32)>,
    /// 몸통·스티커 인스턴스 수
    counts: (u32, u32),
    width: u32,
    height: u32,
    /// 화면 배율(장치 px ÷ pt). 윤곽 굵기를 pt로 잡는다
    scale: f32,
}

#[derive(Debug)]
pub struct RenderError(pub String);

impl std::fmt::Display for RenderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

fn instance() -> wgpu::Instance {
    let mut desc = wgpu::InstanceDescriptor::new_without_display_handle();
    desc.backends = wgpu::Backends::METAL;
    wgpu::Instance::new(desc)
}

fn device_for(
    inst: &wgpu::Instance,
    surface: Option<&wgpu::Surface<'_>>,
) -> Result<(wgpu::Adapter, wgpu::Device, wgpu::Queue), RenderError> {
    let adapter = block_on(inst.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::LowPower,
        force_fallback_adapter: false,
        compatible_surface: surface,
        apply_limit_buckets: false,
    }))
    .map_err(|e| RenderError(format!("그래픽 장치 없음: {e}")))?;
    let (device, queue) = block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("cubie"),
        required_features: wgpu::Features::IMMEDIATES,
        required_limits: wgpu::Limits {
            max_immediate_size: IMM_SIZE,
            ..wgpu::Limits::downlevel_defaults().using_resolution(adapter.limits())
        },
        memory_hints: wgpu::MemoryHints::MemoryUsage,
        ..Default::default()
    }))
    .map_err(|e| RenderError(format!("장치 열기 실패: {e}")))?;
    Ok((adapter, device, queue))
}

impl Renderer {
    /// 앱 창의 `CAMetalLayer`에 그린다. `layer`는 그 층의 포인터(살아 있는 동안 앱이 쥐고 있다)
    ///
    /// # Safety
    /// `layer`는 `CAMetalLayer` 객체를 가리켜야 하고, 이 그리개보다 오래 살아야 한다.
    pub unsafe fn for_layer(
        layer: *mut std::ffi::c_void,
        width: u32,
        height: u32,
        scale: f32,
    ) -> Result<Self, RenderError> {
        let inst = instance();
        let surface = unsafe {
            inst.create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CoreAnimationLayer(layer))
        }
        .map_err(|e| RenderError(format!("그릴 곳 만들기 실패: {e}")))?;
        let (adapter, device, queue) = device_for(&inst, Some(&surface))?;
        let caps = surface.get_capabilities(&adapter);
        let format = [
            wgpu::TextureFormat::Bgra8Unorm,
            wgpu::TextureFormat::Rgba8Unorm,
        ]
        .into_iter()
        .find(|f| caps.formats.contains(f))
        .unwrap_or(caps.formats[0]);
        let mut config = surface
            .get_default_config(&adapter, width.max(1), height.max(1))
            .ok_or_else(|| RenderError("그릴 곳 설정 없음".into()))?;
        config.format = format;
        config.present_mode = wgpu::PresentMode::Fifo;
        config.alpha_mode = if caps
            .alpha_modes
            .contains(&wgpu::CompositeAlphaMode::PostMultiplied)
        {
            wgpu::CompositeAlphaMode::PostMultiplied
        } else {
            caps.alpha_modes[0]
        };
        config.desired_maximum_frame_latency = 1;
        surface.configure(&device, &config);
        let mut r = Self::build(device, queue, format, width, height, scale);
        r.surface = Some((surface, config));
        Ok(r)
    }

    /// 화면 밖 텍스처에 그린다(스크린샷)
    pub fn offscreen(width: u32, height: u32, scale: f32) -> Result<Self, RenderError> {
        let inst = instance();
        let (_, device, queue) = device_for(&inst, None)?;
        Ok(Self::build(
            device,
            queue,
            wgpu::TextureFormat::Rgba8Unorm,
            width,
            height,
            scale,
        ))
    }

    fn build(
        device: wgpu::Device,
        queue: wgpu::Queue,
        target_format: wgpu::TextureFormat,
        width: u32,
        height: u32,
        scale: f32,
    ) -> Self {
        let scene_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("scene"),
            source: wgpu::ShaderSource::Wgsl(SCENE_WGSL.into()),
        });
        let outline_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("outline"),
            source: wgpu::ShaderSource::Wgsl(OUTLINE_WGSL.into()),
        });

        let globals_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("globals"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let globals = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("globals"),
            size: std::mem::size_of::<Globals>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let globals_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("globals"),
            layout: &globals_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: globals.as_entire_binding(),
            }],
        });

        let vertex_attrs = wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3];
        let instance_attrs = wgpu::vertex_attr_array![
            2 => Float32x4, 3 => Float32x4, 4 => Float32x4, 5 => Float32x4, 6 => Float32x4
        ];
        let scene_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("scene"),
            bind_group_layouts: &[Some(&globals_layout)],
            immediate_size: IMM_SIZE,
        });
        let scene_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("scene"),
            layout: Some(&scene_layout),
            vertex: wgpu::VertexState {
                module: &scene_module,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[
                    Some(wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<Vertex>() as u64,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &vertex_attrs,
                    }),
                    Some(wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<HomeInstance>() as u64,
                        step_mode: wgpu::VertexStepMode::Instance,
                        attributes: &instance_attrs,
                    }),
                ],
            },
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: Some(wgpu::DepthStencilState {
                format: DEPTH_FORMAT,
                depth_write_enabled: Some(true),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: Default::default(),
                bias: Default::default(),
            }),
            multisample: wgpu::MultisampleState {
                count: SAMPLES,
                ..Default::default()
            },
            fragment: Some(wgpu::FragmentState {
                module: &scene_module,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: SCENE_FORMAT,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });

        let outline_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("outline"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let outline_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("outline"),
            bind_group_layouts: &[Some(&outline_layout)],
            immediate_size: 0,
        });
        let outline_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("outline"),
            layout: Some(&outline_pl),
            vertex: wgpu::VertexState {
                module: &outline_module,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: Default::default(),
            fragment: Some(wgpu::FragmentState {
                module: &outline_module,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: target_format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        let params = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("outline params"),
            size: 16,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let mesh = |(v, i): (Vec<Vertex>, Vec<u16>), label: &str| {
            let vertices = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(label),
                size: std::mem::size_of_val(v.as_slice()) as u64,
                usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            queue.write_buffer(&vertices, 0, bytes(&v));
            // 색인은 4바이트 배수로 맞춘다
            let mut idx = i.clone();
            if idx.len() % 2 == 1 {
                idx.push(0);
            }
            let indices = device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(label),
                size: std::mem::size_of_val(idx.as_slice()) as u64,
                usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
            queue.write_buffer(&indices, 0, bytes(&idx));
            Mesh {
                vertices,
                indices,
                count: i.len() as u32,
            }
        };
        let body = mesh(
            scene::rounded_box(scene::CUBIE, scene::CUBIE_RADIUS, 3),
            "body",
        );
        let sticker = mesh(
            scene::sticker_mesh(scene::STICKER, scene::STICKER_RADIUS, 4),
            "sticker",
        );
        let instance_capacity = 512;
        let instances = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("instances"),
            size: (instance_capacity * std::mem::size_of::<HomeInstance>()) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let frames = Self::make_frames(&device, &outline_layout, &params, width, height);
        Renderer {
            device,
            queue,
            surface: None,
            target_format,
            scene_pipeline,
            outline_pipeline,
            outline_layout,
            globals,
            globals_bind,
            params,
            instances,
            instance_capacity,
            body,
            sticker,
            frames,
            stand_in: None,
            uploaded: None,
            counts: (0, 0),
            width: width.max(1),
            height: height.max(1),
            scale,
        }
    }

    fn make_frames(
        device: &wgpu::Device,
        outline_layout: &wgpu::BindGroupLayout,
        params: &wgpu::Buffer,
        width: u32,
        height: u32,
    ) -> Frames {
        let size = wgpu::Extent3d {
            width: width.max(1),
            height: height.max(1),
            depth_or_array_layers: 1,
        };
        let tex = |label, format, samples, usage| {
            device
                .create_texture(&wgpu::TextureDescriptor {
                    label: Some(label),
                    size,
                    mip_level_count: 1,
                    sample_count: samples,
                    dimension: wgpu::TextureDimension::D2,
                    format,
                    usage,
                    view_formats: &[],
                })
                .create_view(&Default::default())
        };
        let msaa = tex(
            "msaa",
            SCENE_FORMAT,
            SAMPLES,
            wgpu::TextureUsages::RENDER_ATTACHMENT,
        );
        let depth = tex(
            "depth",
            DEPTH_FORMAT,
            SAMPLES,
            wgpu::TextureUsages::RENDER_ATTACHMENT,
        );
        let scene = tex(
            "scene",
            SCENE_FORMAT,
            1,
            wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        );
        let outline_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("outline"),
            layout: outline_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&scene),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: params.as_entire_binding(),
                },
            ],
        });
        Frames {
            msaa,
            depth,
            scene,
            outline_bind,
        }
    }

    pub fn size(&self) -> (u32, u32) {
        (self.width, self.height)
    }

    pub fn resize(&mut self, width: u32, height: u32, scale: f32) {
        let (width, height) = (width.max(1), height.max(1));
        self.scale = scale;
        if (width, height) == (self.width, self.height) {
            return;
        }
        self.width = width;
        self.height = height;
        if let Some((surface, config)) = &mut self.surface {
            config.width = width;
            config.height = height;
            surface.configure(&self.device, config);
        }
        self.frames = Self::make_frames(
            &self.device,
            &self.outline_layout,
            &self.params,
            width,
            height,
        );
    }

    fn encode(
        &mut self,
        n: usize,
        state: &State,
        turning: Option<(CubeMove, f32)>,
        target: &wgpu::TextureView,
    ) -> wgpu::CommandEncoder {
        // 버퍼는 큐브 크기·창 크기가 바뀔 때만 쓴다(장마다 쓰면 복사 명령이 끼어 드라이버 메모리가 크게 붙는다, docs/52 5-2)
        let key = (n, self.width, self.height, self.scale.to_bits());
        if self.uploaded != Some(key) {
            self.uploaded = Some(key);
            let (bodies, stickers) = scene::home_instances(n);
            self.counts = (bodies.len() as u32, stickers.len() as u32);
            let all: Vec<HomeInstance> = bodies.into_iter().chain(stickers).collect();
            assert!(all.len() <= self.instance_capacity, "인스턴스가 너무 많다");
            self.queue.write_buffer(&self.instances, 0, bytes(&all));
            let (view_proj, eye) = scene::camera(n, self.width as f32 / self.height as f32);
            let g = Globals {
                view_proj,
                eye: [eye[0], eye[1], eye[2], 1.0],
                palette: scene::palette(),
            };
            self.queue
                .write_buffer(&self.globals, 0, bytes(std::slice::from_ref(&g)));
            // 윤곽 굵기: 창 짧은 변(pt) 기준, 장치 px로
            let short_pt = self.width.min(self.height) as f32 / self.scale;
            let rim_px = (short_pt * RIM_WIDTH).max(RIM_WIDTH_MIN) * self.scale;
            let blur_px = (short_pt * SHADE_BLUR).max(0.5) * self.scale;
            self.queue.write_buffer(
                &self.params,
                0,
                bytes(&[rim_px, blur_px, RIM_ALPHA, SHADE_ALPHA]),
            );
        }
        let mut imm = Imm {
            anim: [0.0; 4],
            info: [n as f32, 0.0, 0.0, 0.0],
            colors: [0; 56],
        };
        assert!(
            6 * n * n <= imm.colors.len() * 4,
            "{n}×{n}는 이 시제품 그리기에 색 칸이 모자란다(6×6까지)"
        );
        scene::pack_colors(n, state, &mut imm.colors);
        if let Some((m, p)) = turning {
            imm.anim = [
                f32::from(m.axis),
                m.from as f32,
                m.to as f32,
                scene::move_angle(&m, p),
            ];
        }
        let (nb, ns) = self.counts;

        let mut enc = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("frame"),
            });
        {
            let mut pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("scene"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.frames.msaa,
                    depth_slice: None,
                    resolve_target: Some(&self.frames.scene),
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Discard,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.frames.depth,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Discard,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.scene_pipeline);
            pass.set_bind_group(0, &self.globals_bind, &[]);
            pass.set_immediates(0, bytes(std::slice::from_ref(&imm)));
            pass.set_vertex_buffer(1, self.instances.slice(..));
            for (mesh, range) in [(&self.body, 0..nb), (&self.sticker, nb..nb + ns)] {
                pass.set_vertex_buffer(0, mesh.vertices.slice(..));
                pass.set_index_buffer(mesh.indices.slice(..), wgpu::IndexFormat::Uint16);
                pass.draw_indexed(0..mesh.count, 0, range);
            }
        }
        {
            let mut pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("outline"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.outline_pipeline);
            pass.set_bind_group(0, &self.frames.outline_bind, &[]);
            pass.draw(0..3, 0..1);
        }
        enc
    }

    /// 창에 한 장 그린다. 그릴 곳을 얻지 못하면 까닭(`DRAW_*`)
    pub fn draw(
        &mut self,
        n: usize,
        state: &State,
        turning: Option<(CubeMove, f32)>,
    ) -> Result<(), i32> {
        let Some((surface, _)) = &self.surface else {
            // 창이 없으면 같은 그리기를 대신 텍스처에 한다(내보내기만 빠진다)
            let view = self.stand_in_view();
            let enc = self.encode(n, state, turning, &view);
            self.queue.submit([enc.finish()]);
            self.reclaim();
            return Ok(());
        };
        let frame = match surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(t)
            | wgpu::CurrentSurfaceTexture::Suboptimal(t) => t,
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                if let Some((surface, config)) = &self.surface {
                    surface.configure(&self.device, config);
                }
                return Err(DRAW_OUTDATED);
            }
            wgpu::CurrentSurfaceTexture::Timeout => return Err(DRAW_TIMEOUT),
            wgpu::CurrentSurfaceTexture::Occluded => return Err(DRAW_OCCLUDED),
            _ => return Err(DRAW_OTHER),
        };
        let view = frame.texture.create_view(&Default::default());
        let enc = self.encode(n, state, turning, &view);
        self.queue.submit([enc.finish()]);
        self.queue.present(frame);
        self.reclaim();
        Ok(())
    }

    /// 끝난 제출의 자원(올려 보낸 버퍼·명령 버퍼)을 거둔다. 막지 않는다. 거두지 않으면 돌리는 동안 한 장마다 쌓인다
    fn reclaim(&self) {
        let _ = self.device.poll(wgpu::PollType::Poll);
    }

    /// 보낸 그리기가 GPU에서 다 끝날 때까지 기다린다(실험용)
    pub fn wait_idle(&self) {
        let _ = self.device.poll(wgpu::PollType::Wait {
            submission_index: None,
            timeout: None,
        });
    }

    fn stand_in_view(&mut self) -> wgpu::TextureView {
        let (w, h) = (self.width, self.height);
        if let Some((sw, sh, v)) = &self.stand_in {
            if (*sw, *sh) == (w, h) {
                return v.clone();
            }
        }
        let view = self
            .device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("stand-in"),
                size: wgpu::Extent3d {
                    width: w,
                    height: h,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: self.target_format,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            })
            .create_view(&Default::default());
        self.stand_in = Some((w, h, view.clone()));
        view
    }

    /// 화면 밖에 그려 RGBA8(곧은 알파) 픽셀로 돌려준다(스크린샷)
    pub fn capture(
        &mut self,
        n: usize,
        state: &State,
        turning: Option<(CubeMove, f32)>,
    ) -> Vec<u8> {
        let (w, h) = (self.width, self.height);
        let target = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("capture"),
            size: wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: self.target_format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = target.create_view(&Default::default());
        let mut enc = self.encode(n, state, turning, &view);
        let row = (w * 4).div_ceil(256) * 256;
        let buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback"),
            size: u64::from(row * h),
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        enc.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &target,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(row),
                    rows_per_image: Some(h),
                },
            },
            wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: 1,
            },
        );
        self.queue.submit([enc.finish()]);
        buffer.map_async(wgpu::MapMode::Read, .., |r| r.expect("읽기"));
        self.device
            .poll(wgpu::PollType::Wait {
                submission_index: None,
                timeout: None,
            })
            .expect("기다리기");
        let data = buffer.get_mapped_range(..).expect("읽기");
        let mut out = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            let line = &data[(y * row) as usize..(y * row + w * 4) as usize];
            for px in line.chunks(4) {
                // 곱해진 알파 → 곧은 알파
                let a = px[3];
                let un = |c: u8| {
                    if a == 0 {
                        0
                    } else {
                        ((u32::from(c) * 255 + u32::from(a) / 2) / u32::from(a)).min(255) as u8
                    }
                };
                out.extend_from_slice(&[un(px[0]), un(px[1]), un(px[2]), a]);
            }
        }
        out
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use cube_core::state::apply_move;
    use cube_core::{parse_moves, solved_cube};

    fn differing(a: &[u8], b: &[u8], tolerance: u8) -> usize {
        a.chunks(4)
            .zip(b.chunks(4))
            .filter(|(p, q)| {
                p.iter()
                    .zip(q.iter())
                    .any(|(x, y)| x.abs_diff(*y) > tolerance)
            })
            .count()
    }

    /// 셰이더가 돌린 층(진행 1)이 코어로 수를 둔 뒤의 그림과 같다: 셰이더의 층·방향 셈이 코어와 맞는다
    #[test]
    fn shader_turn_matches_core_state() {
        let mut r = Renderer::offscreen(96, 96, 1.0).expect("그래픽 장치");
        for n in [2, 3, 4] {
            let start = parse_moves(n, "R U F' D2 L B' x y")
                .unwrap()
                .iter()
                .fold(solved_cube(n), |s, m| apply_move(n, &s, m));
            let before = r.capture(n, &start, None);
            for text in ["R", "U'", "F2", "L", "B", "y'"] {
                let m = parse_moves(n, text).unwrap()[0];
                let during = r.capture(n, &start, Some((m, 1.0)));
                let after = r.capture(n, &apply_move(n, &start, &m), None);
                // 회전 끝의 부동소수 차이로 가장자리 몇 픽셀이 조금 다를 수 있다
                let off = differing(&during, &after, 24);
                assert!(off < 30, "{n}×{n} {text}: 다른 픽셀 {off}개");
                // 돌리기 전과는 분명히 다르다(시험이 헛돌지 않는다)
                assert!(
                    differing(&before, &after, 24) > 200,
                    "{n}×{n} {text}: 그림이 그대로"
                );
            }
        }
    }
}
