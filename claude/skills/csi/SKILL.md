---
name: csi
disable-model-invocation: false
user-invocable: true

description: >
  Investigation methodology for "who/when/what changed?" questions about Datastore-backed entities at Clinicorp. Use whenever the user wants to audit the history of a row, find which user activated/edited/removed a flag, identify when a value changed, or diff an entity across time. Triggers: "who changed X", "who activated/added/removed Y", "when did Z become …", "audit history of …", "find the change in the database", "diff this entity over time", "look up who did X", "histórico de …", "quem alterou …", "quem ativou …", "validar inclusão no banco".
---

# CSI — Database history investigations

## How audit log entries are created

Every Datastore write at Clinicorp goes through `@clinicorp/dao` (`~/Projects/dao`), the shared database library. On every mutation (insert, update, delete), `dao` calls `insertAnaliticRecord`, which enqueues — or in non-production environments directly writes — the **full entity state** to BigQuery. The payload includes the complete entity JSON, the namespace, the kind, the acting user, and the operation type (`I`/`U`/`D`).

Because `dao` saves a full snapshot on every write rather than a delta, the audit log has no built-in diff — it only tells you what the entity *looked like* after each operation. To find *what changed* between two writes you must diff consecutive snapshots yourself. That is what the LAG query pattern below does.

## Mental model

Every Datastore mutation is captured in `clinicorp-solution.b_data_ds.audit_log`: one row per snapshot of an entity, including the `Operation_LastChanged_User` / `Operation_LastChanged_User_Id` fields that name the actor. To answer *"who/when/what changed?"*, **diff successive snapshots of one entity (or one Kind in one namespace) over a time window** using a `LAG` window function over the `Payload` JSON. The result is a per-snapshot human-readable diff (via the `jest-diff` UDF) plus the actor and timestamp.

The investigation always boils down to three required parameters plus a time window:

1. **Subscriber UID** — the tenant. The text before the first `.` in the namespace (e.g. `primalinea` for `primalinea.br.mg.belo_horizonte`).
2. **Kind** — the Datastore entity type (e.g. `Person`, `User`, `ConfigOptions`).
3. **Time window** — direct comparison on the partition column. Two shapes (see Pagination).

When the question targets a *specific* entity, an outer `WHERE JSON_VALUE(Payload, "$.id") = '…'` filters the diffs after the LAG; the canonical query keeps the LAG over the whole Kind in the namespace so the model can also do Kind-wide investigations without restructuring.

## Projects — production vs. development

Production data lives in **`clinicorp-solution`**. Despite the name, **`dev-clinicorp` is the development environment**, not the data sink for the `dev` repository — it holds non-production traffic and should never be used to answer questions about real customers. When in doubt, prefer `clinicorp-solution`. Sanity check: a "no rows" result for a known-active customer probably means you queried the wrong project, not that the customer didn't do anything.

## Cost model — capacity-based pricing

`prd-subscription` is on **capacity-based pricing (BigQuery Editions)** — flat-rate slot capacity, *not* on-demand bytes. Every other Clinicorp project (including `clinicorp-solution` and `dev-clinicorp`) is on-demand bytes. **Always run BigQuery jobs with `--project_id=prd-subscription` as the billing project**, even when the data lives in another project. Reference data via fully qualified names: ``clinicorp-solution.b_data_ds.audit_log``, ``clinicorp-solution.logs.external-api-usage``, etc.

The cost concern under capacity-based pricing is **slot-time and team queueing**, not bytes scanned. So:

- Always include the partition predicate (`Operation_LastChanged_TS >= …`) and the cluster predicates (`Kind = …`, `foundation.MATCHES_UID(Namespace, …)`).
- Push every filter inside the CTE that defines the `LAG` window so cluster pruning runs before the window function.
- Default to a tight time window. Widen monotonically only when the result is empty.

## Time-window pagination

Two forms; pick whichever fits the question:

**Relative ("recent"):** open-ended on the right, paginate by widening the duration.

```sql
AND Operation_LastChanged_TS >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 MONTH)
```

Pagination loop when empty:

1. `INTERVAL 3 MONTH` (default — most "this just started happening" questions land here).
2. `INTERVAL 12 MONTH`.
3. `INTERVAL 5 YEAR`.

**Specific ("around date X"):** when upstream context names a date — a chat transcript, a billing-cycle reference, a "started in April" complaint — bracket it directly:

```sql
AND Operation_LastChanged_TS BETWEEN TIMESTAMP('2026-02-01') AND TIMESTAMP('2026-04-01')
```

Both forms are direct comparisons on the partition column, so partition pruning works either way. Never run an unbounded scan — every partition gets touched.

## Discovering which Kind owns an attribute

When you know the field name (e.g. `Module_EXTERNAL_API`) but not which Datastore Kind carries it, run a small recent-partition scan to find out:

```sql
SELECT Kind, COUNT(*) AS n
FROM `clinicorp-solution.b_data_ds.audit_log`
WHERE Operation_LastChanged_TS >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND REGEXP_CONTAINS(Payload, r'<FIELD_NAME>')
GROUP BY Kind
ORDER BY n DESC
LIMIT 10;
```

Use the most populated Kind in the canonical query below.

## Canonical query

The full template lives in [`canonical-query.sql`](./canonical-query.sql) — read it before running. Substitute the two `DECLARE` defaults (`subscriber_uid`, `entity_kind`), pick the right time-window form (relative vs. specific — see above), and remember to keep attribute-level filters *outside* the CTE (see "Filter ordering").

## Anatomy

