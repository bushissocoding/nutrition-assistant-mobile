# Task List: Mobile Navigation, Chat Inbox, and Top Spacing

## Task 1: Point the final tab at reports

**Description:** Replace the appointments tab with the existing weekly report dashboard while keeping appointment access through the existing appointment entry points.

**Acceptance criteria:**
- [x] The fourth bottom tab is labelled “Báo cáo” and routes to `dashboard`.
- [x] Selecting it renders the report dashboard and marks that tab selected.
- [x] The appointments route remains available from existing app flows.

**Verification:** [x] `npm run test:ui -- --runTestsByPath app/src/app/AppShell.test.js`.

**Dependencies:** None.

**Files likely touched:** `app/src/navigation/routes.js`, `app/src/app/AppShell.js`, `app/src/app/AppShell.test.js`.

**Estimated scope:** Small.

## Task 2: Add a recent-conversations inbox

**Description:** Make the chat tab show a list containing the ViCi assistant and eligible doctor conversations with their latest message previews. Open the existing conversation screen only after selecting a row.

**Acceptance criteria:**
- [x] The inbox keeps all four main tabs visible.
- [x] ViCi appears with its most recent assistant/user message preview, or an empty conversation hint.
- [x] Confirmed/completed appointment conversations appear with the provider name and latest message preview; ineligible appointments do not appear.
- [x] Selecting ViCi or a provider opens the existing conversation UI and hides the main tabs.
- [x] Back from a conversation returns to the inbox; opening chat from appointments returns to the appointment view.
- [x] Partial load failures do not hide successfully loaded conversations and expose a retry action.

**Verification:** [x] Focused AppShell, ChatScreen and ChatInboxScreen UI tests: 14/14 passed.

**Dependencies:** Task 1.

**Files likely touched:** `app/src/features/chat/ChatInboxScreen.js`, `app/src/features/chat/ChatInboxScreen.test.js`, `app/src/features/chat/ChatScreen.js`, `app/src/app/AppShell.js`, `app/src/app/AppShell.test.js`.

**Estimated scope:** Medium.

### Checkpoint after Tasks 1–2

- [x] Focused navigation/chat tests pass.
- [x] Existing assistant consent and appointment chat eligibility remain unchanged.

## Task 3: Lower top controls consistently

**Description:** Add one shared top inset around page content for onboarding and signed-in screens, and remove the existing profile setup-only offset so its controls align with other pages.

**Acceptance criteria:**
- [x] All page routes render inside the same top-inset frame.
- [x] Top controls and content below them move down together.
- [x] The bottom tab bar remains anchored in its current safe-area position and does not overlap shifted content.
- [x] Profile setup does not receive duplicate top spacing.

**Verification:** Focused AppShell/ProfileSetup UI tests: 11/11 passed; full `npm run test:ui`: 23 suites, 115 tests passed.

**Dependencies:** Tasks 1–2.

**Files likely touched:** `app/src/app/AppShell.js`, `app/src/app/AppShell.test.js`, `app/src/features/onboarding/ProfileSetupScreen.js`, `app/src/features/onboarding/ProfileSetupScreen.test.js`.

**Estimated scope:** Medium.

## Task 4: Run acceptance checks and review

**Description:** Run the required repository checks and inspect branch status/diff for scope and whitespace issues.

**Acceptance criteria:**
- [x] `npm run test:unit` passes (321 tests).
- [x] `npm run test:ui` passes (23 suites, 115 tests).
- [x] `npm run test:api` passes.
- [x] `git diff --check` passes.
- [x] Existing unrelated plan files and earlier uncommitted changes remain intact.

**Dependencies:** Tasks 1–3.

**Files likely touched:** None expected.

**Estimated scope:** Small.
