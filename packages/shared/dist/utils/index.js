"use strict";
/**
 * Shared utility functions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDate = formatDate;
exports.formatDateTime = formatDateTime;
exports.slugify = slugify;
exports.truncate = truncate;
exports.isValidEmail = isValidEmail;
/**
 * Formats a date string for display.
 */
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}
/**
 * Formats a date string with time for display.
 */
function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}
/**
 * Generates a slug from a string.
 */
function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
/**
 * Truncates text to a maximum length with ellipsis.
 */
function truncate(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return text.slice(0, maxLength - 3) + '...';
}
/**
 * Validates an email address format.
 */
function isValidEmail(email) {
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
