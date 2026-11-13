# 11. Hands-free: head and voice, and no buying

**Status:** accepted · November 2026

## Context
Some people can not hold a phone or use a mouse (paralysis, strong tremor, ALS, arthritis, after a stroke).
A caregiver can put a laptop on a stand once. After that, the person should be able to watch YouTube,
scroll Instagram or read a website alone.

Phones already have this (Android Voice Access, iPhone Voice Control, Switch Control and Eye Tracking).
An extension can not control a phone, so Ease does this on a laptop or desktop with Chrome.

## Decision
- **Both head and voice.** The user moves a big pointer with the head, and talks to Ease.
- **The camera works in Chrome's side panel** (`handsfree/panel.html`). MediaPipe Face Landmarker follows
  the face on the computer. The pointer comes from the head turn: the nose against the outer corners of the eyes,
  divided by the eye distance (so it works near or far). The first look is the middle. "Center" resets it.
  Small shakes are smoothed.
- **The files are inside the extension** (`lib/mediapipe/`, about 14 MB). Extension pages may not run code from the web.
  The model is Google's official `face_landmarker.task` (Apache-2.0).
- **Chrome can not ask for the camera in a side panel.** A helper opens `grant.html` once, in a normal tab, and presses Allow.
- **Three ways to click:** hold still (default, 1.5 s), open the mouth, or raise the eyebrows. Gestures must last 0.3 s,
  so talking or blinking does not click. While the mouth is open (a gesture, or talking), the pointer stays still.
- **Look at the top or bottom edge to scroll.** After 0.7 s the page starts to scroll very slowly, then speeds up gently
  over 2 s (Pointer speed sets the top speed). Small head moves near the middle do not move the pointer.
- **Tabs opened before Ease was loaded** have no Ease (or a broken old copy). The panel asks the page first.
  If there is no answer, it turns the old copy off and adds Ease again (`scripting` permission). The panel says which
  website it works on, and says so when a page can not be used (Chrome pages, the Web Store).
- **The panel shows problems.** Camera errors and voice errors (no microphone, no speech service) are shown, not hidden.
- **Mouth click that lands where you looked.** The pointer stops as soon as the mouth STARTS to open, and goes back
  to where it was 0.2 s before (opening the mouth moves the nose). Hold it open 0.25 s: the ring fills, then one click.
  The click also takes the nearest button within a few pixels. While talking, the pointer stays still too.
- **Looking down counts more than looking up** (the screen is below the eyes, so a nod down is small). A small nod
  reaches the bottom scroll area, which is also taller than the top one.
- **Tabs and websites.** A "Tabs" button and the voice ("open YouTube", "go to cbc.ca", "next tab", "close tab", "tabs")
  show big buttons for the open tabs and for a few websites (YouTube, Google, CBC News, Instagram, Facebook, Gmail,
  Wikipedia, Weather). If the site is already open, Ease goes to that tab. The last tab is never closed.
- **Write (a voice keyboard).** Typing with the head is too slow, so the "Type" button or "write" opens a big box.
  Everything the user says goes into it, in their own language (Hindi, French...). Words show while they are spoken.
  Then big buttons (or English words): Search the web, Search this site, Go to this website, Put it in the box,
  Delete last word, Clear. It never presses Send. Text that looks like a card number is never typed.
- **Typing in a box on a website** (like Instagram's username): holding still on the box opens Write for that box.
  The help stays on screen. It starts with what is already in the box, so a wrong username is easy to fix
  ("Empty the box on the page", "Clear", "Delete"). "Put it in the box" puts exactly what is shown.
- **Spell mode** for usernames, emails and codes: one letter or number at a time ("d", "h", "underscore", "one",
  "capital j", also "alpha, bravo"), joined with no spaces. It is on by itself for username, email and phone boxes.
  It listens in English (letter names). "delete" removes one letter.
- **Emails in Spell mode.** Common ways to say an email, and common mistakes of speech engines, are fixed first:
  "at the rate" and "at sign" = @, "g mail" / "gee mail" = gmail, "hot mail", "dot com" = .com, "under score",
  "full stop" = dot, "double 7" = 77, "oh" between numbers = 0. "@" then "gmail" (no ending said) = "@gmail.com".
  Quick add buttons (@, ., _, -, .com, .ca, @gmail.com, @yahoo.com, @outlook.com, @hotmail.com, @icloud.com) work
  when the voice still gets it wrong. Tested with 24 ways of saying usernames and emails.
- **Big boxes scroll by looking.** If the Write box is taller than a small screen, looking at the bottom edge scrolls the box.
- **Ease does not type passwords.** Saying a password out loud is not safe (people nearby, and Chrome's speech service).
  A helper signs in once, and Chrome remembers the password.
- **Sticky buttons.** Over a button, a head move moves the pointer less (a third on Ease's big buttons, half on the page),
  so it is easy to stay on Up, Down, Play and the others. It blends back when it leaves the button.
- **The camera picture is hidden at first.** Some people do not want to see their face. One button right above
  the camera box says "Show my picture" / "Hide my picture" (not hidden in Settings, so nobody has to search for it).
  The video still plays (hidden), so the head is still followed.
- **Easy to find.** Home has a big Hands-free button that opens the panel, and shows "On" when it is on.
  The website has its own Hands-free section, with a tour that plays the real hands-free code on the demo website.
- **More money words are blocked:** shop, shop now, order, deals, bid, claim offer (found in the website tour).
- **Stop means stop.** "Stop hands-free" in the panel, closing the panel, the switch in My Settings, and
  "Reset to default" all turn Hands-free off everywhere: camera and voice in the panel, and on every page the pointer,
  hold-to-click (also with a mouse or touchpad) and the big buttons. The background watches the panel, so closing it counts.
- **Big buttons on the side:** Up, Down, Play / Pause, Next, Back, Tabs, Type, Rest. "Next" knows YouTube's Next button,
  and scrolls one whole screen on Shorts, Reels and TikTok.
- **Voice:** "scroll down", "next video", "pause", "click Subscribe", "show numbers" then "click 5", "search cooking",
  "type hello", "read this", "bigger text", "go back", "rest", "wake up", "help".
  "Click X" uses the same button finder as Show me how.
- **The same page module works with a real mouse** or a head mouse that moves the real cursor: hold still to click.
- **No buying.** Buy, pay, checkout, add to cart, upgrade, donate, membership, prices on buttons, and card fields
  are blocked. The user sees "Buying is turned off in hands-free mode" and is told to ask their helper.
  (Decided with the team: we skip buying by gesture or voice completely.)
- **Ask first:** send, delete, post, share, reply, sign in, subscribe and submit show a big YES / NO. YES can be held or said.

## Why
- A laptop on a stand plus a webcam is cheap. No extra hardware.
- Holding still is the easiest click to learn. Gestures help people who can not hold their head still.
- A person who can not use their hands can not stop a wrong payment. Blocking money is simple to test and explain.

## Trade-offs
- Laptop or desktop only. On phones, we point people to Voice Access (Android) or Voice Control (iPhone).
- Needs a webcam, good light, and the face in view.
- Voice commands are English words for now. Chrome turns speech into text on the device when it can;
  otherwise it uses Google's speech service. The panel says which one.
- The side panel takes some space on the right of the window.
- Pages inside other frames (like a video embedded from another site) can not get the pointer.
- Instagram works on the website only. The Instagram app is outside Chrome.
