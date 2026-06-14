"""
OpenClaw Service
================
Orchestrates the full OpenClaw request lifecycle:

  1. Receive a chat message + conversation history.
  2. Record an audit event for the incoming request.
  3. Call _select_tool_calls() to choose which backend tools are relevant.
  4. Execute each tool via execute_openclaw_tool() and stream progress events.
  5. Pass all tool results as context to the LLM (OpenAI) or fall back to
     a structured plain-text answer if no API key is configured.
  6. Stream the LLM answer back token-by-token over the WebSocket.
  7. Record a final audit event with the complete answer.

The service never accesses cloud provider APIs directly — it only reads data
that InfraSight has already collected and stored in the local database.
"""

import asyncio
import json
import re
import uuid
from urllib import request

from backend.config.settings import (
    OPENAI_API_KEY,
    OPENCLAW_MODE,
    OPENCLAW_MODEL,
    OPENCLAW_PERMISSIONS,
    OPENCLAW_REQUEST_TIMEOUT_SECONDS,
)
from backend.services.ai_provider_service import get_active_ai_provider, provider_secret
from backend.services.openclaw_audit import record_openclaw_audit_event
from backend.services.openclaw_tools import execute_openclaw_tool

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


# System prompt injected at the start of every LLM conversation.
# Permissions listed here inform the model which actions it may offer.
SYSTEM_PROMPT = """
You are OpenClaw, InfraSight's infrastructure operations assistant.
You act as an infrastructure analyst for metrics, alerts, and historical incidents.
You never receive or request direct AWS, Azure, Kubernetes, or host credentials.
Use only InfraSight backend tool outputs and clearly say when data is unavailable.
Enabled permissions: {permissions}.
You may analyze alerts, explain unhealthy resources, suggest possible causes,
recommend next investigation steps, and reference similar previous incidents
when tool data provides them.

Rules and response format:
- Stay read-only: provide recommendations only; do not attempt any write actions.
- Do not claim to restart, update, delete, scale, resolve, acknowledge, or mutate
  any resource or alert.
- Never invent causes, data, or resolutions. If evidence is missing, explicitly say
  so and list what should be checked next.
- If no historical match exists, clearly state this appears to be a new issue.
- Ask concise follow-up questions when the user's request lacks necessary details.
- For greetings or simple conversational messages, reply naturally and briefly.
- When answering technical questions, always structure the response with these
  sections (include headings exactly as shown):

  Summary
  Evidence
  Similar Incidents
  Suggested Checks
  Confidence

- Use InfraSight backend tool outputs as evidence. When a tool provides
  historical incidents or prior resolutions, reference them under "Similar Incidents".
- If no similar incident exists, say this appears to be a new issue.
- Explain why a resource is unhealthy using active alerts, availability status,
  monitoring metrics, and critical events. Label possible causes as possible, not proven.
""".strip()


