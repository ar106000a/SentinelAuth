import os
import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from features import LoginFeatures, InferenceResult, engineer_features


# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ── Model state ───────────────────────────────────────────────────────────────

# Model is loaded once at startup and held in memory.
# None = no model loaded yet (placeholder mode).
model = None
MODEL_VERSION = "placeholder-v0"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model", "sentinel.ubj")


def load_model():
    """Attempt to load the trained XGBoost model from disk."""
    global model, MODEL_VERSION
    
    # 1. Check if the file exists and has content
    if os.path.exists(MODEL_PATH) and os.path.getsize(MODEL_PATH) > 0:
        try:
            import xgboost as xgb
            booster = xgb.Booster()
            booster.load_model(MODEL_PATH)
            model = booster
            MODEL_VERSION = "xgboost-v1"
            logger.info("XGBoost model loaded from %s", MODEL_PATH)
        except Exception as e:
            # This catches parsing errors if the file is corrupted or invalid
            logger.error("Failed to load model from %s: %s. Running in placeholder mode.", MODEL_PATH, e)
            model = None
    else:
        # This handles the case where the file is missing OR size is 0
        logger.warning(
            "Model file %s is missing or empty — running in placeholder mode. "
            "Train the model with: python model/train.py",
            MODEL_PATH,
        )
        model = None


# ── Startup / shutdown ────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before serving requests."""
    logger.info("SentinelAuth AI Engine starting up...")
    load_model()
    logger.info("Ready to serve inference requests.")
    yield
    logger.info("AI Engine shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SentinelAuth AI Engine",
    description="Risk scoring microservice for adaptive authentication",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # internal service — Core API only
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_version": MODEL_VERSION,
    }


# ── Inference ─────────────────────────────────────────────────────────────────

@app.post("/infer", response_model=InferenceResult)
async def infer(features: LoginFeatures) -> InferenceResult:
    """
    Compute a risk score for a login attempt.

    Accepts a LoginFeatures vector, runs feature engineering,
    and returns a risk score between 0.0 and 1.0.
    """
    start = time.perf_counter()

    try:
        feature_vector = engineer_features(features)

        if model is not None:
            # Real inference — Week 7 wires this in fully
            import xgboost as xgb
            dmatrix = xgb.DMatrix(feature_vector.reshape(1, -1))
            risk_score = float(model.predict(dmatrix)[0])
            risk_score = max(0.0, min(1.0, risk_score))
        else:
            # Placeholder mode — heuristic scoring until model is trained
            risk_score = _heuristic_score(features)

    except Exception as e:
        logger.error("Inference error: %s", str(e))
        raise HTTPException(status_code=500, detail="Inference failed")

    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "Inference complete | score=%.4f | model=%s | elapsed=%.2fms",
        risk_score, MODEL_VERSION, elapsed_ms
    )

    return InferenceResult(risk_score=risk_score, model_version=MODEL_VERSION)


def _heuristic_score(features: LoginFeatures) -> float:
    """
    Rule-based placeholder score used when no trained model is available.

    This is NOT production scoring — it exists so the endpoint
    returns meaningful values during development before the model is trained.
    Each rule contributes additively to a base score.
    """
    score = 0.0

    # New device is a strong signal
    if features.is_new_device:
        score += 0.3

    # Velocity anomaly (multiple IPs targeting same account)
    if features.velocity_anomaly:
        score += 0.3

    # Unusual login hour (low frequency score)
    if features.hour_frequency_score < 0.1:
        score += 0.2

    # Impossible travel — threshold ~900 km/h (speed of a commercial jet)
    if features.geo_velocity_kmh > 900:
        score += 0.4

    # No device fingerprint — slightly more suspicious
    if not features.fingerprint:
        score += 0.1

    # Cap at 1.0
    return min(score, 1.0)