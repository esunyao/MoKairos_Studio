import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Delete,
  Keyboard,
  Mouse,
  Move,
  ZoomIn,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Kbd } from "@/components/ui/Primitives";
import { useAppStore } from "@/stores/useAppStore";

/**
 * 快捷键与键鼠操作指南弹窗（左侧键盘/鼠标图标与按键帽，右侧操作说明）
 */

interface ShortcutRow {
  id: string;
  icon: "mouse" | "keyboard" | "move" | "zoom" | "arrows" | "delete";
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  items: ShortcutRow[];
}

const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "画布平移与视口导航",
    items: [
      {
        id: "pan-middle",
        icon: "mouse",
        keys: ["鼠标中键拖动", "中键 + 左键拖动"],
        description: "临时平移画布，松手自动恢复当前工具",
      },
      {
        id: "pan-alt",
        icon: "mouse",
        keys: ["Alt", "+", "左键拖动"],
        description: "任意绘图/选择模式下直接临时平移画布",
      },
      {
        id: "pan-space",
        icon: "move",
        keys: ["Space", "+", "左键拖动"],
        description: "按住空格切换抓手并拖动画布",
      },
      {
        id: "fit-middle",
        icon: "mouse",
        keys: ["双击鼠标中键"],
        description: "自动适应并居中 1920×1080 画板",
      },
      {
        id: "zoom-wheel",
        icon: "zoom",
        keys: ["鼠标滚轮"],
        description: "以指针为中心平滑缩放画布 (15% ~ 600%)",
      },
      {
        id: "fit-kbd",
        icon: "keyboard",
        keys: ["Ctrl", "0"],
        description: "适应视口；Ctrl + 1 重置为 100% 比例",
      },
    ],
  },
  {
    title: "8 类协议图元与工具切换",
    items: [
      {
        id: "tool-select",
        icon: "keyboard",
        keys: ["V"],
        description: "切换到选择 / 框选 / 缩放变换工具",
      },
      {
        id: "tool-pan",
        icon: "keyboard",
        keys: ["H"],
        description: "切换到常驻抓手平移工具",
      },
      {
        id: "tool-1-4",
        icon: "keyboard",
        keys: ["1", "~", "4"],
        description: "直线 (1) / 矩形 (2) / 正圆 (3) / 椭圆 (4)",
      },
      {
        id: "tool-5-8",
        icon: "keyboard",
        keys: ["5", "~", "8"],
        description: "圆弧 (5) / 浮点数 (6) / 整型数 (7) / 字符 (8)",
      },
      {
        id: "ctx-menu",
        icon: "mouse",
        keys: ["鼠标右键"],
        description: "在图元或空白处呼出自定义快捷操作菜单",
      },
    ],
  },
  {
    title: "图元编辑与坐标微调",
    items: [
      {
        id: "nudge-1",
        icon: "arrows",
        keys: ["↑", "↓", "←", "→"],
        description: "以 RM 左下角原点为基准微调选中图元 1 px",
      },
      {
        id: "nudge-10",
        icon: "arrows",
        keys: ["Shift", "+", "方向键"],
        description: "快速步进微调选中图元 10 px",
      },
      {
        id: "copy-paste",
        icon: "keyboard",
        keys: ["Ctrl", "C / V / D"],
        description: "复制、粘贴、再制（自动分配唯一 3 字节短名）",
      },
      {
        id: "delete-key",
        icon: "delete",
        keys: ["Delete", "/", "Backspace"],
        description: "删除当前选中的全部图元",
      },
      {
        id: "undo-redo",
        icon: "keyboard",
        keys: ["Ctrl", "Z / Shift+Z"],
        description: "撤销或重做画布编辑（最多保留 80 步）",
      },
    ],
  },
  {
    title: "工程保存与界面显示",
    items: [
      {
        id: "save-mkui",
        icon: "keyboard",
        keys: ["Ctrl", "S"],
        description: "保存 .mkui 工程包（Ctrl + Shift + S 另存为）",
      },
      {
        id: "toggle-grid",
        icon: "keyboard",
        keys: ["G"],
        description: "切换画布外围点阵网格显示",
      },
      {
        id: "toggle-bg",
        icon: "keyboard",
        keys: ["B"],
        description: "切换官方客户端 1920×1080 底图显示",
      },
      {
        id: "open-help",
        icon: "keyboard",
        keys: ["?", "/", "F1"],
        description: "随时打开或关闭本快捷键操作指南",
      },
    ],
  },
];

function RowIcon({ kind }: { kind: ShortcutRow["icon"] }) {
  switch (kind) {
    case "mouse":
      return <Mouse className="h-3.5 w-3.5 text-[var(--mk-accent-primary)]" />;
    case "move":
      return <Move className="h-3.5 w-3.5 text-[var(--mk-accent-primary)]" />;
    case "zoom":
      return <ZoomIn className="h-3.5 w-3.5 text-[var(--mk-accent-primary)]" />;
    case "delete":
      return <Delete className="h-3.5 w-3.5 text-[var(--mk-status-warn)]" />;
    case "arrows":
      return (
        <span className="flex items-center text-[var(--mk-accent-primary)]">
          <ArrowUp className="h-2.5 w-2.5" />
          <ArrowDown className="h-2.5 w-2.5 -ml-0.5" />
          <ArrowLeft className="h-2.5 w-2.5 -ml-0.5" />
          <ArrowRight className="h-2.5 w-2.5 -ml-0.5" />
        </span>
      );
    default:
      return <Keyboard className="h-3.5 w-3.5 text-[var(--mk-text-secondary)]" />;
  }
}

export function ShortcutsHelpDialog() {
  const open = useAppStore((s) => s.shortcutsModalOpen);
  const setOpen = useAppStore((s) => s.setShortcutsModalOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="快捷键与键鼠操作指南"
        description="MoKairos Studio 画布平移、图元绘制、右键操作与工程快捷键速查"
        className="w-[min(94vw,800px)]"
      >
        <div className="grid max-h-[68vh] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section
              key={group.title}
              className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/80 p-3"
            >
              <h3 className="mb-2.5 text-xs font-semibold text-[var(--mk-text-primary)]">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--mk-radius-sm)] bg-[var(--mk-bg-panel)]/70 px-2.5 py-1.5"
                  >
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--mk-bg-surface)]">
                        <RowIcon kind={item.icon} />
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        {item.keys.map((k, i) =>
                          k === "+" || k === "~" || k === "/" ? (
                            <span
                              key={`${item.id}_${i}`}
                              className="text-[10px] text-[var(--mk-text-muted)]"
                            >
                              {k}
                            </span>
                          ) : (
                            <Kbd key={`${item.id}_${i}`}>{k}</Kbd>
                          ),
                        )}
                      </div>
                    </div>
                    <span className="text-right text-[11px] leading-snug text-[var(--mk-text-secondary)]">
                      {item.description}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
