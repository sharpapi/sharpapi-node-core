const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { URL } = require('url');

const { SharpApiJob } = require('./Dto/SharpApiJob');
const { SharpApiSubscriptionInfo } = require('./Dto/SharpApiSubscriptionInfo');
const { SharpApiJobStatusEnum } = require('./Enums/SharpApiJobStatusEnum');
const { SlidingWindowRateLimiter } = require('./SlidingWindowRateLimiter');
const { SharpApiError } = require('./Exceptions/SharpApiError');

/**
 * Core Service for SharpAPI.com with shared functionality.
 *
 * Includes proactive rate limiting, 429 retry logic, adaptive polling,
 * and rate limit header tracking (X-RateLimit-Limit / X-RateLimit-Remaining).
 */
class SharpApiCoreService {
  /**
   * Initializes a new instance of the class.
   *
   * @param {string} apiKey - Your SharpAPI API key.
   * @param {string} [apiBaseUrl] - The base URL for the API.
   * @param {string} [userAgent] - Custom User-Agent string.
   */
  constructor(apiKey, apiBaseUrl = 'https://sharpapi.com/api/v1', userAgent = 'SharpAPINodeClient/1.3.0') {
    if (!apiKey) {
      throw new Error('API key is required.');
    }
    this.apiKey = apiKey;
    this.apiBaseUrl = apiBaseUrl;
    this.userAgent = userAgent;

    this.apiJobStatusPollingInterval = 10; // seconds
    this.useCustomInterval = false;
    this.apiJobStatusPollingWait = 180; // seconds

    // Rate limit state from server headers
    this.rateLimitLimit = null;
    this.rateLimitRemaining = null;

    // Configurable rate limiting behavior
    this.maxRetryOnRateLimit = 3;
    this.rateLimitLowThreshold = 3;
    this.throttleRequests = true;
    this.requestsPerMinute = 60;

    // Proactive sliding window rate limiter
    this.rateLimiter = new SlidingWindowRateLimiter(this.requestsPerMinute, 60);
  }

  // ──────────────────────────────── Headers ────────────────────────────────

  getHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': this.userAgent,
    };
  }

  /**
   * Extract and store X-RateLimit-* headers from any API response.
   * Adapts the sliding window limiter when the server reports a higher limit.
   *
   * @param {object} response - Axios response object.
   */
  extractRateLimitHeaders(response) {
    if (!response || !response.headers) return;

    const limit = parseInt(response.headers['x-ratelimit-limit'], 10);
    const remaining = parseInt(response.headers['x-ratelimit-remaining'], 10);

    if (!isNaN(limit)) {
      this.rateLimitLimit = limit;
      this.rateLimiter.adaptFromServerLimit(limit);
    }
    if (!isNaN(remaining)) {
      this.rateLimitRemaining = remaining;
    }
  }

  // ──────────────────────────── Adaptive Polling ───────────────────────────

  /**
   * Scale up the polling interval when remaining requests are low.
   * Formula: baseInterval * (2 + (threshold - remaining))
   *
   * @param {number} baseInterval - Base interval in seconds.
   * @returns {number} Adjusted interval in seconds.
   */
  adjustIntervalForRateLimit(baseInterval) {
    if (
      this.rateLimitRemaining !== null &&
      this.rateLimitRemaining <= this.rateLimitLowThreshold
    ) {
      const scale = 2 + (this.rateLimitLowThreshold - this.rateLimitRemaining);
      return baseInterval * scale;
    }
    return baseInterval;
  }

  // ────────────────────────── Rate-Limited Execution ───────────────────────

  /**
   * Execute an HTTP request with proactive throttling and 429 retry logic.
   *
   * @param {string} method - HTTP method (GET or POST).
   * @param {string} fullUrl - Full URL to request.
   * @param {object} options - Axios request options.
   * @returns {Promise<object>} Axios response.
   */
  async executeWithRateLimitRetry(method, fullUrl, options) {
    // Proactive throttle: wait if the sliding window is full
    if (this.throttleRequests) {
      await this.rateLimiter.waitIfNeeded();
    }

    let lastError;

    for (let attempt = 0; attempt <= this.maxRetryOnRateLimit; attempt++) {
      try {
        const response =
          method === 'POST'
            ? await axios.post(fullUrl, options.data, { headers: options.headers })
            : await axios.get(fullUrl, { headers: options.headers, params: options.params });

        this.extractRateLimitHeaders(response);
        return response;
      } catch (error) {
        lastError = error;

        if (error.response && error.response.status === 429 && attempt < this.maxRetryOnRateLimit) {
          this.extractRateLimitHeaders(error.response);
          const retryAfter = parseInt(error.response.headers['retry-after'], 10) || 60;
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  // ──────────────────────────── Request Methods ───────────────────────────

  /**
   * Generic request method to run axios client.
   * Routes through executeWithRateLimitRetry for throttling and 429 handling.
   *
   * @param {string} method - HTTP method.
   * @param {string} url - API endpoint (relative to apiBaseUrl).
   * @param {object} data - Data to send.
   * @param {string} [filePath] - File path for file uploads.
   * @returns {Promise<object>} - Axios response.
   */
  async makeRequest(method, url, data = {}, filePath = null) {
    const fullUrl = `${this.apiBaseUrl}${url}`;
    const headers = this.getHeaders();

    if (method === 'POST' && filePath) {
      // File uploads bypass the generic retry wrapper to handle FormData properly
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      Object.keys(data).forEach((key) => {
        formData.append(key, data[key]);
      });

      if (this.throttleRequests) {
        await this.rateLimiter.waitIfNeeded();
      }

      const response = await axios.post(fullUrl, formData, {
        headers: {
          ...headers,
          ...formData.getHeaders(),
        },
      });
      this.extractRateLimitHeaders(response);
      return response;
    }

    return this.executeWithRateLimitRetry(method, fullUrl, {
      headers,
      data,
      params: method !== 'POST' ? data : undefined,
    });
  }

  /**
   * Convenience method for GET requests with query parameters.
   *
   * @param {string} url - API endpoint (relative to apiBaseUrl).
   * @param {object} [queryParams] - Query parameters.
   * @returns {Promise<object>} - Axios response.
   */
  async makeGetRequest(url, queryParams = {}) {
    return this.makeRequest('GET', url, queryParams);
  }

  parseStatusUrl(response) {
    return response.data.status_url;
  }

  // ──────────────────────────── Job Polling ────────────────────────────────

  /**
   * Poll for job completion with adaptive intervals, 429 handling, and proactive throttling.
   *
   * @param {string} statusUrl - The URL to check job status.
   * @returns {Promise<SharpApiJob>} - The job result.
   * @throws {SharpApiError} On timeout or unrecoverable failure.
   */
  async fetchResults(statusUrl) {
    let waitingTime = 0;
    let response;

    while (true) {
      // Proactive throttle before each poll
      if (this.throttleRequests) {
        await this.rateLimiter.waitIfNeeded();
      }

      try {
        response = await axios.get(statusUrl, { headers: this.getHeaders() });
        this.extractRateLimitHeaders(response);
      } catch (error) {
        if (error.response && error.response.status === 429) {
          this.extractRateLimitHeaders(error.response);
          const retryAfter = parseInt(error.response.headers['retry-after'], 10) || 60;
          waitingTime += retryAfter;
          if (waitingTime >= this.apiJobStatusPollingWait) {
            throw new SharpApiError(
              `Job polling timed out after ${waitingTime}s (429 rate limited)`,
              429
            );
          }
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        throw error;
      }

      const jobStatus = response.data.data.attributes;

      if (
        jobStatus.status === SharpApiJobStatusEnum.SUCCESS ||
        jobStatus.status === SharpApiJobStatusEnum.FAILED
      ) {
        break;
      }

      // Determine poll interval: Retry-After header → custom interval → default
      let retryAfter = parseInt(response.headers['retry-after'], 10) || this.apiJobStatusPollingInterval;

      if (this.useCustomInterval) {
        retryAfter = this.apiJobStatusPollingInterval;
      }

      // Adaptive scaling when rate limit is low
      retryAfter = this.adjustIntervalForRateLimit(retryAfter);

      waitingTime += retryAfter;

      if (waitingTime >= this.apiJobStatusPollingWait) {
        throw new SharpApiError(
          `Job polling timed out after ${waitingTime}s`,
          408
        );
      }

      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }

    const data = response.data.data;
    const url = new URL(statusUrl);

    let result;
    if (url.pathname.split('/').length === 5) {
      result = data.attributes.result;
    } else {
      result = data.attributes.result;
    }

    return new SharpApiJob(
      data.id,
      data.attributes.type,
      data.attributes.status,
      result || null
    );
  }

  // ──────────────────────────── Utility Endpoints ─────────────────────────

  /**
   * Simple PING endpoint to check API availability.
   * Bypasses proactive throttling (lightweight health check).
   *
   * @returns {Promise<object>} - Ping response.
   */
  async ping() {
    const savedThrottle = this.throttleRequests;
    this.throttleRequests = false;
    try {
      const response = await this.makeRequest('GET', '/ping');
      return response.data;
    } finally {
      this.throttleRequests = savedThrottle;
    }
  }

  /**
   * Endpoint to check details regarding the subscription's current period.
   * Bypasses proactive throttling and adapts RPM from response.
   *
   * @returns {Promise<SharpApiSubscriptionInfo|null>} - Subscription info.
   */
  async quota() {
    const savedThrottle = this.throttleRequests;
    this.throttleRequests = false;
    try {
      const response = await this.makeRequest('GET', '/quota');
      const info = response.data;

      if (!info.timestamp) {
        return null;
      }

      // Adapt RPM from server if provided
      if (info.requests_per_minute && typeof info.requests_per_minute === 'number') {
        this.requestsPerMinute = info.requests_per_minute;
        this.rateLimiter.setMaxRequests(info.requests_per_minute);
      }

      return new SharpApiSubscriptionInfo(info);
    } finally {
      this.throttleRequests = savedThrottle;
    }
  }

  // ────────────────────────── Rate Limit Accessors ────────────────────────

  /**
   * Check if a request can be made (based on server-reported remaining).
   * @returns {boolean}
   */
  canMakeRequest() {
    if (this.rateLimitRemaining === null) return true;
    return this.rateLimitRemaining > 0;
  }

  /**
   * Get current rate limit state for external caching.
   * @returns {object}
   */
  getRateLimitState() {
    return {
      rateLimitLimit: this.rateLimitLimit,
      rateLimitRemaining: this.rateLimitRemaining,
      maxRetryOnRateLimit: this.maxRetryOnRateLimit,
      rateLimitLowThreshold: this.rateLimitLowThreshold,
      throttleRequests: this.throttleRequests,
      requestsPerMinute: this.requestsPerMinute,
    };
  }

  /**
   * Restore rate limit state from external cache.
   * @param {object} state
   */
  setRateLimitState(state) {
    if (state.rateLimitLimit !== undefined) this.rateLimitLimit = state.rateLimitLimit;
    if (state.rateLimitRemaining !== undefined) this.rateLimitRemaining = state.rateLimitRemaining;
    if (state.maxRetryOnRateLimit !== undefined) this.maxRetryOnRateLimit = state.maxRetryOnRateLimit;
    if (state.rateLimitLowThreshold !== undefined) this.rateLimitLowThreshold = state.rateLimitLowThreshold;
    if (state.throttleRequests !== undefined) this.throttleRequests = state.throttleRequests;
    if (state.requestsPerMinute !== undefined) {
      this.requestsPerMinute = state.requestsPerMinute;
      this.rateLimiter.setMaxRequests(state.requestsPerMinute);
    }
  }

  // ────────────────────────── Getters / Setters ───────────────────────────

  getRateLimitLimit() { return this.rateLimitLimit; }
  getRateLimitRemaining() { return this.rateLimitRemaining; }

  getMaxRetryOnRateLimit() { return this.maxRetryOnRateLimit; }
  setMaxRetryOnRateLimit(value) { this.maxRetryOnRateLimit = value; }

  getRateLimitLowThreshold() { return this.rateLimitLowThreshold; }
  setRateLimitLowThreshold(value) { this.rateLimitLowThreshold = value; }

  getThrottleRequests() { return this.throttleRequests; }
  setThrottleRequests(value) { this.throttleRequests = value; }

  getRequestsPerMinute() { return this.requestsPerMinute; }
  setRequestsPerMinute(value) {
    this.requestsPerMinute = value;
    this.rateLimiter.setMaxRequests(value);
  }
}

module.exports = { SharpApiCoreService };
