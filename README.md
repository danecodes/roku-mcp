# roku-mcp

[![npm version](https://img.shields.io/npm/v/@danecodes/roku-mcp)](https://www.npmjs.com/package/@danecodes/roku-mcp)
[![CI](https://github.com/danecodes/roku-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/danecodes/roku-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server and CLI that lets AI agents (and developers) interact with Roku devices.

Your coding agent can see what's on the Roku screen, send remote control input, and query device state — all through the [Model Context Protocol](https://modelcontextprotocol.io) or a simple CLI.

## What it does

- **Inspect the UI** — query the SceneGraph node tree to see what's displayed on screen
- **Find elements** — CSS-like selectors against SceneGraph nodes (`HomePage HomeHeroCarousel`, `AppButton#play_button`)
- **Send input** — remote control keys, text entry
- **Launch apps** — start channels with deep link parameters
- **Query state** — device info, media player, active app, installed apps

## Configuration

Set your Roku device IP address:

- **MCP server:** Set `ROKU_DEVICE_IP` environment variable in your MCP config (see below)
- **CLI:** Use `--device <ip>` flag (defaults to `192.168.0.30`)
- **Screenshots:** Set `ROKU_DEV_PASSWORD` if your dev password isn't `rokudev`

## Quick start

### As an MCP server (Claude Code, Cursor, etc.)

Add to your `.mcp.json` (project root or `~/.claude/.mcp.json` for global):

```json
{
  "mcpServers": {
    "roku": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "--package", "@danecodes/roku-mcp", "roku-mcp-server"],
      "env": {
        "ROKU_DEVICE_IP": "192.168.0.30"
      }
    }
  }
}
```

To auto-approve all Roku tool calls (so you don't get prompted each time), add to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["mcp__roku"]
  }
}
```

Your agent now has these tools:

**Device control**

| Tool | Description |
|------|-------------|
| `roku_ui_tree` | Get the full SceneGraph UI tree — see what's on screen |
| `roku_find_element` | Find elements by CSS-like selector |
| `roku_press_key` | Send remote control key press (Select, Up, Down, etc.) |
| `roku_type_text` | Type text into keyboard inputs |
| `roku_screenshot` | Take a screenshot, optionally save to disk |
| `roku_launch` | Launch a channel with optional deep link params |
| `roku_deep_link` | Deep link directly into content by ID |
| `roku_close_app` | Close the running app (press Home) |
| `roku_sideload` | Deploy a .zip package to the device |
| `roku_device_info` | Get device model, software version, network info |
| `roku_active_app` | Get the currently running app |
| `roku_media_player` | Get playback state (position, duration, format) |
| `roku_installed_apps` | List all installed channels |
| `roku_console_log` | Read BrightScript debug console output (errors, print statements, crashes) |
| `roku_console_command` | Send debug commands (bt, var, cont, step, over, out) |
| `roku_volume` | Volume up, down, or mute |
| `roku_input` | Send custom input parameters to the running app |

**Test runner (Shift Left)**

| Tool | Description |
|------|-------------|
| `roku_wait_for` | Poll until a selector appears on screen with configurable timeout — use after navigation |
| `roku_assert_element` | Assert an element exists, is focused, or has a specific attribute value — returns pass/fail JSON |
| `roku_sideload_and_watch` | Sideload a zip + watch console for errors/crashes — returns CI-ready pass/fail report |
| `roku_smoke_test` | Launch app, verify UI renders, optionally verify playback — full pass/fail with step detail |

**Agent efficiency**

| Tool | Description |
|------|-------------|
| `roku_focused_element` | Return only the currently focused element — token-efficient alternative to full tree scan |
| `roku_screen_name` | Infer the current screen name from the SceneGraph root component |
| `roku_console_watch` | Monitor console for a pattern match during a time window — pass/fail with matching lines |

**Shift Left quality gates**

| Tool | Description |
|------|-------------|
| `roku_cert_preflight` | Run Roku cert failure checklist (back nav, Home exit, relaunch, error scan) |
| `roku_chanperf_sample` | Sample CPU usage via chanperf for a configurable duration — high watermark + pass/fail |

### As a CLI

```bash
# Inspect the UI tree
npx roku-mcp ui tree --device 192.168.0.30
npx roku-mcp ui tree --depth 4
npx roku-mcp ui tree --all-attrs

# Find specific elements
npx roku-mcp ui find "HomePage HomeHeroCarousel"
npx roku-mcp ui find "BebopNavMenu BebopMenuButton#Home"
npx roku-mcp ui find "AppLabel" --all-attrs

# Send key presses
npx roku-mcp press Select
npx roku-mcp press Down --times 3 --delay 200

# Type text
npx roku-mcp type "search query"

# Launch apps
npx roku-mcp launch dev
npx roku-mcp launch dev --params '{"contentId":"12345","mediaType":"episode"}'

# Device info
npx roku-mcp info device
npx roku-mcp info app
npx roku-mcp info apps
npx roku-mcp info player

# Raw XML source
npx roku-mcp ui source
```

### As a library

```typescript
import { EcpClient, Key, parseUiXml, findElement } from 'roku-mcp';

const roku = new EcpClient('192.168.0.30');

// Send keys
await roku.press(Key.Down, { times: 3 });
await roku.press(Key.Select);

// Inspect the UI
const xml = await roku.queryAppUi();
const tree = await parseUiXml(xml);
const button = findElement(tree, 'AppButton#play_button');
console.log(button?.attrs.focused); // "true"
console.log(button?.attrs.text);    // "Play"

// Query state
const player = await roku.queryMediaPlayer();
const app = await roku.queryActiveApp();
```

## Selector syntax

Find elements using CSS-like selectors against SceneGraph node names:

| Selector | Matches |
|----------|---------|
| `HomePage` | Node with tag `HomePage` |
| `AppButton#play_button` | `AppButton` with `name="play_button"` |
| `#titleLabel` | Any node with `name="titleLabel"` |
| `HomePage HomeHeroCarousel` | `HomeHeroCarousel` anywhere inside `HomePage` |
| `LayoutGroup > AppLabel` | `AppLabel` that is a direct child of `LayoutGroup` |
| `AppButton:nth-child(1)` | First `AppButton` among siblings |
| `CollectionModule + CollectionModule` | `CollectionModule` immediately after another |

## Smoke test demo

Point a coding agent at a dev build and it will sideload, test, and report — screenshot the output and send it to your manager.

```
You: Sideload the build at ./target/crunchyroll-dev.zip and run a smoke test.
     Deep link to content ID "GG5H5XQ7R" (episode) and verify playback starts.

Agent: I'll sideload the build and watch the console for errors first.

  → roku_sideload_and_watch(zip_path: "./target/crunchyroll-dev.zip", duration: 30000)

  {
    "passed": true,
    "message": "PASS: Install Success — no errors in 30s of console output",
    "sideload_result": "Install Success",
    "errors": [],
    "crashes": [],
    "exceptions": []
  }

Agent: Clean install. Now running the smoke test with playback verification.

  → roku_smoke_test(
      content_id: "GG5H5XQ7R",
      media_type: "episode",
      ui_timeout: 15000,
      playback_timeout: 30000
    )

  {
    "passed": true,
    "message": "PASS: App launched, UI rendered, and playback started",
    "steps": [
      { "name": "launch",     "passed": true, "message": "Deep linked to \"GG5H5XQ7R\" in channel dev" },
      { "name": "ui_visible", "passed": true, "message": "UI rendered after 2340ms", "elapsed_ms": 2340 },
      { "name": "playback",   "passed": true, "message": "Player reached \"play\" after 8710ms", "elapsed_ms": 8710 }
    ],
    "player_state": {
      "state": "play",
      "error": false,
      "position": "00:00:08",
      "duration": "00:42:17"
    }
  }

Agent: All green. Build sideloaded cleanly, UI rendered in 2.3s, playback started in 8.7s.
```

You can also run this entirely from the CLI for CI integration:

```bash
# Sideload and watch for errors
npx roku-dev test sideload-watch ./target/build.zip --duration 30000

# Full smoke test with playback verification
npx roku-dev test smoke --content-id GG5H5XQ7R --media-type episode

# Run cert preflight checklist before submission
npx roku-dev test cert-preflight

# Sample CPU during playback
npx roku-dev test chanperf --duration 15000 --threshold 70
```

All test commands exit with code 1 on failure, making them CI-friendly.

## Using it in chat

You can talk to your Roku through your AI assistant. The agent uses the MCP tools to navigate, inspect, and screenshot the device:

```
You: Go to the browse screen, select the Action genre, and take a screenshot for me

Agent: I'll navigate to the Browse screen. Let me press Back to reset focus,
       then Left to open the nav menu.

  → roku_press_key(key: "Back")
  → roku_press_key(key: "Left")
  → roku_ui_tree(depth: 4)

Agent: I can see the nav menu. Let me find Browse and select it.

  → roku_press_key(key: "Down", times: 2)
  → roku_press_key(key: "Select")
  → roku_press_key(key: "Down", times: 4)
  → roku_press_key(key: "Select")

Agent: We're on the Action genre list now.

  → roku_screenshot(save_path: "./screenshots/action_genre.png")
```

The agent can see the UI tree, understand what's on screen, navigate to where it needs to go, and save screenshots — all through natural conversation.

## How it works

Roku devices expose an HTTP API called [ECP (External Control Protocol)](https://developer.roku.com/docs/developer-program/dev-tools/external-control-api.md) on port 8060. This tool calls ECP endpoints directly — no WebDriver, no Appium, no Selenium, no Java.

The key endpoint is `GET /query/app-ui` which returns the full SceneGraph node tree as XML. This tool parses that XML and lets you query it with selectors.

## Requirements

- A Roku device in developer mode on the same network
- Node.js 18+

## License

MIT
