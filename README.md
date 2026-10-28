# ScheduleLGU

Android app (Expo + React Native + TypeScript) that shows an LGU student's
timetable, maps each classroom to a Block/Floor, and fires local class
reminders. Offline-first: once a timetable is saved, nothing needs the network
except updating it.

> **UI work:** read [`DESIGN.md`](./DESIGN.md) first. It defines the "Quiet Glass"
> design language (tokens, glass material, icons, motion) that every screen follows.

## State of the build

| Area | Status |
| --- | --- |
| Data model, storage, comparison, time utils | done |
| Classroom -> Block/Floor mapping | done |
| Home / Schedule / Setup / Settings, theming, navigation | done |
| Local notifications (reminders + update notice) | done |
| Refresh on launch / foreground / manual | done |
| **LGU fetch + parser (student, free rooms)** | **done — see HANDOFF.md** |
| Google Classroom per-lecture courses, assignments, submission status | native flow implemented; Google Cloud Android OAuth setup required |
| Gemini assignment drafts (students, own API key) | done — key in Settings, drafts in-app only |
| Periodic background refresh | interface only (`backgroundRefresh`) |

Two data flows are live against the real site:
`lguClient` -> `lguParser` -> `lguNormalizer` handles the student portal, and
free-room availability lives in `freeRoomsService.ts`. `USE_DEVELOPMENT_PROVIDER`
in `src/config.ts` is `false`; it exists only as an emergency rollback switch — it
swaps both flows (student, free rooms) to development providers with mock data
tagged `source: 'development'` / rooms tagged `(development)`. No mock data is
ever presented as LGU data.

## Run

```bash
npm install
npx expo install --fix     # pins RN/Expo package versions to your SDK
npm run typecheck
npm test
npx expo start --android
```

`package.json` pins Expo SDK 51-era versions. If you are on a newer SDK, run
`npx expo install --fix` after install — it rewrites the native-module versions
to match. Notifications need a dev build (Expo Go dropped remote/edge cases on
Android); build one with:

```bash
npm run build:apk     # eas build -p android --profile preview
npm run build:aab     # production app bundle
```

Google Classroom sign-in uses Google's native Android sign-in SDK through
`@react-native-google-signin/google-signin`, without a browser redirect. Before
using it, complete this Google Cloud setup:

1. Enable the **Google Classroom API** in the same Cloud project as the OAuth
   consent screen.
2. Configure the consent screen. While its audience is **Testing**, add each
   account that will sign in under **Test users**.
3. Create an **Android OAuth client** with package
   `pk.edu.lgu.schedulelgu` and the SHA-1 certificate for the APK's signing key.
   Google matches both values; an unregistered SHA-1 commonly returns
   `DEVELOPER_ERROR` / status 10. No Web client ID or `google-services.json` is
   needed for this on-device native flow.
4. Register each signing certificate separately: local debug, local release if
   it uses another key, and the **Play App Signing** certificate for Play Store
   installs. Get local variant fingerprints with `cd android && gradlew
   signingReport` (Windows: `gradlew.bat signingReport`).

