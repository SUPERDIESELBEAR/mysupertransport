import { describe, expect, it } from "vitest";
import {
  companyIdForUser,
  companyIdForAnyUser,
} from "../../supabase/functions/_shared/tenancy";

/**
 * Owner decision C, 2026-09-16: an ambiguous company resolves to NOTHING.
 *
 * The database resolver returns NULL. The edge-function helpers have no NULL to
 * return — their callers need a company_id — so their equivalent of "nothing" is
 * a THROW that names the user. Silently picking one is the one outcome forbidden.
 *
 * The stub deliberately supports BOTH query shapes: the old
 * `.limit(1).maybeSingle()` and the new unlimited `.eq()`. Written the other way
 * round, the old code would fail with a TypeError about a missing method, which
 * proves nothing about behaviour. With this stub the old code RESOLVES a company
 * for a two-company user, which is exactly the defect.
 */
type Rows = Record<string, { company_id: string | null }[]>;

function stubClient(rows: Rows) {
  return {
    from(table: string) {
      const data = rows[table] ?? [];
      const result = { data, error: null };
      const eq = () => {
        const p = Promise.resolve(result) as any;
        p.limit = () => ({
          maybeSingle: async () =>
            data.length > 1
              ? { data: null, error: { message: "multiple rows returned" } }
              : { data: data[0] ?? null, error: null },
        });
        p.maybeSingle = async () =>
          data.length > 1
            ? { data: null, error: { message: "multiple rows returned" } }
            : { data: data[0] ?? null, error: null };
        return p;
      };
      return { select: () => ({ eq }) };
    },
  };
}

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER = "11111111-2222-3333-4444-555555555555";

describe("edge helpers refuse an ambiguous company", () => {
  it("companyIdForAnyUser resolves a single company exactly as before", async () => {
    const c = stubClient({ operators: [{ company_id: A }] });
    await expect(companyIdForAnyUser(c as any, USER)).resolves.toBe(A);
  });

  it("companyIdForAnyUser throws when two distinct companies match", async () => {
    const c = stubClient({
      company_members: [{ company_id: A }],
      truck_owners: [{ company_id: B }],
    });
    await expect(companyIdForAnyUser(c as any, USER)).rejects.toThrow(
      /more than one company|two companies|belongs to 2/i,
    );
  });

  it("companyIdForAnyUser names the user in the ambiguity message", async () => {
    const c = stubClient({
      company_members: [{ company_id: A }, { company_id: B }],
    });
    await expect(companyIdForAnyUser(c as any, USER)).rejects.toThrow(USER);
  });

  it("companyIdForAnyUser still throws when nothing matches", async () => {
    await expect(
      companyIdForAnyUser(stubClient({}) as any, USER),
    ).rejects.toThrow(/No company/i);
  });

  it("the same company named twice is not ambiguity", async () => {
    const c = stubClient({
      company_members: [{ company_id: A }],
      operators: [{ company_id: A }],
    });
    await expect(companyIdForAnyUser(c as any, USER)).resolves.toBe(A);
  });

  it("companyIdForUser refuses two memberships instead of picking one", async () => {
    const c = stubClient({
      company_members: [{ company_id: A }, { company_id: B }],
    });
    await expect(companyIdForUser(c as any, USER)).rejects.toThrow(USER);
  });

  it("companyIdForUser resolves a single membership", async () => {
    const c = stubClient({ company_members: [{ company_id: A }] });
    await expect(companyIdForUser(c as any, USER)).resolves.toBe(A);
  });
});
