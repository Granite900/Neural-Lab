#!/usr/bin/env python3
"""
Download the handwritten-digit-collection-10x10 dataset via kagglehub,
extract only digits 0 and 1 from the image folders, and save them to a CSV file.
"""

import csv
import os
import kagglehub
from PIL import Image

# Download latest version
path = kagglehub.dataset_download("olivergibson/handwritten-digit-collection-10x10")
print("Path to dataset files:", path)

# Dataset layout: path/10x10 dataset/0/, path/10x10 dataset/1/, ... (folders = labels, .jpg inside)
dataset_dir = os.path.join(path, "10x10 dataset")
if not os.path.isdir(dataset_dir):
    raise FileNotFoundError(f"Dataset directory not found: {dataset_dir}")

def load_image_as_row(img_path):
    """Load a 10x10 image, convert to grayscale, flatten to 100 ints 0-255."""
    img = Image.open(img_path).convert("L")
    if img.size != (10, 10):
        img = img.resize((10, 10))
    return list(img.getdata())

# Collect (label, pixel_list) for digits 0 and 1
rows_01 = []
for label in (0, 1):
    label_dir = os.path.join(dataset_dir, str(label))
    if not os.path.isdir(label_dir):
        continue
    for f in sorted(os.listdir(label_dir)):
        if f.lower().endswith((".jpg", ".jpeg", ".png")):
            full_path = os.path.join(label_dir, f)
            try:
                pixels = load_image_as_row(full_path)
                rows_01.append([label] + pixels)
            except Exception as e:
                print(f"Skip {full_path}: {e}")

if not rows_01:
    raise FileNotFoundError(f"No images found for digits 0 and 1 under {dataset_dir}")

# CSV: label, p0, p1, ..., p99
fieldnames = ["label"] + [f"p{i}" for i in range(100)]
output_csv = "digits_01.csv"
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_csv)
with open(out_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(fieldnames)
    writer.writerows(rows_01)

print(f"Saved {len(rows_01)} rows (digits 0 and 1 only) to: {out_path}")
