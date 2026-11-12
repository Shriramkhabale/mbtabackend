"""
MB Mitra — Local Auto ID Card Crop Worker
Detects the bounding box of an ID card in an image or PDF page and
crops it precisely using OpenCV edge detection + contour analysis.

Supports: Aadhaar, PAN, Voter ID, Ration Card, PMJAY, Driving Licence

Protocol:
  - Reads raw image bytes from stdin
  - Writes cropped card image bytes (PNG) to stdout
  - Errors go to stderr; exit code 0 = success, 1 = error

Environment variables:
  CROP_TYPE: hint for aspect ratio: 'aadhaar', 'pan', 'voter', 'generic' (default)
  CROP_PADDING_PCT: extra padding fraction (default 0.015 = 1.5%)
"""

import sys
import io
import os
import cv2
import numpy as np
from PIL import Image

# Expected aspect ratios for each card type (width / height)
CARD_ASPECT_RATIOS = {
    'aadhaar':  1.585,   # ISO ID-1: 85.6 / 54.0
    'pan':      1.585,
    'voter':    1.585,
    'ration':   1.414,   # A5-ish
    'pmjay':    1.585,
    'driving':  1.585,
    'generic':  1.585,
}

def detect_card_contour(gray, crop_type='generic', min_area_ratio=0.04, max_area_ratio=0.92):
    """Find the best quadrilateral contour that matches government ID card standards."""
    h, w = gray.shape
    total_area = h * w
    target_ratio = CARD_ASPECT_RATIOS.get(crop_type, 1.585)

    # Adaptive threshold
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 15, 5
    )

    # Morphological closing to close card borders
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    candidates = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < total_area * min_area_ratio or area > total_area * max_area_ratio:
            continue

        # Approximate to polygon
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        x, y, bw, bh = cv2.boundingRect(approx if len(approx) >= 4 else cnt)

        if bh <= 0 or bw <= 0:
            continue

        ratio = bw / bh
        if not (0.7 < ratio < 3.0):
            continue

        rect_fill = area / float(bw * bh) if (bw * bh) > 0 else 0
        if rect_fill < 0.55:
            continue

        # Score candidate based on standard card aspect ratio and rectangularity
        ratio_score = 1.0 - min(1.0, abs(ratio - target_ratio) / target_ratio)
        size_score = min(1.0, area / (total_area * 0.45))
        score = (ratio_score * 0.55) + (rect_fill * 0.25) + (size_score * 0.20)
        candidates.append((score, (x, y, bw, bh)))

    if not candidates:
        return None

    # Return the highest-scoring candidate matching official card specs
    candidates.sort(key=lambda c: c[0], reverse=True)
    return candidates[0][1]  # (x, y, w, h)


def crop_image(image_bytes):
    crop_type = os.environ.get('CROP_TYPE', 'generic').lower()
    padding_pct = float(os.environ.get('CROP_PADDING_PCT', '0.015'))

    nparr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Could not decode input image")

    img_h, img_w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    bbox = detect_card_contour(gray, crop_type=crop_type)

    if bbox is None:
        # Fallback: use center crop based on known card aspect ratio
        target_ratio = CARD_ASPECT_RATIOS.get(crop_type, 1.585)
        img_ratio = img_w / img_h

        if img_ratio > target_ratio:
            # Image is wider — crop sides
            crop_h = img_h
            crop_w = int(crop_h * target_ratio)
            x = (img_w - crop_w) // 2
            y = 0
        else:
            # Image is taller — crop top/bottom
            crop_w = img_w
            crop_h = int(crop_w / target_ratio)
            x = 0
            y = (img_h - crop_h) // 2
    else:
        x, y, bw, bh = bbox
        pad_x = int(bw * padding_pct)
        pad_y = int(bh * padding_pct)
        x = max(0, x - pad_x)
        y = max(0, y - pad_y)
        bw = min(img_w - x, bw + 2 * pad_x)
        bh = min(img_h - y, bh + 2 * pad_y)
        crop_w, crop_h = bw, bh

    cropped = img_bgr[y:y + crop_h, x:x + crop_w]

    if cropped.size == 0:
        raise ValueError("Crop region is empty — card detection failed")

    target_w = int(os.environ.get('TARGET_WIDTH_PX', 0))
    target_h = int(os.environ.get('TARGET_HEIGHT_PX', 0))
    dpi = int(os.environ.get('OUTPUT_DPI', 300))
    out_format = os.environ.get('OUTPUT_FORMAT', 'PNG').upper()
    if out_format not in ('PNG', 'JPEG', 'JPG'):
        out_format = 'PNG'

    img_pil = Image.fromarray(cv2.cvtColor(cropped, cv2.COLOR_BGR2RGB))
    if target_w > 0 and target_h > 0:
        img_pil = img_pil.resize((target_w, target_h), Image.Resampling.LANCZOS)

    out_bytes = io.BytesIO()
    if out_format in ('JPEG', 'JPG'):
        img_pil.convert('RGB').save(out_bytes, format='JPEG', quality=95, dpi=(dpi, dpi))
    else:
        img_pil.save(out_bytes, format='PNG', optimize=True, dpi=(dpi, dpi))
    return out_bytes.getvalue()


def main():
    image_bytes = sys.stdin.buffer.read()
    if not image_bytes:
        print("Error: No image data received on stdin", file=sys.stderr)
        sys.exit(1)

    try:
        result_bytes = crop_image(image_bytes)
        sys.stdout.buffer.write(result_bytes)
        sys.exit(0)
    except Exception as e:
        print(f"Auto crop failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
