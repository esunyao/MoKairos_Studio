use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Duration;

use mokairos_codegen::archive::pack::save_mkui_archive_with_codegen;
use mokairos_codegen::cmake_export::{CmakeExportOptions, render_cmake_module};
use mokairos_codegen::model::{CodegenBundle, MkuiDocument, MkuiFrame, MkuiGraphic, MkuiGroup};
use mokairos_codegen::profile::get_preset;
use sha2::{Digest, Sha256};

fn cli_bin() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_mokairos-ui"))
}

fn host_asset_and_bin() -> (&'static str, &'static str) {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => ("mokairos-ui-windows-x64.exe", "mokairos-ui.exe"),
        ("linux", "x86_64") => ("mokairos-ui-linux-x64", "mokairos-ui"),
        ("linux", "aarch64") => ("mokairos-ui-linux-arm64", "mokairos-ui"),
        ("macos", "aarch64") => ("mokairos-ui-macos-arm64", "mokairos-ui"),
        ("macos", "x86_64") => ("mokairos-ui-macos-x64", "mokairos-ui"),
        other => panic!("unsupported host in e2e test: {:?}", other),
    }
}

fn sha256_file(path: &Path) -> String {
    let bytes = fs::read(path).unwrap();
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    hex::encode(hasher.finalize())
}

