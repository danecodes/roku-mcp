import { EcpClient, Key, parseUiXml, findElement, findElements, findFocused } from '@danecodes/roku-ecp';
import {
  waitFor,
  assertElement,
  focusedElement,
  screenName,
  consoleWatch,
  certPreflight,
  chanperfSample,
  smokeTest,
  sideloadAndWatch,
} from '../../core/tool-handlers.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEST_APP_ZIP = path.resolve(__dirname, '../../../test-app/roku-mcp-test.zip');

export function createClient(): EcpClient {
  const ip = process.env.ROKU_IP;
  if (!ip) throw new Error('Set ROKU_IP environment variable to your Roku device IP');
  const password = process.env.ROKU_DEV_PASSWORD ?? 'rokudev';
  return new EcpClient(ip, { devPassword: password });
}

export async function getUiTree(client: EcpClient) {
  const xml = await client.queryAppUi();
  return parseUiXml(xml);
}

const MENU_ITEMS = ['home', 'search', 'settings', 'about'] as const;

export async function navigateToScreen(client: EcpClient, screen: string) {
  const targetIndex = MENU_ITEMS.indexOf(screen.toLowerCase() as typeof MENU_ITEMS[number]);
  if (targetIndex < 0) throw new Error(`Unknown screen: ${screen}. Use: ${MENU_ITEMS.join(', ')}`);

  // Open nav menu (resets to index 0 automatically, wrap=false)
  await client.press(Key.Left);
  await sleep(600);

  // Navigate down to target
  if (targetIndex > 0) {
    await client.press(Key.Down, { times: targetIndex, delay: 150 });
    await sleep(300);
  }

  // Select
  await client.press(Key.Select);
  await sleep(800);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export {
  parseUiXml, findElement, findElements, findFocused,
  waitFor, assertElement, focusedElement, screenName,
  consoleWatch, certPreflight, chanperfSample, smokeTest, sideloadAndWatch,
  Key,
};
