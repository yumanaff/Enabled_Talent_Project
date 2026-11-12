# MediaPipe Face Landmarker

Used by Hands-free (handsfree/panel.js) to follow the head. It runs on this computer. Nothing is sent.

- `vision_bundle.mjs` and `wasm/vision_wasm_internal.*`: `@mediapipe/tasks-vision` 0.10.21 from npm (Apache-2.0).
  Only the SIMD build is kept (every Chrome that runs this extension has SIMD). The source-map line was removed.
- `face_landmarker.task`: Google's Face Landmarker model, float16, version 1 (Apache-2.0).
  sha256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.

Do not load these from a CDN: extension pages may only run code that is inside the extension.
