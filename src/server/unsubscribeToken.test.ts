import { describe, expect, it } from 'vitest';
import { makeUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribeToken';

describe('unsubscribe token', () => {
  it('a token made for one profile id verifies against that same id and secret', () => {
    const token = makeUnsubscribeToken('profile-1', 'secret-a');
    expect(verifyUnsubscribeToken('profile-1', token, 'secret-a')).toBe(true);
  });

  it('rejects a token made for a different profile id', () => {
    const token = makeUnsubscribeToken('profile-1', 'secret-a');
    expect(verifyUnsubscribeToken('profile-2', token, 'secret-a')).toBe(false);
  });

  it('rejects a token made with a different secret', () => {
    const token = makeUnsubscribeToken('profile-1', 'secret-a');
    expect(verifyUnsubscribeToken('profile-1', token, 'secret-b')).toBe(false);
  });

  it('rejects a garbage/tampered token without throwing', () => {
    expect(verifyUnsubscribeToken('profile-1', 'not-a-real-token', 'secret-a')).toBe(false);
    expect(verifyUnsubscribeToken('profile-1', '', 'secret-a')).toBe(false);
  });
});
