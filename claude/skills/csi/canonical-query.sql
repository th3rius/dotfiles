-- Canonical CSI query: snapshot-by-snapshot diff of a Datastore Kind in one
-- subscriber's namespace, over a time window, with the change actor named.
--
-- See ~/.claude/skills/csi/SKILL.md for the methodology, anatomy notes, and
-- the rule about where filters go (predicates *outside* the CTE, not inside).

-- REQUIRED ----------------------------------------------------------------
DECLARE subscriber_uid STRING DEFAULT 'almaodonto';   -- subscriber UID (text before the first '.' in the namespace)
DECLARE entity_kind    STRING DEFAULT 'Person';       -- Datastore Kind under investigation
-- -------------------------------------------------------------------------

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
    Kind,
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
  WHERE Kind = entity_kind
    AND foundation.MATCHES_UID(Namespace, subscriber_uid)
    AND Operation_LastChanged_TS >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 MONTH)
    -- For a specific date window, replace the line above with:
    -- AND Operation_LastChanged_TS BETWEEN TIMESTAMP('2026-02-01') AND TIMESTAMP('2026-04-01')
)
SELECT
  Kind,
  CASE Operation
    WHEN 'U' THEN 'Update'
    WHEN 'I' THEN 'Insert'
    WHEN 'D' THEN 'Delete'
  END AS Operation,
  Operation_LastChanged_User    AS UserName,
  Operation_LastChanged_User_Id AS UserId,
  FORMAT_TIMESTAMP('%d/%m/%Y %H:%M', InternnalInsert_TS, "America/Sao_Paulo") AS Timestamp,
  cleanZRecords(PARSE_JSON(Payload)) AS Payload,
  CASE Operation
    WHEN 'I' THEN NULL
    ELSE diff(
      cleanZRecords(PARSE_JSON(PreviousPayload)),
      cleanZRecords(PARSE_JSON(Payload))
    )
  END AS Diff
FROM logs
ORDER BY InternnalInsert_TS;
