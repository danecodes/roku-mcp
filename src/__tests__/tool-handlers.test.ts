import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  waitFor,
  assertElement,
  sideloadAndWatch,
  smokeTest,
  focusedElement,
  screenName,
  consoleWatch,
  chanperfSample,
} from '../core/tool-handlers.js';

/* ------------------------------------------------------------------ */
/*  XML fixtures                                                       */
/* ------------------------------------------------------------------ */

const HOME_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<app-ui><topscreen><screen>
  <HomePage name="home">
    <AppButton name="playBtn" focused="true" text="Play" />
    <AppButton name="watchBtn" focused="false" text="Watch" />
  </HomePage>
</screen></topscreen></app-ui>`;

const VIDEO_PLAYER_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<app-ui><topscreen><screen>
  <VideoPlayer name="player">
    <AppButton name="pauseBtn" focused="true" text="Pause" />
  </VideoPlayer>
</screen></topscreen></app-ui>`;

/* ------------------------------------------------------------------ */
/*  waitFor                                                            */
/* ------------------------------------------------------------------ */

describe('waitFor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves immediately when element is present on first poll', async () => {
    const client = { queryAppUi: vi.fn().mockResolvedValue(HOME_XML) };

    const result = await waitFor(client, 'AppButton#playBtn', { timeout: 100, interval: 10 });

    expect(result.passed).toBe(true);
    expect(result.message).toContain('"AppButton#playBtn" found');
    expect(typeof result.elapsed_ms).toBe('number');
    expect(client.queryAppUi).toHaveBeenCalledTimes(1);
  });

  it('polls until element appears', async () => {
    const client = {
      queryAppUi: vi
        .fn()
        .mockResolvedValueOnce(VIDEO_PLAYER_XML) // no match
        .mockResolvedValueOnce(HOME_XML),        // match
    };

    const promise = waitFor(client, '#playBtn', { timeout: 2000, interval: 10 });
    await vi.advanceTimersByTimeAsync(20);
    const result = await promise;

    expect(result.passed).toBe(true);
    expect(client.queryAppUi).toHaveBeenCalledTimes(2);
  });

  it('throws on timeout when element never appears', async () => {
    const client = { queryAppUi: vi.fn().mockResolvedValue(VIDEO_PLAYER_XML) };

    const promise = waitFor(client, 'NonExistentElement', { timeout: 50, interval: 10 });
    // Attach .rejects before advancing so the rejection is handled immediately
    const assertion = expect(promise).rejects.toThrow('Timeout after 50ms');
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
  });

  it('includes element text in the returned element string', async () => {
    const client = { queryAppUi: vi.fn().mockResolvedValue(HOME_XML) };

    const result = await waitFor(client, 'AppButton#playBtn', { timeout: 100, interval: 10 });

    expect(result.element).toContain('playBtn');
  });
});

/* ------------------------------------------------------------------ */
/*  assertElement                                                      */
/* ------------------------------------------------------------------ */

