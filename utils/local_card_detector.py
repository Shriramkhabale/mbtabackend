"""
MB Mitra — Local ID Card Box Detector Worker
Analyzes PDF pages using PyMuPDF (fitz) to accurately detect the boundaries
of government ID cards (Aadhaar, PAN, Voter ID, PMJAY Ayushman) based on
official UIDAI / NSDL / ECI / NHA standards.

Eliminates:
  - Scissor cut lines (dashed lines with scissors icons)
  - Text above the cut line ("माझे आधार, माझी ओळख", "Entities seeking Aadhaar...", etc.)
  - Text below the card (footer banners, disclaimers)
  - Center vertical cut lines between front and back cards

Protocol:
  - Reads raw PDF bytes from stdin
  - Writes JSON result to stdout:
    { "frontBox": { "left", "bottom", "right", "top" }, "backBox": { ... }, "mode": "smart_detected"|"calibrated_standard" }
  - Exit code 0 on success, 1 on error
"""

import sys
import json
import os
import re

try:
    import fitz
except ImportError:
    fitz = None


def get_calibrated_baseline(card_type, scale_x, scale_y):
    """Calibrated coordinates from official scissor cut line to card boundary on all 4 sides."""
    if card_type in ('aadhaar', 'aadhar'):
        # Crop exactly from the top scissor cut line (235 pt) down to the bottom red line (71 pt) / helpline (60 pt)
        # Fully preserves the Ashoka emblem, Bharat Sarkar / Govt of India, tricolor and Aadhaar logo
        # Completely excludes top banner ("माझे आधार, माझी ओळख") and bottom banner below the red line
        top_y = 235.0 * scale_y
        bot_front_y = 71.0 * scale_y
        bot_back_y = 60.0 * scale_y
        return {
            'frontBox': {
                'left': round(36.0 * scale_x, 2),
                'bottom': round(bot_front_y, 2),
                'right': round(288.0 * scale_x, 2),
                'top': round(top_y, 2)
            },
            'backBox': {
                'left': round(298.0 * scale_x, 2),
                'bottom': round(bot_back_y, 2),
                'right': round(550.0 * scale_x, 2),
                'top': round(top_y, 2)
            },
            'mode': 'calibrated_standard'
        }

    if card_type == 'pan':
        top_y = 200.0 * scale_y
        bot_y = 29.5 * scale_y
        return {
            'frontBox': {
                'left': round(32.0 * scale_x, 2),
                'bottom': round(bot_y, 2),
                'right': round(282.0 * scale_x, 2),
                'top': round(top_y, 2)
            },
            'backBox': {
                'left': round(292.0 * scale_x, 2),
                'bottom': round(bot_y, 2),
                'right': round(560.0 * scale_x, 2),
                'top': round(top_y, 2)
            },
            'mode': 'calibrated_standard'
        }

    if card_type in ('voter', 'epic'):
        top_y = 748.5 * scale_y
        bot_y = 591.5 * scale_y
        return {
            'frontBox': {
                'left': round(31.0 * scale_x, 2),
                'bottom': round(bot_y, 2),
                'right': round(280.0 * scale_x, 2),
                'top': round(top_y, 2)
            },
            'backBox': {
                'left': round(325.5 * scale_x, 2),
                'bottom': round(bot_y, 2),
                'right': round(574.0 * scale_x, 2),
                'top': round(top_y, 2)
            },
            'mode': 'calibrated_standard'
        }

    if card_type in ('pmjay', 'ayushman'):
        top_y = 225.0 * scale_y
        bot_y = 55.0 * scale_y
        return {
            'frontBox': {
                'left': round(38.0 * scale_x, 2),
                'bottom': round(bot_y, 2),
                'right': round(292.0 * scale_x, 2),
                'top': round(top_y, 2)
            },
            'backBox': {
                'left': round(298.0 * scale_x, 2),
                'bottom': round(bot_y, 2),
                'right': round(552.0 * scale_x, 2),
                'top': round(top_y, 2)
            },
            'mode': 'calibrated_standard'
        }

    # Generic default
    top_y = 235.0 * scale_y
    bot_y = 65.0 * scale_y
    return {
        'frontBox': {
            'left': round(36.0 * scale_x, 2),
            'bottom': round(bot_y, 2),
            'right': round(288.0 * scale_x, 2),
            'top': round(top_y, 2)
        },
        'backBox': {
            'left': round(298.0 * scale_x, 2),
            'bottom': round(bot_y, 2),
            'right': round(550.0 * scale_x, 2),
            'top': round(top_y, 2)
        },
        'mode': 'calibrated_standard'
    }


