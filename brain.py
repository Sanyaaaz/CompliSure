from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


def load_env(file_path: str = ".env") -> None:
    env_path = Path(file_path)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key or key in os.environ:
            continue

        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]

        os.environ[key] = value


load_env()


SANDBOX_BASE_URL = os.getenv("SANDBOX_BASE_URL", "https://api.sandbox.co.in").rstrip("/")
SANDBOX_API_KEY = os.getenv("SANDBOX_API_KEY", "")
SANDBOX_API_SECRET = os.getenv("SANDBOX_API_SECRET", "")
SANDBOX_API_VERSION = os.getenv("SANDBOX_API_VERSION", "1.0")
BRAIN_HOST = os.getenv("BRAIN_HOST", "127.0.0.1")
BRAIN_PORT = int(os.getenv("BRAIN_PORT", "8000"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")

AUTH_ENDPOINT = f"{SANDBOX_BASE_URL}/authenticate"
AADHAAR_OTP_ENDPOINT = f"{SANDBOX_BASE_URL}/kyc/aadhaar/okyc/otp"
AADHAAR_VERIFY_ENDPOINT = f"{SANDBOX_BASE_URL}/kyc/aadhaar/okyc/otp/verify"
GROQ_CHAT_COMPLETIONS_ENDPOINT = f"{GROQ_BASE_URL}/chat/completions"

app = FastAPI(title="CompliSure Brain")
auth_lock = asyncio.Lock()
cached_token: dict[str, Any] = {
    "access_token": "",
    "expires_at": 0.0,
}


class AadhaarOtpRequest(BaseModel):
    aadhaar: str = Field(min_length=12, max_length=12)
    consent: bool
    full_name: str = ""
    company_name: str = ""


class AadhaarVerifyRequest(BaseModel):
    aadhaar: str = Field(min_length=12, max_length=12)
    otp: str = Field(min_length=4, max_length=6)
    reference_id: str
    consent: bool = True
    full_name: str = ""
    company_name: str = ""


class BillScanRequest(BaseModel):
    file_name: str
    mime_type: str
    image_base64: str


class NoticeInterpretRequest(BaseModel):
    text: str = ""
    file_name: str = ""
    mime_type: str = ""
    file_base64: str = ""
    company_name: str = ""
    founder_name: str = ""


class NoticeChatRequest(BaseModel):
    question: str
    interpretation: dict[str, Any] = Field(default_factory=dict)
    history: list[dict[str, Any]] = Field(default_factory=list)
    source_text: str = ""
    company_name: str = ""
    founder_name: str = ""


class AssistantChatRequest(BaseModel):
    question: str
    company_name: str = ""
    founder_name: str = ""
    reminders: dict[str, Any] = Field(default_factory=dict)
    ca_rows: list[dict[str, Any]] = Field(default_factory=list)
    onboarding_profile: dict[str, Any] = Field(default_factory=dict)


class PolicyWatchRequest(BaseModel):
    company_name: str = ""
    founder_name: str = ""
    onboarding_profile: dict[str, Any] = Field(default_factory=dict)
    business_context: dict[str, Any] = Field(default_factory=dict)


DEFAULT_POLICY_FEEDS: list[dict[str, str]] = [
    {"name": "RBI — Press releases", "url": "https://www.rbi.org.in/pressreleases_rss.xml"},
]


def local_xml_tag(tag: str) -> str:
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def strip_html_tags(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", cleaned).strip()


def stable_policy_id(link: str, title: str) -> str:
    key = f"{link}|{title}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:18]


def parse_rss_items_from_root(root: ET.Element) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for elem in root.iter():
        if local_xml_tag(elem.tag) != "item":
            continue
        title = ""
        link = ""
        pub = ""
        desc = ""
        for child in elem:
            t = local_xml_tag(child.tag)
            if t == "title":
                title = "".join(child.itertext()).strip()
            elif t == "link":
                link = (child.text or "").strip()
                if not link:
                    link = (child.get("href") or "").strip()
            elif t == "pubDate":
                pub = (child.text or "").strip()
            elif t in {"description", "summary", "content:encoded"}:
                raw = "".join(child.itertext()).strip()
                if not desc:
                    desc = strip_html_tags(raw)[:500]
        if title or link:
            items.append({
                "title": title or "(no title)",
                "link": link,
                "published": pub,
                "summary": desc[:450],
            })
    return items


def parse_atom_entries_from_root(root: ET.Element) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for elem in root.iter():
        if local_xml_tag(elem.tag) != "entry":
            continue
        title = ""
        link = ""
        pub = ""
        summary = ""
        for child in elem:
            t = local_xml_tag(child.tag)
            if t == "title":
                title = "".join(child.itertext()).strip()
            elif t == "link":
                link = (child.get("href") or (child.text or "")).strip()
            elif t in {"published", "updated"}:
                val = (child.text or "").strip()
                if val:
                    pub = val
            elif t in {"summary", "content"}:
                raw = "".join(child.itertext()).strip()
                if not summary:
                    summary = strip_html_tags(raw)[:500]
        if title or link:
            items.append({
                "title": title or "(no title)",
                "link": link,
                "published": pub,
                "summary": summary[:450],
            })
    return items


def parse_feed_xml(xml_text: str) -> list[dict[str, str]]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    lt = local_xml_tag(root.tag)
    if lt == "feed":
        return parse_atom_entries_from_root(root)
    return parse_rss_items_from_root(root)


def merge_policy_feeds() -> list[dict[str, str]]:
    feeds: list[dict[str, str]] = [dict(x) for x in DEFAULT_POLICY_FEEDS]
    raw = os.getenv("POLICY_RSS_FEEDS", "").strip()
    if raw:
        try:
            extra = json.loads(raw)
            if isinstance(extra, list):
                for row in extra:
                    if isinstance(row, dict) and safe_string(row.get("url")):
                        feeds.append({
                            "name": safe_string(row.get("name")) or "Custom RSS",
                            "url": safe_string(row.get("url")),
                        })
        except json.JSONDecodeError:
            pass
    return feeds


async def collect_policy_candidates() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    merged = merge_policy_feeds()
    candidates: list[dict[str, Any]] = []
    feeds_status: list[dict[str, Any]] = []
    max_candidates = 40
    max_per_feed = 12
    headers = {
        "User-Agent": "CompliSurePolicyBot/1.0 (Indian compliance policy monitor)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        for feed in merged:
            name = feed["name"]
            url = feed["url"]
            try:
                response = await client.get(url, headers=headers, follow_redirects=True, timeout=22.0)
                response.raise_for_status()
                items = parse_feed_xml(response.text)[:max_per_feed]
                count = 0
                for it in items:
                    title = safe_string(it.get("title"))
                    link = safe_string(it.get("link"))
                    if not title and not link:
                        continue
                    cid = len(candidates)
                    candidates.append({
                        "candidate_id": cid,
                        "title": title or "(no title)",
                        "link": link,
                        "source": name,
                        "published": safe_string(it.get("published")),
                        "summary": safe_string(it.get("summary"))[:450],
                        "stable_id": stable_policy_id(link or title, title),
                    })
                    count += 1
                    if len(candidates) >= max_candidates:
                        break
                feeds_status.append({"name": name, "url": url, "ok": True, "items": count, "error": ""})
            except Exception as exc:
                feeds_status.append({
                    "name": name,
                    "url": url,
                    "ok": False,
                    "items": 0,
                    "error": str(exc)[:160],
                })
            if len(candidates) >= max_candidates:
                break
    return candidates, feeds_status


POLICY_USE_AGENTIC = os.getenv("POLICY_USE_AGENTIC", "true").strip().lower() in {"1", "true", "yes", "on"}
POLICY_AGENT_MAX_TURNS = min(16, max(4, int(os.getenv("POLICY_AGENT_MAX_TURNS", "12") or "12")))
POLICY_AGENT_MAX_FETCHES = min(8, max(1, int(os.getenv("POLICY_AGENT_MAX_FETCHES", "5") or "5")))

POLICY_AGENT_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_configured_rss_feeds",
            "description": "List RSS/Atom URLs configured for this deployment. Call first to choose which feeds to load.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_business_profile",
            "description": "Return the founder/company onboarding profile JSON for this scan (sector, state, GST, employees, etc.).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_rss_feed",
            "description": (
                "Download and parse one RSS/Atom feed URL. Only URLs returned by list_configured_rss_feeds are allowed. "
                "Returns items each with a candidate_id you must use in submit_policy_scan."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Exact feed URL from the configured list"},
                    "max_items": {"type": "integer", "description": "Max items to return (default 12, max 15)"},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "submit_policy_scan",
            "description": (
                "Finish the scan: pass up to 5 ranked alerts that reference candidate_id values from items you fetched. "
                "Call exactly once when ready."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reasoning_summary": {
                        "type": "string",
                        "description": "Briefly describe which feeds you opened and why these items matter for this business.",
                    },
                    "alerts": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "candidate_id": {"type": "integer"},
                                "relevance_score": {"type": "number"},
                                "risk_level": {"type": "string", "enum": ["low", "medium", "high"]},
                                "why_relevant": {"type": "string"},
                                "business_impact": {"type": "string"},
                                "suggested_actions": {"type": "array", "items": {"type": "string"}},
                                "departments": {"type": "array", "items": {"type": "string"}},
                            },
                            "required": ["candidate_id", "business_impact", "risk_level"],
                        },
                    },
                },
                "required": ["alerts", "reasoning_summary"],
            },
        },
    },
]


