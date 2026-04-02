/**
 * ECP (External Control Protocol) client for Roku devices.
 *
 * Provides a typed, ergonomic API over Roku's HTTP-based ECP.
 * All communication is via HTTP to port 8060 on the device.
 */

import { parseStringPromise } from 'xml2js';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface DeviceInfo {
  modelName: string;
  modelNumber: string;
  softwareVersion: string;
  softwareBuild: string;
  serialNumber: string;
  deviceId: string;
  friendlyName: string;
  networkType: string;
  networkName: string;
  isTV: boolean;
  uiResolution: string;
  [key: string]: string | boolean;
}

export interface ActiveApp {
  id: string;
  type: string;
  version: string;
  name: string;
}

export interface MediaPlayerState {
  state: string;
  error: boolean;
  plugin?: {
    id: string;
    name: string;
    bandwidth: string;
  };
  format?: {
    audio: string;
    video: string;
    captions: string;
    drm: string;
  };
  position?: string;
  duration?: string;
  isLive?: boolean;
}

export interface InstalledApp {
  id: string;
  type: string;
  version: string;
  name: string;
}

export interface ChanperfSample {
  cpuUser: number;
  cpuSystem: number;
  memAnon: number;
  memFile: number;
}

/* ------------------------------------------------------------------ */
/*  Keys                                                              */
/* ------------------------------------------------------------------ */

export const Key = {
  Home: 'Home',
  Rev: 'Rev',
  Fwd: 'Fwd',
  Play: 'Play',
  Select: 'Select',
  Left: 'Left',
  Right: 'Right',
  Down: 'Down',
  Up: 'Up',
  Back: 'Back',
  InstantReplay: 'InstantReplay',
  Info: 'Info',
  Backspace: 'Backspace',
  Search: 'Search',
  Enter: 'Enter',
  VolumeDown: 'VolumeDown',
  VolumeMute: 'VolumeMute',
  VolumeUp: 'VolumeUp',
  PowerOff: 'PowerOff',
  PowerOn: 'PowerOn',
  InputTuner: 'InputTuner',
  InputHDMI1: 'InputHDMI1',
  InputHDMI2: 'InputHDMI2',
  InputHDMI3: 'InputHDMI3',
  InputHDMI4: 'InputHDMI4',
  InputAV1: 'InputAV1',
} as const;

export type KeyName = (typeof Key)[keyof typeof Key];

/* ------------------------------------------------------------------ */
/*  Client                                                            */
/* ------------------------------------------------------------------ */

export class EcpClient {
  readonly baseUrl: string;
  private devPassword: string;

  constructor(
    readonly deviceIp: string,
    readonly port = 8060,
    options?: { devPassword?: string }
  ) {
    this.baseUrl = `http://${deviceIp}:${port}`;
    this.devPassword = options?.devPassword ?? 'rokudev';
  }

  /* ---- Key input ---- */

  async keypress(key: KeyName | string): Promise<void> {
    await this.post(`/keypress/${key}`);
  }

  async keydown(key: KeyName | string): Promise<void> {
    await this.post(`/keydown/${key}`);
  }

  async keyup(key: KeyName | string): Promise<void> {
    await this.post(`/keyup/${key}`);
  }

  async press(
    key: KeyName | string,
    options?: { times?: number; delay?: number }
  ): Promise<void> {
    const times = options?.times ?? 1;
    const delay = options?.delay ?? 100;
    for (let i = 0; i < times; i++) {
      await this.keypress(key);
      if (i < times - 1 && delay > 0) {
        await sleep(delay);
      }
    }
  }

  async type(text: string, options?: { delay?: number }): Promise<void> {
    const delay = options?.delay ?? 50;
    for (const char of text) {
      await this.keypress(`Lit_${encodeURIComponent(char)}`);
      if (delay > 0) await sleep(delay);
    }
  }

  /* ---- App lifecycle ---- */

  async launch(
    channelId: string,
    params?: Record<string, string>
  ): Promise<void> {
    const qs = params
      ? '?' + new URLSearchParams(params).toString()
      : '';
    await this.post(`/launch/${channelId}${qs}`);
  }

  async install(channelId: string): Promise<void> {
    await this.post(`/install/${channelId}`);
  }

