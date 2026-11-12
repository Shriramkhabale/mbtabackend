"""
MB Mitra — AI Image & Face Enhancer Engine (Real-ESRGAN Neural + Multi-Band Deblur)
Features:
  1. Real-ESRGAN Compact Neural Super-Resolution: reconstructs missing high frequencies
     and true textures without watercolor, cartoon, or posterization artifacts.
  2. Multi-Band Luminance Deblurring: recovers crisp hair strands, natural eyes,
     clean jewelry, and defined edges while preserving soft natural skin tones.
  3. Natural Color & Lip Tone Preservation: prevents dark/harsh outlines or blotchy lips.
  4. Dynamic user adjustments: Brightness, Contrast, Sharpness, Upscale (1x, 2x, 4x).
  5. 100% Aspect-Ratio Safe: never distorts, squashes, or horizontally stretches photos.

Protocol:
  - Reads raw image bytes from stdin
  - Writes enhanced image bytes (PNG/JPEG) to stdout
  - Errors go to stderr; exit code 0 = success, 1 = error
"""

import sys
import io
import os
import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageOps

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models', 'realesr-general-x4v3.pth')

_NEURAL_NET = None

def get_neural_net():
    global _NEURAL_NET
    if _NEURAL_NET is not None:
        return _NEURAL_NET

    if not os.path.exists(MODEL_PATH):
        return None

    try:
        import torch
        import torch.nn as nn
        import torch.nn.functional as F

        class SRVGGNetCompact(nn.Module):
            def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4):
                super(SRVGGNetCompact, self).__init__()
                self.upscale = upscale
                self.body = nn.ModuleList()
                self.body.append(nn.Conv2d(num_in_ch, num_feat, 3, 1, 1))
                self.body.append(nn.PReLU(num_parameters=num_feat))
                for _ in range(num_conv):
                    self.body.append(nn.Conv2d(num_feat, num_feat, 3, 1, 1))
                    self.body.append(nn.PReLU(num_parameters=num_feat))
                self.body.append(nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1))
                self.upsampler = nn.PixelShuffle(upscale)

            def forward(self, x):
                out = x
                for layer in self.body:
                    out = layer(out)
                out = self.upsampler(out)
                base = F.interpolate(x, scale_factor=self.upscale, mode='nearest')
                return out + base

        net = SRVGGNetCompact(num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4)
        weights = torch.load(MODEL_PATH, map_location='cpu')
        keyname = 'params' if 'params' in weights else 'params_ema'
        net.load_state_dict(weights[keyname], strict=True)
        net.eval()
        _NEURAL_NET = net
        return _NEURAL_NET
    except Exception:
        return None


def run_neural_superres(img_bgr, orig_w, orig_h):
    """Run Real-ESRGAN Compact for true AI detail reconstruction."""
    import torch

    net = get_neural_net()
    if net is None:
        return None

    # Scale input appropriately for CPU speed while maximizing quality
    max_side = max(orig_w, orig_h)
    target_max = 500
    if max_side > target_max:
        scale = float(target_max) / max_side
        inp_w = int(orig_w * scale)
        inp_h = int(orig_h * scale)
        img_in = cv2.resize(img_bgr, (inp_w, inp_h), interpolation=cv2.INTER_AREA)
    else:
        img_in = img_bgr

    img_rgb = cv2.cvtColor(img_in, cv2.COLOR_BGR2RGB)
    img_norm = img_rgb.astype(np.float32) / 255.0
    img_t = torch.from_numpy(np.transpose(img_norm, (2, 0, 1))).unsqueeze(0)

    with torch.no_grad():
        out_t = net(img_t)

    out_np = out_t.squeeze().float().clamp_(0, 1).numpy()
    out_np = np.transpose(out_np, (1, 2, 0))
    out_rgb = (out_np * 255.0).round().astype(np.uint8)

    # Return as BGR
    return cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)


