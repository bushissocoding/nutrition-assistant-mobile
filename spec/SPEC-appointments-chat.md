# Spec: Appointments and Chat — V1

## Objective

Support provider browsing, booking review, appointment list/cancel, assistant chat, and an appointment-gated doctor chat as coherent app flows. Provider, booking, and payment data remain synthetic previews local to the current app session.

## Tech Stack

Expo SDK 58, React Native, JavaScript, AppShell route state, and existing local assistant/provider screen data. No scheduling, messaging, or payment backend exists.

## Commands

- `npm run test:unit`
- `npm run test:ui -- --runTestsByPath app/src/features/appointments/AppointmentScreen.test.js app/src/features/chat/ChatScreen.test.js app/src/app/AppShell.test.js`
- `npm run test:api`
- `npx expo export --platform android`

## Project Structure

- `app/src/features/appointments/` owns provider search/filter/detail, schedule, payment preview, and appointment list/cancel screens.
- `app/src/features/chat/` owns FAQ assistant and provider conversation preview.
- `app/src/app/AppShell.js` owns the current demo appointment and chat contact navigation state.
- `app/src/navigation/routes.js` owns route keys and tab metadata.

## Code Style

Keep preview creation explicit and local:

```js
const preview = { doctor: doctor.name, date: selectedDate, time: selectedTime };
onRequestCreate?.(preview);
setPage('success');
```

Label state as a preview wherever it could be mistaken for a real-world action; preserve reversible back navigation and accessible selection state.

## Testing Strategy

Use UI tests for discovery filters, profile-to-schedule transitions, patient/symptom form, payment selection, confirmation, list/cancel, assistant responses, and provider-chat access before/after creating or removing a booking preview.

## Boundaries

- **Always:** identify provider data and fees as synthetic; keep payment methods as non-sensitive choices only; keep booking and messages in memory; require a booking preview before opening its provider chat.
- **Ask first:** none for this work; the user delegated approval for decisions needed to complete the requested scope.
- **Never:** claim a provider is verified, send an appointment or chat message, store card details, charge money, or claim a demo request is a confirmed appointment.

## Success Criteria

- Users can search, sort, filter, favorite, and open a synthetic provider profile.
- Booking preview captures selected date/time, demo patient name, and optional preliminary symptoms; payment selection and confirmation clearly say no transaction occurred.
- View appointments shows the current demo request and can remove it with a reason; empty/cancelled states remain honest.
- Virtual assistant works from its chat screen.
- Doctor chat is unavailable before a matching appointment preview exists and becomes available only for that provider; removing the preview removes access.
- Chat input/output is clearly labeled non-delivering and remains in the current session.

## Out of Scope (Deferred)

- Real provider directory, appointment inventory, telehealth, remote chat, payment processing, and cancellation delivery; these need identity and provider services.

## Open Questions

None. The existing architecture requires all provider, chat, and payment functionality to remain demonstrative.
