#!/usr/bin/env python3
"""
Pre-warm / Pre-download AI Models for MB Mitra Document & AI Tools.
This script downloads required model weights for:
  1. rembg (u2netp background removal model, ~4.7 MB or u2net ~176 MB)
  2. easyocr (CRAFT text detection ~49 MB, English recognition ~4.5 MB)

Run this during VPS deployment provisioning so first-time tool execution
does not experience cold-start network latency or timeouts.
"""

import os
import sys
import time

def print_header(title):
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)

def prewarm_rembg():
    print_header("1/2 Pre-warming Rembg (Background Removal Model)")
    try:
        import rembg
        model_name = os.environ.get("REMBG_MODEL", "u2netp")
        print(f"[*] Initializing rembg session with model '{model_name}'...")
        start_t = time.time()
        session = rembg.new_session(model_name)
        elapsed = time.time() - start_t
        
        # Check download location
        u2net_home = os.path.expanduser(os.environ.get("U2NET_HOME", "~/.u2net"))
        print(f"[+] Rembg session initialized successfully in {elapsed:.2f}s")
        print(f"[+] Model directory: {u2net_home}")
        if os.path.exists(u2net_home):
            for f in os.listdir(u2net_home):
                fpath = os.path.join(u2net_home, f)
                size_mb = os.path.getsize(fpath) / (1024 * 1024)
                print(f"    - {f}: {size_mb:.2f} MB")
        return True
    except ImportError:
        print("[!] rembg is not installed. Install with: pip install rembg")
        return False
    except Exception as e:
        print(f"[!] Error pre-warming rembg: {e}")
        return False

def prewarm_easyocr():
    print_header("2/2 Pre-warming EasyOCR (Text Detection & Recognition Models)")
    try:
        import easyocr
        print("[*] Initializing EasyOCR reader for languages: ['en'] (CPU mode)...")
        start_t = time.time()
        reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        elapsed = time.time() - start_t
        
        easyocr_home = os.path.expanduser(os.environ.get("EASYOCR_MODULE_PATH", "~/.EasyOCR"))
        print(f"[+] EasyOCR reader initialized successfully in {elapsed:.2f}s")
        print(f"[+] Model directory: {easyocr_home}")
        model_dir = os.path.join(easyocr_home, "model")
        if os.path.exists(model_dir):
            for f in os.listdir(model_dir):
                fpath = os.path.join(model_dir, f)
                size_mb = os.path.getsize(fpath) / (1024 * 1024)
                print(f"    - {f}: {size_mb:.2f} MB")
        return True
    except ImportError:
        print("[!] easyocr is not installed. Install with: pip install easyocr torch")
        return False
    except Exception as e:
        print(f"[!] Error pre-warming easyocr: {e}")
        return False

def main():
    print_header("MB Mitra Document & AI Tools — Model Pre-warm Utility")
    print(f"Python executable: {sys.executable}")
    print(f"Python version:    {sys.version.split()[0]}")
    
    rembg_ok = prewarm_rembg()
    easyocr_ok = prewarm_easyocr()
    
    print("\n" + "=" * 60)
    print(" PRE-WARM SUMMARY")
    print("=" * 60)
    print(f"  Rembg Status:   {'[READY]' if rembg_ok else '[FAILED/SKIPPED]'}")
    print(f"  EasyOCR Status: {'[READY]' if easyocr_ok else '[FAILED/SKIPPED]'}")
    print("=" * 60)
    
    if rembg_ok and easyocr_ok:
        print("[SUCCESS] All AI models pre-warmed and ready for production use.")
        sys.exit(0)
    else:
        print("[WARNING] One or more models could not be pre-warmed. Please check logs.")
        sys.exit(1)

if __name__ == "__main__":
    main()

