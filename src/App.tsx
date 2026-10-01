import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Dashboard from "@/components/dashboard";
import type {
  CastInstanceInfo,
  CastMetricsDistributions,
  CastMetricsMessage,
  CastMetricsSnapshot,
} from "@/lib/cast-protocol";

type RequestTypes =
  | {
      type: "INITIAL_HELLO";
    }
  | {
      type: "CHALLENGE_RESPONSE";
      challenge: string;
    }
  | CastMetricsMessage;

type ResponseTypes =
  | {
      type: "CHALLENGE_REQUEST";
      challenge: string;
    }
  | {
      type: "LOGIN_SUCCESS";
    }
  | {
      type: "GENERIC_MESSAGE";
      message: string;
    };

type Phase = "loading" | "authenticated" | "dashboard";

const MAX_SNAPSHOTS = 20;
const namespace = "urn:x-cast:com.soulfiremc";

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [snapshots, setSnapshots] = useState<CastMetricsSnapshot[]>([]);
  const [distributions, setDistributions] =
    useState<CastMetricsDistributions | null>(null);
  const [instanceInfo, setInstanceInfo] = useState<CastInstanceInfo | null>(
    null,
  );
  const authenticatedRef = useRef(false);

  useEffect(() => {
    const sharedChallenge = Math.random().toString(36);
    const context = cast.framework.CastReceiverContext.getInstance();

    const sendMessageToSender = (message: ResponseTypes) => {
      context.sendCustomMessage(namespace, undefined, message);
    };
    const listener: SystemEventHandler & CustomMessageHandler = (
      customEvent,
    ) => {
      const data = (customEvent as unknown as { data: RequestTypes }).data;
      switch (data.type) {
        case "INITIAL_HELLO":
          sendMessageToSender({
            type: "CHALLENGE_REQUEST",
            challenge: sharedChallenge,
          });
          break;
        case "CHALLENGE_RESPONSE":
          if (data.challenge === sharedChallenge) {
            context.setApplicationState("Showing graphs");
            authenticatedRef.current = true;
            setPhase("authenticated");
            sendMessageToSender({
              type: "LOGIN_SUCCESS",
            });
          } else {
            context.setApplicationState("Invalid challenge");
          }
          break;
        case "METRICS_UPDATE":
          if (authenticatedRef.current) {
            setSnapshots((prev) =>
              [...prev, data.snapshot].slice(-MAX_SNAPSHOTS),
            );
            setDistributions(data.distributions);
            setInstanceInfo(data.instanceInfo);
            setPhase("dashboard");
          }
          break;
        case "METRICS_STOP":
          if (authenticatedRef.current) {
            setSnapshots([]);
            setDistributions(null);
            setInstanceInfo(null);
            setPhase("authenticated");
          }
          break;
      }
    };
    context.addCustomMessageListener(namespace, listener);

    const readyListener: SystemEventHandler = () => {
      sendMessageToSender({
        type: "GENERIC_MESSAGE",
        message: "Hello from Chromecast!",
      });
    };

    context.addEventListener(
      cast.framework.system.EventType.READY,
      readyListener,
    );

    const options = new cast.framework.CastReceiverOptions();
    options.skipPlayersLoad = true;
    options.disableIdleTimeout = true;
    options.customNamespaces = {
      [namespace]: cast.framework.system.MessageType.JSON,
    };

    context.setApplicationState("Loading");
    context.start(options);

    return () => {
      context.removeCustomMessageListener(namespace, listener);
      context.removeEventListener(
        cast.framework.system.EventType.READY,
        readyListener,
      );
      context.stop();
    };
  }, []);

  if (phase === "dashboard" && distributions && instanceInfo) {
    return (
      <Dashboard
        snapshots={snapshots}
        distributions={distributions}
        instanceInfo={instanceInfo}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex">
      <div className="m-auto flex flex-col gap-4">
        <h1 className="text-3xl">
          {phase === "loading"
            ? "SoulFire is loading..."
            : "Connected, waiting for metrics..."}
        </h1>
        <div className="mx-auto">
          <Loader2Icon className="animate-spin" size={32} />
        </div>
      </div>
    </div>
  );
}
