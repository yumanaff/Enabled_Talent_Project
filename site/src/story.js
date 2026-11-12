// The 3D story at the top of the page (Three.js).
// A noisy web page comes apart into its layers while you scroll, like a video.
// The dock buttons turn layers off. At the end, a calm page comes forward.
//
// "Calm this site" or the computer's "reduce motion" setting: no animation at all.
// Then we draw one still picture of the calm page.
//
// The page works without this file: all text and buttons are plain HTML.
// When the 3D is ready, we add class "story-on" to <html>, and the scroll story starts.
//
// This is the SOURCE. The page loads story.js, one bundled file (Three.js inside), so it also works
// when index.html is opened straight from a file. After a change, run:  npm run build  (in site/)
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

async function main() {

  const stage = document.querySelector(".story-stage");
  const canvas = document.getElementById("scene");
  const story = document.getElementById("story");
  const steps = [...document.querySelectorAll(".step")];
  const dock = document.getElementById("dock");
  const tagsBox = document.getElementById("tags");
  const bar = document.getElementById("progress");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (error) {
    document.documentElement.classList.add("no-webgl"); // the text still tells the story
    return;
  }

  await Promise.all([document.fonts.load("700 40px Atkinson"), document.fonts.load("400 30px Atkinson")]).catch(() => {});

  // ---------- Scene ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  }
  const key = new THREE.DirectionalLight(0xfff3e0, 2);
  key.position.set(-5, 8, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.45));

  function canvasTexture(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    draw(g, w, h, 0);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.redraw = (time) => {
      draw(g, w, h, time);
      texture.needsUpdate = true;
    };
    return texture;
  }
  function box(g, x, y, w, h, r, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fill();
  }
  function browserTop(g, w) {
    box(g, 0, 0, w, 64, 0, "#E4E0D5");
    ["#d77", "#dc7", "#7c7"].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(36 + i * 30, 32, 10, 0, 7);
      g.fill();
    });
    box(g, 140, 16, 640, 32, 16, "#fff");
  }

  const page = new THREE.Group();
  scene.add(page);
  const W = 6.4;
  const H = 4.2;

  function layer(w, h, texture, depth, edge) {
    const group = new THREE.Group();
    const slab = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, 0.08, 4, 0.06),
      new THREE.MeshPhysicalMaterial({ color: edge, roughness: 0.4, clearcoat: 0.5, transparent: true })
    );
    slab.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
    face.position.z = 0.045;
    group.add(slab, face);
    group.userData = { depth, slab, face, texture, fade: 1 };
    page.add(group);
    return group;
  }

  const base = layer(W, H, canvasTexture(1280, 840, (g, w, h) => {
    box(g, 0, 0, w, h, 24, "#FBFBF6");
    browserTop(g, w);
    g.fillStyle = "#1F1D1A";
    g.font = "700 46px Atkinson";
    g.fillText("Your benefits may change", 60, 150);
    g.fillStyle = "#9a9a9a";
    g.font = "400 15px Arial";
    const line = "Eligibility is determined based on adjusted net family income as reported on the income tax and benefit returns of both spouses.";
    for (let i = 0; i < 26; i++) {
      g.fillText(line.slice(0, 70 + ((i * 7) % 50)), 60, 200 + i * 22);
    }
  }), 0, 0xffffff);

  const video = layer(2.9, 1.7, canvasTexture(640, 376, (g, w, h, t) => {
    const shift = (Math.sin(t / 900) + 1) / 2;
    const gradient = g.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#1d2b64");
    gradient.addColorStop(0.3 + shift * 0.4, "#f857a6");
    gradient.addColorStop(1, "#ffb347");
    box(g, 0, 0, w, h, 18, gradient);
    g.fillStyle = "rgba(255,255,255,.9)";
    g.beginPath();
    g.moveTo(290, 140);
    g.lineTo(290, 236);
    g.lineTo(370, 188);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "700 22px Arial";
    g.fillText("🔊 AUTOPLAY · SOUND ON", 24, 40);
    box(g, 24, 340, 592, 8, 4, "rgba(255,255,255,.3)");
    box(g, 24, 340, 80 + ((t / 30) % 512), 8, 4, "#ff3b6b");
  }), 1, 0x26244a);
  video.position.set(1.4, -0.3, 0);

  const popup = layer(2.5, 1.5, canvasTexture(560, 336, (g, w) => {
    box(g, 0, 0, w, 336, 26, "#E8463A");
    g.fillStyle = "#fff";
    g.font = "700 50px Arial";
    g.fillText("🎉 YOU WON!", 34, 96);
    g.font = "400 26px Arial";
    g.fillText("Claim your prize now", 36, 146);
    g.font = "700 30px Arial";
    g.fillText("Ends in 00:04:59", 36, 206);
    box(g, 36, 240, 300, 64, 32, "#fff");
    g.fillStyle = "#E8463A";
    g.fillText("CLAIM ›", 120, 283);
  }), 2, 0xc23a30);
  popup.position.set(-1.4, 0.5, 0);

  const ad = layer(1.9, 2.3, canvasTexture(420, 508, (g, w, h, t) => {
    const flash = Math.floor(t / 400) % 2 === 0;
    const gradient = g.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, flash ? "#7a3cf0" : "#9b5cff");
    gradient.addColorStop(1, flash ? "#ff6ad5" : "#ffd23f");
    box(g, 0, 0, w, h, 22, gradient);
    g.fillStyle = "#fff";
    g.font = "700 64px Arial";
    g.fillText("50%", 40, 130);
    g.fillText("OFF", 40, 200);
    g.font = "700 26px Arial";
    g.fillText("⚡ FLASH SALE ⚡", 40, 270);
    g.font = "400 22px Arial";
    g.fillText("Only 2 left in stock!", 40, 320);
    box(g, 40, 400, 340, 60, 30, "#fff");
    g.fillStyle = "#7a3cf0";
    g.fillText("SHOP NOW", 150, 438);
  }), 3, 0x6b30d8);
  ad.position.set(2.6, 1.0, 0);

  const cookie = layer(5.6, 0.75, canvasTexture(1200, 160, (g, w, h) => {
    box(g, 0, 0, w, h, 20, "#1F1D1A");
    g.fillStyle = "#fff";
    g.font = "400 28px Arial";
    g.fillText("🍪 We use cookies to improve your experience and for marketing.", 30, 70);
    box(g, 880, 40, 280, 76, 38, "#fff");
    g.fillStyle = "#1F1D1A";
    g.font = "700 28px Arial";
    g.fillText("ACCEPT ALL", 935, 89);
  }), 4, 0x111111);
  cookie.position.set(0, -1.65, 0);

  const calm = layer(W, H, canvasTexture(1280, 840, (g, w, h) => {
    box(g, 0, 0, w, h, 24, "#FBFBF6");
    browserTop(g, w);
    g.fillStyle = "#1F1D1A";
    g.font = "700 68px Atkinson";
    g.fillText("Your benefits may change", 70, 190);
    g.font = "400 46px Atkinson";
    g.fillStyle = "#2A2824";
    g.fillText("You must file your taxes by April 30.", 70, 290);
    g.fillText("If you do not, payments can stop.", 70, 360);
    g.fillStyle = "rgba(255,213,74,.35)";
    g.fillRect(0, 395, w, 80);
    g.fillStyle = "#1a3fb0";
    g.font = "700 46px Atkinson";
    g.fillText("How to file  →", 70, 452);
    g.fillRect(70, 462, 300, 5);
    g.fillStyle = "#34406A";
    g.font = "700 30px Atkinson";
    g.fillText("✓ VIDEO PAUSED   ✓ POP-UPS OFF   ✓ ADS CALM   ✓ TEXT 150%", 70, 580);
  }), 5, 0x4A5A8C);

  const NOISY = { video, popup, ad, cookie };
  const TAG_TEXT = { video: "Autoplay + sound", popup: "Fake urgency pop-up", ad: "Flashing ad", cookie: "Cookie wall", base: "Tiny grey text" };
  const muted = window.easeLayersOff || new Set(); // site.js changes this when dock buttons are pressed

  // ---------- Labels that follow the layers ----------
  const tags = {};
  for (const [name, text] of Object.entries(TAG_TEXT)) {
    const span = document.createElement("span");
    span.textContent = text;
    tagsBox.appendChild(span);
    tags[name] = span;
  }

  // ---------- Size and camera ----------
  let width = 1;
  let height = 1;
  let portrait = false;
  function resize() {
    width = canvas.clientWidth || 1;
    height = canvas.clientHeight || 1;
    portrait = width / height < 1.05;
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
    }
    camera.aspect = width / height;
    camera.position.set(0, portrait ? 1.6 : 0.6, portrait ? 22 : 16);
    camera.lookAt(0, portrait ? 0.6 : 0, 0);
    camera.updateProjectionMatrix();
  }

  // ---------- One frame ----------
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  function draw(p, time, still) {
    const explode = ease(Math.min(1, p / 0.45));
    const collapse = Math.max(0, (p - 0.78) / 0.22);
    const calmOnly = document.documentElement.classList.contains("calm");
    const offsetX = portrait || calmOnly ? 0 : 2.2;

    page.rotation.set(0.18 * explode - 0.05, -0.95 * explode + 0.2 * (1 - explode) + 0.75 * collapse, 0.04 * explode);
    page.position.set(offsetX + (portrait ? 0 : 0.9) * explode + (portrait ? 0 : 0.2) * collapse, portrait ? 1.8 : 0.1, -1.5 * explode + 0.5 * collapse);
    page.scale.setScalar(portrait || calmOnly ? 1 : 0.9);

    for (const [name, item] of Object.entries({ ...NOISY, base })) {
      const off = muted.has(name) || collapse > 0.5;
      const target = off ? 0.1 : 1;
      item.userData.fade += still ? target - item.userData.fade : (target - item.userData.fade) * 0.12;
      const fade = item.userData.fade;
      // A small gap even when closed, so layers never share one plane (that makes stripes).
      item.position.z = item.userData.depth * (0.04 + 1.15 * explode * (1 - collapse)) - (1 - fade) * 0.6;
      item.userData.face.material.opacity = fade;
      item.userData.slab.material.opacity = fade;
      item.scale.setScalar(0.9 + 0.1 * fade);
      // Noise that moves (only when it is "on" and motion is allowed)
      if (!still && !off && name !== "base") {
        if (name === "video" || name === "ad") {
          item.userData.texture.redraw(time);
        }
        if (name === "popup") {
          item.rotation.z = Math.sin(time / 300) * 0.04;
        }
      } else if (name === "popup") {
        item.rotation.z = 0;
      }
    }
    base.visible = collapse < 1;
    calm.visible = collapse > 0;
    calm.position.z = 6 - 5.9 * collapse;
    calm.userData.face.material.opacity = calm.userData.slab.material.opacity = Math.min(1, collapse * 1.8);
    if (renderer) {
      renderer.render(scene, camera);
    }

    // Labels
    const showTags = !calmOnly && p < 0.78;
    for (const [name, span] of Object.entries(tags)) {
      const item = name === "base" ? base : NOISY[name];
      const v = new THREE.Vector3();
      item.getWorldPosition(v);
      v.project(camera);
      span.style.left = Math.round(((v.x + 1) / 2) * width + 30) + "px";
      span.style.top = Math.round(((1 - v.y) / 2) * height - (name === "base" ? height * 0.17 : 40)) + "px";
      span.style.opacity = showTags ? "" : "0";
      span.classList.toggle("off", muted.has(name));
      span.textContent = (muted.has(name) ? "✓ off · " : "") + TAG_TEXT[name];
    }
  }

  // ---------- Scroll ----------
  function progress() {
    const rect = story.getBoundingClientRect();
    const total = story.offsetHeight - window.innerHeight;
    return total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
  }
  function showStep(p) {
    const index = p < 0.22 ? 0 : p < 0.5 ? 1 : p < 0.8 ? 2 : 3;
    steps.forEach((step, i) => {
      step.classList.toggle("active", i === index);
      step.setAttribute("aria-hidden", String(i !== index && !isCalm()));
    });
    dock.classList.toggle("show", p >= 0.5);
    bar.style.width = Math.round(p * 100) + "%";
  }

  const isCalm = () => document.documentElement.classList.contains("calm");
  let visible = true;
  let running = false;
  function loop(time) {
    if (!running) {
      return;
    }
    const p = progress();
    showStep(p);
    draw(p, time, false);
    requestAnimationFrame(loop);
  }
  function start() {
    if (isCalm()) {
      return;
    }
    document.documentElement.classList.add("story-on"); // the scroll story layout (style.css)
    if (running || !visible) {
      return;
    }
    running = true;
    requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
  }
  function still() {
    stop();
    document.documentElement.classList.remove("story-on");
    resize();
    steps.forEach((step) => step.removeAttribute("aria-hidden"));
    draw(1, 0, true); // one still picture: the calm page
  }

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) {
      start();
    } else {
      stop();
    }
  }).observe(stage);
  new ResizeObserver(() => {
    resize();
    if (isCalm()) {
      draw(1, 0, true);
    }
  }).observe(canvas);

  // Dock buttons (site.js keeps the list of layers that are off)
  document.addEventListener("site:layers", () => {
    if (isCalm()) {
      draw(1, 0, true);
    }
  });

  // "Calm this site" changes (site.js sends this event)
  document.addEventListener("site:calm", () => {
    if (isCalm()) {
      still();
    } else {
      start();
      resize();
    }
  });

  if (isCalm()) {
    still();
  } else {
    start();
    resize();
    showStep(progress());
  }
  window.__storyReady = true;
}

main();
