/**
 * AES-256-GCM encryption for stored payloads and per-tenant Qdrant collection names.
 * Set COMPLISURE_ENCRYPTION_KEY (64 hex chars = 32 bytes, or any passphrase hashed with SHA-256).
 * Set COMPLISURE_MULTI_TENANT_QDRANT=false to use legacy single shared collections (not recommended).
 */

const crypto = require("crypto");
const path = require("path");

const AES_256_GCM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKeyBuffer() {
  const raw = String(process.env.COMPLISURE_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

function isEncryptionEnabled() {
  return Boolean(getEncryptionKeyBuffer());
}

function encryptJsonObject(obj) {
  const key = getEncryptionKeyBuffer();
  if (!key) {
    return obj;
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_256_GCM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, ciphertext]);
  return {
    _enc: "v1",
    _blob: combined.toString("base64")
  };
}

function decryptJsonObject(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  if (payload._enc !== "v1" || typeof payload._blob !== "string") {
    return payload;
  }
  const key = getEncryptionKeyBuffer();
  if (!key) {
    throw new Error(
      "Stored data is encrypted but COMPLISURE_ENCRYPTION_KEY is not set. Add the key to .env to decrypt."
    );
  }
  const buf = Buffer.from(payload._blob, "base64");
  const iv = buf.slice(0, IV_LENGTH);
  const tag = buf.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ct = buf.slice(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(AES_256_GCM, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString("utf8"));
}

/**
 * Multi-tenant Qdrant: encrypt whole payload (collection isolates tenant).
 * Legacy shared collection: keep workspaceKey plaintext for Qdrant filter; encrypt the rest.
 */
function wrapQdrantPayload(plain) {
  if (!plain || typeof plain !== "object") {
    return plain;
  }
  if (isMultiTenantQdrant()) {
    return encryptJsonObject(plain);
  }
  const key = getEncryptionKeyBuffer();
  if (!key) {
    return plain;
  }
  const wk = plain.workspaceKey;
  const { workspaceKey: _drop, ...rest } = plain;
  const enc = encryptJsonObject(rest);
  if (enc === rest) {
    return plain;
  }
  return {
    workspaceKey: wk,
    _enc: enc._enc,
    _blob: enc._blob
  };
}

function unwrapQdrantPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  try {
    if (isMultiTenantQdrant()) {
      return decryptJsonObject(payload);
    }
    if (payload._enc === "v1" && typeof payload._blob === "string") {
      const inner = decryptJsonObject({ _enc: payload._enc, _blob: payload._blob });
      if (payload.workspaceKey !== undefined && inner && typeof inner === "object") {
        return { workspaceKey: payload.workspaceKey, ...inner };
      }
      return inner;
    }
    return decryptJsonObject(payload);
  } catch (error) {
    console.error("unwrapQdrantPayload:", error.message || error);
    return null;
  }
}

function isMultiTenantQdrant() {
  return String(process.env.COMPLISURE_MULTI_TENANT_QDRANT || "true").trim().toLowerCase() !== "false";
}

function tenantSlug(workspaceKey) {
  const key = String(workspaceKey || "default");
  return crypto.createHash("sha256").update(key, "utf8").digest("hex").slice(0, 24);
}

function resolveQdrantCollection(baseName, workspaceKey) {
  if (!isMultiTenantQdrant()) {
    return baseName;
  }
  const slug = tenantSlug(workspaceKey);
  return `${baseName}_${slug}`;
}

function tenantStorageDir(rootStorageDir, workspaceKey) {
  return path.join(rootStorageDir, "tenants", tenantSlug(workspaceKey));
}

function billLedgerFilePath(rootStorageDir, workspaceKey) {
  return path.join(tenantStorageDir(rootStorageDir, workspaceKey), "bill-workspace.json");
}

function encryptFilePayload(jsonString) {
  const key = getEncryptionKeyBuffer();
  if (!key) {
    return { plain: true, body: jsonString };
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_256_GCM, key, iv);
  const plaintext = Buffer.from(jsonString, "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, ciphertext]);
  return { plain: false, body: combined.toString("base64") };
}

function decryptFilePayload(fileText) {
  const trimmed = String(fileText || "").trim();
  if (!trimmed) {
    return "{}";
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
  if (!parsed || typeof parsed !== "object" || parsed.plain !== false || typeof parsed.body !== "string") {
    return trimmed;
  }
  const key = getEncryptionKeyBuffer();
  if (!key) {
    throw new Error("Bill ledger is encrypted; set COMPLISURE_ENCRYPTION_KEY in .env.");
  }
  const buf = Buffer.from(parsed.body, "base64");
  const iv = buf.slice(0, IV_LENGTH);
  const tag = buf.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ct = buf.slice(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(AES_256_GCM, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

module.exports = {
  getEncryptionKeyBuffer,
  isEncryptionEnabled,
  encryptJsonObject,
  decryptJsonObject,
  wrapQdrantPayload,
  unwrapQdrantPayload,
  isMultiTenantQdrant,
  tenantSlug,
  resolveQdrantCollection,
  tenantStorageDir,
  billLedgerFilePath,
  encryptFilePayload,
  decryptFilePayload
};