The current local debug certificate SHA-1 is
`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. The local
release build falls back to that debug key until an upload keystore is
configured, so it can use the same Android OAuth client. A Play-distributed
build is signed with the Play App Signing key and needs that key's SHA-1
registered too. The app requests read-only access to courses, coursework, and
the signed-in student's submissions. Google tokens remain managed by Play
Services and are not written to app storage. Use a native development or
release build; Expo Go cannot load the sign-in SDK.

To attach a course to a lecture, the app lists the courses the signed-in account
is already enrolled in and you pick one by name. This avoids the ambiguous
`404` that pasting a course link produces when the account is not a member: the
Classroom API reports "not a member" and "does not exist" identically. If a
course you expect is missing, make sure you are signed into the account that is
enrolled in it.

## Gemini assignment drafts (students)

Each assignment card has a **Draft with Gemini** action. It opens a draft, lets
the student edit it, then either copies it for pasting into Classroom or exports
a formatted **DOCX** and hands it to the Android share sheet under a filename the
student chooses (default `RollNo_Name_Title`).

- **Your key, your billing.** Paste a Google AI Studio API key in
  **Settings -> Gemini (AI)**. It is stored on-device with `expo-secure-store`
  (Android Keystore) and sent only to `generativelanguage.googleapis.com`.
  Nothing is baked into the build and there is no backend. Get a key at
  <https://aistudio.google.com/apikey>; usage is billed to your own Google
  account.
- **Your details print on the file.** Setup collects **Name**, **Roll No** and
  **Section**; those three fields (plus the assignment title) head every
  generated DOCX.
- **Drafts are not uploaded and not saved.** The answer lives in memory for the
  current session only. Turning work in stays a manual step in Classroom
  (Add/attach the generated file, then Turn in), because the Classroom API
  cannot turn in work created by a different developer project.
- **Handwritten work is flagged before you start.** A pre-flight check scans the
  assignment title, description and attached material for physical-submission
  wording ("hard copy", "handwritten", "hand in", …). When it matches, a warning
  with a 5-second cooldown is shown before the draft is requested, and the
  submit action is hidden — the draft is a reference only.
- **The DOCX embeds its fonts.** Headings use **Agency FB** and the body uses
  **ADLaM Display**, embedded into the file so it looks the same wherever it is
  opened. The document is written by our own `miniDocx` writer (the `docx` npm
  package is not Hermes-safe).
- **Teacher attachments are read.** A Doc, Slide deck or PDF the teacher attached
  is downloaded from Drive and sent to Gemini, so the draft follows the actual
  task. This needs the restricted `drive.readonly` scope, so the Drive API must
  be enabled in Google Cloud and users re-approve sign-in once. Files over
  ~10 MB are skipped; links and video links go to Gemini as names only.

The model id lives in `GEMINI_MODEL` (`src/config.ts`). Gemini is only reachable
from the student flow.

## Architecture

```
LGU HTML -> lguClient -> lguParser -> lguNormalizer -> Timetable
                                                          |
                                             timetableStorage (AsyncStorage)
                                                          |
                                     AppStore (React context) -> screens
                                                          |
                                             notificationService (OS-scheduled)
```

Rules the code holds to:

- No HTML parsing and no HTTP inside React components.
- No backend. Requests go straight from the device to LGU.
- `classroomLocation.ts` is the only file that knows room numbers. Screens
  receive `block`/`floor` already resolved, and render "Location unclear" when
  either is null. Nothing re-derives a location.
- A saved timetable is replaced only after a successful fetch **and** validation
  (`validateTimetable`). A network failure or an empty parse leaves stored data
  untouched.
- Change detection compares normalized records, never raw HTML, and is
  insensitive to ordering, whitespace and case.
- Lecture ids are a deterministic hash of the meaningful fields, so notification
  identifiers stay stable across fetches and cannot duplicate.

## Android background refresh

Android does not guarantee periodic JS execution. Doze, battery optimization and
OEM restrictions all defer or drop background work, so the app does not claim a
15-minute cadence. What actually runs:

- refresh on app launch (after local data is loaded)
- refresh when the app returns to the foreground, throttled by
  `MIN_AUTO_REFRESH_INTERVAL_MS`
- manual refresh in Settings
- reminders scheduled with the OS, which keep firing with the app closed

`backgroundRefresh` in `refreshService.ts` is the empty seam for a future
`expo-background-task` / WorkManager registration.

## Tests

```bash
npm test
```

Covers time parsing and class status, timetable comparison and id stability,
normalizer behaviour (including ambiguous and explicit-block rooms), the
classroom location cases, reminder plan building, storage round-trips and
validation, and the refresh service's data-safety rules.

Location tests assert current `classroomLocation.ts` behaviour; they are not to
be "fixed" by changing that file.