describe('assertElement', () => {
  const client = { queryAppUi: vi.fn().mockResolvedValue(HOME_XML) };

  beforeEach(() => { client.queryAppUi.mockClear(); });

  it('passes "exists" when element is in the tree', async () => {
    const result = await assertElement(client, 'AppButton#playBtn', 'exists');

    expect(result.passed).toBe(true);
    expect(result.message).toContain('PASS');
    expect(result.assertion).toBe('exists');
  });

  it('fails "exists" when element is not in the tree', async () => {
    const result = await assertElement(client, 'NonExistent', 'exists');

    expect(result.passed).toBe(false);
    expect(result.message).toContain('FAIL');
  });

  it('passes "focused" when element has focused="true"', async () => {
    const result = await assertElement(client, 'AppButton#playBtn', 'focused');

    expect(result.passed).toBe(true);
    expect(result.message).toContain('is focused');
  });

  it('fails "focused" when element exists but is not focused', async () => {
    const result = await assertElement(client, 'AppButton#watchBtn', 'focused');

    expect(result.passed).toBe(false);
    expect(result.message).toContain('FAIL');
    expect(result.message).toContain('focused="false"');
  });

  it('passes "attribute" when attr matches expected value', async () => {
    const result = await assertElement(client, '#playBtn', 'attribute', 'text', 'Play');

    expect(result.passed).toBe(true);
    expect(result.attribute_value_actual).toBe('Play');
  });

  it('fails "attribute" when attr has wrong value', async () => {
    const result = await assertElement(client, '#playBtn', 'attribute', 'text', 'Stop');

    expect(result.passed).toBe(false);
    expect(result.attribute_value_actual).toBe('Play');
    expect(result.attribute_value_expected).toBe('Stop');
  });

  it('throws when "attribute" mode has no attributeName', async () => {
    await expect(
      assertElement(client, '#playBtn', 'attribute')
    ).rejects.toThrow('attributeName is required');
  });

  it('defaults to "exists" when assertion is omitted', async () => {
    const result = await assertElement(client, 'HomePage');

    expect(result.assertion).toBe('exists');
    expect(result.passed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  sideloadAndWatch                                                   */
/* ------------------------------------------------------------------ */

describe('sideloadAndWatch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function runSideloadAndWatch(
    client: Parameters<typeof sideloadAndWatch>[0],
    zip = 'app.zip',
    opts: Parameters<typeof sideloadAndWatch>[2] = { duration: 100 }
  ) {
    const promise = sideloadAndWatch(client, zip, opts);
    await vi.advanceTimersByTimeAsync(3000); // skip the 2000ms boot sleep
    return promise;
  }

  it('returns passed=true when console is clean', async () => {
    const client = {
      sideload: vi.fn().mockResolvedValue('Install Success'),
      readConsole: vi.fn().mockResolvedValue('Loading manifest...\nHomeScene created'),
    };

    const result = await runSideloadAndWatch(client, '/path/to/build.zip');

    expect(result.passed).toBe(true);
    expect(result.sideload_result).toBe('Install Success');
    expect(result.errors).toHaveLength(0);
    expect(result.crashes).toHaveLength(0);
  });

  it('returns passed=false when console has BrightScript errors', async () => {
    const client = {
      sideload: vi.fn().mockResolvedValue('Install Success'),
      readConsole: vi.fn().mockResolvedValue(
        'HomeScene created\nBRIGHTSCRIPT: ERROR roSGNode.CallFunc: bad call\nMore output'
      ),
    };

    const result = await runSideloadAndWatch(client, '/path/to/build.zip');

    expect(result.passed).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.message).toContain('FAIL');
  });

  it('returns passed=false when console has a crash/backtrace', async () => {
    const client = {
      sideload: vi.fn().mockResolvedValue('Install Success'),
      readConsole: vi.fn().mockResolvedValue('Backtrace:\n#1 Function crashyFn()'),
    };

    const result = await runSideloadAndWatch(client);

    expect(result.passed).toBe(false);
    expect(result.crashes).toHaveLength(1);
  });

  it('includes full console_output in the result', async () => {
    const output = 'App started\nLoading manifest';
    const client = {
      sideload: vi.fn().mockResolvedValue('Install Success'),
      readConsole: vi.fn().mockResolvedValue(output),
    };

    const result = await runSideloadAndWatch(client);

    expect(result.console_output).toBe(output);
  });

  it('uses default channelId "dev"', async () => {
    const client = {
      sideload: vi.fn().mockResolvedValue('Install Success'),
      readConsole: vi.fn().mockResolvedValue(''),
    };

    const result = await runSideloadAndWatch(client);

    expect(result.channel_id).toBe('dev');
  });
});

/* ------------------------------------------------------------------ */
/*  smokeTest                                                          */
/* ------------------------------------------------------------------ */

describe('smokeTest', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes when app launches and UI renders', async () => {
    const client = {
      launch: vi.fn().mockResolvedValue(undefined),
      deepLink: vi.fn().mockResolvedValue(undefined),
      queryAppUi: vi.fn().mockResolvedValue(HOME_XML),
      queryMediaPlayer: vi.fn().mockResolvedValue({ state: 'none', error: false }),
    };

    const promise = smokeTest(client, { channelId: 'dev', uiTimeout: 2000 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.passed).toBe(true);
    expect(result.message).toContain('PASS');
    expect(result.steps.find((s) => s.name === 'launch')?.passed).toBe(true);
    expect(result.steps.find((s) => s.name === 'ui_visible')?.passed).toBe(true);
  });

  it('fails at launch step when launch throws', async () => {
    const client = {
      launch: vi.fn().mockRejectedValue(new Error('Device unreachable')),
      deepLink: vi.fn(),
      queryAppUi: vi.fn(),
      queryMediaPlayer: vi.fn(),
    };

    // No sleep involved — launch fails immediately
    const result = await smokeTest(client, { uiTimeout: 100 });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('FAIL: Could not launch app');
    expect(result.steps[0].name).toBe('launch');
    expect(result.steps[0].passed).toBe(false);
  });

  it('fails at ui_visible when queryAppUi consistently returns empty scene', async () => {
    const emptySceneXml = `<?xml version="1.0" encoding="UTF-8" ?>
<app-ui><topscreen><screen><scene /></screen></topscreen></app-ui>`;
    const client = {
      launch: vi.fn().mockResolvedValue(undefined),
      deepLink: vi.fn(),
      queryAppUi: vi.fn().mockResolvedValue(emptySceneXml),
      queryMediaPlayer: vi.fn().mockResolvedValue({ state: 'none', error: false }),
    };

    const promise = smokeTest(client, { uiTimeout: 200, channelId: 'dev' });
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result.passed).toBe(false);
    expect(result.message).toContain('UI did not render');
  });

  it('checks playback when contentId is provided', async () => {
    const client = {
      launch: vi.fn().mockResolvedValue(undefined),
      deepLink: vi.fn().mockResolvedValue(undefined),
      queryAppUi: vi.fn().mockResolvedValue(VIDEO_PLAYER_XML),
      queryMediaPlayer: vi.fn().mockResolvedValue({ state: 'play', error: false }),
    };

    const promise = smokeTest(client, {
      contentId: 'GG5H5XQ7R',
      mediaType: 'episode',
      uiTimeout: 2000,
      playbackTimeout: 2000,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.passed).toBe(true);
    expect(result.steps.find((s) => s.name === 'playback')?.passed).toBe(true);
    expect(result.player_state).toBeDefined();
  });

  it('fails playback step when player never reaches "play"', async () => {
    const client = {
      launch: vi.fn().mockResolvedValue(undefined),
      deepLink: vi.fn().mockResolvedValue(undefined),
      queryAppUi: vi.fn().mockResolvedValue(HOME_XML),
      queryMediaPlayer: vi.fn().mockResolvedValue({ state: 'buffering', error: false }),
    };

    const promise = smokeTest(client, {
      contentId: 'GG5H5XQ7R',
      uiTimeout: 500,
      playbackTimeout: 200,
    });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Playback did not start');
  });

  it('uses deepLink instead of launch when contentId is provided', async () => {
    const client = {
      launch: vi.fn().mockResolvedValue(undefined),
      deepLink: vi.fn().mockResolvedValue(undefined),
      queryAppUi: vi.fn().mockResolvedValue(HOME_XML),
      queryMediaPlayer: vi.fn().mockResolvedValue({ state: 'play', error: false }),
    };

    const promise = smokeTest(client, { contentId: 'abc123', uiTimeout: 1000, playbackTimeout: 1000 });
    await vi.runAllTimersAsync();
    await promise;

    expect(client.deepLink).toHaveBeenCalledWith('dev', 'abc123', undefined);
    expect(client.launch).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  focusedElement                                                     */
/* ------------------------------------------------------------------ */

describe('focusedElement', () => {
  it('returns the focused element formatted string', async () => {
    const client = { queryAppUi: vi.fn().mockResolvedValue(HOME_XML) };

    const result = await focusedElement(client);

    expect(result).toContain('playBtn');
    expect(result).toContain('focused="true"');
  });

  it('returns "no focused element" message when nothing is focused', async () => {
    const client = { queryAppUi: vi.fn().mockResolvedValue(VIDEO_PLAYER_XML.replace('focused="true"', 'focused="false"')) };

    const result = await focusedElement(client);

    expect(result).toBe('(no focused element found)');
  });
});

/* ------------------------------------------------------------------ */
/*  screenName                                                         */
/* ------------------------------------------------------------------ */

describe('screenName', () => {
  it('returns the root component tag name', async () => {
    const client = { queryAppUi: vi.fn().mockResolvedValue(HOME_XML) };

    const result = await screenName(client);

    expect(result).toBe('HomePage');
  });

  it('returns VideoPlayer when on the player screen', async () => {
    const client = { queryAppUi: vi.fn().mockResolvedValue(VIDEO_PLAYER_XML) };

    const result = await screenName(client);

    expect(result).toBe('VideoPlayer');
  });
});

/* ------------------------------------------------------------------ */
/*  consoleWatch                                                       */
/* ------------------------------------------------------------------ */

describe('consoleWatch', () => {
  it('passes when pattern is NOT found (default: expect_match=false)', async () => {
    const client = {
      readConsole: vi.fn().mockResolvedValue('Normal startup output\nLoading manifest'),
    };

    const result = await consoleWatch(client, 'ERROR', { duration: 100 });

    expect(result.passed).toBe(true);
    expect(result.matched).toBe(false);
    expect(result.match_count).toBe(0);
  });

  it('fails when pattern IS found and expect_match=false', async () => {
    const client = {
      readConsole: vi.fn().mockResolvedValue('BRIGHTSCRIPT: ERROR bad call\nMore output'),
    };

    const result = await consoleWatch(client, 'ERROR', { duration: 100 });

    expect(result.passed).toBe(false);
    expect(result.matched).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toContain('ERROR');
  });

  it('passes when pattern IS found and expect_match=true', async () => {
    const client = {
      readConsole: vi.fn().mockResolvedValue('App ready\nHomeScene loaded'),
    };

    const result = await consoleWatch(client, 'HomeScene', { duration: 100, expectMatch: true });

    expect(result.passed).toBe(true);
    expect(result.matched).toBe(true);
  });

  it('fails when pattern is NOT found and expect_match=true', async () => {
    const client = {
      readConsole: vi.fn().mockResolvedValue('Normal output only'),
    };

    const result = await consoleWatch(client, 'HomeScene', { duration: 100, expectMatch: true });

    expect(result.passed).toBe(false);
    expect(result.matched).toBe(false);
  });

  it('is case-insensitive', async () => {
    const client = {
      readConsole: vi.fn().mockResolvedValue('brightscript: error something'),
    };

    const result = await consoleWatch(client, 'BRIGHTSCRIPT: ERROR', { duration: 100 });

    expect(result.matched).toBe(true);
  });

  it('counts multiple matching lines', async () => {
    const client = {
      readConsole: vi.fn().mockResolvedValue('ERROR line 1\nERROR line 2\nOK line'),
    };

    const result = await consoleWatch(client, 'ERROR', { duration: 100 });

    expect(result.match_count).toBe(2);
    expect(result.matches).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  chanperfSample                                                     */
/* ------------------------------------------------------------------ */

describe('chanperfSample', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function runChanperf(
    client: Parameters<typeof chanperfSample>[0],
    opts: Parameters<typeof chanperfSample>[1] = { duration: 300, interval: 100 }
  ) {
    const promise = chanperfSample(client, opts);
    await vi.advanceTimersByTimeAsync((opts?.duration ?? 300) + 200);
    return promise;
  }

  it('computes correct high watermark and average', async () => {
    const client = {
      queryChanperf: vi
        .fn()
        .mockResolvedValueOnce({ cpuUser: 10, cpuSystem: 5, memAnon: 0, memFile: 0 })  // 15
        .mockResolvedValueOnce({ cpuUser: 20, cpuSystem: 10, memAnon: 0, memFile: 0 }) // 30
        .mockResolvedValueOnce({ cpuUser: 5, cpuSystem: 5, memAnon: 0, memFile: 0 }),  // 10
    };

    const result = await runChanperf(client, { duration: 300, interval: 100, cpuThreshold: 80 });

    expect(result.cpu_high_watermark).toBe(30);
    expect(result.cpu_average).toBe(Math.round((15 + 30 + 10) / 3));
    expect(result.sample_count).toBeGreaterThan(0);
  });

  it('passes when average CPU is within threshold', async () => {
    const client = {
      queryChanperf: vi.fn().mockResolvedValue({ cpuUser: 20, cpuSystem: 10, memAnon: 0, memFile: 0 }),
    };

    const result = await runChanperf(client, { duration: 300, interval: 100, cpuThreshold: 80 });

    expect(result.passed).toBe(true);
    expect(result.message).toContain('within threshold');
  });

  it('fails when average CPU exceeds threshold', async () => {
    const client = {
      queryChanperf: vi.fn().mockResolvedValue({ cpuUser: 70, cpuSystem: 20, memAnon: 0, memFile: 0 }),
    };

    const result = await runChanperf(client, { duration: 300, interval: 100, cpuThreshold: 80 });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('exceeds threshold');
    expect(result.cpu_average).toBe(90);
  });

  it('returns passed=false with empty samples when queryChanperf always throws', async () => {
    const client = {
      queryChanperf: vi.fn().mockRejectedValue(new Error('no channel running')),
    };

    const result = await runChanperf(client);

    expect(result.passed).toBe(false);
    expect(result.samples).toHaveLength(0);
    expect(result.message).toContain('No chanperf samples');
  });

  it('uses default threshold of 80', async () => {
    const client = {
      queryChanperf: vi.fn().mockResolvedValue({ cpuUser: 85, cpuSystem: 0, memAnon: 0, memFile: 0 }),
    };

    const result = await runChanperf(client, { duration: 300, interval: 100 });

    expect(result.threshold).toBe(80);
    expect(result.passed).toBe(false);
  });
});