  async input(params: Record<string, string>): Promise<void> {
    const qs = new URLSearchParams(params).toString();
    await this.post(`/input?${qs}`);
  }

  async closeApp(): Promise<void> {
    await this.keypress('Home');
  }

  async deepLink(
    channelId: string,
    contentId: string,
    mediaType?: string
  ): Promise<void> {
    const params: Record<string, string> = { contentId };
    if (mediaType) params.mediaType = mediaType;
    await this.launch(channelId, params);
  }

  async volumeUp(): Promise<void> {
    await this.keypress('VolumeUp');
  }

  async volumeDown(): Promise<void> {
    await this.keypress('VolumeDown');
  }

  async volumeMute(): Promise<void> {
    await this.keypress('VolumeMute');
  }

  async sideload(zipPath: string): Promise<string> {
    const { execFileSync } = await import('child_process');
    const result = execFileSync('curl', [
      '-s', '--digest',
      '--user', `rokudev:${this.devPassword}`,
      '-F', 'mysubmit=Install',
      '-F', `archive=@${zipPath}`,
      `http://${this.deviceIp}/plugin_install`,
      '--max-time', '60',
    ], { maxBuffer: 10 * 1024 * 1024 });
    const html = result.toString();
    if (html.includes('Install Success')) {
      return 'Install Success';
    }
    if (html.includes('Install Failure')) {
      throw new Error('Sideload failed — check the package');
    }
    return 'Sideload completed';
  }

  /* ---- Console / Debug ---- */

  /**
   * Read output from the BrightScript debug console (port 8085).
   *
   * Connects via TCP, reads for `duration` seconds, then returns whatever
   * came through. Useful for reading crash logs, print statements,
   * and runtime errors.
   */
  async readConsole(options?: {
    duration?: number;
    filter?: string;
  }): Promise<string> {
    const { execFileSync } = await import('child_process');
    const seconds = Math.ceil((options?.duration ?? 2000) / 1000);

    try {
      const buf = execFileSync('nc', [
        '-w', String(seconds), this.deviceIp, '8085',
      ], {
        maxBuffer: 10 * 1024 * 1024,
        timeout: (seconds + 2) * 1000,
        input: '\n',
      });
      const output = buf.toString('utf-8');
      if (!options?.filter) return output;
      return output
        .split('\n')
        .filter((line) =>
          line.toLowerCase().includes(options.filter!.toLowerCase())
        )
        .join('\n');
    } catch (err: unknown) {
      // nc exits non-zero on timeout but still produces output
      if (err && typeof err === 'object' && 'stdout' in err) {
        const output = (err as { stdout: Buffer }).stdout.toString('utf-8');
        if (!options?.filter) return output;
        return output
          .split('\n')
          .filter((line) =>
            line.toLowerCase().includes(options.filter!.toLowerCase())
          )
          .join('\n');
      }
      throw err;
    }
  }