async def stream_openclaw_chat(
    db,
    *,
    message,
    conversation_id=None,
    history=None,
    actor="dashboard",
    tenant_id="internal",
    organization_id="internal",
):
    """
    Stream an OpenClaw response for one workspace-scoped chat turn.

    Inputs:
    - message/history from the UI
    - tenant_id / organization_id identifying the active workspace

    Outputs:
    - start, tool_call, tool_result, token and done events

    Important assumptions:
    - OpenClaw remains read-only.
    - Every backend tool receives the selected workspace ID and must not query
      or reason over data from another workspace.
    """
    conversation_id = conversation_id or str(uuid.uuid4())
    history = history or []

    record_openclaw_audit_event(
        db,
        event_type="chat_request",
        status="received",
        actor=actor,
        conversation_id=conversation_id,
        request_payload={"message": message, "history_length": len(history)},
        summary=message[:500],
        tenant_id=tenant_id,
        organization_id=organization_id,
    )

    yield {
        "type": "start",
        "conversation_id": conversation_id,
        "mode": OPENCLAW_MODE,
        "permissions": OPENCLAW_PERMISSIONS,
    }

    # Execute all selected tools and collect their results to pass as LLM context
    tool_results = []
    for tool_call in _select_tool_calls(message):
        yield {
            "type": "tool_call",
            "conversation_id": conversation_id,
            "tool": tool_call["name"],
            "arguments": tool_call["arguments"],
        }

        record_openclaw_audit_event(
            db,
            event_type="tool_call",
            status="started",
            actor=actor,
            conversation_id=conversation_id,
            tool_name=tool_call["name"],
            request_payload=tool_call["arguments"],
            tenant_id=tenant_id,
            organization_id=organization_id,
        )

        result = execute_openclaw_tool(
            db,
            tool_call["name"],
            tool_call["arguments"],
            actor=actor,
            tenant_id=tenant_id,
            organization_id=organization_id,
        )
        tool_results.append({"tool": tool_call["name"], "result": result})

        record_openclaw_audit_event(
            db,
            event_type="tool_result",
            status=result.get("status", "unknown"),
            actor=actor,
            conversation_id=conversation_id,
            tool_name=tool_call["name"],
            request_payload=tool_call["arguments"],
            response_payload=_trim_for_audit(result),
            tenant_id=tenant_id,
            organization_id=organization_id,
        )

        yield {
            "type": "tool_result",
            "conversation_id": conversation_id,
            "tool": tool_call["name"],
            "status": result.get("status", "unknown"),
        }

    # Compose the final answer through the selected workspace provider, or use
    # the built-in structured fallback if the provider is unavailable.
    provider = get_active_ai_provider(db, tenant_id=tenant_id)
    answer = await _compose_answer(message, history, tool_results, provider=provider, tenant_id=tenant_id)

    record_openclaw_audit_event(
        db,
        event_type="chat_response",
        status="completed",
        actor=actor,
        conversation_id=conversation_id,
        request_payload={"tools_used": [item["tool"] for item in tool_results]},
        response_payload={"answer": answer, "provider_type": getattr(provider, "provider_type", "builtin")},
        summary=answer[:500],
        tenant_id=tenant_id,
        organization_id=organization_id,
    )

    # Stream answer in small chunks to simulate token-level streaming
    for token in _chunk_text(answer):
        yield {
            "type": "token",
            "conversation_id": conversation_id,
            "delta": token,
        }
        await asyncio.sleep(0.015)

    yield {
        "type": "done",
        "conversation_id": conversation_id,
        "tools_used": [item["tool"] for item in tool_results],
    }


async def complete_openclaw_chat(
    db,
    *,
    message,
    conversation_id=None,
    history=None,
    actor="dashboard",
    tenant_id="internal",
    organization_id="internal",
):
    """
    Produce a non-streaming OpenClaw response for REST callers.

    This wrapper uses the same read-only tool selection, workspace scoping and
    audit logging path as the WebSocket streaming endpoint.
    """
    answer = ""
    tools_used = []
    current_conversation_id = conversation_id

    async for event in stream_openclaw_chat(
        db,
        message=message,
        conversation_id=conversation_id,
        history=history,
        actor=actor,
        tenant_id=tenant_id,
        organization_id=organization_id,
    ):
        current_conversation_id = event.get("conversation_id", current_conversation_id)
        if event["type"] == "token":
            answer += event["delta"]
        elif event["type"] == "done":
            tools_used = event["tools_used"]

    return {
        "conversation_id": current_conversation_id,
        "mode": OPENCLAW_MODE,
        "answer": answer,
        "tools_used": tools_used,
    }