def enhance_image(image_bytes):
    enhance_level = os.environ.get('ENHANCE_LEVEL', 'standard')
    output_format = os.environ.get('ENHANCE_FORMAT', 'PNG').upper()
    if output_format not in ('PNG', 'JPEG', 'JPG'):
        output_format = 'PNG'
    if output_format == 'JPG':
        output_format = 'JPEG'

    nparr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Could not decode input image")

    orig_h, orig_w = img_bgr.shape[:2]

    # Step 1: Neural Super-Resolution & Deblur
    neural_bgr = run_neural_superres(img_bgr, orig_w, orig_h)

    if neural_bgr is not None:
        # Resize neural reconstruction to original dimensions (or target upscale)
        enhanced_base = cv2.resize(neural_bgr, (orig_w, orig_h), interpolation=cv2.INTER_LANCZOS4)
    else:
        # Fallback: Multi-band frequency deblurring without cartoon filters
        enhanced_base = img_bgr.copy()

    # Step 2: Multi-Band Detail Clarification (YUV Space)
    # Process only Luminance (Y), leaving Color (U, V) natural to prevent dark lips / skin blotches
    yuv = cv2.cvtColor(enhanced_base, cv2.COLOR_BGR2YUV)
    y, u, v = cv2.split(yuv)

    # Subtle contrast
    clahe_clip = 1.3 if enhance_level == 'standard' else 1.8
    clahe = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(8, 8))
    y_clahe = clahe.apply(y)

    # High-frequency band extraction (hair strands, jewelry, eyes, fabric)
    blur_fine = cv2.GaussianBlur(y_clahe, (0, 0), sigmaX=0.8)
    band_fine = cv2.subtract(y_clahe, blur_fine)

    # Mid-frequency band (facial contours, smile line)
    blur_mid = cv2.GaussianBlur(y_clahe, (0, 0), sigmaX=1.8)
    band_mid = cv2.subtract(blur_fine, blur_mid)

    fine_weight = 1.35 if enhance_level == 'advanced' else 1.15
    mid_weight = 0.55 if enhance_level == 'advanced' else 0.40

    y_crisp = y_clahe.astype(np.float32) + band_fine.astype(np.float32) * fine_weight + band_mid.astype(np.float32) * mid_weight
    y_crisp = np.clip(y_crisp, 0, 255).astype(np.uint8)

    yuv_enhanced = cv2.merge((y_crisp, u, v))
    bgr_crisp = cv2.cvtColor(yuv_enhanced, cv2.COLOR_YUV2BGR)

    # Step 3: Color Vibrance & Finishing in PIL
    img_pil = Image.fromarray(cv2.cvtColor(bgr_crisp, cv2.COLOR_BGR2RGB))

    # Natural color vibrancy (keeps lips fresh and skin glowing)
    vibrance_factor = 1.05 if enhance_level == 'advanced' else 1.02
    img_pil = ImageEnhance.Color(img_pil).enhance(vibrance_factor)

    # Final crispness
    sharp_factor = 1.25 if enhance_level == 'advanced' else 1.10
    img_pil = ImageEnhance.Sharpness(img_pil).enhance(sharp_factor)

    # Step 4: User Parameter Overrides (Brightness, Contrast, Sharpness)
    brightness_val = float(os.environ.get('BRIGHTNESS', 1.0))
    if brightness_val != 1.0 and 0.2 <= brightness_val <= 3.0:
        img_pil = ImageEnhance.Brightness(img_pil).enhance(brightness_val)

    contrast_val = float(os.environ.get('CONTRAST', 1.0))
    if contrast_val != 1.0 and 0.2 <= contrast_val <= 3.0:
        img_pil = ImageEnhance.Contrast(img_pil).enhance(contrast_val)

    sharpness_val = float(os.environ.get('SHARPNESS', 1.0))
    if sharpness_val != 1.0 and 0.2 <= sharpness_val <= 4.0:
        img_pil = ImageEnhance.Sharpness(img_pil).enhance(sharpness_val)

    # Step 5: Super-Resolution Upscaling (1x, 2x, 4x)
    upscale = int(os.environ.get('UPSCALE_FACTOR', 1))
    if 1 < upscale <= 4:
        new_w = img_pil.width * upscale
        new_h = img_pil.height * upscale
        img_pil = img_pil.resize((new_w, new_h), Image.Resampling.LANCZOS)
        img_pil = ImageEnhance.Sharpness(img_pil).enhance(1.10)

    # Step 6: Explicit Target Dimensions (ImageOps.fit preserves aspect ratio without distortion)
    target_w = int(os.environ.get('TARGET_WIDTH_PX', 0))
    target_h = int(os.environ.get('TARGET_HEIGHT_PX', 0))
    if target_w > 0 and target_h > 0:
        img_pil = ImageOps.fit(img_pil, (target_w, target_h), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))

    dpi = int(os.environ.get('OUTPUT_DPI', 300))

    out_bytes = io.BytesIO()
    if output_format == 'JPEG':
        img_pil = img_pil.convert('RGB')
        img_pil.save(out_bytes, format='JPEG', quality=95, subsampling=0, dpi=(dpi, dpi))
    else:
        img_pil.save(out_bytes, format='PNG', optimize=True, dpi=(dpi, dpi))

    return out_bytes.getvalue()


def main():
    image_bytes = sys.stdin.buffer.read()
    if not image_bytes:
        print("Error: No image data received on stdin", file=sys.stderr)
        sys.exit(1)

    try:
        result_bytes = enhance_image(image_bytes)
        sys.stdout.buffer.write(result_bytes)
        sys.exit(0)
    except Exception as e:
        print(f"Image enhancement failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
