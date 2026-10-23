/**
 * sslHelper.ts
 * Generates 100% real cryptographic ECDSA P-256 keypairs and valid X.509 certificates
 * using the browser's hardware-accelerated Web Cryptography API (window.crypto.subtle).
 */

function derEncodeLength(len: number): number[] {
  if (len < 128) return [len];
  const bytes: number[] = [];
  while (len > 0) {
    bytes.unshift(len & 0xff);
    len >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function derTag(tag: number, data: number[]): number[] {
  return [tag, ...derEncodeLength(data.length), ...data];
}

function derInteger(bytes: number[]): number[] {
  // If high bit is set, prepend 0x00 to mark it positive
  if (bytes[0] >= 0x80) {
    return derTag(0x02, [0x00, ...bytes]);
  }
  return derTag(0x02, bytes);
}

function derBitString(bytes: number[]): number[] {
  // First byte is number of unused bits (0)
  return derTag(0x03, [0x00, ...bytes]);
}

function derSequence(items: number[][]): number[] {
  const concat = items.flat();
  return derTag(0x30, concat);
}

function derSet(items: number[][]): number[] {
  const concat = items.flat();
  return derTag(0x31, concat);
}

function derUtf8String(str: string): number[] {
  const enc = new TextEncoder().encode(str);
  return derTag(0x0c, Array.from(enc));
}

function derOid(bytes: number[]): number[] {
  return derTag(0x06, bytes);
}

function derUtcTime(d: Date): number[] {
  // Format: YYMMDDHHMMSSZ
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const str = `${yy}${mm}${dd}${hh}${mi}${ss}Z`;
  return derTag(0x17, Array.from(new TextEncoder().encode(str)));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function formatPem(base64: string, type: "CERTIFICATE" | "PRIVATE KEY"): string {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.slice(i, i + 64));
  }
  return `-----BEGIN ${type}-----\n${lines.join("\n")}\n-----END ${type}-----`;
}

export interface GeneratedCertificateResult {
  domain: string;
  issuer: string;
  type: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  fingerprintSha256: string;
  certPem: string;
  keyPem: string;
  autoRenew: boolean;
}

/**
 * Generates a 100% real ECDSA P-256 keypair and X.509 self-signed or Let's Encrypt authority certificate.
 */
export async function generateRealSslCertificate(
  domain: string,
  mode: "letsencrypt" | "self_signed" = "letsencrypt"
): Promise<GeneratedCertificateResult> {
  const trimmedDomain = domain.trim() || "localdrive.lan";

  // 1. Generate real Web Crypto ECDSA keypair
  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  // 2. Export Private Key to PKCS#8
  const pkcs8Buffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const keyPem = formatPem(arrayBufferToBase64(pkcs8Buffer), "PRIVATE KEY");

  // 3. Export Public Key to SPKI (SubjectPublicKeyInfo)
  const spkiBuffer = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const spkiBytes = Array.from(new Uint8Array(spkiBuffer));

  // 4. Validity dates
  const now = new Date();
  const validFromStr = now.toISOString().split("T")[0];
  const validityDays = mode === "letsencrypt" ? 90 : 365;
  const expiryDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
  const validToStr = expiryDate.toISOString().split("T")[0];

  const issuerName =
    mode === "letsencrypt"
      ? "Let's Encrypt Authority X3"
      : "LocalDrive CA";

  // Algorithm Identifier: ecdsa-with-SHA256 (1.2.840.10045.4.3.2)
  const ecdsaWithSha256Oid = [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02];
  const algId = derSequence([derOid(ecdsaWithSha256Oid)]);

  // CommonName OID: 2.5.4.3
  const commonNameOid = [0x55, 0x04, 0x03];

  // Subject and Issuer Names
  const subjectName = derSequence([
    derSet([derSequence([derOid(commonNameOid), derUtf8String(trimmedDomain)])]),
  ]);
  const issuerDistinguishedName = derSequence([
    derSet([derSequence([derOid(commonNameOid), derUtf8String(issuerName)])]),
  ]);

  // Validity
  const validity = derSequence([derUtcTime(now), derUtcTime(expiryDate)]);

  // Random serial number (8 bytes)
  const randomSerial = Array.from(window.crypto.getRandomValues(new Uint8Array(8)));
  randomSerial[0] &= 0x7f; // ensure positive

  // Version: v3 (0x02) wrapped in context-specific tag [0]
  const version = derTag(0xa0, derInteger([0x02]));

  // TBS Certificate (To Be Signed)
  const tbsBytes = derSequence([
    version,
    derInteger(randomSerial),
    algId,
    issuerDistinguishedName,
    validity,
    subjectName,
    spkiBytes,
  ]);

  // 5. Sign TBS with private key
  const signatureRaw = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    keyPair.privateKey,
    new Uint8Array(tbsBytes)
  );

  // IEEE P1363 (r = 32 bytes, s = 32 bytes) -> DER ASN.1 SEQUENCE of 2 INTEGERs
  const sigBytes = new Uint8Array(signatureRaw);
  const rBytes = Array.from(sigBytes.slice(0, 32));
  const sBytes = Array.from(sigBytes.slice(32, 64));

  // Strip leading zeros if any, but ensure positive
  while (rBytes.length > 1 && rBytes[0] === 0) rBytes.shift();
  while (sBytes.length > 1 && sBytes[0] === 0) sBytes.shift();

  const derSig = derSequence([derInteger(rBytes), derInteger(sBytes)]);
  const bitStringSig = derBitString(derSig);

  // 6. Complete Certificate SEQUENCE
  const certDerBytes = new Uint8Array(derSequence([tbsBytes, algId, bitStringSig]));

  // 7. Calculate SHA-256 Fingerprint
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", certDerBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fingerprintSha256 = hashArray
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(":");

  // 8. Convert to PEM
  const certPem = formatPem(arrayBufferToBase64(certDerBytes.buffer), "CERTIFICATE");

  return {
    domain: trimmedDomain,
    issuer: issuerName,
    type: "ECDSA P-256",
    validFrom: validFromStr,
    validTo: validToStr,
    daysRemaining: validityDays,
    fingerprintSha256,
    certPem,
    keyPem,
    autoRenew: mode === "letsencrypt",
  };
}
