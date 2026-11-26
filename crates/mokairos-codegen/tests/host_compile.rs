use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use mokairos_codegen::archive::pack::save_mkui_archive_with_codegen;
use mokairos_codegen::model::{CodegenBundle, MkuiDocument, MkuiFrame, MkuiGraphic, MkuiGroup};
use mokairos_codegen::profile::{
    FlowEdge, FlowGraph, FlowNode, SymbolDecl, SymbolLang, SymbolRef, FlowValueType, get_preset,
};

fn demo_doc() -> MkuiDocument {
    MkuiDocument {
        schema_version: 1,
        project_id: "p_host".into(),
        name: "HostVerify".into(),
        description: "".into(),
        robot_role: "infantry_3".into(),
        active_frame_id: "f_battle".into(),
        frames: vec![
            MkuiFrame {
                id: "f_battle".into(),
                name: "Battle".into(),
                groups: vec![MkuiGroup {
                    id: "g_bat".into(),
                    name: "Battery".into(),
                    visible: true,
                    locked: false,
                    collapsed: false,
                }],
                graphics: vec![
                    MkuiGraphic::Line {
                        id: "bar".into(),
                        figure_name: "BAR".into(),
                        display_name: "电量条".into(),
                        var_key: Some("battery.bar".into()),
                        group_id: "g_bat".into(),
                        layer: 1,
                        color: 2,
                        line_width: 10,
                        dynamic: true,
                        visible: true,
                        locked: false,
                        start_x: 700,
                        start_y: 200,
                        end_x: 1100,
                        end_y: 200,
                    },
                    MkuiGraphic::Float {
                        id: "pct".into(),
                        figure_name: "PCT".into(),
                        display_name: "电压".into(),
                        var_key: Some("battery.pct".into()),
                        group_id: "g_bat".into(),
                        layer: 1,
                        color: 8,
                        line_width: 2,
                        dynamic: true,
                        visible: true,
                        locked: false,
                        x: 700,
                        y: 250,
                        font_size: 20,
                        value: 24.0,
                    },
                    MkuiGraphic::Text {
                        id: "lbl".into(),
                        figure_name: "LBL".into(),
                        display_name: "标签".into(),
                        var_key: Some("battery.label".into()),
                        group_id: "g_bat".into(),
                        layer: 1,
                        color: 6,
                        line_width: 2,
                        dynamic: false,
                        visible: true,
                        locked: false,
                        x: 700,
                        y: 290,
                        font_size: 16,
                        text: "CAP".into(),
                    },
                ],
            },
            MkuiFrame {
                id: "f_standby".into(),
                name: "Standby".into(),
                groups: vec![MkuiGroup {
                    id: "g_st".into(),
                    name: "St".into(),
                    visible: true,
                    locked: false,
                    collapsed: false,
                }],
                graphics: vec![MkuiGraphic::Circle {
                    id: "dot".into(),
                    figure_name: "DOT".into(),
                    display_name: "点".into(),
                    var_key: None,
                    group_id: "g_st".into(),
                    layer: 0,
                    color: 1,
                    line_width: 3,
                    dynamic: false,
                    visible: true,
                    locked: false,
                    center_x: 960,
                    center_y: 540,
                    radius: 20,
                }],
            },
        ],
        created_at: "".into(),
        updated_at: "".into(),
    }
}

fn cli_bin() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_mokairos-ui"))
}

