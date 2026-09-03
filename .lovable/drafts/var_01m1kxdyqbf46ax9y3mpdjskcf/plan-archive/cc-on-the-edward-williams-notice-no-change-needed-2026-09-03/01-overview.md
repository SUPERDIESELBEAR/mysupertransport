# CC on the Edward Williams notice: no change needed

## What happened

The CC field showed **Marcus Mueller** because the owner address is attached to every deactivation notice automatically. Your own address was also in the To field for that send.

Before the message goes out, any CC address that already appears in To is dropped, so the same person is never addressed twice. That applied to the auto-added owner chip — you. The message therefore went to one recipient in To and had no CC, exactly as the send record shows.

Had the To field held Tracey's address instead, that chip would have produced a real CC to you.

## Decision

Leave the CC field as it is. The chip is a *before* view of the field; the confirmation line after sending now names the actual recipients, which is the *after* view.

No code change, no migration, no further work in this area.
