import { describe, expect, it } from "vitest";
import { buildPosterVerify, verifyPosterWebhook } from "../src/poster/webhook.js";

describe("Poster webhook signature", () => {
  it("verifies valid signature", () => {
    const secret = "fe2bc8e865d8fc2236968ee53c3b2bd5";
    const base = {
      account: "api-demo",
      object: "incoming_order",
      object_id: 1,
      action: "changed",
      time: "1518794257",
    };
    const verify = buildPosterVerify(base, secret);
    expect(
      verifyPosterWebhook(
        {
          ...base,
          verify,
        },
        secret,
      ),
    ).toBe(true);
  });

  it("rejects invalid signature when secret is set", () => {
    expect(
      verifyPosterWebhook(
        {
          account: "api-demo",
          object: "transaction",
          object_id: 1,
          action: "added",
          time: "1518794257",
          verify: "bad",
        },
        "secret",
      ),
    ).toBe(false);
  });
});
