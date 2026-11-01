import { Schema } from "effect";

export const CAST_APP_ID = "3F768D1D";
export const CAST_NAMESPACE = "urn:x-cast:com.soulfiremc";
export const PROTOCOL_VERSION = 1;
export const MAX_PAYLOAD_BYTES = 48 * 1024;
export const MAX_SNAPSHOTS = 600;
export const STALE_AFTER_MS = 15_000;

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Timestamp = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
export const ChartId = Schema.Literals([
  "bots",
  "packets",
  "bandwidth",
  "health",
  "dimensions",
  "positions",
]);
export const DisplaySettings = Schema.Struct({
  charts: Schema.Array(ChartId),
  historySeconds: Schema.Literals([60, 300, 900, 1800]),
  scale: Schema.Literals(["normal", "large"]),
});
export type DisplaySettings = typeof DisplaySettings.Type;
export const DEFAULT_SETTINGS: DisplaySettings = {
  charts: ["bots", "packets", "bandwidth", "health", "dimensions", "positions"],
  historySeconds: 300,
  scale: "normal",
};

export const MetricsSnapshot = Schema.Struct({
  timestamp: Timestamp,
  botsOnline: Count,
  botsTotal: Count,
  packetsSentPerSecond: Schema.Finite,
  packetsReceivedPerSecond: Schema.Finite,
  bytesSentPerSecond: Schema.Finite,
  bytesReceivedPerSecond: Schema.Finite,
  avgTickDurationMs: Schema.Finite,
  maxTickDurationMs: Schema.Finite,
  avgHealth: Schema.Finite,
  avgFoodLevel: Schema.Finite,
  totalLoadedChunks: Count,
  totalTrackedEntities: Count,
  connections: Count,
  disconnections: Count,
});
export type MetricsSnapshot = typeof MetricsSnapshot.Type;
export const MetricsDistributions = Schema.Struct({
  healthHistogram: Schema.Array(Count),
  foodHistogram: Schema.Array(Count),
  dimensionCounts: Schema.Record(Schema.String, Count),
  gameModeCounts: Schema.Record(Schema.String, Count),
  botPositions: Schema.Array(
    Schema.Struct({
      x: Schema.Finite,
      z: Schema.Finite,
      dimension: Schema.String,
    }),
  ),
});
export type MetricsDistributions = typeof MetricsDistributions.Type;
export const InstanceInfo = Schema.Struct({
  name: Schema.String,
  onlineBots: Count,
  desiredBots: Count,
});
export const Visibility = Schema.Literals(["visible", "hidden", "unknown"]);
export type Visibility = typeof Visibility.Type;

const Command = { requestId: Schema.String, sessionId: Schema.String };
export const SenderMessage = Schema.Union([
  Schema.Struct({
    ...Command,
    type: Schema.Literal("HELLO"),
    version: Schema.Int,
  }),
  Schema.Struct({
    ...Command,
    type: Schema.Literal("METRICS"),
    instanceId: Schema.String,
    sequence: Count,
    reset: Schema.Boolean,
    snapshots: Schema.Array(MetricsSnapshot),
    distributions: MetricsDistributions,
    instanceInfo: InstanceInfo,
  }),
  Schema.Struct({
    ...Command,
    type: Schema.Literal("SETTINGS"),
    settings: DisplaySettings,
  }),
  Schema.Struct({ ...Command, type: Schema.Literal("PING") }),
  Schema.Struct({ ...Command, type: Schema.Literal("RELEASE") }),
]);
export type SenderMessage = typeof SenderMessage.Type;
export const ReceiverMessage = Schema.Union([
  Schema.Struct({
    ...Command,
    type: Schema.Literal("READY"),
    version: Schema.Int,
  }),
  Schema.Struct({ ...Command, type: Schema.Literal("ACK") }),
  Schema.Struct({
    ...Command,
    type: Schema.Literal("STATUS"),
    visibility: Visibility,
    lastSequence: Schema.Int,
    metricsAt: Timestamp,
    receivedAt: Timestamp,
  }),
  Schema.Struct({
    requestId: Schema.String,
    type: Schema.Literal("ERROR"),
    code: Schema.Literals([
      "VERSION_MISMATCH",
      "BUSY",
      "INVALID_MESSAGE",
      "SESSION_MISMATCH",
    ]),
    message: Schema.String,
  }),
]);
export type ReceiverMessage = typeof ReceiverMessage.Type;

export const CastDevice = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  address: Schema.String,
  port: Schema.Int.check(
    Schema.isGreaterThanOrEqualTo(1),
    Schema.isLessThanOrEqualTo(65535),
  ),
});
export type CastDevice = typeof CastDevice.Type;
export const CastSource = Schema.Struct({
  address: Schema.String,
  token: Schema.String,
  instanceId: Schema.String,
});
export type CastSource = typeof CastSource.Type;
export const CastPhase = Schema.Literals([
  "idle",
  "connecting",
  "ready",
  "reconnecting",
  "failed",
]);
export const CastDeviceState = Schema.Struct({
  ...CastDevice.fields,
  phase: CastPhase,
  visibility: Visibility,
  error: Schema.NullOr(Schema.String),
  instanceId: Schema.NullOr(Schema.String),
  instanceName: Schema.NullOr(Schema.String),
  metricsAt: Timestamp,
  receivedAt: Timestamp,
});
export type CastDeviceState = typeof CastDeviceState.Type;
export const CastState = Schema.Struct({
  revision: Count,
  devices: Schema.Array(CastDeviceState),
  settings: DisplaySettings,
});
export type CastState = typeof CastState.Type;

export function mergeSnapshots(
  previous: readonly MetricsSnapshot[],
  incoming: readonly MetricsSnapshot[],
): MetricsSnapshot[] {
  const byTime = new Map(previous.map((sample) => [sample.timestamp, sample]));
  for (const sample of incoming) byTime.set(sample.timestamp, sample);
  return Array.from(byTime.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_SNAPSHOTS);
}

export function payloadBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}
