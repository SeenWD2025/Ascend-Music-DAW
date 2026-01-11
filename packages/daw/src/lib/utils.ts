/**
 * Utility functions for DAW components
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS support
 * Combines clsx for conditional classes with tailwind-merge for deduplication
 * 
 * @example
 * ```tsx
 * // Basic usage
 * cn('px-4 py-2', 'bg-blue-500')
 * // => 'px-4 py-2 bg-blue-500'
 * 
 * // Conditional classes
 * cn('base-class', isActive && 'active-class', !isDisabled && 'enabled-class')
 * 
 * // Tailwind merge (last wins)
 * cn('px-2 py-1', 'px-4')
 * // => 'py-1 px-4'
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