fn run_cli(args: &[&str]) {
    let out = Command::new(cli_bin()).args(args).output().unwrap();
    if !out.status.success() {
        panic!(
            "mokairos-ui {:?} failed ({:?}):\nstdout:\n{}\nstderr:\n{}",
            args,
            out.status.code(),
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
    }
}

fn compile_and_run_c_and_cpp(
    gen_dir: &Path,
    mock_inc: &Path,
    harness_c: &Path,
    harness_cpp: &Path,
    extra_c_sources: &[&Path],
    extra_cpp_sources: &[&Path],
) {
    let inc_dir = gen_dir.join("include");
    let exe_c = gen_dir.join("test_c.exe");
    let exe_cpp = gen_dir.join("test_cpp.exe");

    // 1. 编译 C11 核心 + C 夹具（若存在非空 bind.cpp 则先以 C++20 编成 .o 再链接）
    let bind_cpp = gen_dir.join("mk_hud_bind.cpp");
    let runtime_o = gen_dir.join("runtime.o");
    let layout_o = gen_dir.join("layout.o");
    let gen_o = gen_dir.join("gen.o");
    let bind_o = gen_dir.join("bind.o");
    let harness_c_o = gen_dir.join("harness_c.o");

    for (src, obj) in [
        (gen_dir.join("mk_hud_runtime.c"), &runtime_o),
        (gen_dir.join("mk_hud_layout.c"), &layout_o),
        (gen_dir.join("mk_hud_gen.c"), &gen_o),
        (harness_c.to_path_buf(), &harness_c_o),
    ] {
        let out = Command::new("gcc")
            .args([
                "-std=c11",
                "-Wall",
                "-Wextra",
                "-Werror",
                "-I",
                inc_dir.to_str().unwrap(),
                "-I",
                mock_inc.to_str().unwrap(),
                "-c",
                src.to_str().unwrap(),
                "-o",
                obj.to_str().unwrap(),
            ])
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "gcc failed on {}:\n{}",
            src.display(),
            String::from_utf8_lossy(&out.stderr)
        );
    }

    let out_bind = Command::new("g++")
        .args([
            "-std=c++20",
            "-Wall",
            "-Wextra",
            "-Werror",
            "-fno-exceptions",
            "-I",
            inc_dir.to_str().unwrap(),
            "-I",
            mock_inc.to_str().unwrap(),
            "-c",
            bind_cpp.to_str().unwrap(),
            "-o",
            bind_o.to_str().unwrap(),
        ])
        .output()
        .unwrap();
    assert!(
        out_bind.status.success(),
        "g++ failed on bind.cpp:\n{}",
        String::from_utf8_lossy(&out_bind.stderr)
    );

    let mut link_args = vec![
        "-std=c++20".to_string(),
        "-Wall".to_string(),
        "-Wextra".to_string(),
        "-Werror".to_string(),
        "-fno-exceptions".to_string(),
        "-I".to_string(),
        inc_dir.to_str().unwrap().to_string(),
        "-I".to_string(),
        mock_inc.to_str().unwrap().to_string(),
        runtime_o.to_str().unwrap().to_string(),
        layout_o.to_str().unwrap().to_string(),
        gen_o.to_str().unwrap().to_string(),
        bind_o.to_str().unwrap().to_string(),
        harness_c_o.to_str().unwrap().to_string(),
    ];
    for p in extra_c_sources {
        link_args.push(p.to_str().unwrap().to_string());
    }
    for p in extra_cpp_sources {
        link_args.push(p.to_str().unwrap().to_string());
    }
    link_args.push("-o".to_string());
    link_args.push(exe_c.to_str().unwrap().to_string());

    let out_link = Command::new("g++").args(&link_args).output().unwrap();
    assert!(
        out_link.status.success(),
        "link C harness failed:\n{}",
        String::from_utf8_lossy(&out_link.stderr)
    );

    let run_c = Command::new(&exe_c).output().unwrap();
    assert!(
        run_c.status.success(),
        "C harness execution failed:\nstdout:{}\nstderr:{}",
        String::from_utf8_lossy(&run_c.stdout),
        String::from_utf8_lossy(&run_c.stderr)
    );

    // 2. C++20 夹具编译链接运行（测试 cpp_wrapper.hpp 与 C/C++ 混编）
    let mut cpp_args = vec![
        "-std=c++20".to_string(),
        "-Wall".to_string(),
        "-Wextra".to_string(),
        "-Werror".to_string(),
        "-fno-exceptions".to_string(),
        "-I".to_string(),
        inc_dir.to_str().unwrap().to_string(),
        "-I".to_string(),
        mock_inc.to_str().unwrap().to_string(),
        harness_cpp.to_str().unwrap().to_string(),
        runtime_o.to_str().unwrap().to_string(),
        layout_o.to_str().unwrap().to_string(),
        gen_o.to_str().unwrap().to_string(),
        bind_o.to_str().unwrap().to_string(),
    ];
    for p in extra_cpp_sources {
        cpp_args.push(p.to_str().unwrap().to_string());
    }
    cpp_args.push("-o".to_string());
    cpp_args.push(exe_cpp.to_str().unwrap().to_string());

    let out_cpp = Command::new("g++").args(&cpp_args).output().unwrap();
    assert!(
        out_cpp.status.success(),
        "g++ C++20 harness failed:\n{}",
        String::from_utf8_lossy(&out_cpp.stderr)
    );
    let run_cpp = Command::new(&exe_cpp).output().unwrap();
    assert!(
        run_cpp.status.success(),
        "C++20 harness execution failed:\n{}",
        String::from_utf8_lossy(&run_cpp.stderr)
    );
}

