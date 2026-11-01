import { afterEach, expect, test } from "bun:test";
import {
  DEFAULT_SETTINGS,
  MAX_PAYLOAD_BYTES,
  MAX_SNAPSHOTS,
  type MetricsSnapshot,
  mergeSnapshots,
  PROTOCOL_VERSION,
  type ReceiverMessage,
  type SenderMessage,
} from "@soulfiremc/cast-protocol";
import { Clock, Effect, Exit, Layer, Scope } from "effect";
import { TestClock } from "effect/testing";
import { type ReceiverEvent, ReceiverPlatform } from "../src/runtime/platform";
import {
  createReceiver,
  type MetricsData,
  metricsKey,
} from "../src/runtime/receiver";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
});

function sample(timestamp: number): MetricsSnapshot {
  return {
    timestamp,
    botsOnline: 2,
    botsTotal: 3,
    packetsSentPerSecond: 5,
    packetsReceivedPerSecond: 6,
    bytesSentPerSecond: 7,
    bytesReceivedPerSecond: 8,
    avgTickDurationMs: 1,
    maxTickDurationMs: 2,
    avgHealth: 20,
    avgFoodLevel: 20,
    totalLoadedChunks: 10,
    totalTrackedEntities: 2,
    connections: 1,
    disconnections: 0,
  };
}
async function fixture() {
  const scope = Scope.makeUnsafe();
  const clock = await Effect.runPromise(
    TestClock.make().pipe(Effect.provideService(Scope.Scope, scope)),
  );
  const replies: { senderId: string; message: ReceiverMessage }[] = [];
  const listeners = new Set<(event: ReceiverEvent) => void>();
  let starts = 0,
    stops = 0;
  const platform = Layer.succeed(ReceiverPlatform, {
    start: () => {
      starts++;
      for (const listener of listeners) listener({ type: "ready" });
    },
    stop: () => {
      stops++;
    },
    setState: () => {},
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send: (senderId, message) => {
      replies.push({ senderId, message });
    },
  });
  const app = createReceiver(
    Layer.merge(platform, Layer.succeed(Clock.Clock, clock)),
  );
  cleanup.push(async () => {
    await app.dispose();
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
  const send = (payload: unknown, senderId = "owner") =>
    app.dispatch({ type: "message", senderId, payload });
  const hello = (senderId = "owner", sessionId = "session") =>
    send(
      {
        type: "HELLO",
        version: PROTOCOL_VERSION,
        requestId: crypto.randomUUID(),
        sessionId,
      },
      senderId,
    );
  const metrics = (
    sequence: number,
    snapshots = [sample(sequence + 1000)],
    instanceId = "instance",
    reset = sequence === 0,
  ): SenderMessage => ({
    type: "METRICS",
    requestId: crypto.randomUUID(),
    sessionId: "session",
    sequence,
    instanceId,
    reset,
    snapshots,
    distributions: {
      healthHistogram: [],
      foodHistogram: [],
      dimensionCounts: {},
      gameModeCounts: {},
      botPositions: [],
    },
    instanceInfo: { name: instanceId, onlineBots: 2, desiredBots: 3 },
  });
  return {
    app,
    clock,
    replies,
    listeners,
    send,
    hello,
    metrics,
    counts: () => ({ starts, stops }),
  };
}

test("ownership is scoped to the CAF sender and session; replies are directed", async () => {
  const f = await fixture();
  await f.hello();
  await f.hello("intruder", "other");
  expect(f.app.store.get().ownerId).toBe("owner");
  expect(f.replies.at(-1)?.senderId).toBe("intruder");
  expect(f.replies.at(-1)?.message.type).toBe("ERROR");
  await f.send(f.metrics(0), "intruder");
  expect(
    f.app.queryClient.getQueryData(metricsKey("instance")),
  ).toBeUndefined();
  await f.app.dispatch({ type: "disconnected", senderId: "intruder" });
  expect(f.app.store.get().ownerId).toBe("owner");
  await f.app.dispatch({ type: "disconnected", senderId: "owner" });
  await f.hello("replacement", "new-session");
  expect(f.app.store.get().ownerId).toBe("replacement");
});

test("late sequences cannot overwrite metrics, and duplicate samples stay unique", async () => {
  const f = await fixture();
  await f.hello();
  await f.send(f.metrics(0, [sample(1000), sample(2000)]));
  await f.send(f.metrics(1, [sample(2000), sample(3000)]));
  await f.send(f.metrics(0, [sample(500)]));
  const data = f.app.queryClient.getQueryData<MetricsData>(
    metricsKey("instance"),
  );
  expect(data?.snapshots.map((s) => s.timestamp)).toEqual([1000, 2000, 3000]);
  expect(f.app.store.get().lastSequence).toBe(1);
});

test("instance changes require a reset and remove old history", async () => {
  const f = await fixture();
  await f.hello();
  await f.send(f.metrics(0));
  await f.send(f.metrics(1, [sample(4000)], "other", false));
  expect(f.app.store.get().instanceId).toBe("instance");
  await f.send(f.metrics(2, [sample(5000)], "other", true));
  expect(f.app.store.get().instanceId).toBe("other");
  expect(
    f.app.queryClient.getQueryData(metricsKey("instance")),
  ).toBeUndefined();
  expect(
    f.app.queryClient.getQueryData<MetricsData>(metricsKey("other"))?.snapshots,
  ).toEqual([sample(5000)]);
});

test("disconnect preserves the dashboard while an expired owner cannot change it", async () => {
  const f = await fixture();
  await f.hello();
  await f.send(f.metrics(0));
  await f.app.dispatch({ type: "disconnected", senderId: "owner" });
  await f.send(f.metrics(1));
  expect(f.app.store.get().phase).toBe("disconnected");
  expect(
    f.app.queryClient.getQueryData<MetricsData>(metricsKey("instance"))
      ?.snapshots,
  ).toHaveLength(1);
});

test("malformed, oversized, and incompatible commands do not claim the display", async () => {
  const f = await fixture();
  for (const value of [
    null,
    [],
    { type: "HELLO" },
    { data: "x".repeat(MAX_PAYLOAD_BYTES) },
  ])
    await f.send(value);
  await f.send({
    type: "HELLO",
    version: PROTOCOL_VERSION + 1,
    requestId: "request",
    sessionId: "session",
  });
  expect(f.app.store.get().ownerId).toBeNull();
  expect(
    f.replies.every(
      ({ senderId, message }) =>
        senderId === "owner" && message.type === "ERROR",
    ),
  ).toBe(true);
  await f.hello();
  const invalid = {
    ...f.metrics(0),
    snapshots: [{ ...sample(1000), avgHealth: Infinity }],
  };
  await f.send(invalid);
  expect(f.app.store.get().lastSequence).toBe(-1);
});

test("scoped startup runs once and releases every listener", async () => {
  const f = await fixture();
  f.app.start();
  f.app.start();
  await Bun.sleep(10);
  expect(f.counts().starts).toBe(1);
  expect(f.listeners.size).toBe(1);
  await f.hello();
  await f.send(f.metrics(0));
  await Effect.runPromise(f.clock.adjust("31 seconds"));
  await Bun.sleep(10);
  expect(f.app.store.get().phase).toBe("disconnected");
  await f.app.dispose();
  expect(f.listeners.size).toBe(0);
  expect(f.counts().stops).toBe(1);
});

test("settings validate and apply only to the owner", async () => {
  const f = await fixture();
  await f.hello();
  const settings = { ...DEFAULT_SETTINGS, scale: "large" } as const;
  await f.send(
    { type: "SETTINGS", requestId: "settings", sessionId: "session", settings },
    "intruder",
  );
  expect(f.app.store.get().settings.scale).toBe("normal");
  await f.send({
    type: "SETTINGS",
    requestId: "settings",
    sessionId: "session",
    settings,
  });
  expect(f.app.store.get().settings.scale).toBe("large");
});

test("history stays sorted and bounded", () => {
  const history = Array.from({ length: MAX_SNAPSHOTS + 50 }, (_, i) =>
    sample(i),
  );
  const merged = mergeSnapshots(history.slice().reverse(), [
    sample(MAX_SNAPSHOTS + 1),
  ]);
  expect(merged).toHaveLength(MAX_SNAPSHOTS);
  expect(merged[0].timestamp).toBe(50);
  expect(merged.at(-1)?.timestamp).toBe(MAX_SNAPSHOTS + 49);
});

test("a late CAF ready event cannot replace an established connection", async () => {
  const f = await fixture();
  await f.hello();
  await f.app.dispatch({ type: "ready" });
  expect(f.app.store.get().phase).toBe("connected");
  expect(f.app.store.get().ownerId).toBe("owner");
});
