/**
 * Sliding Window Rate Limiter
 *
 * Tracks request timestamps in a rolling window and blocks when capacity is reached.
 * Mirrors the PHP SlidingWindowRateLimiter from sharpapi/php-core v1.3.0.
 */
class SlidingWindowRateLimiter {
  /**
   * @param {number} maxRequests - Maximum requests allowed in the window.
   * @param {number} windowSeconds - Window duration in seconds.
   */
  constructor(maxRequests = 60, windowSeconds = 60) {
    this._maxRequests = maxRequests;
    this._windowSeconds = windowSeconds;
    this._timestamps = [];
  }

  /**
   * Remove timestamps that have fallen outside the current window.
   */
  _pruneExpired() {
    const cutoff = Date.now() - this._windowSeconds * 1000;
    this._timestamps = this._timestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Check if a request can proceed without waiting.
   * @returns {boolean}
   */
  canProceed() {
    this._pruneExpired();
    return this._timestamps.length < this._maxRequests;
  }

  /**
   * Number of request slots remaining in the current window.
   * @returns {number}
   */
  remaining() {
    this._pruneExpired();
    return Math.max(0, this._maxRequests - this._timestamps.length);
  }

  /**
   * Wait until capacity is available, record the request, and return seconds waited.
   * @returns {Promise<number>} Seconds waited (0 if no wait was needed).
   */
  async waitIfNeeded() {
    this._pruneExpired();

    if (this._timestamps.length < this._maxRequests) {
      this._timestamps.push(Date.now());
      return 0;
    }

    // Wait until the oldest request in the window expires
    const oldestTimestamp = this._timestamps[0];
    const waitMs = oldestTimestamp + this._windowSeconds * 1000 - Date.now();

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    this._pruneExpired();
    this._timestamps.push(Date.now());
    return Math.max(0, waitMs / 1000);
  }

  /**
   * One-way ratchet: only increase maxRequests from a server-reported limit.
   * @param {number} serverLimit
   */
  adaptFromServerLimit(serverLimit) {
    if (typeof serverLimit === 'number' && serverLimit > this._maxRequests) {
      this._maxRequests = serverLimit;
    }
  }

  /** @returns {number} */
  getMaxRequests() {
    return this._maxRequests;
  }

  /** @param {number} max */
  setMaxRequests(max) {
    this._maxRequests = max;
  }

  /** @returns {number} */
  getWindowSeconds() {
    return this._windowSeconds;
  }
}

module.exports = { SlidingWindowRateLimiter };
