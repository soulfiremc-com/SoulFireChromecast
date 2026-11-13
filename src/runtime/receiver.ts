import {
  DEFAULT_SETTINGS,
  type DisplaySettings,
  MAX_PAYLOAD_BYTES,
  type MetricsDistributions,
  type MetricsSnapshot,
  mergeSnapshots,
  PROTOCOL_VERSION,
  payloadBytes,
  type ReceiverMessage,
  SenderMessage,
  type Visibility,
} from "@soulfiremc/cast-protocol";
import { QueryClient } from "@tanstack/react-query";
import { createStore } from "@tanstack/react-store";
import {
  Clock,
  Effect,
  Fiber,
  type Layer,
  ManagedRuntime,
  Option,
  Queue,
  Schema,
  Stream,
} from "effect";
import { type ReceiverEvent, ReceiverPlatform } from "./platform";

export interface MetricsData {
  readonly snapshots: readonly MetricsSnapshot[];
  readonly distributions: MetricsDistributions;
  readonly instanceInfo: {
    readonly name: string;
    readonly onlineBots: number;
    readonly desiredBots: number;
  };
}
export interface Diagnostic {
  readonly id: number;
  readonly timestamp: number;
  readonly event: string;
}
export interface ReceiverState {
  readonly phase:
    | "starting"
    | "waiting"
    | "connected"
    | "disconnected"
    | "failed";
  readonly visibility: Visibility;
  readonly ownerId: string | null;
  readonly sessionId: string | null;
  readonly instanceId: string | null;
  readonly lastSequence: number;
  readonly lastSeen: number;
  readonly receivedAt: number;
  readonly now: number;
  readonly error: string | null;
  readonly settings: DisplaySettings;
  readonly diagnostics: readonly Diagnostic[];
}
export const metricsKey = (instanceId: string | null) =>
  ["cast-metrics", instanceId] as const;

