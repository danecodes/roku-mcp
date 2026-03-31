# roku-mcp

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
      "args": ["tsx", "/path/to/roku-mcp/src/mcp/index.ts"],
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
| `roku_volume` | Volume up, down, or mute |
| `roku_input` | Send custom input parameters to the running app |

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
