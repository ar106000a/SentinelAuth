# SentinelAuth AI Engine Implementation Specification & ML Architecture

This document provides a comprehensive technical specification of the `sentinelauth-ai` microservice. It details the FastAPI application lifecycle, 8-dimensional feature engineering pipeline, synthetic dataset generation rules, XGBoost model training parameters, evaluation metrics, and inference fallbacks.

---

## Table of Contents
1. [Service Architecture & Technology Stack](#1-service-architecture--technology-stack)
2. [Feature Schema & Engineering Pipeline (`features.py`)](#2-feature-schema--engineering-pipeline)
   - [Input Contract (`LoginFeatures`)](#input-contract-loginfeatures)
   - [Feature Engineering Transformations (`engineer_features`)](#feature-engineering-transformations-engineer_features)
3. [Synthetic Dataset Generation (`model/dataset.py`)](#3-synthetic-dataset-generation)
   - [Legitimate Login Distributions](#legitimate-login-distributions)
   - [Malicious Threat Pattern Modeling](#malicious-threat-pattern-modeling)
4. [XGBoost Model Training & Evaluation (`model/train.py`)](#4-xgboost-model-training--evaluation)
   - [Hyperparameter Specification](#hyperparameter-specification)
   - [Class Imbalance Compensation (`scale_pos_weight`)](#class-imbalance-compensation-scale_pos_weight)
   - [Evaluation Metrics & Threshold Calibration](#evaluation-metrics--threshold-calibration)
5. [Inference Microservice API (`main.py`)](#5-inference-microservice-api)
   - [Model Lifecycle & Startup (`lifespan`)](#model-lifecycle--startup-lifespan)
   - [Inference Endpoint (`POST /infer`)](#inference-endpoint-post-infer)
   - [Rule-Based Heuristic Fallback (`_heuristic_score`)](#rule-based-heuristic-fallback-_heuristic_score)
   - [Health Monitoring Endpoint (`GET /health`)](#health-monitoring-endpoint-get-health)

---

## 1. Service Architecture & Technology Stack

The SentinelAuth AI Engine is an autonomous Python microservice responsible for real-time risk scoring during authentication requests.

- **Web Framework**: [FastAPI](https://fastapi.tiangolo.com/) `v0.115+` running under Uvicorn.
- **Machine Learning**: [XGBoost](https://xgboost.readthedocs.io/) `v2.1.0+` using the Universal Binary JSON (`.ubj`) serialization format.
- **Data Science Stack**: `numpy` `v1.26+`, `pandas` `v2.2+`, and `scikit-learn` `v1.5+`.
- **Validation**: Pydantic `v2` for input payload parsing and output envelope serialization.

---

## 2. Feature Schema & Engineering Pipeline (`features.py`)

### Input Contract (`LoginFeatures`)

The Core API transmits a 10-property JSON payload describing the login context:

```python
class LoginFeatures(BaseModel):
    ip_address: str            # Client IP address
    user_agent: str            # Browser user agent string (default "unknown")
    fingerprint: Optional[str] # Device fingerprint string (default None)
    login_hour: int            # Hour of login attempt in UTC (0-23)
    hour_frequency_score: float# Fraction of user's past logins at this UTC hour [0.0 - 1.0]
    geo_lat: Optional[float]   # Latitude of login location
    geo_lng: Optional[float]   # Longitude of login location
    geo_velocity_kmh: float    # Speed in km/h to travel from last login location
    is_new_device: int         # 1 if device fingerprint unseen for user, else 0
    velocity_anomaly: int      # 1 if account accessed > 3 distinct IPs in 5 min, else 0
```

### Feature Engineering Transformations (`engineer_features`)

Raw input features are transformed into an 8-element 1D NumPy array (`float32`) for model input:

```
[ hour_sin, hour_cos, hour_frequency_score, geo_velocity_normalized,
  is_new_device, velocity_anomaly, has_fingerprint, geo_available ]
```

#### Transformation Logic:

1. **Cyclical Hour Encoding**:
   Raw UTC hour ($0 \dots 23$) is converted into 2D continuous space to preserve the circular relationship between hour 23 and hour 0:
   $$\text{hour\_sin} = \sin\left(\frac{2\pi \cdot \text{login\_hour}}{24}\right)$$
   $$\text{hour\_cos} = \cos\left(\frac{2\pi \cdot \text{login\_hour}}{24}\right)$$

2. **Geo Velocity Normalization**:
   Speed in km/h is capped at $2000.0\text{ km/h}$ to prevent numerical extreme outliers from dominating tree splits, then normalized to $[0.0, 1.0]$:
   $$\text{geo\_velocity\_normalized} = \frac{\min(\text{geo\_velocity\_kmh}, 2000.0)}{2000.0}$$

3. **Presence Binary Indicators**:
   - `has_fingerprint = 1.0` if `fingerprint is not None` else `0.0`.
   - `geo_available = 1.0` if `(geo_lat is not None and geo_lng is not None)` else `0.0`.

---

## 3. Synthetic Dataset Generation (`model/dataset.py`)

To train the risk model, `generate_dataset()` synthesizes 50,000 realistic login attempts with a 15% malicious label ratio (`malicious_ratio = 0.15`).

### Legitimate Login Distributions (`label = 0` — 85% of samples)
- **Login Hours**: Clustered around daytime/evening hours (6–23 UTC) using empirical hour probability distribution.
- **Hour Frequency Score**: Drawn from a $\text{Beta}(5, 1.5)$ distribution (skewed high toward 1.0).
- **Geo Velocity**: 95% drawn from $\text{Exponential}(\lambda=0.01)$ capped at $0.3$ (same city/region); 5% drawn from $\text{Uniform}(0.05, 0.25)$ (legitimate flight travel).
- **Device & Threat Signals**: `is_new_device` is 1 for only 8% of attempts; `velocity_anomaly` is 1 for 3%; `has_fingerprint` is 1 for 95%.

### Malicious Threat Pattern Modeling (`label = 1` — 15% of samples)
Synthesizes three distinct attack vectors:

1. **Pattern A — Credential Stuffing (40% of attacks)**:
   - Off-hours probability distribution (peaks 0–5 UTC).
   - `hour_frequency_score` drawn from $\text{Beta}(1, 5)$ (skewed low).
   - High new device rate (`is_new_device = 1` in 90% of cases).
   - High velocity anomaly rate (`velocity_anomaly = 1` in 80% of cases).
2. **Pattern B — Account Takeover (35% of attacks)**:
   - Off-hours distribution.
   - `hour_frequency_score` drawn from $\text{Beta}(1.5, 4)$.
   - High geo velocity: Split between moderate VPN hops ($\text{Beta}(2, 3)$ normalized $0.1–0.4$) and impossible travel ($\text{Beta}(5, 1)$ normalized $0.5–1.0$).
   - New devices in 70% of cases.
3. **Pattern C — Distributed IP Attack (25% of attacks)**:
   - Off-hours distribution.
   - 100% flagged with `velocity_anomaly = 1`.
   - New devices in 95% of cases.

---

## 4. XGBoost Model Training & Evaluation (`model/train.py`)

### Hyperparameter Specification

```python
params = {
    "objective": "binary:logistic",
    "eval_metric": ["logloss", "auc"],
    "max_depth": 6,
    "learning_rate": 0.1,
    "n_estimators": 200,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 5,
    "scale_pos_weight": scale_pos_weight,
    "seed": 42,
}
```

### Class Imbalance Compensation (`scale_pos_weight`)
To account for class imbalance (15% malicious vs 85% legitimate), `scale_pos_weight` is dynamically set to:
$$\text{scale\_pos\_weight} = \frac{N_{\text{legitimate}}}{N_{\text{malicious}}} \approx 5.67$$
This ensures the loss function penalizes false negatives (missed attacks) appropriately.

### Evaluation Metrics & Threshold Calibration
- **Validation Split**: Stratified 80/20 train/validation split (`train_test_split(stratify=y)`).
- **Early Stopping**: `early_stopping_rounds = 20` monitoring validation logloss and AUC.
- **Threshold Tuning**: Evaluates classification thresholds ($0.3, 0.5, 0.7$) to maximize validation F1-score.
- **Metrics Persisted (`model/metrics.json`)**:
  - `auc_roc`: Area Under the ROC Curve.
  - `fpr`: False Positive Rate (fraction of legitimate logins unnecessarily challenged).
  - `fnr`: False Negative Rate (fraction of attacks missed).
  - `threshold`: Optimal classification decision boundary.
  - `true_positives`, `true_negatives`, `false_positives`, `false_negatives`.

---

## 5. Inference Microservice API (`main.py`)

### Model Lifecycle & Startup (`lifespan`)
At service startup, `load_model()` checks for `model/sentinel.ubj`. If present and non-empty:
- Loads the trained XGBoost model using `xgb.Booster().load_model(path)`.
- Sets `MODEL_VERSION = "xgboost-v1"`.
- If missing or corrupted, logs a warning and initializes in **heuristic placeholder mode** (`MODEL_VERSION = "placeholder-v0"`).

### Inference Endpoint (`POST /infer`)
- **Request Body**: `LoginFeatures` JSON object.
- **Response**: `InferenceResult` (`{ risk_score: float, model_version: str }`).
- Execution Sequence:
  1. Calls `engineer_features(features)` to construct feature vector.
  2. If model is loaded: Passes vector to `xgb.DMatrix` with explicit feature names `["hour_sin", "hour_cos", "hour_frequency_score", "geo_velocity_normalized", "is_new_device", "velocity_anomaly", "has_fingerprint", "geo_available"]`.
  3. Obtains probability prediction from `model.predict(dmatrix)[0]`.
  4. Clamps score to range $[0.0, 1.0]$.

### Rule-Based Heuristic Fallback (`_heuristic_score`)
If no trained model file exists on disk, `POST /infer` uses additive heuristic scoring:

```python
def _heuristic_score(features: LoginFeatures) -> float:
    score = 0.0
    if features.is_new_device:
        score += 0.3
    if features.velocity_anomaly:
        score += 0.3
    if features.hour_frequency_score < 0.1:
        score += 0.2
    if features.geo_velocity_kmh > 900:
        score += 0.4
    if not features.fingerprint:
        score += 0.1
    return min(score, 1.0)
```

### Health Monitoring Endpoint (`GET /health`)
Returns microservice status:
```json
{
  "status": "ok",
  "model_loaded": true,
  "model_version": "xgboost-v1"
}
```
