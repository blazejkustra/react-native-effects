/**
 * React Native ships a `performance` global (the same clock
 * `requestAnimationFrame` timestamps come from), but the strict API type
 * surface doesn't declare it and the project's `lib` has no DOM. Declare just
 * the bit the examples use for frame timing.
 */
declare const performance: { now(): number };
