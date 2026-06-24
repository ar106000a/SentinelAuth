from pydantic import BaseModel, Field
from typing import Optional
import numpy as np


# ── Input schema ──────────────────────────────────────────────────────────────

class LoginFeatures(BaseModel):
    """
    Feature vector for a single login attempt.
    Sent by Core API, validated here before inference.
    """

    # Request metadata
    ip_address: str = Field(..., description="Client IP address")
    user_agent: str = Field(default="unknown", description="Browser user agent string")
    fingerprint: Optional[str] = Field(default=None, description="Device fingerprint hash")

    # Temporal features
    login_hour: int = Field(
        ..., ge=0, le=23, description="Hour of login attempt in UTC (0-23)"
    )
    hour_frequency_score: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description=(
            "How frequently this user logs in at this hour. "
            "0.0 = never, 1.0 = always. "
            "Default 0.5 = cold start / no history."
        ),
    )

    # Geolocation features (Phase 3 week 11 — GeoIP lookup)
    geo_lat: Optional[float] = Field(default=None, description="Latitude of login location")
    geo_lng: Optional[float] = Field(default=None, description="Longitude of login location")
    geo_velocity_kmh: float = Field(
        default=0.0,
        ge=0.0,
        description=(
            "Speed in km/h required to travel from last login location to current. "
            "0.0 = same location or no prior location. "
            "Values above ~900 suggest impossible travel."
        ),
    )

    # Device features
    is_new_device: int = Field(
        default=0,
        ge=0,
        le=1,
        description="1 if this device fingerprint has never been seen for this user",
    )

    # Threat signals
    velocity_anomaly: int = Field(
        default=0,
        ge=0,
        le=1,
        description="1 if login velocity anomaly detected for this user account",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "ip_address": "203.0.113.42",
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "fingerprint": "abc123hash",
                "login_hour": 14,
                "hour_frequency_score": 0.8,
                "geo_lat": 33.6844,
                "geo_lng": 73.0479,
                "geo_velocity_kmh": 0.0,
                "is_new_device": 0,
                "velocity_anomaly": 0,
            }
        }


# ── Output schema ─────────────────────────────────────────────────────────────

class InferenceResult(BaseModel):
    risk_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Risk score for this login attempt. 0.0 = low risk, 1.0 = high risk.",
    )
    model_version: str = Field(
        default="placeholder",
        description="Version identifier of the model used for inference.",
    )


# ── Feature engineering ───────────────────────────────────────────────────────

def engineer_features(features: LoginFeatures) -> np.ndarray:
    """
    Transform raw LoginFeatures into a numerical array
    suitable for model inference.

    Returns a 1D numpy array with the following feature order:
    [login_hour_sin, login_hour_cos, hour_frequency_score,
     geo_velocity_kmh, is_new_device, velocity_anomaly,
     has_fingerprint, geo_available]
    """

    # Cyclical encoding of login hour
    # Raw hour (0-23) is categorical and has a circular relationship:
    # hour 23 is close to hour 0, but numerically they're far apart.
    # Sin/cos encoding captures this circularity.
    hour_sin = np.sin(2 * np.pi * features.login_hour / 24)
    hour_cos = np.cos(2 * np.pi * features.login_hour / 24)

    # Geo velocity — cap at 2000 km/h to prevent outliers
    # from dominating the feature space
    geo_velocity = min(features.geo_velocity_kmh, 2000.0)

    # Binary flags derived from optional fields
    has_fingerprint = 1 if features.fingerprint else 0
    geo_available = 1 if (features.geo_lat is not None and features.geo_lng is not None) else 0

    feature_vector = np.array([
        hour_sin,
        hour_cos,
        features.hour_frequency_score,
        geo_velocity / 2000.0,          # normalize to 0-1
        float(features.is_new_device),
        float(features.velocity_anomaly),
        float(has_fingerprint),
        float(geo_available),
    ], dtype=np.float32)

    return feature_vector