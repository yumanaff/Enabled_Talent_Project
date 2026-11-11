# 7. Caregivers without accounts

**Status:** accepted · October 2026

## Context
Many users are set up by someone else: a daughter for her mother, a support worker for a client.
Caregivers asked for accounts. Accounts would break decision 1.

## Decision
Three small features instead of accounts:
1. **Set up for someone else.** The caregiver answers the quiz for the other person. Ease saves a setup file.
   On the other computer: "I have a setup file". The caregiver's own settings do not change.
2. **PIN lock.** My Settings and This Site ask for a 4-digit PIN. Home still works.
   We save a salted SHA-256 hash (Web Crypto), never the PIN.
3. **Chrome Sync switch.** Settings follow the person to their other computers through their own Google account.

## Why
- Covers about 90% of caregiver needs with no server and no personal data held by us.
- Each part is small, easy to test and easy to explain.

## Trade-offs
- The PIN is a "child lock", not security: anyone can remove the extension.
- Changing settings remotely is not possible. → future work.
- Chrome Sync has size limits (about 8 KB per item). Very large website lists may not sync.
