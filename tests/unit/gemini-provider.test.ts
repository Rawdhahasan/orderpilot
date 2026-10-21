// @vitest-environment node
import { createGeminiProvider, type GeminiResponse } from "@/server/extraction/gemini";
import { ProviderError } from "@/server/extraction/provider";

const f = (raw: string | null, page: number | null = 1, uncertain = false) => ({
  raw,
  page,
  uncertain,
});
const address = (line1: string | null) => ({
  ...f(line1 ? `${line1}, Springfield, IL 62701` : null),
  name: line1 ? "Fictional Buyer Inc" : null,
  line1,
  line2: null,
  city: line1 ? "Springfield" : null,
  region: line1 ? "IL" : null,
  postal_code: line1 ? "62701" : null,
  country_code: line1 ? "us" : null,
});

const complete: GeminiResponse = {
  status: "complete",
  warnings: ["Printed total does not match the sum of the lines"],
  customer_name: f("Fictional Buyer Inc"),
  customer_account_number: f(null, null),
  customer_address: address("1 Bill Street"),
  ship_to: address("9 Dock Road"),
  po_number: f("PO-7731"),
  order_date: f("03/04/2026", 1, true),
  requested_delivery_date: f(null, null),
  currency: f("USD"),
  payment_terms: f("Net 30"),
  notes: f(null, null),
  order_total: f("$1,250.00", 2),
  lines: [
    {
      page: 1,
      customer_product_code: f("FB-1"),
      description: f("Blue widgets"),
      quantity: f("10"),
      unit_of_measure: f("ea"),
      unit_price: f("$12.50"),
      line_total: f("$125.00"),
    },
    {
      page: 2,
      customer_product_code: f(null, null),
      description: f("Hand-written item", 2, true),
      quantity: f("2", 2, true),
      unit_of_measure: f(null, null),
      unit_price: f(null, null),
      line_total: f(null, null),
    },
    {
      page: 2,
      customer_product_code: f(null, null),
      description: f(null, null),
      quantity: f(null, null),
      unit_of_measure: f(null, null),
      unit_price: f(null, null),
      line_total: f(null, null),
    },
  ],
};

function ok(
  payload: unknown,
  usage = { promptTokenCount: 1200, candidatesTokenCount: 300, totalTokenCount: 1500 },
) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }],
          },
        },
      ],
      usageMetadata: usage,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

