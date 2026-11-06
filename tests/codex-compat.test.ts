import test from "node:test";
import assert from "node:assert/strict";
import { buildRegistry } from "../src/providers/registry";
import { __buildCodexHeaders } from "../src/upstream/codex-api";
import {
  listCodexModels,
  __resetCodexModelsCache,
} from "../src/upstream/codex-models";
import { DEFAULT_CODEX_CLI_VERSION } from "../src/upstream/codex-version";

test("GPT-6 routes to Codex without capturing legacy GPT or Claude models", () => {
  const r = buildRegistry("/tmp/auth2api-compat-no-accounts");
  for (const m of [
    "gpt-6-sol",
    "gpt-6.1-sol",
    "gpt-6-astra",
    "gpt-6-luna",
    "gpt-5.6-sol",
    "gpt-5.5",
  ])
    assert.equal(r.forModel(m).id, "codex", m);
  for (const m of ["gpt-4o", "gpt-60", "claude-sonnet-4-5"])
    assert.equal(r.get("codex").matchesModel(m), false, m);
  assert.equal(r.forModel("claude-sonnet-4-5").id, "anthropic");
});

test("Codex headers use current shared version and preserve explicit override", () => {
  const account = { token: { accessToken: "test-only" } } as any;
  for (const version of [undefined, "0.168.0"]) {
    const h = __buildCodexHeaders(account, true, {
      cloaking: { codex: { "cli-version": version } },
    } as any);
    assert.equal(h.version, version || DEFAULT_CODEX_CLI_VERSION);
    assert.ok(h["User-Agent"].includes(h.version));
  }
  assert.equal(DEFAULT_CODEX_CLI_VERSION, "0.167.0");
});

test("model discovery sends a semantic client version and uses live results", async () => {
  const original = globalThis.fetch;
  __resetCodexModelsCache();
  let calls = 0;
  globalThis.fetch = (async (input: any) => {
    calls++;
    const u = new URL(String(input));
    assert.equal(
      u.searchParams.get("client_version"),
      DEFAULT_CODEX_CLI_VERSION,
    );
    assert.match(u.searchParams.get("client_version")!, /^\d+\.\d+\.\d+$/);
    return new Response(JSON.stringify({ models: [{ slug: "gpt-6-sol" }] }), {
      status: 200,
    });
  }) as typeof fetch;
  try {
    const manager = {
      getNextAccount: () => ({
        account: { token: { accessToken: "test-only" } },
      }),
    } as any;
    assert.deepEqual(await listCodexModels(manager), [
      { id: "gpt-6-sol", owned_by: "openai" },
    ]);
    await listCodexModels(manager);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    __resetCodexModelsCache();
  }
});