export function createReceiver(layer: Layer.Layer<ReceiverPlatform>) {
  const runtime = ManagedRuntime.make(layer);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
    },
  });
  const store = createStore<ReceiverState>({
    phase: "starting",
    visibility: "unknown",
    ownerId: null,
    sessionId: null,
    instanceId: null,
    lastSequence: -1,
    lastSeen: 0,
    receivedAt: 0,
    now: 0,
    error: null,
    settings: DEFAULT_SETTINGS,
    diagnostics: [],
  });
  let disposal: Promise<void> | undefined;
  let diagnosticId = 0;
  let fiber: Fiber.Fiber<void, never> | undefined;
  const patch = (update: Partial<ReceiverState>) =>
    store.setState((state) => ({ ...state, ...update }));
  const record = (event: string) =>
    store.setState((state) => ({
      ...state,
      diagnostics: [
        ...state.diagnostics,
        { id: ++diagnosticId, timestamp: state.now, event },
      ].slice(-100),
    }));

  const handle = (event: ReceiverEvent) =>
    Effect.gen(function* () {
      const platform = yield* ReceiverPlatform;
      const now = yield* Clock.currentTimeMillis;
      patch({ now });
      if (event.type === "ready") {
        if (store.get().phase === "starting") patch({ phase: "waiting" });
        record("Cast receiver ready");
        return;
      }
      if (event.type === "visibility") {
        patch({ visibility: event.visibility });
        record(`Display ${event.visibility}`);
        return;
      }
      if (event.type === "shutdown") {
        patch({ ownerId: null, sessionId: null, phase: "disconnected" });
        return;
      }
      if (event.type === "error") {
        patch({ error: event.message, phase: "failed" });
        record(event.message);
        return;
      }
      if (event.type === "disconnected") {
        if (event.senderId === store.get().ownerId) {
          patch({ ownerId: null, sessionId: null, phase: "disconnected" });
          platform.setState("Disconnected");
          record("Sender disconnected");
        }
        return;
      }
      const reply = (message: ReceiverMessage) =>
        platform.send(event.senderId, message);
      const decoded = yield* Effect.try(() =>
        payloadBytes(event.payload) <= MAX_PAYLOAD_BYTES
          ? Schema.decodeUnknownOption(SenderMessage)(event.payload)
          : Option.none(),
      ).pipe(Effect.orElseSucceed(() => Option.none()));
      if (Option.isNone(decoded)) {
        reply({
          type: "ERROR",
          requestId: "",
          code: "INVALID_MESSAGE",
          message: "The Cast message is invalid. Update the desktop client.",
        });
        record("Rejected invalid message");
        return;
      }
      const message = decoded.value;
      const request = {
        requestId: message.requestId,
        sessionId: message.sessionId,
      };
      const state = store.get();
      if (message.type === "HELLO") {
        if (message.version !== PROTOCOL_VERSION) {
          reply({
            type: "ERROR",
            requestId: message.requestId,
            code: "VERSION_MISMATCH",
            message:
              "Update Soulfire and the Cast receiver to compatible versions.",
          });
          return;
        }
        if (
          state.ownerId &&
          (state.ownerId !== event.senderId ||
            state.sessionId !== message.sessionId)
        ) {
          reply({
            type: "ERROR",
            requestId: message.requestId,
            code: "BUSY",
            message:
              "Another Soulfire client controls this display. Stop its cast before connecting.",
          });
          return;
        }
        patch({
          ownerId: event.senderId,
          sessionId: message.sessionId,
          phase: "connected",
          lastSeen: now,
          error: null,
          lastSequence:
            state.sessionId === message.sessionId ? state.lastSequence : -1,
        });
        reply({ type: "READY", ...request, version: PROTOCOL_VERSION });
        platform.setState("Connected, waiting for metrics");
        record("Sender connected");
        return;
      }
      if (
        state.ownerId !== event.senderId ||
        state.sessionId !== message.sessionId
      ) {
        reply({
          type: "ERROR",
          requestId: message.requestId,
          code: "SESSION_MISMATCH",
          message: "This Cast session has expired. Reconnect from Soulfire.",
        });
        return;
      }
      patch({ lastSeen: now });
      switch (message.type) {
        case "METRICS": {
          if (message.sequence > state.lastSequence) {
            if (state.instanceId !== message.instanceId && !message.reset) {
              reply({
                type: "ERROR",
                requestId: message.requestId,
                code: "INVALID_MESSAGE",
                message: "An instance change requires a fresh metrics history.",
              });
              return;
            }
            const previous = queryClient.getQueryData<MetricsData>(
              metricsKey(message.instanceId),
            );
            queryClient.setQueryData<MetricsData>(
              metricsKey(message.instanceId),
              {
                snapshots: mergeSnapshots(
                  message.reset ? [] : (previous?.snapshots ?? []),
                  message.snapshots,
                ),
                distributions: message.distributions,
                instanceInfo: message.instanceInfo,
              },
            );
            if (state.instanceId && state.instanceId !== message.instanceId)
              queryClient.removeQueries({
                queryKey: metricsKey(state.instanceId),
              });
            patch({
              instanceId: message.instanceId,
              lastSequence: message.sequence,
              receivedAt: now,
            });
            platform.setState(message.instanceInfo.name);
          }
          reply({ type: "ACK", ...request });
          break;
        }
        case "SETTINGS":
          patch({ settings: message.settings });
          reply({ type: "ACK", ...request });
          break;
        case "PING": {
          const data = queryClient.getQueryData<MetricsData>(
            metricsKey(state.instanceId),
          );
          reply({
            type: "STATUS",
            ...request,
            visibility: state.visibility,
            lastSequence: state.lastSequence,
            receivedAt: state.receivedAt,
            metricsAt: data?.snapshots.at(-1)?.timestamp ?? 0,
          });
          break;
        }
        case "RELEASE":
          reply({ type: "ACK", ...request });
          patch({ ownerId: null, sessionId: null, phase: "disconnected" });
          platform.stop();
          break;
      }
    });
  const tick = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const state = store.get();
    patch({ now });
    if (state.ownerId && now - state.lastSeen > 30_000) {
      patch({ ownerId: null, sessionId: null, phase: "disconnected" });
      record("Sender heartbeat expired");
    }
  });
  return {
    store,
    queryClient,
    dispatch: (event: ReceiverEvent) => runtime.runPromise(handle(event)),
    start: () => {
      if (fiber || disposal) return;
      const events = Stream.callback<ReceiverEvent, never, ReceiverPlatform>(
        (queue) =>
          Effect.gen(function* () {
            const platform = yield* ReceiverPlatform;
            yield* Effect.acquireRelease(
              Effect.sync(() =>
                platform.subscribe((event) => {
                  Queue.offerUnsafe(queue, event);
                }),
              ),
              (unsubscribe) => Effect.sync(unsubscribe),
            );
            yield* Effect.acquireRelease(Effect.sync(platform.start), () =>
              Effect.sync(platform.stop),
            );
          }),
        { bufferSize: 128, strategy: "dropping" },
      );
      fiber = runtime.runFork(
        Effect.all(
          [
            Stream.runForEach(events, (event) =>
              handle(event).pipe(
                Effect.catchCause((cause) =>
                  Effect.gen(function* () {
                    patch({
                      phase: "failed",
                      error:
                        "The receiver could not process a message. Reconnect from Soulfire.",
                    });
                    yield* Effect.logError(
                      "Cast message processing failed",
                      cause,
                    );
                  }),
                ),
              ),
            ),
            Effect.forever(tick.pipe(Effect.andThen(Effect.sleep("1 second")))),
          ],
          { concurrency: "unbounded", discard: true },
        ).pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              patch({
                phase: "failed",
                error:
                  "The Cast runtime is unavailable. Launch this display from Soulfire.",
              });
              yield* Effect.logError("Cast receiver startup failed", cause);
            }),
          ),
        ),
      );
    },
    dispose: () => {
      disposal ??= (async () => {
        if (fiber) await runtime.runPromise(Fiber.interrupt(fiber));
        await runtime.dispose();
        queryClient.clear();
      })();
      return disposal;
    },
  };
}
export type Receiver = ReturnType<typeof createReceiver>;
