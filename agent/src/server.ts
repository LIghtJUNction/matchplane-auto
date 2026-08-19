import { createHash, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { Database } from "bun:sqlite";

const CATALOG_PROTOCOL = "matchplane.catalog/v1" as const;
const RETRIEVAL_PROTOCOL = "matchplane.retrieval/v1" as const;
const MEDIA_PROTOCOL = "matchplane.media/v1" as const;
const HARD_MAX_MEDIA_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_MEDIA_BYTES = 100 * 1024 * 1024;
// The root relay uses JSON/base64. Keep one hard transport cap, then apply the configured media
// limit and per-tool envelope limits after parsing. Oversized streams are cancelled while read.
const MAX_REQUEST_BYTES = Math.ceil(HARD_MAX_MEDIA_BYTES * 4 / 3) + 512 * 1024;
const MAX_CATALOG_JSON_BYTES = 256 * 1024;
const MAX_REQUIREMENTS_BYTES = 32 * 1024;
const MAX_RETRIEVAL_CANDIDATES = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const PLATFORM_PATH_PATTERN = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)$/;
const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+*-]{0,126}$/i;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MEDIA_KINDS = new Set(["image", "document", "video", "audio", "file"] as const);
const ACTIVE_STATUSES = new Set(["active"]);
const OFFER_STATUSES = new Set(["draft", "active", "reserved", "sold", "withdrawn", "expired"]);
const ALLOWED_MEDIA_TYPES = [
  /^image\/(?:avif|gif|heic|heif|jpeg|png|webp)$/i,
  /^application\/(?:json|pdf|zip)$/i,
  /^text\/plain$/i,
  /^audio\/(?:mpeg|mp4|ogg|wav|webm)$/i,
  /^video\/(?:mp4|quicktime|webm)$/i,
];

type JsonObject = Record<string, unknown>;
type MediaKind = "image" | "document" | "video" | "audio" | "file";
type OfferStatus = "draft" | "active" | "reserved" | "sold" | "withdrawn" | "expired";

export interface AgentConfig {
  platformPath: string;
  token: string | null;
  dataDir: string;
  maxMediaBytes: number;
  allowInsecure: boolean;
  expectedTenantId: string | null;
  expectedDomainId: string | null;
  environment: string;
}

export interface AgentServerOptions {
  config: AgentConfig;
  store: AgentStore;
}

interface CatalogOffer {
  offerId: string;
  externalKey: string;
  displayName: string;
  attributes: JsonObject;
  terms: JsonObject;
  status: OfferStatus;
  attachments: string[];
}

interface RetrievalQuery {
  requestId: string;
  tenantId: string;
  domainId: string;
  platformPath: string;
  narrative: string;
  requirements: JsonObject;
  limit: number;
}

interface StoredOffer {
  offerId: string;
  externalKey: string;
  displayName: string;
  attributes: JsonObject;
  terms: JsonObject;
  status: OfferStatus;
  attachments: string[];
  searchableText: string;
  updatedAt: string;
}

interface StoredMedia {
  sha256: string;
  relativePath: string;
  fileName: string;
  mediaType: string;
  kind: MediaKind;
  sizeBytes: number;
}

/**
 * Load the package-local service configuration. Secrets are supplied by the operator, never by
 * the manifest or by a browser. In production a tenant and domain binding is required so an
 * endpoint cannot accidentally serve a different mounted scope.
 */
export function loadAgentConfig(environment: NodeJS.ProcessEnv = process.env): AgentConfig {
  const runtime = environment.MATCHPLANE_ENVIRONMENT?.trim() || "development";
  const platformPath = normalizePlatformPath(environment.MATCHPLANE_AUTO_PLATFORM_PATH?.trim() || "/used-car");
  if (!platformPath) throw new Error("MATCHPLANE_AUTO_PLATFORM_PATH must be a normalized child path");

  const maxMediaBytes = parseBoundedInteger(
    environment.MATCHPLANE_AUTO_MAX_MEDIA_BYTES,
    DEFAULT_MAX_MEDIA_BYTES,
    1,
    HARD_MAX_MEDIA_BYTES,
  );
  const token = environment.MATCHPLANE_AUTO_MCP_TOKEN?.trim() || null;
  const dataDir = resolve(environment.MATCHPLANE_AUTO_DATA_DIR?.trim() || join(process.cwd(), ".data", "agent"));
  const expectedTenantId = optionalUuid(environment.MATCHPLANE_AUTO_TENANT_ID);
  const expectedDomainId = optionalUuid(environment.MATCHPLANE_AUTO_DOMAIN_ID);
  if (runtime === "production" && (!token || !expectedTenantId || !expectedDomainId)) {
    throw new Error("production child Agent requires MATCHPLANE_AUTO_MCP_TOKEN, MATCHPLANE_AUTO_TENANT_ID and MATCHPLANE_AUTO_DOMAIN_ID");
  }

  return {
    platformPath,
    token,
    dataDir,
    maxMediaBytes,
    allowInsecure: runtime !== "production" && environment.MATCHPLANE_AUTO_MCP_ALLOW_INSECURE === "1",
    expectedTenantId,
    expectedDomainId,
    environment: runtime,
  };
}