#[test]
fn generic_c_api_preset_compiles_and_verifies_protocol_and_state_machine() {
    let dir = tempfile::tempdir().unwrap();
    let doc = demo_doc();

    let mut profile = get_preset("generic-c").unwrap().profile;
    profile.cpp_wrapper = true;
    profile.flows.insert(
        "bat_flow".into(),
        FlowGraph {
            nodes: vec![
                FlowNode {
                    id: "entry".into(),
                    kind: "api_entry".into(),
                    node_ref: None,
                    label: None,
                    params: serde_json::json!({
                        "name": "update_battery",
                        "group": "power",
                        "public": true,
                        "args": [{ "name": "pct", "type": "float" }]
                    }),
                    position: None,
                },
                FlowNode {
                    id: "scale".into(),
                    kind: "code_fn".into(),
                    node_ref: Some("to_volts".into()),
                    label: None,
                    params: serde_json::json!({}),
                    position: None,
                },
                FlowNode {
                    id: "col".into(),
                    kind: "threshold_color".into(),
                    node_ref: None,
                    label: None,
                    params: serde_json::json!({
                        "steps": [[0.8, "green"], [0.2, "orange"]],
                        "else": "pink"
                    }),
                    position: None,
                },
                FlowNode {
                    id: "s_bar".into(),
                    kind: "graphic_sink".into(),
                    node_ref: Some("battery.bar.percent".into()),
                    label: None,
                    params: serde_json::json!({}),
                    position: None,
                },
                FlowNode {
                    id: "s_col".into(),
                    kind: "graphic_sink".into(),
                    node_ref: Some("battery.bar.color".into()),
                    label: None,
                    params: serde_json::json!({}),
                    position: None,
                },
                FlowNode {
                    id: "s_num".into(),
                    kind: "graphic_sink".into(),
                    node_ref: Some("battery.pct.value".into()),
                    label: None,
                    params: serde_json::json!({}),
                    position: None,
                },
            ],
            edges: vec![
                FlowEdge { id: None, from: "entry.arg0".into(), to: "s_bar.in".into() },
                FlowEdge { id: None, from: "entry.arg0".into(), to: "col.in".into() },
                FlowEdge { id: None, from: "col.out".into(), to: "s_col.in".into() },
                FlowEdge { id: None, from: "entry.arg0".into(), to: "scale.pct".into() },
                FlowEdge { id: None, from: "scale.out".into(), to: "s_num.in".into() },
            ],
            layout: BTreeMap::new(),
        },
    );

    let mut code_files = BTreeMap::new();
    code_files.insert(
        "nodes.c".into(),
        "float to_volts(float pct) { return 20.0f + pct * 6.0f; }\n".into(),
    );
    let bundle = CodegenBundle {
        profile_toml: toml::to_string(&profile).unwrap(),
        code_files,
        lib_overrides: BTreeMap::new(),
    };

    let mkui_path = dir.path().join("generic.mkui");
    save_mkui_archive_with_codegen(&mkui_path, &doc, None, Some(&bundle)).unwrap();

    let gen_dir = dir.path().join("gen");
    let custom_dir = dir.path().join("custom");
    run_cli(&[
        "generate",
        "--mkui",
        mkui_path.to_str().unwrap(),
        "--out",
        gen_dir.to_str().unwrap(),
    ]);
    run_cli(&[
        "scaffold",
        "--mkui",
        mkui_path.to_str().unwrap(),
        "--custom-dir",
        custom_dir.to_str().unwrap(),
    ]);
    assert!(custom_dir.join("mk_hud_custom.c").exists());

    let mock_inc = dir.path().join("mock_inc");
    fs::create_dir_all(&mock_inc).unwrap();

    let harness_c = dir.path().join("harness.c");
    fs::write(
        &harness_c,
        r#"
#include <assert.h>
#include <string.h>
#include "mk_hud.h"

typedef struct {
    uint16_t cmd_id;
    size_t len;
    uint8_t data[128];
} captured_tx_t;

static captured_tx_t g_tx[16];
static size_t g_tx_count = 0;
static uint16_t g_rid = 0;
static int g_online = 0;
static int g_ready = 1;
static mk_hud_tx_t g_next_tx = MK_HUD_TX_ACCEPTED;

static mk_hud_tx_t mock_send(void* ctx, uint16_t cmd_id, const uint8_t* data, size_t len) {
    (void)ctx;
    if (g_next_tx != MK_HUD_TX_ACCEPTED) {
        return g_next_tx;
    }
    assert(g_tx_count < 16);
    g_tx[g_tx_count].cmd_id = cmd_id;
    g_tx[g_tx_count].len = len;
    memcpy(g_tx[g_tx_count].data, data, len);
    g_tx_count++;
    return MK_HUD_TX_ACCEPTED;
}
static uint16_t mock_rid(void* ctx) { (void)ctx; return g_rid; }
static int mock_online(void* ctx) { (void)ctx; return g_online; }
static int mock_ready(void* ctx) { (void)ctx; return g_ready; }

int main(void) {
    mk_hud_port_t port = { mock_send, NULL, mock_rid, mock_online, mock_ready, NULL };
    assert(mk_hud_init(&port) == 1);

    /* 离线和无选手端(哨兵7)不应发送 */
    assert(mk_hud_poll(0) == MK_HUD_POLL_IDLE);
    g_online = 1;
    g_rid = 7;
    assert(mk_hud_poll(10) == MK_HUD_POLL_IDLE);
    assert(g_tx_count == 0);

    /* 3号步兵上线 -> ADDING（1字符包51B + 1两图包36B） */
    g_rid = 3;
    assert(mk_hud_poll(100) == MK_HUD_POLL_SENT);
    assert(g_tx_count == 1);
    assert(g_tx[0].cmd_id == 0x0301);
    assert(g_tx[0].len == 51); /* 6 + 45 */

    /* 最小发送间隔 34ms 限速 */
    assert(mk_hud_poll(120) == MK_HUD_POLL_DEFERRED);

    /* 串口忙退避 */
    g_ready = 0;
    assert(mk_hud_poll(150) == MK_HUD_POLL_DEFERRED);
    g_ready = 1;

    /* 发出第二包 Add -> 进入 ACTIVE */
    assert(mk_hud_poll(150) == MK_HUD_POLL_SENT);
    assert(g_tx_count == 2);
    assert(g_tx[1].len == 36); /* 6 + 30 (0x0102) */
    assert(mk_hud_is_ready() == 1);

    /* API 扇出更新：pct=0.1 -> pink color + bar len + volts=20.6 */
    assert(mk_hud_update_battery(0.1f) == 1);
    g_next_tx = MK_HUD_TX_BUSY;
    assert(mk_hud_poll(200) == MK_HUD_POLL_DEFERRED); /* BUSY 保留脏位 */
    g_next_tx = MK_HUD_TX_ACCEPTED;
    assert(mk_hud_poll(250) == MK_HUD_POLL_SENT);
    assert(g_tx_count == 3);
    /* op=2 (Modify) 应写入首图元 byte3 低 3 位 */
    assert((g_tx[2].data[6 + 3] & 0x07u) == 2u);

    /* 短写/错误进入 FAULT，掉线后恢复 */
    assert(mk_hud_update_battery(0.9f) == 1);
    g_next_tx = MK_HUD_TX_FAULT;
    assert(mk_hud_poll(300) == MK_HUD_POLL_FAULT);
    assert(mk_hud_poll(350) == MK_HUD_POLL_FAULT);
    g_online = 0;
    assert(mk_hud_poll(400) == MK_HUD_POLL_IDLE);
    g_online = 1;
    g_next_tx = MK_HUD_TX_ACCEPTED;
    assert(mk_hud_poll(450) == MK_HUD_POLL_SENT); /* 重新进入 ADDING */
    return 0;
}
"#,
    )
    .unwrap();

    let harness_cpp = dir.path().join("harness.cpp");
    fs::write(
        &harness_cpp,
        r#"
#include <cassert>
#include "mk_hud.hpp"

static mk_hud_tx_t dummy_send(void*, uint16_t, const uint8_t*, size_t) { return MK_HUD_TX_ACCEPTED; }
static uint16_t dummy_rid(void*) { return 3; }

int main() {
    mokairos::mk_hud::Port p{ dummy_send, nullptr, dummy_rid, nullptr, nullptr, nullptr };
    assert(mokairos::mk_hud::Init(p) == 1);
    assert(mokairos::mk_hud::Poll(100) == MK_HUD_POLL_SENT);
    return 0;
}
"#,
    )
    .unwrap();

    compile_and_run_c_and_cpp(&gen_dir, &mock_inc, &harness_c, &harness_cpp, &[], &[]);
}

