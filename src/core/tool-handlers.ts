/**
 * Core logic for the Shift Left test runner tools.
 *
 * Each function is client-injected so it can be called from both the MCP
 * server and the CLI, and tested in isolation with mock clients.
 */

import type { EcpClient } from '@danecodes/roku-ecp';
import {
  parseUiXml,
  findElement,
  findFocused,
  formatTree,
} from '@danecodes/roku-ecp';
import { parseConsoleForIssues } from '@danecodes/roku-ecp';

/* ------------------------------------------------------------------ */
/*  Shared                                                            */
/* ------------------------------------------------------------------ */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/*  Result types                                                       */
/* ------------------------------------------------------------------ */

export interface WaitForResult {
  passed: true;
  message: string;
  elapsed_ms: number;
  element: string;
}

export interface AssertResult {
  passed: boolean;
  message: string;
  selector: string;
  assertion: string;
  element?: Record<string, string>;
  attribute_name?: string;
  attribute_value_expected?: string;
  attribute_value_actual?: string;
}

export interface SideloadWatchResult {
  passed: boolean;
  message: string;
  sideload_result: string;
  channel_id: string;
  watch_duration_ms: number;
  errors: string[];
  crashes: string[];
  exceptions: string[];
  console_output: string;
}

export interface SmokeStep {
  name: string;
  passed: boolean;
  message: string;
  elapsed_ms?: number;
}

export interface SmokeTestResult {
  passed: boolean;
  message: string;
  steps: SmokeStep[];
  player_state?: object;
}

export interface ConsoleWatchResult {
  passed: boolean;
  message: string;
  pattern: string;
  matched: boolean;
  match_count: number;
  matches: string[];
  duration_ms: number;
}

export interface CertCheck {
  name: string;
  passed: boolean;
  message: string;
  detail?: string;
}

export interface CertPreflightResult {
  passed: boolean;
  message: string;
  checks: CertCheck[];
}

export interface ChanperfResult {
  passed: boolean;
  message: string;
  cpu_high_watermark: number;
  cpu_average: number;
  samples: number[];
  sample_count: number;
  threshold: number;
  duration_ms: number;
}

/* ------------------------------------------------------------------ */
/*  Priority 1                                                         */
/* ------------------------------------------------------------------ */

export async function waitFor(
  client: Pick<EcpClient, 'queryAppUi'>,
  selector: string,
  options?: { timeout?: number; interval?: number }
): Promise<WaitForResult> {
  const maxMs = options?.timeout ?? 10000;
  const pollMs = options?.interval ?? 500;
  const start = Date.now();

  while (true) {
    const xml = await client.queryAppUi();
    const tree = await parseUiXml(xml);
    const el = findElement(tree, selector);
    if (el) {
      const elapsed = Date.now() - start;
      return {
        passed: true,
        message: `Element "${selector}" found after ${elapsed}ms`,
        elapsed_ms: elapsed,
        element: formatTree(el, { maxDepth: 0, allAttrs: true }),
      };
    }
    const elapsed = Date.now() - start;
    if (elapsed >= maxMs) {
      throw new Error(
        `Timeout after ${maxMs}ms: no element matching "${selector}" appeared`
      );
    }
    await sleep(pollMs);
  }
}

