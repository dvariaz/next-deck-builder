import { TransformFnParams } from 'class-transformer';

export const toBoolean = ({ value }: TransformFnParams): boolean | undefined => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

// Normalizes a query param into an array, accepting every shape a client might
// send: a single value (`?x=a`), repeated values (`?x=a&x=b` → array), or a
// comma-joined value (`?x=a,b`). The comma form is what `String([...])`-based
// serializers (e.g. orval's generated client) emit for array params.
export const toArray = ({ value }: TransformFnParams): unknown[] | undefined => {
  if (value === undefined || value === null) return undefined;
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((v) =>
    typeof v === 'string' ? v.split(',').map((s) => s.trim()) : v,
  );
};
