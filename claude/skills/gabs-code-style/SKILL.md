---
name: gabs-code-style
description: Use when writing or modifying JavaScript/TypeScript code for Gabriel — new modules, packages, functions, or tests. In an existing repo whose conventions conflict, the surrounding code wins.
---

# Gabriel's Code Style

## Overview

Small, plain, modern ESM JavaScript. Types live at the boundary; prose appears only where code can't speak for itself. Platform built-ins over dependencies; tiny universal deps over Node-only ones.

## Layout

- Code under `src/`; one exported function per file, file named after it: `src/fantomid.js` → `export function fantomid()`
- `src/index.js` (inside `src/`, not the repo root) is a thin re-export — named export internally, default export at the package boundary:
  ```js
  import { fantomid } from "./fantomid.js";
  export default fantomid;
  ```
- Tests colocated as `src/<name>.spec.js`
- Types hand-written in `src/index.d.ts` (implementation stays plain JS), with a JSDoc usage example using the `//=>` result convention:
  ```js
  fantomid(); //=> 8209108814378532
  ```

## Code

- Prettier defaults: **double quotes**, semicolons, trailing commas
- Name a constant (`SCREAMING_SNAKE`, module top) only when the value repeats or the name carries meaning the expression can't; a single-use value stays inline with a why comment at the expression
- Lean idioms when the coercion is provably safe: `!xs.length` over `xs.length === 0` (length is a non-negative int); `parseInt(x)` without the radix (ES5+ defaults to 10 except `0x` prefixes)
- Never mix async/await with `.then`/`.catch` — prefer async/await; a fire-early-await-late promise gets an async IIFE with `try`/`catch`, not a `.catch()` bolted on
- Comments in English, always — including repos whose product language is pt-BR
- Comments explain **why**, never what, and sit at the exact expression they justify — even mid-expression:
  ```js
  const timestamp = Math.round(
    // Use a more recent base date instead of the Unix Epoch to
    // increase the amount of time we can represent in the timestamp.
    (Date.now() - EPOCH) /
      // Decrease the precision of the timestamp to
      // increase the amount of bits we can fit in a key.
      TIMESTAMP_PRECISION_DIVIDER,
  );
  ```
- No JSDoc on implementations — docs and types belong in the `.d.ts`

## Tests

- `node:test` built-ins only. Mock dependencies with `mock.module`, time with `mock.timers.enable({ now })` — never monkey-patch globals
- Deterministic, exact-value assertions; one precise expectation beats six statistical checks:
  ```js
  import { test, mock, before, it } from "node:test";
  import assert from "assert/strict";

  test("fantomid", () => {
    let randomMock = mock.fn();
    let fantomid;

    before(async () => {
      mock.module("@lukeed/csprng", { namedExports: { random: randomMock } });
      ({ fantomid } = await import("./fantomid.js"));
    });

    it("should generate an id", () => {
      randomMock.mock.mockImplementationOnce(() =>
        Buffer.from([0xa2, 0xd2, 0xff]),
      );
      mock.timers.enable({ now: new Date("2025-11-24T19:13:45.994Z") });
      const id = fantomid();
      assert.equal(id, 8209108814378532);
    });
  });
  ```
- `it("should ...")` phrasing

## TypeScript apps (NestJS-style)

- An import that would go up a folder (`../`) uses the `@/*` alias instead, pointed at the module index (`@/core`, `@/auth`), not deep files; sibling imports stay relative (`./types`). Circular type-only imports are fine — tsc elides them from the emit.
- Each module gets a `types.ts` for its enums and domain types; shared type utilities live in the core module (e.g. `type Data<T> = T & Record<string, unknown>` for loose-schema rows)
- A field that usually holds enum values but may carry others is `SomeEnum | string` — the enum members survive the union, so autocompletion for the known values is kept while the rest stays assignable
- Logic migrated from another codebase is justified on its own terms — never comment it as "parity with <old home>" or "the original did X"; state what the behavior needs and why
- The comment rules extend to infra files (workflows, Dockerfiles): why-only, one line at the exact spot, no header narration blocks

## Dependencies

- Reach for platform built-ins first; when a dep is justified, prefer tiny universal (isomorphic) packages — e.g. `@lukeed/csprng` over `node:crypto` when the code should run anywhere

## README

- Lead with a one-sentence description, then a usage snippet with a `//=>` result
- Explain the mechanism briefly; an ASCII diagram earns its place when it shows structure

## Common mistakes

| Default habit | Gabriel's style |
|---|---|
| Single quotes | Double quotes (Prettier defaults) |
| WHAT-explaining JSDoc on the implementation | Types + docs in `.d.ts`; only WHY comments inline |
| Logic in a flat `index.js` | Logic in a named file under `src/`; index only re-exports |
| Statistical/probabilistic tests | Mock time and randomness, assert exact values |
| Monkey-patching `Date.now` | `mock.timers.enable({ now })` |
| `xs.length === 0` | `!xs.length` — length is never negative |
| `parseInt(x, 10)` | `parseInt(x)` — ES5+ defaults to base 10 |
| Naming every literal (`QUERY_LIMIT = 300`) | Inline single-use values, why comment alongside |
| `import { X } from "../core/types"` | `import { X } from "@/core"` (alias + module index) |
| "Parity with the old implementation" comments | Justify migrated behavior on its own terms |
| `.catch()` chained in async/await code | async IIFE + `try`/`catch` — never mix the styles |
