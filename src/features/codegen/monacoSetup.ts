import * as monaco from "monaco-editor/editor/editor.api.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import "monaco-editor/languages/definitions/cpp/register.js";
import "monaco-editor/languages/definitions/ini/register.js";

/**
 * 本地离线 Monaco Editor 初始化与 MoKairos 符号/API 补全注册（零外部 CDN）
 */

let initialized = false;
let completionDisposable: monaco.IDisposable | null = null;

export interface CompletionContextData {
  prefix: string;
  symbolIds: string[];
  functionNames: string[];
  graphicEnums: string[];
  frameEnums: string[];
}

let currentCompletionData: CompletionContextData = {
  prefix: "mk_hud",
  symbolIds: [],
  functionNames: [],
  graphicEnums: [],
  frameEnums: [],
};

export function ensureMonacoSetup(): typeof monaco {
  if (!initialized) {
    (self as unknown as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
      getWorker() {
        return new EditorWorker();
      },
    };
    initialized = true;
  }

  if (!completionDisposable) {
    completionDisposable = monaco.languages.registerCompletionItemProvider("c", {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range: monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const p = currentCompletionData.prefix;
        const P = p.toUpperCase();
        const items: monaco.languages.CompletionItem[] = [
          ...[`${P}_COLOR_TEAM`, `${P}_COLOR_YELLOW`, `${P}_COLOR_GREEN`, `${P}_COLOR_ORANGE`, `${P}_COLOR_PURPLE`, `${P}_COLOR_PINK`, `${P}_COLOR_CYAN`, `${P}_COLOR_BLACK`, `${P}_COLOR_WHITE`].map(
            (c) => ({
              label: c,
              kind: monaco.languages.CompletionItemKind.EnumMember,
              insertText: c,
              detail: "MoKairos 协议颜色枚举",
              range,
            }),
          ),
          ...currentCompletionData.frameEnums.map((f) => ({
            label: f,
            kind: monaco.languages.CompletionItemKind.EnumMember,
            insertText: f,
            detail: "UI 画面枚举",
            range,
          })),
          ...currentCompletionData.graphicEnums.map((g) => ({
            label: g,
            kind: monaco.languages.CompletionItemKind.EnumMember,
            insertText: g,
            detail: "UI 图元枚举",
            range,
          })),
          ...[`${p}_is_ready()`, `${p}_robot_id()`, `${p}_select_frame()`, `${p}_set_visible()`].map(
            (fn) => ({
              label: fn,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: fn,
              detail: "MoKairos 运行时 API",
              range,
            }),
          ),
          ...currentCompletionData.functionNames.map((fn) => ({
            label: fn,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: `${fn}()`,
            detail: "代码节点函数",
            range,
          })),
        ];
        return { suggestions: items };
      },
    });
  }

  return monaco;
}

export function updateMonacoCompletionContext(data: CompletionContextData): void {
  currentCompletionData = data;
}