export async function assertElement(
  client: Pick<EcpClient, 'queryAppUi'>,
  selector: string,
  assertion: 'exists' | 'focused' | 'attribute' = 'exists',
  attributeName?: string,
  attributeValue?: string
): Promise<AssertResult> {
  const xml = await client.queryAppUi();
  const tree = await parseUiXml(xml);
  const el = findElement(tree, selector);

  if (!el) {
    return {
      passed: false,
      message: `FAIL: No element found matching "${selector}"`,
      selector,
      assertion,
    };
  }

  if (assertion === 'exists') {
    return {
      passed: true,
      message: `PASS: Element "${selector}" exists`,
      selector,
      assertion,
      element: el.attrs,
    };
  }

  if (assertion === 'focused') {
    const isFocused = el.attrs.focused === 'true';
    return {
      passed: isFocused,
      message: isFocused
        ? `PASS: Element "${selector}" is focused`
        : `FAIL: Element "${selector}" exists but focused="${el.attrs.focused ?? 'false'}"`,
      selector,
      assertion,
      element: el.attrs,
    };
  }

  // attribute mode
  if (!attributeName) {
    throw new Error('attributeName is required when assertion is "attribute"');
  }
  const actual = el.attrs[attributeName];
  const passed =
    attributeValue === undefined ? actual !== undefined : actual === attributeValue;
  return {
    passed,
    message: passed
      ? `PASS: Element "${selector}" has ${attributeName}="${actual}"`
      : `FAIL: Element "${selector}" has ${attributeName}="${actual ?? '(missing)'}", expected "${attributeValue}"`,
    selector,
    assertion,
    attribute_name: attributeName,
    attribute_value_expected: attributeValue,
    attribute_value_actual: actual,
    element: el.attrs,
  };
}

export async function sideloadAndWatch(
  client: Pick<EcpClient, 'sideload' | 'readConsole'>,
  zipPath: string,
  options?: { duration?: number; channelId?: string }
): Promise<SideloadWatchResult> {
  const watchMs = options?.duration ?? 30000;
  const channelId = options?.channelId ?? 'dev';

  const sideloadResult = await client.sideload(zipPath);
  await sleep(2000);
  const consoleOutput = await client.readConsole({ duration: watchMs });

  const { errors, crashes, exceptions } = parseConsoleForIssues(consoleOutput);
  const passed =
    errors.length === 0 && crashes.length === 0 && exceptions.length === 0;
  const issues = errors.length + crashes.length + exceptions.length;

  return {
    passed,
    message: passed
      ? `PASS: ${sideloadResult} — no errors in ${watchMs / 1000}s of console output`
      : `FAIL: ${issues} issue(s) — ${errors.length} error(s), ${crashes.length} crash(es), ${exceptions.length} exception(s)`,
    sideload_result: sideloadResult,
    channel_id: channelId,
    watch_duration_ms: watchMs,
    errors,
    crashes,
    exceptions,
    console_output: consoleOutput,
  };
}

