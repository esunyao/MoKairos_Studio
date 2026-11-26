//! RoboMaster 2027 串口 UI 协议权威二进制编码器
//! 覆盖 15 字节图元编码、按组 7/5/2/1 分包、0x0301 交互载荷与 0xA5 整帧构建。

use std::collections::BTreeMap;

use crate::model::{MkuiFrame, MkuiGraphic};
use crate::protocol::crc::{calc_crc16, calc_crc8};

/// 图形操作类型：0=空操作，1=增加，2=修改，3=删除
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum GraphicOperateType {
    Noop = 0,
    Add = 1,
    Modify = 2,
    Delete = 3,
}

/// 文本编码方式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TextEncoding {
    #[default]
    Utf8,
    Utf16Le,
}

/// 单个按组分包后的 0x0301 内容载荷（不含 6 字节交互头）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackedUiPayload {
    pub group_id: String,
    pub group_name: String,
    pub sub_cmd_id: u16,
    pub item_count: usize,
    pub is_text: bool,
    pub content: Vec<u8>,
}

/// 按 JS `Math.round`（半值向正无穷）规则缩放并钳位浮点为 int32
pub fn scale_float_to_i32(value: f64) -> i32 {
    if !value.is_finite() {
        return 0;
    }
    let scaled = (value * 1000.0 + 0.5).floor();
    scaled.clamp(i32::MIN as f64, i32::MAX as f64) as i32
}

/// 将文本按编码模式编码为最多 30 字节定长数组，返回 (30B 数组, 有效字节长度)
pub fn encode_text_bytes(text: &str, encoding: TextEncoding) -> ([u8; 30], usize) {
    let mut out = [0u8; 30];
    match encoding {
        TextEncoding::Utf8 => {
            let bytes = text.as_bytes();
            let len = bytes.len().min(30);
            out[..len].copy_from_slice(&bytes[..len]);
            (out, len)
        }
        TextEncoding::Utf16Le => {
            let mut len = 0usize;
            for unit in text.encode_utf16() {
                if len + 2 > 30 {
                    break;
                }
                let le = unit.to_le_bytes();
                out[len] = le[0];
                out[len + 1] = le[1];
                len += 2;
            }
            (out, len)
        }
    }
}

/// 将单个图元编码为 15 字节 `interaction_figure_t`
pub fn encode_figure(graphic: &MkuiGraphic, operate: u8) -> [u8; 15] {
    encode_figure_with_encoding(graphic, operate, TextEncoding::Utf8)
}

