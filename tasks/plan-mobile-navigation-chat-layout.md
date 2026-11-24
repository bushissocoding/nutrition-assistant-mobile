# Implementation Plan: Mobile Navigation, Chat Inbox, and Top Spacing

## Overview

Update the primary navigation so its last tab opens the existing weekly report dashboard, make the chat tab open a recent-conversations inbox, and give page content consistent clearance below the device status area. Keep the existing appointment and chat APIs and preserve the current consent and appointment eligibility rules.

## Architecture Decisions

- Keep `AppShell` as the owner of route selection and return navigation.
- Keep the existing `dashboard` route and `DashboardScreen` for the report tab.
- Keep `ChatScreen` as the selected conversation view. Add an inbox screen inside the existing chat feature that composes account-scoped assistant history and eligible appointment messages.
- Show the four main tabs in the chat inbox. Hide them while an assistant or doctor conversation is open; returning from a conversation restores its prior screen.
- Add a shared app-shell content inset so every screen moves down consistently while the bottom navigation remains anchored in its safe-area position. Remove the profile setup screen's old one-off top offset to avoid double spacing.
- Do not add API endpoints, dependencies, or a new navigation library.

## Dependency Graph

```text
Existing route and dashboard
        └── report tab mapping ──┐
                                ├── AppShell route/selection state
Existing assistant + care APIs ─┘        └── chat inbox → selected ChatScreen
Global app shell ── shared top inset → every screen/header
```

## Task List

1. Point the final main tab at the report dashboard.
2. Add the recent-conversations inbox and selected-conversation navigation.
3. Apply consistent top clearance across all app screens.
4. Run required checks and review the diff.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Chat data may be unavailable for one source | Load assistant and appointment data independently; keep available rows visible and provide retry feedback. |
| Cancelled or expired appointments must not expose chat | Only request/show conversations for confirmed or completed appointments, matching current server rules. |
| Top inset could duplicate onboarding spacing or cover bottom controls | Remove the profile-specific offset, test app-shell frame spacing, and keep the tab bar outside the inset frame. |
| Existing plans in `tasks/plan.md` and `tasks/todo.md` have open checkboxes | Keep those files untouched; this work uses separate plan/checklist files. |

## Open Questions

None. The user requested implementation and selected a separate task plan.
