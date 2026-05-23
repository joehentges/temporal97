import { describe, expect, it } from 'vitest';
import { add } from './index';

describe('add', () => {
  it('adds two positive numbers', () => {
    expect(add(1, 2)).toBe(3);
  });

  it('adds negative numbers', () => {
    expect(add(-1, -2)).toBe(-3);
  });

  it('adds zero', () => {
    expect(add(0, 5)).toBe(5);
  });
});
