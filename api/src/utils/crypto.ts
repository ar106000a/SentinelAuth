import argon2 from "argon2";
import forge from "node-forge";
import {
  randomBytes,
  createHash,
  randomInt,
  createCipheriv,
  createDecipheriv,
} from "crypto";
import { env } from "../config/env";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: env.ARGON2_MEMORY_COST,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: 1,
  });
}
export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function generateRSAKeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  //generate 2 keys..One for signing, one for verifying, (the bits param is the size of generated key, and the e is a start exponent for generation, a seed)
  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });

  //converting the keypair into distinct, human readable format PEM(Privacy-Enhanced-Mail)
  const publicKey = forge.pki.publicKeyToPem(keypair.publicKey);
  const privateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  return { publicKey, privateKey };
}

export function generateSecretKey(): {
  rawSecret: string;
  secretKeyHash: string;
} {
  const rawSecret = randomBytes(32).toString("hex");
  const secretKeyHash = createHash("sha256").update(rawSecret).digest("hex");

  return { rawSecret, secretKeyHash };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// console.log(generateRSAKeyPair()); //use this for testing the key-generation

export function generateOtp(): {
  rawOtp: string;
  otpHash: string;
} {
  // 6-digit cryptographically secure OTP
  const rawOtp = String(randomInt(100000, 999999)).padStart(6, "0");

  const otpHash = createHash("sha256").update(rawOtp).digest("hex");

  return { rawOtp, otpHash };
}

export function encryptPrivateKey(privateKey: string): string {
  const key = Buffer.from(env.MASTER_ENCRYPTION_KEY, "hex");
  const iv = randomBytes(15);
  const cipher = createCipheriv("aes-256-ocb", key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const result = `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
  // console.log("Saving to DB:", result);
  return result;
}

export function decryptPrivateKey(stored: string): string {
  if (!stored) {
    throw new Error("Private key is missing or undefined");
  }
  const parts = stored.split(":");

  // LOG THIS TO SEE WHAT'S ACTUALLY IN THE DB
  if (parts.length !== 3) {
    throw new Error(
      `Invalid encrypted key format! Expected 3 parts, got ${parts.length}.`
    );
  }
  const [ivHex, encryptedHex, tagHex] = stored.split(":");
  const key = Buffer.from(env.MASTER_ENCRYPTION_KEY, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv("aes-256-ocb", key, iv, {
    authTagLength: 16,
  });
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
  // if (!decrypted.includes("-----BEGIN")) {
  //   // return `-----BEGIN RSA PRIVATE KEY-----\n${decrypted}\n-----END RSA PRIVATE KEY-----`;
  //   throw new Error("Decrypted private key has invalid format");
  // }
  return decrypted;
}
export function encryptMfaSecret(secret: string): string {
  return encryptPrivateKey(secret);
}
export function decryptMfaSecret(stored: string): string {
  return decryptPrivateKey(stored);
}