def detect_card_boxes(pdf_bytes, card_type='aadhaar'):
    """Performs smart layout detection using PyMuPDF or falls back to calibrated baseline."""
    baseline = get_calibrated_baseline(card_type, 1.0, 1.0)
    if not fitz or not pdf_bytes:
        return baseline

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if len(doc) == 0:
            return baseline

        page = doc[0]
        pw = page.rect.width
        ph = page.rect.height
        scale_x = pw / 595.28
        scale_y = ph / 841.89

        baseline = get_calibrated_baseline(card_type, scale_x, scale_y)

        # Fitz coordinates: (0, 0) top-left, y increases downwards to ph
        # PDF-lib coordinates: (0, 0) bottom-left, y increases upwards to ph
        # Formula: y_pdflib = ph - y_fitz
        words = page.get_text("words")
        if not words:
            return baseline

        # ID Card zone is strictly in the lower portion of the A4 page
        # In fitz: y > ph - 250 * scale_y (bottom 250 pt)
        min_card_fitz_y = ph - 245.0 * scale_y
        max_card_fitz_y = ph - 25.0 * scale_y

        card_words = [w for w in words if min_card_fitz_y <= w[1] <= max_card_fitz_y]
        if not card_words:
            return baseline

        # UIDAI / Aadhaar card detection
        if card_type in ('aadhaar', 'aadhar'):
            # Detect Government of India / Bharat Sarkar header
            hdr_words = [
                w for w in card_words
                if any(k in w[4].lower() for k in ('government', 'india', 'bharat', 'sarkar', 'authority', 'identification'))
                and w[1] < ph - 170.0 * scale_y  # Upper half of card area
            ]

            # Detect Aadhaar 4-digit number groups in lower half
            num_words = [
                w for w in card_words
                if len(w[4]) == 4 and w[4].isdigit() and w[0] < pw * 0.5
                and w[1] > ph - 100.0 * scale_y
            ]

            if hdr_words:
                # Topmost word of the card header
                min_hdr_y = min(w[1] for w in hdr_words)
                # In PDF-lib coords:
                detected_top = (ph - min_hdr_y) + 8.0 * scale_y  # 8 pt margin for Ashoka emblem & tricolor
                # Clamp within safe boundaries (below cut line, above min top)
                clamped_top = min(218.0 * scale_y, max(195.0 * scale_y, detected_top))

                card_h = 153.5 * scale_y
                card_w = 243.0 * scale_x
                bot_y = clamped_top - card_h

                return {
                    'frontBox': {
                        'left': round(43.5 * scale_x, 2),
                        'bottom': round(bot_y, 2),
                        'right': round(43.5 * scale_x + card_w, 2),
                        'top': round(clamped_top, 2)
                    },
                    'backBox': {
                        'left': round(307.0 * scale_x, 2),
                        'bottom': round(bot_y, 2),
                        'right': round(307.0 * scale_x + card_w, 2),
                        'top': round(clamped_top, 2)
                    },
                    'mode': 'smart_detected'
                }

        # Income Tax Department / PAN card detection
        if card_type == 'pan':
            pan_hdr_words = [
                w for w in card_words
                if any(k in w[4].lower() for k in ('income', 'tax', 'department', 'permanent', 'utiitsl', 'nsdl', 'protean', 'आयक'))
            ]
            if pan_hdr_words:
                front_words = [w for w in card_words if w[0] < pw * 0.48]
                f_top = baseline['frontBox']['top']
                b_top = baseline['backBox']['top']
                if front_words:
                    min_y = min(w[1] for w in front_words)
                    detected_top = (ph - min_y) + 10.0 * scale_y
                    # Clamp strictly below scissor cut line (201 pt) and above header (195 pt)
                    clamped_top = min(200.5 * scale_y, max(195.0 * scale_y, detected_top))
                    f_top = clamped_top
                    b_top = clamped_top

                return {
                    'frontBox': {
                        'left': baseline['frontBox']['left'],
                        'bottom': baseline['frontBox']['bottom'],
                        'right': baseline['frontBox']['right'],
                        'top': round(f_top, 2)
                    },
                    'backBox': {
                        'left': baseline['backBox']['left'],
                        'bottom': baseline['backBox']['bottom'],
                        'right': baseline['backBox']['right'],
                        'top': round(b_top, 2)
                    },
                    'mode': 'smart_detected'
                }

        # ECI / Voter ID (e-EPIC) card detection
        if card_type in ('voter', 'epic'):
            # In official ECI e-EPIC, the card is in the upper portion of the page:
            # y_pdflib around 590 to 750 pt (in fitz: y between 90 and 260 pt)
            voter_hdr_words = [
                w for w in words
                if any(k in w[4].lower() for k in ('election', 'commission', 'e-electors', 'electors', 'epic', 'ಚುನಾವಣೆ', 'ಭಾರತ', 'ನಿರ್ವಾಚನ'))
                and (ph - w[3]) > 500.0 * scale_y
            ]
            if voter_hdr_words:
                front_words = [w for w in words if w[0] < pw * 0.48 and (ph - w[3]) > 550.0 * scale_y and (ph - w[1]) < 770.0 * scale_y]
                if front_words:
                    min_y = min(w[1] for w in front_words)
                    detected_top = (ph - min_y) + 12.0 * scale_y
                    clamped_top = min(755.0 * scale_y, max(740.0 * scale_y, detected_top))
                    card_h = 157.0 * scale_y
                    bot_y = clamped_top - card_h

                    return {
                        'frontBox': {
                            'left': baseline['frontBox']['left'],
                            'bottom': round(bot_y, 2),
                            'right': baseline['frontBox']['right'],
                            'top': round(clamped_top, 2)
                        },
                        'backBox': {
                            'left': baseline['backBox']['left'],
                            'bottom': round(bot_y, 2),
                            'right': baseline['backBox']['right'],
                            'top': round(clamped_top, 2)
                        },
                        'mode': 'smart_detected'
                    }

        return baseline

    except Exception as e:
        print(f"Warning: smart detection exception ({e}), using calibrated standard", file=sys.stderr)
        return baseline


def main():
    card_type = os.environ.get('CARD_TYPE', 'aadhaar').strip().lower()
    input_bytes = sys.stdin.buffer.read()

    result = detect_card_boxes(input_bytes, card_type)
    sys.stdout.write(json.dumps(result))
    sys.exit(0)


if __name__ == '__main__':
    main()

