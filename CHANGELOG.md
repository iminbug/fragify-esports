# Changelog

## Unreleased

### Added
- Google Sign-In for team captains — replaces typing a Team ID + password for self-registered teams. Verified server-side with Node's built-in `crypto` (no new npm dependencies): [lib/google-verify.js](lib/google-verify.js), [lib/session.js](lib/session.js), [api/auth.js](api/auth.js).
- Centralized **My Teams** dashboard ([api/dashboard.js](api/dashboard.js)): once signed in, a captain sees every team they've registered across all matches, with payment/approval/check-in status and the WhatsApp community invite surfaced automatically — no more relying on an admin to manually forward it.
- `lib/matches.js`: reverse index (`user:{email}:regs`) so a captain's registrations can be looked up by Google account across matches.

### Changed
- `api/register.js` now requires a signed-in Google session; registrations store the captain's email/name/picture instead of relying solely on a generated password.
- `api/payment.js`, `api/room.js`, `api/checkin.js` now authenticate via `resolveTeam()` ([lib/team-auth.js](lib/team-auth.js)) — Google session is checked first, with the legacy Team ID + password flow kept only as a fallback for teams an admin added manually (no Google account on file).
- Nav bar, success modal, and room/payment gate copy updated to point teams at the new dashboard; password is no longer shown after registration.
- `styles.css`: added `.auth` and `.dash-card` components styled to match the existing theme.

### Setup required
- Set `GOOGLE_CLIENT_ID` and `SESSION_SECRET` environment variables on Vercel.
- Google Cloud Console OAuth client must list the production domain(s) under Authorized JavaScript origins.
