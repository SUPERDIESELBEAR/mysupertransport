
## Goals

Turn Staff Help from a single-shot Q&A into a persistent chatbot with follow-up suggestions and precise in-app navigation, and upgrade FAQ Manager with analytics, inline authoring from chat, richer editing, and better organization.

## Recommendations (my picks for the "what would you suggest?" answers)

- **Chat history: persistent with a thread sidebar (ChatGPT-style).** 24h auto-expire feels arbitrary and staff routinely revisit "how did I fix that last week?" Session-only loses context every reload. Persistent threads scoped per staff user, with rename/delete/pin and a "New chat" button, is the standard and lowest-friction choice.
- **Deep links: one-click navigate + auto-expand target section + brief highlight.** Half the value of this tool is skipping the click-hunt. When the bot says "open Stage 3 ICA for this driver," clicking should land on that exact card already expanded, with a 2-second gold ring around it. We already have the routing patterns (`?tab=`, `?binder=open`) — we extend them into a small `?focus=<help-entry-id>` protocol.
- **Follow-ups: AI-generated after each answer, with curated fallbacks per help entry.** The AI ones stay contextual to the actual conversation (not just the topic); curated ones guarantee something useful shows even if the model returns none. Rendered as 2–3 clickable chips under each assistant message.

## Staff Help chatbot changes

**Persistent threads (new tables + UI)**
- New tables: `staff_help_threads` (id, user_id, title, pinned, created_at, updated_at) and `staff_help_messages` (id, thread_id, role, content, sources jsonb, follow_ups text[], created_at). RLS: user reads/writes own threads only; owner/management can read all for analytics.
- Left rail on `StaffHelpPortal`: thread list grouped Today / Yesterday / Last 7 days / Older, "+ New chat" button, hover-to-rename, delete confirm, pin toggle. Collapsible on small screens.
- URL routing: `/dashboard?view=help&thread=<id>`. Reload restores the thread; switching threads remounts the chat window keyed by thread id so messages never bleed.
- Auto-title new threads from the first user message (short model call, ~5 words).
- Textarea stays focused on load, after send, after stream, and after thread switch.

**Follow-up suggestions**
- Edge function returns `{ answer, sources, followUps: string[] }` — model prompted to produce 2–3 short next-question chips after each answer, based on the full thread.
- If model returns none, fall back to `related_questions` on any matched help-index entry (new field we add to entries).
- Chips render under the assistant message; clicking sends that text as the next user message.

**"Take me there" navigation**
- Extend the existing `[go:ENTRY_ID]` protocol. Each `HelpEntry` in `src/lib/staffHelp/help-index.ts` gains optional `focusTarget: { param?: string, sectionId?: string, highlight?: boolean }`.
- Clicking a `[go:...]` link navigates with `?focus=<entry-id>` (plus any driver/thread context already in scope).
- New `useFocusTarget()` hook on landing pages reads `?focus`, looks up the entry, auto-expands the matching accordion/tab, scrolls into view, and applies a 2-second `ring-2 ring-gold` pulse. `?focus` is cleared from the URL after firing so a page refresh doesn't re-trigger.
- Seed focus targets for the top ~40 help entries (pipeline stages, driver hub sections, PEI queue, equipment, MO plates, fleet compliance, notifications, ICA amendments, etc.). Remaining entries still deep-link to the page.

**Response quality**
- Send the full thread history (not just the last user message) on every call — required for coherent multi-turn help.
- Expand `PRODUCT_OVERVIEW` to cover recent additions (Demo Accounts, Mobile Preview QR, PEI auto-cadence, OSAS, decal photo delete, notification rollups, PWA install reminders).
- Model stays `google/gemini-3.6-flash` (default). Keep JWT auth + staff role check as-is.

## FAQ Manager changes (all four priorities you selected)

**1. Analytics — see what staff ask & gaps**
- New table `staff_help_query_log` (id, user_id, thread_id, query, matched_faq_ids uuid[], matched_help_entry_ids text[], answered_from enum('faq','index','overview','none'), created_at). Written from the edge function on every question.
- New "Analytics" tab in FAQ Manager showing: top queries this week, top queries that hit "no documentation yet", most-clicked FAQs, click-through per FAQ (%), coverage gap heatmap by category, and a 30-day trend chart.
- Owner/management only; RLS enforces.

**2. Inline authoring from chat**
- When the bot answers with "I don't have documentation for this yet," owner/management users see a **Create FAQ from this question** button under the message.
- Opens the FAQ editor drawer pre-filled with `question = user's original prompt`, `category` guessed from conversation, and the assistant's draft as a starting-point answer they can edit and publish.
- Same button appears on any "no doc yet" row in Analytics for backfilling.

**3. Richer editing**
- Extend `faq` table with `steps jsonb` (array of `{ text, imageUrl?, deepLink? }`), `screenshots text[]`, `related_questions text[]`, `related_faq_ids uuid[]`.
- FAQ editor gains: step-by-step builder (drag to reorder, add screenshot per step, attach a `go:` deep-link from the help index via a picker), screenshot uploader (new `faq-assets` storage bucket), and a "Related questions" chip editor.
- FAQ viewer renders steps numbered with inline images and deep-link buttons that use the same `?focus=` navigation as the chatbot.
- The AI now cites these richer FAQs verbatim (steps + deep-links).

**4. Better organization**
- FAQ list: category grouping with counts, tag chips, multi-select filters, full-text search (Postgres `tsvector` on question + answer + tags), bulk publish/unpublish/delete/reassign-category.
- Reorderable categories with a saved sort index; drag-and-drop reorder inside each category.
- "Needs review" flag surfaced when the underlying feature changes (manual toggle on FAQ + a nudge on Analytics).

## Data model summary

New tables: `staff_help_threads`, `staff_help_messages`, `staff_help_query_log`.
New storage bucket: `faq-assets` (private, staff read/write).
`faq` gains: `steps`, `screenshots`, `related_questions`, `related_faq_ids`, `tags`, `sort_order`, `needs_review`, `search_vector`.
`help_index` entries gain (in-code): `focusTarget`, `relatedQuestions`.

All new tables include `GRANT`s per the public-schema-grants rule; RLS scopes threads/messages/logs to the owning user, opens analytics to owner/management via `has_role`.

## Rollout order

1. Threads + persistence + follow-up chips (biggest UX win, unlocks the rest).
2. `?focus=` navigation + focus targets on top help entries.
3. FAQ schema extension + richer editor + `faq-assets` bucket.
4. Query logging + Analytics tab.
5. Inline "Create FAQ from this question" authoring.
6. Organization polish (search, tags, drag-reorder, needs-review).

Each step ships independently and the chatbot keeps working throughout.