def _select_tool_calls(message):
    """
    Keyword-based tool selector: scans the user message for infrastructure
    topics and maps each to the appropriate OpenClaw tool call.

    The selector runs before the LLM so that tool data is available as context
    when the model composes its answer.  If no keywords match, a default set of
    context-building tools (copilot context, metrics, alerts) is returned.
    """
    lowered = message.lower()
    calls = []

    if any(term in lowered for term in ["copilot", "cloud", "on-prem", "onprem", "hybrid", "environment"]):
        calls.append({"name": "cloud_onprem_copilot_context", "arguments": {}})

    if any(term in lowered for term in ["summary", "summarize", "summarise", "operational", "platform"]):
        calls.append({"name": "operational_summary", "arguments": {}})

    if any(term in lowered for term in ["discover", "discovery", "topology", "tags", "profiles"]):
        calls.append({"name": "discovery_summary", "arguments": {}})

    if any(term in lowered for term in ["ec2", "aws", "instance", "instances", "inventory"]):
        calls.append({"name": "ec2_inventory", "arguments": {}})

    if any(term in lowered for term in ["docker", "container", "containers"]):
        calls.append({"name": "docker_container_status", "arguments": {}})

    if any(term in lowered for term in ["metric", "metrics", "cpu", "memory", "disk", "health", "status", "unhealthy"]):
        calls.append({"name": "system_metrics", "arguments": {}})

    if any(
        term in lowered
        for term in [
            "why",
            "unhealthy",
            "health",
            "incident",
            "incidents",
            "cause",
            "causes",
            "investigate",
            "investigation",
            "confidence",
        ]
    ):
        calls.append(
            {
                "name": "infrastructure_health_analysis",
                "arguments": {"resource_query": _extract_resource_query(message)},
            }
        )

    if any(term in lowered for term in ["alert", "alerts", "incident", "critical", "warning"]):
        calls.append({"name": "alerts", "arguments": {"status": "open"}})

    if any(term in lowered for term in ["analyze", "analyse", "analysis", "alert analysis"]):
        calls.append({"name": "analyze_alerts", "arguments": {}})

    if any(term in lowered for term in ["explain", "incident", "incidents", "root cause", "why"]):
        calls.append({"name": "explain_incidents", "arguments": {}})

    if any(term in lowered for term in ["fix", "fixes", "suggest", "recommend", "remediation", "runbook"]):
        calls.append({"name": "suggest_fixes", "arguments": {}})

    if any(term in lowered for term in ["correlate", "correlation", "events", "related"]):
        calls.append({"name": "correlate_infrastructure_events", "arguments": {}})

    # Default context tools when no specific keyword is detected
    if not calls:
        calls.extend(
            [
                {"name": "cloud_onprem_copilot_context", "arguments": {}},
                {"name": "system_metrics", "arguments": {}},
                {"name": "alerts", "arguments": {"status": "open"}},
                {"name": "infrastructure_health_analysis", "arguments": {"resource_query": None}},
            ]
        )

    return _dedupe_tool_calls(calls)


async def _compose_answer(message, history, tool_results, provider=None, tenant_id="internal"):
    """
    Compose an answer with the active workspace AI provider.

    Inputs:
    - selected provider configuration for the current tenant
    - workspace-scoped OpenClaw tool outputs

    Output:
    - final read-only analyst answer

    Fallback:
    - Any provider error falls back to the built-in structured answer so
      OpenClaw remains usable without exposing extra workspace data.
    """
    provider_type = getattr(provider, "provider_type", "builtin")
    if provider_type == "builtin" and OPENAI_API_KEY and OpenAI:
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(_compose_with_openai, message, history, tool_results, tenant_id),
                timeout=OPENCLAW_REQUEST_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            return _compose_fallback_answer(
                message,
                tool_results,
                prefix=f"OpenClaw model response is unavailable ({exc}). I used backend tool data instead.",
            )

    if provider_type != "builtin":
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(_compose_with_provider, provider, message, history, tool_results, tenant_id),
                timeout=OPENCLAW_REQUEST_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            return _compose_fallback_answer(
                message,
                tool_results,
                prefix=f"Configured AI provider is unavailable ({exc}). I used the built-in OpenClaw fallback instead.",
            )

    return _compose_fallback_answer(message, tool_results)