class PolicyAgentState:
    def __init__(
        self,
        company: str,
        founder: str,
        profile: dict[str, Any],
        situation: dict[str, Any],
        business_context: dict[str, Any],
    ) -> None:
        self.company = company
        self.founder = founder
        self.profile = profile
        self.situation = situation if isinstance(situation, dict) else {}
        self.business_context = business_context if isinstance(business_context, dict) else {}
        self.store: dict[int, dict[str, Any]] = {}
        self.next_id = 0
        self.fetch_count = 0
        self.feeds_status: list[dict[str, Any]] = []
        self.final_submission: dict[str, Any] | None = None
        self.trace: list[dict[str, Any]] = []
        self.allowed_feed_urls: set[str] = {safe_string(f.get("url")) for f in merge_policy_feeds() if safe_string(f.get("url"))}


async def groq_chat_request(request_body: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            GROQ_CHAT_COMPLETIONS_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {GROQ_API_KEY}",
            },
            json=request_body,
        )
    data = parse_provider_response(response)
    if response.status_code >= 400:
        raise HTTPException(status_code=min(response.status_code, 502), detail=extract_message(data, "Groq request failed."))
    return data


def groq_first_choice_message(data: dict[str, Any]) -> dict[str, Any]:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return {}
    first = choices[0]
    if not isinstance(first, dict):
        return {}
    msg = first.get("message")
    return msg if isinstance(msg, dict) else {}


