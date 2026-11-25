//! RoboMaster 2027 协议文档数据模型（RM 左下角原点整数坐标）

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MkuiDocument {
    pub schema_version: u32,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub robot_role: String,
    pub active_frame_id: String,
    pub frames: Vec<MkuiFrame>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MkuiFrame {
    pub id: String,
    pub name: String,
    pub groups: Vec<MkuiGroup>,
    pub graphics: Vec<MkuiGraphic>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MkuiGroup {
    pub id: String,
    pub name: String,
    pub visible: bool,
    pub locked: bool,
    pub collapsed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MkuiGraphic {
    #[serde(rename_all = "camelCase")]
    Line {
        id: String,
        figure_name: String,
        display_name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        var_key: Option<String>,
        group_id: String,
        layer: u8,
        color: u8,
        line_width: u16,
        dynamic: bool,
        visible: bool,
        locked: bool,
        start_x: i32,
        start_y: i32,
        end_x: i32,
        end_y: i32,
    },
    #[serde(rename_all = "camelCase")]
    Rect {
        id: String,
        figure_name: String,
        display_name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        var_key: Option<String>,
        group_id: String,
        layer: u8,
        color: u8,
        line_width: u16,
        dynamic: bool,
        visible: bool,
        locked: bool,
        start_x: i32,
        start_y: i32,
        end_x: i32,
        end_y: i32,
    },
    #[serde(rename_all = "camelCase")]
    Circle {
        id: String,
        figure_name: String,
        display_name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        var_key: Option<String>,
        group_id: String,
        layer: u8,
        color: u8,
        line_width: u16,
        dynamic: bool,
        visible: bool,
        locked: bool,
        center_x: i32,
        center_y: i32,
        radius: i32,
    },
    #[serde(rename_all = "camelCase")]
    Ellipse {
        id: String,
        figure_name: String,
        display_name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        var_key: Option<String>,
        group_id: String,
        layer: u8,
        color: u8,
        line_width: u16,
        dynamic: bool,
        visible: bool,
        locked: bool,
        center_x: i32,
        center_y: i32,
        rx: i32,
        ry: i32,
    },
    #[serde(rename_all = "camelCase")]
    Arc {
        id: String,
        figure_name: String,
        display_name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        var_key: Option<String>,
        group_id: String,
        layer: u8,
        color: u8,
        line_width: u16,
        dynamic: bool,
        visible: bool,
        locked: bool,
        center_x: i32,
        center_y: i32,
        rx: i32,
        ry: i32,
        start_angle: i32,
        end_angle: i32,
    },
    #[serde(rename_all = "camelCase")]
    Float {
        id: String,
        figure_name: String,
        display_name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        var_key: Option<String>,
        group_id: String,
        layer: u8,
        color: u8,
        line_width: u16,
        dynamic: bool,
        visible: bool,
        locked: bool,
        x: i32,
        y: i32,
        font_size: u16,
        value: f64,
    },
    #[serde(rename_all = "camelCase")]
    Int {
        id: String,
        figure_name: String,
        display_name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        var_key: Option<String>,
        group_id: String,
        layer: u8,
        color: u8,
        line_width: u16,
        dynamic: bool,
        visible: bool,
        locked: bool,
        x: i32,
        y: i32,
        font_size: u16,
        value: i64,
    },
    #[serde(rename_all = "camelCase")]
    Text {
        id: String,
        figure_name: String,
        display_name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        var_key: Option<String>,
        group_id: String,
        layer: u8,
        color: u8,
        line_width: u16,
        dynamic: bool,
        visible: bool,
        locked: bool,
        x: i32,
        y: i32,
        font_size: u16,
        text: String,
    },
}

impl MkuiGraphic {
    pub fn id(&self) -> &str {
        match self {
            Self::Line { id, .. }
            | Self::Rect { id, .. }
            | Self::Circle { id, .. }
            | Self::Ellipse { id, .. }
            | Self::Arc { id, .. }
            | Self::Float { id, .. }
            | Self::Int { id, .. }
            | Self::Text { id, .. } => id,
        }
    }

    pub fn figure_name(&self) -> &str {
        match self {
            Self::Line { figure_name, .. }
            | Self::Rect { figure_name, .. }
            | Self::Circle { figure_name, .. }
            | Self::Ellipse { figure_name, .. }
            | Self::Arc { figure_name, .. }
            | Self::Float { figure_name, .. }
            | Self::Int { figure_name, .. }
            | Self::Text { figure_name, .. } => figure_name,
        }
    }

    pub fn display_name(&self) -> &str {
        match self {
            Self::Line { display_name, .. }
            | Self::Rect { display_name, .. }
            | Self::Circle { display_name, .. }
            | Self::Ellipse { display_name, .. }
            | Self::Arc { display_name, .. }
            | Self::Float { display_name, .. }
            | Self::Int { display_name, .. }
            | Self::Text { display_name, .. } => display_name,
        }
    }

    pub fn layer(&self) -> u8 {
        match self {
            Self::Line { layer, .. }
            | Self::Rect { layer, .. }
            | Self::Circle { layer, .. }
            | Self::Ellipse { layer, .. }
            | Self::Arc { layer, .. }
            | Self::Float { layer, .. }
            | Self::Int { layer, .. }
            | Self::Text { layer, .. } => *layer,
        }
    }

    pub fn color(&self) -> u8 {
        match self {
            Self::Line { color, .. }
            | Self::Rect { color, .. }
            | Self::Circle { color, .. }
            | Self::Ellipse { color, .. }
            | Self::Arc { color, .. }
            | Self::Float { color, .. }
            | Self::Int { color, .. }
            | Self::Text { color, .. } => *color,
        }
    }

    pub fn line_width(&self) -> u16 {
        match self {
            Self::Line { line_width, .. }
            | Self::Rect { line_width, .. }
            | Self::Circle { line_width, .. }
            | Self::Ellipse { line_width, .. }
            | Self::Arc { line_width, .. }
            | Self::Float { line_width, .. }
            | Self::Int { line_width, .. }
            | Self::Text { line_width, .. } => *line_width,
        }
    }

    pub fn is_text(&self) -> bool {
        matches!(self, Self::Text { .. })
    }
}
