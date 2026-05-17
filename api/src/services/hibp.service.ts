import axios from "axios";
import { createHash } from "crypto";
import { env } from "../config/env";
export async function isPasswordPwned(password: string): Promise<boolean> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const response = await axios.get(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        timeout: env.HIBP_TIMEOUT_MS,
        headers: {
          "Add-Padding": "true",
          "User-Agent": "SentinelAuth-HIBP-Check",
        },
      }
    );
    const lines = response.data.split("\n") as string[];
    const found = lines.some((line: string) => {
      const [hashSuffix] = line.split(":");
      return hashSuffix.trim().toUpperCase() === suffix;
    });
    return found;
  } catch {
    console.warn("HIBP check failed - proceeding with registration");
    return false;
  }
}