async def execute_policy_agent_tool(
    state: PolicyAgentState,
    name: str,
    args: dict[str, Any],
    client: httpx.AsyncClient,
) -> str:
    if name == "list_configured_rss_feeds":
        feeds = merge_policy_feeds()
        return json.dumps({"feeds": feeds, "count": len(feeds)}, ensure_ascii=True)

    if name == "get_business_profile":
        return json.dumps({
            "company_name": state.company,
            "founder_name": state.founder,
            "onboarding_profile": state.profile,
            "situation_analysis": state.situation,
            "workspace_snapshot": state.business_context,
        }, ensure_ascii=True)

    if name == "fetch_rss_feed":
        if state.fetch_count >= POLICY_AGENT_MAX_FETCHES:
            return json.dumps({
                "ok": False,
                "error": "fetch_limit_reached",
                "max_fetches": POLICY_AGENT_MAX_FETCHES,
            }, ensure_ascii=True)

        url = safe_string(args.get("url")).strip()
        if not url.startswith("http"):
            return json.dumps({"ok": False, "error": "invalid_url"}, ensure_ascii=True)
        if url not in state.allowed_feed_urls:
            return json.dumps({
                "ok": False,
                "error": "url_not_allowlisted",
                "hint": "Use an exact url from list_configured_rss_feeds only.",
            }, ensure_ascii=True)

        max_items = int(safe_number(args.get("max_items")) or 12)
        max_items = min(max(1, max_items), 15)
        headers = {
            "User-Agent": "CompliSurePolicyAgent/1.0 (tool fetch)",
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        }
        feed_name = "RSS"
        for fd in merge_policy_feeds():
            if safe_string(fd.get("url")) == url:
                feed_name = safe_string(fd.get("name")) or feed_name
                break
        try:
            response = await client.get(url, headers=headers, follow_redirects=True, timeout=22.0)
            response.raise_for_status()
            parsed = parse_feed_xml(response.text)[:max_items]
        except Exception as exc:
            state.feeds_status.append({
                "name": feed_name,
                "url": url,
                "ok": False,
                "items": 0,
                "error": str(exc)[:160],
            })
            return json.dumps({"ok": False, "error": str(exc)[:200]}, ensure_ascii=True)

        state.fetch_count += 1
        items_out: list[dict[str, Any]] = []
        count = 0
        for it in parsed:
            title = safe_string(it.get("title"))
            link = safe_string(it.get("link"))
            if not title and not link:
                continue
            cid = state.next_id
            state.next_id += 1
            state.store[cid] = {
                "candidate_id": cid,
                "title": title or "(no title)",
                "link": link,
                "source": feed_name,
                "published": safe_string(it.get("published")),
                "summary": safe_string(it.get("summary"))[:450],
                "stable_id": stable_policy_id(link or title, title),
            }
            items_out.append({
                "candidate_id": cid,
                "title": state.store[cid]["title"],
                "link": state.store[cid]["link"],
                "published": state.store[cid]["published"],
                "summary": state.store[cid]["summary"][:320],
            })
            count += 1

        state.feeds_status.append({
            "name": feed_name,
            "url": url,
            "ok": True,
            "items": count,
            "error": "",
        })
        return json.dumps({
            "ok": True,
            "feed": feed_name,
            "items_returned": len(items_out),
            "items": items_out,
        }, ensure_ascii=True)

    if name == "submit_policy_scan":
        alerts = args.get("alerts")
        if not isinstance(alerts, list):
            return json.dumps({"ok": False, "error": "alerts_must_be_array"}, ensure_ascii=True)
        state.final_submission = {
            "alerts": alerts,
            "reasoning_summary": safe_string(args.get("reasoning_summary")),
        }
        return json.dumps({"ok": True, "status": "submitted", "candidates_in_store": len(state.store)}, ensure_ascii=True)

    return json.dumps({"ok": False, "error": "unknown_tool", "name": name}, ensure_ascii=True)


async def analyze_business_situation(
    company: str,
    founder: str,
    profile: dict[str, Any],
    business_context: dict[str, Any],
) -> dict[str, Any]:
    """LLM pass: interpret Qdrant-backed workspace snapshot + live CA summary for policy relevance."""
    ensure_groq_configured()
    if not business_context or not isinstance(business_context, dict):
        return {
            "situation_summary": "No workspace snapshot stored yet; rely on onboarding profile only.",
            "compliance_posture": "unknown",
            "risk_hotspots": [],
            "policy_interpretation_hints": [],
        }

    payload = {
        "company_name": company,
        "founder_name": founder,
        "onboarding_profile": profile,
        "workspace_snapshot": business_context,
    }
    response = await groq_json_completion([
        {
            "role": "system",
            "content": (
                "You are a senior Indian SME compliance analyst. Read the workspace snapshot (calendar load, "
                "compliance health, CA filing workload, prior policy scans). Infer the current operational and "
                "compliance posture. Return JSON only."
            ),
        },
        {
            "role": "user",
            "content": (
                "Analyze this workspace and how stressed or prepared the business likely is.\n"
                f"{json.dumps(payload, ensure_ascii=True)}\n\n"
                "Return JSON with keys: situation_summary (4-6 sentences), compliance_posture (one of: "
                "strong|fair|strained|critical|unknown), risk_hotspots (array of short strings), "
                "policy_interpretation_hints (array of short strings: what categories of new circulars or "
                "regulatory notices would matter most for this business right now)."
            ),
        },
    ], max_completion_tokens=1000)

    posture = safe_string(response.get("compliance_posture")).lower()
    if posture not in {"strong", "fair", "strained", "critical", "unknown"}:
        posture = "unknown"

    return {
        "situation_summary": safe_string(response.get("situation_summary")),
        "compliance_posture": posture,
        "risk_hotspots": normalize_string_list(response.get("risk_hotspots"))[:10],
        "policy_interpretation_hints": normalize_string_list(response.get("policy_interpretation_hints"))[:10],
    }


def situation_for_api(situation: dict[str, Any]) -> dict[str, Any]:
    return {
        "situationSummary": safe_string(situation.get("situation_summary")),
        "compliancePosture": safe_string(situation.get("compliance_posture")),
        "riskHotspots": normalize_string_list(situation.get("risk_hotspots"))[:10],
        "policyInterpretationHints": normalize_string_list(situation.get("policy_interpretation_hints"))[:10],
    }


def build_alerts_output_from_rows(
    by_id: dict[int, dict[str, Any]],
    raw_alerts: list[Any],
) -> list[dict[str, Any]]:
    alerts_out: list[dict[str, Any]] = []
    for row in raw_alerts:
        if not isinstance(row, dict):
            continue
        try:
            cid = int(row.get("candidate_id"))
        except (TypeError, ValueError):
            continue
        base = by_id.get(cid)
        if not base:
            continue
        score = safe_number(row.get("relevance_score"))
        if score <= 0:
            score = 0.65
        risk = safe_string(row.get("risk_level")).lower()
        if risk not in {"low", "medium", "high"}:
            risk = "medium"
        impact = safe_string(row.get("business_impact"))
        if not impact:
            impact = safe_string(row.get("why_relevant"))
        actions = normalize_string_list(row.get("suggested_actions"))[:6]
        alerts_out.append({
            "id": base["stable_id"],
            "title": base["title"],
            "url": base["link"],
            "source": base["source"],
            "published": base["published"],
            "summary": base["summary"][:320],
            "whyRelevant": safe_string(row.get("why_relevant")),
            "businessImpact": impact,
            "suggestedActions": actions,
            "riskLevel": risk,
            "relevanceScore": min(1.0, max(0.0, score)) if score else 0.5,
            "departments": normalize_string_list(row.get("departments"))[:8],
        })

    alerts_out.sort(key=lambda a: (-a.get("relevanceScore", 0), a.get("riskLevel", "")))
    return alerts_out[:5]


