const axios = require('axios');
const { SharpApiCoreService } = require('../src/SharpApiCoreService');
const { SharpApiError } = require('../src/Exceptions/SharpApiError');
const { SharpApiJobStatusEnum } = require('../src/Enums/SharpApiJobStatusEnum');

jest.mock('axios');

const API_KEY = 'test-api-key-12345';

function createService(overrides = {}) {
  const svc = new SharpApiCoreService(API_KEY);
  Object.assign(svc, overrides);
  return svc;
}

function mockAxiosResponse(data = {}, headers = {}, status = 200) {
  return { data, headers, status };
}

describe('SharpApiCoreService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ───────────── Constructor & Defaults ─────────────

  test('constructor requires apiKey', () => {
    expect(() => new SharpApiCoreService('')).toThrow('API key is required.');
    expect(() => new SharpApiCoreService(null)).toThrow('API key is required.');
  });

  test('constructor sets rate limiting defaults', () => {
    const svc = new SharpApiCoreService(API_KEY);
    expect(svc.rateLimitLimit).toBeNull();
    expect(svc.rateLimitRemaining).toBeNull();
    expect(svc.maxRetryOnRateLimit).toBe(3);
    expect(svc.rateLimitLowThreshold).toBe(3);
    expect(svc.throttleRequests).toBe(true);
    expect(svc.requestsPerMinute).toBe(60);
  });

  test('user agent reflects v1.3.0', () => {
    const svc = new SharpApiCoreService(API_KEY);
    expect(svc.userAgent).toContain('1.3.0');
  });

  // ───────────── Backward Compatibility ─────────────

  test('constructor signature unchanged (3 params)', () => {
    const svc = new SharpApiCoreService(API_KEY, 'https://custom.api/v1', 'CustomAgent/1.0');
    expect(svc.apiBaseUrl).toBe('https://custom.api/v1');
    expect(svc.userAgent).toBe('CustomAgent/1.0');
  });

  // ───────────── extractRateLimitHeaders ─────────────

  test('extracts X-RateLimit headers from response', () => {
    const svc = createService();
    svc.extractRateLimitHeaders(mockAxiosResponse({}, {
      'x-ratelimit-limit': '100',
      'x-ratelimit-remaining': '42',
    }));
    expect(svc.rateLimitLimit).toBe(100);
    expect(svc.rateLimitRemaining).toBe(42);
  });

  test('extractRateLimitHeaders handles missing headers gracefully', () => {
    const svc = createService();
    svc.extractRateLimitHeaders(mockAxiosResponse({}, {}));
    expect(svc.rateLimitLimit).toBeNull();
    expect(svc.rateLimitRemaining).toBeNull();
  });

  test('extractRateLimitHeaders handles null response', () => {
    const svc = createService();
    expect(() => svc.extractRateLimitHeaders(null)).not.toThrow();
    expect(() => svc.extractRateLimitHeaders(undefined)).not.toThrow();
  });

  test('extractRateLimitHeaders adapts limiter upward', () => {
    const svc = createService();
    svc.extractRateLimitHeaders(mockAxiosResponse({}, {
      'x-ratelimit-limit': '120',
    }));
    expect(svc.rateLimiter.getMaxRequests()).toBe(120);
  });

  // ───────────── adjustIntervalForRateLimit ─────────────

  test('adjustIntervalForRateLimit returns base when remaining is high', () => {
    const svc = createService({ rateLimitRemaining: 50 });
    expect(svc.adjustIntervalForRateLimit(10)).toBe(10);
  });

  test('adjustIntervalForRateLimit returns base when remaining is null', () => {
    const svc = createService({ rateLimitRemaining: null });
    expect(svc.adjustIntervalForRateLimit(10)).toBe(10);
  });

  test('adjustIntervalForRateLimit scales up when remaining is at threshold', () => {
    const svc = createService({ rateLimitRemaining: 3, rateLimitLowThreshold: 3 });
    // scale = 2 + (3 - 3) = 2 → 10 * 2 = 20
    expect(svc.adjustIntervalForRateLimit(10)).toBe(20);
  });

  test('adjustIntervalForRateLimit scales up more when remaining is 0', () => {
    const svc = createService({ rateLimitRemaining: 0, rateLimitLowThreshold: 3 });
    // scale = 2 + (3 - 0) = 5 → 10 * 5 = 50
    expect(svc.adjustIntervalForRateLimit(10)).toBe(50);
  });

  // ───────────── makeRequest ─────────────

  test('makeRequest GET calls axios.get via retry wrapper', async () => {
    const svc = createService({ throttleRequests: false });
    axios.get.mockResolvedValueOnce(mockAxiosResponse({ ping: 'pong' }, {
      'x-ratelimit-limit': '60',
      'x-ratelimit-remaining': '59',
    }));

    const response = await svc.makeRequest('GET', '/ping');
    expect(response.data).toEqual({ ping: 'pong' });
    expect(svc.rateLimitLimit).toBe(60);
    expect(svc.rateLimitRemaining).toBe(59);
  });

  test('makeRequest POST calls axios.post via retry wrapper', async () => {
    const svc = createService({ throttleRequests: false });
    axios.post.mockResolvedValueOnce(mockAxiosResponse({ status_url: 'http://x.com/status/1' }));

    const response = await svc.makeRequest('POST', '/translate', { content: 'hello' });
    expect(response.data.status_url).toBe('http://x.com/status/1');
  });

  // ───────────── 429 Retry Logic (with fake timers) ─────────────

  describe('executeWithRateLimitRetry (fake timers)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('retries on 429 and succeeds', async () => {
      const svc = createService({ throttleRequests: false, maxRetryOnRateLimit: 2 });

      const error429 = {
        response: {
          status: 429,
          headers: { 'retry-after': '5' },
        },
      };

      axios.get
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce(mockAxiosResponse({ ok: true }));

      const promise = svc.executeWithRateLimitRetry('GET', 'http://test.com/api', {
        headers: svc.getHeaders(),
      });

      // Advance past the 5-second retry-after
      await jest.advanceTimersByTimeAsync(5000);

      const response = await promise;
      expect(response.data).toEqual({ ok: true });
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test('throws after max retries on 429', async () => {
      const svc = createService({ throttleRequests: false, maxRetryOnRateLimit: 1 });

      const error429 = {
        response: {
          status: 429,
          headers: { 'retry-after': '5' },
        },
      };

      axios.get
        .mockRejectedValueOnce(error429)
        .mockRejectedValueOnce(error429);

      const promise = svc.executeWithRateLimitRetry('GET', 'http://test.com/api', {
        headers: svc.getHeaders(),
      });

      // Set up the expectation before advancing timers to avoid unhandled rejection
      const expectation = expect(promise).rejects.toEqual(error429);

      // Advance past the retry-after for the first retry
      await jest.advanceTimersByTimeAsync(5000);

      await expectation;
    });

    test('throws non-429 errors immediately', async () => {
      const svc = createService({ throttleRequests: false });

      const error500 = {
        response: { status: 500, headers: {} },
      };

      axios.get.mockRejectedValueOnce(error500);

      await expect(
        svc.executeWithRateLimitRetry('GET', 'http://test.com/api', {
          headers: svc.getHeaders(),
        })
      ).rejects.toEqual(error500);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });
  });

  // ───────────── fetchResults (with fake timers) ─────────────

  describe('fetchResults (fake timers)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('returns SharpApiJob on immediate success', async () => {
      const svc = createService({ throttleRequests: false });

      axios.get.mockResolvedValueOnce(mockAxiosResponse({
        data: {
          id: 'job-123',
          attributes: {
            type: 'translate',
            status: SharpApiJobStatusEnum.SUCCESS,
            result: { translated: 'hola' },
          },
        },
      }));

      const job = await svc.fetchResults('https://sharpapi.com/api/v1/jobs/123');
      expect(job.getId()).toBe('job-123');
      expect(job.getStatus()).toBe(SharpApiJobStatusEnum.SUCCESS);
      expect(job.getResultObject()).toEqual({ translated: 'hola' });
    });

    test('polls until success', async () => {
      const svc = createService({ throttleRequests: false, apiJobStatusPollingInterval: 2 });

      axios.get
        .mockResolvedValueOnce(mockAxiosResponse({
          data: {
            id: 'job-1',
            attributes: { type: 'test', status: SharpApiJobStatusEnum.PENDING, result: null },
          },
        }, {}))
        .mockResolvedValueOnce(mockAxiosResponse({
          data: {
            id: 'job-1',
            attributes: { type: 'test', status: SharpApiJobStatusEnum.SUCCESS, result: { ok: true } },
          },
        }));

      const promise = svc.fetchResults('https://sharpapi.com/api/v1/jobs/1');

      // Advance past the polling interval (default 2s since no retry-after header)
      await jest.advanceTimersByTimeAsync(2000);

      const job = await promise;
      expect(job.getStatus()).toBe(SharpApiJobStatusEnum.SUCCESS);
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test('throws SharpApiError on timeout', async () => {
      const svc = createService({
        throttleRequests: false,
        apiJobStatusPollingWait: 5,
        apiJobStatusPollingInterval: 3,
      });

      axios.get.mockResolvedValue(mockAxiosResponse({
        data: {
          id: 'job-123',
          attributes: {
            type: 'translate',
            status: SharpApiJobStatusEnum.PENDING,
            result: null,
          },
        },
      }, {}));

      const promise = svc.fetchResults('https://sharpapi.com/api/v1/jobs/123');

      // Set up the expectation before advancing timers
      const expectation = expect(promise).rejects.toThrow(SharpApiError);

      // Advance past the polling wait time
      await jest.advanceTimersByTimeAsync(6000);

      await expectation;
    });

    test('parseInt uses radix 10 (not 5)', async () => {
      const svc = createService({ throttleRequests: false, apiJobStatusPollingWait: 5 });

      // parseInt("8", 5) = NaN → would fall back to default interval
      // parseInt("8", 10) = 8 → exceeds apiJobStatusPollingWait of 5 → throws
      let callCount = 0;
      axios.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(mockAxiosResponse({
            data: {
              id: 'job-1',
              attributes: { type: 'test', status: SharpApiJobStatusEnum.PENDING, result: null },
            },
          }, { 'retry-after': '8' }));
        }
        return Promise.resolve(mockAxiosResponse({
          data: {
            id: 'job-1',
            attributes: { type: 'test', status: SharpApiJobStatusEnum.SUCCESS, result: { ok: true } },
          },
        }));
      });

      const promise = svc.fetchResults('https://sharpapi.com/api/v1/jobs/1');

      // Set up the expectation before advancing timers
      const expectation = expect(promise).rejects.toThrow(SharpApiError);

      // Advance timers enough to trigger the timeout check
      await jest.advanceTimersByTimeAsync(10000);

      // With radix 10, retry-after = 8 which exceeds apiJobStatusPollingWait = 5 → throws
      await expectation;
    });

    test('handles 429 during polling', async () => {
      const svc = createService({
        throttleRequests: false,
        apiJobStatusPollingWait: 120,
      });

      const error429 = {
        response: {
          status: 429,
          headers: { 'retry-after': '5' },
        },
      };

      axios.get
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce(mockAxiosResponse({
          data: {
            id: 'job-1',
            attributes: { type: 'test', status: SharpApiJobStatusEnum.SUCCESS, result: { done: true } },
          },
        }));

      const promise = svc.fetchResults('https://sharpapi.com/api/v1/jobs/1');

      // Advance past the 429 retry-after
      await jest.advanceTimersByTimeAsync(5000);

      const job = await promise;
      expect(job.getStatus()).toBe(SharpApiJobStatusEnum.SUCCESS);
    });
  });

  // ───────────── ping bypasses throttle ─────────────

  test('ping bypasses throttle and restores it', async () => {
    const svc = createService({ throttleRequests: true });

    axios.get.mockResolvedValueOnce(mockAxiosResponse({ ping: 'pong' }));

    const result = await svc.ping();
    expect(result).toEqual({ ping: 'pong' });
    expect(svc.throttleRequests).toBe(true); // restored
  });

  // ───────────── quota adapts RPM ─────────────

  test('quota adapts requestsPerMinute from response', async () => {
    const svc = createService({ throttleRequests: true });

    axios.get.mockResolvedValueOnce(mockAxiosResponse({
      timestamp: '2026-01-10T00:00:00Z',
      on_trial: false,
      trial_ends: '2026-01-01T00:00:00Z',
      subscribed: true,
      current_subscription_start: '2026-01-01T00:00:00Z',
      current_subscription_end: '2026-02-01T00:00:00Z',
      subscription_words_quota: 100000,
      subscription_words_used: 5000,
      subscription_words_used_percentage: 5,
      requests_per_minute: 120,
    }));

    const info = await svc.quota();
    expect(info).not.toBeNull();
    expect(svc.requestsPerMinute).toBe(120);
    expect(svc.rateLimiter.getMaxRequests()).toBe(120);
    expect(svc.throttleRequests).toBe(true); // restored
  });

  // ───────────── canMakeRequest ─────────────

  test('canMakeRequest returns true when remaining is null', () => {
    const svc = createService({ rateLimitRemaining: null });
    expect(svc.canMakeRequest()).toBe(true);
  });

  test('canMakeRequest returns true when remaining > 0', () => {
    const svc = createService({ rateLimitRemaining: 10 });
    expect(svc.canMakeRequest()).toBe(true);
  });

  test('canMakeRequest returns false when remaining is 0', () => {
    const svc = createService({ rateLimitRemaining: 0 });
    expect(svc.canMakeRequest()).toBe(false);
  });

  // ───────────── Getter/Setter Round-trips ─────────────

  test('getter/setter round-trips for all configurable properties', () => {
    const svc = new SharpApiCoreService(API_KEY);

    svc.setMaxRetryOnRateLimit(5);
    expect(svc.getMaxRetryOnRateLimit()).toBe(5);

    svc.setRateLimitLowThreshold(10);
    expect(svc.getRateLimitLowThreshold()).toBe(10);

    svc.setThrottleRequests(false);
    expect(svc.getThrottleRequests()).toBe(false);

    svc.setRequestsPerMinute(120);
    expect(svc.getRequestsPerMinute()).toBe(120);
    expect(svc.rateLimiter.getMaxRequests()).toBe(120);
  });

  // ───────────── getRateLimitState / setRateLimitState ─────────────

  test('getRateLimitState / setRateLimitState round-trip', () => {
    const svc = new SharpApiCoreService(API_KEY);
    svc.rateLimitLimit = 100;
    svc.rateLimitRemaining = 42;
    svc.maxRetryOnRateLimit = 5;

    const state = svc.getRateLimitState();
    expect(state.rateLimitLimit).toBe(100);
    expect(state.rateLimitRemaining).toBe(42);
    expect(state.maxRetryOnRateLimit).toBe(5);

    const svc2 = new SharpApiCoreService(API_KEY);
    svc2.setRateLimitState(state);
    expect(svc2.rateLimitLimit).toBe(100);
    expect(svc2.rateLimitRemaining).toBe(42);
    expect(svc2.maxRetryOnRateLimit).toBe(5);
  });

  // ───────────── SharpApiError ─────────────

  test('SharpApiError carries statusCode', () => {
    const err = new SharpApiError('rate limited', 429);
    expect(err.message).toBe('rate limited');
    expect(err.statusCode).toBe(429);
    expect(err.name).toBe('SharpApiError');
    expect(err instanceof Error).toBe(true);
  });

  // ───────────── SharpApiSubscriptionInfo new fields ─────────────

  test('SharpApiSubscriptionInfo includes new fields', () => {
    const { SharpApiSubscriptionInfo } = require('../src/Dto/SharpApiSubscriptionInfo');
    const info = new SharpApiSubscriptionInfo({
      timestamp: '2026-01-10T00:00:00Z',
      on_trial: false,
      trial_ends: '2026-01-01T00:00:00Z',
      subscribed: true,
      current_subscription_start: '2026-01-01T00:00:00Z',
      current_subscription_end: '2026-02-01T00:00:00Z',
      current_subscription_reset: '2026-01-15T00:00:00Z',
      subscription_words_quota: 100000,
      subscription_words_used: 5000,
      subscription_words_used_percentage: 5,
      requests_per_minute: 120,
    });
    expect(info.current_subscription_reset).toBeInstanceOf(Date);
    expect(info.requests_per_minute).toBe(120);
  });

  test('SharpApiSubscriptionInfo new fields default to null', () => {
    const { SharpApiSubscriptionInfo } = require('../src/Dto/SharpApiSubscriptionInfo');
    const info = new SharpApiSubscriptionInfo({
      timestamp: '2026-01-10T00:00:00Z',
      on_trial: false,
      trial_ends: '2026-01-01T00:00:00Z',
      subscribed: true,
      current_subscription_start: '2026-01-01T00:00:00Z',
      current_subscription_end: '2026-02-01T00:00:00Z',
      subscription_words_quota: 100000,
      subscription_words_used: 5000,
      subscription_words_used_percentage: 5,
    });
    expect(info.current_subscription_reset).toBeNull();
    expect(info.requests_per_minute).toBeNull();
  });

  // ───────────── makeGetRequest convenience ─────────────

  test('makeGetRequest delegates to makeRequest GET', async () => {
    const svc = createService({ throttleRequests: false });
    axios.get.mockResolvedValueOnce(mockAxiosResponse({ result: 'ok' }));

    const response = await svc.makeGetRequest('/test', { page: 1 });
    expect(response.data.result).toBe('ok');
  });
});
