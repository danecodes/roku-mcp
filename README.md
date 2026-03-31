# roku-mcp

MCP server and CLI that lets AI agents (and developers) interact with Roku devices.

Your coding agent can see what's on the Roku screen, send remote control input, and query device state — all through the [Model Context Protocol](https://modelcontextprotocol.io) or a simple CLI.

## What it does

- **Inspect the UI** — query the SceneGraph node tree to see what's displayed on screen
- **Find elements** — CSS-like selectors against SceneGraph nodes (`HomePage HomeHeroCarousel`, `AppButton#play_button`)
- **Send input** — remote control keys, text entry
- **Launch apps** — start channels with deep link parameters
- **Query state** — device info, media player, active app, installed apps

## Quick start

### As an MCP server (Claude Code, Cursor, etc.)

Add to your Claude Code settings:

```json
{
  "mcpServers": {
    "roku": {
      "command": "npx",
      "args": ["roku-mcp", "mcp"],
      "env": {
        "ROKU_DEVICE_IP": "192.168.0.30"
      }
    }
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
| `roku_launch` | Launch a channel with optional deep link params |
| `roku_device_info` | Get device model, software version, network info |
| `roku_active_app` | Get the currently running app |
| `roku_media_player` | Get playback state (position, duration, format) |
| `roku_installed_apps` | List all installed channels |
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

## How it works

Roku devices expose an HTTP API called [ECP (External Control Protocol)](https://developer.roku.com/docs/developer-program/dev-tools/external-control-api.md) on port 8060. This tool calls ECP endpoints directly — no WebDriver, no Appium, no Selenium, no Java.

The key endpoint is `GET /query/app-ui` which returns the full SceneGraph node tree as XML. This tool parses that XML and lets you query it with selectors.

## Requirements

- A Roku device in developer mode on the same network
- Node.js 18+

## Related

- [roku-developer-guide](https://github.com/danecodes/roku-developer-guide) — Knowledge base that makes AI agents competent at Roku/BrightScript development
- [roku-dotfiles](https://github.com/danecodes/roku-dotfiles) — VS Code configs, Claude Code settings, snippets for Roku development

## License

MIT