- **`cleanZRecords`** strips Datastore audit fields (`z_LastChange_Date`, `z_LastChange_UserId`, …) before diffing. They change on every save and would dominate the output otherwise.
- **`diff`** uses the `jest-diff` library compiled to `gs://cl-libs/jest-diff.js` to render an Original/Alteração human-readable diff string.
- **`LAG(Payload) OVER (PARTITION BY $.id ORDER BY InternnalInsert_TS)`** pairs each snapshot with its immediate predecessor. Partitioning by entity id keeps the LAG correct across many entities of the same Kind. Ordering by `InternnalInsert_TS` (monotonic) avoids `Operation_LastChanged_TS` clock-skew issues.
- **The CTE filter list** uses `Kind` + `MATCHES_UID(Namespace, …)` for cluster pruning, plus the partition predicate for time pruning. Together they define the slice the LAG operates on. The namespace filter is **correctness-critical**, not just a performance hint: entity IDs are unique within a namespace but not across namespaces — the same numeric ID can refer to different entities in different tenants. Without scoping to a single namespace first, the LAG pairs snapshots from different entities that happen to share an ID, silently producing wrong diffs.
- **Operation codes:** `U`=Update, `I`=Insert, `D`=Delete. Inserts have no predecessor so their `Diff` is `NULL`.
- **`foundation.MATCHES_UID(namespace, uid)`** matches the subscriber UID prefix in fully-qualified namespaces. Subscriber UIDs are unique and always come first in the namespace (e.g. `primalinea` in `primalinea.br.mg.belo_horizonte`).

## Filter ordering — important

**Never put attribute-level predicates inside the LAG CTE.** If you want only changes where some field flipped, or only one specific entity, filter on the result *outside* the CTE:

```sql
WITH base AS ( /* the canonical query above */ )
SELECT *
FROM base
WHERE REGEXP_CONTAINS(Diff, r'Module_EXTERNAL_API');
-- or, for a single-entity scope after a Kind-wide diff:
-- WHERE JSON_VALUE(TO_JSON_STRING(Payload), "$.id") = '…';
```

Filtering inside the CTE removes intermediate snapshots and breaks LAG semantics — you'd be diffing snapshot N against snapshot N-k, where k is however many filtered rows lie between them.

## Example — "Who activated the external API (`Module_EXTERNAL_API`) in `ConfigOptions`?"

This is the canonical pattern for "who flipped a flag to active?" Adapt `subscriber_uid`, the time window, the Kind, and the outer filter for any analogous question.

```sql
DECLARE subscriber_uid STRING DEFAULT 'almaodonto';

CREATE OR REPLACE TEMP FUNCTION
  diff(a JSON, b JSON)
  RETURNS STRING
  LANGUAGE js
  OPTIONS (library = ['gs://cl-libs/jest-diff.js']) AS r"""
    return jestDiff.diff(a, b, { aAnnotation: 'Original', bAnnotation: 'Alteração' });
""";

CREATE OR REPLACE TEMP FUNCTION
  cleanZRecords(p JSON)
  RETURNS JSON
  LANGUAGE js AS r"""
    if (!p) return null;
    return Object.keys(p)
      .filter((key) => !key.startsWith("z_"))
      .reduce((obj, key) => { obj[key] = p[key]; return obj; }, {});
""";

WITH logs AS (
  SELECT
    Payload,
    Operation,
    Operation_LastChanged_TS,
    Operation_LastChanged_User,
    Operation_LastChanged_User_Id,
    InternnalInsert_TS,
    LAG(Payload) OVER (
      PARTITION BY JSON_VALUE(Payload, "$.id")
      ORDER BY InternnalInsert_TS
    ) AS PreviousPayload
  FROM `clinicorp-solution.b_data_ds.audit_log`
  WHERE Kind = 'ConfigOptions'
    AND foundation.MATCHES_UID(Namespace, subscriber_uid)
    AND Operation_LastChanged_TS >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 MONTH)
)
SELECT
  Operation_LastChanged_User    AS UserName,
  Operation_LastChanged_User_Id AS UserId,
  FORMAT_TIMESTAMP('%d/%m/%Y %H:%M', InternnalInsert_TS, "America/Sao_Paulo") AS Timestamp,
  diff(
    cleanZRecords(PARSE_JSON(PreviousPayload)),
    cleanZRecords(PARSE_JSON(Payload))
  ) AS Diff
FROM logs
-- Keep only the snapshot where Module_EXTERNAL_API was set to "X".
-- Filtering on Payload (the result) rather than Diff alone gives a precise
-- "activation" signal: the field reached "X" in this exact operation.
WHERE JSON_VALUE(Payload, '$.Module_EXTERNAL_API') = 'X'
  AND (PreviousPayload IS NULL
    OR JSON_VALUE(PreviousPayload, '$.Module_EXTERNAL_API') != 'X')
ORDER BY InternnalInsert_TS;
```

**Why the outer filter is two conditions:**
- `JSON_VALUE(Payload, '$.Module_EXTERNAL_API') = 'X'` — the field is active in this snapshot.
- `PreviousPayload IS NULL OR … != 'X'` — it was not already active in the previous snapshot (i.e., this is the moment of activation, not a subsequent unrelated save).

Without the second condition you'd get every save that happened to preserve the flag, not just the one that turned it on.

## Reference

| Concern | Resource |
|---|---|
| Audit log table | `clinicorp-solution.b_data_ds.audit_log` (partitioned DAY on `Operation_LastChanged_TS`, clustered by `Namespace, Kind`) |
| Namespace UID match helper | `foundation.MATCHES_UID(namespace, uid)` |
| `jest-diff` UDF library | `gs://cl-libs/jest-diff.js` |
| Billing project (always) | `prd-subscription` (capacity-based pricing / BigQuery Editions) |
| External API usage (verify "did they actually use it?") | `clinicorp-solution.logs.external-api-usage` (partitioned MONTH on `publish_time`, clustered by `namespace`) |
