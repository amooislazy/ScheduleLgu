# Handoff: Gemini assignment-assist feature (SHIPPED)

Status: **implemented and shipping.** Student-only. The teacher portal that once
had a Gemini card has been removed from the app entirely.

Last updated 2026-10-11.

## What shipped

### Flow
```
ClassroomScreen (assignment card)
  └─ "Draft with Gemini" button  (no key → hint to Settings)
       └─ AiDraftScreen overlay
            PRE-FLIGHT: detectPhysicalSubmission(title, description,
                        material titles, attachment text)
              → match: PhysicalSubmitWarning (5s cooldown) before any request
                        "Proceed anyway" | "Go back"
            loading → editable draft preview
              banners: handwritten/physical warning | file-required hint
              actions: Regenerate · Copy · Download .docx
              FILE NAME field (prefills RollNo_Name_Title, editable)
              Submit… (confirm dialog) · Discard
```

### Decisions locked in (do not re-ask)

1. **Billing = user's own account.** Each user pastes their own Google AI Studio
   API key in Settings. No key ships in the build. Stored on-device only
   (`expo-secure-store` / Android Keystore), sent only to
   `generativelanguage.googleapis.com`.
2. **Student flow only.** The teacher portal was deleted (code, not just hidden).
3. **Submit step = copy/export + open Classroom, NOT API turn-in.** The Classroom
   API blocks modifications to coursework created by a different Developer
   Console project (`ProjectPermissionDenied`), so read-only scopes stay.
4. **DOCX only.** PDF was removed. The answer is written to a `.docx` on-device
   and handed to the Android share sheet under a user-chosen filename.
5. **Handwritten/physical submissions warn before drafting.** A pre-flight check
   shows a warning with a 5-second cooldown and hides the submit action; the
   draft is a reference only.

### Files

- `src/services/gemini/geminiClient.ts` — injectable fetch, 45 s timeout,
  `GeminiError` codes `NO_KEY | AUTH | QUOTA | BLOCKED | NETWORK | PARSE`.
  Never logs key or bodies.
- `src/services/gemini/geminiNormalizer.ts` — pure parse of `{ answer,
  requiredFormat, submissionMode }` with raw-text fallback.
- `src/services/gemini/physicalSubmission.ts` — pure `detectPhysicalSubmission()`
  over an array of texts; returns the matched phrase or null.
- `src/storage/geminiStorage.ts` — secure-store key IO
  (`@schedulelgu/gemini/api-key`).
- `src/components/PhysicalSubmitWarning.tsx` — overlay with a countdown button.
- `src/services/export/miniDocx.ts` — the in-house DOCX writer (the `docx` npm
  package is not Hermes-safe). Supports embedded fonts.
- `src/services/export/embeddedFonts.ts` + `fonts/*Base64.ts` — Agency FB
  (headings) and ADLaM Display (body), plus the ECMA-376 obfuscation in
  `obfuscateFont()`.
- `src/services/export/assignmentExport.ts` — `AssignmentExport`,
  `safeFileName`, `defaultFileName`, `docxParagraphs`, `buildDocx`, `exportDocx`.
- `src/screens/AiDraftScreen.tsx` — the overlay above.
- Tests: `geminiClient`, `geminiNormalizer`, `physicalSubmission`,
  `assignmentExport`.

### Gemini call
- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Header `x-goog-api-key: <user key>`; model const in `src/config.ts`.
- `responseMimeType: 'application/json'` + `responseSchema`:
  ```json
  { "answer": "string",
    "requiredFormat": "pdf" | "docx" | "none",
    "submissionMode": "digital" | "handwritten_or_physical" }
  ```

### DOCX output
- Title is set in Agency FB; `Name:` / `Roll No:` / `Section:` labels in Agency
  FB with values in ADLaM Display; the answer body in ADLaM Display.
- Name/Roll No/Section come from Setup (**Settings-adjacent `profile` step**);
  the Classroom account name is only a fallback.
- Fonts are embedded as `word/fonts/fontN.odttf` (obfuscated), declared in
  `word/fontTable.xml`, `word/settings.xml`, `[Content_Types].xml` and the
  relationships.

### Removed with the teacher portal
`teacherClient.ts`, `teacherService.ts`, `teacherFlow.test.ts`, `TeacherProvider`,
`getTeacherProvider`/`cachedTeacher`, the development teacher provider, the
`refreshService` teacher branch, `TeacherSelection`/`UserType`, and every
`teacher`/`department` selection branch. `expo-print` and the unused `docx`
package were dropped from `package.json`.

## Verification

```bash
npm run typecheck
npm test
npm run build:apk      # eas build -p android --profile preview
```

Manual pass: Setup collects Name/Roll No/Section → student timetable →
assignment → generate → edit → rename file → Download .docx → open the file and
confirm fonts/identity → handwritten-warning case (title/description/attachment)
→ copy+open path → no-key / bad-key / quota errors. Confirm no role picker and
no Gemini anywhere that is not the student flow.