/** SQLite is a package-local reference store; production operators may replace this adapter with a vector-backed implementation. */
export class AgentStore {
  private readonly database: Database;
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = resolve(dataDir);
    mkdirSync(this.dataDir, { recursive: true, mode: 0o750 });
    this.database = new Database(join(this.dataDir, "agent.sqlite"));
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS offers (
        offer_id TEXT PRIMARY KEY,
        external_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        attributes_json TEXT NOT NULL,
        terms_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'reserved', 'sold', 'withdrawn', 'expired')),
        attachments_json TEXT NOT NULL,
        searchable_text TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT
      );
      CREATE INDEX IF NOT EXISTS offers_status_idx ON offers(status);
      CREATE TABLE IF NOT EXISTS media (
        sha256 TEXT PRIMARY KEY,
        relative_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        media_type TEXT NOT NULL,
        kind TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  close(): void {
    this.database.close();
  }

  upsertOffer(offer: CatalogOffer, actorSubject: string | null): void {
    const now = new Date().toISOString();
    const attributesJson = JSON.stringify(offer.attributes);
    const termsJson = JSON.stringify(offer.terms);
    const attachmentsJson = JSON.stringify(offer.attachments);
    const searchableText = [offer.displayName, offer.externalKey, attributesJson, termsJson].join(" ");
    if (byteLength(attributesJson) > MAX_CATALOG_JSON_BYTES || byteLength(termsJson) > MAX_CATALOG_JSON_BYTES) {
      throw new ValidationError("catalog attributes or terms exceed the package limit");
    }
    this.database.query(`
      INSERT INTO offers (
        offer_id, external_key, display_name, attributes_json, terms_json, status,
        attachments_json, searchable_text, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (offer_id) DO UPDATE SET
        external_key = excluded.external_key,
        display_name = excluded.display_name,
        attributes_json = excluded.attributes_json,
        terms_json = excluded.terms_json,
        status = excluded.status,
        attachments_json = excluded.attachments_json,
        searchable_text = excluded.searchable_text,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(
      offer.offerId,
      offer.externalKey,
      offer.displayName,
      attributesJson,
      termsJson,
      offer.status,
      attachmentsJson,
      searchableText,
      now,
      actorSubject,
    );
  }

  activeOffers(): StoredOffer[] {
    const rows = this.database.query(`
      SELECT offer_id, external_key, display_name, attributes_json, terms_json, status,
             attachments_json, searchable_text, updated_at
        FROM offers
       WHERE status = 'active'
       ORDER BY updated_at DESC, offer_id ASC
       LIMIT 1000
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      offerId: String(row.offer_id),
      externalKey: String(row.external_key),
      displayName: String(row.display_name),
      attributes: parseStoredJson(row.attributes_json),
      terms: parseStoredJson(row.terms_json),
      status: String(row.status) as OfferStatus,
      attachments: parseStoredStringArray(row.attachments_json),
      searchableText: String(row.searchable_text),
      updatedAt: String(row.updated_at),
    }));
  }

  async storeMedia(input: {
    bytes: Uint8Array;
    fileName: string;
    mediaType: string;
    kind: MediaKind;
  }): Promise<StoredMedia> {
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const directory = join(this.dataDir, "media", sha256);
    await mkdir(directory, { recursive: true, mode: 0o750 });
    const fileName = safeFileName(input.fileName);
    const target = join(directory, fileName);
    const relativePath = join("media", sha256, fileName);
    await writeIfAbsent(target, input.bytes);
    this.database.query(`
      INSERT OR IGNORE INTO media (sha256, relative_path, file_name, media_type, kind, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sha256, relativePath, fileName, input.mediaType, input.kind, input.bytes.byteLength, new Date().toISOString());
    return { sha256, relativePath, fileName, mediaType: input.mediaType, kind: input.kind, sizeBytes: input.bytes.byteLength };
  }
}

/** Create a fetch handler so tests and operators can embed the child service without global state. */
export function createAgentHandler(options: AgentServerOptions): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "matchplane-auto-agent", platform_path: options.config.platformPath });
    }
    if (url.pathname !== "/mcp") return json({ error: "not found" }, 404);
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, { allow: "POST" });
    if (!authorized(request, options.config)) return json({ error: "MCP authorization required" }, 401, { "www-authenticate": "Bearer" });

    let rpc: JsonObject;
    try {
      rpc = asObject(JSON.parse(await readRequestBody(request, MAX_REQUEST_BYTES)));
    } catch (error) {
      return jsonRpcError(null, -32700, error instanceof PayloadTooLargeError ? "request exceeds the 256 MiB transport limit" : "invalid JSON-RPC request");
    }
    const id = rpc.id === undefined ? null : rpc.id;
    if (rpc.jsonrpc !== "2.0" || (typeof rpc.method !== "string" && rpc.method !== undefined)) {
      return jsonRpcError(id, -32600, "invalid JSON-RPC request");
    }

    try {
      switch (rpc.method) {
        case "initialize":
          return jsonRpcResult(id, {
            protocolVersion: "2025-03-26",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "matchplane-auto-agent", version: "1.0.0" },
          });
        case "notifications/initialized":
          return new Response(null, { status: 202 });
        case "tools/list":
          return jsonRpcResult(id, { tools: toolDefinitions() });
        case "tools/call":
          return await handleToolCall(id, rpc.params, request, options);
        default:
          return jsonRpcError(id, -32601, "method not found");
      }
    } catch (error) {
      if (error instanceof ValidationError) return jsonRpcError(id, -32602, error.message);
      console.error("matchplane child Agent request failed", error);
      return jsonRpcError(id, -32000, "child Agent request failed");
    }
  };
}

/** Start the package-local service when invoked by `bun run agent:serve`. */
export function startAgentServer(environment: NodeJS.ProcessEnv = process.env): ReturnType<typeof Bun.serve> {
  const config = loadAgentConfig(environment);
  const store = new AgentStore(config.dataDir);
  const port = parseBoundedInteger(environment.MATCHPLANE_AUTO_MCP_PORT, 8787, 1, 65_535);
  const hostname = environment.MATCHPLANE_AUTO_MCP_HOST?.trim() || "127.0.0.1";
  const server = Bun.serve({
    hostname,
    port,
    fetch: createAgentHandler({ config, store }),
  });
  console.info(`matchplane child Agent listening on http://${hostname}:${server.port}/mcp`);
  return server;
}

if (import.meta.main) startAgentServer();

async function handleToolCall(
  id: unknown,
  rawParams: unknown,
  request: Request,
  options: AgentServerOptions,
): Promise<Response> {
  const params = asObject(rawParams);
  if (typeof params.name !== "string") throw new ValidationError("tools/call requires a tool name");
  const argumentsValue = params.arguments === undefined ? {} : asObject(params.arguments);
  const pathHeader = request.headers.get("x-matchplane-platform-path");
  if (pathHeader !== options.config.platformPath) throw new ValidationError("platform path binding does not match the child endpoint");
  const subject = request.headers.get("x-matchplane-agent-subject");

  let output: JsonObject;
  switch (params.name) {
    case "catalog.upsert":
      output = catalogUpsert(argumentsValue, options, subject);
      break;
    case "retrieval.query":
      output = retrievalQuery(argumentsValue, options);
      break;
    case "media.upload":
      output = await mediaUpload(argumentsValue, options);
      break;
    default:
      throw new ValidationError("tool is not declared by this child Agent");
  }
  return jsonRpcResult(id, {
    structuredContent: output,
    content: [{ type: "text", text: JSON.stringify(output) }],
  });
}

function catalogUpsert(value: JsonObject, options: AgentServerOptions, actorSubject: string | null): JsonObject {
  const allowed = new Set(["protocol", "request_id", "scope", "offer"]);
  rejectUnknown(value, allowed, "catalog request");
  if (value.protocol !== CATALOG_PROTOCOL) throw new ValidationError("protocol must be matchplane.catalog/v1");
  const requestId = requireUuid(value.request_id, "request_id");
  const scope = parseScope(value.scope, options.config);
  const offerValue = asObject(value.offer);
  const offerAllowed = new Set(["offer_id", "external_key", "display_name", "attributes", "terms", "status", "attachments"]);
  rejectUnknown(offerValue, offerAllowed, "catalog offer");
  const offer: CatalogOffer = {
    offerId: requireUuid(offerValue.offer_id, "offer.offer_id"),
    externalKey: boundedString(offerValue.external_key, "offer.external_key", 256),
    displayName: boundedString(offerValue.display_name, "offer.display_name", 500),
    attributes: boundedObject(offerValue.attributes, "offer.attributes", MAX_CATALOG_JSON_BYTES),
    terms: boundedObject(offerValue.terms, "offer.terms", MAX_CATALOG_JSON_BYTES),
    status: parseOfferStatus(offerValue.status),
    attachments: parseAttachmentRefs(offerValue.attachments),
  };
  options.store.upsertOffer(offer, actorSubject);
  return {
    protocol: CATALOG_PROTOCOL,
    request_id: requestId,
    scope,
    offer_id: offer.offerId,
    status: offer.status,
    indexed: ACTIVE_STATUSES.has(offer.status),
  };
}

function retrievalQuery(value: JsonObject, options: AgentServerOptions): JsonObject {
  const allowed = new Set(["protocol", "request_id", "scope", "input", "limit", "trace_id"]);
  rejectUnknown(value, allowed, "retrieval request");
  if (value.protocol !== RETRIEVAL_PROTOCOL) throw new ValidationError("protocol must be matchplane.retrieval/v1");
  const requestId = requireUuid(value.request_id, "request_id");
  const scope = parseScope(value.scope, options.config);
  const input = asObject(value.input);
  rejectUnknown(input, new Set(["narrative", "requirements", "budget_min", "budget_max", "currency", "currency_scale"]), "retrieval input");
  const narrative = boundedString(input.narrative, "input.narrative", 10_000).trim();
  if (!narrative) throw new ValidationError("input.narrative must not be empty");
  const requirements = boundedObject(input.requirements, "input.requirements", MAX_REQUIREMENTS_BYTES);
  const limit = integerValue(value.limit, "limit");
  if (limit < 1 || limit > 100) throw new ValidationError("limit must be between 1 and 100");
  const query: RetrievalQuery = {
    requestId,
    tenantId: scope.tenant_id,
    domainId: scope.domain_id,
    platformPath: scope.platform_path,
    narrative,
    requirements,
    limit,
  };
  const queryTokens = tokenize([query.narrative, JSON.stringify(query.requirements)].join(" "));
  const candidates = options.store.activeOffers()
    .map((offer) => rankOffer(offer, queryTokens))
    .sort((left, right) => Number(right.score) - Number(left.score) || String(left.offer_id).localeCompare(String(right.offer_id)))
    .slice(0, Math.min(query.limit, MAX_RETRIEVAL_CANDIDATES));
  return {
    protocol: RETRIEVAL_PROTOCOL,
    request_id: query.requestId,
    provider: { id: "matchplane-auto.lexical", version: "1.0.0", model: null },
    candidates,
    degraded: false,
    generated_at: new Date().toISOString(),
  };
}

async function mediaUpload(value: JsonObject, options: AgentServerOptions): Promise<JsonObject> {
  const allowed = new Set(["protocol", "request_id", "scope", "intent_id", "attachment"]);
  rejectUnknown(value, allowed, "media request");
  if (value.protocol !== MEDIA_PROTOCOL) throw new ValidationError("protocol must be matchplane.media/v1");
  const requestId = requireUuid(value.request_id, "request_id");
  parseScope(value.scope, options.config);
  const attachment = asObject(value.attachment);
  rejectUnknown(attachment, new Set(["kind", "file_name", "media_type", "size_bytes", "data_base64"]), "media attachment");
  const kind = parseMediaKind(attachment.kind);
  const fileName = boundedString(attachment.file_name, "attachment.file_name", 255);
  if (!isSafeFileName(fileName)) throw new ValidationError("attachment.file_name is invalid");
  const mediaType = boundedString(attachment.media_type, "attachment.media_type", 200).toLowerCase();
  if (!MIME_PATTERN.test(mediaType) || !ALLOWED_MEDIA_TYPES.some((pattern) => pattern.test(mediaType))) {
    throw new ValidationError("attachment.media_type is not allowed");
  }
  if (!kindMatchesMediaType(kind, mediaType)) throw new ValidationError("attachment.kind does not match media_type");
  const sizeBytes = integerValue(attachment.size_bytes, "attachment.size_bytes");
  if (sizeBytes < 1 || sizeBytes > options.config.maxMediaBytes) throw new ValidationError("attachment.size_bytes exceeds the configured limit");
  const dataBase64 = boundedString(attachment.data_base64, "attachment.data_base64", Math.ceil(options.config.maxMediaBytes * 4 / 3) + 4);
  if (!BASE64_PATTERN.test(dataBase64) || dataBase64.length === 0) throw new ValidationError("attachment.data_base64 is invalid");
  const bytes = Uint8Array.from(Buffer.from(dataBase64, "base64"));
  if (bytes.byteLength !== sizeBytes) throw new ValidationError("attachment.size_bytes does not match data_base64");
  const stored = await options.store.storeMedia({ bytes, fileName, mediaType, kind });
  return {
    protocol: MEDIA_PROTOCOL,
    request_id: requestId,
    attachment: {
      attachment_ref: `media://auto/${stored.sha256}`,
      kind: stored.kind,
      file_name: stored.fileName,
      media_type: stored.mediaType,
      size_bytes: stored.sizeBytes,
      sha256: stored.sha256,
      metadata: { storage: "child-local-content-addressed", scanner: "basic" },
    },
  };
}

function parseScope(value: unknown, config: AgentConfig): { tenant_id: string; domain_id: string; platform_path: string } {
  const scope = asObject(value);
  rejectUnknown(scope, new Set(["tenant_id", "domain_id", "platform_path"]), "scope");
  const tenantId = requireUuid(scope.tenant_id, "scope.tenant_id");
  const domainId = requireUuid(scope.domain_id, "scope.domain_id");
  const platformPath = normalizePlatformPath(boundedString(scope.platform_path, "scope.platform_path", 512));
  if (!platformPath || platformPath !== config.platformPath) throw new ValidationError("scope.platform_path does not match this child");
  if (config.expectedTenantId && config.expectedTenantId !== tenantId) throw new ValidationError("scope.tenant_id is not bound to this child");
  if (config.expectedDomainId && config.expectedDomainId !== domainId) throw new ValidationError("scope.domain_id is not bound to this child");
  return { tenant_id: tenantId, domain_id: domainId, platform_path: platformPath };
}

function rankOffer(offer: StoredOffer, queryTokens: Set<string>): JsonObject {
  const offerTokens = tokenize(offer.searchableText);
  let overlap = 0;
  for (const token of queryTokens) if (offerTokens.has(token)) overlap += 1;
  const score = queryTokens.size === 0 ? 0 : Math.min(1, (overlap / queryTokens.size) * 0.7 + (overlap / Math.max(offerTokens.size, 1)) * 0.3);
  const reasons = overlap > 0
    ? [`子平台目录中有 ${overlap} 项内容与当前描述相符`]
    : ["该候选来自已审核的子平台目录，但当前描述没有足够的文字证据"];
  const risks = score < 0.2 ? ["需要人工确认具体属性、条款和可用状态"] : [];
  const attributes = boundedProjection(offer.attributes);
  const terms = boundedProjection(offer.terms);
  return {
    offer_id: offer.offerId,
    display_name: offer.displayName,
    ...(attributes === undefined ? {} : { attributes }),
    ...(terms === undefined ? {} : { terms }),
    score: roundScore(score),
    reasons,
    ...(risks.length ? { risks } : {}),
    metadata: { source: "child-catalog", updated_at: offer.updatedAt },
  };
}

function boundedProjection(value: JsonObject): JsonObject | undefined {
  return byteLength(JSON.stringify(value)) <= 8 * 1024 ? value : undefined;
}

function toolDefinitions(): JsonObject[] {
  return [
    {
      name: "catalog.upsert",
      description: "Upsert one generic public offer projection owned by this subplatform.",
      inputSchema: { type: "object", additionalProperties: false, required: ["protocol", "request_id", "scope", "offer"] },
    },
    {
      name: "retrieval.query",
      description: "Rank active child-owned offers using the subplatform's retrieval policy.",
      inputSchema: { type: "object", additionalProperties: false, required: ["protocol", "request_id", "scope", "input", "limit"] },
    },
    {
      name: "media.upload",
      description: "Store a bounded seller or buyer attachment and return an opaque media reference.",
      inputSchema: { type: "object", additionalProperties: false, required: ["protocol", "request_id", "scope", "attachment"] },
    },
  ];
}

async function readRequestBody(request: Request, maximumBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function writeIfAbsent(path: string, bytes: Uint8Array): Promise<void> {
  try {
    const existing = await stat(path);
    if (existing.isFile() && existing.size === bytes.byteLength) return;
    throw new Error("content-addressed media path already exists with a different size");
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      const handle = await open(path, "wx", 0o640);
      try {
        await handle.write(bytes);
      } finally {
        await handle.close();
      }
      return;
    }
    throw error;
  }
}

function authorized(request: Request, config: AgentConfig): boolean {
  const header = request.headers.get("authorization")?.trim() || "";
  if (!config.token) return config.allowInsecure && header === "Bearer dev-insecure";
  if (!header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(config.token);
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}

function json(value: JsonObject, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders },
  });
}

