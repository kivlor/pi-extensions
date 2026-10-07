# @kivlor/pi-multiplexer

Virtual models for the Pi coding agent that automatically rotate through
provider variants when one starts failing.

## Install

```bash
pi install npm:@kivlor/pi-multiplexer
```

`--local`/`-l` writes the declaration to the project's `.pi/settings.json`
instead of the personal one. Manage installed extensions with `pi config`.

## What it does

Registers virtual models like `multiplexer/glm-5.3` that route requests to
a list of provider variants you define. After 3 consecutive errors from a
variant, it switches to the next one. For non-retryable errors (quota/billing
exhaustion), it switches immediately. Keeps trying until success or all
variants are exhausted.

Useful when you have multiple providers offering the same model (e.g., a
subscription with rate limits + a pay-per-use fallback) and want automatic
failover.

## Configuration

Create `~/.pi/multiplexer.json`:

```json
{
  "models": {
    "glm-5.3": ["opencode-go/glm-5.3", "openrouter/glm-5.3"],
    "claude-sonnet": ["opencode-go/claude-sonnet-4-5", "openrouter/anthropic/claude-sonnet-4"]
  }
}
```

Each entry registers a virtual model under the `multiplexer` provider. The
array lists variants to try in order: `[primary, fallback, ...]`.

Variants use the format `provider/model-id` or `provider/namespace/model-id`.

## Usage

Select a multiplexer model:

```bash
pi --model multiplexer/glm-5.3
```

The virtual model will appear in `/model` and `--list-models` like any other.

## Behavior

### Rate limit errors (429)
- Switch immediately to next variant
- Rate limits are transient, but better to try another variant than wait
- Patterns detected: `429`, `rate limit`, `too many requests`, `ratelimit`, `request limit exceeded`

### Non-retryable errors (quota/billing)
- Switch immediately to next variant
- These are permanent until fixed, so the multiplexer skips the blocked variant
- Patterns detected: `GoUsageLimitError`, `FreeUsageLimitError`, `insufficient_quota`, `out of budget`, `quota exceeded`, `billing`, `Monthly usage limit reached`, `available balance`

### Retryable errors (other transient)
- Starts at the first variant in the list
- On retry, increments the error counter for that variant
- After 3 consecutive errors, switches to the next variant
- Resets the error counter on switch
- Examples: 500s, timeouts, network errors

### Exhaustion
- Exits with error when all variants exhausted
- State persists across retries, so subsequent requests start from the working variant
