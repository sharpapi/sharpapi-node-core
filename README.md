![SharpAPI GitHub cover](https://sharpapi.com/sharpapi-github-php-bg.jpg "SharpAPI Node.js Client")

# SharpAPI Core Package for Node.js

## 🔧 Foundation package for all SharpAPI Node.js SDKs — powered by SharpAPI.

[![npm version](https://img.shields.io/npm/v/@sharpapi/sharpapi-node-core.svg)](https://www.npmjs.com/package/@sharpapi/sharpapi-node-core)
[![License](https://img.shields.io/npm/l/@sharpapi/sharpapi-node-core.svg)](https://github.com/sharpapi/sharpapi-node-client/blob/master/LICENSE.md)

**SharpAPI Node Core** is the foundational package that powers all SharpAPI Node.js SDK packages. It provides the base service class, HTTP client functionality, polling mechanisms, error handling, and shared utilities used across all SharpAPI packages.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Architecture](#architecture)
4. [Core Components](#core-components)
5. [Building Custom Services](#building-custom-services)
6. [API Documentation](#api-documentation)
7. [License](#license)

---

## Overview

The SharpAPI Core package provides:

- **Base Service Class**: `SharpApiCoreService` - Foundation for all API services
- **HTTP Client**: Axios-based HTTP client with retry logic
- **Job Polling**: Automatic polling for asynchronous API endpoints
- **Error Handling**: Standardized error handling across all packages
- **Type Definitions**: Enums for job types, statuses, languages, and voice tones
- **DTO Classes**: Data Transfer Objects for API responses

---

## Installation

```bash
npm install @sharpapi/sharpapi-node-core
```

**Note:** This package is typically installed automatically as a dependency of other SharpAPI packages. You only need to install it directly if you're building custom services.

---

## Architecture

### Package Structure

```
sharpapi-node-core/
├── src/
│   ├── SharpApiCoreService.js    # Base service class
│   ├── Dto/
│   │   ├── SharpApiJob.js         # Job DTO
│   │   └── SharpApiSubscriptionInfo.js
│   ├── Enums/
│   │   ├── SharpApiJobTypeEnum.js      # API endpoint types
│   │   ├── SharpApiJobStatusEnum.js    # Job statuses
│   │   ├── SharpApiLanguages.js        # Supported languages
│   │   └── SharpApiVoiceTone.js        # Voice tone options
│   └── index.js                   # Package exports
├── package.json
└── README.md
```

### Dependency Hierarchy

```
sharpapi-node-core (base package)
    ↓
[All other SharpAPI packages extend core]
    ↓
sharpapi-node-product-categories
sharpapi-node-travel-review-sentiment
sharpapi-node-parse-resume
... (27 total packages)
```

---

## Core Components

### SharpApiCoreService

The base class that all SharpAPI services extend.

**Key Features:**
- HTTP request handling with authentication
- Automatic retry logic with exponential backoff
- Job status polling for async endpoints
- Error handling and normalization
- Rate limit handling

**Constructor:**
```javascript
constructor(apiKey, config = {})
```

**Parameters:**
- `apiKey` (string): Your SharpAPI API key
- `config` (object, optional):
  - `baseURL` (string): API base URL (default: 'https://sharpapi.com/api/v1')
  - `timeout` (number): Request timeout in ms (default: 30000)
  - `maxRetries` (number): Max retry attempts (default: 3)
  - `retryDelay` (number): Initial retry delay in ms (default: 1000)

### Enums

#### SharpApiJobTypeEnum

Defines all available API endpoints and their types:

```javascript
const { SharpApiJobTypeEnum } = require('@sharpapi/sharpapi-node-core');

SharpApiJobTypeEnum.ECOMMERCE_PRODUCT_CATEGORIES
SharpApiJobTypeEnum.HR_PARSE_RESUME
SharpApiJobTypeEnum.CONTENT_SUMMARIZE
// ... and more
```

#### SharpApiJobStatusEnum

Job status enumeration:

```javascript
const { SharpApiJobStatusEnum } = require('@sharpapi/sharpapi-node-core');

SharpApiJobStatusEnum.PENDING   // Job is queued
SharpApiJobStatusEnum.SUCCESS   // Job completed successfully
SharpApiJobStatusEnum.FAILED    // Job failed
```

#### SharpApiLanguages

Supported languages (80+ languages):

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

Represents an API job with status and results:

```javascript
const { SharpApiJob } = require('@sharpapi/sharpapi-node-core');

const job = new SharpApiJob(responseData);
console.log(job.getStatus());      // 'success'
console.log(job.getType());        // 'content_paraphrase'
console.log(job.getResultJson());  // Parsed result object
```

#### SharpApiSubscriptionInfo

Represents user subscription details:

```javascript
const { SharpApiSubscriptionInfo } = require('@sharpapi/sharpapi-node-core');

const subscription = new SharpApiSubscriptionInfo(data);
console.log(subscription.getWordsQuota());
console.log(subscription.getWordsUsed());
```

---

## Building Custom Services

You can extend `SharpApiCoreService` to create custom API integrations:

```javascript
const { SharpApiCoreService, SharpApiJobTypeEnum } = require('@sharpapi/sharpapi-node-core');

class MyCustomService extends SharpApiCoreService {
  /**
   * Example method for async endpoint
   */
  async processContent(content) {
    const data = { content };
    const response = await this.makeRequest(
      'POST',
      SharpApiJobTypeEnum.CONTENT_SUMMARIZE.url,
      data
    );
    return this.parseStatusUrl(response);
  }

  /**
   * Example method for sync endpoint
   */
  async getData() {
    const response = await this.makeRequest('GET', '/utilities/my_endpoint');
    return response.data;
  }

  /**
   * Fetch results from async job
   */
  async getResults(statusUrl) {
    const result = await this.fetchResults(statusUrl);
    return result.getResultJson();
  }
}

// Usage
const service = new MyCustomService(process.env.SHARP_API_KEY);

// Async endpoint
const statusUrl = await service.processContent('Some text...');
const result = await service.getResults(statusUrl);

// Sync endpoint
const data = await service.getData();
```

### Core Methods

#### `makeRequest(method, endpoint, data?, config?)`

Make HTTP requests to the API.

**Parameters:**
- `method` (string): HTTP method ('GET', 'POST', etc.)
- `endpoint` (string): API endpoint path
- `data` (object, optional): Request body or query parameters
- `config` (object, optional): Axios request config

**Returns:**
- Promise<AxiosResponse>

#### `fetchResults(statusUrl, maxWaitTime?)`

Poll an async job until completion.

**Parameters:**
- `statusUrl` (string): Job status URL
- `maxWaitTime` (number, optional): Max polling time in ms (default: 300000)

**Returns:**
- Promise<SharpApiJob>

#### `parseStatusUrl(response)`

Extract status URL from API response.

**Parameters:**
- `response` (AxiosResponse): API response

**Returns:**
- string: Status URL

---

## API Documentation

### HTTP Client Configuration

The core service uses Axios with the following defaults:

- **Base URL**: `https://sharpapi.com/api/v1`
- **Timeout**: 30 seconds
- **Headers**:
  - `Authorization`: `Bearer {apiKey}`
  - `Accept`: `application/json`
  - `Content-Type`: `application/json`

### Error Handling

The core service handles various error types:

```javascript
try {
  const result = await service.makeRequest('POST', '/endpoint', data);
} catch (error) {
  if (error.response) {
    // API error response
    console.error('Status:', error.response.status);
    console.error('Message:', error.response.data.message);
  } else if (error.request) {
    // Network error
    console.error('Network error:', error.message);
  } else {
    // Other errors
    console.error('Error:', error.message);
  }
}
```

### Rate Limiting

The API implements rate limiting:

- **Rate Limit Headers**:
  - `X-RateLimit-Limit`: Total requests allowed per minute
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp

The core service automatically handles 429 responses with exponential backoff.

---

## Example: Complete Custom Integration

```javascript
const { SharpApiCoreService, SharpApiJobTypeEnum } = require('@sharpapi/sharpapi-node-core');

class ContentAnalysisService extends SharpApiCoreService {
  async analyzeText(text, language = 'English') {
    // Submit analysis job
    const data = { content: text, language };
    const response = await this.makeRequest(
      'POST',
      SharpApiJobTypeEnum.CONTENT_SUMMARIZE.url,
      data
    );

    // Get status URL
    const statusUrl = this.parseStatusUrl(response);

    // Poll for results
    const job = await this.fetchResults(statusUrl);

    // Return parsed results
    return job.getResultJson();
  }

  async getSubscriptionInfo() {
    const response = await this.makeRequest('GET', '/subscription');
    return response.data;
  }
}

// Usage
const service = new ContentAnalysisService(process.env.SHARP_API_KEY, {
  timeout: 60000,
  maxRetries: 5
});

async function main() {
  try {
    const analysis = await service.analyzeText('Your text here...');
    console.log('Analysis:', analysis);

    const subscription = await service.getSubscriptionInfo();
    console.log('Quota:', subscription);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

---

## Use Cases

- **SDK Development**: Build custom SharpAPI integrations
- **Internal Tools**: Create organization-specific wrappers
- **Testing**: Test custom API endpoints
- **Prototyping**: Rapid API client development
- **Middleware**: Build API proxy services

---

## Related Packages

All SharpAPI Node.js packages depend on this core package:

- [@sharpapi/sharpapi-node-client](https://www.npmjs.com/package/@sharpapi/sharpapi-node-client) - Full SDK
- [@sharpapi/sharpapi-node-product-categories](https://www.npmjs.com/package/@sharpapi/sharpapi-node-product-categories)
- [@sharpapi/sharpapi-node-parse-resume](https://www.npmjs.com/package/@sharpapi/sharpapi-node-parse-resume)
- [... and 24 more specialized packages]

---

## License

This project is licensed under the MIT License. See the [LICENSE.md](LICENSE.md) file for details.

---

## Support

- **Documentation**: [SharpAPI.com Documentation](https://sharpapi.com/documentation)
- **Issues**: [GitHub Issues](https://github.com/sharpapi/sharpapi-node-client/issues)
- **Email**: contact@sharpapi.com

---

**Powered by [SharpAPI](https://sharpapi.com/) - AI-Powered API Workflow Automation**