def _compose_with_openai(message, history, tool_results, tenant_id="internal"):
    """
    Build a messages list from conversation history and tool context, then call
    the OpenAI Responses API.  History is capped at the last 8 turns to stay
    within the model's context window.
    """
    client = OpenAI(api_key=OPENAI_API_KEY)
    context = {
        "mode": OPENCLAW_MODE,
        "tenant_id": tenant_id,
        "permissions": OPENCLAW_PERMISSIONS,
        "tool_results": tool_results,
    }
    conversation = [
        {"role": item.role, "content": item.content}
        if hasattr(item, "role")
        else {"role": item.get("role", "user"), "content": item.get("content", "")}
        for item in history[-8:]
        if (hasattr(item, "content") or item.get("content"))
    ]

    response = client.responses.create(
        model=OPENCLAW_MODEL,
        instructions=SYSTEM_PROMPT.format(permissions=", ".join(OPENCLAW_PERMISSIONS)),
        input=[
            *conversation,
            {
                "role": "user",
                "content": (
                    f"{message}\n\nInfraSight backend tool context:\n"
                    f"{json.dumps(context, default=str)}"
                ),
            },
        ],
    )

    return response.output_text


def _compose_with_provider(provider, message, history, tool_results, tenant_id="internal"):
    """
    Dispatch one read-only OpenClaw prompt to a configured provider.

    Provider access is intentionally narrow:
    - only model/base URL/secret from the selected workspace provider are used
    - only workspace-scoped tool_results are included as evidence
    - no provider can execute tools or mutate InfraSight state
    """
    provider_type = provider.provider_type
    secret = provider_secret(provider)
    model = provider.model_name or OPENCLAW_MODEL
    base_url = (provider.base_url or "").rstrip("/")
    prompt = _provider_prompt(message, history, tool_results, tenant_id)

    if provider_type == "openai_compatible":
        if not OpenAI:
            raise RuntimeError("OpenAI SDK is not installed")
        client = OpenAI(api_key=secret, base_url=base_url)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT.format(permissions=", ".join(OPENCLAW_PERMISSIONS))},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content or ""

    if provider_type == "azure_openai":
        return _post_json(
            f"{base_url}/openai/deployments/{model}/chat/completions?api-version=2024-02-15-preview",
            {
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT.format(permissions=", ".join(OPENCLAW_PERMISSIONS))},
                    {"role": "user", "content": prompt},
                ],
            },
            {"api-key": secret or ""},
        )["choices"][0]["message"]["content"]

    if provider_type == "anthropic":
        result = _post_json(
            base_url or "https://api.anthropic.com/v1/messages",
            {
                "model": model,
                "max_tokens": 1200,
                "system": SYSTEM_PROMPT.format(permissions=", ".join(OPENCLAW_PERMISSIONS)),
                "messages": [{"role": "user", "content": prompt}],
            },
            {
                "x-api-key": secret or "",
                "anthropic-version": "2023-06-01",
            },
        )
        return "\n".join(part.get("text", "") for part in result.get("content", []) if part.get("type") == "text")

    if provider_type == "ollama":
        result = _post_json(
            f"{base_url}/api/generate",
            {
                "model": model,
                "prompt": f"{SYSTEM_PROMPT.format(permissions=', '.join(OPENCLAW_PERMISSIONS))}\n\n{prompt}",
                "stream": False,
            },
            {},
        )
        return result.get("response", "")

    if provider_type == "custom_http":
        result = _post_json(
            base_url,
            {
                "model": model,
                "system": SYSTEM_PROMPT.format(permissions=", ".join(OPENCLAW_PERMISSIONS)),
                "prompt": prompt,
            },
            {"authorization": f"Bearer {secret}"} if secret else {},
        )
        return result.get("answer") or result.get("text") or result.get("response") or json.dumps(result)

    raise RuntimeError(f"Unsupported provider type: {provider_type}")


