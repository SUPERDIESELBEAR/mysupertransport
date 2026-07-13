
## Goal

Replace the current keyword-search Staff Help page with a conversational AI assistant that answers "how do I use SUPERDRIVE" questions for staff, grounded in FAQs but able to answer general SUPERDRIVE usage questions too. FAQ Manager remains the authoring surface.

## Behavior

- Chat UI on the Staff Help page. Fresh conversation each visit (no persistence).
- Assistant priorities in order:
  1. Answer from retrieved staff-audience FAQ articles when relevant.
  2. Otherwise answer from general SUPERDRIVE product knowledge (dashboard layout, roles, onboarding stages, pipeline, driver app, compliance, PEI, equipment, MO plates, messaging).
  3. When it uses an FAQ, cite the source(s) as chips under the answer.
  4. When it can't answer, say so plainly and suggest opening FAQ Manager to add the article — no draft button.
- Suggested starter prompts (e.g. "How do I revert an application?", "How do I add a new driver?", "Where do I edit pipeline stages?", "How do I send a PEI request?").
- Streamed markdown responses, typing indicator, friendly error handling for 429/402/network.

## Changes

1. **`src/components/management/StaffHelpPortal.tsx`** — rebuild as a chat surface using AI Elements (`conversation`, `message`, `prompt-input`, `shimmer`, `tool` not needed). Uses `useChat` + `DefaultChatTransport` against the new edge function. Renders assistant markdown and a small "Sources" row of FAQ chips that deep-link to FAQ Manager.

2. **`supabase/functions/staff-help-chat/index.ts`** (new):
   - CORS + OPTIONS handler.
   - Auth: validate JWT via `getClaims`, require a staff role (`admin`, `manager`, `owner`, `staff`) via `user_roles` with `.limit(1)`.
   - Retrieval: call the existing `search_staff_faqs` RPC with the latest user message, take top ~8 hits, and pack them into the system prompt as titled snippets with their ids.
   - Model: Lovable AI Gateway, `google/gemini-3-flash-preview`, via `streamText` from `npm:ai` using the shared `../_shared/ai-gateway.ts` helper.
   - System prompt: assistant is the SUPERDRIVE staff guide; prefer FAQ context when relevant; may answer general SUPERDRIVE how-to using product knowledge; be concise, use step lists for procedures; when nothing fits, say it isn't documented and suggest FAQ Manager; cite `[[FAQ:<id>]]` inline for anything drawn from FAQ context.
   - Response: `toUIMessageStreamResponse()` including a data part `{ sources: [{ id, question }] }` so the client can render source chips.
   - 429/402 handled with structured errors.

3. **AI Elements install** — add `conversation`, `message`, `prompt-input`, `shimmer` if not already present.

## Out of scope

- Persisting chat history or threads.
- Drafting new FAQs from chat.
- Answering on operational data (drivers, applications) — usage guidance only.

## Technical notes

- No schema changes. Reuses `faq` and `search_staff_faqs`.
- `LOVABLE_API_KEY` already provisioned.
- Client transport hits `${VITE_SUPABASE_URL}/functions/v1/staff-help-chat` with the publishable-key `Authorization` header, same pattern as other chat surfaces.
- Source chips deep-link to `/staff/faq?faqId=<id>` (already supported by FAQ Manager) to open the article.