async def run_policy_watch_agentic_scan(
    company: str,
    founder: str,
    profile: dict[str, Any],
    situation: dict[str, Any],
    business_context: dict[str, Any],
) -> tuple[list[dict[str, Any]] | None, list[dict[str, Any]], list[dict[str, Any]], str]:
    """Returns (alerts or None, feeds_status, trace, mode)."""
    state = PolicyAgentState(company, founder, profile, situation, business_context)
    context = {
        "company_name": company,
        "founder_name": founder,
        "onboarding_profile": profile,
        "situation_analysis": situation,
        "workspace_snapshot": business_context,
    }
    system = (
        "You are CompliSure's autonomous policy-radar agent for Indian SMEs. "
        "You MUST use tools: call list_configured_rss_feeds, then fetch_rss_feed for feeds you need "
        f"(at most {POLICY_AGENT_MAX_FETCHES} fetches), optionally get_business_profile, "
        "then submit_policy_scan with at most 5 alerts. "
        "Each alert must use candidate_id from fetched items only. "
        "Skip ceremonial or irrelevant items. Focus on tax, MCA, GST, labour, PF, ESI, banking, RBI, SEBI. "
        "Use situation_analysis and workspace_snapshot to explain business_impact: tie each alert to the "
        "business's current workload, health score, and filing pressure when relevant."
    )
    user = (
        "Run a policy scan. Ground truth includes Qdrant workspace data and a pre-analysis of the business situation.\n"
        f"{json.dumps(context, ensure_ascii=True)}\n\n"
        "Work step by step with tools until you call submit_policy_scan."
    )
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    async with httpx.AsyncClient(timeout=35.0) as http_client:
        for turn in range(POLICY_AGENT_MAX_TURNS):
            request_body: dict[str, Any] = {
                "model": GROQ_MODEL,
                "messages": messages,
                "tools": POLICY_AGENT_TOOLS,
                "tool_choice": "auto",
                "temperature": 0.15,
                "max_completion_tokens": 1400,
            }
            try:
                data = await groq_chat_request(request_body)
            except HTTPException:
                raise
            except Exception as exc:
                state.trace.append({"turn": turn + 1, "error": str(exc)[:200]})
                return None, state.feeds_status, state.trace, "agent_error"

            msg = groq_first_choice_message(data)
            tool_calls = msg.get("tool_calls")
            if isinstance(tool_calls, list) and tool_calls:
                messages.append(msg)
                for tc in tool_calls:
                    if not isinstance(tc, dict):
                        continue
                    tc_id = safe_string(tc.get("id")) or f"call_{turn}"
                    fn = tc.get("function")
                    if not isinstance(fn, dict):
                        continue
                    tname = safe_string(fn.get("name"))
                    raw_args = safe_string(fn.get("arguments")) or "{}"
                    try:
                        targs = json.loads(raw_args)
                    except json.JSONDecodeError:
                        targs = {}
                    if not isinstance(targs, dict):
                        targs = {}
                    result_str = await execute_policy_agent_tool(state, tname, targs, http_client)
                    state.trace.append({
                        "turn": turn + 1,
                        "tool": tname,
                        "preview": result_str[:400],
                    })
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc_id,
                        "content": result_str,
                    })
                    if tname == "submit_policy_scan" and state.final_submission is not None:
                        raw = state.final_submission.get("alerts")
                        if not isinstance(raw, list):
                            raw = []
                        alerts_out = build_alerts_output_from_rows(state.store, raw)
                        summary = safe_string(state.final_submission.get("reasoning_summary"))
                        state.trace.append({"turn": turn + 1, "note": "submit_policy_scan", "reasoning_summary": summary[:500]})
                        return alerts_out, state.feeds_status, state.trace, "agent"
                continue

            content = safe_string(msg.get("content"))
            if content:
                state.trace.append({"turn": turn + 1, "assistant_text": content[:500]})
            break

    return None, state.feeds_status, state.trace, "agent_incomplete"


