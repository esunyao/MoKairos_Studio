import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Check, ChevronDown } from "lucide-react";
import { LiquidGlassSurface } from "./liquid-glass";
import { cn } from "./cn";

/**
 * 基于 Radix UI 原语的轻量表单与提示控件（Switch / Slider / Select / Tooltip）
 */

export function Switch({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-[var(--mk-border-strong)] bg-[var(--mk-bg-surface)] transition-colors data-[state=checked]:border-[var(--mk-accent-primary)] data-[state=checked]:bg-[var(--mk-accent-primary)]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-150 data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

export function Slider({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex h-5 w-full touch-none select-none items-center",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--mk-bg-surface-hover)]">
        <SliderPrimitive.Range className="absolute h-full bg-[var(--mk-accent-primary)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-3.5 w-3.5 rounded-full border-2 border-[var(--mk-accent-primary)] bg-[var(--mk-bg-panel)] shadow transition-transform hover:scale-110 focus:outline-none cursor-grab active:cursor-grabbing" />
    </SliderPrimitive.Root>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder = "请选择",
  className,
}: {
  value: string;
  onValueChange: (val: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-7 w-full items-center justify-between gap-2 whitespace-nowrap rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2.5 text-xs text-[var(--mk-text-primary)] hover:border-[var(--mk-border-strong)] focus:border-[var(--mk-border-focus)] focus:outline-none cursor-pointer",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon className="shrink-0">
          <ChevronDown className="h-3.5 w-3.5 text-[var(--mk-text-secondary)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[70] min-w-[var(--radix-select-trigger-width)] focus:outline-none"
        >
          <LiquidGlassSurface
            cornerRadius={10}
            elastic={false}
            lightweight={true}
            contentClassName="p-1 text-xs text-[var(--mk-text-primary)]"
          >
            <SelectPrimitive.Viewport>
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  className="relative flex cursor-pointer items-center justify-between rounded-[var(--mk-radius-sm)] px-2.5 py-1.5 outline-none data-[highlighted]:bg-[var(--mk-accent-primary-tint)] data-[highlighted]:text-[var(--mk-accent-primary)]"
                >
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-3.5 w-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </LiquidGlassSurface>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "bottom",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Root delayDuration={280}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[80]"
        >
          <LiquidGlassSurface
            cornerRadius={6}
            elastic={false}
            lightweight={true}
            contentClassName="px-2.5 py-1 text-[11px] text-[var(--mk-text-primary)]"
          >
            {content}
          </LiquidGlassSurface>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
