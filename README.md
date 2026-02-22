![SharpAPI GitHub cover](https://sharpapi.com/sharpapi-github-php-bg.jpg "SharpAPI Node.js Client")

# SharpAPI Core Package for Node.js

## Foundation package for all SharpAPI Node.js SDKs

[![npm version](https://img.shields.io/npm/v/@sharpapi/sharpapi-node-core.svg)](https://www.npmjs.com/package/@sharpapi/sharpapi-node-core)
[![License](https://img.shields.io/npm/l/@sharpapi/sharpapi-node-core.svg)](https://github.com/sharpapi/sharpapi-node-core/blob/master/LICENSE.md)

**SharpAPI Node Core** is the foundational package that powers all SharpAPI Node.js SDK packages. It provides the base service class, HTTP client, job polling, rate limiting, error handling, and shared utilities used across all 30 specialized SharpAPI packages.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Architecture](#architecture)
4. [Core Components](#core-components)
5. [Rate Limiting & Throttling](#rate-limiting--throttling)
6. [Building Custom Services](#building-custom-services)
7. [API Documentation](#api-documentation)
8. [Testing](#testing)
9. [License](#license)

---

## Overview

The SharpAPI Core package provides:

- **Base Service Class**: `SharpApiCoreService` — foundation for all API services
- **HTTP Client**: Axios-based HTTP client with Bearer token authentication
- **Job Polling**: Automatic polling for asynchronous API endpoints with adaptive intervals
- **Rate Limiting**: Two-layer rate limiting — proactive sliding window throttling + reactive 429 retry logic
- **Rate Limit Header Tracking**: Automatic extraction of `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers
- **Error Handling**: `SharpApiError` with HTTP status codes for timeout and rate limit errors
- **Type Definitions**: Enums for job statuses, languages, and voice tones
- **DTO Classes**: Data Transfer Objects for API responses (`SharpApiJob`, `SharpApiSubscriptionInfo`)

---

## Installation

```bash
npm install @sharpapi/sharpapi-node-core
```

**Note:** This package is typically installed automatically as a dependency of specialized SharpAPI packages. You only need to install it directly if you're building custom services.

---

## Architecture

### Package Structure

```
sharpapi-node-core/
├── src/
│   ├── SharpApiCoreService.js         # Base service class
│   ├── SlidingWindowRateLimiter.js    # Proactive rate limiter
│   ├── Dto/
│   │   ├── SharpApiJob.js             # Job DTO
│   │   └── SharpApiSubscriptionInfo.js # Subscription DTO
│   ├── Enums/
│   │   ├── SharpApiJobStatusEnum.js   # Job statuses
│   │   ├── SharpApiLanguages.js       # Supported languages
│   │   └── SharpApiVoiceTone.js       # Voice tone options
│   ├── Exceptions/
│   │   └── SharpApiError.js           # Custom error class
│   └── index.js                       # Package exports
├── __tests__/
│   ├── SharpApiCoreService.test.js    # Core service tests
│   └── SlidingWindowRateLimiter.test.js
├── package.json
└── README.md
```

### Dependency Hierarchy

```
sharpapi-node-core (base package)
    ↓
All 30 specialized SharpAPI packages extend core:
    ├── sharpapi-node-translate
    ├── sharpapi-node-summarize-text
    ├── sharpapi-node-detect-emails
    ├── sharpapi-node-parse-resume
    ├── sharpapi-node-product-categories
    └── ... (25 more)
```

---

## Core Components

### SharpApiCoreService

The base class that all SharpAPI services extend.

**Constructor:**

```javascript
const { SharpApiCoreService } = require('@sharpapi/sharpapi-node-core');

const service = new SharpApiCoreService(
  apiKey,                                    // Required: your SharpAPI API key
  apiBaseUrl = 'https://sharpapi.com/api/v1', // Optional: API base URL
  userAgent = 'SharpAPINodeClient/1.3.0'      // Optional: custom User-Agent
);
```

**Properties (with defaults):**

| Property | Default | Description |
|---|---|---|
| `apiJobStatusPollingInterval` | `10` | Polling interval in seconds |
| `apiJobStatusPollingWait` | `180` | Maximum polling wait time in seconds |
| `rateLimitLimit` | `null` | Server-reported rate limit (from headers) |
| `rateLimitRemaining` | `null` | Server-reported remaining requests |
| `maxRetryOnRateLimit` | `3` | Max retries on 429 responses |
| `rateLimitLowThreshold` | `3` | Remaining count that triggers adaptive polling |
| `throttleRequests` | `true` | Enable proactive sliding window throttling |
| `requestsPerMinute` | `60` | Requests per minute for sliding window limiter |

### SlidingWindowRateLimiter

Standalone rate limiter that tracks request timestamps in a rolling window.

```javascript
const { SlidingWindowRateLimiter } = require('@sharpapi/sharpapi-node-core');

const limiter = new SlidingWindowRateLimiter(
  maxRequests = 60,  // Max requests in window
  windowSeconds = 60 // Window duration
);

limiter.canProceed();              // true/false — check without waiting
limiter.remaining();               // Number of slots left
await limiter.waitIfNeeded();      // Block until capacity, returns seconds waited
limiter.adaptFromServerLimit(120); // One-way ratchet up from server header
```

### SharpApiError

Custom error class for API and timeout errors.

```javascript
const { SharpApiError } = require('@sharpapi/sharpapi-node-core');

try {
  const job = await service.fetchResults(statusUrl);
} catch (error) {
  if (error instanceof SharpApiError) {
    console.error(error.message);    // "Job polling timed out after 180s"
    console.error(error.statusCode); // 408 (timeout) or 429 (rate limited)
  }
}
```

### Enums

#### SharpApiJobStatusEnum

```javascript
const { SharpApiJobStatusEnum } = require('@sharpapi/sharpapi-node-core');

SharpApiJobStatusEnum.NEW      // 'new'
SharpApiJobStatusEnum.PENDING  // 'pending'
SharpApiJobStatusEnum.SUCCESS  // 'success'
SharpApiJobStatusEnum.FAILED   // 'failed'
```

#### SharpApiLanguages

80+ supported languages:

```javascript
const { SharpApiLanguages } = require('@sharpapi/sharpapi-node-core');

SharpApiLanguages.ENGLISH
SharpApiLanguages.SPANISH
SharpApiLanguages.FRENCH
// ... and more
```

#### SharpApiVoiceTone

Voice tone options for content generation:

```javascript
const { SharpApiVoiceTone } = require('@sharpapi/sharpapi-node-core');

SharpApiVoiceTone.PROFESSIONAL
SharpApiVoiceTone.CASUAL
SharpApiVoiceTone.FORMAL
// ... and more
```

### DTO Classes

#### SharpApiJob

Represents a completed API job:

```javascript
const job = await service.fetchResults(statusUrl);

job.getId();          // Job UUID
job.getType();        // e.g. 'content_translate'
job.getStatus();      // 'success' or 'failed'
job.getResultJson();  // Prettified JSON string
job.getResultObject(); // Raw JavaScript object
```

#### SharpApiSubscriptionInfo

Subscription details returned by the `quota()` endpoint:

```javascript
const info = await service.quota();

info.timestamp                       // Date
info.on_trial                        // boolean
info.trial_ends                      // Date
info.subscribed                      // boolean
info.current_subscription_start      // Date
info.current_subscription_end        // Date
info.current_subscription_reset      // Date or null
info.subscription_words_quota        // number
info.subscription_words_used         // number
info.subscription_words_used_percentage // number
info.requests_per_minute             // number or null
```

---

## Rate Limiting & Throttling

The core service implements a two-layer rate limiting architecture mirroring the PHP SDK v1.3.0:

### Layer 1: Proactive Throttling (Sliding Window)

Before every request, the service checks a local sliding window rate limiter. If the window is full, it waits until capacity is available. This prevents hitting 429 errors in the first place.

```javascript
const service = new SharpApiCoreService(apiKey);

// Configure throttling
service.setRequestsPerMinute(120);    // Match your plan's RPM
service.setThrottleRequests(true);    // Enabled by default

// The limiter auto-adapts from server headers:
// If X-RateLimit-Limit: 200, the limiter ratchets up to 200
```

### Layer 2: Reactive 429 Retry

If a 429 response is received despite throttling, the service retries with the `Retry-After` header value:

```javascript
service.setMaxRetryOnRateLimit(3); // Up to 3 retries (default)
```

### Adaptive Polling

When `rateLimitRemaining` drops below the threshold, polling intervals scale up automatically:

```
adjustedInterval = baseInterval * (2 + (threshold - remaining))
```

For example, with threshold=3 and remaining=1:
- Base interval 10s becomes `10 * (2 + 2) = 40s`

### Rate Limit State

You can inspect and persist rate limit state across requests:

```javascript
// Check current state
console.log(service.getRateLimitLimit());     // 100
console.log(service.getRateLimitRemaining()); // 97
console.log(service.canMakeRequest());        // true

// Persist state for external caching
const state = service.getRateLimitState();
// ... later ...
service.setRateLimitState(state);
```

### Throttle Bypass

`ping()` and `quota()` bypass throttling automatically since they are lightweight health/info endpoints. `quota()` also adapts `requestsPerMinute` from the server response when available.

---

## Building Custom Services

Extend `SharpApiCoreService` to create custom API integrations:

```javascript
const { SharpApiCoreService } = require('@sharpapi/sharpapi-node-core');

class MyCustomService extends SharpApiCoreService {
  constructor(apiKey, apiBaseUrl = 'https://sharpapi.com/api/v1') {
    super(apiKey, apiBaseUrl, 'MyCustomService/1.0.0');
  }

  async analyzeContent(text) {
    const data = { content: text };
    const response = await this.makeRequest('POST', '/content/summarize', data);
    return this.parseStatusUrl(response);
  }
}

// Usage
const service = new MyCustomService(process.env.SHARP_API_KEY);

const statusUrl = await service.analyzeContent('Your text here...');
const job = await service.fetchResults(statusUrl);
console.log(job.getResultJson());
```

All rate limiting, throttling, 429 retry, and header tracking are inherited automatically.

### Core Methods

#### `makeRequest(method, url, data?, filePath?)`

Make HTTP requests to the API. Routes through the rate limit retry wrapper.

- `method` (string): `'GET'` or `'POST'`
- `url` (string): API endpoint path (relative to `apiBaseUrl`)
- `data` (object, optional): Request body (POST) or query parameters (GET)
- `filePath` (string, optional): File path for multipart uploads

Returns: `Promise<AxiosResponse>`

#### `makeGetRequest(url, queryParams?)`

Convenience method for GET requests.

#### `fetchResults(statusUrl)`

Poll an async job until completion with adaptive intervals and 429 handling.

- `statusUrl` (string): Job status URL from `parseStatusUrl()`

Returns: `Promise<SharpApiJob>`
Throws: `SharpApiError` on timeout (408) or rate limit exhaustion (429)

#### `parseStatusUrl(response)`

Extract status URL from API response.

- `response` (AxiosResponse): Response from `makeRequest()`

Returns: `string`

#### `ping()`

Check API availability. Bypasses throttling.

Returns: `Promise<object>` — `{ ping: 'pong', timestamp: '...' }`

#### `quota()`

Get subscription details. Bypasses throttling. Adapts `requestsPerMinute` from server.

Returns: `Promise<SharpApiSubscriptionInfo|null>`

---

## API Documentation

### HTTP Client Configuration

The core service uses Axios with the following defaults:

- **Base URL**: `https://sharpapi.com/api/v1`
- **User-Agent**: `SharpAPINodeClient/1.3.0`
- **Headers**:
  - `Authorization`: `Bearer {apiKey}`
  - `Accept`: `application/json`

### Error Handling

```javascript
const { SharpApiError } = require('@sharpapi/sharpapi-node-core');

try {
  const job = await service.fetchResults(statusUrl);
} catch (error) {
  if (error instanceof SharpApiError) {
    // Timeout or rate limit error from core
    console.error(error.message);    // Descriptive message
    console.error(error.statusCode); // 408 or 429
  } else if (error.response) {
    // Other HTTP error from axios
    console.error('Status:', error.response.status);
  } else {
    // Network or other error
    console.error('Error:', error.message);
  }
}
```

---

## Testing

```bash
# Run all tests
npm test

# Tests cover:
# - SlidingWindowRateLimiter (8 tests)
# - SharpApiCoreService (34 tests)
#   - Constructor & backward compatibility
#   - Rate limit header extraction
#   - Adaptive polling intervals
#   - 429 retry logic
#   - fetchResults polling, timeout, and radix fix
#   - ping/quota throttle bypass
#   - Getter/setter round-trips
#   - State serialization
```

---

## Related Packages

All 30 specialized SharpAPI Node.js packages depend on this core package:

- [@sharpapi/sharpapi-node-translate](https://www.npmjs.com/package/@sharpapi/sharpapi-node-translate)
- [@sharpapi/sharpapi-node-summarize-text](https://www.npmjs.com/package/@sharpapi/sharpapi-node-summarize-text)
- [@sharpapi/sharpapi-node-detect-emails](https://www.npmjs.com/package/@sharpapi/sharpapi-node-detect-emails)
- [@sharpapi/sharpapi-node-parse-resume](https://www.npmjs.com/package/@sharpapi/sharpapi-node-parse-resume)
- [@sharpapi/sharpapi-node-product-categories](https://www.npmjs.com/package/@sharpapi/sharpapi-node-product-categories)
- [... and 25 more specialized packages](https://www.npmjs.com/search?q=%40sharpapi)

---

## License

This project is licensed under the MIT License. See the [LICENSE.md](LICENSE.md) file for details.

---

## Support

- **Documentation**: [SharpAPI.com Documentation](https://sharpapi.com/documentation)
- **Issues**: [GitHub Issues](https://github.com/sharpapi/sharpapi-node-core/issues)
- **Email**: contact@sharpapi.com

---

**Powered by [SharpAPI](https://sharpapi.com/) - AI-Powered API Workflow Automation**