async def policy_watch_scan_single_shot(
    company: str,
    founder: str,
    profile: dict[str, Any],
    candidates: list[dict[str, Any]],
    situation: dict[str, Any],
    business_context: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    context = {
        "company_name": company,
        "founder_name": founder,
        "onboarding_profile": profile,
        "situation_analysis": situation,
        "workspace_snapshot": business_context,
    }
    candidate_payload = [
        {
            "candidate_id": c["candidate_id"],
            "title": c["title"],
            "link": c["link"],
            "source": c["source"],
            "published": c["published"],
            "summary": c["summary"],
        }
        for c in candidates
    ]
    response = await groq_json_completion([
        {
            "role": "system",
            "content": (
                "You filter official government and regulator RSS items for Indian SME compliance relevance. "
                "You must only reference candidate_id values from the provided list. "
                "Ignore items that are purely ceremonial, sports, or unrelated to tax, corporate law, "
                "GST, labour, PF, ESI, banking, RBI regulation, SEBI, or MCA for businesses. "
                "For every alert you return, you MUST write business_impact tailored to the given "
                "company_name, onboarding_profile, situation_analysis, and workspace_snapshot (Qdrant + CA workload). "
                "Be specific: e.g. how filing deadlines, registration, tax positions, or director duties could change. "
                "Return JSON only."
            ),
        },
        {
            "role": "user",
            "content": (
                "Business context (includes Qdrant snapshot summary and current situation analysis):\n"
                f"{json.dumps(context, ensure_ascii=True)}\n\n"
                "RSS candidates (use candidate_id only from this list):\n"
                f"{json.dumps(candidate_payload, ensure_ascii=True)}\n\n"
                "Return JSON with key alerts: array of at most 5 objects, each with: "
                "candidate_id (int), relevance_score (0-1 number), risk_level (low|medium|high), "
                "why_relevant (one short sentence, general reason), "
                "business_impact (required: 2-4 sentences on how this notice or policy could affect THIS business "
                "given the profile and situation above—mention workload, health score, or filing pressure when relevant), "
                "suggested_actions (array of 2-5 short strings: what the founder or CA should review or do next), "
                "departments (array of short strings e.g. GST, MCA, RBI). "
                "Prefer higher impact and newer policy or regulatory changes. "
                "If nothing is relevant, return an empty alerts array."
            ),
        },
    ], max_completion_tokens=1800)

    raw_alerts = response.get("alerts")
    if not isinstance(raw_alerts, list):
        raw_alerts = []
    by_id = {c["candidate_id"]: c for c in candidates}
    alerts_out = build_alerts_output_from_rows(by_id, raw_alerts)
    return alerts_out, response


@app.post("/policy-watch/scan")
async def policy_watch_scan(payload: PolicyWatchRequest) -> dict[str, Any]:
    ensure_groq_configured()
    company = safe_string(payload.company_name)
    founder = safe_string(payload.founder_name)
    profile = payload.onboarding_profile if isinstance(payload.onboarding_profile, dict) else {}
    business_context = payload.business_context if isinstance(payload.business_context, dict) else {}
    scanned_at = datetime.now(timezone.utc).isoformat()

    situation = await analyze_business_situation(company, founder, profile, business_context)
    situation_resp = situation_for_api(situation)

    agent_trace_carry: list[dict[str, Any]] = []
    if POLICY_USE_AGENTIC:
        try:
            agent_alerts, agent_feeds, agent_trace_carry, _ = await run_policy_watch_agentic_scan(
                company, founder, profile, situation, business_context
            )
            if agent_alerts is not None:
                return {
                    "success": True,
                    "scannedAt": scanned_at,
                    "alerts": agent_alerts,
                    "feeds": agent_feeds,
                    "message": "",
                    "agentMode": "agent",
                    "agentTrace": agent_trace_carry,
                    "situationAnalysis": situation_resp,
                }
        except HTTPException:
            raise
        except Exception as exc:
            agent_trace_carry = [{"error": str(exc)[:200], "phase": "agent"}]

    candidates, feeds_status = await collect_policy_candidates()

    if not candidates:
        return {
            "success": True,
            "scannedAt": scanned_at,
            "alerts": [],
            "feeds": feeds_status,
            "message": (
                "No items could be loaded from RSS feeds. "
                "Add more sources via POLICY_RSS_FEEDS in .env or check network access."
            ),
            "agentMode": "fallback",
            "agentTrace": agent_trace_carry,
            "situationAnalysis": situation_resp,
        }

    alerts_out, _ = await policy_watch_scan_single_shot(
        company, founder, profile, candidates, situation, business_context
    )

    return {
        "success": True,
        "scannedAt": scanned_at,
        "alerts": alerts_out,
        "feeds": feeds_status,
        "message": "",
        "agentMode": "fallback",
        "agentTrace": agent_trace_carry + [{"step": "single_shot_ranking"}],
        "situationAnalysis": situation_resp,
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "configured": bool(SANDBOX_API_KEY and SANDBOX_API_SECRET),
        "base_url": SANDBOX_BASE_URL,
        "groqConfigured": bool(GROQ_API_KEY),
        "invoiceModel": GROQ_MODEL,
        "policyAgentic": POLICY_USE_AGENTIC,
        "policyAgentMaxTurns": POLICY_AGENT_MAX_TURNS,
    }


@app.post("/bills/scan")
async def scan_bill(payload: BillScanRequest) -> dict[str, Any]:
    ensure_groq_configured()

    if payload.mime_type not in {"application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}:
        raise HTTPException(status_code=400, detail="Only PDF, JPEG, PNG, WEBP, and HEIC bill files are supported.")

    try:
        raw_file = base64.b64decode(payload.image_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Uploaded bill file is not valid base64.") from exc

    image_data_url = build_groq_input_data_url(raw_file, payload.mime_type, payload.file_name)

    prompt = """
You are an expert accounting operations assistant for Indian SMEs.
Read this bill, invoice, receipt, or PDF document and extract normalized bookkeeping data.

Return JSON only with this shape:
{
  "document_type": "invoice|bill|receipt|expense-slip|unknown",
  "vendor_name": string,
  "invoice_number": string,
  "invoice_date": "YYYY-MM-DD" or "",
  "due_date": "YYYY-MM-DD" or "",
  "currency": string,
  "subtotal": number,
  "tax_amount": number,
  "cgst_amount": number,
  "sgst_amount": number,
  "igst_amount": number,
  "total_amount": number,
  "payment_method": string,
  "gstin": string,
  "category": string,
  "notes": string,
  "confidence": number,
  "line_items": [
    {
      "description": string,
      "quantity": number,
      "unit_price": number,
      "amount": number,
      "tax_rate": number,
      "tax_amount": number,
      "category": string
    }
  ]
}

Rules:
- Use 0 for missing numeric values.
- Keep strings empty when not visible.
- Prefer INR if the bill appears Indian and no currency is shown.
- If line items are not readable, still return at least one synthetic line item based on the total.
- Do not include markdown or code fences.
""".strip()

    request_body = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "system",
                "content": "You extract structured bookkeeping data from invoices and bills. Return JSON only."
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt,
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_data_url,
                        }
                    }
                ]
            }
        ],
        "response_format": {
            "type": "json_object"
        },
        "temperature": 0.2,
        "max_completion_tokens": 1200,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            GROQ_CHAT_COMPLETIONS_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {GROQ_API_KEY}",
            },
            json=request_body,
        )

    provider_data = parse_provider_response(response)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=extract_message(provider_data, "Failed to scan bill with Groq."))

    raw_text = extract_groq_message_text(provider_data)
    if not raw_text:
        raise HTTPException(status_code=502, detail="Groq response did not contain extracted bill data.")

    try:
        extracted = json.loads(clean_json_text(str(raw_text)))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Groq returned an invalid JSON extraction for the bill.") from exc

    normalized = normalize_bill_document(extracted, payload.file_name, payload.mime_type)
    return {
        "success": True,
        "document": normalized,
        "message": f"{normalized['vendorName'] or payload.file_name} scanned and stored in the ledger.",
    }


@app.post("/notices/interpret")
async def interpret_notice(payload: NoticeInterpretRequest) -> dict[str, Any]:
    ensure_groq_configured()

    notice_text = safe_string(payload.text).strip()
    has_file = bool(payload.file_base64 and payload.file_name)

    if not notice_text and not has_file:
        raise HTTPException(status_code=400, detail="Provide notice text or upload a PDF/image notice.")

    user_content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": build_notice_interpretation_prompt(payload.company_name, payload.founder_name),
        }
    ]

    if notice_text:
        user_content.append({
            "type": "text",
            "text": f"Notice text:\n{notice_text}",
        })

    if has_file:
        mime_type = safe_string(payload.mime_type).lower()
        if mime_type not in {"application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"}:
            raise HTTPException(status_code=400, detail="Only PDF, JPEG, PNG, WEBP, and HEIC notice files are supported.")

        try:
            raw_file = base64.b64decode(payload.file_base64, validate=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Uploaded notice file is not valid base64.") from exc

        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": build_groq_input_data_url(raw_file, mime_type, payload.file_name),
            }
        })

    extracted = await groq_json_completion([
        {
            "role": "system",
            "content": "You are CompliSure's regulatory notice analyst for Indian businesses. Return JSON only."
        },
        {
            "role": "user",
            "content": user_content,
        }
    ], max_completion_tokens=1600)

    interpretation = normalize_notice_interpretation(extracted)
    return {
        "success": True,
        "interpretation": interpretation,
        "message": "Notice interpreted successfully. Ask follow-up questions below for business impact and next steps."
    }


