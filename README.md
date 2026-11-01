# SoulFire Chromecast

Show SoulFire instance metrics on a Chromecast or Cast-enabled TV. The receiver is a hosted web app launched by the SoulFire desktop client.

## Use the display

1. Open **Cast** from the desktop client's account menu.
2. Choose an instance.
3. Connect to a discovered display, or enter the Cast device's address and port.
4. Choose the charts, history range, and text size in **Display settings**.

Changing the instance selection does not change an active broadcast. **Cast selected instance** switches the display explicitly.

After pressing Home on the TV, use **Show on TV** in the desktop client. This action restarts the SoulFire receiver and restores its history and settings. The client reports receiver readiness separately from visibility. Some devices cannot report visibility.

**Stop casting** stops the receiver and releases the connection. A disconnected receiver retains its last charts and shows a recovery message. Samples more than 15 seconds old show a data-delay notice.

The desktop client must remain running. Metrics acquisition continues when the user changes pages or backgrounds the client. Credentials remain on the desktop.

## Development

Read [CONTRIBUTING.md](CONTRIBUTING.md) for prerequisites, compatibility, validation, and pull requests.
Use the Bun version in `package.json`.

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run check
bun run build
```

Installation builds the local protocol package. `bun run dev` starts Vite for receiver development. A live connection requires a Cast device and the receiver registration in the Cast Developer Console.

## Architecture

- Effect v4 owns startup, CAF event streams, validation, time, and resource cleanup.
- TanStack Store holds receiver connection status, sender ownership, visibility, and display settings.
- TanStack Query holds bounded metrics histories, keyed by instance.
- TanStack Router uses memory history for Overview, Details, and Connection views. Navigation preserves the Cast launch URL.
- TanStack Charts draws the metrics. TanStack Table sorts connection events. TanStack Hotkeys provides keyboard navigation with `1`, `2`, and `3`.

The receiver runtime starts outside React. Development remounts cannot start or stop CAF sessions. History retains at most 600 distinct timestamps. A reset is required when the sender changes instances.

CAF supplies sender identity. One sender owns the display at a time. Commands require its Cast session ID. Replies target that sender. This ownership rule is not user authentication.

## Shared protocol

`packages/cast-protocol` owns the Effect Schema contract used by both repositories. The package builds JavaScript for ESM and CommonJS, plus TypeScript declarations.

For a protocol package update:

1. Change the schemas and update the package version.
2. Run `bun run protocol:pack`.
3. Copy the generated archive from `artifacts/` into `SoulFireClient/vendor/`.
4. Update the client dependency to that archive and regenerate its Bun lockfile.
5. Run both projects' tests and builds.

Archives and compiled package output are generated files in this repository. The client checks in its archive so its builds do not need a sibling checkout or private registry.

Coordinate deployment of this receiver and its desktop client. The previous challenge-based receiver protocol is replaced. A version mismatch requires compatible releases of both applications. App ID `3F768D1D` and namespace `urn:x-cast:com.soulfiremc` remain unchanged.

## Hardware verification

The automated suite uses a simulated CAF platform and Effect's controlled clock. It covers ownership, malformed messages, ordering, history retention, disconnects, expiry, and resource cleanup.

Before release, run this sequence on the supported TV models:

1. Launch from the desktop client and confirm current metrics.
2. Press Home, then use Show on TV and confirm that history returns.
3. Navigate away from the desktop instance overview and background the client.
4. Interrupt the network, restore it, and confirm reconnection.
5. Restart the desktop client and reconnect.
6. Connect from a second client and confirm the ownership response.
7. Stop casting and confirm that the receiver closes.

Physical TV foreground behavior still requires hardware verification. A successful simulated launch does not establish that behavior.

## Contributing and support

Read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and review expectations.
Use [SUPPORT.md](SUPPORT.md) for questions and issue routing.
Follow the [community code of conduct](https://github.com/soulfiremc-com/.github/blob/main/CODE_OF_CONDUCT.md) and report vulnerabilities through the [private security contacts](https://github.com/soulfiremc-com/.github/blob/main/SECURITY.md).
