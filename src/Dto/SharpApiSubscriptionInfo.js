/**
 * SharpApiSubscriptionInfo DTO
 */
class SharpApiSubscriptionInfo {
  constructor({
    timestamp,
    on_trial,
    trial_ends,
    subscribed,
    current_subscription_start,
    current_subscription_end,
    current_subscription_reset = null,
    subscription_words_quota,
    subscription_words_used,
    subscription_words_used_percentage,
    requests_per_minute = null,
  }) {
    this.timestamp = new Date(timestamp);
    this.on_trial = on_trial;
    this.trial_ends = new Date(trial_ends);
    this.subscribed = subscribed;
    this.current_subscription_start = new Date(current_subscription_start);
    this.current_subscription_end = new Date(current_subscription_end);
    this.current_subscription_reset = current_subscription_reset ? new Date(current_subscription_reset) : null;
    this.subscription_words_quota = subscription_words_quota;
    this.subscription_words_used = subscription_words_used;
    this.subscription_words_used_percentage = subscription_words_used_percentage;
    this.requests_per_minute = requests_per_minute;
  }

  toJSON() {
    return {
      timestamp: this.timestamp,
      on_trial: this.on_trial,
      trial_ends: this.trial_ends,
      subscribed: this.subscribed,
      current_subscription_start: this.current_subscription_start,
      current_subscription_end: this.current_subscription_end,
      current_subscription_reset: this.current_subscription_reset,
      subscription_words_quota: this.subscription_words_quota,
      subscription_words_used: this.subscription_words_used,
      subscription_words_used_percentage: this.subscription_words_used_percentage,
      requests_per_minute: this.requests_per_minute,
    };
  }
}

module.exports = { SharpApiSubscriptionInfo };
