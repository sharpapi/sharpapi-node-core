const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { URL } = require('url');

const { SharpApiJob } = require('./Dto/SharpApiJob');
const { SharpApiSubscriptionInfo } = require('./Dto/SharpApiSubscriptionInfo');
const { SharpApiJobStatusEnum } = require('./Enums/SharpApiJobStatusEnum');

/**
 * Core Service for SharpAPI.com with shared functionality
 */
class SharpApiCoreService {
  /**
   * Initializes a new instance of the class.
   *
   * @param {string} apiKey - Your SharpAPI API key.
   * @param {string} [apiBaseUrl] - The base URL for the API.
   * @param {string} [userAgent] - Custom User-Agent string.
   */
  constructor(apiKey, apiBaseUrl = 'https://sharpapi.com/api/v1', userAgent = 'SharpAPINodeClient/1.2.0') {
    if (!apiKey) {
      throw new Error('API key is required.');
    }
    this.apiKey = apiKey;
    this.apiBaseUrl = apiBaseUrl;
    this.userAgent = userAgent;

    this.apiJobStatusPollingInterval = 10; // seconds
    this.useCustomInterval = false;
    this.apiJobStatusPollingWait = 180; // seconds
  }

  // Headers for API requests
  getHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': this.userAgent,
    };
  }

  /**
   * Generic request method to run axios client
   *
   * @param {string} method - HTTP method.
   * @param {string} url - API endpoint.
   * @param {object} data - Data to send.
   * @param {string} [filePath] - File path for file uploads.
   * @returns {Promise<object>} - Response data.
   */
  async makeRequest(method, url, data = {}, filePath = null) {
    const fullUrl = `${this.apiBaseUrl}${url}`;
    const headers = this.getHeaders();

    if (method === 'POST') {
      if (filePath) {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        Object.keys(data).forEach((key) => {
          formData.append(key, data[key]);
        });
        return axios.post(fullUrl, formData, {
          headers: {
            ...headers,
            ...formData.getHeaders(),
          },
        });
      } else {
        return axios.post(fullUrl, data, { headers });
      }
    } else {
      return axios.get(fullUrl, { headers, params: data });
    }
  }

  parseStatusUrl(response) {
    return response.data.status_url;
  }

  /**
   * Generic method to check job status in polling mode and then fetch results of the dispatched job
   *
   * @param {string} statusUrl - The URL to check job status.
   * @returns {Promise<SharpApiJob>} - The job result.
   */
  async fetchResults(statusUrl) {
    let waitingTime = 0;
    let response;

    while (true) {
      response = await axios.get(statusUrl, { headers: this.getHeaders() });
      const jobStatus = response.data.data.attributes;

      if (
        jobStatus.status === SharpApiJobStatusEnum.SUCCESS ||
        jobStatus.status === SharpApiJobStatusEnum.FAILED
      ) {
        break;
      }

      let retryAfter = parseInt(response.headers['retry-after'], 5) || this.apiJobStatusPollingInterval;

      if (this.useCustomInterval) {
        retryAfter = this.apiJobStatusPollingInterval;
      }

      waitingTime += retryAfter;

      if (waitingTime >= this.apiJobStatusPollingWait) {
        break;
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

  /**
   * Simple PING endpoint to check the availability of the API and its internal time zone (timestamp).
   *
   * @returns {Promise<object>} - Ping response.
   */
  async ping() {
    const response = await this.makeRequest('GET', '/ping');
    return response.data;
  }

  /**
   * Endpoint to check details regarding the subscription's current period.
   *
   * @returns {Promise<SharpApiSubscriptionInfo|null>} - Subscription info.
   */
  async quota() {
    const response = await this.makeRequest('GET', '/quota');
    const info = response.data;

    if (!info.timestamp) {
      return null;
    }

    return new SharpApiSubscriptionInfo(info);
  }
}

module.exports = { SharpApiCoreService };