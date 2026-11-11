# 4. Settings in layers

**Status:** accepted · October 2026

## Context
Users mix profiles ("Older adults" + "Steady hands"), change things by hand, want some websites to be
different, and have bad days. We also need to explain *why* a setting is on.

## Decision
Effective settings = defaults → profiles (stronger value wins) → the user's own changes →
this website's changes → today's extras (Low-energy day, mood check-in, Calm Mode).
Profiles are never copied into the user's settings. They are combined every time.

## Why
- Turning a profile off cleanly removes its settings. Nothing is left behind.
- "Undo my own changes" keeps profiles, language and the caregiver lock.
- The "For me" view can show where each setting came from, and "Only here" for one website.
- Low-energy day ends at midnight by itself, because it is a date, not a switch.

## Trade-offs
- Every read combines 5 layers. It is fast (a few objects), but the logic must be documented
  ([settings-format.md](../settings-format.md)).
