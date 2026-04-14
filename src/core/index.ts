// Re-export everything from roku-ecp
export {
  EcpClient,
  Key,
  type KeyName,
  type DeviceInfo,
  type ActiveApp,
  type MediaPlayerState,
  type InstalledApp,
  type ChanperfSample,
  type EcpClientOptions,
  EcpSideloadError,
  EcpScreenshotError,
} from '@danecodes/roku-ecp';

export {
  parseUiXml,
  findElement,
  findElements,
  findFocused,
  formatTree,
  type UiNode,
  type FormatOptions,
} from '@danecodes/roku-ecp';

export {
  parseConsoleForIssues,
  type ConsoleIssues,
} from '@danecodes/roku-ecp';

export {
  EcpHttpError,
  EcpTimeoutError,
  EcpAuthError,
} from '@danecodes/roku-ecp';

export {
  waitForElement,
  waitForFocus,
  waitForApp,
  waitForText,
  type WaitOptions,
} from '@danecodes/roku-ecp';

// roku-mcp-specific: chalk-colored tree formatter
export { formatTreeColored } from './format-colored.js';
