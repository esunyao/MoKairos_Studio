import { useEffect, useRef } from "react";
import type * as MonacoNS from "monaco-editor/editor/editor.api.js";
import { useAppStore } from "@/stores/useAppStore";
import { ensureMonacoSetup } from "./monacoSetup";

/**
 * 本地离线打包的 Monaco 代码编辑器组件（自动跟随暗/浅主题，支持 Ctrl+S 保存与跳转行号）
 */

export function MonacoCodeEditor({
  value,
  language = "c",
  readOnly = false,
  jumpLine,
  onChange,
  onSave,
  className = "h-full w-full",
}: {
  value: string;
  language?: "c" | "cpp" | "ini";
  readOnly?: boolean;
  jumpLine?: number | null;
  onChange?: (val: string) => void;
  onSave?: (val: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const monaco = ensureMonacoSetup();
    const editor = monaco.editor.create(el, {
      value,
      language,
      theme: theme === "dark" ? "vs-dark" : "vs",
      readOnly,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 12,
      lineHeight: 19,
      fontFamily: "var(--mk-font-mono)",
      scrollBeyondLastLine: false,
      tabSize: 4,
      insertSpaces: true,
      roundedSelection: true,
      padding: { top: 8, bottom: 8 },
    });

    editorRef.current = editor;

    const sub = editor.onDidChangeModelContent(() => {
      onChangeRef.current?.(editor.getValue());
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current?.(editor.getValue());
    });

    return () => {
      sub.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const monaco = ensureMonacoSetup();
    monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs");
  }, [theme]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const monaco = ensureMonacoSetup();
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, language);
    }
    editor.updateOptions({ readOnly });
  }, [language, readOnly]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !jumpLine || jumpLine < 1) return;
    editor.revealLineInCenter(jumpLine);
    editor.setPosition({ lineNumber: jumpLine, column: 1 });
  }, [jumpLine]);

  return <div ref={containerRef} className={className} />;
}
