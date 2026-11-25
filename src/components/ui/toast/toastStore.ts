import { create } from "zustand";

/**
 * 公共复用 Toast 消息通知状态容器（与业务视图解耦）
 */

export type ToastTone = "info" | "success" | "warn" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  tone?: ToastTone;
  title: string;
  description?: string;
  /** 自动关闭毫秒数；传入 0 表示常驻直到手动关闭 */
  duration?: number;
  action?: ToastAction;
}

export interface ToastRecord {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
  createdAt: number;
  action?: ToastAction;
}

interface ToastState {
  items: ToastRecord[];
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const MAX_VISIBLE_TOASTS = 4;
const DEDUP_WINDOW_MS = 600;

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],

  show: (options) => {
    const now = Date.now();
    const tone: ToastTone = options.tone ?? "info";
    const duration =
      options.duration !== undefined
        ? options.duration
        : tone === "error"
          ? 5200
          : 3800;

    // 防短时间重复刷屏
    const existing = get().items.find(
      (item) =>
        item.tone === tone &&
        item.title === options.title &&
        item.description === options.description &&
        now - item.createdAt < DEDUP_WINDOW_MS,
    );
    if (existing) {
      return existing.id;
    }

    const id = `toast_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const nextItem: ToastRecord = {
      id,
      tone,
      title: options.title,
      description: options.description,
      duration,
      createdAt: now,
      action: options.action,
    };

    set((state) => ({
      items: [...state.items, nextItem].slice(-MAX_VISIBLE_TOASTS),
    }));
    return id;
  },

  dismiss: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),

  clear: () => set({ items: [] }),
}));

/** 命令式全局通知 API（可在组件、Store、Service 与快捷键中直接调用） */
export const toast = {
  show: (options: ToastOptions) => useToastStore.getState().show(options),
  info: (title: string, opts?: Omit<ToastOptions, "title" | "tone">) =>
    useToastStore.getState().show({ ...opts, title, tone: "info" }),
  success: (title: string, opts?: Omit<ToastOptions, "title" | "tone">) =>
    useToastStore.getState().show({ ...opts, title, tone: "success" }),
  warn: (title: string, opts?: Omit<ToastOptions, "title" | "tone">) =>
    useToastStore.getState().show({ ...opts, title, tone: "warn" }),
  error: (title: string, opts?: Omit<ToastOptions, "title" | "tone">) =>
    useToastStore.getState().show({ ...opts, title, tone: "error" }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
};
