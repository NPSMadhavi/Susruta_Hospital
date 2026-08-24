/**
 * Express 5 route parameters may be represented as a scalar or repeated
 * segment array. Native parseInt stringifies either shape at runtime.
 */
declare global {
  function parseInt(value: string | string[], radix?: number): number;
}

export {};