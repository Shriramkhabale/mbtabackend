"""
MB Mitra — PDF Tools Engine
Comprehensive local processing engine for 15 PDF operations:
1. JPG/PNG to PDF
2. PDF to JPG/PNG
3. Word to PDF (.docx -> .pdf)
4. PDF to Word (.pdf -> .docx)
5. PDF to Excel (.pdf -> .xlsx)
6. Merge PDF files
7. Split PDF pages
8. Compress PDF
9. Rotate PDF pages
10. Reorder PDF pages
11. Delete PDF pages
12. Add page numbers
13. Add password / Protect PDF
14. Unlock PDF (authorized with password)
15. Scan images / PDF to searchable PDF (OCR)
+ PDF inspect (page count, encrypted status, thumbnails)

All operations run locally with 0 external API calls.
"""

import sys
import os
import io
import json
import zipfile
import shutil
import base64
from PIL import Image

# Third-party libraries
import warnings
warnings.filterwarnings("ignore")

import fitz  # PyMuPDF
import openpyxl

# Silence PyMuPDF layout warning
try:
    fitz.TOOLS.mupdf_display_errors(False)
except Exception:
    pass

# Tesseract configuration for OCR
import pytesseract
TESSERACT_CANDIDATES = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe")
]
for _t_path in TESSERACT_CANDIDATES:
    if os.path.exists(_t_path):
        pytesseract.pytesseract.tesseract_cmd = _t_path
        break


