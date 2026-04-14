import { describe, it, expect, beforeAll } from 'vitest';
import {
  createClient,
  TEST_APP_ZIP,
  navigateToScreen,
  sleep,
  waitFor,
  assertElement,
} from './helpers.js';
import type { EcpClient } from '@danecodes/roku-ecp';

describe('Search / Text Input', () => {
  let client: EcpClient;

  beforeAll(async () => {
    client = createClient();
    // Ensure test app is sideloaded (can't depend on test execution order)
    await client.sideload(TEST_APP_ZIP);
    await sleep(3000);
    await navigateToScreen(client, 'search');
    await waitFor(client, 'SearchScreen', { timeout: 5000 });
    // Wait for focus to propagate to the TextEditBox
    await sleep(500);
  });

  it('shows search screen with input field', async () => {
    const result = await assertElement(client, '#searchInput', 'exists');
    expect(result.passed).toBe(true);
  });

  it('types text and displays search result', async () => {
    await client.type('one piece', { delay: 100 });
    await sleep(800);

    const result = await assertElement(
      client, '#searchResult', 'attribute', 'text', 'You searched for: one piece',
    );
    expect(result.passed).toBe(true);
  });

  it('updates result when typing more text', async () => {
    // Clear previous text with backspace
    for (let i = 0; i < 'one piece'.length; i++) {
      await client.press('Backspace');
    }
    await sleep(300);

    await client.type('naruto', { delay: 100 });
    await sleep(800);

    const result = await assertElement(
      client, '#searchResult', 'attribute', 'text', 'You searched for: naruto',
    );
    expect(result.passed).toBe(true);
  });
});
