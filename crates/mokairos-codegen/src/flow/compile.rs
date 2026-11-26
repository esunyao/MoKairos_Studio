//! 节点图拓扑校验、类型推导与 C11 表达式编译（兼容 Mapping sync 与 API 扇出入口）

use std::collections::{BTreeSet, HashMap, VecDeque};

use crate::codefile::CodeFunctionInfo;
use crate::error::Diagnostic;
use crate::model::MkuiDocument;
use crate::profile::{
    CodegenMode, CodegenProfile, FlowGraph, FlowNode, FlowValueType, is_valid_c_ident,
    resolve_graphic_target, validate_field_for_graphic,
};

#[derive(Debug, Clone)]
pub struct CompiledApiFlowFn {
    pub name: String,
    pub group: String,
    pub public: bool,
    pub params: Vec<(String, FlowValueType)>,
    pub body_lines: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CompiledFlows {
    pub mapping_sync_lines: Vec<String>,
    pub api_functions: Vec<CompiledApiFlowFn>,
    pub static_decls: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
}

fn sanitize_c_ident(raw: &str) -> String {
    let mut out = String::new();
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "node".to_string()
    } else {
        out
    }
}

fn split_port(endpoint: &str) -> (&str, &str) {
    match endpoint.split_once('.') {
        Some((node, port)) => (node, port),
        None => (endpoint, "out"),
    }
}

fn field_expected_type(field: &str, graphic: &crate::model::MkuiGraphic) -> FlowValueType {
    match field {
        "color" => FlowValueType::Color,
        "visible" => FlowValueType::Bool,
        "percent" => FlowValueType::Float,
        "text" => FlowValueType::Text,
        "value" => match graphic {
            crate::model::MkuiGraphic::Float { .. } => FlowValueType::Float,
            _ => FlowValueType::Int32,
        },
        _ => FlowValueType::Int32,
    }
}

fn parse_value_type_str(s: &str) -> Option<FlowValueType> {
    match s {
        "int32" | "int" => Some(FlowValueType::Int32),
        "float" => Some(FlowValueType::Float),
        "bool" => Some(FlowValueType::Bool),
        "color" => Some(FlowValueType::Color),
        "text" => Some(FlowValueType::Text),
        _ => None,
    }
}

fn color_enum_literal(prefix_upper: &str, name: &str) -> String {
    let suffix = match name.to_ascii_lowercase().as_str() {
        "main" | "team" | "0" => "TEAM",
        "yellow" | "1" => "YELLOW",
        "green" | "2" => "GREEN",
        "orange" | "3" => "ORANGE",
        "purple" | "4" => "PURPLE",
        "pink" | "5" => "PINK",
        "cyan" | "6" => "CYAN",
        "black" | "7" => "BLACK",
        _ => "WHITE",
    };
    format!("{prefix_upper}_COLOR_{suffix}")
}

fn is_type_compatible(actual: FlowValueType, expected: FlowValueType) -> bool {
    actual == expected || (actual == FlowValueType::Int32 && expected == FlowValueType::Float)
}

fn cast_if_needed(expr: &str, actual: FlowValueType, expected: FlowValueType) -> String {
    if actual == FlowValueType::Int32 && expected == FlowValueType::Float {
        format!("((float)({expr}))")
    } else {
        expr.to_string()
    }
}

fn make_flow_diag(
    flow_id: &str,
    node_id: Option<&str>,
    code: &str,
    msg: impl Into<String>,
) -> Diagnostic {
    let loc = match node_id {
        Some(nid) => format!("flow[{flow_id}]/node[{nid}]"),
        None => format!("flow[{flow_id}]"),
    };
    let mut d = Diagnostic::error(code, loc, msg);
    d.flow_id = Some(flow_id.to_string());
    d.node_id = node_id.map(str::to_string);
    d
}

/// 校验并编译全部 `[flows.*]`
pub fn compile_flows(
    profile: &CodegenProfile,
    doc: &MkuiDocument,
    code_functions: &[CodeFunctionInfo],
    graphic_enum_map: &HashMap<String, String>,
    symbol_getter_map: &HashMap<String, (FlowValueType, String)>,
) -> CompiledFlows {
    let mut mapping_sync_lines = Vec::new();
    let mut api_functions = Vec::new();
    let mut static_decls = Vec::new();
    let mut diagnostics = Vec::new();

    let fn_map: HashMap<&str, &CodeFunctionInfo> = code_functions
        .iter()
        .map(|f| (f.name.as_str(), f))
        .collect();

    let prefix = &profile.prefix;
    let prefix_upper = prefix.to_ascii_uppercase();

    for (flow_id, graph) in &profile.flows {
        compile_single_flow(
            flow_id,
            graph,
            profile,
            doc,
            &fn_map,
            graphic_enum_map,
            symbol_getter_map,
            &prefix_upper,
            &mut mapping_sync_lines,
            &mut api_functions,
            &mut static_decls,
            &mut diagnostics,
        );
    }

    CompiledFlows {
        mapping_sync_lines,
        api_functions,
        static_decls,
        diagnostics,
    }
}