#[test]
fn uicrm_new_and_legacy_presets_compile_zero_warning_with_cpp_shims() {
    let doc = demo_doc();

    // 1. uicrm-new (payload + C++ shims + mapping flow)
    {
        let dir = tempfile::tempdir().unwrap();
        let mut profile = get_preset("uicrm-new").unwrap().profile;
        profile.symbols.push(SymbolDecl {
            id: "bat_pct".into(),
            label: "电量".into(),
            value_type: FlowValueType::Float,
            target_ref: SymbolRef {
                symbol: None,
                expr: Some("::g_battery->GetPercentage()".into()),
                lang: SymbolLang::Cpp,
                include: Some("mock_battery.hpp".into()),
                decl: None,
                optional: false,
            },
        });
        profile.flows.insert(
            "bat".into(),
            FlowGraph {
                nodes: vec![
                    FlowNode {
                        id: "s".into(),
                        kind: "symbol_source".into(),
                        node_ref: Some("symbol:bat_pct".into()),
                        label: None,
                        params: serde_json::json!({}),
                        position: None,
                    },
                    FlowNode {
                        id: "k".into(),
                        kind: "graphic_sink".into(),
                        node_ref: Some("battery.bar.percent".into()),
                        label: None,
                        params: serde_json::json!({}),
                        position: None,
                    },
                ],
                edges: vec![FlowEdge { id: None, from: "s.out".into(), to: "k.in".into() }],
                layout: BTreeMap::new(),
            },
        );
        let bundle = CodegenBundle {
            profile_toml: toml::to_string(&profile).unwrap(),
            code_files: BTreeMap::new(),
            lib_overrides: BTreeMap::new(),
        };
        let mkui_path = dir.path().join("new.mkui");
        save_mkui_archive_with_codegen(&mkui_path, &doc, None, Some(&bundle)).unwrap();
        let gen_dir = dir.path().join("gen");
        run_cli(&["generate", "--mkui", mkui_path.to_str().unwrap(), "--out", gen_dir.to_str().unwrap()]);

        let mock_inc = dir.path().join("mock_inc");
        fs::create_dir_all(mock_inc.join("seasons/2027")).unwrap();
        fs::write(mock_inc.join("FreeRTOS.h"), "void taskENTER_CRITICAL(void);\nvoid taskEXIT_CRITICAL(void);\n").unwrap();
        fs::write(mock_inc.join("bsp_os.h"), "#include <stdint.h>\nnamespace bsp { uint32_t GetHighresTickMilliSec(); }\n").unwrap();
        fs::write(mock_inc.join("mock_battery.hpp"), "struct MockBat { float GetPercentage() { return 0.75f; } }; extern MockBat* g_battery;\n").unwrap();
        fs::write(mock_inc.join("referee.h"), "#include <stddef.h>\n#include <stdint.h>\nstruct MockRef { size_t Transmit(uint16_t cmd, const void* p, size_t len); bool IsOnline(); }; extern MockRef* g_referee;\n").unwrap();
        fs::write(mock_inc.join("seasons/2027/protocol.h"), "#include <stdint.h>\nstruct MockProto { struct { uint16_t robot_id; } robot_status; }; extern MockProto* g_referee_protocol;\n").unwrap();

        let stub_cpp = dir.path().join("stub.cpp");
        fs::write(
            &stub_cpp,
            r#"
#include "referee.h"
#include "seasons/2027/protocol.h"
#include "bsp_os.h"
#include "mock_battery.hpp"
extern "C" void taskENTER_CRITICAL(void) {}
extern "C" void taskEXIT_CRITICAL(void) {}
static MockBat s_bat; MockBat* g_battery = &s_bat;
static MockProto s_proto{{3}}; MockProto* g_referee_protocol = &s_proto;
size_t MockRef::Transmit(uint16_t, const void*, size_t len) { return len + 9; }
bool MockRef::IsOnline() { return true; }
static MockRef s_ref; MockRef* g_referee = &s_ref;
namespace bsp { uint32_t GetHighresTickMilliSec() { return 200; } }
"#,
        )
        .unwrap();
        let harness_c = dir.path().join("h.c");
        fs::write(&harness_c, "#include <assert.h>\n#include \"mk_hud.h\"\nint main(void){ assert(mk_hud_init()==1); assert(mk_hud_poll_auto()==MK_HUD_POLL_SENT); return 0; }\n").unwrap();
        let harness_cpp = dir.path().join("h.cpp");
        fs::write(&harness_cpp, "#include <cassert>\n#include \"mk_hud.h\"\nint main(){ assert(mk_hud_init()==1); return 0; }\n").unwrap();

        compile_and_run_c_and_cpp(&gen_dir, &mock_inc, &harness_c, &harness_cpp, &[], &[&stub_cpp]);
    }

    // 2. uicrm-legacy (frame mode + 0xA5 CRC verification)
    {
        let dir = tempfile::tempdir().unwrap();
        let profile = get_preset("uicrm-legacy").unwrap().profile;
        let bundle = CodegenBundle {
            profile_toml: toml::to_string(&profile).unwrap(),
            code_files: BTreeMap::new(),
            lib_overrides: BTreeMap::new(),
        };
        let mkui_path = dir.path().join("legacy.mkui");
        save_mkui_archive_with_codegen(&mkui_path, &doc, None, Some(&bundle)).unwrap();
        let gen_dir = dir.path().join("gen");
        run_cli(&["generate", "--mkui", mkui_path.to_str().unwrap(), "--out", gen_dir.to_str().unwrap()]);

        let mock_inc = dir.path().join("mock_inc");
        fs::create_dir_all(mock_inc.join("boards/drivers/include")).unwrap();
        fs::write(mock_inc.join("FreeRTOS.h"), "void taskENTER_CRITICAL(void);\nvoid taskEXIT_CRITICAL(void);\n").unwrap();
        fs::write(mock_inc.join("bsp_os.h"), "#include <stdint.h>\nnamespace bsp { uint32_t GetHighresTickMilliSec(); }\n").unwrap();
        fs::write(mock_inc.join("crc_check.h"), "#include <stdint.h>\nvoid append_crc8_check_sum(uint8_t* buf, uint32_t len);\nvoid append_crc16_check_sum(uint8_t* buf, uint32_t len);\n").unwrap();
        fs::write(mock_inc.join("bsp_uart.h"), "#include <stdint.h>\nstruct MockUart { int32_t Write(const uint8_t* buf, uint32_t len); }; extern MockUart* g_referee_uart;\n").unwrap();
        fs::write(mock_inc.join("boards/drivers/include/protocol.h"), "#include <stdint.h>\nstruct MockLegRef { bool IsOnline(); struct { uint16_t robot_id; } game_robot_status; }; extern MockLegRef* g_referee;\n").unwrap();

        let stub_cpp = dir.path().join("stub.cpp");
        fs::write(
            &stub_cpp,
            r#"
#include "bsp_uart.h"
#include "boards/drivers/include/protocol.h"
#include "bsp_os.h"
extern "C" {
void taskENTER_CRITICAL(void) {}
void taskEXIT_CRITICAL(void) {}
void append_crc8_check_sum(uint8_t* buf, uint32_t len) { if (len >= 5) buf[4] = 0xAA; }
void append_crc16_check_sum(uint8_t* buf, uint32_t len) { if (len >= 2) { buf[len-2] = 0x55; buf[len-1] = 0x66; } }
}
int32_t MockUart::Write(const uint8_t* buf, uint32_t len) {
    if (len < 9 || buf[0] != 0xA5 || buf[4] != 0xAA) return 0;
    return static_cast<int32_t>(len);
}
static MockUart s_u; MockUart* g_referee_uart = &s_u;
bool MockLegRef::IsOnline() { return true; }
static MockLegRef s_r{{3}}; MockLegRef* g_referee = &s_r;
namespace bsp { uint32_t GetHighresTickMilliSec() { return 200; } }
"#,
        )
        .unwrap();
        let harness_c = dir.path().join("h.c");
        fs::write(&harness_c, "#include <assert.h>\n#include \"mk_hud.h\"\nint main(void){ assert(mk_hud_init()==1); assert(mk_hud_poll_auto()==MK_HUD_POLL_SENT); return 0; }\n").unwrap();
        let harness_cpp = dir.path().join("h.cpp");
        fs::write(&harness_cpp, "#include <cassert>\n#include \"mk_hud.h\"\nint main(){ assert(mk_hud_init()==1); return 0; }\n").unwrap();

        compile_and_run_c_and_cpp(&gen_dir, &mock_inc, &harness_c, &harness_cpp, &[], &[&stub_cpp]);
    }
}
