import asyncio
import base64
import json
import os
import time
from pathlib import Path
from typing import Any

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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")

AUTH_ENDPOINT = f"{SANDBOX_BASE_URL}/authenticate"
AADHAAR_OTP_ENDPOINT = f"{SANDBOX_BASE_URL}/kyc/aadhaar/okyc/otp"
AADHAAR_VERIFY_ENDPOINT = f"{SANDBOX_BASE_URL}/kyc/aadhaar/okyc/otp/verify"
GEMINI_GENERATE_CONTENT_ENDPOINT = f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:generateContent"

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


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "configured": bool(SANDBOX_API_KEY and SANDBOX_API_SECRET),
        "base_url": SANDBOX_BASE_URL,
        "geminiConfigured": bool(GEMINI_API_KEY),
    }


@app.post("/bills/scan")
async def scan_bill(payload: BillScanRequest) -> dict[str, Any]:
    ensure_gemini_configured()

    if payload.mime_type not in {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WEBP, and HEIC bill images are supported.")

    try:
        base64.b64decode(payload.image_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Uploaded bill image is not valid base64.") from exc

    prompt = """
You are an expert accounting operations assistant for Indian SMEs.
Read this bill or invoice image and extract normalized bookkeeping data.

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
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": payload.mime_type,
                            "data": payload.image_base64,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
            "responseJsonSchema": {
                "type": "object",
                "properties": {
                    "document_type": {"type": "string"},
                    "vendor_name": {"type": "string"},
                    "invoice_number": {"type": "string"},
                    "invoice_date": {"type": "string"},
                    "due_date": {"type": "string"},
                    "currency": {"type": "string"},
                    "subtotal": {"type": "number"},
                    "tax_amount": {"type": "number"},
                    "cgst_amount": {"type": "number"},
                    "sgst_amount": {"type": "number"},
                    "igst_amount": {"type": "number"},
                    "total_amount": {"type": "number"},
                    "payment_method": {"type": "string"},
                    "gstin": {"type": "string"},
                    "category": {"type": "string"},
                    "notes": {"type": "string"},
                    "confidence": {"type": "number"},
                    "line_items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "description": {"type": "string"},
                                "quantity": {"type": "number"},
                                "unit_price": {"type": "number"},
                                "amount": {"type": "number"},
                                "tax_rate": {"type": "number"},
                                "tax_amount": {"type": "number"},
                                "category": {"type": "string"}
                            }
                        }
                    }
                },
                "required": ["document_type", "vendor_name", "currency", "total_amount", "line_items"]
            },
        },
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            GEMINI_GENERATE_CONTENT_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY,
            },
            json=request_body,
        )

    provider_data = parse_provider_response(response)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=extract_message(provider_data, "Failed to scan bill with Gemini."))

    raw_text = pick(provider_data, [
        "candidates.0.content.parts.0.text",
        "candidates.0.content.parts.1.text",
    ])
    if not raw_text:
        raise HTTPException(status_code=502, detail="Gemini response did not contain extracted bill data.")

    try:
        extracted = json.loads(clean_json_text(str(raw_text)))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Gemini returned an invalid JSON extraction for the bill.") from exc

    normalized = normalize_bill_document(extracted, payload.file_name, payload.mime_type)
    return {
        "success": True,
        "document": normalized,
        "message": f"{normalized['vendorName'] or payload.file_name} scanned and stored in the ledger.",
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


def ensure_gemini_configured() -> None:
    if GEMINI_API_KEY:
        return
    raise HTTPException(status_code=500, detail="Gemini is not configured. Add GEMINI_API_KEY to .env.")


def parse_provider_response(response: httpx.Response) -> dict[str, Any]:
    try:
        return response.json()
    except ValueError:
        return {"raw": response.text}


def extract_message(data: dict[str, Any], fallback: str) -> str:
    value = pick(data, ["data.message", "message", "error", "detail", "raw"])
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