@app.post("/notices/chat")
async def chat_about_notice(payload: NoticeChatRequest) -> dict[str, Any]:
    ensure_groq_configured()

    question = safe_string(payload.question).strip()
    if not question:
        raise HTTPException(status_code=400, detail="Enter a follow-up question about the notice.")

    if not isinstance(payload.interpretation, dict) or not payload.interpretation:
        raise HTTPException(status_code=400, detail="Interpret a notice first before starting a follow-up chat.")

    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": (
                "You are CompliSure's follow-up notice assistant for Indian businesses. "
                "Answer in plain English, explain the business effect clearly, stay grounded in the provided context, "
                "and never invent facts that are not visible in the notice. Return JSON only."
            )
        },
        {
            "role": "user",
            "content": build_notice_chat_context(
                interpretation=payload.interpretation,
                source_text=payload.source_text,
                company_name=payload.company_name,
                founder_name=payload.founder_name
            )
        }
    ]

    for item in payload.history:
        role = safe_string(item.get("role")).lower()
        if role not in {"user", "assistant"}:
            continue
        content = safe_string(item.get("content")).strip()
        if not content:
            continue
        messages.append({
            "role": role,
            "content": content
        })

    messages.append({
        "role": "user",
        "content": (
            "Answer this follow-up question about the notice and how it affects the business. "
            "Return JSON with keys answer, business_impact, next_steps, and caution.\n"
            f"Question: {question}"
        )
    })

    response = await groq_json_completion(messages, max_completion_tokens=1000)
    return {
        "success": True,
        "answer": safe_string(response.get("answer")),
        "businessImpact": safe_string(response.get("business_impact")),
        "nextSteps": normalize_string_list(response.get("next_steps")),
        "caution": safe_string(response.get("caution")),
    }


@app.post("/assistant/chat")
async def chat_with_compliance_assistant(payload: AssistantChatRequest) -> dict[str, Any]:
    ensure_groq_configured()

    question = safe_string(payload.question).strip()
    if not question:
        raise HTTPException(status_code=400, detail="Enter a compliance question.")

    context = {
        "company_name": safe_string(payload.company_name),
        "founder_name": safe_string(payload.founder_name),
        "reminders": payload.reminders if isinstance(payload.reminders, dict) else {},
        "ca_rows": payload.ca_rows if isinstance(payload.ca_rows, list) else [],
        "onboarding_profile": payload.onboarding_profile if isinstance(payload.onboarding_profile, dict) else {},
    }

    response = await groq_json_completion([
        {
            "role": "system",
            "content": (
                "You are CompliSure's AI compliance assistant for Indian startups and SMEs. "
                "Answer user compliance questions in practical plain English and suggest upcoming tasks "
                "using the provided workspace context only. Return JSON only."
            )
        },
        {
            "role": "user",
            "content": (
                "Use this context to answer and suggest tasks. "
                "Return JSON with keys answer, upcoming_tasks, urgency, and caution.\n"
                f"Context: {json.dumps(context, ensure_ascii=True)}\n"
                f"Question: {question}"
            )
        }
    ], max_completion_tokens=900)

    return {
        "success": True,
        "answer": safe_string(response.get("answer")),
        "upcomingTasks": normalize_string_list(response.get("upcoming_tasks")),
        "urgency": normalize_urgency(response.get("urgency")),
        "caution": safe_string(response.get("caution")),
    }


@app.post("/aadhaar/otp")
async def aadhaar_otp(payload: AadhaarOtpRequest) -> dict[str, Any]:
    ensure_configured()
    token = await get_access_token()
    consent_value = "Y" if payload.consent else "N"

    request_body = {
        "@entity": "in.co.sandbox.kyc.aadhaar.okyc.otp.request",
        "aadhaar_number": payload.aadhaar,
        "consent": consent_value,
        "reason": build_reason(payload.full_name, payload.company_name),
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            AADHAAR_OTP_ENDPOINT,
            headers=sandbox_headers(token),
            json=request_body,
        )

    provider_data = parse_provider_response(response)

    if response.status_code >= 400:
      raise HTTPException(status_code=response.status_code, detail=extract_message(provider_data, "Failed to send Aadhaar OTP."))

    reference_id = pick(provider_data, ["data.reference_id", "reference_id"])
    message = extract_message(provider_data, "OTP sent to Aadhaar-linked mobile number.")

    if not reference_id:
        raise HTTPException(status_code=502, detail="Sandbox response did not include a reference ID.")

    return {
        "success": True,
        "referenceId": str(reference_id),
        "message": message,
    }


@app.post("/aadhaar/verify")
async def aadhaar_verify(payload: AadhaarVerifyRequest) -> dict[str, Any]:
    ensure_configured()
    token = await get_access_token()

    request_body = {
        "@entity": "in.co.sandbox.kyc.aadhaar.okyc.request",
        "reference_id": payload.reference_id,
        "otp": payload.otp,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            AADHAAR_VERIFY_ENDPOINT,
            headers=sandbox_headers(token),
            json=request_body,
        )

    provider_data = parse_provider_response(response)

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=extract_message(provider_data, "Failed to verify Aadhaar OTP."))

    status_value = str(pick(provider_data, ["data.status", "status"]) or "").upper()
    if status_value and status_value != "VALID":
        raise HTTPException(status_code=401, detail=extract_message(provider_data, "Aadhaar OTP verification failed."))

    result = pick(provider_data, ["data", "result"]) or {}
    message = extract_message(provider_data, "Aadhaar verified successfully.")

    return {
        "success": True,
        "message": message,
        "verifiedProfile": {
            "name": safe_string(result.get("name")),
            "dateOfBirth": safe_string(result.get("date_of_birth")),
            "gender": safe_string(result.get("gender")),
            "fullAddress": safe_string(result.get("full_address")),
            "referenceId": safe_string(result.get("reference_id") or payload.reference_id),
        },
    }


