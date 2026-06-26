import { TransformFnParams } from 'class-transformer';
import { toArray, toBoolean } from './transforms';

const params = (value: unknown): TransformFnParams =>
  ({ value }) as TransformFnParams;

describe('toBoolean', () => {
  it('parses truthy and falsy string values', () => {
    expect(toBoolean(params('true'))).toBe(true);
    expect(toBoolean(params('false'))).toBe(false);
  });

  it('returns undefined for anything else', () => {
    expect(toBoolean(params('maybe'))).toBeUndefined();
    expect(toBoolean(params(undefined))).toBeUndefined();
  });
});

describe('toArray', () => {
  it('returns undefined for missing values', () => {
    expect(toArray(params(undefined))).toBeUndefined();
    expect(toArray(params(null))).toBeUndefined();
  });

  it('wraps a single scalar value in an array', () => {
    expect(toArray(params('DARK'))).toEqual(['DARK']);
  });

  it('passes through repeated values (already an array)', () => {
    expect(toArray(params(['DARK', 'LIGHT']))).toEqual(['DARK', 'LIGHT']);
  });

  it('splits a comma-joined value into multiple entries', () => {
    expect(toArray(params('DARK,LIGHT'))).toEqual(['DARK', 'LIGHT']);
  });

  it('trims whitespace around comma-separated entries', () => {
    expect(toArray(params('DARK, LIGHT'))).toEqual(['DARK', 'LIGHT']);
  });
});
