# Implementation Plan: Dropdowns, Personal Details, and Return Navigation

## Overview

Replace the home and report selectors' bottom sheets with compact, scrollable dropdowns; add a view/edit personal details page from the profile menu; make the shared top inset white; and preserve the correct return destination for appointment schedules.

## Decisions

- Anchor dropdowns to their trigger buttons, show up to five rows at a time, and scroll longer lists.
- Use only profile fields supported by the current account API. Name and age can be edited here; email and phone are shown as account details and stay read-only in this screen.
- Keep the existing app shell as the owner of profile persistence and appointment return routes.
- Use the surface token for the shared top inset and status area.

## Task List

1. Replace the shared option sheet with an accessible anchored dropdown and connect Home and Dashboard selectors.
2. Add the personal details view/edit flow with cancel and save actions, and persist through the existing profile API.
3. Set the common top area to white and correct appointment-list back behavior based on its entry route.
4. Run focused tests, all repository-required checks, and review the diff.

## Acceptance Criteria

- Home month, report date, and report nutrient controls open a dropdown below/near their trigger.
- Dropdowns show no more than five options without scrolling and allow scrolling for longer lists.
- Profile title shows the user's display name; “Thông tin cá nhân” opens a dedicated details page.
- Update enables supported fields; cancel discards the draft; save persists it and returns to view mode.
- The common top inset is white across app screens.
- The appointment list returns Home when opened from Home and returns to the provider booking screen when opened from that flow.

## Verification

- Focused UI tests for the dropdown, profile details, app shell navigation, and appointment screen.
- `npm run test:unit`, `npm run test:ui`, `npm run test:api`, and `git diff --check`.
