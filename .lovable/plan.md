

## Plan: Fix 10 Build Errors

### 1. `moltbook.ts` — `explicit` possibly undefined (1 error)

`Deno.env.get()` returns `string | undefined`, not `string | null`. The null check on line 32 doesn't narrow properly.

**Fix:** Change `if (explicit !== null)` to `if (explicit !== undefined)` (or just `if (explicit)`).

### 2. `engagement-pay/index.ts` — Type cast error (1 error)

Line 129: The `.single()` return type doesn't match `Record<string, unknown>` cast. Fix by adding an intermediate `unknown` cast: `(contentRow as unknown as Record<string, unknown>)`.

### 3. `moltbook-interact/index.ts` — Property access on `never` + client type mismatch (5 errors)

Lines 41-57: The `.maybeSingle()` calls return typed data that TS can't resolve, resulting in `never` types. Fix by casting `data` as `any` in each branch.

Line 158: The `supabaseAdmin` type doesn't match the function parameter. Fix by typing the parameter as `any` instead of `ReturnType<typeof createClient>`.

### 4. `MogUpload.tsx` — `maxDurationSeconds` not on all union members (3 errors)

Lines 155-158: `FILE_RULES[contentType]` is a union where `image` lacks `maxDurationSeconds`. Fix by narrowing with `'maxDurationSeconds' in rule` check instead of accessing the property directly.

### Summary of Changes

| File | Fix |
|------|-----|
| `_shared/moltbook.ts:32` | `!== null` → `!== undefined` |
| `engagement-pay/index.ts:129` | Add `unknown` intermediate cast |
| `moltbook-interact/index.ts:36` | Parameter type → `any` |
| `moltbook-interact/index.ts:42,47,52,57` | Cast `data` as `any` |
| `MogUpload.tsx:155-158` | Use `in` operator to narrow union |