/// 按指定文本编码将单个图元编码为 15 字节 `interaction_figure_t`
pub fn encode_figure_with_encoding(
    graphic: &MkuiGraphic,
    operate: u8,
    encoding: TextEncoding,
) -> [u8; 15] {
    let mut out = [0u8; 15];

    let name_bytes = graphic.figure_name().as_bytes();
    let copy_len = name_bytes.len().min(3);
    out[..copy_len].copy_from_slice(&name_bytes[..copy_len]);

    let (figure_type, mut details_a, mut details_b, start_x, start_y, details_c, details_d, details_e, int32_payload) =
        match graphic {
            MkuiGraphic::Line {
                start_x,
                start_y,
                end_x,
                end_y,
                ..
            } => (0u32, 0i32, 0i32, *start_x, *start_y, 0i32, *end_x, *end_y, None),
            MkuiGraphic::Rect {
                start_x,
                start_y,
                end_x,
                end_y,
                ..
            } => (1u32, 0, 0, *start_x, *start_y, 0, *end_x, *end_y, None),
            MkuiGraphic::Circle {
                center_x,
                center_y,
                radius,
                ..
            } => (2u32, 0, 0, *center_x, *center_y, *radius, 0, 0, None),
            MkuiGraphic::Ellipse {
                center_x,
                center_y,
                rx,
                ry,
                ..
            } => (3u32, 0, 0, *center_x, *center_y, 0, *rx, *ry, None),
            MkuiGraphic::Arc {
                center_x,
                center_y,
                rx,
                ry,
                start_angle,
                end_angle,
                ..
            } => (
                4u32,
                *start_angle,
                *end_angle,
                *center_x,
                *center_y,
                0,
                *rx,
                *ry,
                None,
            ),
            MkuiGraphic::Float {
                x,
                y,
                font_size,
                value,
                ..
            } => (
                5u32,
                *font_size as i32,
                0,
                *x,
                *y,
                0,
                0,
                0,
                Some(scale_float_to_i32(*value)),
            ),
            MkuiGraphic::Int {
                x,
                y,
                font_size,
                value,
                ..
            } => {
                let clamped = (*value).clamp(i32::MIN as i64, i32::MAX as i64) as i32;
                (
                    6u32,
                    *font_size as i32,
                    0,
                    *x,
                    *y,
                    0,
                    0,
                    0,
                    Some(clamped),
                )
            }
            MkuiGraphic::Text {
                x,
                y,
                font_size,
                text,
                ..
            } => {
                let (_, byte_len) = encode_text_bytes(text, encoding);
                (
                    7u32,
                    *font_size as i32,
                    byte_len as i32,
                    *x,
                    *y,
                    0,
                    0,
                    0,
                    None,
                )
            }
        };

    // 限制 9 位有符号/无符号掩码
    details_a &= 0x1ff;
    details_b &= 0x1ff;

    let word1: u32 = ((operate as u32) & 0x7)
        | ((figure_type & 0x7) << 3)
        | (((graphic.layer() as u32) & 0xf) << 6)
        | (((graphic.color() as u32) & 0xf) << 10)
        | (((details_a as u32) & 0x1ff) << 14)
        | (((details_b as u32) & 0x1ff) << 23);

    let word2: u32 = ((graphic.line_width() as u32) & 0x3ff)
        | (((start_x as u32) & 0x7ff) << 10)
        | (((start_y as u32) & 0x7ff) << 21);

    out[3..7].copy_from_slice(&word1.to_le_bytes());
    out[7..11].copy_from_slice(&word2.to_le_bytes());

    if let Some(val) = int32_payload {
        out[11..15].copy_from_slice(&val.to_le_bytes());
    } else {
        let word3: u32 = ((details_c as u32) & 0x3ff)
            | (((details_d as u32) & 0x7ff) << 10)
            | (((details_e as u32) & 0x7ff) << 21);
        out[11..15].copy_from_slice(&word3.to_le_bytes());
    }

    out
}

/// 根据每包非文字图元数量选择 0x0101 / 0x0102 / 0x0103 / 0x0104 及槽位容量
pub fn choose_shape_sub_cmd(count: usize) -> (u16, usize) {
    if count <= 1 {
        (0x0101, 1)
    } else if count == 2 {
        (0x0102, 2)
    } else if count <= 5 {
        (0x0103, 5)
    } else {
        (0x0104, 7)
    }
}

/// 按分组拆分并打包单个画面内的所有图元（或仅动态图元）
/// 分包顺序与 `packetBudget.ts` 保持一致：按 `frame.groups` 出现顺序分组（未识别归入末尾），组内先文字后图形。
pub fn pack_frame_by_group(
    frame: &MkuiFrame,
    operate: u8,
    only_dynamic: bool,
    encoding: TextEncoding,
) -> Vec<PackedUiPayload> {
    let mut group_order: Vec<(String, String)> = frame
        .groups
        .iter()
        .map(|g| (g.id.clone(), g.name.clone()))
        .collect();
    let mut buckets: BTreeMap<usize, Vec<&MkuiGraphic>> = BTreeMap::new();
    let mut id_to_idx: BTreeMap<String, usize> = group_order
        .iter()
        .enumerate()
        .map(|(idx, (id, _))| (id.clone(), idx))
        .collect();

    for g in &frame.graphics {
        if only_dynamic && !g.dynamic() {
            continue;
        }
        let idx = if let Some(&existing) = id_to_idx.get(g.group_id()) {
            existing
        } else {
            let next_idx = group_order.len();
            let gid = g.group_id().to_string();
            group_order.push((gid.clone(), "未分组".to_string()));
            id_to_idx.insert(gid, next_idx);
            next_idx
        };
        buckets.entry(idx).or_default().push(g);
    }

    let mut payloads = Vec::new();
    for (idx, items) in buckets {
        let (group_id, group_name) = &group_order[idx];

        // 1. 字符图元独占 0x0110（15B figure + 30B 文本区 = 45B）
        for txt in items.iter().copied().filter(|g| g.is_text()) {
            let mut content = vec![0u8; 45];
            let fig = encode_figure_with_encoding(txt, operate, encoding);
            content[..15].copy_from_slice(&fig);
            if let MkuiGraphic::Text { text, .. } = txt {
                let (encoded, _) = encode_text_bytes(text, encoding);
                content[15..45].copy_from_slice(&encoded);
            }
            payloads.push(PackedUiPayload {
                group_id: group_id.clone(),
                group_name: group_name.clone(),
                sub_cmd_id: 0x0110,
                item_count: 1,
                is_text: true,
                content,
            });
        }

        // 2. 非文字图元按每包最多 7 个贪心分包
        let shapes: Vec<&MkuiGraphic> = items.into_iter().filter(|g| !g.is_text()).collect();
        for chunk in shapes.chunks(7) {
            let (sub_cmd_id, slots) = choose_shape_sub_cmd(chunk.len());
            let mut content = vec![0u8; slots * 15];
            for (slot_idx, graphic) in chunk.iter().enumerate() {
                let fig = encode_figure_with_encoding(graphic, operate, encoding);
                let offset = slot_idx * 15;
                content[offset..offset + 15].copy_from_slice(&fig);
            }
            payloads.push(PackedUiPayload {
                group_id: group_id.clone(),
                group_name: group_name.clone(),
                sub_cmd_id,
                item_count: chunk.len(),
                is_text: false,
                content,
            });
        }
    }

    payloads
}

