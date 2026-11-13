# Contributing to SoulFireChromecast

This repository provides the Cast receiver that displays metrics sent by SoulFireClient.
This guide covers local development, validation, and pull requests.

## Before you start

Search [open and closed issues](https://github.com/soulfiremc-com/SoulFireChromecast/issues) before reporting a problem or proposing a feature.
Small fixes can go directly to a pull request. Discuss substantial changes in an issue before implementation.
For usage questions and issue routing, read [SUPPORT.md](SUPPORT.md).
Follow the [community code of conduct](https://github.com/soulfiremc-com/.github/blob/main/CODE_OF_CONDUCT.md).
Report vulnerabilities privately through the [security policy](https://github.com/soulfiremc-com/.github/blob/main/SECURITY.md).

## Prepare and build

Install Git, Bun at the version in `package.json`, and the Node.js LTS used by CI.
Clone this repository or your fork, then run:

```bash
bun install --frozen-lockfile
bun run dev
```

Vite prints the local preview URL. Use `bun run build` for a production bundle in `dist/`.
Use `bun run preview` to inspect that bundle.
A normal browser preview cannot verify Cast receiver lifecycle or device communication.

## Source layout and protocol

- `src/App.tsx`: receiver routes and display views.
- `src/runtime/`: Effect services for CAF events, sender ownership, and metrics state.
- `packages/cast-protocol/`: shared Effect Schema contract and package build.
- `src/components/MetricsCharts.tsx`: receiver charts.
- `src/components/ui/`: shared UI components.

The receiver uses `urn:x-cast:com.soulfiremc` for custom JSON messages.
Review changes alongside the sender in SoulFireClient's `electron/cast/` services and metrics acquisition worker.
Keep metric units, timestamps, and message types consistent across the sender and receiver.
Document how missing fields, disconnected sessions, and stop messages affect the display.

Follow the Biome configuration and the existing TypeScript conventions.
Use stable React keys, `gap-*` layout utilities, and readable labels.
Try application-level changes before modifying shared UI components.

## Validate

```bash
bun run typecheck
bun test
bun run check
bunx --no-install biome ci
bun run build
```

The automated suite uses a simulated CAF platform and a controlled Effect clock.
Add focused tests for new complex logic. The tests do not replace hardware validation.
For Cast behavior changes, verify on a registered test receiver and a device that you control.
Use the [Cast registration guide](https://developers.google.com/cast/docs/registration) for receiver and device setup.
Coordinate receiver URLs and application registration with a maintainer.
Verify metrics updates, stop handling, reconnect behavior, and the readable display on a television.
Include sender and receiver revisions, device details, and screenshots.
If hardware validation is unavailable, state that limit in the pull request.

## Submit a pull request

Keep the change focused on one problem. Avoid unrelated formatting and dependency updates.
Use Conventional Commit subjects such as `docs(contributing): clarify local setup` or `fix(build): correct packaging`.
Use a meaningful scope, imperative wording, and a subject under 72 characters.
For non-trivial changes, add a body that explains the motivation and important tradeoffs.
For breaking changes, include a `BREAKING CHANGE:` footer and migration instructions.
Do not bypass Git hooks. Let all configured checks finish.

Complete the pull request template with the problem, resulting behavior, and affected files.
If a related issue exists, link it.
Use `Closes #123` only if the change fully resolves that issue.
Record typecheck, Biome, build results, and any browser or Cast device checks.
Explain any checks that you could not perform.
For visible changes, include screenshots and the environment used to capture them.
Open a draft for early feedback on substantial changes.
Respond to review comments and rerun affected checks after revisions.

Update documentation and examples with behavior changes. Remove obsolete code rather than leaving placeholders or shims.
Do not commit credentials, private logs, dependency directories, or generated build artifacts.
Respect existing license notices and submit only material that you have the right to contribute.

## Git hooks

`bun install` installs Lefthook for this checkout and preserves the existing preparation steps.
Run `bun run pre-commit` to run the commit checks manually.
The hooks use the existing project tools. Before pushing, they run the relevant project checks for changed files.
