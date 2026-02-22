const { SlidingWindowRateLimiter } = require('../src/SlidingWindowRateLimiter');

describe('SlidingWindowRateLimiter', () => {
  test('constructor sets default values', () => {
    const limiter = new SlidingWindowRateLimiter();
    expect(limiter.getMaxRequests()).toBe(60);
    expect(limiter.getWindowSeconds()).toBe(60);
  });

  test('constructor accepts custom values', () => {
    const limiter = new SlidingWindowRateLimiter(10, 30);
    expect(limiter.getMaxRequests()).toBe(10);
    expect(limiter.getWindowSeconds()).toBe(30);
  });

  test('canProceed returns true when under limit', () => {
    const limiter = new SlidingWindowRateLimiter(5, 60);
    expect(limiter.canProceed()).toBe(true);
  });

  test('canProceed returns false when at limit', async () => {
    const limiter = new SlidingWindowRateLimiter(2, 60);
    await limiter.waitIfNeeded();
    await limiter.waitIfNeeded();
    expect(limiter.canProceed()).toBe(false);
  });

  test('remaining counts correctly', async () => {
    const limiter = new SlidingWindowRateLimiter(5, 60);
    expect(limiter.remaining()).toBe(5);

    await limiter.waitIfNeeded();
    expect(limiter.remaining()).toBe(4);

    await limiter.waitIfNeeded();
    expect(limiter.remaining()).toBe(3);
  });

  test('waitIfNeeded returns 0 when capacity available', async () => {
    const limiter = new SlidingWindowRateLimiter(5, 60);
    const waited = await limiter.waitIfNeeded();
    expect(waited).toBe(0);
  });

  test('adaptFromServerLimit ratchets up only', () => {
    const limiter = new SlidingWindowRateLimiter(10, 60);

    // Should increase
    limiter.adaptFromServerLimit(20);
    expect(limiter.getMaxRequests()).toBe(20);

    // Should NOT decrease
    limiter.adaptFromServerLimit(5);
    expect(limiter.getMaxRequests()).toBe(20);

    // Ignores non-numbers
    limiter.adaptFromServerLimit(null);
    expect(limiter.getMaxRequests()).toBe(20);

    limiter.adaptFromServerLimit(undefined);
    expect(limiter.getMaxRequests()).toBe(20);
  });

  test('setMaxRequests / getMaxRequests round-trip', () => {
    const limiter = new SlidingWindowRateLimiter(10, 60);
    limiter.setMaxRequests(100);
    expect(limiter.getMaxRequests()).toBe(100);
  });

  test('expired timestamps are pruned', async () => {
    // Use a very short window for testing
    const limiter = new SlidingWindowRateLimiter(2, 0.1); // 100ms window

    await limiter.waitIfNeeded();
    await limiter.waitIfNeeded();
    expect(limiter.canProceed()).toBe(false);

    // Wait for the window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(limiter.canProceed()).toBe(true);
    expect(limiter.remaining()).toBe(2);
  });
});
