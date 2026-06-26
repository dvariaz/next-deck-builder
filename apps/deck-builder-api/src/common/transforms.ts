import { TransformFnParams } from 'class-transformer';

export const toBoolean = ({ value }: TransformFnParams): boolean | undefined => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

// Normalizes a query param into an array. A single value (`?x=a`) arrives as a
// scalar, repeated values (`?x=a&x=b`) as an array; both become an array here.
export const toArray = ({ value }: TransformFnParams): unknown[] | undefined => {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
};
