import { describe, expect, it } from "vitest";
import { readSource, sourceFiles } from "@/test/helpers/repoLiterals";

/**
 * NAV TARGET VALIDITY — does the destination this button sends me to exist?
 *
 * A `navigate('/management/drivers')` that no route matches does not throw and
 * does not warn. React Router falls through, the portal shrugs and renders its
 * default view, and the user lands on the overview wondering what they clicked.
 * Silent wrong-page is the worst failure mode we have: it looks like the app
 * working.
 *
 * The portals make this easy to get wrong because they are NOT path-routed.
 * Management is one route (`/management/*`) that reads `?view=` from the QUERY
 * STRING and ignores path segments entirely. So `/management/drivers` is a
 * plausible-looking URL that can never work — the working form is
 * `/management?view=drivers`.
 *
 * THIS GUARD IS EXPECTED TO BE RED. It ships with one real finding. Green is
 * reached by fixing the destination — never by allowlisting a finding.
 */

/** Real routes from src/App.tsx, `:param` and trailing `*` honoured. */
function appRoutes(): string[] {
  const src = readSource("src/App.tsx");
  return [...src.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((m) => m[1])
    // The catch-all `path="*"` renders NotFound. Counting it as a match would
    // make every broken destination "resolve" — to the 404 page.
    .filter((p) => p !== "*");
}

/** Portals mounted as `/x/*`, with what each one actually parses from the path. */
type PathParsing = readonly string[] | "none" | "operator-routes";

const PORTAL_PATH_SEGMENTS: Record<string, PathParsing> = {
  // DispatchPortal.tsx reads location.pathname for exactly these sections.
  dispatch: ["board", "loads", "facilities", "brokers", "parser-diagnostics", "rate-con-inbox"],
  // ManagementPortal.tsx reads ONLY searchParams `view`. No path segment is parsed.
  management: "none",
  // StaffPortal.tsx has no location.pathname read at all.
  staff: "none",
  operator: "operator-routes",
  owner: "operator-routes",
};

function operatorRouteSegments(): string[] {
  const src = readSource("src/lib/operatorRoutes.ts");
  const block = src.match(/VIEW_TO_ROUTE:\s*Record<OperatorView, string>\s*=\s*\{([^}]+)\}/);
  if (!block) return [];
  return [...block[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** A template hole or a :param — matches any single segment. */
function isWildcardSegment(seg: string): boolean {
  return seg.startsWith(":") || seg.includes("${");
}

type Target = { path: string; file: string; line: number; snippet: string };

const NAV_PATTERNS: readonly RegExp[] = [
  /navigate\(\s*[`'"](\/[^`'"]*)[`'"]/g,
  /\bto=\{?\s*[`'"](\/[^`'"]*)[`'"]/g,
];

function collectTargets(): Target[] {
  const out: Target[] = [];
  for (const file of sourceFiles()) {
    if (!/\.tsx?$/.test(file)) continue;
    const lines = readSource(file).split("\n");
    lines.forEach((text, i) => {
      if (text.trim().startsWith("//") || text.trim().startsWith("*")) return;
      for (const re of NAV_PATTERNS) {
        re.lastIndex = 0;
        for (const m of text.matchAll(re)) {
          out.push({ path: m[1], file, line: i + 1, snippet: text.trim().slice(0, 120) });
        }
      }
    });
  }
  return out;
}

type Verdict = { ok: boolean; why: string };

function resolve(rawPath: string, routes: string[]): Verdict {
  const path = rawPath.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  const segs = path.split("/").filter(Boolean);

  // Portal-mounted paths: the wildcard route always matches, so the real
  // question is whether the PORTAL parses the segment after its prefix.
  const portal = segs[0];
  if (portal && portal in PORTAL_PATH_SEGMENTS && routes.includes(`/${portal}/*`)) {
    const rest = segs.slice(1);
    if (rest.length === 0) return { ok: true, why: `matched /${portal}/*` };
    // /management/deactivate/:operatorId and friends are declared routes that
    // win over the wildcard — check the explicit route table first.
    // The portal's own wildcard is excluded here: it matches EVERYTHING under
    // the prefix, which is exactly the trap — /management/drivers "matches"
    // /management/* and still renders the wrong page.
    const explicit = routes.filter((r) => r !== `/${portal}/*`);
    if (matchesExplicit(segs, explicit)) return { ok: true, why: "matched an explicit route" };
    const parsed = PORTAL_PATH_SEGMENTS[portal];
    if (parsed === "none") {
      return {
        ok: false,
        why:
          `/${portal}/* is mounted, but ${portal === "management" ? "ManagementPortal" : "StaffPortal"} ` +
          `parses NO path segments — it reads only the query string. '/${segs.join("/")}' ` +
          `falls through to the default view.`,
      };
    }
    const allowed = parsed === "operator-routes" ? operatorRouteSegments() : parsed;
    if (allowed.includes(rest[0])) return { ok: true, why: `${portal} parses '${rest[0]}'` };
    return {
      ok: false,
      why:
        `/${portal}/* is mounted, but '${rest[0]}' is not a segment ${portal} parses. ` +
        `It parses: ${allowed.join(", ")}.`,
    };
  }

  if (matchesExplicit(segs, routes)) return { ok: true, why: "matched an explicit route" };
  return { ok: false, why: `no <Route path> in src/App.tsx matches '${path}'.` };
}

function matchesExplicit(segs: string[], routes: string[]): boolean {
  return routes.some((route) => {
    const rsegs = route.split("/").filter(Boolean);
    const wild = rsegs[rsegs.length - 1] === "*";
    const fixed = wild ? rsegs.slice(0, -1) : rsegs;
    if (wild ? segs.length < fixed.length : segs.length !== fixed.length) return false;
    return fixed.every(
      (r, i) => r === segs[i] || isWildcardSegment(r) || isWildcardSegment(segs[i]),
    );
  });
}

/**
 * ALLOWLIST — destinations that are legitimately unresolvable from source,
 * each with a WRITTEN REASON. Empty on purpose: at ship time every literal
 * destination either resolved or was the one real finding.
 */
const KNOWN_BAD_TARGET_ENTRIES: readonly { target: string; reason: string }[] = [];
const KNOWN_BAD_TARGET_MAX = 0;

/** THE FAILURE MESSAGE IS THE PRODUCT. */
function explain(t: Target, why: string): string {
  return [
    ``,
    `${t.file}:${t.line} sends the user to '${t.path}' — which does not resolve.`,
    `  ${t.snippet}`,
    ``,
    `What was searched:`,
    `  <Route path="…"> declarations in src/App.tsx  (:param and trailing * honoured)`,
    `  the path segments each portal actually parses from location.pathname`,
    `  Dispatch: board, loads, facilities, brokers, parser-diagnostics, rate-con-inbox`,
    `  Operator/Owner: the VIEW_TO_ROUTE table in src/lib/operatorRoutes.ts`,
    `  Management and Staff: nothing — they read ?view= from the query string`,
    ``,
    `Why it fails: ${why}`,
    ``,
    `Nothing throws when this happens. React Router matches the portal wildcard,`,
    `the portal finds no view it recognises and renders its default. The user`,
    `clicks a button and silently lands somewhere else.`,
    ``,
    `To make this pass, do ONE of these:`,
    `  1. FIX THE DESTINATION. For Management that usually means the query form:`,
    `     navigate('/management?view=drivers'), not '/management/drivers'.`,
    `  2. ADD THE ROUTE, if the path form is the one you want — declare it in`,
    `     src/App.tsx, or teach the portal to parse that segment.`,
    `  3. ALLOWLIST IT, WITH A REASON — only for a destination that genuinely`,
    `     cannot be resolved from source (an externally-owned URL, say). Add to`,
    `     KNOWN_BAD_TARGET_ENTRIES in src/test/nav-target.test.ts and raise`,
    `     KNOWN_BAD_TARGET_MAX by exactly one. A destination that is simply`,
    `     wrong does not qualify.`,
  ].join("\n");
}

describe("nav target validity — every destination exists", () => {
  it("every allowlist entry carries a written reason", () => {
    const bad = KNOWN_BAD_TARGET_ENTRIES.filter((e) => e.reason.trim().length < 20);
    expect(bad.map((e) => e.target)).toEqual([]);
    expect(KNOWN_BAD_TARGET_ENTRIES.length).toBeLessThanOrEqual(KNOWN_BAD_TARGET_MAX);
  });

  it("the route table and the portal segment tables were actually read", () => {
    expect(
      appRoutes().length,
      "No <Route path> was parsed out of src/App.tsx. This guard would then " +
        "report every destination as broken, or (worse) be trivially adjusted " +
        "to report none. Fix the parser.",
    ).toBeGreaterThan(20);
    expect(
      operatorRouteSegments().length,
      "VIEW_TO_ROUTE in src/lib/operatorRoutes.ts could not be parsed, so every " +
        "operator destination would be judged against an empty list.",
    ).toBeGreaterThan(10);
    expect(
      collectTargets().length,
      "No navigate()/<Link to> destinations were found at all — the scanner is " +
        "searching nothing and would report green having checked nothing.",
    ).toBeGreaterThan(20);
  });

  it("every literal navigate()/<Link to> destination resolves", () => {
    const routes = appRoutes();
    const allow = new Set(KNOWN_BAD_TARGET_ENTRIES.map((e) => e.target));
    const failures: string[] = [];
    const ids: string[] = [];

    for (const t of collectTargets()) {
      if (allow.has(t.path)) continue;
      const v = resolve(t.path, routes);
      if (v.ok) continue;
      const id = `${t.file}:${t.line} -> ${t.path}`;
      if (ids.includes(id)) continue;
      ids.push(id);
      failures.push(explain(t, v.why));
    }

    expect(
      ids,
      `${ids.length} navigation destination(s) do not resolve.\n` +
        `EXPECTED RED: this guard shipped on 2026-09-10 with 1 known finding ` +
        `(FleetRoster -> /management/drivers). Do not make it pass by allowlisting it.\n` +
        failures.join("\n" + "-".repeat(74) + "\n"),
    ).toEqual([]);
  });
});
