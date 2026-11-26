//! mokairos-ui CLI（供 CMake 构建期自动化生成与命令行校验调用）

use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand, ValueEnum};
use serde_json::json;

use mokairos_codegen::archive::unpack::open_mkui_archive;
use mokairos_codegen::cmake_export::{CmakeExportOptions, render_cmake_module};
use mokairos_codegen::error::AppError;
use mokairos_codegen::generate::{
    GenerateOptions, render_project, scaffold_custom_dir, write_generated_to_dir, write_if_changed,
};
use mokairos_codegen::model::CodegenBundle;

#[derive(Parser)]
#[command(
    name = "mokairos-ui",
    about = "MoKairos Studio RoboMaster UI 代码生成器与 CMake 工具链 CLI",
    disable_version_flag = true
)]
struct Cli {
    /// 打印版本与支持的 schema 信息
    #[arg(long = "version")]
    version: bool,

    /// 配合 --version 输出 JSON
    #[arg(long = "json")]
    json: bool,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Copy, Clone, ValueEnum)]
enum OutputFormat {
    Lines,
    Cmake,
}

#[derive(Subcommand)]
enum Commands {
    /// 生成全部 C/C++ UI 源码文件
    Generate {
        #[arg(long)]
        mkui: PathBuf,
        #[arg(long)]
        out: PathBuf,
        #[arg(long)]
        profile: Option<PathBuf>,
        #[arg(long)]
        base_lib: Option<PathBuf>,
        #[arg(long, value_delimiter = ',')]
        frames: Option<Vec<String>>,
        #[arg(long)]
        stamp: Option<PathBuf>,
    },
    /// 仅在目标文件不存在时创建 custom/ 骨架（绝不覆盖已有文件）
    Scaffold {
        #[arg(long)]
        mkui: PathBuf,
        #[arg(long)]
        custom_dir: PathBuf,
        #[arg(long)]
        profile: Option<PathBuf>,
        #[arg(long)]
        base_lib: Option<PathBuf>,
    },
    /// 输出将要生成的文件清单（供 CMake 配置期使用）
    ListOutputs {
        #[arg(long)]
        mkui: PathBuf,
        #[arg(long)]
        profile: Option<PathBuf>,
        #[arg(long, value_enum, default_value_t = OutputFormat::Lines)]
        format: OutputFormat,
    },
    /// 运行协议预检、配置校验与节点图检查（不写文件）
    Check {
        #[arg(long)]
        mkui: PathBuf,
        #[arg(long)]
        profile: Option<PathBuf>,
        #[arg(long)]
        json: bool,
    },
    /// 导出 cmake/MoKairosUI.cmake 模块
    ExportCmake {
        #[arg(long)]
        out: PathBuf,
        #[arg(long)]
        version: Option<String>,
        #[arg(long)]
        base_url: Option<String>,
    },
}

fn load_inputs(
    mkui_path: &PathBuf,
    profile_path: Option<&PathBuf>,
    base_lib: Option<&PathBuf>,
    frames: Option<Vec<String>>,
) -> Result<(mokairos_codegen::model::MkuiDocument, CodegenBundle, GenerateOptions), AppError> {
    let opened = open_mkui_archive(mkui_path)?;
    let bundle = opened.codegen.unwrap_or_default();
    let profile_override = match profile_path {
        Some(p) => Some(fs::read_to_string(p)?),
        None => None,
    };
    let mkui_name = mkui_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("design.mkui")
        .to_string();
    let opts = GenerateOptions {
        mkui_name,
        profile_override,
        base_lib_dir: base_lib.cloned(),
        frames_override: frames,
    };
    Ok((opened.document, bundle, opts))
}

fn run() -> Result<u8, AppError> {
    let cli = Cli::parse();

    if cli.version {
        if cli.json {
            let info = json!({
                "version": env!("CARGO_PKG_VERSION"),
                "profile_schema": [1],
                "base_lib": "official-1"
            });
            println!("{info}");
        } else {
            println!("mokairos-ui {}", env!("CARGO_PKG_VERSION"));
        }
        return Ok(0);
    }

    let Some(cmd) = cli.command else {
        eprintln!("请指定子命令或 --version；运行 --help 查看用法");
        return Ok(2);
    };

    match cmd {
        Commands::Generate {
            mkui,
            out,
            profile,
            base_lib,
            frames,
            stamp,
        } => {
            let mkui_label = mkui.display().to_string();
            let (doc, bundle, opts) = load_inputs(&mkui, profile.as_ref(), base_lib.as_ref(), frames)?;
            let generated = render_project(&doc, &bundle, &opts)?;
            let mut has_err = false;
            for d in &generated.diagnostics {
                eprintln!("{}", d.format_cli(&mkui_label));
                if d.is_error() {
                    has_err = true;
                }
            }
            if has_err {
                return Ok(2);
            }
            let stamp_path = stamp.unwrap_or_else(|| out.join(&generated.stamp_rel_path));
            write_generated_to_dir(&generated, &out, Some(&stamp_path))?;
            Ok(0)
        }
        Commands::Scaffold {
            mkui,
            custom_dir,
            profile,
            base_lib,
        } => {
            let (doc, bundle, opts) = load_inputs(&mkui, profile.as_ref(), base_lib.as_ref(), None)?;
            let _ = doc;
            scaffold_custom_dir(
                &bundle,
                opts.profile_override.as_deref(),
                opts.base_lib_dir.as_deref(),
                &custom_dir,
            )?;
            Ok(0)
        }
        Commands::ListOutputs {
            mkui,
            profile,
            format,
        } => {
            let (doc, bundle, opts) = load_inputs(&mkui, profile.as_ref(), None, None)?;
            let generated = render_project(&doc, &bundle, &opts)?;
            let mut all = generated.output_list;
            all.push(generated.stamp_rel_path);
            all.sort();
            match format {
                OutputFormat::Lines => {
                    for line in all {
                        println!("{line}");
                    }
                }
                OutputFormat::Cmake => {
                    print!("{}", all.join(";"));
                }
            }
            Ok(0)
        }
        Commands::Check {
            mkui,
            profile,
            json,
        } => {
            let mkui_label = mkui.display().to_string();
            let (doc, bundle, opts) = load_inputs(&mkui, profile.as_ref(), None, None)?;
            let generated = render_project(&doc, &bundle, &opts)?;
            let has_err = generated.diagnostics.iter().any(|d| d.is_error());
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&json!({
                        "diagnostics": generated.diagnostics
                    }))?
                );
            } else {
                for d in &generated.diagnostics {
                    eprintln!("{}", d.format_cli(&mkui_label));
                }
            }
            Ok(if has_err { 2 } else { 0 })
        }
        Commands::ExportCmake {
            out,
            version,
            base_url,
        } => {
            let content = render_cmake_module(&CmakeExportOptions {
                version,
                base_url,
                ..Default::default()
            })?;
            write_if_changed(&out, &content)?;
            Ok(0)
        }
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => ExitCode::from(code),
        Err(err) => {
            let code = match err {
                AppError::Io(_) | AppError::Zip(_) | AppError::InvalidArchive(_) | AppError::SecurityViolation(_) | AppError::NotFound(_) => 3,
                AppError::Profile(_) | AppError::TomlDecode(_) | AppError::Codegen(_) => 2,
                _ => 1,
            };
            eprintln!("mokairos-ui: error: {err}");
            ExitCode::from(code)
        }
    }
}
