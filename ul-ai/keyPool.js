// ===== keyPool.js =====
// Generic multi-API-key rotator. Ek provider (Gemini, Groq, waghera) ke
// multiple free-tier keys ko ek "pool" ki tarah treat karta hai:
//   - Har key ka apna RPD (requests/day) aur RPM (requests/minute) count track hota hai
//   - Jab ek key exhaust ho jaye, agli available key khud-ba-khud mil jati hai
//     saari keys apne aap wapas available ho jati hain — koi manual restart nahi chahiye

class KeyPool {
  constructor({ name, keys, rpdLimit, rpmLimit }) {
    this.name = name;
    this.rpdLimit = rpdLimit;
    this.rpmLimit = rpmLimit;
    this.keys = keys.filter(Boolean).map((key, i) => ({
      key,
      label: `${name}_${i + 1}`,
      dailyCount: 0,
      requestTimestamps: [],
      exhaustedToday: false,
    }));
    this.datePT = this._todayPT();

    if (this.keys.length === 0) {
      console.error(`❌ ${name}: koi bhi API key .env mein nahi mili!`);
    } else {
      console.log(`✅ ${name}: ${this.keys.length} key(s) load hui (pool ready).`);
    }
  }

  _todayPT() {
    return new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  }

  _resetIfNewDay() {
    const today = this._todayPT();
    if (today !== this.datePT) {
      this.datePT = today;
      this.keys.forEach((k) => {
        k.dailyCount = 0;
        k.exhaustedToday = false;
        k.requestTimestamps = [];
      });
      console.log(`🔄 ${this.name}: naya din shuru (PT midnight) — saari keys reset ho gayi.`);
    }
  }

  // Sabse pehli available key laut ati hai (jo RPD/RPM limit ke andar ho aur
  getAvailableKey() {
    this._resetIfNewDay();
    const now = Date.now();

    for (const k of this.keys) {
      k.requestTimestamps = k.requestTimestamps.filter((t) => now - t < 60 * 1000);
      const withinRPD = k.dailyCount < this.rpdLimit;
      const withinRPM = k.requestTimestamps.length < this.rpmLimit;
      if (!k.exhaustedToday && withinRPD && withinRPM) {
        return k;
      }
    }
    return null;
  }

  getNextAvailableKey(excludeLabel) {
    this._resetIfNewDay();
    const now = Date.now();

    for (const k of this.keys) {
      if (k.label === excludeLabel) continue;
      k.requestTimestamps = k.requestTimestamps.filter((t) => now - t < 60 * 1000);
      const withinRPD = k.dailyCount < this.rpdLimit;
      const withinRPM = k.requestTimestamps.length < this.rpmLimit;
      if (!k.exhaustedToday && withinRPD && withinRPM) {
        return k;
      }
    }
    return null;
  }

  recordAttempt(keyEntry) {
    keyEntry.requestTimestamps.push(Date.now());
    keyEntry.dailyCount++;
  }

  // Quota-error (429 / rate limit) milne par is key ko aaj ke liye "band" mark karo
  markExhausted(keyEntry) {
    keyEntry.exhaustedToday = true;
    console.warn(`⚠️ ${this.name}: The limit of "${keyEntry.label}" is over. Next key will be used.`);
  }

  hasAnyKey() {
    return this.keys.length > 0;
  }

  // Debug / status endpoint ke liye chota summary
  getStatus() {
    this._resetIfNewDay();
    return this.keys.map((k) => ({
      label: k.label,
      dailyCount: k.dailyCount,
      dailyLimit: this.rpdLimit,
      exhaustedToday: k.exhaustedToday,
    }));
  }
}

module.exports = KeyPool;