async def get_access_token() -> str:
    if cached_token["access_token"] and cached_token["expires_at"] > time.time():
        return cached_token["access_token"]

    async with auth_lock:
        if cached_token["access_token"] and cached_token["expires_at"] > time.time():
            return cached_token["access_token"]

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                AUTH_ENDPOINT,
                headers={
                    "x-api-key": SANDBOX_API_KEY,
                    "x-api-secret": SANDBOX_API_SECRET,
                    "x-api-version": SANDBOX_API_VERSION,
                },
            )

        provider_data = parse_provider_response(response)

        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=extract_message(provider_data, "Failed to authenticate with Sandbox."))

        access_token = pick(provider_data, ["data.access_token", "access_token"])
        if not access_token:
            raise HTTPException(status_code=502, detail="Sandbox auth response did not include an access token.")

        cached_token["access_token"] = str(access_token)
        cached_token["expires_at"] = time.time() + (23 * 60 * 60)
        return cached_token["access_token"]


def sandbox_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": token,
        "Content-Type": "application/json",
        "x-api-key": SANDBOX_API_KEY,
        "x-api-version": SANDBOX_API_VERSION,
    }


def build_reason(full_name: str, company_name: str) -> str:
    if full_name and company_name:
        return f"Aadhaar verification for {full_name} onboarding at {company_name}"
    if company_name:
        return f"Aadhaar verification for onboarding at {company_name}"
    return "Aadhaar verification for CompliSure signup"


def ensure_configured() -> None:
    if SANDBOX_API_KEY and SANDBOX_API_SECRET:
        return
    raise HTTPException(status_code=500, detail="Sandbox credentials are missing. Add SANDBOX_API_KEY and SANDBOX_API_SECRET.")


def ensure_groq_configured() -> None:
    if GROQ_API_KEY:
        return
    raise HTTPException(status_code=500, detail="Groq is not configured. Add GROQ_API_KEY to .env.")


def parse_provider_response(response: httpx.Response) -> dict[str, Any]:
    try:
        return response.json()
    except ValueError:
        return {"raw": response.text}


def extract_message(data: dict[str, Any], fallback: str) -> str:
    value = pick(data, ["data.message", "message", "error.message", "error", "detail", "raw"])
    return safe_string(value) or fallback


def pick(data: Any, paths: list[str]) -> Any:
    for path in paths:
        current = get_by_path(data, path)
        if current not in (None, ""):
            return current
    return None


def get_by_path(data: Any, path: str) -> Any:
    current = data
    for key in path.split("."):
        if isinstance(current, list) and key.isdigit():
            index = int(key)
            if 0 <= index < len(current):
                current = current[index]
            else:
                return None
        elif isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return None
    return current


def safe_string(value: Any) -> str:
    return "" if value is None else str(value)


def safe_number(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    try:
        if isinstance(value, str):
            cleaned = value.replace(",", "").replace("₹", "").strip()
            return float(cleaned) if cleaned else 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def clean_json_text(value: str) -> str:
    cleaned = value.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.replace("json", "", 1).strip()
    return cleaned


async def groq_json_completion(messages: list[dict[str, Any]], max_completion_tokens: int = 1200) -> dict[str, Any]:
    request_body = {
        "model": GROQ_MODEL,
        "messages": messages,
        "response_format": {
            "type": "json_object"
        },
        "temperature": 0.2,
        "max_completion_tokens": max_completion_tokens,
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            GROQ_CHAT_COMPLETIONS_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {GROQ_API_KEY}",
            },
            json=request_body,
        )

    provider_data = parse_provider_response(response)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=extract_message(provider_data, "Groq request failed."))

    raw_text = extract_groq_message_text(provider_data)
    if not raw_text:
        raise HTTPException(status_code=502, detail="Groq response did not contain JSON content.")

    try:
        return json.loads(clean_json_text(raw_text))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Groq returned invalid JSON.") from exc


def extract_groq_message_text(data: dict[str, Any]) -> str:
    content = pick(data, ["choices.0.message.content"])
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            item.get("text", "")
            for item in content
            if isinstance(item, dict)
        )
    return ""


def build_groq_input_data_url(file_bytes: bytes, mime_type: str, file_name: str) -> str:
    normalized_bytes, normalized_mime = prepare_visual_input(file_bytes, mime_type, file_name)
    encoded = base64.b64encode(normalized_bytes).decode("utf-8")
    return f"data:{normalized_mime};base64,{encoded}"


def prepare_visual_input(file_bytes: bytes, mime_type: str, file_name: str) -> tuple[bytes, str]:
    extension = suffix_for_mime(mime_type, file_name)

    with tempfile.TemporaryDirectory(prefix="complisure-bill-") as temp_dir:
        temp_path = Path(temp_dir)
        source_path = temp_path / f"source{extension}"
        source_path.write_bytes(file_bytes)

        converted_bytes = convert_with_sips(source_path, temp_path / "normalized.jpg")
        if converted_bytes is not None:
            return converted_bytes, "image/jpeg"

        if mime_type == "application/pdf":
            preview_bytes = convert_pdf_with_quicklook(source_path, temp_path)
            if preview_bytes is not None:
                return preview_bytes, "image/jpeg"

    raise HTTPException(
        status_code=500,
        detail="Could not prepare the uploaded document for Groq analysis. Try a clearer PDF or PNG/JPG image."
    )


