/**
 * Draft with AI — the guarantees that matter for announcements.
 *
 * The assistant may propose text; it may never publish. These checks read the
 * function source and the drawer so a future edit cannot quietly widen either.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FN = readFileSync(
  resolve(process.cwd(), 'supabase/functions/draft-release-note-ai/index.ts'),
  'utf8',
);
const DRAWER = readFileSync(
  resolve(process.cwd(), 'src/components/management/DraftWithAiDrawer.tsx'),
  'utf8',
);

describe('draft-release-note-ai edge function', () => {
  it('requires a signed-in caller', () => {
    expect(FN).toMatch(/Sign in required/);
    expect(FN).toMatch(/getClaims\(token\)/);
  });

  it('admits only management and the owner', () => {
    expect(FN).toMatch(/\.in\('role', \['management', 'owner'\]\)/);
    expect(FN).toMatch(/Only management and the owner can draft announcements/);
    expect(FN).toMatch(/\.limit\(1\)/);
  });

  it('never writes to release_notes itself', () => {
    expect(FN).not.toMatch(/from\('release_notes'\)/);
    expect(FN).not.toMatch(/\.insert\(/);
    expect(FN).not.toMatch(/\.update\(/);
  });

  it('uses the standing default model on the streaming responses endpoint', () => {
    expect(FN).toMatch(/openai\/gpt-6-astra/);
    expect(FN).toMatch(/v1\/responses/);
    expect(FN).toMatch(/stream: true/);
    // Reasoning model: an effort is required, and never 'none'/'minimal'.
    expect(FN).toMatch(/effort: 'low'/);
  });

  it('keeps the gateway key server-side', () => {
    expect(FN).toMatch(/Deno\.env\.get\('LOVABLE_API_KEY'\)/);
    expect(FN).not.toMatch(/VITE_/);
  });

  it('constrains the audience to staff roles and drops unknown ones', () => {
    expect(FN).toMatch(/allowedRoles = \['management', 'onboarding_staff', 'dispatcher', 'owner'\]/);
    expect(FN).not.toMatch(/'operator'/);
    expect(FN).not.toMatch(/'truck_owner'/);
  });

  it('only returns a link route the caller already knows', () => {
    expect(FN).toMatch(/screens\.some\(s => s\.route === route\)/);
  });

  it('carries the house writing rules into the prompt', () => {
    expect(FN).toMatch(/R&M Deposit/);
    expect(FN).toMatch(/BANNED_MONEY_WORDS/);
    expect(FN).toMatch(/Never invent a feature/);
  });
});

describe('Draft with AI drawer', () => {
  it('saves drafts as pending only — never approved or published', () => {
    expect(DRAWER).toMatch(/status: 'pending'/);
    expect(DRAWER).not.toMatch(/status: 'approved'/);
    expect(DRAWER).not.toMatch(/published_at/);
    expect(DRAWER).not.toMatch(/reviewed_by/);
  });

  it('does not send anything to staff', () => {
    expect(DRAWER).not.toMatch(/send-release-note/);
    expect(DRAWER).not.toMatch(/functions\.invoke\('send-/);
  });

  it('offers both the composer hand-off and the pending save', () => {
    expect(DRAWER).toMatch(/onLoadDraft/);
    expect(DRAWER).toMatch(/Save for approval/);
  });

  it('does not use a generic sparkle as the assistant mark', () => {
    expect(DRAWER).not.toMatch(/Sparkles/);
  });
});
