// Settings Lock.
// A caregiver can lock My Settings and This Site with a 4-digit PIN,
// so a parent does not change things by accident.
// Home still works without the PIN (Calm, Low-energy day, text size, Reading view...).
//
// This is a "child lock", not strong security: anyone can still remove the extension.
// We never save the PIN itself. We save a scrambled version (SHA-256 with a random salt):
//   lockHash = "salt:hash"   (null = no lock)

(function () {
  const Ease = (globalThis.Ease = globalThis.Ease || {});

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function randomSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  Ease.lock = {
    // True for exactly 4 digits.
    isValidPin(pin) {
      return /^\d{4}$/.test(String(pin || ""));
    },

    // Make the value to save in settings.lockHash.
    async makeHash(pin) {
      const salt = randomSalt();
      return salt + ":" + (await sha256(salt + ":" + pin));
    },

    // Check a PIN against settings.lockHash.
    async check(pin, lockHash) {
      if (!lockHash || !lockHash.includes(":")) {
        return false;
      }
      const [salt, hash] = lockHash.split(":");
      return (await sha256(salt + ":" + pin)) === hash;
    }
  };
})();