# ----------------------------------------------------------------------
# 1. Image(s) to PDF
# ----------------------------------------------------------------------
def op_image_to_pdf(files, output_path, options):
    if not files:
        raise ValueError("No image files provided.")
    
    page_size = options.get("pageSize", "fit").lower()  # fit, a4, letter
    orientation = options.get("orientation", "auto").lower()  # auto, portrait, landscape
    margin = float(options.get("margin", 0))

    doc = fitz.open()

    A4_W, A4_H = 595.28, 841.89
    LETTER_W, LETTER_H = 612.0, 792.0

    for file_path in files:
        if not os.path.exists(file_path):
            continue
        with Image.open(file_path) as img:
            orig_w, orig_h = img.size

        # Determine target page width and height
        if page_size == "a4":
            target_w, target_h = A4_W, A4_H
        elif page_size == "letter":
            target_w, target_h = LETTER_W, LETTER_H
        else:
            # Fit: base page on image dimensions (72 dpi)
            target_w, target_h = float(orig_w), float(orig_h)

        if orientation == "landscape" and target_w < target_h:
            target_w, target_h = target_h, target_w
        elif orientation == "portrait" and target_w > target_h:
            target_w, target_h = target_h, target_w
        elif orientation == "auto":
            if orig_w > orig_h and target_w < target_h:
                target_w, target_h = target_h, target_w

        page = doc.new_page(width=target_w, height=target_h)

        avail_w = target_w - (2 * margin)
        avail_h = target_h - (2 * margin)

        scale = min(avail_w / orig_w, avail_h / orig_h)
        draw_w = orig_w * scale
        draw_h = orig_h * scale

        # Center in available area
        x0 = margin + (avail_w - draw_w) / 2.0
        y0 = margin + (avail_h - draw_h) / 2.0
        x1 = x0 + draw_w
        y1 = y0 + draw_h

        rect = fitz.Rect(x0, y0, x1, y1)
        page.insert_image(rect, filename=file_path)

    page_count = len(doc)
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {"pageCount": page_count, "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# 2. PDF to Image(s) (JPG / PNG)
# ----------------------------------------------------------------------
def op_pdf_to_images(files, output_path, options):
    input_file = files[0]
    img_format = options.get("format", "jpg").lower()  # jpg or png
    dpi = int(options.get("dpi", 150))
    pages_opt = options.get("pages", "all")  # 'all' or list of 1-based page ints

    doc = fitz.open(input_file)
    total_pages = len(doc)

    if pages_opt == "all" or not pages_opt:
        selected_pages = list(range(1, total_pages + 1))
    elif isinstance(pages_opt, list):
        selected_pages = [int(p) for p in pages_opt if 1 <= int(p) <= total_pages]
    else:
        # String range like "1, 2-3"
        selected_pages = parse_page_range(str(pages_opt), total_pages)

    if not selected_pages:
        doc.close()
        raise ValueError(f"No valid pages selected from document of {total_pages} pages.")

    # If only 1 page selected, save single image directly
    if len(selected_pages) == 1:
        page_idx = selected_pages[0] - 1
        page = doc[page_idx]
        pix = page.get_pixmap(dpi=dpi)
        if img_format == "jpg" or img_format == "jpeg":
            pix.save(output_path, "jpeg")
        else:
            pix.save(output_path, "png")
        doc.close()
        return {"single": True, "format": img_format, "page": selected_pages[0], "outputSize": os.path.getsize(output_path)}

    # If multiple pages, bundle into a ZIP
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p_num in selected_pages:
            page = doc[p_num - 1]
            pix = page.get_pixmap(dpi=dpi)
            ext = "jpg" if img_format in ("jpg", "jpeg") else "png"
            sub_format = "jpeg" if ext == "jpg" else "png"
            img_bytes = pix.tobytes(sub_format)
            zf.writestr(f"page_{p_num:03d}.{ext}", img_bytes)

    doc.close()
    return {"single": False, "zip": True, "format": img_format, "pageCount": len(selected_pages), "outputSize": os.path.getsize(output_path)}


def repair_docx_package(input_file):
    """
    Sanitizes and repairs a .docx package before processing:
    1. Detects missing content types in [Content_Types].xml (e.g. embedded fonts like /word/fonts/*.ttf, images, etc.)
    2. Registers all parts and extensions so neither Word COM nor python-docx fail with 'corrupted' or 'no content type' errors.
    Returns path to sanitized file (or original if not a docx/zip).
    """
    import zipfile
    import xml.etree.ElementTree as ET
    import tempfile

    if not zipfile.is_zipfile(input_file):
        return input_file

    EXTENSION_CONTENT_TYPES = {
        'ttf': 'application/x-font-ttf',
        'otf': 'application/x-font-opentype',
        'woff': 'application/font-woff',
        'woff2': 'application/font-woff2',
        'eot': 'application/vnd.ms-fontobject',
        'png': 'image/png',
        'jpeg': 'image/jpeg',
        'jpg': 'image/jpeg',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'tiff': 'image/tiff',
        'tif': 'image/tiff',
        'emf': 'image/x-emf',
        'wmf': 'image/x-wmf',
        'xml': 'application/xml',
        'rels': 'application/vnd.openxmlformats-package.relationships+xml',
        'bin': 'application/vnd.openxmlformats-officedocument.oleObject',
        'vml': 'application/vnd.openxmlformats-officedocument.vmlDrawing'
    }

    try:
        with zipfile.ZipFile(input_file, 'r') as zin:
            namelist = zin.namelist()
            if '[Content_Types].xml' not in namelist:
                return input_file

            ct_xml = zin.read('[Content_Types].xml').decode('utf-8', errors='ignore')
            root = ET.fromstring(ct_xml)
            ns = ''
            if root.tag.startswith('{'):
                ns = root.tag.split('}')[0] + '}'

            existing_extensions = set()
            existing_partnames = set()
            for child in root:
                tag = child.tag[len(ns):] if child.tag.startswith(ns) else child.tag
                if tag == 'Default':
                    ext = child.attrib.get('Extension', '').lower()
                    if ext:
                        existing_extensions.add(ext)
                elif tag == 'Override':
                    part = child.attrib.get('PartName', '')
                    if part:
                        existing_partnames.add(part)

            modified = False
            for fname in namelist:
                if fname == '[Content_Types].xml':
                    continue
                partname = '/' + fname if not fname.startswith('/') else fname
                ext = fname.split('.')[-1].lower() if '.' in fname else ''

                if ext and ext not in existing_extensions:
                    ctype = EXTENSION_CONTENT_TYPES.get(ext, 'application/octet-stream')
                    elem = ET.Element(f'{ns}Default', {'Extension': ext, 'ContentType': ctype})
                    root.append(elem)
                    existing_extensions.add(ext)
                    modified = True

                if (ext in ('ttf', 'otf', 'woff', 'woff2', 'eot')) and partname not in existing_partnames:
                    ctype = EXTENSION_CONTENT_TYPES.get(ext, 'application/x-font-ttf')
                    override_elem = ET.Element(f'{ns}Override', {'PartName': partname, 'ContentType': ctype})
                    root.append(override_elem)
                    existing_partnames.add(partname)
                    modified = True

            if modified:
                new_ct_bytes = ET.tostring(root, encoding='utf-8', xml_declaration=True)
                fd, rep_path = tempfile.mkstemp(suffix='.docx')
                os.close(fd)
                with zipfile.ZipFile(rep_path, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
                    for item in zin.infolist():
                        if item.filename == '[Content_Types].xml':
                            zout.writestr(item, new_ct_bytes)
                        else:
                            zout.writestr(item, zin.read(item.filename))
                return rep_path

    except Exception:
        pass

    return input_file


def extract_docx_xml_paragraphs(docx_path):
    """Direct XML parser for word/document.xml as a resilient fallback."""
    import zipfile
    import xml.etree.ElementTree as ET

    paragraphs = []
    if not zipfile.is_zipfile(docx_path):
        return paragraphs

    try:
        with zipfile.ZipFile(docx_path, 'r') as zin:
            if 'word/document.xml' in zin.namelist():
                xml_data = zin.read('word/document.xml')
                root = ET.fromstring(xml_data)
                w_ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
                for p in root.iter(f'{{{w_ns}}}p'):
                    texts = [t.text for t in p.iter(f'{{{w_ns}}}t') if t.text]
                    if texts:
                        paragraphs.append(''.join(texts))
    except Exception:
        pass
    return paragraphs


# ----------------------------------------------------------------------
# 3. Word to PDF (.docx -> .pdf)
# ----------------------------------------------------------------------
def op_word_to_pdf(files, output_path, options):
    input_file = files[0]
    work_file = repair_docx_package(input_file)
    com_error = None
    parser_error = None

    # Strategy 1: docx2pdf (Native MS Word COM automation on Windows)
    try:
        from docx2pdf import convert
        convert(work_file, output_path)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 100:
            if work_file != input_file and os.path.exists(work_file):
                try:
                    os.remove(work_file)
                except Exception:
                    pass
            return {"method": "docx2pdf_native", "outputSize": os.path.getsize(output_path)}
    except Exception as e:
        com_error = str(e)

    # Strategy 2: Fallback via python-docx + reportlab
    try:
        import docx
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors

        doc_in = docx.Document(work_file)
        pdf_doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=40,
            leftMargin=40,
            topMargin=40,
            bottomMargin=40
        )
        styles = getSampleStyleSheet()
        story = []

        for p in doc_in.paragraphs:
            text = p.text.strip()
            if not text:
                story.append(Spacer(1, 8))
                continue
            if p.style.name.startswith("Heading 1"):
                story.append(Paragraph(escape_xml(text), styles["Heading1"]))
                story.append(Spacer(1, 6))
            elif p.style.name.startswith("Heading 2"):
                story.append(Paragraph(escape_xml(text), styles["Heading2"]))
                story.append(Spacer(1, 4))
            elif p.style.name.startswith("Heading"):
                story.append(Paragraph(escape_xml(text), styles["Heading3"]))
                story.append(Spacer(1, 4))
            else:
                story.append(Paragraph(escape_xml(text), styles["Normal"]))
                story.append(Spacer(1, 6))

        for table in doc_in.tables:
            table_data = []
            for row in table.rows:
                table_data.append([escape_xml(c.text.strip()) for c in row.cells])
            if table_data:
                t = Table(table_data)
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e2e8f0')),
                    ('TEXTCOLOR', (0,0), (-1,0), colors.black),
                    ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                    ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
                    ('FONTSIZE', (0,0), (-1,-1), 9),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                    ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
                ]))
                story.append(t)
                story.append(Spacer(1, 10))

        pdf_doc.build(story)
        if work_file != input_file and os.path.exists(work_file):
            try:
                os.remove(work_file)
            except Exception:
                pass
        return {"method": "reportlab_fallback", "outputSize": os.path.getsize(output_path)}
    except Exception as e2:
        parser_error = str(e2)

    # Strategy 3: Resilient XML text extraction + reportlab
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet

        raw_paragraphs = extract_docx_xml_paragraphs(work_file)
        if raw_paragraphs:
            pdf_doc = SimpleDocTemplate(output_path, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
            styles = getSampleStyleSheet()
            story = []
            for p_text in raw_paragraphs:
                p_text = p_text.strip()
                if p_text:
                    story.append(Paragraph(escape_xml(p_text), styles["Normal"]))
                    story.append(Spacer(1, 6))
            if story:
                pdf_doc.build(story)
                if work_file != input_file and os.path.exists(work_file):
                    try:
                        os.remove(work_file)
                    except Exception:
                        pass
                return {"method": "xml_text_fallback", "outputSize": os.path.getsize(output_path)}
    except Exception:
        pass

    if work_file != input_file and os.path.exists(work_file):
        try:
            os.remove(work_file)
        except Exception:
            pass

    raise RuntimeError(f"Word to PDF failed: (COM: {com_error}; Parser: {parser_error})")


# ----------------------------------------------------------------------
# 4. PDF to Word (.pdf -> .docx)
# ----------------------------------------------------------------------
def op_pdf_to_word(files, output_path, options):
    input_file = files[0]
    from pdf2docx import Converter

    cv = Converter(input_file)
    try:
        pages_opt = options.get("pages")
        if pages_opt and pages_opt != "all":
            total_pages = len(fitz.open(input_file))
            sel = parse_page_range(str(pages_opt), total_pages)
            # Converter uses 0-based indices for pages
            zero_based = [p - 1 for p in sel]
            cv.convert(output_path, pages=zero_based)
        else:
            cv.convert(output_path)
    finally:
        cv.close()

    if not os.path.exists(output_path) or os.path.getsize(output_path) < 100:
        raise RuntimeError("PDF to Word conversion failed to produce a valid .docx file.")
    return {"format": "docx", "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# 5. PDF to Excel (.pdf -> .xlsx)
# ----------------------------------------------------------------------
def op_pdf_to_excel(files, output_path, options):
    input_file = files[0]
    doc = fitz.open(input_file)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Extracted Data"

    total_rows = 0

    for page_num, page in enumerate(doc, start=1):
        tabs = page.find_tables()
        if tabs.tables:
            for tab_idx, tab in enumerate(tabs):
                if total_rows > 0:
                    ws.append([])  # Spacer between tables
                extracted = tab.extract()
                for row in extracted:
                    cleaned_row = [c.strip() if isinstance(c, str) else c for c in row]
                    ws.append(cleaned_row)
                    total_rows += 1
        else:
            # Fallback: Extract structured text lines
            text = page.get_text("text")
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            for line in lines:
                if "\t" in line:
                    parts = [p.strip() for p in line.split("\t")]
                elif "  " in line:
                    parts = [p.strip() for p in line.split("  ") if p.strip()]
                elif "," in line:
                    parts = [p.strip() for p in line.split(",")]
                else:
                    parts = [line]
                ws.append(parts)
                total_rows += 1

    doc.close()

    # Style header row if any data exists
    if total_rows > 0:
        header_fill = openpyxl.styles.PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        header_font = openpyxl.styles.Font(bold=True)
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font

    wb.save(output_path)
    return {"rowsExtracted": total_rows, "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# 6. Merge PDF files
# ----------------------------------------------------------------------
def op_merge_pdfs(files, output_path, options):
    if len(files) < 2:
        raise ValueError("At least 2 PDF files are required for merging.")

    merged_doc = fitz.open()
    total_pages = 0

    for idx, f_path in enumerate(files):
        if not os.path.exists(f_path):
            continue
        try:
            doc = fitz.open(f_path)
            if doc.is_encrypted:
                raise ValueError(f"File #{idx + 1} ({os.path.basename(f_path)}) is password protected. Please unlock it before merging.")
            merged_doc.insert_pdf(doc)
            total_pages += len(doc)
            doc.close()
        except Exception as e:
            merged_doc.close()
            raise RuntimeError(f"Error merging file #{idx + 1}: {str(e)}")

    merged_doc.save(output_path, garbage=4, deflate=True)
    merged_doc.close()
    return {"totalPages": total_pages, "filesMerged": len(files), "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# 7. Split PDF pages
# ----------------------------------------------------------------------
def op_split_pdf(files, output_path, options):
    input_file = files[0]
    split_mode = options.get("mode", "range")  # range, all, every_n
    doc = fitz.open(input_file)
    total_pages = len(doc)

    if split_mode == "all":
        # Extract each page into a separate PDF inside a ZIP
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for p_num in range(1, total_pages + 1):
                single_doc = fitz.open()
                single_doc.insert_pdf(doc, from_page=p_num - 1, to_page=p_num - 1)
                buf = io.BytesIO()
                single_doc.save(buf)
                single_doc.close()
                zf.writestr(f"page_{p_num:03d}.pdf", buf.getvalue())
        doc.close()
        return {"zip": True, "totalPages": total_pages, "outputSize": os.path.getsize(output_path)}

    elif split_mode == "every_n":
        n = int(options.get("chunkSize", 1))
        if n < 1:
            n = 1
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
            chunk_idx = 1
            for start in range(0, total_pages, n):
                end = min(start + n - 1, total_pages - 1)
                chunk_doc = fitz.open()
                chunk_doc.insert_pdf(doc, from_page=start, to_page=end)
                buf = io.BytesIO()
                chunk_doc.save(buf)
                chunk_doc.close()
                zf.writestr(f"part_{chunk_idx:02d}_pages_{start+1}-{end+1}.pdf", buf.getvalue())
                chunk_idx += 1
        doc.close()
        return {"zip": True, "parts": chunk_idx - 1, "outputSize": os.path.getsize(output_path)}

    else:
        # Custom range e.g. "1-3, 5"
        range_str = options.get("range", "")
        if not range_str:
            doc.close()
            raise ValueError("Page range must be specified (e.g. 1-3, 5).")
        pages = parse_page_range(range_str, total_pages)
        if not pages:
            doc.close()
            raise ValueError(f"No valid pages found in range '{range_str}' for a {total_pages}-page PDF.")

        new_doc = fitz.open()
        for p in pages:
            new_doc.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
        new_doc.save(output_path, garbage=4, deflate=True)
        new_doc.close()
        doc.close()
        return {"zip": False, "extractedPages": len(pages), "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# 8. Compress PDF
# ----------------------------------------------------------------------
def op_compress_pdf(files, output_path, options):
    input_file = files[0]
    level = options.get("level", "recommended").lower()  # low, recommended, extreme
    orig_size = os.path.getsize(input_file)

    quality = 70
    max_dpi = 150
    if level == "extreme":
        quality = 45
        max_dpi = 100
    elif level == "low":
        quality = 85
        max_dpi = 200

    doc = fitz.open(input_file)

    # Recompress embedded images
    for page in doc:
        image_list = page.get_images(full=True)
        for img_info in image_list:
            xref = img_info[0]
            try:
                base_image = doc.extract_image(xref)
                if not base_image:
                    continue
                image_bytes = base_image["image"]
                pil_img = Image.open(io.BytesIO(image_bytes))

                # Check if image needs downsampling
                w, h = pil_img.size
                if max(w, h) > 1600 and level in ("extreme", "recommended"):
                    scale = 1600.0 / max(w, h)
                    pil_img = pil_img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

                if pil_img.mode in ("RGBA", "P"):
                    pil_img = pil_img.convert("RGB")

                out_buf = io.BytesIO()
                pil_img.save(out_buf, format="JPEG", quality=quality, optimize=True)
                new_bytes = out_buf.getvalue()

                # Only replace if newly compressed image is actually smaller
                if len(new_bytes) < len(image_bytes):
                    doc.update_stream(xref, new_bytes)
            except Exception:
                # If an image cannot be processed, leave untouched
                pass

    doc.save(output_path, garbage=4, deflate=True, clean=True)
    doc.close()

    new_size = os.path.getsize(output_path)
    # If the output size didn't improve, keep original
    if new_size >= orig_size:
        shutil.copyfile(input_file, output_path)
        new_size = orig_size
        pct = 0.0
    else:
        pct = round(((orig_size - new_size) / orig_size) * 100.0, 1)

    return {
        "originalSize": orig_size,
        "compressedSize": new_size,
        "savingsPercent": pct,
        "reductionBytes": max(0, orig_size - new_size)
    }


# ----------------------------------------------------------------------
# 9. Rotate PDF pages
# ----------------------------------------------------------------------
def op_rotate_pdf(files, output_path, options):
    input_file = files[0]
    angle = int(options.get("angle", 90)) % 360
    target_pages = options.get("pages", "all")  # 'all' or list of ints

    doc = fitz.open(input_file)
    total_pages = len(doc)

    if target_pages == "all" or not target_pages:
        selected = list(range(1, total_pages + 1))
    elif isinstance(target_pages, list):
        selected = [int(p) for p in target_pages if 1 <= int(p) <= total_pages]
    else:
        selected = parse_page_range(str(target_pages), total_pages)

    for p_num in selected:
        page = doc[p_num - 1]
        page.set_rotation((page.rotation + angle) % 360)

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {"rotatedPages": len(selected), "angle": angle, "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# 10. Reorder PDF pages
# ----------------------------------------------------------------------
def op_reorder_pdf(files, output_path, options):
    input_file = files[0]
    new_order = options.get("order")  # List of 1-based page numbers e.g. [3, 1, 2, 4]
    if not new_order or not isinstance(new_order, list):
        raise ValueError("A valid page order list is required (e.g. [3, 1, 2, 4]).")

    doc = fitz.open(input_file)
    total_pages = len(doc)

    # Validate pages
    zero_based = []
    for p in new_order:
        p_int = int(p)
        if not (1 <= p_int <= total_pages):
            doc.close()
            raise ValueError(f"Page {p_int} is out of bounds for a {total_pages}-page PDF.")
        zero_based.append(p_int - 1)

    doc.select(zero_based)
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {"newOrder": new_order, "pageCount": len(zero_based), "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# 11. Delete PDF pages
# ----------------------------------------------------------------------
def op_delete_pages(files, output_path, options):
    input_file = files[0]
    pages_to_delete = options.get("pages")  # List or range string of 1-based page numbers
    doc = fitz.open(input_file)
    total_pages = len(doc)

    if isinstance(pages_to_delete, list):
        delete_list = [int(p) for p in pages_to_delete if 1 <= int(p) <= total_pages]
    else:
        delete_list = parse_page_range(str(pages_to_delete), total_pages)

    if not delete_list:
        doc.close()
        raise ValueError("No valid pages specified for deletion.")

    if len(delete_list) >= total_pages:
        doc.close()
        raise ValueError("Cannot delete all pages of the PDF. At least 1 page must remain.")

    # Sort descending to delete without shifting lower indices
    zero_based = sorted([p - 1 for p in set(delete_list)], reverse=True)
    doc.delete_pages(zero_based)

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {
        "deletedPages": sorted(list(set(delete_list))),
        "remainingPages": total_pages - len(zero_based),
        "outputSize": os.path.getsize(output_path)
    }


# ----------------------------------------------------------------------
# 12. Add page numbers
# ----------------------------------------------------------------------
def op_add_page_numbers(files, output_path, options):
    input_file = files[0]
    position = options.get("position", "bottom-center").lower()
    fmt = options.get("format", "Page {n} of {total}")
    start_page = int(options.get("startPage", 1))
    font_size = float(options.get("fontSize", 10))
    margin = float(options.get("margin", 30))

    doc = fitz.open(input_file)
    total_pages = len(doc)

    for idx, page in enumerate(doc, start=1):
        if idx < start_page:
            continue
        text = fmt.replace("{n}", str(idx)).replace("{total}", str(total_pages))
        rect = page.rect
        w, h = rect.width, rect.height

        # Calculate text width approximation
        approx_char_width = font_size * 0.52
        text_w = len(text) * approx_char_width

        if "top" in position:
            y = margin + font_size
        else:
            y = h - margin

        if "left" in position:
            x = margin
        elif "right" in position:
            x = w - margin - text_w
        else:  # center
            x = (w - text_w) / 2.0

        p = fitz.Point(x, y)
        page.insert_text(p, text, fontsize=font_size, color=(0.2, 0.2, 0.2))

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()
    return {"totalNumbered": total_pages - start_page + 1, "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# 13. Add password / Protect PDF
# ----------------------------------------------------------------------
def op_protect_pdf(files, output_path, options):
    input_file = files[0]
    user_pw = str(options.get("password", "")).strip()
    if not user_pw:
        raise ValueError("Password is required to protect the PDF.")

    owner_pw = str(options.get("ownerPassword", user_pw)).strip() or user_pw

    doc = fitz.open(input_file)
    if doc.is_encrypted:
        doc.close()
        raise ValueError("This PDF is already password protected.")

    perm = fitz.PDF_PERM_PRINT | fitz.PDF_PERM_ACCESSIBILITY | fitz.PDF_PERM_COPY
    doc.save(
        output_path,
        encryption=fitz.PDF_ENCRYPT_AES_256,
        user_pw=user_pw,
        owner_pw=owner_pw,
        permissions=perm
    )
    doc.close()
    return {"protected": True, "encryption": "AES-256", "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# 14. Unlock PDF (authorized with correct password)
# ----------------------------------------------------------------------
def op_unlock_pdf(files, output_path, options):
    input_file = files[0]
    password = str(options.get("password", "")).strip()
    if not password:
        raise ValueError("Password is required to unlock this PDF. Only authorized users with a valid password can unlock.")

    doc = fitz.open(input_file)
    if not doc.is_encrypted:
        # Already unlocked
        doc.save(output_path)
        doc.close()
        return {"unlocked": True, "wasEncrypted": False, "outputSize": os.path.getsize(output_path)}

    rc = doc.authenticate(password)
    if rc == 0:
        doc.close()
        raise ValueError("Incorrect password provided. Please verify the password and try again.")

    doc.save(output_path, encryption=fitz.PDF_ENCRYPT_NONE)
    doc.close()
    return {"unlocked": True, "wasEncrypted": True, "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# 15. OCR: Scan Images / PDF to Searchable PDF
# ----------------------------------------------------------------------
def op_ocr_searchable_pdf(files, output_path, options):
    input_file = files[0]
    lang = options.get("language", "eng")  # eng, hin, or eng+hin

    ext = os.path.splitext(input_file)[1].lower()

    if ext == ".pdf":
        # Convert PDF pages to images, then OCR each into a searchable PDF page
        doc_in = fitz.open(input_file)
        combined_doc = fitz.open()

        for page_idx, page in enumerate(doc_in):
            pix = page.get_pixmap(dpi=200)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            try:
                page_pdf_bytes = pytesseract.image_to_pdf_or_hocr(img, extension="pdf", lang=lang)
                p_doc = fitz.open(stream=page_pdf_bytes, filetype="pdf")
                combined_doc.insert_pdf(p_doc)
                p_doc.close()
            except Exception as e:
                # If tesseract fails on a specific page, insert original page
                single_doc = fitz.open()
                single_doc.insert_pdf(doc_in, from_page=page_idx, to_page=page_idx)
                combined_doc.insert_pdf(single_doc)
                single_doc.close()

        doc_in.close()
        combined_doc.save(output_path, garbage=4, deflate=True)
        combined_doc.close()
        return {"pagesProcessed": len(combined_doc), "outputSize": os.path.getsize(output_path)}

    else:
        # Input is an image file
        with Image.open(input_file) as img:
            pdf_bytes = pytesseract.image_to_pdf_or_hocr(img, extension="pdf", lang=lang)
            with open(output_path, "wb") as f_out:
                f_out.write(pdf_bytes)
        return {"pagesProcessed": 1, "outputSize": os.path.getsize(output_path)}


# ----------------------------------------------------------------------
# Inspect PDF (Metadata, Page Count, Thumbnails)
# ----------------------------------------------------------------------
def op_inspect_pdf(files, output_path, options):
    input_file = files[0]
    doc = fitz.open(input_file)
    is_enc = doc.is_encrypted
    total_pages = len(doc)

    pages_info = []
    # If not encrypted, generate thumbnail previews for first 20 pages
    if not is_enc:
        for idx in range(min(total_pages, 20)):
            page = doc[idx]
            pix = page.get_pixmap(dpi=72)
            b64 = base64.b64encode(pix.tobytes("jpeg")).decode("utf-8")
            pages_info.append({
                "page": idx + 1,
                "width": round(page.rect.width, 1),
                "height": round(page.rect.height, 1),
                "thumbnail": f"data:image/jpeg;base64,{b64}"
            })

    metadata = doc.metadata or {}
    doc.close()

    return {
        "pageCount": total_pages,
        "isEncrypted": is_enc,
        "pages": pages_info,
        "metadata": {
            "title": metadata.get("title", ""),
            "author": metadata.get("author", ""),
            "creator": metadata.get("creator", "")
        }
    }


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def parse_page_range(range_str, total_pages):
    """Parses page expressions like '1-3, 5, 7-9' into a sorted list of ints."""
    pages = set()
    parts = [p.strip() for p in range_str.split(",") if p.strip()]
    for part in parts:
        if "-" in part:
            sub = [s.strip() for s in part.split("-")]
            if len(sub) == 2 and sub[0].isdigit() and sub[1].isdigit():
                start, end = int(sub[0]), int(sub[1])
                for p in range(min(start, end), max(start, end) + 1):
                    if 1 <= p <= total_pages:
                        pages.add(p)
        elif part.isdigit():
            p = int(part)
            if 1 <= p <= total_pages:
                pages.add(p)
    return sorted(list(pages))


def escape_xml(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ----------------------------------------------------------------------
# CLI Dispatcher
# ----------------------------------------------------------------------
OPERATIONS = {
    "image_to_pdf": op_image_to_pdf,
    "pdf_to_images": op_pdf_to_images,
    "word_to_pdf": op_word_to_pdf,
    "pdf_to_word": op_pdf_to_word,
    "pdf_to_excel": op_pdf_to_excel,
    "merge_pdfs": op_merge_pdfs,
    "split_pdf": op_split_pdf,
    "compress_pdf": op_compress_pdf,
    "rotate_pdf": op_rotate_pdf,
    "reorder_pdf": op_reorder_pdf,
    "delete_pages": op_delete_pages,
    "add_page_numbers": op_add_page_numbers,
    "protect_pdf": op_protect_pdf,
    "unlock_pdf": op_unlock_pdf,
    "ocr_searchable_pdf": op_ocr_searchable_pdf,
    "inspect_pdf": op_inspect_pdf,
}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No arguments provided to pdf_engine"}))
        sys.exit(1)

    # Arguments can be passed via JSON file or JSON string
    arg_input = sys.argv[1]
    if os.path.exists(arg_input):
        with open(arg_input, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.loads(arg_input)

    operation = data.get("operation")
    files = data.get("files", [])
    output_path = data.get("outputPath", "")
    options = data.get("options", {})

    handler = OPERATIONS.get(operation)
    if not handler:
        print(json.dumps({"success": False, "error": f"Unknown operation: {operation}"}))
        sys.exit(1)

    try:
        result = handler(files, output_path, options)
        response = {
            "success": True,
            "operation": operation,
            "outputPath": output_path,
            "data": result
        }
        print(json.dumps(response))
        sys.exit(0)
    except Exception as e:
        import traceback
        response = {
            "success": False,
            "operation": operation,
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        print(json.dumps(response))
        sys.exit(1)


if __name__ == "__main__":
    main()
