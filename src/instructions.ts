import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadAppContext(): string {
  const filePath = process.env.ROKU_APP_CONTEXT ?? resolve(process.cwd(), 'roku-app.md');
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Instructions sent to MCP clients on initialize.
 * Teaches agents HOW to use the Roku tools effectively.
 *
 * If a roku-app.md file exists in the working directory (or at ROKU_APP_CONTEXT),
 * its contents are appended so agents automatically learn app-specific navigation.
 */
export const SERVER_INSTRUCTIONS = `\
You have tools to control a Roku device. Use the roku_ MCP tools for ALL Roku interaction. \
Never make direct HTTP/curl calls to the Roku ECP API — the tools handle that for you.

## How Roku apps work

Roku apps are navigated with a D-pad remote: Up, Down, Left, Right, Select (confirm), and Back. \
There is no mouse, no touch, no cursor. You move focus between on-screen elements with directional keys.

## How to observe the screen (cost hierarchy)

Checking the screen state costs tokens. Use the cheapest tool that answers your question:

1. roku_screenshot — PREFERRED. Take a screenshot and visually inspect it. Cheap, fast, and gives you full context.
2. roku_focused_element — Returns only the currently focused node. Tiny response. Use to confirm what's selected.
3. roku_screen_name — One line: which screen/component is active.
4. roku_find_element — Targeted query for specific nodes by selector. Small response.
5. roku_ui_tree — LAST RESORT. Returns the full SceneGraph tree (thousands of lines). Only use for initial orientation on a screen you've never seen, or when you are completely lost.

## Navigation workflow

1. Take a screenshot to see where you are.
2. Decide what keys to press based on what you see.
3. Press keys with roku_press_key.
4. Take another screenshot (or use roku_focused_element) to verify the result.
5. Repeat.

Do NOT fire long sequences of blind key presses. Press a few keys, then check the screen.

## Common patterns

- Most streaming apps have a left-side navigation menu. Press Left to open it, Up/Down to move between items, Select to choose.
- To type into a search field, first navigate to the search screen, then use roku_type_text.
- Use roku_press_key with the "times" parameter to press a key multiple times instead of making separate calls.
- Back returns to the previous screen. Home exits the app entirely.
` + (() => { const ctx = loadAppContext(); return ctx ? `\n\n## App-specific context\n\n${ctx}` : ''; })();

/**
 * Content for CLAUDE.md Roku section, appended by `roku-mcp init`.
 * More detailed than server instructions — includes examples and tool reference.
 */
export const CLAUDE_MD_SECTION = `\
## Roku Device Control

This project has a Roku MCP server connected. Use the roku_ MCP tools for ALL Roku device interaction. \
Never make direct HTTP requests to port 8060 or use curl/fetch against the ECP API.

### Observation hierarchy (token cost)

Checking the Roku screen costs tokens. Always use the cheapest tool that answers your question:

1. **roku_screenshot** — PREFERRED. Take a screenshot and look at it. This gives you the most context for the least cost.
2. **roku_focused_element** — Just the focused node. Use to confirm what's currently selected.
3. **roku_screen_name** — One-line answer: what screen are you on.
4. **roku_find_element** — Search for specific elements by selector. Small, targeted response.
5. **roku_ui_tree** — EXPENSIVE (thousands of lines). Only use when you need to understand the full structure of a screen for the first time, or when you're completely lost.

### Navigation basics

Roku uses D-pad navigation: Up, Down, Left, Right, Select (confirm), Back (go back), Home (exit app).

**Always observe before and after acting:**
1. Take a screenshot to see where you are
2. Press keys based on what you see
3. Take another screenshot to verify the result
4. Do NOT fire long blind key sequences — press a few keys, then check

### Common patterns

- **Opening a nav menu:** Most streaming apps have a left-side nav. Press Left to open it, Up/Down to browse, Select to choose.
- **Typing text:** Navigate to the search/input screen first, then use roku_type_text. Don't try to type by arrowing to individual keyboard keys.
- **Pressing a key multiple times:** Use the \`times\` parameter on roku_press_key instead of multiple separate calls.
- **Going back:** Back returns to the previous screen. Home exits the app entirely.
- **Waiting for content to load:** Use roku_wait_for with a selector to poll until an element appears.

### Example: Navigate to search and type a query

\`\`\`
1. roku_screenshot()                          → see the current screen
2. roku_press_key(key: "Left")                → open the nav menu
3. roku_screenshot()                          → confirm the menu opened, find Search
4. roku_press_key(key: "Down", times: N)      → move to Search (N depends on menu layout)
5. roku_press_key(key: "Select")              → enter Search
6. roku_screenshot()                          → confirm you're on the search screen
7. roku_type_text(text: "one piece")          → type the query
8. roku_screenshot()                          → verify the results
\`\`\`

### Quick reference

| Task | Tool |
|------|------|
| See the screen | roku_screenshot |
| What's focused? | roku_focused_element |
| What screen am I on? | roku_screen_name |
| Find a specific element | roku_find_element |
| Full UI tree (expensive!) | roku_ui_tree |
| Press remote keys | roku_press_key |
| Type text | roku_type_text |
| Launch an app | roku_launch |
| Deep link to content | roku_deep_link |
| Check playback state | roku_media_player |
| Device info | roku_device_info |
`;