/// 组装 0x0301 交互载荷（6 字节交互头 + 内容：21 / 36 / 81 / 111 / 51 B）
pub fn build_interaction_payload(
    sub_cmd_id: u16,
    sender_id: u16,
    receiver_id: u16,
    content: &[u8],
) -> Vec<u8> {
    let mut payload = Vec::with_capacity(6 + content.len());
    payload.extend_from_slice(&sub_cmd_id.to_le_bytes());
    payload.extend_from_slice(&sender_id.to_le_bytes());
    payload.extend_from_slice(&receiver_id.to_le_bytes());
    payload.extend_from_slice(content);
    payload
}

/// 组装完整 0xA5 裁判系统串口帧（含 frame_header + CRC8 + cmd_id=0x0301 + 6B 交互头 + 内容 + CRC16）
pub fn build_referee_frame(
    sub_cmd_id: u16,
    sender_id: u16,
    receiver_id: u16,
    seq: u8,
    content: &[u8],
) -> Vec<u8> {
    let data_len = (6 + content.len()) as u16;
    let total_len = 5 + 2 + data_len as usize + 2;
    let mut frame = Vec::with_capacity(total_len);

    frame.push(0xA5);
    frame.extend_from_slice(&data_len.to_le_bytes());
    frame.push(seq);
    let crc8 = calc_crc8(&frame[..4]);
    frame.push(crc8);

    frame.extend_from_slice(&0x0301u16.to_le_bytes());
    frame.extend_from_slice(&sub_cmd_id.to_le_bytes());
    frame.extend_from_slice(&sender_id.to_le_bytes());
    frame.extend_from_slice(&receiver_id.to_le_bytes());
    frame.extend_from_slice(content);

    let crc16 = calc_crc16(&frame);
    frame.extend_from_slice(&crc16.to_le_bytes());
    frame
}

/// 2027 协议中拥有选手端的机器人 ID（红方 1,3..6，蓝方 101,103..106）
pub fn has_operator_client_2027(robot_id: u16) -> bool {
    matches!(robot_id, 1 | 3..=6 | 101 | 103..=106)
}

