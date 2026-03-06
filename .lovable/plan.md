

## Plan: Fix `get-stream` and `mog-feed` Runtime Errors

### Analysis

From the logs and code:

1. **`get-stream/index.ts`** has two issues:
   - Uses deprecated `esm.sh` import (`https://esm.sh/@supabase/supabase-js@2`) instead of the standard `npm:` specifier. Per your project convention, all edge functions must use `npm:@supabase/supabase-js@2`.
   - CORS headers are incomplete -- missing `x-supabase-client-platform`, `x-supabase-client-platform-version`, `x-supabase-client-runtime`, `x-supabase-client-runtime-version`. This can cause preflight failures from the Supabase JS client.

2. **`mog-feed/index.ts`** appears already fixed (logs show clean boots, code uses `npm:` and has full CORS headers). The error timestamp is older and likely stale.

### Changes

**File: `supabase/functions/get-stream/index.ts`**

1. Change line 1 import from `esm.sh` to `npm:`:
   ```typescript
   import { createClient } from "npm:@supabase/supabase-js@2";
   ```

2. Update CORS headers (line 4-5) to include the full set:
   ```typescript
   const corsHeaders = {
     "Access-Control-Allow-Origin": "*",
     "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
   };
   ```

3. Redeploy the `get-stream` edge function.

No other files need changes.

