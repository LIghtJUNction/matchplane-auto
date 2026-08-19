import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import { AgentStore, createAgentHandler, type AgentConfig } from "./server";

const tenantId = "11111111-1111-4111-8111-111111111111";
const domainId = "22222222-2222-4222-8222-222222222222";
const offerId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const platformPath = "/used-car";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("child Agent MCP adapter", () => {
  it("requires the operator token and answers the MCP initialize handshake", async () => {
    const { handler, store } = await fixture();
    try {
      const unauthorized = await handler(request("initialize", {}, "wrong"));
      expect(unauthorized.status).toBe(401);

      const response = await handler(request("initialize", {}));
      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, any>;
      expect(body.result.serverInfo.name).toBe("matchplane-auto-agent");
      expect(body.result.capabilities.tools).toBeDefined();
    } finally {
      store.close();
    }
  });

  it("indexes only active generic offers and returns canonical retrieval candidates", async () => {
    const { handler, store } = await fixture();
    try {
      const draft = await call(handler, "catalog.upsert", {
        protocol: "matchplane.catalog/v1",
        request_id: requestId,
        scope: scope(),
        offer: {
          offer_id: offerId,
          external_key: "offer-draft",
          display_name: "城市通勤方案",
          attributes: { use: "通勤" },
          terms: { budget: "100000" },
          status: "draft",
        },
      });
      expect(draft.result.structuredContent.indexed).toBe(false);

      const beforeActivation = await call(handler, "retrieval.query", {
        protocol: "matchplane.retrieval/v1",
        request_id: requestId,
        scope: scope(),
        input: { narrative: "城市通勤", requirements: {} },
        limit: 10,
      });
      expect(beforeActivation.result.structuredContent.candidates).toHaveLength(0);

      await call(handler, "catalog.upsert", {
        protocol: "matchplane.catalog/v1",
        request_id: "55555555-5555-4555-8555-555555555555",
        scope: scope(),
        offer: {
          offer_id: offerId,
          external_key: "offer-active",
          display_name: "城市通勤方案",
          attributes: { use: "通勤" },
          terms: { budget: "100000" },
          status: "active",
        },
      });

      const result = await call(handler, "retrieval.query", {
        protocol: "matchplane.retrieval/v1",
        request_id: "66666666-6666-4666-8666-666666666666",
        scope: scope(),
        input: { narrative: "城市通勤", requirements: {} },
        limit: 10,
      });
      const candidate = result.result.structuredContent.candidates[0];
      expect(candidate.offer_id).toBe(offerId);
      expect(candidate.score).toBeGreaterThan(0);
      expect(candidate.reasons.length).toBeGreaterThan(0);
      expect(candidate.attributes.use).toBe("通勤");
    } finally {
      store.close();
    }
  });

  it("binds scope and stores media content by its digest", async () => {
    const { handler, store, directory } = await fixture();
    try {
      const wrongScope = await callExpectError(handler, "retrieval.query", {
        protocol: "matchplane.retrieval/v1",
        request_id: requestId,
        scope: { ...scope(), platform_path: "/other" },
        input: { narrative: "anything", requirements: {} },
        limit: 1,
      });
      expect(wrongScope).toContain("scope.platform_path");

      const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const encoded = Buffer.from(bytes).toString("base64");
      const result = await call(handler, "media.upload", {
        protocol: "matchplane.media/v1",
        request_id: requestId,
        scope: scope(),
        attachment: {
          kind: "image",
          file_name: "proof.png",
          media_type: "image/png",
          size_bytes: bytes.byteLength,
          data_base64: encoded,
        },
      });
      const attachment = result.result.structuredContent.attachment;
      expect(attachment.attachment_ref).toMatch(/^media:\/\/auto\/[0-9a-f]{64}$/);
      expect(attachment.size_bytes).toBe(bytes.byteLength);
      const digest = attachment.sha256 as string;
      const stored = await readFile(join(directory, "media", digest, "proof.png"));
      expect([...stored]).toEqual([...bytes]);
    } finally {
      store.close();
    }
  });
});

async function fixture(): Promise<{ handler: (request: Request) => Promise<Response>; store: AgentStore; directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), "matchplane-auto-agent-"));
  temporaryDirectories.push(directory);
  const config: AgentConfig = {
    platformPath,
    token: "test-secret",
    dataDir: directory,
    maxMediaBytes: 100 * 1024 * 1024,
    allowInsecure: false,
    expectedTenantId: tenantId,
    expectedDomainId: domainId,
    environment: "test",
  };
  const store = new AgentStore(directory);
  return { handler: createAgentHandler({ config, store }), store, directory };
}

function scope(): Record<string, string> {
  return { tenant_id: tenantId, domain_id: domainId, platform_path: platformPath };
}

function request(method: string, params: Record<string, unknown>, token = "test-secret"): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-matchplane-platform-path": platformPath,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
  });
}

async function call(handler: (request: Request) => Promise<Response>, name: string, args: Record<string, unknown>): Promise<any> {
  const response = await handler(request("tools/call", { name, arguments: args }));
  expect(response.status).toBe(200);
  const body = await response.json() as any;
  expect(body.error).toBeUndefined();
  return body;
}

async function callExpectError(handler: (request: Request) => Promise<Response>, name: string, args: Record<string, unknown>): Promise<string> {
  const body = await (await handler(request("tools/call", { name, arguments: args }))).json() as any;
  return body.error?.message ?? body.result?.structuredContent?.error ?? "";
}