/// 由本机 robot_id 推导选手端 receiver_id
pub fn derive_client_id_2027(robot_id: u16) -> Option<u16> {
    if has_operator_client_2027(robot_id) {
        Some(robot_id + 0x0100)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{MkuiGroup};
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct VectorFixture {
        crc8_vectors: Vec<Crc8Vector>,
        crc16_vectors: Vec<Crc16Vector>,
        figure_vectors: Vec<FigureVector>,
        group_packet_vectors: Vec<GroupPacketVector>,
        full_frame_vectors: Vec<FullFrameVector>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Crc8Vector {
        input_hex: String,
        expected: u8,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Crc16Vector {
        input_hex: String,
        expected: u16,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FigureVector {
        name: String,
        operate: u8,
        graphic: MkuiGraphic,
        expected_hex: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct GroupPacketVector {
        name: String,
        operate: u8,
        frame: MkuiFrame,
        sender_id: u16,
        receiver_id: u16,
        start_seq: u8,
        expected_frames_hex: Vec<String>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FullFrameVector {
        name: String,
        operate: u8,
        sender_id: u16,
        receiver_id: u16,
        seq: u8,
        graphic: MkuiGraphic,
        expected_hex: String,
    }

    fn decode_hex(s: &str) -> Vec<u8> {
        let compact: String = s.split_whitespace().collect();
        hex::decode(compact).expect("valid hex in fixture")
    }

    #[test]
    fn matches_shared_protocol_vectors() {
        let fixture_text = include_str!("../../../../fixtures/protocol-vectors.json");
        let fixture: VectorFixture = serde_json::from_str(fixture_text).unwrap();

        for v in &fixture.crc8_vectors {
            let input = decode_hex(&v.input_hex);
            assert_eq!(calc_crc8(&input), v.expected, "crc8 vector mismatch");
        }

        for v in &fixture.crc16_vectors {
            let input = decode_hex(&v.input_hex);
            assert_eq!(calc_crc16(&input), v.expected, "crc16 vector mismatch");
        }

        for v in &fixture.figure_vectors {
            let actual = encode_figure(&v.graphic, v.operate);
            let expected = decode_hex(&v.expected_hex);
            assert_eq!(
                actual.as_slice(),
                expected.as_slice(),
                "figure vector '{}' mismatch",
                v.name
            );
        }

        for v in &fixture.group_packet_vectors {
            let packed = pack_frame_by_group(&v.frame, v.operate, false, TextEncoding::Utf8);
            assert_eq!(
                packed.len(),
                v.expected_frames_hex.len(),
                "group packet count mismatch for '{}'",
                v.name
            );
            for (idx, p) in packed.iter().enumerate() {
                let seq = v.start_seq.wrapping_add(idx as u8);
                let frame_bytes =
                    build_referee_frame(p.sub_cmd_id, v.sender_id, v.receiver_id, seq, &p.content);
                let expected = decode_hex(&v.expected_frames_hex[idx]);
                assert_eq!(
                    frame_bytes, expected,
                    "group packet '{}' index {} mismatch",
                    v.name, idx
                );
            }
        }

        for v in &fixture.full_frame_vectors {
            let (sub_cmd, content) = match &v.graphic {
                MkuiGraphic::Text { text, .. } => {
                    let mut c = vec![0u8; 45];
                    c[..15].copy_from_slice(&encode_figure(&v.graphic, v.operate));
                    let (tbytes, _) = encode_text_bytes(text, TextEncoding::Utf8);
                    c[15..45].copy_from_slice(&tbytes);
                    (0x0110u16, c)
                }
                _ => (0x0101u16, encode_figure(&v.graphic, v.operate).to_vec()),
            };
            let actual = build_referee_frame(sub_cmd, v.sender_id, v.receiver_id, v.seq, &content);
            let expected = decode_hex(&v.expected_hex);
            assert_eq!(
                actual, expected,
                "full frame vector '{}' mismatch",
                v.name
            );
        }
    }

    #[test]
    fn client_id_mapping_follows_2027_rules() {
        assert_eq!(derive_client_id_2027(1), Some(0x0101));
        assert_eq!(derive_client_id_2027(3), Some(0x0103));
        assert_eq!(derive_client_id_2027(106), Some(0x016A));
        assert_eq!(derive_client_id_2027(2), None);
        assert_eq!(derive_client_id_2027(7), None);
        assert_eq!(derive_client_id_2027(107), None);

        let dummy_frame = MkuiFrame {
            id: "f".into(),
            name: "F".into(),
            groups: vec![MkuiGroup {
                id: "g".into(),
                name: "G".into(),
                visible: true,
                locked: false,
                collapsed: false,
            }],
            graphics: vec![],
        };
        assert!(pack_frame_by_group(&dummy_frame, 1, false, TextEncoding::Utf8).is_empty());
    }
}
