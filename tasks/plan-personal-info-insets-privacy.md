# Plan: Personal details, dropdown dismissal, insets, and profile cleanup

## Goal

Update the personal details form to use a date of birth, dismiss selection menus on outside taps, make the shared top inset taller and match each screen's surface, place logout confirmation above navigation, and keep the profile page focused on account actions while moving consent receipt controls into Privacy.

## Tasks

1. Add an optional date-of-birth field to the profile API and database without deriving dates for existing age-only profiles. Update the personal details form and validation to enter `DD/MM/YYYY`; derive the existing age value from a newly entered date.
2. Make dropdown dismissal explicit for taps outside the option list and cover it with a focused component test.
3. Increase the shared top inset and select its background/status-bar style from the active screen surface, including the blue Support Center.
4. Simplify the profile page, move consent receipt/review/withdraw actions to Privacy, and render logout confirmation in a native modal above the bottom navigation.
5. Update focused tests and run `npm run test:unit`, `npm run test:ui`, `npm run test:api`, and `git diff --check`.

## Data compatibility

Existing profiles only contain an age, so no precise date of birth can be reconstructed. Their date-of-birth field will remain empty until the user supplies one; their existing age remains intact meanwhile.