def _provider_prompt(message, history, tool_results, tenant_id):
    conversation = [
        {"role": item.role, "content": item.content}
        if hasattr(item, "role")
        else {"role": item.get("role", "user"), "content": item.get("content", "")}
        for item in history[-8:]
        if (hasattr(item, "content") or item.get("content"))
    ]
    return (
        f"Workspace ID: {tenant_id}\n"
        "Use only the InfraSight workspace context below. Do not ask for or use external credentials.\n\n"
        f"Conversation history:\n{json.dumps(conversation, default=str)}\n\n"
        f"User question:\n{message}\n\n"
        f"InfraSight backend tool context:\n{json.dumps({'tenant_id': tenant_id, 'tool_results': tool_results}, default=str)}"
    )


def _post_json(url, payload, headers):
    encoded = json.dumps(payload).encode()
    req = request.Request(
        url,
        data=encoded,
        method="POST",
        headers={
            "content-type": "application/json",
            **headers,
        },
    )
    with request.urlopen(req, timeout=OPENCLAW_REQUEST_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode())


def _compose_fallback_answer(message, tool_results, prefix=None):
    """
    Structured plain-text answer used when OpenAI is unavailable.
    Produces the same read-only infrastructure analyst sections required of
    model responses. It does not invent causes, incidents, or resolutions.
    """
    lowered = (message or "").strip().lower()
    greetings = {"hi", "hello", "hey", "good morning", "good afternoon", "good evening"}
    if any(lowered == g or lowered.startswith(g + " ") for g in greetings):
        return "Hi — I'm OpenClaw. I can summarize metrics, alerts, and incidents for your infrastructure. What would you like me to look into?"

    summary_lines = []
    evidence_lines = []
    similar_incidents_lines = []
    suggested_checks = []
    confidence = None

    for item in tool_results:
        tool = item.get("tool")
        result = item.get("result", {}) or {}

        if tool == "infrastructure_health_analysis":
            analyses = result.get("analyses", [])
            if not analyses:
                evidence_lines.append("Infrastructure health analysis returned no resources to inspect (tool: infrastructure_health_analysis).")

            for analysis in analyses[:3]:
                resource = analysis.get("resource") or {}
                name = resource.get("name", "unknown resource")
                health_status = analysis.get("health_status", "Unknown")
                reasons = analysis.get("health_reasons", [])
                reason_text = "; ".join(reason.rstrip(".") for reason in reasons) if reasons else "no degradation reason was returned"
                summary_lines.append(
                    f"{name} is {health_status}: {reason_text}."
                )

                for reason in reasons:
                    evidence_lines.append(f"{name}: {reason}")

                active_alerts = analysis.get("active_alerts", [])
                for alert in active_alerts[:4]:
                    evidence_lines.append(
                        f"{name}: active {alert.get('severity', 'unknown')} alert '{alert.get('title', 'untitled')}' from {alert.get('source', 'unknown source')}."
                    )
                    if alert.get("metric_name"):
                        evidence_lines.append(
                            f"{name}: {alert.get('metric_name')}={alert.get('metric_value')} threshold={alert.get('threshold')}."
                        )

                latest_metrics = analysis.get("latest_metrics", {})
                for metric_name, metric in list(latest_metrics.items())[:5]:
                    evidence_lines.append(
                        f"{name}: latest metric {metric_name}={metric.get('value')} {metric.get('unit', '')}."
                    )

                causes = analysis.get("possible_causes", [])
                if causes:
                    evidence_lines.append(f"{name}: possible causes include {', '.join(causes)}")

                incidents = analysis.get("similar_incidents", [])
                if incidents:
                    for incident in incidents:
                        similar_incidents_lines.append(
                            f"{name}: '{incident.get('title', 'untitled')}' matched by {', '.join(incident.get('match_basis', []))}; resolved_at={incident.get('resolved_at')}."
                        )
                else:
                    similar_incidents_lines.append(f"{name}: no historical match found; this appears to be a new issue.")

                suggested_checks.extend(analysis.get("suggested_checks", []))
                current_confidence = analysis.get("confidence")
                if current_confidence and (
                    confidence is None or current_confidence.get("score", 0) > confidence.get("score", 0)
                ):
                    confidence = current_confidence

        elif tool == "ec2_inventory":
            evidence_lines.append(f"EC2 inventory: {result.get('count', 0)} instances synchronized (tool: ec2_inventory).")
        elif tool == "docker_container_status":
            evidence_lines.append(f"Docker containers: {result.get('count', 0)} returned (tool: docker_container_status). Status: {result.get('status', 'unknown')}")
            if result.get("message"):
                evidence_lines.append(f"docker_container_status message: {result.get('message')}")
        elif tool == "system_metrics":
            summary = result.get('summary', {})
            evidence_lines.append(
                f"System metrics summary: {summary.get('total_resources', 0)} resources; {summary.get('healthy_percentage', 0)}% healthy; {summary.get('open_alerts', 0)} open alerts (tool: system_metrics)."
            )
        elif tool == "alerts":
            evidence_lines.append(f"Alerts: {result.get('count', 0)} matching records (tool: alerts).")
            if result.get('items'):
                for alert in result.get("items", [])[:4]:
                    evidence_lines.append(
                        f"Alert '{alert.get('title', 'untitled')}' severity={alert.get('severity')} status={alert.get('status')} source={alert.get('source')}."
                    )
        elif tool == "analyze_alerts":
            evidence_lines.append(f"Alert analysis: {result.get('open_or_acknowledged_alerts', 0)} active alerts (tool: analyze_alerts).")
            if result.get('by_severity'):
                evidence_lines.append(f"Severity breakdown: {result.get('by_severity')} (tool: analyze_alerts).")
        elif tool == "explain_incidents":
            incidents = result.get('incidents', [])
            evidence_lines.append(f"Incident explanations reviewed: {len(incidents)} active incidents (tool: explain_incidents).")
            for incident in incidents[:3]:
                evidence_lines.append(
                    f"Incident '{incident.get('title', 'untitled')}' likely cause: {incident.get('likely_cause', 'not returned')}."
                )
        elif tool == "suggest_fixes":
            evidence_lines.append(f"Suggested fixes prepared: {result.get('count', 0)} (tool: suggest_fixes).")
            for suggestion in result.get("suggestions", [])[:3]:
                suggested_checks.extend(suggestion.get("recommended_steps", []))
        elif tool == "correlate_infrastructure_events":
            evidence_lines.append(f"Event correlations found: {result.get('correlation_count', 0)} (tool: correlate_infrastructure_events).")
            for correlation in result.get("correlations", [])[:3]:
                evidence_lines.append(correlation.get("correlation", "Correlation summary unavailable."))
        elif tool == "cloud_onprem_copilot_context":
            resources = result.get('resources', {})
            evidence_lines.append(f"Copilot context: {resources.get('total', 0)} resources across providers (tool: cloud_onprem_copilot_context).")
        elif tool == "operational_summary":
            resources = result.get('resources', {})
            alerts = result.get('alerts', {})
            evidence_lines.append(f"Operational summary: {resources.get('total', 0)} resources; {alerts.get('open', 0)} open alerts (tool: operational_summary).")
            if alerts.get('by_connector'):
                evidence_lines.append(f"Connector alert mix: {alerts.get('by_connector')} (tool: operational_summary).")
        elif tool == "discovery_summary":
            evidence_lines.append(f"Discovery: {len(result.get('supported_types', []))} supported types; {result.get('topology_relationships', 0)} topology relationships (tool: discovery_summary).")

    if not summary_lines:
        if evidence_lines:
            summary_lines.append("I reviewed InfraSight read-only telemetry for the requested infrastructure context.")
        else:
            summary_lines.append("No substantive backend evidence was available for the requested topic.")

    if not suggested_checks:
        suggested_checks = [
            "Confirm the affected resource identifier, hostname, or service name.",
            "Review active alerts, latest metrics, and recent infrastructure changes around the alert window.",
            "Keep remediation outside OpenClaw; use approved operator runbooks after confirming cause.",
        ]

    if confidence is None:
        if any("alert" in line.lower() for line in evidence_lines):
            confidence = {"level": "Medium", "score": 55, "basis": ["alert evidence is available"]}
        elif evidence_lines:
            confidence = {"level": "Low", "score": 35, "basis": ["only summary or inventory evidence is available"]}
        else:
            confidence = {"level": "Low", "score": 20, "basis": ["no backend evidence is available"]}

    lines = ["Summary"]
    lines.extend(f"- {line}" for line in summary_lines[:5])

    lines.append("Evidence")
    if evidence_lines:
        lines.extend(f"- {line}" for line in evidence_lines[:20])
    else:
        lines.append("- None from available backend tools.")

    lines.append("Similar Incidents")
    if similar_incidents_lines:
        lines.extend(f"- {line}" for line in similar_incidents_lines[:10])
    else:
        lines.append("- No historical match found in the available tool outputs; this appears to be a new issue.")

    lines.append("Suggested Checks")
    lines.extend(f"- {step}" for step in list(dict.fromkeys(suggested_checks))[:10])

    lines.append("Confidence")
    lines.append(
        f"- {confidence.get('level', 'Low')} ({confidence.get('score', 0)}%): {', '.join(confidence.get('basis', []))}."
    )
    lines.append("- OpenClaw is read-only and only recommends investigation steps from InfraSight data.")

    if prefix:
        return prefix + "\n\n" + "\n".join(lines)

    return "\n".join(lines)


