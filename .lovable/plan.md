

## Fix Memory Limit Crash in Insurance Email

### Problem
The `send-insurance-request` edge function crashes with "Memory limit exceeded" when trying to Base64-encode the driver's license image. The current approach builds a huge intermediate string character-by-character (`String.fromCharCode` in a loop), which uses roughly 3× the file size in memory — exceeding the edge function's ~150MB limit for large photos.

### Solution
Replace the manual Base64 loop with Deno's built-in standard library encoder, which operates directly on the `Uint8Array` without creating an intermediate string.

### Change

**`supabase/functions/send-insurance-request/index.ts`**

1. **Add import** at top of file:
   ```typescript
   import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
   ```

2. **Replace lines 260–264** (the manual loop + btoa) with:
   ```typescript
   dlBase64 = base64Encode(bytes);
   ```

This eliminates the intermediate string entirely — the `base64Encode` function converts `Uint8Array` directly to a Base64 string using native Deno APIs, using a fraction of the memory.

### Files
| File | Change |
|------|--------|
| `supabase/functions/send-insurance-request/index.ts` | Add std lib import, replace manual Base64 loop with `base64Encode(bytes)` |

