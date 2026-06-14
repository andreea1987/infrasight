# OpenClaw AI Providers

OpenClaw can use a workspace-scoped AI provider while remaining read-only.
Providers receive only the InfraSight tool context for the selected workspace.
They cannot run discovery, resolve alerts, change automation, or modify infrastructure.

## Provider Types

- Built-in OpenClaw: no provider setup required. Uses the backend default model when configured, otherwise uses deterministic structured analysis.
- OpenAI-compatible API: configure a `/v1` compatible base URL, API key, and model name.
- Azure OpenAI: configure the Azure resource base URL, API key, and deployment name as the model.
- Anthropic Claude: configure an API key and Claude model name. The backend uses the Anthropic Messages API.
- Ollama/local model: configure the Ollama base URL reachable from the backend and a local model name.
- Custom HTTP endpoint: configure an endpoint that accepts `{ model, system, prompt }` JSON and returns `answer`, `text`, or `response`.

## Secrets

API keys and provider secrets are stored only on the backend and returned to the UI as masked indicators.
Entering a new value replaces the saved secret. Leaving the secret field blank keeps the existing value.

## Fallback

If the active provider is unavailable, failed, disabled, or missing required configuration, OpenClaw falls back to the built-in structured analyst response.
The fallback still uses only selected workspace data and remains read-only.

## Historical Incident Context

Closed incidents with saved root cause and resolution data remain available to OpenClaw through InfraSight's incident knowledge and resolution library records.
Providers can use that historical context to reference previous incidents, but they still cannot close, reopen, acknowledge, or modify alerts.

## Testing

The Test Connection action validates required fields and performs a lightweight provider reachability check where a base URL is configured.
It does not send workspace telemetry to the provider.
