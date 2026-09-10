# Cropping in the Inspection Binder — yes it exists, and it's looking in the wrong drawer

Cropping and rotating a photo inside the Inspection Binder is a real, built feature. The pencil icon opens a crop/rotate editor that saves the trimmed image back over the original. So the answer to your question is yes — but for Delease Carter's Periodic DOT Inspection it can't reach the file, which is why you got "Could not load this document for editing."

## What is actually wrong

Every binder document is remembered by two things: which storage area it sits in, and the path to it inside that area. Delease's inspection photo is genuinely stored, and the viewer opens it fine — the viewer follows the saved link.

The editor doesn't follow the link. It re-derives the location from the saved path, and for this document that derivation is wrong twice over:

- The saved path begins with `fleet-documents/`, so the editor decides the file lives in the fleet area. It actually lives in the inspection area.
- It then also keeps that `fleet-documents/` word as part of the file name inside the area, so even the right area wouldn't find it.

The file is fetched, nothing comes back, the editor shows its yellow warning. Nothing is lost or corrupted.

This is not one bad row. Checked live: 87 binder documents carry that misleading prefix — 78 of them really live in the inspection area and 9 in the operator area. Every one of those will fail the same way when someone clicks the pencil. Delease also has this same inspection recorded twice, seconds apart, from the same original upload.
