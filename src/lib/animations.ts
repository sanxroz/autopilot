/**
 * Animation utilities and easing presets based on Emil Kowalski's animations.dev course
 * All animations follow these principles:
 * - Use ease-out for enter/exit animations
 * - Use ease-in-out for element movement
 * - Keep durations under 300ms for UI interactions
 * - Support prefers-reduced-motion for accessibility
 */

export const EASING = {
  // ease-out variants (for entering/exiting elements)
  "out-quad": [0.25, 0.46, 0.45, 0.94],
  "out-cubic": [0.215, 0.61, 0.355, 1],
  "out-quart": [0.165, 0.84, 0.44, 1],
  "out-quint": [0.23, 1, 0.32, 1],
  "out-expo": [0.19, 1, 0.22, 1],
  "out-circ": [0.075, 0.82, 0.165, 1],

  // ease-in-out variants (for moving elements on screen)
  "in-out-quad": [0.455, 0.03, 0.515, 0.955],
  "in-out-cubic": [0.645, 0.045, 0.355, 1],
  "in-out-quart": [0.77, 0, 0.175, 1],
  "in-out-quint": [0.86, 0, 0.07, 1],
  "in-out-expo": [1, 0, 0, 1],
  "in-out-circ": [0.785, 0.135, 0.15, 0.86],
} as const;

export const ANIMATION = {
  // Standard UI animations
  duration: {
    micro: 100,
    fast: 150,
    base: 200,
    normal: 250,
    slow: 300,
  },

  // Common animation transitions
  transitions: {
    // Panel slide animations
    panelSlide: {
      duration: 0.25,
      ease: EASING["out-cubic"],
    },
    // File expansion height change
    fileExpand: {
      duration: 0.3,
      ease: EASING["in-out-cubic"],
    },
    // Tab/modal fade
    fadeQuick: {
      duration: 0.15,
      ease: EASING["out-cubic"],
    },
    // Button press feedback
    buttonPress: {
      duration: 0.1,
      ease: "easeOut",
    },
    // Hover effects
    hover: {
      duration: 0.15,
      ease: "easeOut",
    },
  },

  // Variants for common patterns
  variants: {
    slideInRight: {
      initial: { x: 400, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: 400, opacity: 0 },
      transition: {
        duration: 0.25,
        ease: EASING["out-cubic"],
      },
    },
    slideInLeft: {
      initial: { x: -400, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: -400, opacity: 0 },
      transition: {
        duration: 0.25,
        ease: EASING["out-cubic"],
      },
    },
    fadeIn: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: {
        duration: 0.15,
        ease: EASING["out-cubic"],
      },
    },
    scaleIn: {
      initial: { scale: 0.95, opacity: 0 },
      animate: { scale: 1, opacity: 1 },
      exit: { scale: 0.95, opacity: 0 },
      transition: {
        duration: 0.2,
        ease: EASING["out-cubic"],
      },
    },
  },
} as const;



/**
 * Get animation config that respects reduced motion preference
 * When reduced motion is enabled, returns immediate (no animation) config
 */
export function getAnimationConfig(
  config: any,
  reducedMotion: boolean
) {
  if (reducedMotion) {
    return {
      ...config,
      transition: { duration: 0 },
    };
  }
  return config;
}
