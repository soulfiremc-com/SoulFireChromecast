import { STALE_AFTER_MS } from "@soulfiremc/cast-protocol";
import { useHotkey } from "@tanstack/react-hotkeys";
import { skipToken, useQuery } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
} from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import {
  type ColumnDef,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import {
  DimensionChart,
  PositionChart,
  TimelineChart,
} from "@/components/MetricsCharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type Diagnostic,
  type MetricsData,
  metricsKey,
  type Receiver,
} from "@/runtime/receiver";

const rootRoute = createRootRouteWithContext<{ receiver: Receiver }>()({
  component: Shell,
});
function useReceiver(): Receiver {
  return rootRoute.useRouteContext().receiver;
}
function useMetrics() {
  const receiver = useReceiver();
  const instanceId = useSelector(receiver.store, (state) => state.instanceId);
  return useQuery<MetricsData>({
    queryKey: metricsKey(instanceId),
    queryFn: skipToken,
  });
}
function Shell() {
  const receiver = useReceiver();
  const state = useSelector(receiver.store, (value) => value);
  const { data } = useMetrics();
  const navigate = useNavigate();
  useHotkey("1", () => {
    void navigate({ to: "/" });
  });
  useHotkey("2", () => {
    void navigate({ to: "/details" });
  });
  useHotkey("3", () => {
    void navigate({ to: "/diagnostics" });
  });
  const latest = data?.snapshots.at(-1);
  const stale = latest && state.now - latest.timestamp > STALE_AFTER_MS;
  const notice =
    state.error ??
    (state.phase === "disconnected"
      ? "The desktop client disconnected. Use Reconnect in SoulFire to resume this display."
      : stale
        ? "Metrics stopped updating. Check the SoulFire server connection in the desktop client."
        : !latest
          ? "Choose an instance and connect to this display from SoulFire’s Cast page."
          : null);
  return (
    <div
      className={
        state.settings.scale === "large" ? "receiver display-large" : "receiver"
      }
    >
      <header className="receiver-header">
        <div className="brand">
          <img src="/icon.svg" alt="" width={40} height={40} />
          <div>
            <p className="product-name">SoulFire</p>
            <h1>{data?.instanceInfo.name ?? "Cast display"}</h1>
          </div>
        </div>
        <div className="receiver-status">
          <span>
            {state.phase === "connected"
              ? stale
                ? "Data delayed"
                : latest
                  ? "Connected"
                  : "Waiting for metrics"
              : state.phase === "starting"
                ? "Starting"
                : state.phase === "waiting"
                  ? "Waiting for a connection"
                  : state.phase === "failed"
                    ? "Connection error"
                    : "Disconnected"}
          </span>
          <span>
            {latest
              ? `Updated ${new Date(latest.timestamp).toLocaleTimeString()}`
              : "No metrics received"}
          </span>
        </div>
      </header>
      <nav className="receiver-nav" aria-label="Display views">
        <Link to="/" activeOptions={{ exact: true }}>
          Overview
        </Link>
        <Link to="/details">Details</Link>
        <Link to="/diagnostics">Connection</Link>
      </nav>
      {notice && (
        <Alert>
          <AlertTitle>
            {state.error
              ? "Connection error"
              : stale
                ? "Data delayed"
                : "Cast display"}
          </AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <main>
        <Outlet />
      </main>
    </div>
  );
}
function Dashboard() {
  const receiver = useReceiver();
  const settings = useSelector(receiver.store, (state) => state.settings);
  const { data } = useMetrics();
  const latest = data?.snapshots.at(-1);
  const snapshots = useMemo(
    () =>
      data?.snapshots.filter(
        (sample) =>
          sample.timestamp >=
          (latest?.timestamp ?? 0) - settings.historySeconds * 1000,
      ) ?? [],
    [data, latest, settings.historySeconds],
  );
  const summaries = [
    {
      id: "bots",
      label: "Bots online",
      value: latest ? `${latest.botsOnline} / ${latest.botsTotal}` : "…",
    },
    {
      id: "packets",
      label: "Packets / second",
      value: latest
        ? Math.round(
            latest.packetsSentPerSecond + latest.packetsReceivedPerSecond,
          ).toLocaleString()
        : "…",
    },
    {
      id: "bandwidth",
      label: "Traffic",
      value: latest
        ? `${((latest.bytesSentPerSecond + latest.bytesReceivedPerSecond) / 1024).toFixed(1)} KiB/s`
        : "…",
    },
    {
      id: "health",
      label: "Average health",
      value: latest ? `${latest.avgHealth.toFixed(1)} / 20` : "…",
    },
    {
      id: "tick",
      label: "Average tick",
      value: latest ? `${latest.avgTickDurationMs.toFixed(1)} ms` : "…",
    },
  ];
  const titles = {
    bots: "Bots online",
    packets: "Packets / second",
    bandwidth: "Bytes / second",
    health: "Health and food",
    dimensions: "Dimensions",
    positions: "Bot positions",
  };
  return (
    <>
      <dl className="metrics-summary">
        {summaries.map((item) => (
          <div key={item.id}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="chart-grid">
        {settings.charts.map((id) => (
          <section className="chart-panel" key={id}>
            <h2>{titles[id]}</h2>
            {!data || !latest ? (
              <p className="chart-placeholder">Waiting for metrics</p>
            ) : id === "dimensions" ? (
              <DimensionChart data={data.distributions.dimensionCounts} />
            ) : id === "positions" ? (
              <PositionChart positions={data.distributions.botPositions} />
            ) : (
              <TimelineChart kind={id} snapshots={snapshots} />
            )}
          </section>
        ))}
      </div>
      {settings.charts.length === 0 && (
        <p>No charts selected. Choose charts in the desktop Cast settings.</p>
      )}
    </>
  );
}
function Details() {
  const { data } = useMetrics();
  const latest = data?.snapshots.at(-1);
  const values = latest
    ? ([
        ["Bots online", latest.botsOnline],
        ["Total bots", latest.botsTotal],
        ["Average health", latest.avgHealth],
        ["Average food", latest.avgFoodLevel],
        ["Loaded chunks", latest.totalLoadedChunks],
        ["Tracked entities", latest.totalTrackedEntities],
        ["Connections / sample", latest.connections],
        ["Disconnections / sample", latest.disconnections],
        ["Average tick (ms)", latest.avgTickDurationMs],
        ["Maximum tick (ms)", latest.maxTickDurationMs],
      ] as const)
    : [];
  return (
    <section>
      <h2>Current metrics</h2>
      <dl className="metric-details">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      {!latest && <p>Waiting for metrics</p>}
    </section>
  );
}
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const columns: ColumnDef<typeof features, Diagnostic>[] = [
  {
    accessorKey: "timestamp",
    header: "Time",
    cell: ({ row }) => new Date(row.original.timestamp).toLocaleTimeString(),
  },
  { accessorKey: "event", header: "Event" },
];
function Diagnostics() {
  const receiver = useReceiver();
  const state = useSelector(receiver.store, (value) => value);
  const table = useTable({
    features,
    data: state.diagnostics,
    columns,
    getRowId: (row) => String(row.id),
    initialState: { sorting: [{ id: "timestamp", desc: true }] },
  });
  return (
    <section>
      <h2>Connection</h2>
      <dl className="connection-details">
        <div>
          <dt>Receiver visibility</dt>
          <dd>{state.visibility}</dd>
        </div>
        <div>
          <dt>Cast connection</dt>
          <dd>{state.phase}</dd>
        </div>
        <div>
          <dt>Samples received through sequence</dt>
          <dd>{state.lastSequence < 0 ? "None" : state.lastSequence}</dd>
        </div>
      </dl>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <table.FlexRender header={header} />
                  </button>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
const overview = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Dashboard,
});
const details = createRoute({
  getParentRoute: () => rootRoute,
  path: "/details",
  component: Details,
});
const diagnostics = createRoute({
  getParentRoute: () => rootRoute,
  path: "/diagnostics",
  component: Diagnostics,
});
export function createReceiverRouter(receiver: Receiver) {
  return createRouter({
    routeTree: rootRoute.addChildren([overview, details, diagnostics]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { receiver },
  });
}
export default function App({
  router,
}: {
  router: ReturnType<typeof createReceiverRouter>;
}) {
  return <RouterProvider router={router} />;
}
