"""
MB Mitra — PDF Tools Engine Verification Test
Tests all 15 operations end-to-end:
1. image_to_pdf
2. pdf_to_images
3. word_to_pdf
4. pdf_to_word
5. pdf_to_excel
6. merge_pdfs
7. split_pdf
8. compress_pdf
9. rotate_pdf
10. reorder_pdf
11. delete_pages
12. add_page_numbers
13. protect_pdf
14. unlock_pdf
15. ocr_searchable_pdf
+ inspect_pdf
"""

import os
import sys
import json
import shutil
import subprocess
from PIL import Image, ImageDraw
import fitz
import docx

WORK_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(WORK_DIR, "test_temp")
os.makedirs(TEMP_DIR, exist_ok=True)

ENGINE_PATH = os.path.join(WORK_DIR, "pdf_engine.py")

passed = 0
failed = 0

def run_op(op, files, out_file, options={}):
    payload = {
        "operation": op,
        "files": files,
        "outputPath": out_file,
        "options": options
    }
    payload_file = os.path.join(TEMP_DIR, f"payload_{op}.json")
    with open(payload_file, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    res = subprocess.run([sys.executable, ENGINE_PATH, payload_file], capture_output=True, text=True)
    if res.returncode != 0:
        return {"success": False, "error": res.stdout + "\n" + res.stderr}
    try:
        # Extract JSON from stdout even if a library emitted a warning line
        stdout_lines = [l.strip() for l in res.stdout.strip().split("\n") if l.strip()]
        for line in reversed(stdout_lines):
            if line.startswith("{") and line.endswith("}"):
                return json.loads(line)
        return json.loads(res.stdout.strip())
    except Exception as e:
        return {"success": False, "error": f"JSON parse error: {e}, stdout: {res.stdout}"}


print("=== Starting PDF Tools Engine Verification Tests ===")

# Create Test Assets
# 1. Sample image
img_path1 = os.path.join(TEMP_DIR, "test_img1.jpg")
img1 = Image.new("RGB", (600, 400), color=(240, 245, 255))
d1 = ImageDraw.Draw(img1)
d1.text((30, 30), "MB MITRA TEST IMAGE 1", fill=(20, 20, 20))
img1.save(img_path1)

img_path2 = os.path.join(TEMP_DIR, "test_img2.png")
img2 = Image.new("RGB", (600, 400), color=(255, 245, 240))
d2 = ImageDraw.Draw(img2)
d2.text((30, 30), "MB MITRA TEST IMAGE 2", fill=(20, 20, 20))
img2.save(img_path2)

# 2. Sample multi-page PDF
sample_pdf = os.path.join(TEMP_DIR, "sample_4pages.pdf")
doc = fitz.open()
for i in range(1, 5):
    p = doc.new_page(width=595, height=842)
    p.insert_text((50, 72), f"Page {i} Content — MB Mitra Test Document")
    p.insert_text((50, 100), "Column1\tColumn2\tColumn3\nValA\tValB\tValC")
doc.save(sample_pdf)
doc.close()

# 3. Sample docx
sample_docx = os.path.join(TEMP_DIR, "sample_word.docx")
doc_word = docx.Document()
doc_word.add_heading("MB Mitra Document Heading", level=1)
doc_word.add_paragraph("This is a paragraph inside the Word document.")
t = doc_word.add_table(rows=2, cols=2)
t.cell(0, 0).text = "Header 1"
t.cell(0, 1).text = "Header 2"
t.cell(1, 0).text = "Row 1 Cell 1"
t.cell(1, 1).text = "Row 1 Cell 2"
doc_word.save(sample_docx)

# --- Test 1: Image to PDF ---
out1 = os.path.join(TEMP_DIR, "out1_images.pdf")
r1 = run_op("image_to_pdf", [img_path1, img_path2], out1, {"pageSize": "a4", "margin": 10})
if r1.get("success") and os.path.exists(out1) and len(fitz.open(out1)) == 2:
    print("✓ Test 1: Image to PDF PASSED (2 pages generated)")
    passed += 1
else:
    print("✗ Test 1: Image to PDF FAILED", r1)
    failed += 1

# --- Test 2: PDF to Images ---
out2 = os.path.join(TEMP_DIR, "out2_images.zip")
r2 = run_op("pdf_to_images", [sample_pdf], out2, {"format": "jpg", "dpi": 150})
if r2.get("success") and os.path.exists(out2) and os.path.getsize(out2) > 500:
    print("✓ Test 2: PDF to JPG/PNG PASSED (ZIP generated with pages)")
    passed += 1
else:
    print("✗ Test 2: PDF to Images FAILED", r2)
    failed += 1

# --- Test 3: Word to PDF ---
out3 = os.path.join(TEMP_DIR, "out3_from_word.pdf")
r3 = run_op("word_to_pdf", [sample_docx], out3)
if r3.get("success") and os.path.exists(out3) and len(fitz.open(out3)) >= 1:
    print(f"✓ Test 3: Word to PDF PASSED (Method: {r3['data'].get('method')})")
    passed += 1
else:
    print("✗ Test 3: Word to PDF FAILED", r3)
    failed += 1

# --- Test 4: PDF to Word ---
out4 = os.path.join(TEMP_DIR, "out4_from_pdf.docx")
r4 = run_op("pdf_to_word", [sample_pdf], out4)
if r4.get("success") and os.path.exists(out4) and os.path.getsize(out4) > 500:
    d_check = docx.Document(out4)
    print(f"✓ Test 4: PDF to Word PASSED ({len(d_check.paragraphs)} paragraphs extracted)")
    passed += 1
else:
    print("✗ Test 4: PDF to Word FAILED", r4)
    failed += 1

# --- Test 5: PDF to Excel ---
out5 = os.path.join(TEMP_DIR, "out5_from_pdf.xlsx")
r5 = run_op("pdf_to_excel", [sample_pdf], out5)
if r5.get("success") and os.path.exists(out5) and os.path.getsize(out5) > 500:
    print(f"✓ Test 5: PDF to Excel PASSED ({r5['data'].get('rowsExtracted')} rows extracted)")
    passed += 1
else:
    print("✗ Test 5: PDF to Excel FAILED", r5)
    failed += 1

# --- Test 6: Merge PDFs ---
out6 = os.path.join(TEMP_DIR, "out6_merged.pdf")
r6 = run_op("merge_pdfs", [out1, sample_pdf], out6)
if r6.get("success") and os.path.exists(out6) and len(fitz.open(out6)) == 6:
    print("✓ Test 6: Merge PDFs PASSED (2 + 4 = 6 pages)")
    passed += 1
else:
    print("✗ Test 6: Merge PDFs FAILED", r6)
    failed += 1

# --- Test 7: Split PDF ---
out7 = os.path.join(TEMP_DIR, "out7_split.pdf")
r7 = run_op("split_pdf", [sample_pdf], out7, {"mode": "range", "range": "2-3"})
if r7.get("success") and os.path.exists(out7) and len(fitz.open(out7)) == 2:
    print("✓ Test 7: Split PDF PASSED (Extracted pages 2-3)")
    passed += 1
else:
    print("✗ Test 7: Split PDF FAILED", r7)
    failed += 1

# --- Test 8: Compress PDF ---
out8 = os.path.join(TEMP_DIR, "out8_compressed.pdf")
r8 = run_op("compress_pdf", [out1], out8, {"level": "recommended"})
if r8.get("success") and os.path.exists(out8):
    print(f"✓ Test 8: Compress PDF PASSED (Savings: {r8['data'].get('savingsPercent')}%)")
    passed += 1
else:
    print("✗ Test 8: Compress PDF FAILED", r8)
    failed += 1

# --- Test 9: Rotate PDF ---
out9 = os.path.join(TEMP_DIR, "out9_rotated.pdf")
r9 = run_op("rotate_pdf", [sample_pdf], out9, {"angle": 90, "pages": "all"})
doc_rot = fitz.open(out9)
if r9.get("success") and os.path.exists(out9) and doc_rot[0].rotation == 90:
    print("✓ Test 9: Rotate PDF PASSED (Rotated 90°)")
    passed += 1
else:
    print("✗ Test 9: Rotate PDF FAILED", r9)
    failed += 1
doc_rot.close()

# --- Test 10: Reorder PDF ---
out10 = os.path.join(TEMP_DIR, "out10_reordered.pdf")
r10 = run_op("reorder_pdf", [sample_pdf], out10, {"order": [4, 1, 3, 2]})
doc_reo = fitz.open(out10)
if r10.get("success") and os.path.exists(out10) and len(doc_reo) == 4 and "Page 4" in doc_reo[0].get_text():
    print("✓ Test 10: Reorder PDF PASSED (Page 4 is now first)")
    passed += 1
else:
    print("✗ Test 10: Reorder PDF FAILED", r10)
    failed += 1
doc_reo.close()

# --- Test 11: Delete PDF Pages ---
out11 = os.path.join(TEMP_DIR, "out11_deleted.pdf")
r11 = run_op("delete_pages", [sample_pdf], out11, {"pages": [2, 4]})
doc_del = fitz.open(out11)
if r11.get("success") and os.path.exists(out11) and len(doc_del) == 2:
    print("✓ Test 11: Delete PDF Pages PASSED (4 - 2 = 2 pages remaining)")
    passed += 1
else:
    print("✗ Test 11: Delete PDF Pages FAILED", r11)
    failed += 1
doc_del.close()

# --- Test 12: Add Page Numbers ---
out12 = os.path.join(TEMP_DIR, "out12_numbered.pdf")
r12 = run_op("add_page_numbers", [sample_pdf], out12, {"position": "bottom-center", "format": "Page {n} of {total}"})
doc_num = fitz.open(out12)
if r12.get("success") and os.path.exists(out12) and "Page 1 of 4" in doc_num[0].get_text():
    print("✓ Test 12: Add Page Numbers PASSED ('Page 1 of 4' stamped)")
    passed += 1
else:
    print("✗ Test 12: Add Page Numbers FAILED", r12)
    failed += 1
doc_num.close()

# --- Test 13: Add Password / Protect PDF ---
out13 = os.path.join(TEMP_DIR, "out13_protected.pdf")
r13 = run_op("protect_pdf", [sample_pdf], out13, {"password": "SecretPassword123"})
doc_prot = fitz.open(out13)
if r13.get("success") and os.path.exists(out13) and doc_prot.is_encrypted:
    print("✓ Test 13: Protect PDF PASSED (Encrypted with AES-256)")
    passed += 1
else:
    print("✗ Test 13: Protect PDF FAILED", r13)
    failed += 1
doc_prot.close()

# --- Test 14: Unlock PDF ---
out14 = os.path.join(TEMP_DIR, "out14_unlocked.pdf")
# Negative test: invalid password
r14_bad = run_op("unlock_pdf", [out13], out14, {"password": "WrongPassword"})
if not r14_bad.get("success") and "Incorrect password" in str(r14_bad.get("error")):
    print("✓ Test 14a: Unlock PDF with wrong password correctly rejected")
else:
    print("✗ Test 14a: Failed negative check", r14_bad)

# Positive test: correct password
r14 = run_op("unlock_pdf", [out13], out14, {"password": "SecretPassword123"})
doc_unl = fitz.open(out14)
if r14.get("success") and os.path.exists(out14) and not doc_unl.is_encrypted:
    print("✓ Test 14b: Unlock PDF PASSED (Successfully decrypted)")
    passed += 1
else:
    print("✗ Test 14b: Unlock PDF FAILED", r14)
    failed += 1
doc_unl.close()

# --- Test 15: OCR Searchable PDF ---
out15 = os.path.join(TEMP_DIR, "out15_ocr.pdf")
r15 = run_op("ocr_searchable_pdf", [img_path1], out15, {"language": "eng"})
doc_ocr = fitz.open(out15)
ocr_text = doc_ocr[0].get_text()
if r15.get("success") and os.path.exists(out15) and "MBMITRA" in ocr_text.replace(" ", ""):
    print(f"✓ Test 15: OCR Searchable PDF PASSED (Extracted: '{ocr_text.strip()}')")
    passed += 1
else:
    print("✗ Test 15: OCR Searchable PDF FAILED", r15, "Text:", ocr_text)
    failed += 1
doc_ocr.close()

# --- Test 16: Inspect PDF ---
r16 = run_op("inspect_pdf", [sample_pdf], "")
if r16.get("success") and r16["data"].get("pageCount") == 4 and len(r16["data"].get("pages", [])) == 4:
    print(f"✓ Test 16: Inspect PDF PASSED ({r16['data']['pageCount']} pages & thumbnails)")
    passed += 1
else:
    print("✗ Test 16: Inspect PDF FAILED", r16)
    failed += 1

print(f"\n=== Verification Summary: {passed} PASSED, {failed} FAILED ===")
if failed == 0:
    # Cleanup temp
    shutil.rmtree(TEMP_DIR, ignore_errors=True)
    sys.exit(0)
else:
    sys.exit(1)
