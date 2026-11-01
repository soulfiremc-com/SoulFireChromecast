import type { MetricsSnapshot } from "@soulfiremc/cast-protocol";
import { barY, defineChart, dot, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";
import type { MetricsData } from "@/runtime/receiver";

const time = (value: number) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const number = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
type Metric = Exclude<keyof MetricsSnapshot, "timestamp">;
interface Series {
  readonly id: Metric;
  readonly label: string;
  readonly color: string;
}
const SERIES = {
  bots: [
    { id: "botsOnline", label: "Online", color: "var(--chart-cyan)" },
    { id: "botsTotal", label: "Total", color: "var(--chart-muted)" },
  ],
  packets: [
    { id: "packetsSentPerSecond", label: "Sent", color: "var(--chart-cyan)" },
    {
      id: "packetsReceivedPerSecond",
      label: "Received",
      color: "var(--chart-amber)",
    },
  ],
  bandwidth: [
    { id: "bytesSentPerSecond", label: "Sent", color: "var(--chart-cyan)" },
    {
      id: "bytesReceivedPerSecond",
      label: "Received",
      color: "var(--chart-amber)",
    },
  ],
  health: [
    { id: "avgHealth", label: "Health", color: "var(--chart-cyan)" },
    { id: "avgFoodLevel", label: "Food", color: "var(--chart-amber)" },
  ],
} as const satisfies Record<string, readonly Series[]>;

export function TimelineChart({
  snapshots,
  kind,
}: {
  snapshots: readonly MetricsSnapshot[];
  kind: keyof typeof SERIES;
}) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: SERIES[kind].map((series) =>
          lineY(snapshots, {
            id: series.id,
            key: "timestamp",
            x: "timestamp",
            y: series.id,
            stroke: series.color,
            strokeWidth: 2,
          }),
        ),
        scales: {
          x: {
            scale: scaleLinear,
            axis: {
              tickLabels: { fontSize: 16 },
              ticks: { count: 4, format: time },
            },
          },
          y: {
            scale: scaleLinear,
            domain: kind === "health" ? [0, 20] : undefined,
            nice: true,
            grid: true,
            axis: {
              ticks: { count: 4, format: (value) => number.format(value) },
            },
          },
        },
      }),
    [snapshots, kind],
  );
  return (
    <>
      <div className="chart-legend">
        {SERIES[kind].map((series) => (
          <span key={series.id} data-series={series.id}>
            {series.label}
          </span>
        ))}
      </div>
      <Chart
        definition={definition}
        className="metric-chart"
        style={{ height: "var(--metric-chart-height)" }}
        ariaLabel={`${kind} over time`}
      />
    </>
  );
}

export function DimensionChart({
  data,
}: {
  data: MetricsData["distributions"]["dimensionCounts"];
}) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(
            Object.entries(data).map(([dimension, count]) => ({
              dimension: dimension.replace("minecraft:", ""),
              count,
            })),
            {
              x: "dimension",
              y: "count",
              fill: "var(--chart-cyan)",
            },
          ),
        ],
        scales: {
          x: {
            scale: () => scaleBand().padding(0.3),
            axis: { tickLabels: { fontSize: 16 } },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { tickLabels: { fontSize: 16 }, ticks: { count: 4 } },
          },
        },
      }),
    [data],
  );
  return (
    <Chart
      definition={definition}
      className="metric-chart"
      style={{ height: "var(--metric-chart-height)" }}
      ariaLabel="Bot counts by dimension"
    />
  );
}

function DimensionPositions({
  positions,
  dimension,
}: {
  positions: MetricsData["distributions"]["botPositions"];
  dimension: string;
}) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          dot(positions, { x: "x", y: "z", r: 3, fill: "var(--chart-cyan)" }),
        ],
        scales: {
          x: {
            scale: scaleLinear,
            nice: true,
            axis: {
              label: "X",
              tickLabels: { fontSize: 16 },
              ticks: { count: 3 },
            },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: {
              label: "Z",
              tickLabels: { fontSize: 16 },
              ticks: { count: 3 },
            },
          },
        },
      }),
    [positions],
  );
  return (
    <div className="position-facet">
      <h3>{dimension.replace("minecraft:", "")}</h3>
      <Chart
        definition={definition}
        className="metric-chart"
        style={{ height: "var(--metric-chart-height)" }}
        ariaLabel={`Bot positions in ${dimension}, X and Z coordinates`}
      />
    </div>
  );
}

export function PositionChart({
  positions,
}: {
  positions: MetricsData["distributions"]["botPositions"];
}) {
  const dimensions = useMemo(
    () =>
      Array.from(new Set(positions.map((position) => position.dimension)))
        .sort()
        .map((dimension) => ({
          dimension,
          positions: positions.filter(
            (position) => position.dimension === dimension,
          ),
        })),
    [positions],
  );
  return dimensions.length ? (
    <div className="position-grid">
      {dimensions.map((entry) => (
        <DimensionPositions key={entry.dimension} {...entry} />
      ))}
    </div>
  ) : (
    <p className="chart-placeholder">No bot positions</p>
  );
}
