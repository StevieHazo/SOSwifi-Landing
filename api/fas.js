function decodeIv(rawIv) {
  const raw = String(rawIv || "").trim();

  // 1. HEX (STRICT)
  if (/^[0-9a-fA-F]+$/.test(raw)) {
    if (raw.length === 32) {
      const buf = Buffer.from(raw, "hex");
      if (buf.length === 16) return buf;
    }
  }

  // 2. Base64 / URL-safe base64
  try {
    const s = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
    const buf = Buffer.from(padded, "base64");
    if (buf.length === 16) return buf;
  } catch (e) {}

  throw new Error(`Invalid IV (must be 16 bytes). received="${raw}" length=${raw.length}`);
}
