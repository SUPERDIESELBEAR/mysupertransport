# Auto-drafted announcements from each build

## The idea

Marcus never has to write a What's New announcement from scratch. Every time a change is built in Lovable, a **ready-made announcement is drafted automatically** and lands in his **Pending Your Approval** queue. He reads it, tweaks it if he wants, and clicks **Approve & Send** — or **Deny** / **Archive** if it shouldn't go out.

## How it works

Every build already ends with a dated, plain-language report (the files under `docs/passes/`). The new rule: when a build changes something **staff can see or use**, the build also writes one announcement draft into the release-notes queue with:

- A staff-facing title and body written in plain words (not developer language) — what changed, where to find it, how to use it.
- The right **type** (new feature / change / fix / reminder).
- A **"Take me there"** link to the exact screen.
- The right **audience** (management, onboarding, dispatch, owner — never drivers).
- Whether it should **need a "Got it"** and whether to **pin** it.

It arrives as **pending** — nothing is sent, no bell, no email — until Marcus approves it, exactly like a hand-written submission.

## What Marcus experiences

- He opens **Settings → What's New** and sees the draft waiting under **Pending Your Approval**, marked as auto-drafted with the build date.
- **Approve & Send** as-is, **edit the wording first**, **Deny** with a reason, or **Archive**.
- If he never opens it, nothing goes out. Silence means nothing is announced.

## What does NOT get a draft

- Internal/infrastructure changes staff never touch (security hardening, database plumbing, scheduled-job repairs). The build decides per change: if no staff member's day changes, no draft is written.
- Driver-facing portal changes are flagged in the draft so Marcus knows the audience before approving (audience still limited to staff roles — drivers never see What's New).

## Optional later addition (not in this plan)

An **"Improve wording"** button on any draft that rewrites the body in warmer, plainer language via Lovable AI. Adds a click for polish; not needed for v1 since the drafts are already written in plain language at build time.
