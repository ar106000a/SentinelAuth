import axios from "axios";
import { env } from "../config/env";

export interface LoginFeatureVector {
  ip_address: string;
  user_agent: string;
  login_hour: number;
  fingerprint: string | null;
  hour_frequency_score: number;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_velocity_kmh: number;
  is_new_device: number;
  velocity_anomaly: number;
}
export interface InferenceResult {
  risk_score: number;
  model_version: string;
}

export async function getRiskScore(
  features: LoginFeatureVector,
  failOpen: boolean
): Promise<number> {
  try {
    const res = await axios.post<InferenceResult>(
      `${env.AI_ENGINE_URL}/infer`,
      features,
      { timeout: env.AI_ENGINE_TIMEOUT_MS }
    );

    const score = res.data.risk_score;
    return Math.max(0.0, Math.min(1.0, score));
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
      console.warn("AI_ENGINE_TIMEOUT _ applying failopen behaviour.");
    } else {
      console.warn("AI engine unavailable: ", (error as Error).message);
    }
    // failOpen=true  → allow login with neutral score (0.5)
    // failOpen=false → block login by returning maximum risk score
    return failOpen ? 0.5 : 1.0;
  }
}

export function assembleFeatureVector(params: {
  ipAddress: string;
  userAgent: string;
  fingerprint: string | null;
  loginHour: number;
  hourFrequencyScore: number;
  geoLat: number | null;
  geoLng: number | null;
  geoVelocityKmh: number;
  isNewDevice: boolean;
  velocityAnomaly: boolean;
}): LoginFeatureVector {
  return {
    ip_address: params.ipAddress,
    user_agent: params.userAgent,
    fingerprint: params.fingerprint,
    login_hour: params.loginHour,
    hour_frequency_score: params.hourFrequencyScore,
    geo_lat: params.geoLat,
    geo_lng: params.geoLng,
    geo_velocity_kmh: params.geoVelocityKmh,
    is_new_device: params.isNewDevice ? 1 : 0,
    velocity_anomaly: params.velocityAnomaly ? 1 : 0,
  };
}