export async function smokeTest(
  client: Pick<EcpClient, 'launch' | 'deepLink' | 'queryAppUi' | 'queryMediaPlayer'>,
  options?: {
    channelId?: string;
    contentId?: string;
    mediaType?: string;
    uiTimeout?: number;
    playbackTimeout?: number;
  }
): Promise<SmokeTestResult> {
  const id = options?.channelId ?? 'dev';
  const uiMaxMs = options?.uiTimeout ?? 15000;
  const playMaxMs = options?.playbackTimeout ?? 30000;
  const steps: SmokeStep[] = [];

  // Step 1: Launch
  try {
    if (options?.contentId) {
      await client.deepLink(id, options.contentId, options.mediaType);
      steps.push({
        name: 'launch',
        passed: true,
        message: `Deep linked to "${options.contentId}" in channel ${id}`,
      });
    } else {
      await client.launch(id);
      steps.push({ name: 'launch', passed: true, message: `Launched channel ${id}` });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ name: 'launch', passed: false, message: `Failed to launch: ${msg}` });
    return { passed: false, message: 'FAIL: Could not launch app', steps };
  }

  // Step 2: Wait for UI
  const uiStart = Date.now();
  let uiAppeared = false;
  while (Date.now() - uiStart < uiMaxMs) {
    try {
      const xml = await client.queryAppUi();
      const tree = await parseUiXml(xml);
      if (tree.tag !== 'scene' || tree.children.length > 0) {
        uiAppeared = true;
        break;
      }
    } catch { /* keep polling */ }
    await sleep(500);
  }
  const uiElapsed = Date.now() - uiStart;
  if (!uiAppeared) {
    steps.push({
      name: 'ui_visible',
      passed: false,
      message: `UI did not appear within ${uiMaxMs}ms`,
      elapsed_ms: uiElapsed,
    });
    return { passed: false, message: 'FAIL: UI did not render', steps };
  }
  steps.push({
    name: 'ui_visible',
    passed: true,
    message: `UI rendered after ${uiElapsed}ms`,
    elapsed_ms: uiElapsed,
  });

  // Step 3: Verify playback (only if contentId provided)
  if (options?.contentId) {
    const playStart = Date.now();
    let playerState: object | undefined;
    while (Date.now() - playStart < playMaxMs) {
      try {
        const state = await client.queryMediaPlayer();
        if (state.state === 'play') {
          playerState = state;
          break;
        }
      } catch { /* keep polling */ }
      await sleep(1000);
    }
    const playElapsed = Date.now() - playStart;
    if (!playerState) {
      const finalState = await client.queryMediaPlayer().catch(() => null);
      steps.push({
        name: 'playback',
        passed: false,
        message: `Player did not reach "play" within ${playMaxMs}ms`,
        elapsed_ms: playElapsed,
      });
      return {
        passed: false,
        message: `FAIL: Playback did not start (state: ${(finalState as { state?: string } | null)?.state ?? 'unknown'})`,
        steps,
        player_state: finalState ?? undefined,
      };
    }
    steps.push({
      name: 'playback',
      passed: true,
      message: `Player reached "play" after ${playElapsed}ms`,
      elapsed_ms: playElapsed,
    });
    return {
      passed: true,
      message: 'PASS: App launched, UI rendered, and playback started',
      steps,
      player_state: playerState,
    };
  }

  return { passed: true, message: 'PASS: App launched and UI is visible', steps };
}

/* ------------------------------------------------------------------ */
/*  Priority 2                                                         */
/* ------------------------------------------------------------------ */

export async function focusedElement(
  client: Pick<EcpClient, 'queryAppUi'>
): Promise<string> {
  const xml = await client.queryAppUi();
  const tree = await parseUiXml(xml);
  const focused = findFocused(tree);
  if (!focused) return '(no focused element found)';
  return formatTree(focused, { maxDepth: 0, allAttrs: true });
}

export async function screenName(
  client: Pick<EcpClient, 'queryAppUi'>
): Promise<string> {
  const xml = await client.queryAppUi();
  const tree = await parseUiXml(xml);
  return tree.tag;
}

export async function consoleWatch(
  client: Pick<EcpClient, 'readConsole'>,
  pattern: string,
  options?: { duration?: number; expectMatch?: boolean }
): Promise<ConsoleWatchResult> {
  const watchMs = options?.duration ?? 5000;
  const output = await client.readConsole({ duration: watchMs });
  const matches = output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.toLowerCase().includes(pattern.toLowerCase()));

  const matched = matches.length > 0;
  const passed = options?.expectMatch ? matched : !matched;

  return {
    passed,
    message: passed
      ? matched
        ? `PASS: Pattern "${pattern}" found (${matches.length} match(es))`
        : `PASS: Pattern "${pattern}" not found`
      : matched
        ? `FAIL: Pattern "${pattern}" found (${matches.length} match(es))`
        : `FAIL: Pattern "${pattern}" not found`,
    pattern,
    matched,
    match_count: matches.length,
    matches,
    duration_ms: watchMs,
  };
}

/* ------------------------------------------------------------------ */
/*  Priority 3                                                         */
/* ------------------------------------------------------------------ */

