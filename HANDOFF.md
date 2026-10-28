# Handoff: the live LGU integration

The real LGU fetch + parser is implemented and shipping
(`USE_DEVELOPMENT_PROVIDER = false` in `src/config.ts`). This note documents
where each piece lives so maintenance starts from an accurate picture.

Target: https://timetable.lgu.edu.pk/Semesters/Semester_pannel.php

## Flows

| Flow | Files |
| --- | --- |
| Student portal (semester -> program -> section -> timetable) | `lguClient.ts` -> `lguParser.ts` -> `lguNormalizer.ts` -> `lguService.ts` |
| Free rooms (day -> room grid) | `freeRoomsService.ts` (reuses `lguClient` + `lguParser`) |

Both go through a single lookup point that picks the live or development
implementation from `USE_DEVELOPMENT_PROVIDER`: `src/services/timetable/index.ts`
for the student flow (`getTimetableProvider()`), and `getFreeRoomsAccess()` in
`freeRoomsService.ts` for free rooms. Screens only ever call these getters;
nothing else knows which implementation is behind them. The development
free-rooms data is defined in `freeRoomsService.ts` (rooms tagged
`(development)`) so the module needs no import from `developmentProvider.ts`.

The teacher portal was removed entirely; the app is student-only.

## Per-file responsibilities

- `lguClient.ts` — HTTP only. Mints its own PHPSESSID and replays cookies because
  `fetch` on Android does not persist them. Verified request order and field
  names are captured from DevTools against the live site. Debug logging is gated
  by `LGU_DEBUG_LOGGING` (`__DEV__` only), response bodies are never logged.
- `lguParser.ts` — the only file with LGU DOM knowledge. Reads `<select>`s and
  the timetable table by column name, throws `LguParseError` on unexpected
  markup. Fixtures under `src/__tests__/fixtures/lgu/` are the only mock HTML.
- `lguNormalizer.ts` — maps day names, normalizes to `HH:mm`, resolves Block/Floor
  once per row, assigns deterministic ids, drops untrustworthy rows. Already
  unit-tested; no parser bug should be fixed here.
- `freeRoomsService.ts` — same boundaries for the free-room portal.

## When something LGU-related breaks

1. Check the fixtures still parse (`npm test`) — a site change shows up as a
   parser/normalizer test failure before it breaks a real fetch.
2. Re-capture the site with DevTools -> Network -> "Copy as cURL" and diff the
   request order/field names against `lguClient.ts`.
3. If the HTML structure changed, update `lguParser.ts`, not the normalizer.
4. If the rollback switch is ever needed, set
   `USE_DEVELOPMENT_PROVIDER = true` and the app switches to mock data tagged
   `source: 'development'` with no screen changes.