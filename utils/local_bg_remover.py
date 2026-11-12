"""
MB Mitra — Local Background Remover Worker
Uses rembg (U²-Net / ONNX) for studio-grade background removal with alpha matting.
Falls back to GrabCut if rembg is unavailable.

Protocol:
  - Reads raw image bytes from stdin
  - Writes resulting PNG/JPEG bytes to stdout
  - All errors go to stderr; exit code 0 = success, 1 = error
"""

import sys
import io
import os

def preprocess_image(image_bytes):
    """Applies user rotation and crop coordinates before segmentation."""
    from PIL import Image
    inp = Image.open(io.BytesIO(image_bytes)).convert("RGBA")

    # If already pre-cropped by the interactive canvas, skip second crop
    is_pre_cropped = os.environ.get('IS_PRE_CROPPED', '').lower() in ('1', 'true', 'yes')

    # 1. Rotate if specified and not already pre-rotated
    rotate_deg = int(os.environ.get('ROTATE_DEGREES', 0))
    if rotate_deg in (90, 180, 270) and not is_pre_cropped:
        inp = inp.rotate(-rotate_deg, expand=True)

    # 2. Crop if CROP_BOX specified and not already pre-cropped
    if not is_pre_cropped:
        crop_str = os.environ.get('CROP_BOX', '').strip()
        crop_x = int(os.environ.get('CROP_X', -1))
        crop_y = int(os.environ.get('CROP_Y', -1))
        crop_w = int(os.environ.get('CROP_W', -1))
        crop_h = int(os.environ.get('CROP_H', -1))

        if crop_str:
            try:
                parts = [float(p) for p in crop_str.split(',') if p.strip()]
                if len(parts) == 4:
                    crop_x, crop_y, crop_w, crop_h = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
            except Exception:
                pass

        if crop_x >= 0 and crop_y >= 0 and crop_w > 0 and crop_h > 0:
            img_w, img_h = inp.size
            x1 = max(0, min(crop_x, img_w - 1))
            y1 = max(0, min(crop_y, img_h - 1))
            x2 = max(x1 + 1, min(crop_x + crop_w, img_w))
            y2 = max(y1 + 1, min(crop_y + crop_h, img_h))
            if x2 > x1 and y2 > y1:
                inp = inp.crop((x1, y1, x2, y2))

    return inp


def apply_background_options(img_rgba):
    from PIL import Image, ImageColor
    bg_color_str = os.environ.get('BG_COLOR', 'transparent').strip().lower()
    target_w = int(os.environ.get('TARGET_WIDTH_PX', 0))
    target_h = int(os.environ.get('TARGET_HEIGHT_PX', 0))
    dpi = int(os.environ.get('OUTPUT_DPI', 300))
    output_fmt = os.environ.get('OUTPUT_FORMAT', 'PNG').strip().upper()

    subj_scale = float(os.environ.get('SUBJECT_SCALE', 1.0))
    subj_offset_x = float(os.environ.get('SUBJECT_OFFSET_X', 0.0))
    subj_offset_y = float(os.environ.get('SUBJECT_OFFSET_Y', 0.0))

    # Resize subject to target dimensions if specified
    if target_w > 0 and target_h > 0:
        if subj_scale != 1.0 or subj_offset_x != 0.0 or subj_offset_y != 0.0:
            new_w = max(10, int(img_rgba.width * subj_scale))
            new_h = max(10, int(img_rgba.height * subj_scale))
            scaled_subj = img_rgba.resize((new_w, new_h), Image.Resampling.LANCZOS)

            canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
            pos_x = int((target_w - new_w) / 2 + subj_offset_x)
            pos_y = int((target_h - new_h) / 2 + subj_offset_y)
            canvas.paste(scaled_subj, (pos_x, pos_y), scaled_subj)
            img_rgba = canvas
        else:
            img_rgba = img_rgba.resize((target_w, target_h), Image.Resampling.LANCZOS)

    # Composite solid replacement background
    if bg_color_str and bg_color_str not in ('transparent', 'none', 'alpha', ''):
        color_map = {
            'white': (255, 255, 255),
            'blue': (37, 99, 235),
            'lightblue': (186, 230, 253),
            'sky_blue': (147, 197, 253),
            'light_blue': (186, 230, 253),
            'passport_blue': (186, 230, 253),
            'red': (220, 38, 38),
            'grey': (241, 245, 249),
            'gray': (241, 245, 249)
        }
        rgb = color_map.get(bg_color_str)
        if not rgb:
            try:
                rgb = ImageColor.getrgb(bg_color_str)
            except Exception:
                rgb = (255, 255, 255)

        solid_bg = Image.new("RGBA", img_rgba.size, (*rgb, 255))
        # Use alpha channel explicitly as mask for clean blending
        if img_rgba.mode == 'RGBA':
            solid_bg.paste(img_rgba, (0, 0), mask=img_rgba.split()[3])
        else:
            solid_bg.paste(img_rgba, (0, 0))
        img_rgba = solid_bg

    out_bytes = io.BytesIO()
    if output_fmt in ('JPG', 'JPEG'):
        if img_rgba.mode == 'RGBA':
            bg = Image.new("RGB", img_rgba.size, (255, 255, 255))
            bg.paste(img_rgba, mask=img_rgba.split()[3])
            img_rgb = bg
        else:
            img_rgb = img_rgba.convert("RGB")
        img_rgb.save(out_bytes, format="JPEG", quality=95, subsampling=0, dpi=(dpi, dpi))
    else:
        img_rgba.save(out_bytes, format="PNG", optimize=True, dpi=(dpi, dpi))

    return out_bytes.getvalue()


