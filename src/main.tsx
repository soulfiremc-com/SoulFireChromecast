import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App, { createReceiverRouter } from "./App.tsx";
import { ReceiverPlatformLive } from "./runtime/platform";
import { createReceiver } from "./runtime/receiver";
import "./index.css";

const receiver = createReceiver(ReceiverPlatformLive);
const router = createReceiverRouter(receiver);
receiver.start();
window.addEventListener(
  "pagehide",
  () => {
    void receiver.dispose();
  },
  { once: true },
);
import.meta.hot?.dispose(() => {
  void receiver.dispose();
});

const root = document.getElementById("root");
if (!root) throw new Error("The receiver root element is missing.");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={receiver.queryClient}>
      <App router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
