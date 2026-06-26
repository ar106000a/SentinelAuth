"""
Standalone evaluation script — run against saved model and dataset.

Usage:
    python model/evaluate.py
"""

import os
import sys
import json

import numpy as np
import xgboost as xgb
from sklearn.metrics import (
    roc_auc_score,
    confusion_matrix,
    classification_report,
)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from model.dataset import generate_dataset

MODEL_PATH = os.path.join(os.path.dirname(__file__), "sentinel.ubj")
METRICS_PATH = os.path.join(os.path.dirname(__file__), "metrics.json")


def evaluate(threshold: float = 0.5):
    if not os.path.exists(MODEL_PATH):
        print("No model found. Run: python model/train.py")
        return

    # Load model
    booster = xgb.Booster()
    booster.load_model(MODEL_PATH)

    # Generate fresh evaluation dataset (different seed from training)
    X, y = generate_dataset(n_samples=10000, malicious_ratio=0.15, random_seed=99)
    dmatrix = xgb.DMatrix(X)
    y_proba = booster.predict(dmatrix)
    y_pred = (y_proba >= threshold).astype(int)

    cm = confusion_matrix(y, y_pred)
    tn, fp, fn, tp = cm.ravel()

    fpr = fp / (fp + tn)
    fnr = fn / (fn + tp)
    auc = roc_auc_score(y, y_proba)

    print("\n" + "=" * 50)
    print("SentinelAuth Model Evaluation")
    print("=" * 50)
    print(f"AUC-ROC:            {auc:.4f}")
    print(f"Threshold:          {threshold}")
    print(f"FPR (false alarms): {fpr:.4f} ({fpr*100:.1f}%)")
    print(f"FNR (missed):       {fnr:.4f} ({fnr*100:.1f}%)")
    print(f"\nConfusion Matrix:")
    print(f"  True Negatives:  {tn:>6}  (legitimate correctly allowed)")
    print(f"  False Positives: {fp:>6}  (legitimate incorrectly challenged)")
    print(f"  False Negatives: {fn:>6}  (attacks missed)")
    print(f"  True Positives:  {tp:>6}  (attacks caught)")
    print("=" * 50)
    print("\nClassification Report:")
    print(classification_report(y, y_pred, target_names=["legitimate", "malicious"]))

    return {"auc": auc, "fpr": fpr, "fnr": fnr}


if __name__ == "__main__":
    import sys
    threshold = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
    evaluate(threshold)