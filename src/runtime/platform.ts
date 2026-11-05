import {
  CAST_NAMESPACE,
  type ReceiverMessage,
  type Visibility,
} from "@soulfiremc/cast-protocol";
import { Context, Layer } from "effect";

export type ReceiverEvent =
  | {
      readonly type: "message";
      readonly senderId: string;
      readonly payload: unknown;
    }
  | { readonly type: "disconnected"; readonly senderId: string }
  | { readonly type: "visibility"; readonly visibility: Visibility }
  | { readonly type: "ready" }
  | { readonly type: "shutdown" }
  | { readonly type: "error"; readonly message: string };

export class ReceiverPlatform extends Context.Service<
  ReceiverPlatform,
  {
    readonly start: () => void;
    readonly stop: () => void;
    readonly subscribe: (
      listener: (event: ReceiverEvent) => void,
    ) => () => void;
    readonly send: (senderId: string, message: ReceiverMessage) => void;
    readonly setState: (state: string) => void;
  }
>()("soulfire/ReceiverPlatform") {}

export const ReceiverPlatformLive = Layer.sync(ReceiverPlatform, () => {
  const context = cast.framework.CastReceiverContext.getInstance();
  return {
    start: () => {
      const options = new cast.framework.CastReceiverOptions();
      options.skipPlayersLoad = true;
      options.disableIdleTimeout = true;
      options.customNamespaces = {
        [CAST_NAMESPACE]: cast.framework.system.MessageType.JSON,
      };
      context.start(options);
    },
    stop: () => context.stop(),
    setState: (state) => context.setApplicationState(state),
    send: (senderId, message) =>
      context.sendCustomMessage(CAST_NAMESPACE, senderId, message),
    subscribe: (listener) => {
      const message: CustomMessageHandler = (event) => {
        listener({
          type: "message",
          senderId: event.senderId,
          payload: event.data,
        });
      };
      const disconnected: SystemEventHandler = (event) => {
        listener({
          type: "disconnected",
          senderId: (event as unknown as { senderId: string }).senderId,
        });
      };
      const visibility = () => {
        const value = context.getVisibilityState();
        listener({
          type: "visibility",
          visibility:
            value === cast.framework.system.VisibilityState.VISIBLE
              ? "visible"
              : value === cast.framework.system.VisibilityState.NOT_VISIBLE
                ? "hidden"
                : "unknown",
        });
      };
      const ready: SystemEventHandler = () => {
        listener({ type: "ready" });
        visibility();
      };
      const shutdown: SystemEventHandler = () => listener({ type: "shutdown" });
      const error: SystemEventHandler = () =>
        listener({
          type: "error",
          message:
            "The Cast runtime reported an error. Reconnect from SoulFire.",
        });
      context.addCustomMessageListener(CAST_NAMESPACE, message);
      const handlers = [
        [cast.framework.system.EventType.READY, ready],
        [cast.framework.system.EventType.SENDER_DISCONNECTED, disconnected],
        [cast.framework.system.EventType.VISIBILITY_CHANGED, visibility],
        [cast.framework.system.EventType.STANDBY_CHANGED, visibility],
        [cast.framework.system.EventType.SHUTDOWN, shutdown],
        [cast.framework.system.EventType.ERROR, error],
      ] as const;
      for (const [type, handler] of handlers)
        context.addEventListener(type, handler);
      return () => {
        context.removeCustomMessageListener(CAST_NAMESPACE, message);
        for (const [type, handler] of handlers)
          context.removeEventListener(type, handler);
      };
    },
  };
});