fn to_cmake_path(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

fn to_file_url(p: &Path) -> String {
    let s = to_cmake_path(p);
    if s.starts_with('/') {
        format!("file://{s}")
    } else {
        format!("file:///{s}")
    }
}

fn sample_doc(text_val: &str) -> MkuiDocument {
    MkuiDocument {
        schema_version: 1,
        project_id: "p_cmake".into(),
        name: "CmakeE2E".into(),
        description: "".into(),
        robot_role: "infantry_3".into(),
        active_frame_id: "f1".into(),
        frames: vec![MkuiFrame {
            id: "f1".into(),
            name: "Main".into(),
            groups: vec![MkuiGroup {
                id: "g1".into(),
                name: "Core".into(),
                visible: true,
                locked: false,
                collapsed: false,
            }],
            graphics: vec![MkuiGraphic::Text {
                id: "t1".into(),
                figure_name: "TXT".into(),
                display_name: "状态".into(),
                var_key: Some("hud.status".into()),
                group_id: "g1".into(),
                layer: 1,
                color: 2,
                line_width: 2,
                dynamic: true,
                visible: true,
                locked: false,
                x: 100,
                y: 200,
                font_size: 18,
                text: text_val.into(),
            }],
        }],
        created_at: "".into(),
        updated_at: "".into(),
    }
}

fn write_test_mkui(path: &Path, text_val: &str) {
    let profile = get_preset("generic-c").unwrap().profile;
    let bundle = CodegenBundle {
        profile_toml: toml::to_string(&profile).unwrap(),
        code_files: BTreeMap::new(),
        lib_overrides: BTreeMap::new(),
    };
    save_mkui_archive_with_codegen(path, &sample_doc(text_val), None, Some(&bundle)).unwrap();
}

fn run_cmake_configure(src_dir: &Path, build_dir: &Path, extra_args: &[&str]) -> std::process::Output {
    let mut cmd = Command::new("cmake");
    cmd.args(["-S", to_cmake_path(src_dir).as_str(), "-B", to_cmake_path(build_dir).as_str(), "-G", "Ninja"]);
    cmd.args(["-DCMAKE_C_COMPILER=gcc", "-DCMAKE_CXX_COMPILER=g++"]);
    cmd.args(extra_args);
    cmd.output().unwrap()
}

fn run_ninja(build_dir: &Path, extra_args: &[&str]) -> std::process::Output {
    let mut cmd = Command::new("ninja");
    cmd.arg("-C").arg(build_dir);
    cmd.args(extra_args);
    cmd.output().unwrap()
}

#[test]
fn cmake_incremental_rebuild_base_lib_and_custom_dir_protection() {
    let dir = tempfile::tempdir().unwrap();
    let src_dir = dir.path().join("project");
    let build_dir = dir.path().join("build");
    fs::create_dir_all(src_dir.join("cmake")).unwrap();
    fs::create_dir_all(src_dir.join("ui")).unwrap();
    fs::create_dir_all(src_dir.join("base_override")).unwrap();

    let cmake_mod = render_cmake_module(&CmakeExportOptions::default()).unwrap();
    fs::write(src_dir.join("cmake/MoKairosUI.cmake"), cmake_mod).unwrap();

    let mkui_path = src_dir.join("ui/hero.mkui");
    write_test_mkui(&mkui_path, "INIT_V1");

    // 覆写一个基底模板以验证 BASE_LIB 硬编码注入
    let mut custom_hdr = include_str!("../templates/official/public_header.h.j2").replace("\r\n", "\n");
    custom_hdr.push_str("\n/* BASE_LIB_OVERRIDE_MARKER */\n#define MK_BASE_LIB_INJECTED 42\n");
    fs::write(src_dir.join("base_override/public_header.h.j2"), custom_hdr).unwrap();

    fs::write(
        src_dir.join("main.c"),
        r#"
#include <assert.h>
#include <string.h>
#include "mk_hud.h"

#ifndef MK_BASE_LIB_INJECTED
#error "BASE_LIB override was not applied"
#endif

static uint8_t g_last_payload[128];
static size_t g_last_len = 0;

static mk_hud_tx_t test_send(void* ctx, uint16_t cmd_id, const uint8_t* data, size_t len) {
    (void)ctx;
    assert(cmd_id == 0x0301u);
    memcpy(g_last_payload, data, len);
    g_last_len = len;
    return MK_HUD_TX_ACCEPTED;
}
static uint16_t test_rid(void* ctx) { (void)ctx; return 3u; }

int main(void) {
    mk_hud_port_t port = { test_send, NULL, test_rid, NULL, NULL, NULL };
    assert(mk_hud_init(&port) == 1);
    assert(mk_hud_poll(100) == MK_HUD_POLL_SENT);
    assert(g_last_len == 51u);
    /* 验证文本内容前 4 字节来自 .mkui */
#ifdef EXPECT_V2
    assert(memcmp(&g_last_payload[6 + 15], "UPD_V2", 6) == 0);
#else
    assert(memcmp(&g_last_payload[6 + 15], "INIT_V1", 7) == 0);
#endif
    return 0;
}
"#,
    )
    .unwrap();

    fs::write(
        src_dir.join("CMakeLists.txt"),
        r#"
cmake_minimum_required(VERSION 3.10)
project(e2e_demo C CXX)
set(CMAKE_C_STANDARD 11)
add_compile_options(-Wall -Wextra -Werror)

include("${CMAKE_SOURCE_DIR}/cmake/MoKairosUI.cmake")

add_executable(app main.c)
mokairos_add_ui(hero_ui
    MKUI       "${CMAKE_CURRENT_SOURCE_DIR}/ui/hero.mkui"
    TARGET     app
    CUSTOM_DIR "${CMAKE_CURRENT_SOURCE_DIR}/ui/custom"
    BASE_LIB   "${CMAKE_CURRENT_SOURCE_DIR}/base_override"
)
"#,
    )
    .unwrap();

    let cli_arg = format!("-DMOKAIROS_UI_CLI={}", to_cmake_path(&cli_bin()));
    let cfg = run_cmake_configure(&src_dir, &build_dir, &[&cli_arg]);
    assert!(
        cfg.status.success(),
        "cmake configure failed:\n{}",
        String::from_utf8_lossy(&cfg.stderr)
    );

    // 验证 scaffold 创建了 custom/mk_hud_custom.c，写入用户标记验证永不覆盖
    let custom_file = src_dir.join("ui/custom/mk_hud_custom.c");
    assert!(custom_file.exists());
    let user_custom_code = "/* USER_OWNED_NEVER_OVERWRITE */\n#include \"mk_hud.h\"\nint user_custom_sentinel(void) { return 77; }\n";
    fs::write(&custom_file, user_custom_code).unwrap();

    // 1. 首次构建与运行
    let b1 = run_ninja(&build_dir, &[]);
    assert!(
        b1.status.success(),
        "ninja build 1 failed:\n{}\n{}",
        String::from_utf8_lossy(&b1.stdout),
        String::from_utf8_lossy(&b1.stderr)
    );
    let exe = build_dir.join("app.exe");
    let exe_path = if exe.exists() { exe } else { build_dir.join("app") };
    assert!(Command::new(&exe_path).status().unwrap().success());

    // 2. 二次构建必须为纯空操作（先验证二次 ninja 零任务，且无 CONFIGURE_DEPENDS 时 ninja -n 也为空）
    let dry = run_ninja(&build_dir, &[]);
    assert!(dry.status.success());
    let dry_out = String::from_utf8_lossy(&dry.stdout);
    assert!(
        dry_out.contains("no work to do"),
        "expected ninja no-op, got:\n{dry_out}"
    );
    assert!(
        !dry_out.contains("Re-running CMake") && !dry_out.contains("generating hero_ui"),
        "unexpected work on second build:\n{dry_out}"
    );

    // 3. 修改 .mkui 并重新构建 -> 自动再生成，且 custom/ 文件保持逐字节不被覆盖
    thread::sleep(Duration::from_millis(1200));
    write_test_mkui(&mkui_path, "UPD_V2");

    let b2 = run_ninja(&build_dir, &[]);
    assert!(
        b2.status.success(),
        "ninja build 2 failed:\n{}",
        String::from_utf8_lossy(&b2.stdout)
    );
    let b2_out = String::from_utf8_lossy(&b2.stdout);
    assert!(
        b2_out.contains("MoKairos UI: generating hero_ui"),
        "expected regeneration after .mkui edit, got:\n{b2_out}"
    );
    assert_eq!(fs::read_to_string(&custom_file).unwrap(), user_custom_code);

    // 重新配置（模拟用户再次 cmake configure）也绝不覆盖 custom/，且验证新生成文本已变成 UPD_V2
    let cfg2 = run_cmake_configure(&src_dir, &build_dir, &[&cli_arg, "-DCMAKE_C_FLAGS=-DEXPECT_V2"]);
    assert!(cfg2.status.success());
    assert_eq!(fs::read_to_string(&custom_file).unwrap(), user_custom_code);
    let b3 = run_ninja(&build_dir, &[]);
    assert!(b3.status.success());
    assert!(Command::new(&exe_path).status().unwrap().success());

    // 4. 验证 CUSTOM_DIR 去重检测：当文件已存在目标 SOURCES 时提示跳过而不重复编译
    let dup_src = dir.path().join("dup_proj");
    let dup_build = dir.path().join("dup_build");
    fs::create_dir_all(dup_src.join("cmake")).unwrap();
    fs::create_dir_all(dup_src.join("src")).unwrap();
    fs::write(
        dup_src.join("cmake/MoKairosUI.cmake"),
        render_cmake_module(&CmakeExportOptions::default()).unwrap(),
    )
    .unwrap();
    let dup_mkui = dup_src.join("hero.mkui");
    write_test_mkui(&dup_mkui, "DUP_OK");
    fs::write(dup_src.join("src/main.c"), "int main(void){return 0;}\n").unwrap();
    fs::write(dup_src.join("src/mk_hud_custom.c"), "int custom_already_in_glob(void){return 1;}\n").unwrap();
    fs::write(
        dup_src.join("CMakeLists.txt"),
        r#"
cmake_minimum_required(VERSION 3.10)
project(dup_demo C)
include("${CMAKE_SOURCE_DIR}/cmake/MoKairosUI.cmake")
file(GLOB GLOB_SRCS "${CMAKE_CURRENT_SOURCE_DIR}/src/*.c")
add_executable(dup_app ${GLOB_SRCS})
mokairos_add_ui(dup_ui
    MKUI "${CMAKE_CURRENT_SOURCE_DIR}/hero.mkui"
    TARGET dup_app
    CUSTOM_DIR "${CMAKE_CURRENT_SOURCE_DIR}/src"
)
"#,
    )
    .unwrap();
    let cfg_dup = run_cmake_configure(&dup_src, &dup_build, &[&cli_arg]);
    assert!(cfg_dup.status.success());
    let cfg_dup_out = String::from_utf8_lossy(&cfg_dup.stdout);
    assert!(cfg_dup_out.contains("跳过重复添加"));
    let b_dup = run_ninja(&dup_build, &[]);
    assert!(b_dup.status.success(), "dedup build failed");
}

#[test]
fn cmake_file_url_download_sha256_verify_tamper_reject_and_offline_fallback() {
    let dir = tempfile::tempdir().unwrap();
    let repo_dir = dir.path().join("mock_release");
    let cache_dir = dir.path().join("cache");
    let src_dir = dir.path().join("project");
    let (asset, _) = host_asset_and_bin();

    fs::create_dir_all(repo_dir.join("v0.1.0")).unwrap();
    fs::create_dir_all(src_dir.join("cmake")).unwrap();
    let released_bin = repo_dir.join("v0.1.0").join(asset);
    fs::copy(cli_bin(), &released_bin).unwrap();
    let real_sha = sha256_file(&released_bin);
    fs::write(
        repo_dir.join("v0.1.0").join(format!("{asset}.sha256")),
        format!("{real_sha}  {asset}\n"),
    )
    .unwrap();
    fs::write(repo_dir.join("latest.txt"), "0.1.0\n").unwrap();

    fs::write(
        src_dir.join("cmake/MoKairosUI.cmake"),
        render_cmake_module(&CmakeExportOptions {
            version: Some("latest".into()),
            base_url: Some(to_file_url(&repo_dir)),
            ..Default::default()
        })
        .unwrap(),
    )
    .unwrap();
    write_test_mkui(&src_dir.join("hero.mkui"), "DL_OK");
    fs::write(src_dir.join("main.c"), "#include \"mk_hud.h\"\nint main(void){return 0;}\n").unwrap();
    fs::write(
        src_dir.join("CMakeLists.txt"),
        r#"
cmake_minimum_required(VERSION 3.10)
project(dl_demo C)
include("${CMAKE_SOURCE_DIR}/cmake/MoKairosUI.cmake")
add_executable(dl_app main.c)
mokairos_add_ui(dl_ui MKUI "${CMAKE_CURRENT_SOURCE_DIR}/hero.mkui" TARGET dl_app)
"#,
    )
    .unwrap();

    let cache_arg = format!("-DMOKAIROS_UI_CACHE_DIR={}", to_cmake_path(&cache_dir));

    // 1. 无缓存 + 离线 -> FATAL 且含三种提示
    let b_empty_off = dir.path().join("b_empty_off");
    let out_empty = run_cmake_configure(&src_dir, &b_empty_off, &[&cache_arg, "-DMOKAIROS_UI_OFFLINE=ON"]);
    assert!(!out_empty.status.success());
    let err_empty = String::from_utf8_lossy(&out_empty.stderr);
    assert!(err_empty.contains("MOKAIROS_UI_CLI"), "got stderr:\n{err_empty}");

    // 2. 篡改期望 SHA256 -> 下载校验失败并拒绝（FATAL）
    let sha_key = match std::env::consts::OS {
        "windows" => "WINDOWS_X64",
        "linux" if std::env::consts::ARCH == "aarch64" => "LINUX_ARM64",
        "linux" => "LINUX_X64",
        "macos" if std::env::consts::ARCH == "aarch64" => "MACOS_ARM64",
        _ => "MACOS_X64",
    };
    let bad_sha_arg = format!(
        "-DMOKAIROS_UI_SHA256_{sha_key}=0000000000000000000000000000000000000000000000000000000000000000"
    );
    let b_tamper = dir.path().join("b_tamper");
    let out_tamper = run_cmake_configure(&src_dir, &b_tamper, &[&cache_arg, &bad_sha_arg]);
    assert!(!out_tamper.status.success());
    let err_tamper = String::from_utf8_lossy(&out_tamper.stderr);
    assert!(err_tamper.contains("SHA256"), "expected SHA256 rejection:\n{err_tamper}");

    // 3. 正确 file:// 源下载（latest -> 0.1.0）+ SHA256 校验通过并落入持久缓存
    let b_ok = dir.path().join("b_ok");
    let out_ok = run_cmake_configure(&src_dir, &b_ok, &[&cache_arg]);
    assert!(
        out_ok.status.success(),
        "download configure failed:\n{}",
        String::from_utf8_lossy(&out_ok.stderr)
    );
    let (_, bin_name) = host_asset_and_bin();
    assert!(cache_dir.join("0.1.0").join(asset).join(bin_name).exists());
    assert!(run_ninja(&b_ok, &[]).status.success());

    // 4. 断网（错误 URL + 不命中版本）时自动回退本地缓存并打印 WARNING
    let b_fallback = dir.path().join("b_fallback");
    let out_fb = run_cmake_configure(
        &src_dir,
        &b_fallback,
        &[
            &cache_arg,
            "-DMOKAIROS_UI_VERSION=9.9.9",
            "-DMOKAIROS_UI_BASE_URL=file:///nonexistent_mokairos_repo",
        ],
    );
    assert!(
        out_fb.status.success(),
        "fallback configure failed:\n{}",
        String::from_utf8_lossy(&out_fb.stderr)
    );
    let fb_err = String::from_utf8_lossy(&out_fb.stderr);
    assert!(fb_err.contains("已离线回退到本地缓存 CLI: v0.1.0"), "expected fallback warning:\n{fb_err}");
    assert!(run_ninja(&b_fallback, &[]).status.success());
}
