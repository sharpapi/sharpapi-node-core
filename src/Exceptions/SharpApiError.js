/**
 * SharpAPI Error
 *
 * Custom error class that carries an HTTP status code.
 * Mirrors PHP's ApiException from sharpapi/php-core.
 */
class SharpApiError extends Error {
  /**
   * @param {string} message - Error message.
   * @param {number|null} statusCode - HTTP status code (e.g. 429, 408).
   */
  constructor(message, statusCode = null) {
    super(message);
    this.name = 'SharpApiError';
    this.statusCode = statusCode;
  }
}

module.exports = { SharpApiError };
