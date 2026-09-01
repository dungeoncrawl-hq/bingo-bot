import { describe, expect, it } from 'vitest';
import { progressColor } from './progressColor.js';

describe('progressColor', () => {
  it('is pure red at 0%', () => {
    expect(progressColor(0)).toBe('#ef4444');
  });

  it('is pure yellow at 50%', () => {
    expect(progressColor(50)).toBe('#eab308');
  });

  it('is pure green at 100%', () => {
    expect(progressColor(100)).toBe('#22c55e');
  });

  it('clamps below 0 to red', () => {
    expect(progressColor(-20)).toBe('#ef4444');
  });

  it('clamps above 100 to green', () => {
    expect(progressColor(150)).toBe('#22c55e');
  });

  it('is mostly red near 5%', () => {
    const near5 = progressColor(5);
    expect(near5).not.toBe('#eab308');
    expect(near5).not.toBe('#22c55e');
    expect(near5).toBe('#ef4f3e');
  });

  it('is mostly green near 99%', () => {
    const near99 = progressColor(99);
    expect(near99).not.toBe('#ef4444');
    expect(near99).not.toBe('#eab308');
  });
});
