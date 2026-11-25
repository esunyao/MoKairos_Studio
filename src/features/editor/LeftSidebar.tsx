import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Lock,
  Plus,
  Trash2,
  Unlock,
} from "lucide-react";
import { LayerChipBar } from "@/components/protocol/LayerChipBar";
import { Button } from "@/components/ui/Button";
import { Slider } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/cn";
import { GRAPHIC_KIND_MAP, getProtocolColorHex } from "@/domain/protocol/constants";
import type { LayerIndex, MkuiFrame } from "@/domain/protocol/types";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";

/**
 * 左侧 240px 面板：图层树（Layers）/ 多画面（Frames）/ 底图资源（Assets）+ L0-L9 过滤芯片条
 */

type LeftTab = "layers" | "frames" | "assets";

export function LeftSidebar({ activeFrame }: { activeFrame: MkuiFrame }) {
  const [tab, setTab] = useState<LeftTab>("layers");
  const [newGroupName, setNewGroupName] = useState("");
  const [newFrameName, setNewFrameName] = useState("");

  const doc = useDocumentStore((s) => s.doc);
  const setActiveFrame = useDocumentStore((s) => s.setActiveFrame);
  const addFrame = useDocumentStore((s) => s.addFrame);
  const duplicateFrame = useDocumentStore((s) => s.duplicateFrame);
  const deleteFrame = useDocumentStore((s) => s.deleteFrame);

  const addGroup = useDocumentStore((s) => s.addGroup);
  const toggleGroupProp = useDocumentStore((s) => s.toggleGroupProp);
  const deleteGroup = useDocumentStore((s) => s.deleteGroup);
  const updateGraphic = useDocumentStore((s) => s.updateGraphic);

  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const toggleSelection = useCanvasStore((s) => s.toggleSelection);
  const previewTeam = useCanvasStore((s) => s.previewTeam);
  const visibleLayers = useCanvasStore((s) => s.visibleLayers);
  const isolatedLayer = useCanvasStore((s) => s.isolatedLayer);
  const toggleLayerVisible = useCanvasStore((s) => s.toggleLayerVisible);
  const isolateLayer = useCanvasStore((s) => s.isolateLayer);

  const showBackground = useCanvasStore((s) => s.showBackground);
  const toggleBackground = useCanvasStore((s) => s.toggleBackground);
  const backgroundOpacity = useCanvasStore((s) => s.backgroundOpacity);
  const setBackgroundOpacity = useCanvasStore((s) => s.setBackgroundOpacity);
  const customBackgroundUrl = useCanvasStore((s) => s.customBackgroundUrl);
  const setCustomBackgroundUrl = useCanvasStore((s) => s.setCustomBackgroundUrl);

  const countsByLayer = useMemo(() => {
    const counts: Record<LayerIndex, number> = {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0,
    };
    for (const g of activeFrame.graphics) {
      counts[g.layer] = (counts[g.layer] ?? 0) + 1;
    }
    return counts;
  }, [activeFrame.graphics]);

  const handleUploadCustomBg = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setCustomBackgroundUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <aside className="flex w-[var(--mk-sidebar-width)] shrink-0 flex-col border-r border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)]">
      {/* 标签切换 */}
      <div className="grid grid-cols-3 border-b border-[var(--mk-border-subtle)] p-1 text-xs">
        {[
          { id: "layers" as const, label: "图层", icon: Layers },
          { id: "frames" as const, label: "画面" },
          { id: "assets" as const, label: "底图", icon: ImageIcon },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-[var(--mk-radius-sm)] py-1.5 font-medium transition-colors cursor-pointer",
              tab === item.id
                ? "bg-[var(--mk-bg-surface)] text-[var(--mk-text-primary)]"
                : "text-[var(--mk-text-secondary)] hover:text-[var(--mk-text-primary)]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 主内容列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
        {tab === "layers" && (
          <div className="space-y-2">
            <div className="flex gap-1">
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="新建分组名…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGroupName.trim()) {
                    addGroup(newGroupName);
                    setNewGroupName("");
                  }
                }}
              />
              <Button
                variant="secondary"
                size="icon"
                title="添加图元分组"
                onClick={() => {
                  addGroup(newGroupName || `Group_${activeFrame.groups.length + 1}`);
                  setNewGroupName("");
                }}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {activeFrame.groups.map((grp) => {
              const items = activeFrame.graphics.filter((g) => g.groupId === grp.id);
              return (
                <div
                  key={grp.id}
                  className="rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/50"
                >
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => toggleGroupProp(grp.id, "collapsed")}
                      className="flex min-w-0 flex-1 items-center gap-1 text-left font-medium text-[var(--mk-text-primary)] cursor-pointer"
                    >
                      {grp.collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--mk-text-muted)]" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--mk-text-muted)]" />
                      )}
                      <span className="truncate">{grp.name}</span>
                      <span className="mk-tabular text-[10px] text-[var(--mk-text-muted)]">
                        ({items.length})
                      </span>
                    </button>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleGroupProp(grp.id, "visible")}
                        className="p-0.5 text-[var(--mk-text-secondary)] hover:text-[var(--mk-text-primary)] cursor-pointer"
                        title="切换分组显隐"
                      >
                        {grp.visible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3 opacity-50" />
                        )}
                      </button>
                      {activeFrame.groups.length > 1 && (
                        <button
                          type="button"
                          onClick={() => deleteGroup(grp.id)}
                          className="p-0.5 text-[var(--mk-text-muted)] hover:text-[var(--mk-status-error)] cursor-pointer"
                          title="删除分组（图元迁至默认组）"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {!grp.collapsed && items.length > 0 && (
                    <div className="space-y-0.5 border-t border-[var(--mk-border-subtle)] p-1">
                      {items.map((g) => {
                        const selected = selectedIds.includes(g.id);
                        const colorHex = getProtocolColorHex(g.color, previewTeam);
                        return (
                          <div
                            key={g.id}
                            onClick={(e) => {
                              if (e.shiftKey) {
                                toggleSelection(g.id);
                              } else {
                                setSelectedIds([g.id]);
                              }
                            }}
                            className={cn(
                              "flex items-center justify-between gap-1.5 rounded-[4px] px-1.5 py-1 transition-colors cursor-pointer",
                              selected
                                ? "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-text-primary)]"
                                : "hover:bg-[var(--mk-bg-surface-hover)] text-[var(--mk-text-secondary)]",
                            )}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full border border-white/20"
                                style={{ backgroundColor: colorHex }}
                              />
                              <span className="truncate text-[11px]">
                                {g.displayName}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <span className="mk-tabular text-[10px] text-[var(--mk-text-muted)]">
                                {g.figureName}·L{g.layer}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateGraphic(g.id, { visible: !g.visible }, false);
                                }}
                                className="text-[var(--mk-text-muted)] hover:text-[var(--mk-text-primary)] cursor-pointer"
                                title={g.visible ? "隐藏" : "显示"}
                              >
                                {g.visible ? (
                                  <Eye className="h-3 w-3" />
                                ) : (
                                  <EyeOff className="h-3 w-3 opacity-50" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateGraphic(g.id, { locked: !g.locked }, false);
                                }}
                                className="text-[var(--mk-text-muted)] hover:text-[var(--mk-text-primary)] cursor-pointer"
                                title={g.locked ? "解锁" : "锁定"}
                              >
                                {g.locked ? (
                                  <Lock className="h-3 w-3 text-[var(--mk-status-warn)]" />
                                ) : (
                                  <Unlock className="h-3 w-3 opacity-60" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!grp.collapsed && items.length === 0 && (
                    <div className="px-2 py-1.5 text-[10px] text-[var(--mk-text-muted)]">
                      暂无图元（{GRAPHIC_KIND_MAP.line.shortLabel}等可加入此组）
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "frames" && (
          <div className="space-y-2">
            <div className="flex gap-1">
              <Input
                value={newFrameName}
                onChange={(e) => setNewFrameName(e.target.value)}
                placeholder="新画面名 (如 Combat)…"
              />
              <Button
                variant="secondary"
                size="icon"
                title="新建画面"
                onClick={() => {
                  addFrame(newFrameName || `Frame_${doc.frames.length + 1}`);
                  setNewFrameName("");
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-1">
              {doc.frames.map((f) => {
                const active = f.id === doc.activeFrameId;
                return (
                  <div
                    key={f.id}
                    onClick={() => setActiveFrame(f.id)}
                    className={cn(
                      "flex items-center justify-between rounded-[var(--mk-radius-sm)] border px-2.5 py-2 transition-colors cursor-pointer",
                      active
                        ? "border-[var(--mk-border-focus)] bg-[var(--mk-accent-primary-tint)]"
                        : "border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] hover:border-[var(--mk-border-strong)]",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--mk-text-primary)]">
                        {f.name}
                      </div>
                      <div className="mk-tabular text-[10px] text-[var(--mk-text-muted)]">
                        {f.graphics.length} 个图元 · {f.groups.length} 组
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="复制画面"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateFrame(f.id, `${f.name}_Copy`);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      {doc.frames.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="删除画面"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteFrame(f.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "assets" && (
          <div className="space-y-3 p-1">
            <div className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--mk-text-primary)]">
                  客户端基准底图
                </span>
                <Button
                  size="xs"
                  variant={showBackground ? "primary" : "secondary"}
                  onClick={toggleBackground}
                >
                  {showBackground ? "已显示" : "已隐藏"}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-[var(--mk-text-secondary)]">
                固定铺满 1920×1080 逻辑画板，仅作设计参考与避让标定，绝不进入固件代码。
              </p>
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-[11px] text-[var(--mk-text-muted)]">
                  <span>底图不透明度</span>
                  <span className="mk-tabular">
                    {Math.round(backgroundOpacity * 100)}%
                  </span>
                </div>
                <Slider
                  value={[Math.round(backgroundOpacity * 100)]}
                  min={10}
                  max={100}
                  step={5}
                  onValueChange={([v]) => setBackgroundOpacity((v ?? 90) / 100)}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-2.5">
              <div className="font-medium text-[var(--mk-text-primary)]">
                赛场实景 / 自定义参考图
              </div>
              <p className="text-[11px] text-[var(--mk-text-secondary)]">
                用于测试高曝光白墙或暗色赛场图下的线框可读性。
              </p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={handleUploadCustomBg}
                >
                  载入本地图片
                </Button>
                {customBackgroundUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCustomBackgroundUrl(null)}
                  >
                    恢复官方图
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部常驻 L0-L9 图层过滤条 */}
      <LayerChipBar
        visibleLayers={visibleLayers}
        isolatedLayer={isolatedLayer}
        countsByLayer={countsByLayer}
        onToggleLayer={toggleLayerVisible}
        onIsolateLayer={isolateLayer}
      />
    </aside>
  );
}
