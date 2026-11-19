/** `list[index]`, which must exist (the caller has checked the bounds). */
export function at<T>(list: ArrayLike<T>, index: number): T {
  const value = list[index];
  if (value === undefined) throw new RangeError(`index ${index} out of range`);
  return value;
}

/** `value`, which must not be null or undefined. */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new TypeError(`missing ${what}`);
  return value;
}