function jsonRpcResult(id: unknown, result: JsonObject): Response {
  return json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: unknown, code: number, message: string): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message } });
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("expected a JSON object");
  return value as JsonObject;
}

function rejectUnknown(value: JsonObject, allowed: Set<string>, label: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new ValidationError(`${label} contains unsupported field: ${unknown}`);
}

function boundedObject(value: unknown, label: string, maximumBytes: number): JsonObject {
  const object = asObject(value);
  if (byteLength(JSON.stringify(object)) > maximumBytes) throw new ValidationError(`${label} is too large`);
  if (Object.keys(object).length > 256) throw new ValidationError(`${label} has too many fields`);
  return object;
}

function boundedString(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength) throw new ValidationError(`${label} is invalid`);
  return value;
}

function requireUuid(value: unknown, label: string): string {
  const string = boundedString(value, label, 64);
  if (!UUID_PATTERN.test(string)) throw new ValidationError(`${label} must be a UUID`);
  return string;
}

function optionalUuid(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function parseScopePath(value: string): string | null {
  return PLATFORM_PATH_PATTERN.test(value) ? value : null;
}

function normalizePlatformPath(value: string): string | null {
  if (value === "/") return "/";
  const path = value.replace(/\/+$/, "");
  return parseScopePath(path);
}

function parseOfferStatus(value: unknown): OfferStatus {
  if (typeof value !== "string" || !OFFER_STATUSES.has(value)) throw new ValidationError("offer.status is invalid");
  return value as OfferStatus;
}

function parseAttachmentRefs(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) throw new ValidationError("offer.attachments is invalid");
  return value.map((item, index) => {
    if (typeof item !== "string" || !/^media:\/\/[a-z0-9][a-z0-9._:/-]{1,511}$/i.test(item)) throw new ValidationError(`offer.attachments[${index}] is invalid`);
    return item;
  });
}

