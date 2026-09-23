import { describe, expect, it } from "vitest";
import { companyIdForIngestRecipient } from "../../supabase/functions/_shared/tenancy";

/**
 * DEMO CARRIER, STAGE 2, ITEM 2 — which carrier an inbound rate-con belongs to.
 *
 * `receive-rate-con-email` resolved the company with `soleCompanyId`, which
 * REFUSES the moment a second carrier exists. That would have stopped
 * SUPERTRANSPORT's inbound intake on the day the demo carrier was created, and
 * silently: the broker gets a delivered mail and no load appears.
 *
 * The recipient address is the only signal in the Resend `email.received`
 * payload that can name a carrier, so `carrier_profile.rate_con_ingest_address`
 * is the routing key. These tests pin the three answers that matter: one
 * carrier, no carrier, and — never chosen for the caller — two.
 */
type Row = { id: string; rate_con_ingest_address: string | null };

function stubClient(rows: Row[]) {
  return {
    from: () => ({
      select: () => ({
        not: () => Promise.resolve({ data: rows.filter((r) => r.rate_con_ingest_address), error: null }),
      }),
    }),
  };
}

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";

const twoCarriers = stubClient([
  { id: A, rate_con_ingest_address: "rates@parse.mysupertransport.com" },
  { id: B, rate_con_ingest_address: "rates@parse.carrier-b.test" },
]);

describe("inbound rate-con mail routes by its recipient", () => {
  it("routes SUPERTRANSPORT's mailbox to SUPERTRANSPORT even with carrier B present", async () => {
    await expect(
      companyIdForIngestRecipient(twoCarriers as never, ["rates@parse.mysupertransport.com"]),
    ).resolves.toBe(A);
  });

  it("routes carrier B's mailbox to carrier B", async () => {
    await expect(
      companyIdForIngestRecipient(twoCarriers as never, ["rates@parse.carrier-b.test"]),
    ).resolves.toBe(B);
  });

  it("ignores case, a display name and a +tag", async () => {
    await expect(
      companyIdForIngestRecipient(twoCarriers as never, [
        'Rate Cons <Rates+Broker123@Parse.MySuperTransport.com>',
      ]),
    ).resolves.toBe(A);
  });

  it("picks the claimed mailbox out of a recipient list that also holds strangers", async () => {
    await expect(
      companyIdForIngestRecipient(twoCarriers as never, [
        "dispatch@example.com",
        "rates@parse.carrier-b.test",
      ]),
    ).resolves.toBe(B);
  });

  it("returns nothing for an address no carrier claims — never a default carrier", async () => {
    await expect(
      companyIdForIngestRecipient(twoCarriers as never, ["nobody@example.com"]),
    ).resolves.toBeNull();
  });

  it("returns nothing when there are no recipients at all", async () => {
    await expect(companyIdForIngestRecipient(twoCarriers as never, [])).resolves.toBeNull();
  });

  it("refuses to choose when two carriers claim the same mailbox", async () => {
    const clashing = stubClient([
      { id: A, rate_con_ingest_address: "rates@shared.test" },
      { id: B, rate_con_ingest_address: "Rates+x@Shared.test" },
    ]);
    await expect(
      companyIdForIngestRecipient(clashing as never, ["rates@shared.test"]),
    ).rejects.toThrow(/match 2 carriers/i);
  });
});
