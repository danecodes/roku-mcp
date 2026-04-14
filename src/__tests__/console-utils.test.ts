import { describe, it, expect } from 'vitest';
import { parseConsoleForIssues } from '@danecodes/roku-ecp';

describe('parseConsoleForIssues', () => {
  it('returns empty categories for clean output', () => {
    const output = [
      'Roku Firmware: 14.0.0',
      'BrightScript Debugger connected',
      'Starting Crunchyroll...',
      '  Loading manifest...',
      '  HomeScene created',
    ].join('\n');

    const result = parseConsoleForIssues(output);

    expect(result.errors).toHaveLength(0);
    expect(result.crashes).toHaveLength(0);
    expect(result.exceptions).toHaveLength(0);
  });

  describe('errors', () => {
    it('catches BRIGHTSCRIPT: ERROR lines', () => {
      const output = [
        'BRIGHTSCRIPT: ERROR roSGNode.CallFunc: Unknown function "badFn"',
        '  in PlaybackManager pkg:/source/playback.brs(42)',
      ].join('\n');

      const { errors } = parseConsoleForIssues(output);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('BRIGHTSCRIPT: ERROR');
    });

    it('catches Runtime Error lines', () => {
      const output = 'Runtime Error. (runtime error &h02) in pkg:/source/utils.brs(17)';

      const { errors } = parseConsoleForIssues(output);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Runtime Error');
    });

    it('is case-insensitive for error detection', () => {
      const output = 'BRIGHTSCRIPT: error roArray.append: type mismatch';

      const { errors } = parseConsoleForIssues(output);

      expect(errors).toHaveLength(1);
    });

    it('trims whitespace from error lines', () => {
      const output = '   BRIGHTSCRIPT: ERROR something bad   ';

      const { errors } = parseConsoleForIssues(output);

      expect(errors[0]).toBe('BRIGHTSCRIPT: ERROR something bad');
    });

    it('collects multiple errors', () => {
      const output = [
        'BRIGHTSCRIPT: ERROR foo',
        'some normal output',
        'Runtime Error. something else',
        'BRIGHTSCRIPT: ERROR bar',
      ].join('\n');

      const { errors } = parseConsoleForIssues(output);

      expect(errors).toHaveLength(3);
    });
  });

  describe('crashes', () => {
    it('catches Backtrace lines', () => {
      const output = [
        'Backtrace:',
        '#1  Function crashyFn() pkg:/source/bad.brs(10)',
      ].join('\n');

      const { crashes } = parseConsoleForIssues(output);

      expect(crashes).toHaveLength(1);
      expect(crashes[0]).toBe('Backtrace:');
    });

    it('catches -- crash lines', () => {
      const output = '-- crash -- pkg:/source/app.brs(99)';

      const { crashes } = parseConsoleForIssues(output);

      expect(crashes).toHaveLength(1);
    });

    it('catches BRIGHTSCRIPT STOP lines', () => {
      const output = 'BRIGHTSCRIPT STOP encountered';

      const { crashes } = parseConsoleForIssues(output);

      expect(crashes).toHaveLength(1);
    });
  });

  describe('exceptions', () => {
    it('catches STOP in file lines', () => {
      const output = 'STOP in file pkg:/source/debug.brs(5)';

      const { exceptions } = parseConsoleForIssues(output);

      expect(exceptions).toHaveLength(1);
    });

    it('catches PAUSE in file lines', () => {
      const output = 'PAUSE in file pkg:/source/ui.brs(12)';

      const { exceptions } = parseConsoleForIssues(output);

      expect(exceptions).toHaveLength(1);
    });
  });

  it('categorizes each issue type independently', () => {
    const output = [
      'BRIGHTSCRIPT: ERROR bad call',
      'Backtrace:',
      'STOP in file pkg:/foo.brs(1)',
    ].join('\n');

    const result = parseConsoleForIssues(output);

    expect(result.errors).toHaveLength(1);
    expect(result.crashes).toHaveLength(1);
    expect(result.exceptions).toHaveLength(1);
  });

  it('handles empty string', () => {
    const result = parseConsoleForIssues('');

    expect(result.errors).toHaveLength(0);
    expect(result.crashes).toHaveLength(0);
    expect(result.exceptions).toHaveLength(0);
  });
});
