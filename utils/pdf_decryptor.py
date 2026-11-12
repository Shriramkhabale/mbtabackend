#!/usr/bin/env python3
"""
Secure Local PDF Decryptor Helper
Reads encrypted PDF from stdin, decrypts using password passed via env var,
and writes decrypted PDF to stdout.
Never logs or saves the password.
Exit codes:
  0: Success (decrypted or was not encrypted)
  1: General error
  2: Password required (document is encrypted but no password provided)
  3: Incorrect password
  4: Unsupported encryption method
"""
import sys
import os
import io

def main():
    try:
        import pypdf
    except ImportError:
        sys.stderr.write("pypdf is not installed in Python environment.\n")
        sys.exit(4)

    # Read PDF from stdin
    input_bytes = sys.stdin.buffer.read()
    if not input_bytes:
        sys.stderr.write("Empty input received on stdin.\n")
        sys.exit(1)

    password = os.environ.get("PDF_UNLOCK_PASSWORD", "")

    try:
        reader = pypdf.PdfReader(io.BytesIO(input_bytes))
    except Exception as e:
        sys.stderr.write(f"Failed to parse PDF: {str(e)}\n")
        sys.exit(1)

    if not reader.is_encrypted:
        # Not encrypted, output as is
        sys.stdout.buffer.write(input_bytes)
        sys.exit(0)

    if not password:
        sys.stderr.write("PDF is encrypted and no password was provided.\n")
        sys.exit(2)

    try:
        decrypt_result = reader.decrypt(password)
        # decrypt_result: 0 = failed, 1 = user password success, 2 = owner password success
        if decrypt_result == 0:
            sys.stderr.write("Incorrect password provided.\n")
            sys.exit(3)

        writer = pypdf.PdfWriter(clone_from=reader)
        out_buf = io.BytesIO()
        writer.write(out_buf)
        sys.stdout.buffer.write(out_buf.getvalue())
        sys.exit(0)
    except pypdf.errors.FileNotDecryptedError:
        sys.stderr.write("Failed to decrypt: Incorrect password.\n")
        sys.exit(3)
    except Exception as e:
        sys.stderr.write(f"Encryption error: {str(e)}\n")
        sys.exit(4)

if __name__ == "__main__":
    main()
