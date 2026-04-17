import asyncio
import base64
import json
import os
import subprocess
import tempfile
import time
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


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "configured": bool(SANDBOX_API_KEY and SANDBOX_API_SECRET),
        "base_url": SANDBOX_BASE_URL,
        "groqConfigured": bool(GROQ_API_KEY),
        "invoiceModel": GROQ_MODEL,
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
