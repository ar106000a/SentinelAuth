"""
Synthetic dataset generator for SentinelAuth risk model.

Generates labelled login attempts with realistic feature distributions.
Label: 0 = legitimate, 1 = malicious / high risk

Feature columns (must match engineer_features output order):
  0: hour_sin
  1: hour_cos
  2: hour_frequency_score
  3: geo_velocity_normalized  (geo_velocity_kmh / 2000.0)
  4: is_new_device
  5: velocity_anomaly
  6: has_fingerprint
  7: geo_available
"""

import numpy as np
import pandas as pd
from typing import Tuple


def generate_dataset(
    n_samples: int = 50000,
    malicious_ratio: float = 0.15,
    random_seed: int = 42,
) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Generate a synthetic dataset of login attempts.

    Args:
        n_samples:       Total number of login attempts to generate
        malicious_ratio: Fraction of samples that are malicious (0.0-1.0)
        random_seed:     For reproducibility

    Returns:
        X: DataFrame of features
        y: Series of labels (0 = legitimate, 1 = malicious)
    """
    rng = np.random.default_rng(random_seed)

    n_malicious = int(n_samples * malicious_ratio)
    n_legitimate = n_samples - n_malicious

    # ── Legitimate logins ────────────────────────────────────────────────────
    # Characteristics:
    #   - Login hours cluster around business hours and evening (6-23)
    #   - High hour frequency score (user logs in at consistent times)
    #   - Low geo velocity (same city/region)
    #   - Mostly known devices
    #   - No velocity anomaly
    #   - Usually have fingerprint

    leg_hours = rng.choice(
        np.arange(0, 24),
        size=n_legitimate,
        p=_hour_distribution("legitimate"),
    )
    leg_hour_sin = np.sin(2 * np.pi * leg_hours / 24)
    leg_hour_cos = np.cos(2 * np.pi * leg_hours / 24)

    legitimate = pd.DataFrame({
        "hour_sin":               leg_hour_sin,
        "hour_cos":               leg_hour_cos,
        "hour_frequency_score":   rng.beta(5, 1.5, n_legitimate),  # skewed high
        "geo_velocity_normalized": rng.exponential(0.01, n_legitimate).clip(0, 1),
        "is_new_device":          rng.choice([0, 1], n_legitimate, p=[0.92, 0.08]),
        "velocity_anomaly":       rng.choice([0, 1], n_legitimate, p=[0.97, 0.03]),
        "has_fingerprint":        rng.choice([0, 1], n_legitimate, p=[0.05, 0.95]),
        "geo_available":          rng.choice([0, 1], n_legitimate, p=[0.3, 0.7]),
        "label":                  0,
    })

    # ── Malicious logins ─────────────────────────────────────────────────────
    # Three attack patterns mixed together:
    #   (A) Credential stuffing — many accounts, off-hours, new devices
    #   (B) Account takeover — correct password, unusual time/location
    #   (C) Distributed attack — velocity anomaly, multiple IPs

    n_a = int(n_malicious * 0.4)   # credential stuffing
    n_b = int(n_malicious * 0.35)  # account takeover
    n_c = n_malicious - n_a - n_b  # distributed

    # Pattern A: credential stuffing
    a_hours = rng.choice(np.arange(0, 24), size=n_a, p=_hour_distribution("offhours"))
    a_hour_sin = np.sin(2 * np.pi * a_hours / 24)
    a_hour_cos = np.cos(2 * np.pi * a_hours / 24)

    pattern_a = pd.DataFrame({
        "hour_sin":               a_hour_sin,
        "hour_cos":               a_hour_cos,
        "hour_frequency_score":   rng.beta(1, 5, n_a),     # skewed low
        "geo_velocity_normalized": rng.uniform(0, 0.3, n_a),
        "is_new_device":          rng.choice([0, 1], n_a, p=[0.1, 0.9]),
        "velocity_anomaly":       rng.choice([0, 1], n_a, p=[0.2, 0.8]),
        "has_fingerprint":        rng.choice([0, 1], n_a, p=[0.6, 0.4]),
        "geo_available":          rng.choice([0, 1], n_a, p=[0.5, 0.5]),
        "label":                  1,
    })

    # Pattern B: account takeover
    b_hours = rng.choice(np.arange(0, 24), size=n_b, p=_hour_distribution("offhours"))
    b_hour_sin = np.sin(2 * np.pi * b_hours / 24)
    b_hour_cos = np.cos(2 * np.pi * b_hours / 24)

    pattern_b = pd.DataFrame({
        "hour_sin":               b_hour_sin,
        "hour_cos":               b_hour_cos,
        "hour_frequency_score":   rng.beta(1.5, 4, n_b),
        "geo_velocity_normalized": rng.beta(2, 1, n_b).clip(0.2, 1.0),  # high velocity
        "is_new_device":          rng.choice([0, 1], n_b, p=[0.3, 0.7]),
        "velocity_anomaly":       rng.choice([0, 1], n_b, p=[0.4, 0.6]),
        "has_fingerprint":        rng.choice([0, 1], n_b, p=[0.4, 0.6]),
        "geo_available":          rng.choice([0, 1], n_b, p=[0.2, 0.8]),
        "label":                  1,
    })

    # Pattern C: distributed attack
    c_hours = rng.choice(np.arange(0, 24), size=n_c, p=_hour_distribution("offhours"))
    c_hour_sin = np.sin(2 * np.pi * c_hours / 24)
    c_hour_cos = np.cos(2 * np.pi * c_hours / 24)

    pattern_c = pd.DataFrame({
        "hour_sin":               c_hour_sin,
        "hour_cos":               c_hour_cos,
        "hour_frequency_score":   rng.beta(1, 3, n_c),
        "geo_velocity_normalized": rng.uniform(0, 0.5, n_c),
        "is_new_device":          rng.choice([0, 1], n_c, p=[0.05, 0.95]),
        "velocity_anomaly":       np.ones(n_c),   # always flagged
        "has_fingerprint":        rng.choice([0, 1], n_c, p=[0.5, 0.5]),
        "geo_available":          rng.choice([0, 1], n_c, p=[0.4, 0.6]),
        "label":                  1,
    })

    # ── Combine and shuffle ───────────────────────────────────────────────────
    df = pd.concat([legitimate, pattern_a, pattern_b, pattern_c], ignore_index=True)
    df = df.sample(frac=1, random_state=random_seed).reset_index(drop=True)

    X = df.drop(columns=["label"])
    y = df["label"]

    return X, y


def _hour_distribution(pattern: str) -> list:
    """
    Return a probability distribution over 24 hours.

    "legitimate" — peaks during business hours and evening
    "offhours"   — peaks at night and early morning
    """
    if pattern == "legitimate":
        # Low at night, high during 8-22
        weights = np.array([
            0.5, 0.3, 0.2, 0.2, 0.3, 0.5,   # 0-5
            1.0, 2.0, 4.0, 5.0, 5.0, 5.0,   # 6-11
            4.5, 4.0, 4.0, 4.5, 5.0, 5.0,   # 12-17
            5.0, 4.5, 4.0, 3.5, 2.5, 1.5,   # 18-23
        ])
    else:  # offhours / malicious
        # Peaks at night and early morning — attackers run overnight
        weights = np.array([
            5.0, 5.0, 5.0, 4.5, 4.0, 3.0,   # 0-5
            2.0, 1.5, 1.0, 0.8, 0.8, 0.8,   # 6-11
            1.0, 1.0, 1.0, 1.0, 1.2, 1.5,   # 12-17
            2.0, 2.5, 3.0, 3.5, 4.0, 5.0,   # 18-23
        ])

    return (weights / weights.sum()).tolist()