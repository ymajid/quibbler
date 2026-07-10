# Third-party notices

mercury is MIT-licensed (see `LICENSE`). It includes and depends on the
following third-party software, each under its own license.

## Bundled in the repository / distribution

| Component | Where | License | Copyright |
|---|---|---|---|
| **KX `c.java`** (kdb+ IPC driver) | `java/src/main/java/com/kx/c.java` | Apache-2.0 | © 1998–2017 Kx Systems Inc. |

The Apache License 2.0 text is available at
<https://www.apache.org/licenses/LICENSE-2.0>. The `c.java` file retains its
original copyright and license header.

## Frontend dependencies (bundled into the built assets)

| Component | License |
|---|---|
| [Preact](https://preactjs.com) + `@preact/signals` | MIT |
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | MIT |
| [Apache ECharts](https://echarts.apache.org) | Apache-2.0 |
| [Split.js](https://github.com/nathancahill/split) | MIT |
| [Vite](https://vitejs.dev) (build tool) | MIT |

## Runtime bundle (no-Java Windows download)

The `mercury-win-*.zip` download bundles a Java runtime produced with
`jpackage` from an [Eclipse Temurin](https://adoptium.net) JDK (GPLv2 with the
Classpath Exception). Only the runtime is redistributed; mercury itself remains
MIT-licensed.
