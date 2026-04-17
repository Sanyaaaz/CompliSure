import asyncio
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

AUTH_ENDPOINT = f"{SANDBOX_BASE_URL}/authenticate"
AADHAAR_OTP_ENDPOINT = f"{SANDBOX_BASE_URL}/kyc/aadhaar/okyc/otp"
AADHAAR_VERIFY_ENDPOINT = f"{SANDBOX_BASE_URL}/kyc/aadhaar/okyc/otp/verify"

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


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "configured": bool(SANDBOX_API_KEY and SANDBOX_API_SECRET),
        "base_url": SANDBOX_BASE_URL,
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
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return None
    return current


def safe_string(value: Any) -> str:
    return "" if value is None else str(value)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("brain:app", host=BRAIN_HOST, port=BRAIN_PORT, reload=False)
