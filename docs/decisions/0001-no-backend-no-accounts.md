# 1. No backend and no accounts

**Status:** accepted · October 2026

## Context
The first idea had sign-up and accounts. Ease stores which profiles a person uses.
Profiles like "Seizure safe" or "Low stress" are close to health information.
Our team has 4 months and little backend experience.

## Decision
Ease has no server and no accounts. All settings live in `chrome.storage.local` on the user's computer.

## Why
- **Privacy.** We never hold health-related data, so it can not leak. No privacy law work for a server.
- **Trust.** "Nothing leaves your device" is easy to explain and easy to check.
- **Scope.** No login, password reset, database or hosting to build and run.
- **It still works offline.**

## Trade-offs
- Settings do not follow the user by default. → Chrome Sync switch, backup file (see decision 7).
- No usage data for the client. → Chrome Web Store numbers now, opt-in anonymous counts as future work.
- A caregiver can not change settings from another house. → future work, needs a real account system.
