"""
XGBoost training pipeline for SentinelAuth risk model.

Usage:
    python model/train.py

Outputs:
    model/sentinel.ubj  — trained XGBoost model
    model/metrics.json  — evaluation metrics
"""

import os
import sys
import json
import logging

import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    classification_report,
    roc_auc_score,
    confusion_matrix,
)

# Add parent directory to path so we can import dataset
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from model.dataset import generate_dataset

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")
logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "sentinel.ubj")
METRICS_PATH = os.path.join(os.path.dirname(__file__), "metrics.json")


def train():
    # ── 1. Generate dataset ───────────────────────────────────────────────────
    logger.info("Generating synthetic dataset...")
    X, y = generate_dataset(n_samples=50000, malicious_ratio=0.15)

    logger.info(
        "Dataset: %d samples | %d legitimate | %d malicious",
        len(y), (y == 0).sum(), (y == 1).sum()
    )

    # ── 2. Train / validation split ───────────────────────────────────────────
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    logger.info(
        "Split: %d train | %d validation", len(y_train), len(y_val)
    )

    # ── 3. XGBoost DMatrix ────────────────────────────────────────────────────
    dtrain = xgb.DMatrix(X_train, label=y_train)
    dval = xgb.DMatrix(X_val, label=y_val)

    # ── 4. Hyperparameters ────────────────────────────────────────────────────
    # Scale pos weight handles class imbalance:
    # if 15% malicious → ratio = 85/15 ≈ 5.67
    scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()

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

    logger.info("Training XGBoost model...")
    logger.info("scale_pos_weight = %.2f", scale_pos_weight)

    # ── 5. Train with early stopping ──────────────────────────────────────────
    model = xgb.train(
        params,
        dtrain,
        num_boost_round=300,
        evals=[(dtrain, "train"), (dval, "val")],
        early_stopping_rounds=20,
        verbose_eval=50,
    )

    # ── 6. Evaluate ───────────────────────────────────────────────────────────
    logger.info("Evaluating on validation set...")
    y_pred_proba = model.predict(dval)

    # Try multiple thresholds — lower threshold = more sensitive (catches more attacks)
    # but more false positives (more legitimate users get MFA challenged)
    thresholds = [0.3, 0.5, 0.7]
    best_threshold = 0.5
    best_f1 = 0.0

    for threshold in thresholds:
        y_pred = (y_pred_proba >= threshold).astype(int)
        report = classification_report(y_val, y_pred, output_dict=True)
        f1 = report["1"]["f1-score"]
        logger.info("Threshold %.1f → F1=%.4f", threshold, f1)
        if f1 > best_f1:
            best_f1 = f1
            best_threshold = threshold

    logger.info("Best threshold: %.1f", best_threshold)

    # Final evaluation at best threshold
    y_pred_final = (y_pred_proba >= best_threshold).astype(int)
    cm = confusion_matrix(y_val, y_pred_final)
    tn, fp, fn, tp = cm.ravel()

    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
    auc = roc_auc_score(y_val, y_pred_proba)

    metrics = {
        "auc_roc": round(float(auc), 4),
        "fpr": round(float(fpr), 4),
        "fnr": round(float(fnr), 4),
        "threshold": best_threshold,
        "true_positives": int(tp),
        "true_negatives": int(tn),
        "false_positives": int(fp),
        "false_negatives": int(fn),
        "best_iteration": model.best_iteration,
    }

    logger.info("=" * 50)
    logger.info("AUC-ROC:  %.4f", metrics["auc_roc"])
    logger.info("FPR:      %.4f (%.1f%% legitimate users unnecessarily challenged)",
                fpr, fpr * 100)
    logger.info("FNR:      %.4f (%.1f%% attacks missed)",
                fnr, fnr * 100)
    logger.info("=" * 50)

    # ── 7. Save model and metrics ─────────────────────────────────────────────
    model.save_model(MODEL_PATH)
    logger.info("Model saved to %s", MODEL_PATH)

    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)
    logger.info("Metrics saved to %s", METRICS_PATH)

    return model, metrics


if __name__ == "__main__":
    model, metrics = train()
    logger.info("Training complete.")