def _dedupe_tool_calls(calls):
    """Keep the first call for each tool/argument pair so evidence is not repeated."""
    deduped = []
    seen = set()

    for call in calls:
        key = (call["name"], json.dumps(call.get("arguments", {}), sort_keys=True))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(call)

    return deduped


def _extract_resource_query(message):
    """
    Pull a likely resource identifier from common analyst questions.
    Returns None for broad questions so the analysis tool reviews the estate.
    """
    cleaned = (message or "").strip()
    quoted = re.search(r"['\"]([^'\"]+)['\"]", cleaned)
    if quoted:
        return quoted.group(1).strip()

    patterns = [
        r"why\s+is\s+([\w.@:/-]+)",
        r"resource\s+([\w.@:/-]+)",
        r"host\s+([\w.@:/-]+)",
        r"instance\s+([\w.@:/-]+)",
        r"service\s+([\w.@:/-]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, cleaned, flags=re.IGNORECASE)
        if match:
            candidate = match.group(1).strip(" ?.,")
            if candidate.lower() not in {"this", "the", "a", "an", "it"}:
                return candidate

    return None


def _extract_service_name(message):
    """Parse a service name from a restart/reboot request message."""
    words = message.replace(",", " ").split()
    for marker in ["restart", "reboot", "service"]:
        if marker in words:
            index = words.index(marker)
            if index + 1 < len(words):
                return words[index + 1]

    return ""


def _chunk_text(text, size=18):
    """Yield text in fixed-size chunks to simulate streaming token output."""
    for index in range(0, len(text), size):
        yield text[index : index + size]


def _trim_for_audit(payload):
    """
    Truncate large tool result payloads before writing to the audit log.
    Payloads under 5 000 characters are stored verbatim; larger ones store
    a truncation flag and a preview.
    """
    encoded = json.dumps(payload, default=str)
    if len(encoded) <= 5000:
        return payload

    return {
        "truncated": True,
        "preview": encoded[:5000],
    }
