/*
  Violation copy catalog (V1~V7) — SKELETON ONLY this cycle.

  Ownership: the actual user-facing strings are authored in story ST-F1-05, not
  here. This file fixes the key structure so downstream code can reference stable
  identifiers, but every value is intentionally empty until ST-F1-05 fills them.

  IMPORTANT — single-source rule (P4 grep audit): keep SYSTEM-state copy
  (SYS-01~07) out of this file. Those live in systemMessages.js. Mixing the two
  would break the P4 grep single-source guarantee (story §9.2 G-copy).
*/
export const violationMessages = {
  V1: '',
  V2: '',
  V3: '',
  V4: '',
  V5: '',
  V6: '',
  V7: '',
}

export default violationMessages
