# Spec: Notifications and Settings — V1

## Objective

Make sample notifications readable and markable as read, and let users navigate the settings, privacy/consent, account-preview and help screens without implying a push service or server-backed account.

## Tech Stack

Expo SDK 58, React Native, JavaScript, AppShell state, existing consent/profile lifecycle, and existing sample notification/settings screens.

## Commands

- `npm run test:unit`
- `npm run test:ui -- --runTestsByPath app/src/features/notifications/NotificationsScreen.test.js app/src/features/settings/SettingsScreen.test.js app/src/app/AppShell.test.js`
- `npm run test:api`
- `npx expo export --platform android`

## Project Structure

- `app/src/features/notifications/` owns sample notification grouping/filter/read state.
- `app/src/features/settings/` owns settings subviews and privacy/help navigation.
- `app/src/app/AppShell.js` owns cross-screen navigation and consent/profile deletion sequence.
- `app/src/services/profile-storage.js` and `purge-before-local-delete.cjs` own local data lifecycle.

## Code Style

Keep state updates immutable and route actions explicit:

```js
updateItems(items => items.map(item => ({ ...item, unread: false })));
onNavigate?.(item.route);
```

Use accessible controls and live-region feedback; do not introduce a new persistence layer for sample notices or device-only preferences.

## Testing Strategy

Use UI tests for notification filters, individual/all read actions, navigation, settings subviews, and password recovery handoff. Keep lifecycle tests for failed API purge and local-delete ordering. The three repository-required suites remain handoff gates.

## Boundaries

- **Always:** mark sample content as demo; keep notification state device-session-only; purge remote demo diary/grocery namespaces successfully before clearing related local state; preserve retry paths on purge failure.
- **Ask first:** none for this work; the user delegated approval for decisions needed to complete the requested scope.
- **Never:** imply push notifications, account security, or cloud preference storage exists; discard local profile/consent after a failed required purge.

## Success Criteria

- Notification list groups sample items, filters unread items, marks a selected item read on open, and marks all read on request.
- Settings navigation covers all existing subviews and has working back paths, consent review/withdrawal, help, and account recovery preview.
- User data deletion follows purge-before-local-delete; on failure, local profile/consent remain and retry is available.

## Out of Scope (Deferred)

- Push delivery, scheduled reminders, server-backed settings, and authenticated account management; no corresponding service exists.

## Open Questions

None. Existing lifecycle and demo boundaries are explicit.