function error(status: number, message: string, apiStatus = "ERROR") {
  return new Response(JSON.stringify({ error: { code: status, message, status: apiStatus } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setup(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  const provider = createGeminiProvider({
    apiKey: "test-key-not-real",
    model: "gemini-test",
    timeoutMs: 5000,
    baseUrl: "https://mock.invalid",
    fetch: fetchMock,
  });
  const input = {
    bytes: new TextEncoder().encode("%PDF-1.4 fictional"),
    mimeType: "application/pdf",
    pageCount: 2,
    sha256: "x".repeat(64),
    attempt: 1,
    allowFixtures: false,
  };
  return { provider, calls, input };
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  try {
    await promise;
  } catch (e) {
    return e as ProviderError;
  }
  throw new Error("expected a failure");
}

describe("Gemini provider (mocked API)", () => {
  it("sends the document inline with a strict JSON schema, temperature 0, and the key only in a header", async () => {
    const { provider, calls, input } = setup(() => ok(complete));
    await provider.extract(input);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/models/gemini-test:generateContent");
    expect(calls[0]!.url).not.toContain("test-key-not-real");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.contents[0].parts[1].inlineData).toEqual({
      mimeType: "application/pdf",
      data: Buffer.from(input.bytes).toString("base64"),
    });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.responseJsonSchema.required).toContain("lines");
    expect(new Headers(calls[0]!.init.headers).get("x-goog-api-key")).toBe("test-key-not-real");
  });

  it("maps printed values with page references and the model's own uncertainty, never a numeric confidence", async () => {
    const { provider, input } = setup(() => ok(complete));
    const result = await provider.extract(input);
    expect(result.status).toBe("complete");
    expect(result.header.customer_po_number).toEqual({ raw: "PO-7731", value: "PO-7731", page: 1 });
    expect(result.header.po_date).toMatchObject({ raw: "03/04/2026", uncertain: true });
    expect(result.header.document_total).toMatchObject({ raw: "$1,250.00", page: 2 });
    expect(result.header.ship_to?.value).toMatchObject({
      line1: "9 Dock Road",
      city: "Springfield",
      country_code: "US",
    });
    expect(result.header.bill_to?.value).toMatchObject({ line1: "1 Bill Street" });
    expect(result.header.customer_name?.confidence).toBeUndefined();
    expect(result.document.warnings).toEqual(["Printed total does not match the sum of the lines"]);
    expect(provider.lastUsage).toEqual({
      promptTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
    });
  });

  it("never invents values: missing fields stay missing and empty lines are dropped", async () => {
    const { provider, input } = setup(() => ok(complete));
    const result = await provider.extract(input);
    expect(result.header.account_number).toBeUndefined();
    expect(result.header.requested_delivery_date).toBeUndefined();
    expect(result.lines).toHaveLength(2);
    expect(result.lines[1]).toMatchObject({ line_no: 2, quantity: { raw: "2", uncertain: true } });
    expect(result.lines[1]!.unit_price).toBeUndefined();
    expect(result.lines[1]!.customer_part_number).toBeUndefined();
  });

  it("ignores page numbers outside the document", async () => {
    const { provider, input } = setup(() => ok({ ...complete, po_number: f("PO-1", 9) }));
    expect((await provider.extract(input)).header.customer_po_number?.page).toBeUndefined();
  });

  it("a document that is not a purchase order gives no values (manual entry)", async () => {
    const { provider, input } = setup(() =>
      ok({ ...complete, status: "not_purchase_order", lines: [] }),
    );
    const result = await provider.extract(input);
    expect(result.status).toBe("not_recognised");
    expect(result.lines).toEqual([]);
    expect(result.header).toEqual({});
  });

  it.each([
    ["text that is not JSON", "not json at all"],
    ["JSON in the wrong shape", { status: "complete", lines: "many" }],
    ["an unknown status", { ...complete, status: "approved" }],
    ["an over-long value", { ...complete, po_number: f("x".repeat(5000)) }],
  ])("rejects %s as an invalid response (retried, nothing applied)", async (_, payload) => {
    const { provider, input } = setup(() => ok(payload));
    const e = await failure(provider.extract(input));
    expect(e).toBeInstanceOf(ProviderError);
    expect([e.kind, e.code]).toEqual(["transient", "ai_invalid_response"]);
  });

  it.each([
    [
      429,
      "Resource has been exhausted (e.g. check quota). Requests per minute exceeded.",
      "transient",
      "ai_rate_limited",
    ],
    [
      429,
      "Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel-FreeTier",
      "permanent",
      "ai_quota_exhausted",
    ],
    [500, "Internal error", "transient", "ai_provider_error"],
    [503, "The model is overloaded", "transient", "ai_provider_error"],
    [403, "Permission denied", "permanent", "ai_not_configured"],
    [400, "API key not valid. Please pass a valid API key.", "permanent", "ai_not_configured"],
    [404, "models/gemini-test is not found", "permanent", "ai_model_unavailable"],
    [400, "Request payload size exceeds the limit", "permanent", "ai_document_rejected"],
  ])(
    "HTTP %i (%s) → %s %s, with no automatic retry inside the call",
    async (status, message, kind, code) => {
      const { provider, calls, input } = setup(() =>
        error(status, message, status === 429 ? "RESOURCE_EXHAUSTED" : "ERROR"),
      );
      const e = await failure(provider.extract(input));
      expect([e.kind, e.code]).toEqual([kind, code]);
      expect(calls).toHaveLength(1);
      expect(e.message).not.toContain("test-key-not-real");
    },
  );

  it("a timeout is a transient failure", async () => {
    const { provider, input } = setup(() => {
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      throw e;
    });
    const e = await failure(provider.extract(input));
    expect([e.kind, e.code]).toEqual(["transient", "ai_timeout"]);
  });

  it("an empty answer is retried", async () => {
    const { provider, input } = setup(
      () =>
        new Response(JSON.stringify({ candidates: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const e = await failure(provider.extract(input));
    expect([e.kind, e.code]).toEqual(["transient", "ai_empty_response"]);
  });
});