def convert_with_sips(source_path: Path, output_path: Path) -> Optional[bytes]:
    command = [
        "/usr/bin/sips",
        "--resampleHeightWidthMax",
        "2200",
        "-s",
        "format",
        "jpeg",
        str(source_path),
        "--out",
        str(output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode == 0 and output_path.exists():
        return output_path.read_bytes()
    return None


def convert_pdf_with_quicklook(source_path: Path, temp_path: Path) -> Optional[bytes]:
    command = [
        "/usr/bin/qlmanage",
        "-t",
        "-s",
        "2000",
        "-o",
        str(temp_path),
        str(source_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        return None

    preview_path = temp_path / f"{source_path.name}.png"
    if not preview_path.exists():
        return None

    normalized_bytes = convert_with_sips(preview_path, temp_path / "preview.jpg")
    if normalized_bytes is not None:
        return normalized_bytes
    return preview_path.read_bytes()


def suffix_for_mime(mime_type: str, file_name: str) -> str:
    lowered_name = file_name.lower()
    if mime_type == "application/pdf" or lowered_name.endswith(".pdf"):
        return ".pdf"
    if mime_type in {"image/png"} or lowered_name.endswith(".png"):
        return ".png"
    if mime_type in {"image/webp"} or lowered_name.endswith(".webp"):
        return ".webp"
    if mime_type in {"image/heic"} or lowered_name.endswith(".heic"):
        return ".heic"
    if mime_type in {"image/heif"} or lowered_name.endswith(".heif"):
        return ".heif"
    return ".jpg"


def build_notice_interpretation_prompt(company_name: str, founder_name: str) -> str:
    business_context = []
    if company_name:
        business_context.append(f"Company: {company_name}")
    if founder_name:
        business_context.append(f"Founder: {founder_name}")

    context_block = "\n".join(business_context) if business_context else "No extra company context provided."
    return f"""
You are analyzing a regulatory or government notice for an Indian business.
Use the notice text and/or uploaded document to explain what it means and how it affects the business.

Business context:
{context_block}

Return JSON only with this shape:
{{
  "notice_type": string,
  "authority": string,
  "summary": string,
  "plain_english_meaning": string,
  "why_received": string,
  "business_impact": string,
  "financial_exposure": string,
  "operational_risk": string,
  "urgency": "low|medium|high|critical",
  "response_deadline": string,
  "key_amounts": [string],
  "key_sections": [string],
  "required_actions": [string],
  "immediate_next_steps": [string],
  "what_happens_if_ignored": [string],
  "professional_help": string,
  "confidence": number,
  "chat_starter": string
}}

Rules:
- Do not give legal advice; provide practical business guidance only.
- If a fact is missing or unreadable, say so clearly instead of guessing.
- Focus especially on business impact, money exposure, deadlines, and escalation risk.
- Keep response_deadline empty if not visible.
- Use a 0 to 1 confidence score.
""".strip()


def build_notice_chat_context(interpretation: dict[str, Any], source_text: str, company_name: str, founder_name: str) -> str:
    context = {
        "company_name": company_name,
        "founder_name": founder_name,
        "source_text": safe_string(source_text),
        "interpretation": interpretation,
    }
    return (
        "Use this notice context for all follow-up answers. Stay grounded in it and mention uncertainty when needed.\n"
        + json.dumps(context, ensure_ascii=True)
    )


def normalize_notice_interpretation(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "noticeType": safe_string(data.get("notice_type")) or "Regulatory notice",
        "authority": safe_string(data.get("authority")),
        "summary": safe_string(data.get("summary")),
        "plainEnglishMeaning": safe_string(data.get("plain_english_meaning")),
        "whyReceived": safe_string(data.get("why_received")),
        "businessImpact": safe_string(data.get("business_impact")),
        "financialExposure": safe_string(data.get("financial_exposure")),
        "operationalRisk": safe_string(data.get("operational_risk")),
        "urgency": normalize_urgency(data.get("urgency")),
        "responseDeadline": safe_string(data.get("response_deadline")),
        "keyAmounts": normalize_string_list(data.get("key_amounts")),
        "keySections": normalize_string_list(data.get("key_sections")),
        "requiredActions": normalize_string_list(data.get("required_actions")),
        "immediateNextSteps": normalize_string_list(data.get("immediate_next_steps")),
        "whatHappensIfIgnored": normalize_string_list(data.get("what_happens_if_ignored")),
        "professionalHelp": safe_string(data.get("professional_help")),
        "confidence": min(1.0, max(0.0, safe_number(data.get("confidence")))),
        "chatStarter": safe_string(data.get("chat_starter")) or "Ask how this affects cash flow, directors, filing timelines, or next steps.",
    }


def normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    for item in value:
        text = safe_string(item).strip()
        if text:
            normalized.append(text)
    return normalized


def normalize_urgency(value: Any) -> str:
    urgency = safe_string(value).strip().lower()
    if urgency in {"low", "medium", "high", "critical"}:
        return urgency
    return "medium"


def normalize_bill_document(data: dict[str, Any], file_name: str, mime_type: str) -> dict[str, Any]:
    line_items = data.get("line_items") if isinstance(data.get("line_items"), list) else []
    normalized_items = []

    for item in line_items:
        if not isinstance(item, dict):
            continue
        normalized_items.append({
            "description": safe_string(item.get("description")),
            "quantity": safe_number(item.get("quantity")) or 1.0,
            "unitPrice": safe_number(item.get("unit_price")),
            "amount": safe_number(item.get("amount")),
            "taxRate": safe_number(item.get("tax_rate")),
            "taxAmount": safe_number(item.get("tax_amount")),
            "category": safe_string(item.get("category")) or safe_string(data.get("category")) or "General expense",
        })

    total_amount = safe_number(data.get("total_amount"))
    if not normalized_items:
        normalized_items.append({
            "description": safe_string(data.get("document_type")) or "Scanned expense",
            "quantity": 1.0,
            "unitPrice": total_amount,
            "amount": total_amount,
            "taxRate": 0.0,
            "taxAmount": safe_number(data.get("tax_amount")),
            "category": safe_string(data.get("category")) or "General expense",
        })

    return {
        "fileName": file_name,
        "mimeType": mime_type,
        "documentType": safe_string(data.get("document_type")) or "invoice",
        "vendorName": safe_string(data.get("vendor_name")),
        "invoiceNumber": safe_string(data.get("invoice_number")),
        "invoiceDate": safe_string(data.get("invoice_date")),
        "dueDate": safe_string(data.get("due_date")),
        "currency": safe_string(data.get("currency")) or "INR",
        "subtotal": safe_number(data.get("subtotal")),
        "taxAmount": safe_number(data.get("tax_amount")),
        "cgstAmount": safe_number(data.get("cgst_amount")),
        "sgstAmount": safe_number(data.get("sgst_amount")),
        "igstAmount": safe_number(data.get("igst_amount")),
        "totalAmount": total_amount,
        "paymentMethod": safe_string(data.get("payment_method")),
        "gstin": safe_string(data.get("gstin")),
        "category": safe_string(data.get("category")) or "General expense",
        "notes": safe_string(data.get("notes")),
        "confidence": safe_number(data.get("confidence")),
        "lineItems": normalized_items,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("brain:app", host=BRAIN_HOST, port=BRAIN_PORT, reload=False)
