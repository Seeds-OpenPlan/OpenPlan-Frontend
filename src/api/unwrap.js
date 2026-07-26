/*
  Shared helper for list-shaped API responses.

  Why this exists: client.js's response interceptor unwraps the `{data, meta}`
  envelope and hands callers `response.data.data` directly. For a real backend
  list endpoint, that unwrapped value IS the array. But our mock fixtures were
  written before the real contract was known and return an object keyed by
  resource name instead (e.g. `{ tasks: [...] }`, `{ projects: [...] }`). Every
  `getXxx` list function in the *Api.js modules was written against the mock
  shape (`r?.projects ?? []`), so pointed at a real server it silently reads
  undefined and renders an empty list — no error, just missing data (this bug
  already surfaced once in projectApi and is the reason this helper exists).

  `unwrapList` makes both shapes safe without touching either source: if the
  response is already an array (real server), use it as-is; otherwise (mock
  fixture object) pull the named key. Non-destructive — no caller behavior
  changes for the mock path.
*/
export const unwrapList = (response, key) =>
  Array.isArray(response) ? response : (response?.[key] ?? [])
