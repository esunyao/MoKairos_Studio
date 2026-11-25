import { create } from "zustand";
import type { RmColorId } from "@/domain/protocol/constants";
import type { EncodedProtocolPacket } from "@/domain/protocol/crcAndFrame";

/**
 * 本地 HUD 模拟器与协议帧日志状态 Store
 */

export type SimulatorMode = "local_mock" | "from_robot" | "to_referee";

export interface TelemetryOverride {
  value?: number;
  text?: string;
  startAngle?: number;
  endAngle?: number;
  endX?: number;
  endY?: number;
  color?: RmColorId;
  visible?: boolean;
}

const MAX_PACKET_LOGS = 500;

interface SimulatorState {
  mode: SimulatorMode;
  running: boolean;
  refreshHz: number;
  baudRate: number;
  serialPort: string;
  overrides: Record<string, TelemetryOverride>;
  packetLogs: EncodedProtocolPacket[];

  setMode: (mode: SimulatorMode) => void;
  setRunning: (running: boolean) => void;
  setRefreshHz: (hz: number) => void;
  setSerialConfig: (port: string, baudRate: number) => void;
  setGraphicOverride: (graphicId: string, patch: Partial<TelemetryOverride>) => void;
  resetOverrides: () => void;
  appendPacketLogs: (packets: EncodedProtocolPacket[]) => void;
  clearPacketLogs: () => void;
}

export const useSimulatorStore = create<SimulatorState>((set) => ({
  mode: "local_mock",
  running: true,
  refreshHz: 10,
  baudRate: 115200,
  serialPort: "COM4 (模拟占位)",
  overrides: {},
  packetLogs: [],

  setMode: (mode) => set({ mode }),
  setRunning: (running) => set({ running }),
  setRefreshHz: (refreshHz) => set({ refreshHz }),
  setSerialConfig: (serialPort, baudRate) => set({ serialPort, baudRate }),

  setGraphicOverride: (graphicId, patch) =>
    set((s) => ({
      overrides: {
        ...s.overrides,
        [graphicId]: {
          ...s.overrides[graphicId],
          ...patch,
        },
      },
    })),

  resetOverrides: () => set({ overrides: {} }),

  appendPacketLogs: (packets) =>
    set((s) => ({
      packetLogs: [...packets.slice().reverse(), ...s.packetLogs].slice(
        0,
        MAX_PACKET_LOGS,
      ),
    })),

  clearPacketLogs: () => set({ packetLogs: [] }),
}));
