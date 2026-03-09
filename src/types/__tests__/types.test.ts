import { describe, it, expect } from 'vitest';
import { AI_AGENTS } from '../index';
import { DEFAULT_GITHUB_SETTINGS, POLLING_INTERVALS } from '../github';

describe('AI_AGENTS', () => {
  it('has exactly 5 agents', () => {
    expect(AI_AGENTS).toHaveLength(5);
  });

  it('contains all expected agent ids', () => {
    const ids = AI_AGENTS.map((a) => a.id);
    expect(ids).toEqual(['opencode', 'claude', 'droid', 'amp', 'codex']);
  });

  it('each agent has required fields', () => {
    for (const agent of AI_AGENTS) {
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('command');
      expect(agent).toHaveProperty('promptFlag');
      expect(typeof agent.id).toBe('string');
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.command).toBe('string');
      // promptFlag can be string or null
      expect(agent.promptFlag === null || typeof agent.promptFlag === 'string').toBe(true);
    }
  });

  it('each agent has a non-empty name and command', () => {
    for (const agent of AI_AGENTS) {
      expect(agent.name.length).toBeGreaterThan(0);
      expect(agent.command.length).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_GITHUB_SETTINGS', () => {
  it('has correct default values', () => {
    expect(DEFAULT_GITHUB_SETTINGS).toEqual({
      pollingIntervalMs: 30000,
      ghCliAvailable: false,
      ghAuthUser: null,
    });
  });
});

describe('POLLING_INTERVALS', () => {
  it('has fast, normal, and slow intervals', () => {
    expect(POLLING_INTERVALS).toHaveProperty('fast');
    expect(POLLING_INTERVALS).toHaveProperty('normal');
    expect(POLLING_INTERVALS).toHaveProperty('slow');
  });

  it('intervals are ordered: fast < normal < slow', () => {
    expect(POLLING_INTERVALS.fast).toBeLessThan(POLLING_INTERVALS.normal);
    expect(POLLING_INTERVALS.normal).toBeLessThan(POLLING_INTERVALS.slow);
  });

  it('has expected values', () => {
    expect(POLLING_INTERVALS.fast).toBe(15000);
    expect(POLLING_INTERVALS.normal).toBe(30000);
    expect(POLLING_INTERVALS.slow).toBe(60000);
  });
});
