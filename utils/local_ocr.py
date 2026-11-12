"""
MB Mitra — Local OCR Worker (Image to Text)
Uses EasyOCR with multi-language support including Hindi, English, Tamil, Telugu, etc.
Falls back to pytesseract (Tesseract OCR) if EasyOCR unavailable.

Protocol:
  - Reads raw image bytes from stdin
  - Writes extracted text to stdout (UTF-8)
  - Errors go to stderr; exit code 0 = success, 1 = error
"""

import sys
import io
import os

def ocr_with_easyocr(image_bytes):
    """EasyOCR extraction: multi-language, deep learning based."""
    import easyocr
    import numpy as np
    from PIL import Image, ImageEnhance, ImageOps

    # Supported language codes for Indian government documents
    # en + hi covers most Aadhaar, PAN, Voter ID, Ration Cards
    custom_langs_env = os.environ.get('OCR_LANGS', '').strip()
    if custom_langs_env:
        lang_list = [l.strip() for l in custom_langs_env.split(',') if l.strip()]
    else:
        lang_list = ['en', 'hi']

    extra_langs_env = os.environ.get('OCR_EXTRA_LANGS', '').strip()
    if extra_langs_env:
        for lang in extra_langs_env.split(','):
            lang = lang.strip()
            if lang and lang not in lang_list:
                lang_list.append(lang)

    reader = easyocr.Reader(lang_list, gpu=False, verbose=False)

    img = Image.open(io.BytesIO(image_bytes))

    # Apply preprocessing if specified
    preprocess_mode = os.environ.get('OCR_PREPROCESS', 'standard').lower().strip()
    if preprocess_mode in ('high_contrast', 'contrast'):
        img = ImageEnhance.Contrast(img).enhance(1.8)
        img = ImageEnhance.Sharpness(img).enhance(1.5)
    elif preprocess_mode in ('grayscale', 'gray'):
        img = ImageOps.grayscale(img)

    # Convert to RGB if needed (EasyOCR works best with RGB)
    if img.mode not in ('RGB', 'L'):
        img = img.convert('RGB')

    img_array = np.array(img)
    results = reader.readtext(img_array, detail=0, paragraph=True)

    extracted_text = '\n'.join(str(r) for r in results if r and str(r).strip())
    return extracted_text


def ocr_with_tesseract(image_bytes):
    """pytesseract fallback: Tesseract OCR."""
    import pytesseract
    from PIL import Image, ImageEnhance, ImageOps

    img = Image.open(io.BytesIO(image_bytes))
    preprocess_mode = os.environ.get('OCR_PREPROCESS', 'standard').lower().strip()
    if preprocess_mode in ('high_contrast', 'contrast'):
        img = ImageEnhance.Contrast(img).enhance(1.8)
        img = ImageEnhance.Sharpness(img).enhance(1.5)
    elif preprocess_mode in ('grayscale', 'gray'):
        img = ImageOps.grayscale(img)

    # Use multiple language data files if available
    lang = os.environ.get('OCR_LANGS') or os.environ.get('TESSERACT_LANGS', 'eng+hin')
    try:
        text = pytesseract.image_to_string(img, lang=lang)
    except pytesseract.TesseractError:
        # Fallback to English only if multi-lang fails
        text = pytesseract.image_to_string(img, lang='eng')
    return text.strip()


def main():
    image_bytes = sys.stdin.buffer.read()
    if not image_bytes:
        print("Error: No image data received on stdin", file=sys.stderr)
        sys.exit(1)

    # Try EasyOCR first (best quality for Indian IDs)
    try:
        text = ocr_with_easyocr(image_bytes)
        sys.stdout.buffer.write(text.encode('utf-8'))
        sys.exit(0)
    except ImportError:
        print("Warning: easyocr not available, falling back to pytesseract", file=sys.stderr)
    except Exception as e:
        print(f"EasyOCR failed: {e}, falling back to pytesseract", file=sys.stderr)

    # Fallback: Tesseract
    try:
        text = ocr_with_tesseract(image_bytes)
        sys.stdout.buffer.write(text.encode('utf-8'))
        sys.exit(0)
    except Exception as e:
        print(f"pytesseract OCR failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