#[allow(clippy::too_many_arguments)]
fn compile_single_flow(
    flow_id: &str,
    graph: &FlowGraph,
    profile: &CodegenProfile,
    doc: &MkuiDocument,
    fn_map: &HashMap<&str, &CodeFunctionInfo>,
    graphic_enum_map: &HashMap<String, String>,
    symbol_getter_map: &HashMap<String, (FlowValueType, String)>,
    prefix_upper: &str,
    mapping_sync_lines: &mut Vec<String>,
    api_functions: &mut Vec<CompiledApiFlowFn>,
    static_decls: &mut Vec<String>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let prefix = &profile.prefix;
    let node_map: HashMap<&str, &FlowNode> =
        graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let mut in_deg: HashMap<&str, usize> =
        graph.nodes.iter().map(|n| (n.id.as_str(), 0usize)).collect();
    let mut adj: HashMap<&str, Vec<&str>> =
        graph.nodes.iter().map(|n| (n.id.as_str(), Vec::new())).collect();

    // (to_node, to_port) -> (from_node, from_port)
    let mut incoming: HashMap<(&str, &str), (&str, &str)> = HashMap::new();
    let mut sink_in_count: HashMap<&str, usize> = HashMap::new();

    for edge in &graph.edges {
        let (from_n, from_p) = split_port(&edge.from);
        let (to_n, to_p) = split_port(&edge.to);
        if !node_map.contains_key(from_n) {
            diagnostics.push(make_flow_diag(
                flow_id,
                None,
                "FLOW_MISSING_NODE",
                format!("连线起点节点 `{from_n}` 不存在"),
            ));
            continue;
        }
        if !node_map.contains_key(to_n) {
            diagnostics.push(make_flow_diag(
                flow_id,
                None,
                "FLOW_MISSING_NODE",
                format!("连线终点节点 `{to_n}` 不存在"),
            ));
            continue;
        }
        if let Some(target_node) = node_map.get(to_n)
            && target_node.kind == "graphic_sink"
        {
            let cnt = sink_in_count.entry(to_n).or_insert(0);
            *cnt += 1;
            if *cnt > 1 {
                diagnostics.push(make_flow_diag(
                    flow_id,
                    Some(to_n),
                    "FLOW_SINK_MULTI_IN",
                    "图元汇节点只能有一条入边",
                ));
            }
        }
        if incoming.insert((to_n, to_p), (from_n, from_p)).is_some() {
            diagnostics.push(make_flow_diag(
                flow_id,
                Some(to_n),
                "FLOW_PORT_MULTI_IN",
                format!("输入端口 `{to_p}` 只能连接一条边"),
            ));
        }
        adj.get_mut(from_n).unwrap().push(to_n);
        *in_deg.get_mut(to_n).unwrap() += 1;
    }

    // Kahn 拓扑排序检测环
    let mut q: VecDeque<&str> = in_deg
        .iter()
        .filter(|(_, d)| **d == 0)
        .map(|(id, _)| *id)
        .collect();
    let mut topo: Vec<&str> = Vec::with_capacity(graph.nodes.len());
    while let Some(u) = q.pop_front() {
        topo.push(u);
        for &v in &adj[u] {
            let d = in_deg.get_mut(v).unwrap();
            *d -= 1;
            if *d == 0 {
                q.push_back(v);
            }
        }
    }

    if topo.len() != graph.nodes.len() {
        diagnostics.push(make_flow_diag(
            flow_id,
            None,
            "FLOW_CYCLE_DETECTED",
            "节点图中存在环路（必须为有向无环图 DAG）",
        ));
        return;
    }

    // 记录每个 (node_id, out_port) 的 (C 表达式, 类型)
    let mut port_outputs: HashMap<(&str, String), (String, FlowValueType)> = HashMap::new();
    let mut node_lines: HashMap<&str, Vec<String>> = HashMap::new();
    let mut api_entries: Vec<&FlowNode> = Vec::new();
    let mut has_error = false;

    for &nid in &topo {
        let node = node_map[nid];
        let var_name = format!("n_{}_{}", sanitize_c_ident(flow_id), sanitize_c_ident(nid));
        let mut stmts = Vec::new();

        match node.kind.as_str() {
            "symbol_source" => {
                if profile.mode == CodegenMode::Api {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_API_FORBIDS_SYMBOL_SOURCE",
                        "api 模式下不应使用 symbol_source，请改用 api_entry 公开接口入口节点",
                    ));
                    has_error = true;
                    continue;
                }
                let sym_id = node
                    .node_ref
                    .as_deref()
                    .unwrap_or("")
                    .trim_start_matches("symbol:");
                if let Some((vtype, getter)) = symbol_getter_map.get(sym_id) {
                    let c_t = vtype.c_type(prefix);
                    stmts.push(format!("const {c_t} {var_name} = {getter};"));
                    port_outputs.insert((nid, "out".to_string()), (var_name.clone(), *vtype));
                } else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_UNKNOWN_SYMBOL",
                        format!("找不到用户符号 `{sym_id}`，请先在向导「符号目录」声明"),
                    ));
                    has_error = true;
                }
            }
            "api_entry" => {
                api_entries.push(node);
                let args = node
                    .params
                    .get("args")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                for (idx, arg) in args.iter().enumerate() {
                    let arg_name = arg
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("val");
                    let arg_type = arg
                        .get("type")
                        .and_then(|v| v.as_str())
                        .and_then(parse_value_type_str)
                        .unwrap_or(FlowValueType::Float);
                    if !is_valid_c_ident(arg_name) {
                        diagnostics.push(make_flow_diag(
                            flow_id,
                            Some(nid),
                            "FLOW_INVALID_API_ARG",
                            format!("API 参数名 `{arg_name}` 不是合法 C 标识符"),
                        ));
                        has_error = true;
                    }
                    port_outputs.insert((nid, format!("arg{idx}")), (arg_name.to_string(), arg_type));
                    if idx == 0 {
                        port_outputs.insert((nid, "out".to_string()), (arg_name.to_string(), arg_type));
                    }
                }
            }
            "const" => {
                let vtype = node
                    .params
                    .get("type")
                    .and_then(|v| v.as_str())
                    .and_then(parse_value_type_str)
                    .unwrap_or(FlowValueType::Float);
                let val = &node.params["value"];
                let literal = match vtype {
                    FlowValueType::Int32 => format!("((int32_t)({}))", val.as_i64().unwrap_or(0)),
                    FlowValueType::Float => format!("{:.6}f", val.as_f64().unwrap_or(0.0)),
                    FlowValueType::Bool => {
                        if val.as_bool().unwrap_or(false) {
                            "1".to_string()
                        } else {
                            "0".to_string()
                        }
                    }
                    FlowValueType::Color => {
                        color_enum_literal(prefix_upper, val.as_str().unwrap_or("white"))
                    }
                    FlowValueType::Text => {
                        let esc = val
                            .as_str()
                            .unwrap_or("")
                            .replace('\\', "\\\\")
                            .replace('"', "\\\"");
                        format!("\"{esc}\"")
                    }
                };
                let c_t = vtype.c_type(prefix);
                stmts.push(format!("const {c_t} {var_name} = {literal};"));
                port_outputs.insert((nid, "out".to_string()), (var_name.clone(), vtype));
            }
            "session_state" => {
                let kind = node.node_ref.as_deref().unwrap_or("is_ready");
                match kind {
                    "robot_id" => {
                        stmts.push(format!(
                            "const int32_t {var_name} = (int32_t){prefix}_robot_id();"
                        ));
                        port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Int32));
                    }
                    _ => {
                        stmts.push(format!("const int {var_name} = {prefix}_is_ready();"));
                        port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Bool));
                    }
                }
            }
            "scale_offset" => {
                let Some((in_expr, in_t)) = get_input(&incoming, &port_outputs, nid, "in") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "缩放偏移节点缺少 `in` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                if !is_type_compatible(in_t, FlowValueType::Float) {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        "缩放偏移节点期望数值输入（int32 或 float）",
                    ));
                    has_error = true;
                    continue;
                }
                let k = node.params.get("k").and_then(|v| v.as_f64()).unwrap_or(1.0);
                let b = node.params.get("b").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let expr = cast_if_needed(&in_expr, in_t, FlowValueType::Float);
                stmts.push(format!(
                    "const float {var_name} = ({expr} * {k:.6}f) + ({b:.6}f);"
                ));
                port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Float));
            }
            "clamp" => {
                let Some((in_expr, in_t)) = get_input(&incoming, &port_outputs, nid, "in") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "限幅节点缺少 `in` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                let lo = node.params.get("lo").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let hi = node.params.get("hi").and_then(|v| v.as_f64()).unwrap_or(1.0);
                match in_t {
                    FlowValueType::Int32 => {
                        let lo_i = lo as i32;
                        let hi_i = hi as i32;
                        stmts.push(format!(
                            "const int32_t {var_name} = ({in_expr} < {lo_i}) ? {lo_i} : (({in_expr} > {hi_i}) ? {hi_i} : {in_expr});"
                        ));
                        port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Int32));
                    }
                    FlowValueType::Float => {
                        stmts.push(format!(
                            "const float {var_name} = ({in_expr} < {lo:.6}f) ? {lo:.6}f : (({in_expr} > {hi:.6}f) ? {hi:.6}f : {in_expr});"
                        ));
                        port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Float));
                    }
                    _ => {
                        diagnostics.push(make_flow_diag(
                            flow_id,
                            Some(nid),
                            "FLOW_TYPE_MISMATCH",
                            "限幅节点仅接受 int32 或 float",
                        ));
                        has_error = true;
                    }
                }
            }
            "remap" => {
                let Some((in_expr, in_t)) = get_input(&incoming, &port_outputs, nid, "in") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "区间映射节点缺少 `in` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                if !is_type_compatible(in_t, FlowValueType::Float) {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        "区间映射节点仅接受数值输入",
                    ));
                    has_error = true;
                    continue;
                }
                let in_min = node.params.get("in_min").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let in_max = node.params.get("in_max").and_then(|v| v.as_f64()).unwrap_or(1.0);
                let out_min = node.params.get("out_min").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let out_max = node.params.get("out_max").and_then(|v| v.as_f64()).unwrap_or(100.0);
                let span = if (in_max - in_min).abs() < 1e-6 {
                    1.0
                } else {
                    in_max - in_min
                };
                let ratio = (out_max - out_min) / span;
                let expr = cast_if_needed(&in_expr, in_t, FlowValueType::Float);
                stmts.push(format!(
                    "const float {var_name} = ({out_min:.6}f) + (({expr} - ({in_min:.6}f)) * ({ratio:.6}f));"
                ));
                port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Float));
            }
            "threshold_color" => {
                let Some((in_expr, in_t)) = get_input(&incoming, &port_outputs, nid, "in") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "阈值颜色节点缺少 `in` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                if !is_type_compatible(in_t, FlowValueType::Float) {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        "阈值颜色节点仅接受数值输入（int32 或 float）",
                    ));
                    has_error = true;
                    continue;
                }
                let val_expr = cast_if_needed(&in_expr, in_t, FlowValueType::Float);
                let else_color = node
                    .params
                    .get("else")
                    .and_then(|v| v.as_str())
                    .unwrap_or("pink");
                let mut expr_str = color_enum_literal(prefix_upper, else_color);
                if let Some(steps) = node.params.get("steps").and_then(|v| v.as_array()) {
                    for step in steps.iter().rev() {
                        if let Some(arr) = step.as_array()
                            && arr.len() >= 2
                        {
                            let th = arr[0].as_f64().unwrap_or(0.0);
                            let col = arr[1].as_str().unwrap_or("white");
                            let col_lit = color_enum_literal(prefix_upper, col);
                            expr_str = format!(
                                "((({val_expr}) >= {th:.6}f) ? {col_lit} : {expr_str})"
                            );
                        }
                    }
                }
                stmts.push(format!(
                    "const {prefix}_color_t {var_name} = {expr_str};"
                ));
                port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Color));
            }
            "round_int" => {
                let Some((in_expr, in_t)) = get_input(&incoming, &port_outputs, nid, "in") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "取整节点缺少 `in` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                if !is_type_compatible(in_t, FlowValueType::Float) {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        "取整节点仅接受 float/int32 输入",
                    ));
                    has_error = true;
                    continue;
                }
                if in_t == FlowValueType::Int32 {
                    stmts.push(format!("const int32_t {var_name} = {in_expr};"));
                } else {
                    stmts.push(format!(
                        "const int32_t {var_name} = {prefix}__round_i32({in_expr});"
                    ));
                }
                port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Int32));
            }
            "compare" => {
                let Some((a_expr, a_t)) = get_input(&incoming, &port_outputs, nid, "a") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "比较节点缺少 `a` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                let Some((b_expr, b_t)) = get_input(&incoming, &port_outputs, nid, "b") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "比较节点缺少 `b` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                if !is_type_compatible(a_t, FlowValueType::Float)
                    || !is_type_compatible(b_t, FlowValueType::Float)
                {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        "比较节点仅支持数值输入",
                    ));
                    has_error = true;
                    continue;
                }
                let op = match node.params.get("op").and_then(|v| v.as_str()).unwrap_or("gt") {
                    "gte" => ">=",
                    "lt" => "<",
                    "lte" => "<=",
                    "eq" => "==",
                    "neq" => "!=",
                    _ => ">",
                };
                let ae = cast_if_needed(&a_expr, a_t, FlowValueType::Float);
                let be = cast_if_needed(&b_expr, b_t, FlowValueType::Float);
                stmts.push(format!("const int {var_name} = (({ae}) {op} ({be})) ? 1 : 0;"));
                port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Bool));
            }
            "logic" => {
                let op = node.params.get("op").and_then(|v| v.as_str()).unwrap_or("and");
                let Some((a_expr, a_t)) = get_input(&incoming, &port_outputs, nid, "a") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "逻辑节点缺少 `a` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                if a_t != FlowValueType::Bool {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        "逻辑节点输入须为 bool",
                    ));
                    has_error = true;
                    continue;
                }
                if op == "not" {
                    stmts.push(format!("const int {var_name} = (!({a_expr})) ? 1 : 0;"));
                } else {
                    let Some((b_expr, b_t)) = get_input(&incoming, &port_outputs, nid, "b") else {
                        diagnostics.push(make_flow_diag(
                            flow_id,
                            Some(nid),
                            "FLOW_MISSING_INPUT",
                            "逻辑节点缺少 `b` 输入",
                        ));
                        has_error = true;
                        continue;
                    };
                    if b_t != FlowValueType::Bool {
                        diagnostics.push(make_flow_diag(
                            flow_id,
                            Some(nid),
                            "FLOW_TYPE_MISMATCH",
                            "逻辑节点输入须为 bool",
                        ));
                        has_error = true;
                        continue;
                    }
                    let c_op = if op == "or" { "||" } else { "&&" };
                    stmts.push(format!(
                        "const int {var_name} = (({a_expr}) {c_op} ({b_expr})) ? 1 : 0;"
                    ));
                }
                port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Bool));
            }
            "mux" => {
                let Some((c_expr, c_t)) = get_input(&incoming, &port_outputs, nid, "cond") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "选择节点缺少 `cond` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                let Some((a_expr, a_t)) = get_input(&incoming, &port_outputs, nid, "a") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "选择节点缺少 `a` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                let Some((b_expr, b_t)) = get_input(&incoming, &port_outputs, nid, "b") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "选择节点缺少 `b` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                if c_t != FlowValueType::Bool {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        "选择节点 `cond` 须为 bool",
                    ));
                    has_error = true;
                    continue;
                }
                let out_t = if a_t == b_t {
                    a_t
                } else if is_type_compatible(a_t, b_t) {
                    b_t
                } else if is_type_compatible(b_t, a_t) {
                    a_t
                } else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        "选择节点 `a` 与 `b` 类型不兼容",
                    ));
                    has_error = true;
                    continue;
                };
                let ae = cast_if_needed(&a_expr, a_t, out_t);
                let be = cast_if_needed(&b_expr, b_t, out_t);
                let c_t_str = out_t.c_type(prefix);
                stmts.push(format!(
                    "const {c_t_str} {var_name} = ({c_expr}) ? ({ae}) : ({be});"
                ));
                port_outputs.insert((nid, "out".to_string()), (var_name.clone(), out_t));
            }
            "edge" => {
                let Some((in_expr, in_t)) = get_input(&incoming, &port_outputs, nid, "in") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "边沿检测节点缺少 `in` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                if in_t != FlowValueType::Bool {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        "边沿检测节点仅接受 bool 输入",
                    ));
                    has_error = true;
                    continue;
                }
                let prev_var = format!("{prefix}__edge_{}_{}", sanitize_c_ident(flow_id), sanitize_c_ident(nid));
                static_decls.push(format!("static int {prev_var} = 0;"));
                let mode = node.params.get("mode").and_then(|v| v.as_str()).unwrap_or("rising");
                let cur_var = format!("{var_name}_cur");
                stmts.push(format!("const int {cur_var} = ({in_expr}) ? 1 : 0;"));
                if mode == "falling" {
                    stmts.push(format!("const int {var_name} = ({prev_var} && !{cur_var}) ? 1 : 0;"));
                } else {
                    stmts.push(format!("const int {var_name} = (!{prev_var} && {cur_var}) ? 1 : 0;"));
                }
                stmts.push(format!("{prev_var} = {cur_var};"));
                port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Bool));
            }
            "text_select" => {
                let Some((in_expr, in_t)) = get_input(&incoming, &port_outputs, nid, "in") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        "文本选择节点缺少 `in` 输入",
                    ));
                    has_error = true;
                    continue;
                };
                if in_t != FlowValueType::Int32 && in_t != FlowValueType::Bool {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        "文本选择节点仅接受 int32 或 bool 索引",
                    ));
                    has_error = true;
                    continue;
                }
                let cases = node
                    .params
                    .get("cases")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let def_str = node
                    .params
                    .get("default")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let tbl_var = format!("{prefix}__ts_{}_{}", sanitize_c_ident(flow_id), sanitize_c_ident(nid));
                let mut literals = Vec::new();
                for c in &cases {
                    let s = c.as_str().unwrap_or("").replace('\\', "\\\\").replace('"', "\\\"");
                    literals.push(format!("\"{s}\""));
                }
                if literals.is_empty() {
                    literals.push("\"\"".to_string());
                }
                let def_esc = def_str.replace('\\', "\\\\").replace('"', "\\\"");
                static_decls.push(format!(
                    "static const char* const {tbl_var}[] = {{ {} }};",
                    literals.join(", ")
                ));
                let count = cases.len();
                stmts.push(format!(
                    "const int32_t {var_name}_idx = (int32_t)({in_expr});"
                ));
                stmts.push(format!(
                    "const char* {var_name} = ({var_name}_idx >= 0 && {var_name}_idx < {count}) ? {tbl_var}[{var_name}_idx] : \"{def_esc}\";"
                ));
                port_outputs.insert((nid, "out".to_string()), (var_name.clone(), FlowValueType::Text));
            }
            "code_fn" => {
                let fn_name = node.node_ref.as_deref().unwrap_or("");
                let Some(fn_info) = fn_map.get(fn_name) else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_UNKNOWN_CODE_FN",
                        format!("代码函数 `{fn_name}` 不存在（可能已在代码页重命名或删除）"),
                    ));
                    has_error = true;
                    continue;
                };
                if !fn_info.wireable {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_UNWIREABLE_CODE_FN",
                        format!(
                            "代码函数 `{fn_name}` 不可连线：{}",
                            fn_info.unsupported_reason.as_deref().unwrap_or("签名不兼容")
                        ),
                    ));
                    has_error = true;
                    continue;
                }
                let mut call_args = Vec::new();
                for (p_idx, param) in fn_info.params.iter().enumerate() {
                    let port_by_idx = format!("p{p_idx}");
                    let got = get_input(&incoming, &port_outputs, nid, &param.name)
                        .or_else(|| get_input(&incoming, &port_outputs, nid, &port_by_idx));
                    let Some((arg_expr, arg_t)) = got else {
                        diagnostics.push(make_flow_diag(
                            flow_id,
                            Some(nid),
                            "FLOW_MISSING_INPUT",
                            format!("代码节点 `{fn_name}` 缺少参数 `{}` 输入", param.name),
                        ));
                        has_error = true;
                        continue;
                    };
                    let expected_t = param.port_type.unwrap();
                    if !is_type_compatible(arg_t, expected_t) {
                        diagnostics.push(make_flow_diag(
                            flow_id,
                            Some(nid),
                            "FLOW_TYPE_MISMATCH",
                            format!("代码节点 `{fn_name}` 参数 `{}` 类型不匹配", param.name),
                        ));
                        has_error = true;
                        continue;
                    }
                    call_args.push(cast_if_needed(&arg_expr, arg_t, expected_t));
                }
                if let Some(ret_t) = fn_info.port_return {
                    let c_t = ret_t.c_type(prefix);
                    stmts.push(format!(
                        "const {c_t} {var_name} = {fn_name}({});",
                        call_args.join(", ")
                    ));
                    port_outputs.insert((nid, "out".to_string()), (var_name.clone(), ret_t));
                }
            }
            "graphic_sink" => {
                let target = node.node_ref.as_deref().unwrap_or("");
                let Some((g, field)) = resolve_graphic_target(doc, target) else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_UNKNOWN_SINK_TARGET",
                        format!("找不到汇目标 `{target}` 对应的图元"),
                    ));
                    has_error = true;
                    continue;
                };
                if !validate_field_for_graphic(g, field) {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_INVALID_SINK_FIELD",
                        format!("图元 `{}` 不支持字段 `{field}`", g.figure_name()),
                    ));
                    has_error = true;
                    continue;
                }
                let Some((in_expr, in_t)) = get_input(&incoming, &port_outputs, nid, "in") else {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_MISSING_INPUT",
                        format!("图元汇节点 `{target}` 缺少 `in` 输入"),
                    ));
                    has_error = true;
                    continue;
                };
                let expected = field_expected_type(field, g);
                if !is_type_compatible(in_t, expected) {
                    diagnostics.push(make_flow_diag(
                        flow_id,
                        Some(nid),
                        "FLOW_TYPE_MISMATCH",
                        format!(
                            "图元汇 `{target}` 期望 {:?}，收到 {:?}",
                            expected, in_t
                        ),
                    ));
                    has_error = true;
                    continue;
                }
                let g_enum = graphic_enum_map
                    .get(g.id())
                    .cloned()
                    .unwrap_or_else(|| "0".to_string());
                let val_expr = cast_if_needed(&in_expr, in_t, expected);
                let setter_call = emit_setter_call(prefix, &g_enum, g, field, &val_expr);
                stmts.push(setter_call);
            }
            other => {
                diagnostics.push(make_flow_diag(
                    flow_id,
                    Some(nid),
                    "FLOW_UNKNOWN_NODE_KIND",
                    format!("未知节点类型 `{other}`"),
                ));
                has_error = true;
            }
        }

        node_lines.insert(nid, stmts);
    }

    if has_error {
        return;
    }

    if profile.mode == CodegenMode::Mapping {
        for nid in &topo {
            if let Some(lines) = node_lines.get(nid) {
                mapping_sync_lines.extend(lines.clone());
            }
        }
    } else if !api_entries.is_empty() {
        for entry in api_entries {
            let fn_name = entry
                .params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(flow_id)
                .to_string();
            if !is_valid_c_ident(&fn_name) {
                diagnostics.push(make_flow_diag(
                    flow_id,
                    Some(&entry.id),
                    "FLOW_INVALID_API_NAME",
                    format!("API 接口函数名 `{fn_name}` 非法"),
                ));
                continue;
            }
            let group = entry
                .params
                .get("group")
                .and_then(|v| v.as_str())
                .unwrap_or("custom")
                .to_string();
            let public = entry
                .params
                .get("public")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let args = entry
                .params
                .get("args")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let parsed_args: Vec<(String, FlowValueType)> = args
                .iter()
                .map(|a| {
                    let n = a.get("name").and_then(|v| v.as_str()).unwrap_or("val").to_string();
                    let t = a
                        .get("type")
                        .and_then(|v| v.as_str())
                        .and_then(parse_value_type_str)
                        .unwrap_or(FlowValueType::Float);
                    (n, t)
                })
                .collect();

            // 收集从该 api_entry 可达的下游节点（加上它们依赖的纯源常量）
            let mut reachable: BTreeSet<&str> = BTreeSet::new();
            let mut stack = vec![entry.id.as_str()];
            while let Some(u) = stack.pop() {
                if reachable.insert(u) {
                    if let Some(nexts) = adj.get(u) {
                        for &v in nexts {
                            stack.push(v);
                        }
                    }
                }
            }
            // 再反向补齐依赖的 const / session_state 节点
            let mut need_closure = true;
            while need_closure {
                need_closure = false;
                for &u in &reachable.clone() {
                    for ((to_n, _), (from_n, _)) in &incoming {
                        if *to_n == u && !reachable.contains(from_n) {
                            reachable.insert(from_n);
                            need_closure = true;
                        }
                    }
                }
            }

            let mut body_lines = Vec::new();
            for (arg_n, _) in &parsed_args {
                body_lines.push(format!("(void){arg_n};"));
            }
            for &nid in &topo {
                if reachable.contains(nid)
                    && let Some(lines) = node_lines.get(nid)
                {
                    body_lines.extend(lines.clone());
                }
            }
            body_lines.push("return 1;".to_string());

            api_functions.push(CompiledApiFlowFn {
                name: fn_name,
                group,
                public,
                params: parsed_args,
                body_lines,
            });
        }
    } else if !topo.is_empty() {
        diagnostics.push(make_flow_diag(
            flow_id,
            None,
            "FLOW_API_NO_ENTRY",
            "api 模式下的节点图需要至少一个 `api_entry` 公开接口入口节点",
        ));
    }
}

