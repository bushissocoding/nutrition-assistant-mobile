# Spec: Onboarding and Health Profile — V1

## Objective

Let a first-time user move from launch and welcome through consent and a complete demo health assessment, and let returning users edit that profile. Login, registration, and password recovery are interactive previews because the API has no identity service.

Success means all form fields and transitions work, invalid values are explained, and no password is stored or sent to the API.

## Tech Stack

Expo SDK 58, React Native, JavaScript, the existing AppShell, `expo-secure-store` profile/consent storage, and the existing Jest / Node test suites.

## Commands

- `npm run test:unit`
- `npm run test:ui -- --runTestsByPath app/src/features/onboarding/AuthScreen.test.js app/src/features/onboarding/ProfileSetupScreen.test.js app/src/app/AppShell.test.js`
- `npm run test:api`
- `npx expo export --platform android`

## Project Structure

- `app/src/features/onboarding/` owns launch, welcome, account preview, consent, and assessment screens/tests.
- `app/src/features/profile/` owns profile validation/model behavior.
- `app/src/app/AppShell.js` owns cross-screen transitions and saved profile state.
- `app/src/services/profile-storage.js` owns local profile and consent storage.

## Code Style

Keep validation at the form boundary and make each navigation step explicit:

```js
if (!isValidEmail(email.trim())) {
  setError('Nhập địa chỉ email hợp lệ.');
  return;
}
onModeChange?.('sent');
```

Use feature-local components, accessible labels/states, existing theme tokens, and concise Vietnamese user copy consistent with neighboring screens.

## Testing Strategy

Use adjacent React Native Testing Library tests for account and assessment interactions; use the existing `node:test` model tests for profile normalization and validation. AppShell tests cover consent/profile transitions and persistence failures. All three repository-required suites run before handoff.

## Boundaries

- **Always:** validate email, username, password confirmation, assessment ranges, and allergy count; keep consent versioned and profile local; keep password fields transient; show an explicit demo boundary.
- **Ask first:** none for this work; the user delegated approval for decisions needed to complete the requested scope.
- **Never:** claim account creation, login, password reset, identity, or medical diagnosis is real; persist passwords; send form contents to the API.

## Success Criteria

- Splash completes into welcome; welcome opens login, registration, and demo entry.
- Login and registration expose the requested fields and reject invalid input; valid submission reports that identity is not connected.
- Password recovery selects email or SMS, validates the recipient, and reaches an honest confirmation without sending a message.
- Assessment collects gender, weight, height, age, one condition, and multiple allergy exclusions; save/edit uses the existing profile validation and SecureStore behavior.
- Users can back out, retry storage errors, and review or withdraw consent through existing lifecycle flows.

## Out of Scope (Deferred)

- Server identity, real account sessions, real password reset messages, and account-linked profile storage; the API does not provide these controls.
- Clinical screening or medical recommendations; the prototype is non-clinical.

## Open Questions

None. Authentication and recovery remain explicit previews per the existing architecture and user-granted scope.
