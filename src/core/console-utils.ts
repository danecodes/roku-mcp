/**
 * Utilities for parsing BrightScript debug console output.
 */

export interface ConsoleIssues {
  errors: string[];
  crashes: string[];
  exceptions: string[];
}

/**
 * Scan raw console output for BrightScript errors, crashes, and exceptions.
 *
 * Categories:
 *   errors     — BRIGHTSCRIPT: ERROR, Runtime Error
 *   crashes    — Backtrace, -- crash, BRIGHTSCRIPT STOP
 *   exceptions — STOP in file, PAUSE in file (breakpoint hits)
 */
export function parseConsoleForIssues(output: string): ConsoleIssues {
  const errors: string[] = [];
  const crashes: string[] = [];
  const exceptions: string[] = [];

  for (const line of output.split('\n')) {
    const l = line.toLowerCase();
    if (l.includes('brightscript: error') || l.includes('runtime error')) {
      errors.push(line.trim());
    } else if (
      l.includes('backtrace') ||
      l.includes('-- crash') ||
      l.includes('brightscript stop')
    ) {
      crashes.push(line.trim());
    } else if (l.includes('stop in file') || l.includes('pause in file')) {
      exceptions.push(line.trim());
    }
  }

  return { errors, crashes, exceptions };
}
