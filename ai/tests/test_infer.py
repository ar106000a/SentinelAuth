import pytest
from fastapi.testclient import TestClient
from main import app
from features import engineer_features, LoginFeatures
import numpy as np


client = TestClient(app)


# ── Fixtures ──────────────────────────────────────────────────────────────────

def base_features(**overrides) -> dict:
    """Minimal valid feature vector for testing."""
    defaults = {
        "ip_address": "203.0.113.42",
        "user_agent": "Mozilla/5.0",
        "fingerprint": "testhash123",
        "login_hour": 14,
        "hour_frequency_score": 0.8,
        "geo_lat": None,
        "geo_lng": None,
        "geo_velocity_kmh": 0.0,
        "is_new_device": 0,
        "velocity_anomaly": 0,
    }
    return {**defaults, **overrides}


# ── Health ────────────────────────────────────────────────────────────────────

def test_health_returns_200():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "model_loaded" in body
    assert "model_version" in body


# ── Inference endpoint ────────────────────────────────────────────────────────

def test_infer_returns_valid_score():
    res = client.post("/infer", json=base_features())
    assert res.status_code == 200
    body = res.json()
    assert "risk_score" in body
    assert 0.0 <= body["risk_score"] <= 1.0


def test_infer_low_risk_normal_login():
    """Typical daytime login from known device should score low."""
    features = base_features(
        login_hour=14,
        hour_frequency_score=0.9,
        is_new_device=0,
        velocity_anomaly=0,
        geo_velocity_kmh=0.0,
    )
    res = client.post("/infer", json=features)
    assert res.status_code == 200
    assert res.json()["risk_score"] == 0.0


def test_infer_high_risk_all_signals():
    """All threat signals present should score high."""
    features = base_features(
        is_new_device=1,
        velocity_anomaly=1,
        hour_frequency_score=0.0,
        geo_velocity_kmh=1200.0,
        fingerprint=None,
    )
    res = client.post("/infer", json=features)
    assert res.status_code == 200
    assert res.json()["risk_score"] >= 0.8


def test_infer_new_device_raises_score():
    """New device alone should raise risk score."""
    low = client.post("/infer", json=base_features(is_new_device=0)).json()
    high = client.post("/infer", json=base_features(is_new_device=1)).json()
    assert high["risk_score"] > low["risk_score"]


def test_infer_impossible_travel_raises_score():
    """Geo velocity above 900 km/h should raise risk score."""
    normal = client.post("/infer", json=base_features(geo_velocity_kmh=0.0)).json()
    impossible = client.post("/infer", json=base_features(geo_velocity_kmh=1500.0)).json()
    assert impossible["risk_score"] > normal["risk_score"]


def test_infer_velocity_anomaly_raises_score():
    """Velocity anomaly flag should raise risk score."""
    clean = client.post("/infer", json=base_features(velocity_anomaly=0)).json()
    flagged = client.post("/infer", json=base_features(velocity_anomaly=1)).json()
    assert flagged["risk_score"] > clean["risk_score"]


def test_infer_rejects_invalid_hour():
    """login_hour must be 0-23."""
    res = client.post("/infer", json=base_features(login_hour=25))
    assert res.status_code == 422


def test_infer_rejects_invalid_frequency_score():
    """hour_frequency_score must be 0.0-1.0."""
    res = client.post("/infer", json=base_features(hour_frequency_score=1.5))
    assert res.status_code == 422


def test_infer_rejects_negative_velocity():
    """geo_velocity_kmh must be non-negative."""
    res = client.post("/infer", json=base_features(geo_velocity_kmh=-10.0))
    assert res.status_code == 422


def test_infer_rejects_missing_required_fields():
    """ip_address and login_hour are required."""
    res = client.post("/infer", json={"user_agent": "test"})
    assert res.status_code == 422


def test_infer_accepts_null_optional_fields():
    """Optional fields can be null."""
    features = base_features(fingerprint=None, geo_lat=None, geo_lng=None)
    res = client.post("/infer", json=features)
    assert res.status_code == 200


# ── Feature engineering ───────────────────────────────────────────────────────

def test_engineer_features_returns_correct_shape():
    features = LoginFeatures(**base_features())
    vector = engineer_features(features)
    assert vector.shape == (8,)
    assert vector.dtype == np.float32


def test_engineer_features_hour_encoding_circularity():
    """Hour 0 and hour 24 should produce same encoding (circularity)."""
    f0 = LoginFeatures(**base_features(login_hour=0))
    # hour 0 and hour 23 should be close in encoded space
    f23 = LoginFeatures(**base_features(login_hour=23))
    v0 = engineer_features(f0)
    v23 = engineer_features(f23)
    # sin(0) ≈ 0, sin(23 * 2π/24) ≈ -0.26 — both near the 0/24 boundary
    # The important check: both cos values are near 1.0
    assert abs(v0[1]) > 0.9   # cos of hour 0 ≈ 1.0
    assert abs(v23[1]) > 0.9  # cos of hour 23 ≈ 0.97


def test_engineer_features_velocity_capped():
    """Velocity above 2000 should be capped at 1.0 in feature vector."""
    features = LoginFeatures(**base_features(geo_velocity_kmh=9999.0))
    vector = engineer_features(features)
    # Index 3 is normalized velocity
    assert vector[3] == pytest.approx(1.0)


def test_engineer_features_no_fingerprint_flag():
    """has_fingerprint should be 0 when fingerprint is None."""
    features = LoginFeatures(**base_features(fingerprint=None))
    vector = engineer_features(features)
    # Index 6 is has_fingerprint
    assert vector[6] == 0.0


def test_engineer_features_geo_available_flag():
    """geo_available should be 1 when both lat and lng are present."""
    features = LoginFeatures(**base_features(geo_lat=33.6844, geo_lng=73.0479))
    vector = engineer_features(features)
    # Index 7 is geo_available
    assert vector[7] == 1.0