function parseMediaKind(value: unknown): MediaKind {
  if (typeof value !== "string" || !MEDIA_KINDS.has(value as MediaKind)) throw new ValidationError("attachment.kind is invalid");
  return value as MediaKind;
}

function kindMatchesMediaType(kind: MediaKind, mediaType: string): boolean {
  if (kind === "file") return true;
  if (kind === "image") return mediaType.startsWith("image/");
  if (kind === "video") return mediaType.startsWith("video/");
  if (kind === "audio") return mediaType.startsWith("audio/");
  return mediaType === "application/pdf" || mediaType === "application/json" || mediaType === "text/plain";
}

function isSafeFileName(value: string): boolean {
  return value === basename(value) && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\") && !value.includes("\0");
}

function safeFileName(value: string): string {
  if (!isSafeFileName(value)) throw new ValidationError("attachment.file_name is invalid");
  return value;
}

function integerValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new ValidationError(`${label} must be an integer`);
  return value;
}

function parseBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function tokenize(value: string): Set<string> {
  const normalized = value.toLocaleLowerCase();
  const tokens = new Set(normalized.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1));
  const compact = Array.from(normalized.replace(/[^\p{L}\p{N}]/gu, ""));
  for (let index = 0; index + 1 < compact.length; index += 1) tokens.add(compact[index] + compact[index + 1]);
  return tokens;
}

function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function parseStoredJson(value: unknown): JsonObject {
  try {
    return asObject(JSON.parse(String(value)));
  } catch {
    return {};
  }
}

function parseStoredStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isNodeError(value: unknown, code: string): boolean {
  return Boolean(value && typeof value === "object" && "code" in value && (value as { code?: unknown }).code === code);
}

class ValidationError extends Error {}
class PayloadTooLargeError extends Error {}