  /**
   * Send a command to the BrightScript debug console.
   *
   * Common commands:
   * - "bt" — backtrace (call stack after a crash)
   * - "var" — show variables in current scope
   * - "cont" — continue execution after a breakpoint
   * - "step" — step to next line
   * - "over" — step over
   * - "out" — step out
   */
  async sendConsoleCommand(
    command: string,
    options?: { duration?: number }
  ): Promise<string> {
    const { execFileSync } = await import('child_process');
    const seconds = Math.ceil((options?.duration ?? 2000) / 1000);

    try {
      const buf = execFileSync('nc', [
        '-w', String(seconds), this.deviceIp, '8085',
      ], {
        maxBuffer: 10 * 1024 * 1024,
        timeout: (seconds + 2) * 1000,
        input: command + '\n',
      });
      return buf.toString('utf-8');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'stdout' in err) {
        return (err as { stdout: Buffer }).stdout.toString('utf-8');
      }
      throw err;
    }
  }

  /* ---- Queries ---- */

  async queryDeviceInfo(): Promise<DeviceInfo> {
    const xml = await this.get('/query/device-info');
    const parsed = await parseXml(xml);
    const info: Record<string, string | boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        if (value === 'true') info[toCamelCase(key)] = true;
        else if (value === 'false') info[toCamelCase(key)] = false;
        else info[toCamelCase(key)] = value;
      }
    }
    return info as unknown as DeviceInfo;
  }

  async queryActiveApp(): Promise<ActiveApp> {
    const xml = await this.get('/query/active-app');
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const app = parsed['active-app'].app;
    // On the Roku home screen, app may be a plain string or lack $ attributes
    const attrs = app?.$;
    return {
      id: attrs?.id ?? '',
      type: attrs?.type ?? 'home',
      version: attrs?.version ?? '',
      name: (typeof app === 'string' ? app : app?._ ) ?? 'Roku',
    };
  }

  async queryInstalledApps(): Promise<InstalledApp[]> {
    const xml = await this.get('/query/apps');
    const parsed = await parseStringPromise(xml, { explicitArray: true });
    const apps = parsed.apps.app ?? [];
    return apps.map((app: { $: Record<string, string>; _: string }) => ({
      id: app.$.id,
      type: app.$.type,
      version: app.$.version,
      name: app._,
    }));
  }

  async queryMediaPlayer(): Promise<MediaPlayerState> {
    const xml = await this.get('/query/media-player');
    const parsed = await parseStringPromise(xml, {
      explicitArray: false,
      mergeAttrs: true,
    });
    const player = parsed.player;
    return {
      state: player.state,
      error: player.error === 'true',
      plugin: player.plugin
        ? {
            id: player.plugin.id,
            name: player.plugin.name,
            bandwidth: player.plugin.bandwidth,
          }
        : undefined,
      format: player.format
        ? {
            audio: player.format.audio,
            video: player.format.video,
            captions: player.format.captions,
            drm: player.format.drm,
          }
        : undefined,
      position: player.position,
      duration: player.duration,
      isLive: player.is_live === 'true',
    };
  }

  async queryAppUi(): Promise<string> {
    return this.get('/query/app-ui');
  }

  async queryChanperf(): Promise<ChanperfSample> {
    const xml = await this.get('/query/chanperf');
    const parsed = await parseStringPromise(xml, {
      explicitArray: false,
      mergeAttrs: true,
    });
    const plugin = parsed.chanperf?.plugin;
    if (!plugin) {
      return { cpuUser: 0, cpuSystem: 0, memAnon: 0, memFile: 0 };
    }
    return {
      cpuUser: parseInt(plugin.cpu?.user ?? '0', 10),
      cpuSystem: parseInt(plugin.cpu?.system ?? '0', 10),
      memAnon: parseInt(plugin.memory?.anon ?? '0', 10),
      memFile: parseInt(plugin.memory?.file ?? '0', 10),
    };
  }

  /* ---- Screenshot ---- */

  /**
   * Capture a screenshot from the Roku device.
   *
   * Uses the developer web server (port 80, digest auth) since
   * ECP doesn't have a screenshot endpoint. Requires developer mode
   * with a sideloaded app.
   *
   * @returns PNG image data as a Buffer
   */
  async takeScreenshot(): Promise<Buffer> {
    const { execFileSync } = await import('child_process');
    const devUrl = `http://${this.deviceIp}`;
    const auth = `rokudev:${this.devPassword}`;

    // Step 1: Trigger screenshot capture (discard HTML response)
    execFileSync('curl', [
      '-s', '--digest', '--user', auth,
      '-X', 'POST', '-F', 'mysubmit=Screenshot',
      `${devUrl}/plugin_inspect`,
      '-o', '/dev/null', '--max-time', '15',
    ]);

    // Step 2: Download the PNG
    const buf = execFileSync('curl', [
      '-s', '--digest', '--user', auth,
      '-o', '-',
      `${devUrl}/pkgs/dev.png?time=${Date.now()}`,
      '--max-time', '15',
    ], { maxBuffer: 50 * 1024 * 1024 });

    if (buf.length < 1000) {
      throw new Error('Screenshot failed — is a dev channel sideloaded?');
    }

    return buf;
  }

  /* ---- HTTP helpers ---- */

  private async get(path: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(
        `ECP GET ${path} failed: ${res.status} ${res.statusText}`
      );
    }
    return res.text();
  }

  private async post(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(
        `ECP POST ${path} failed: ${res.status} ${res.statusText}`
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

async function parseXml(
  xml: string
): Promise<Record<string, string>> {
  const parsed = await parseStringPromise(xml, {
    explicitArray: false,
    explicitRoot: false,
  });
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      flat[key] = value;
    }
  }
  return flat;
}
