import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type {
  CastInstanceInfo,
  CastMetricsDistributions,
  CastMetricsSnapshot,
} from "@/lib/cast-protocol";
import {
  TvBandwidthChart,
  TvBotsOnlineChart,
  TvDimensionPieChart,
  TvHealthFoodChart,
  TvNetworkTrafficChart,
  TvPositionScatterChart,
} from "./charts";

function formatNumber(n: number): string {
  if (n < 1000) return n.toFixed(0);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

export default function Dashboard({
  snapshots,
  distributions,
  instanceInfo,
}: {
  snapshots: CastMetricsSnapshot[];
  distributions: CastMetricsDistributions;
  instanceInfo: CastInstanceInfo;
}) {
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  const summaryItems = [
    {
      label: "Online",
      value: latest ? `${latest.botsOnline}/${latest.botsTotal}` : "-/-",
    },
    {
      label: "Pkt/s",
      value: latest
        ? formatNumber(
            latest.packetsSentPerSecond + latest.packetsReceivedPerSecond,
          )
        : "-",
    },
    {
      label: "Traffic",
      value: latest
        ? formatBytes(latest.bytesSentPerSecond + latest.bytesReceivedPerSecond)
        : "-",
    },
    {
      label: "Health",
      value: latest ? latest.avgHealth.toFixed(1) : "-",
    },
    {
      label: "Tick",
      value: latest ? `${latest.avgTickDurationMs.toFixed(1)}ms` : "-",
    },
  ];

  const lastUpdated = latest
    ? new Date(latest.timestamp).toLocaleTimeString()
    : "N/A";

  return (
    <div className="flex h-screen w-screen flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{instanceInfo.friendlyName}</h1>
        <Badge variant="outline" className="border-primary/30 text-primary">
          {instanceInfo.state}
        </Badge>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-5 gap-3">
        {summaryItems.map((item) => (
          <Card key={item.label} size="sm">
            <CardContent className="flex flex-col items-center py-2">
              <span className="text-muted-foreground text-sm">
                {item.label}
              </span>
              <span className="font-mono text-4xl font-bold">{item.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart grid 3x2 */}
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-3">
        <TvBotsOnlineChart snapshots={snapshots} />
        <TvNetworkTrafficChart snapshots={snapshots} />
        <TvBandwidthChart snapshots={snapshots} />
        <TvHealthFoodChart snapshots={snapshots} />
        <TvDimensionPieChart dimensionCounts={distributions.dimensionCounts} />
        <TvPositionScatterChart positions={distributions.botPositions} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Last updated: {lastUpdated}</span>
        <span className="font-medium">SoulFire</span>
      </div>
    </div>
  );
}