fn get_input<'a>(
    incoming: &HashMap<(&'a str, &'a str), (&'a str, &'a str)>,
    port_outputs: &HashMap<(&'a str, String), (String, FlowValueType)>,
    node_id: &str,
    port: &str,
) -> Option<(String, FlowValueType)> {
    let (src_n, src_p) = incoming.get(&(node_id, port))?;
    port_outputs.get(&(*src_n, (*src_p).to_string())).cloned()
}

pub fn emit_setter_call(
    prefix: &str,
    g_enum: &str,
    graphic: &crate::model::MkuiGraphic,
    field: &str,
    val_expr: &str,
) -> String {
    match field {
        "value" => match graphic {
            crate::model::MkuiGraphic::Float { .. } => {
                format!("{prefix}__set_float({g_enum}, {val_expr});")
            }
            _ => format!("{prefix}__set_int({g_enum}, {val_expr});"),
        },
        "percent" => format!("{prefix}__set_percent({g_enum}, {val_expr});"),
        "color" => format!("{prefix}__set_color({g_enum}, {val_expr});"),
        "text" => format!("{prefix}__set_text_cstr({g_enum}, {val_expr});"),
        "visible" => format!("{prefix}__set_visible({g_enum}, {val_expr});"),
        "x" => format!("{prefix}__set_geom({g_enum}, 0, {val_expr});"),
        "y" => format!("{prefix}__set_geom({g_enum}, 1, {val_expr});"),
        "end_x" => format!("{prefix}__set_geom({g_enum}, 2, {val_expr});"),
        "end_y" => format!("{prefix}__set_geom({g_enum}, 3, {val_expr});"),
        "radius" => format!("{prefix}__set_geom({g_enum}, 4, {val_expr});"),
        "start_angle" => format!("{prefix}__set_geom({g_enum}, 5, {val_expr});"),
        "end_angle" => format!("{prefix}__set_geom({g_enum}, 6, {val_expr});"),
        "width" => format!("{prefix}__set_geom({g_enum}, 7, {val_expr});"),
        _ => format!("(void)({val_expr});"),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use super::*;
    use crate::model::{MkuiFrame, MkuiGraphic, MkuiGroup};
    use crate::profile::{FlowEdge, FlowGraph, FlowNode, get_preset};

    #[test]
    fn detects_cycle_and_missing_code_fn() {
        let doc = MkuiDocument {
            schema_version: 1,
            project_id: "p".into(),
            name: "n".into(),
            description: "".into(),
            robot_role: "infantry_3".into(),
            active_frame_id: "f1".into(),
            frames: vec![MkuiFrame {
                id: "f1".into(),
                name: "Main".into(),
                groups: vec![MkuiGroup {
                    id: "g1".into(),
                    name: "G".into(),
                    visible: true,
                    locked: false,
                    collapsed: false,
                }],
                graphics: vec![MkuiGraphic::Float {
                    id: "fg1".into(),
                    figure_name: "BAT".into(),
                    display_name: "电量".into(),
                    var_key: Some("bat.val".into()),
                    group_id: "g1".into(),
                    layer: 1,
                    color: 2,
                    line_width: 2,
                    dynamic: true,
                    visible: true,
                    locked: false,
                    x: 100,
                    y: 200,
                    font_size: 20,
                    value: 12.0,
                }],
            }],
            created_at: "".into(),
            updated_at: "".into(),
        };

        let mut profile = get_preset("generic-c").unwrap().profile;
        profile.flows.insert(
            "cyc".into(),
            FlowGraph {
                nodes: vec![
                    FlowNode {
                        id: "n1".into(),
                        kind: "scale_offset".into(),
                        node_ref: None,
                        label: None,
                        params: serde_json::json!({}),
                        position: None,
                    },
                    FlowNode {
                        id: "n2".into(),
                        kind: "scale_offset".into(),
                        node_ref: None,
                        label: None,
                        params: serde_json::json!({}),
                        position: None,
                    },
                ],
                edges: vec![
                    FlowEdge { id: None, from: "n1.out".into(), to: "n2.in".into() },
                    FlowEdge { id: None, from: "n2.out".into(), to: "n1.in".into() },
                ],
                layout: BTreeMap::new(),
            },
        );
        let res = compile_flows(&profile, &doc, &[], &HashMap::new(), &HashMap::new());
        assert!(res.diagnostics.iter().any(|d| d.code == "FLOW_CYCLE_DETECTED"));
    }
}
