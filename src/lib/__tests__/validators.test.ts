import { describe, expect, it } from 'vitest';
import { isValidUsername, isValidEmail, isValidPassword, isValidCode } from '../validators';

describe('validators', () => {
  it('username 3-16 word chars', () => {
    expect(isValidUsername('Steve')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('has space')).toBe(false);
    expect(isValidUsername('Очень')).toBe(false);
  });
  it('email shape', () => {
    expect(isValidEmail('a@b.ru')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
  });
  it('password >= 8', () => {
    expect(isValidPassword('secret12')).toBe(true);
    expect(isValidPassword('short')).toBe(false);
  });
  it('code is 6 digits', () => {
    expect(isValidCode('123456')).toBe(true);
    expect(isValidCode('12a456')).toBe(false);
  });
});