export async function certPreflight(
  client: Pick<EcpClient, 'readConsole' | 'press' | 'closeApp' | 'launch'>,
  channelId = 'dev'
): Promise<CertPreflightResult> {
  const checks: CertCheck[] = [];

  // Check 1: No existing BrightScript errors
  {
    const output = await client.readConsole({ duration: 2000 });
    const { errors } = parseConsoleForIssues(output);
    checks.push({
      name: 'no_existing_errors',
      passed: errors.length === 0,
      message:
        errors.length === 0
          ? 'No BrightScript errors in console'
          : `${errors.length} error(s) detected in console`,
      ...(errors.length > 0 ? { detail: errors.slice(0, 5).join('\n') } : {}),
    });
  }

  // Check 2: Back navigation doesn't crash
  {
    await client.press('Back');
    await sleep(1500);
    const output = await client.readConsole({ duration: 1000 });
    const { crashes } = parseConsoleForIssues(output);
    checks.push({
      name: 'back_navigation',
      passed: crashes.length === 0,
      message:
        crashes.length === 0
          ? 'Back navigation: no crash detected'
          : 'Back navigation caused a crash',
      ...(crashes.length > 0 ? { detail: crashes.slice(0, 5).join('\n') } : {}),
    });
  }

  // Check 3: Home exit — no crash on exit
  {
    await client.closeApp();
    await sleep(2000);
    const output = await client.readConsole({ duration: 1000 });
    const { crashes } = parseConsoleForIssues(output);
    checks.push({
      name: 'home_exit',
      passed: crashes.length === 0,
      message:
        crashes.length === 0 ? 'Home exit: no crash detected' : 'Home exit caused a crash',
      ...(crashes.length > 0 ? { detail: crashes.slice(0, 5).join('\n') } : {}),
    });
  }

  // Check 4: Relaunch — app restarts cleanly
  {
    await client.launch(channelId);
    await sleep(3000);
    const output = await client.readConsole({ duration: 2000 });
    const { errors, crashes } = parseConsoleForIssues(output);
    const issues = [...errors, ...crashes];
    checks.push({
      name: 'relaunch',
      passed: issues.length === 0,
      message:
        issues.length === 0
          ? 'Relaunch: app started cleanly'
          : `Relaunch produced ${issues.length} issue(s)`,
      ...(issues.length > 0 ? { detail: issues.slice(0, 5).join('\n') } : {}),
    });
  }

  const allPassed = checks.every((c) => c.passed);
  const failCount = checks.filter((c) => !c.passed).length;

  return {
    passed: allPassed,
    message: allPassed
      ? `PASS: All ${checks.length} cert preflight checks passed`
      : `FAIL: ${failCount} of ${checks.length} cert checks failed`,
    checks,
  };
}

export async function chanperfSample(
  client: Pick<EcpClient, 'queryChanperf'>,
  options?: { duration?: number; interval?: number; cpuThreshold?: number }
): Promise<ChanperfResult> {
  const totalMs = options?.duration ?? 10000;
  const pollMs = options?.interval ?? 1000;
  const threshold = options?.cpuThreshold ?? 80;
  const samples: number[] = [];
  const start = Date.now();

  while (Date.now() - start < totalMs) {
    try {
      const perf = await client.queryChanperf();
      samples.push(perf.cpuUser + perf.cpuSystem);
    } catch { /* skip failed sample */ }
    await sleep(pollMs);
  }

  if (samples.length === 0) {
    return {
      passed: false,
      message: 'FAIL: No chanperf samples collected — is a channel running?',
      cpu_high_watermark: 0,
      cpu_average: 0,
      samples: [],
      sample_count: 0,
      threshold,
      duration_ms: totalMs,
    };
  }

  const high = Math.max(...samples);
  const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  const passed = avg <= threshold;

  return {
    passed,
    message: passed
      ? `PASS: Average CPU ${avg}% is within threshold (${threshold}%)`
      : `FAIL: Average CPU ${avg}% exceeds threshold (${threshold}%)`,
    cpu_high_watermark: high,
    cpu_average: avg,
    samples,
    sample_count: samples.length,
    threshold,
    duration_ms: totalMs,
  };
}