def refine_mask(mask_np, orig_h, orig_w, orig_rgb=None):
    """
    Studio-grade edge refinement:
    1. Removes background foliage/branches connected to image boundary
    2. Fills interior holes in subject (e.g. jewelry, transparent spots in clothing/glasses)
    3. Edge smoothing using bilateral filtering to preserve sharp clothing/body contours while eliminating pixel staircases
    4. Sub-pixel anti-aliasing on transition boundary for photo-studio quality blending
    """
    import cv2
    import numpy as np

    if mask_np is None or mask_np.size == 0:
        return mask_np

    # 1. Clean boundary-connected green foliage (leaves/branches that cling to hair/edges)
    if orig_rgb is not None:
        try:
            hsv = cv2.cvtColor(orig_rgb, cv2.COLOR_RGB2HSV)
            green_foliage = ((hsv[:, :, 0] >= 28) & (hsv[:, :, 0] <= 90) & (hsv[:, :, 1] >= 25) & (hsv[:, :, 2] >= 20)).astype(np.uint8)
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(green_foliage, connectivity=8)
            h, w = orig_rgb.shape[:2]
            boundary_mask = np.zeros((h, w), dtype=bool)
            boundary_mask[0, :] = True
            boundary_mask[-1, :] = True
            boundary_mask[:, 0] = True
            boundary_mask[:, -1] = True
            boundary_labels = np.unique(labels[boundary_mask])
            green_touching_boundary = np.isin(labels, boundary_labels) & (labels != 0)
            mask_np = mask_np.copy()
            mask_np[green_touching_boundary] = 0
        except Exception:
            pass

    # 2. Fill small interior holes inside the subject
    try:
        contours, hierarchy = cv2.findContours(mask_np, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        filled_mask = mask_np.copy()
        if hierarchy is not None:
            max_hole_area = orig_h * orig_w * 0.04
            for i, h_info in enumerate(hierarchy[0]):
                if h_info[3] >= 0:  # Interior hole
                    area = cv2.contourArea(contours[i])
                    if area < max_hole_area:
                        cv2.drawContours(filled_mask, [contours[i]], -1, 255, -1)
    except Exception:
        filled_mask = mask_np.copy()

    # 3. Edge smoothing: Bilateral filter removes staircasing without blurring sharp physical edges
    try:
        smoothed = cv2.bilateralFilter(filled_mask, d=5, sigmaColor=50, sigmaSpace=50)
    except Exception:
        smoothed = filled_mask

    # 4. Sub-pixel Anti-Aliasing on boundary pixels
    try:
        edge_band = (smoothed > 5) & (smoothed < 250)
        if np.any(edge_band):
            blurred_edge = cv2.GaussianBlur(smoothed, (3, 3), 0.8)
            smoothed[edge_band] = blurred_edge[edge_band]
    except Exception:
        pass

    return smoothed


def remove_background_rembg(image_bytes):
    from rembg import remove, new_session
    import numpy as np
    from PIL import Image

    inp = preprocess_image(image_bytes)
    model_name = os.environ.get("REMBG_MODEL", "u2net_human_seg").strip()

    session = None
    try:
        session = new_session(model_name)
    except Exception:
        try:
            session = new_session("u2net_human_seg")
        except Exception:
            session = new_session("u2net")

    # Extract high-precision mask from rembg
    try:
        raw_mask = remove(inp, session=session, only_mask=True, post_process_mask=True)
    except Exception:
        raw_mask = remove(inp, session=session, only_mask=True)

    mask_np = np.array(raw_mask)
    inp_rgb_np = np.array(inp.convert("RGB"))
    refined_alpha = refine_mask(mask_np, inp.height, inp.width, orig_rgb=inp_rgb_np)

    inp_rgba = inp.convert("RGBA")
    inp_rgba.putalpha(Image.fromarray(refined_alpha))

    return apply_background_options(inp_rgba)


def remove_background_grabcut(image_bytes):
    """GrabCut-based fallback tailored for portrait photos."""
    import cv2
    import numpy as np
    from PIL import Image

    inp = preprocess_image(image_bytes)
    img_rgb = np.array(inp.convert("RGB"))
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)

    h, w = img_bgr.shape[:2]

    # In a portrait photo, subject's shoulders touch the bottom and lower sides.
    # We only mark the top 3% as definite background.
    margin_top = max(1, int(h * 0.03))
    rect = (0, margin_top, w, h - margin_top)

    mask = np.zeros((h, w), np.uint8)
    mask[:, :] = cv2.GC_PR_FGD
    mask[0:margin_top, :] = cv2.GC_BGD

    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(img_bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)

    fg_mask = np.where((mask == 2) | (mask == 0), 0, 255).astype("uint8")
    refined_mask = refine_mask(fg_mask, h, w)

    img_pil = Image.fromarray(img_rgb).convert("RGBA")
    alpha = Image.fromarray(refined_mask)
    img_pil.putalpha(alpha)

    return apply_background_options(img_pil)


def main():
    image_bytes = sys.stdin.buffer.read()
    if not image_bytes:
        print("Error: No image data received on stdin", file=sys.stderr)
        sys.exit(1)

    # Try rembg first (best studio quality)
    try:
        result_bytes = remove_background_rembg(image_bytes)
        sys.stdout.buffer.write(result_bytes)
        sys.exit(0)
    except ImportError:
        print("Warning: rembg not available, falling back to GrabCut", file=sys.stderr)
    except Exception as e:
        print(f"rembg failed: {e}, falling back to GrabCut", file=sys.stderr)

    # Fallback: GrabCut
    try:
        result_bytes = remove_background_grabcut(image_bytes)
        sys.stdout.buffer.write(result_bytes)
        sys.exit(0)
    except Exception as e:
        print(f"GrabCut background removal failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
