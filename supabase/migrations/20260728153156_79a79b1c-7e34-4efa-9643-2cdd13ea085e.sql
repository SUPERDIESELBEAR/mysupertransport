
ALTER TABLE public.service_resources
  ADD COLUMN IF NOT EXISTS is_reference_only boolean NOT NULL DEFAULT false;

-- Reformat Step-by-Step guide
UPDATE public.service_resources
SET
  body = $body$
<h3>Before you start</h3>
<p>Every MS Fleet transaction needs a fresh <strong>6-digit one-time PIN</strong> from the MS Fleet app. The PIN is only good for <strong>4 minutes</strong>, so generate it at the counter — not out in the truck.</p>

<h3>Step-by-step</h3>
<ol>
  <li><strong>Go inside</strong> to the fuel desk. Do <strong>not</strong> use the pump keypad.</li>
  <li>Have two things ready: your <strong>phone open to the MS Fleet app</strong>, and your <strong>MS Fleet card</strong> in your other hand.</li>
  <li>Hand the card to the cashier when they're ready. They'll swipe it.</li>
  <li>The cashier will ask for your <strong>"Driver ID."</strong> That's the <strong>one-time PIN</strong> from the app.</li>
  <li>In the MS Fleet app, tap the <strong>lock icon</strong> at the bottom of the screen.</li>
  <li>A <strong>6-digit PIN</strong> appears. Read it to the cashier right away (it expires in 4 minutes).</li>
  <li>If asked, give your <strong>truck number</strong>.</li>
  <li>The cashier may ask for other info to fill their screen — you don't need to track it.</li>
  <li><strong>Watch the pump.</strong> Confirm it turns on after the card is authorized <em>before</em> you start pumping.</li>
</ol>

<h3>If the card is declined</h3>
<p>Stop — do not pump. If the card wasn't accepted and you pump anyway, you could be stuck paying out of pocket for a full tank. Contact dispatch before trying another card.</p>
$body$,
  is_reference_only = true,
  is_start_here = false,
  updated_at = now()
WHERE id = '12d83863-bff1-426e-9c82-94c8d45d3a21';

-- Reformat FAQ / Quick Answers
UPDATE public.service_resources
SET
  body = $body$
<h3>Do I need a new PIN every time?</h3>
<p>Yes. A one-time PIN is required for every MS Fleet transaction.</p>

<h3>How long is the PIN good for?</h3>
<p>4 minutes. If it expires, tap the lock icon in the MS Fleet app again for a new one.</p>

<h3>Can I use the card at the pump?</h3>
<p>No. Always go inside to the fuel desk.</p>

<h3>What if the cashier asks for a "Driver ID"?</h3>
<p>They mean the 6-digit one-time PIN from the MS Fleet app.</p>

<h3>What if the card is declined?</h3>
<p>Stop — do not pump. Contact dispatch before trying another card.</p>

<h3>What info do I need to give besides the PIN?</h3>
<p>Just your truck number. The cashier may ask for other fields to fill their screen; you don't need to track those.</p>
$body$,
  is_reference_only = true,
  is_start_here = false,
  updated_at = now()
WHERE id = 'e979ba99-009d-47ce-9f94-5893bf5f8cd4';

-- Clear any existing completions so nothing shows crossed out
DELETE FROM public.service_resource_completions
WHERE resource_id IN (
  '12d83863-bff1-426e-9c82-94c8d45d3a21',
  'e979ba99-009d-47ce-9f94-5893bf5f8cd4'
);
