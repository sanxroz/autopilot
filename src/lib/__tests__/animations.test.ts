import { describe, it, expect } from 'vitest';
import { EASING, ANIMATION, getAnimationConfig } from '../animations';

describe('EASING', () => {
  it('all values are arrays of 4 numbers', () => {
    for (const [name, value] of Object.entries(EASING)) {
      expect(Array.isArray(value), `${name} should be an array`).toBe(true);
      expect(value).toHaveLength(4);
      for (const n of value) {
        expect(typeof n).toBe('number');
      }
    }
  });

  it('has out and in-out variants', () => {
    const keys = Object.keys(EASING);
    expect(keys.some((k) => k.startsWith('out-'))).toBe(true);
    expect(keys.some((k) => k.startsWith('in-out-'))).toBe(true);
  });
});

describe('ANIMATION.duration', () => {
  it('all values are positive numbers', () => {
    for (const [name, value] of Object.entries(ANIMATION.duration)) {
      expect(typeof value, `${name} should be a number`).toBe('number');
      expect(value, `${name} should be positive`).toBeGreaterThan(0);
    }
  });

  it('values are ordered: micro < fast < base < normal < slow', () => {
    const { micro, fast, base, normal, slow } = ANIMATION.duration;
    expect(micro).toBeLessThan(fast);
    expect(fast).toBeLessThan(base);
    expect(base).toBeLessThan(normal);
    expect(normal).toBeLessThan(slow);
  });

  it('has expected values', () => {
    expect(ANIMATION.duration.micro).toBe(100);
    expect(ANIMATION.duration.fast).toBe(150);
    expect(ANIMATION.duration.base).toBe(200);
    expect(ANIMATION.duration.normal).toBe(250);
    expect(ANIMATION.duration.slow).toBe(300);
  });
});

describe('ANIMATION.transitions', () => {
  it('panelSlide has duration and ease', () => {
    expect(ANIMATION.transitions.panelSlide.duration).toBeGreaterThan(0);
    expect(ANIMATION.transitions.panelSlide.ease).toBeDefined();
  });

  it('fileExpand has duration and ease', () => {
    expect(ANIMATION.transitions.fileExpand.duration).toBeGreaterThan(0);
    expect(ANIMATION.transitions.fileExpand.ease).toBeDefined();
  });
});

describe('ANIMATION.variants', () => {
  it('slideInRight has initial, animate, exit, and transition', () => {
    const v = ANIMATION.variants.slideInRight;
    expect(v.initial).toBeDefined();
    expect(v.animate).toBeDefined();
    expect(v.exit).toBeDefined();
    expect(v.transition).toBeDefined();
  });

  it('fadeIn has opacity animations', () => {
    expect(ANIMATION.variants.fadeIn.initial).toEqual({ opacity: 0 });
    expect(ANIMATION.variants.fadeIn.animate).toEqual({ opacity: 1 });
    expect(ANIMATION.variants.fadeIn.exit).toEqual({ opacity: 0 });
  });
});

describe('getAnimationConfig', () => {
  it('returns config unchanged when reducedMotion is false', () => {
    const config = { x: 100, transition: { duration: 0.3 } };
    expect(getAnimationConfig(config, false)).toEqual(config);
  });

  it('returns config with duration 0 when reducedMotion is true', () => {
    const config = { x: 100, transition: { duration: 0.3, ease: 'easeOut' } };
    const result = getAnimationConfig(config, true);
    expect(result.transition.duration).toBe(0);
    expect(result.x).toBe(100);
  });
});
