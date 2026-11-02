/**
 * Used by: text-field, select, button and controls
 */
export const CONTROL_HEIGHTS = {
  sm: 32,
  md: 36,
  lg: 42,
};

/**
 * Touch device heights (+ for better touch targets)
 */
export const CONTROL_TOUCH_HEIGHTS = {
  sm: 34,
  md: 40,
  lg: 48,
};

/**
 * Media query for touch device sizing.
 * Default: touch input + mobile viewport (hybrid approach)
 * Alternatives:
 * - "(pointer: coarse)" - all touch devices regardless of screen size
 * - "(max-width: 768px)" - breakpoint only
 */
export const TOUCH_MEDIA_QUERY = '@media (max-width: 768px)';
