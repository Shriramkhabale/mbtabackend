# MB Mitra — Hostinger VPS (Ubuntu Linux) Deployment Guide
## Document & AI Tools & Core Services Setup

This document provides step-by-step instructions for deploying the **MB Mitra** backend and frontend on a Hostinger VPS (Ubuntu 22.04 / 24.04 LTS).

---

### 1. Hardware & System Requirements

| Resource | Minimum | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **RAM** | 4 GB | 8 GB | PyTorch & EasyOCR models allocate ~1.2 GB during peak batch processing. |
| **CPU** | 2 vCPUs | 4 vCPUs | Python image processing & OCR utilize multi-threaded CPU routines. |
| **Storage** | 20 GB SSD | 50 GB SSD | AI models (`u2netp`, `craft_mlt_25k`, language weights) require ~350 MB. |
| **Swap** | 2 GB | 4 GB | Essential on 4 GB VPS instances to prevent Out-Of-Memory (OOM) kills. |

#### Configuring Swap Space (Recommended on 4 GB VPS)
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

### 2. Operating System Packages Installation

Update package repositories and install required system tools, Python build dependencies, and image libraries:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential \
    python3 python3-pip python3-venv python3-dev \
    libglib2.0-0 libsm6 libxext6 libxrender-dev \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin
```

#### Node.js LTS (v20) Installation
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

---

### 3. Backend Setup & Virtual Environment

1. **Clone or copy project directory:**
   ```bash
   cd /var/www/mb-mitra/backend
   npm install --production
   ```

2. **Create isolated Python Virtual Environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   python -m pip install --upgrade pip setuptools wheel
   python -m pip install -r requirements.txt
   ```
   *Note: `requirements.txt` specifies `opencv-python-headless` which avoids missing X11/GUI libraries on headless Linux.*

3. **Pre-warm and Download AI Models Offline:**
   To avoid first-request timeout or latency spikes, run the pre-warm script:
   ```bash
   python scripts/prewarm_models.py
   ```
   This downloads:
   - `u2netp` model to `~/.u2net/u2netp.onnx` (~4.7 MB)
   - EasyOCR CRAFT detection model to `~/.EasyOCR/model/craft_mlt_25k.pth` (~49 MB)
   - EasyOCR English and Hindi recognition models used by the Image to Text tool

4. **Configure Environment Variables (`backend/.env`):**
   ```env
   PORT=5000
   NODE_ENV=production
   MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/mb_mitra?retryWrites=true&w=majority
   JWT_SECRET=your_strong_jwt_secret_key
   DOCUMENT_SECRET_KEY=your_secure_document_signing_secret_min_32_chars
   PYTHON_BIN=/var/www/mb-mitra/backend/venv/bin/python3
   U2NET_HOME=/var/www/mb-mitra/.u2net
   EASYOCR_MODULE_PATH=/var/www/mb-mitra/.EasyOCR
   ```

---

### 4. Process Management with PM2

Start the backend service with PM2 and configure auto-restart on system reboot:

```bash
cd /var/www/mb-mitra/backend
pm2 start index.js --name mb-mitra-backend -i max --max-memory-restart 1G
pm2 save
pm2 startup
```

---

### 5. Frontend Build & Serving

1. **Build the production bundle:**
   ```bash
   cd /var/www/mb-mitra/frontend
   # In production, omit REACT_APP_API_URL so frontend uses relative /api requests
   npm ci
   npm run build
   ```
2. **Move build output to web root:**
   ```bash
   sudo mkdir -p /var/www/html/mb-mitra
   sudo cp -r build/* /var/www/html/mb-mitra/
   ```

---

### 6. Nginx Reverse Proxy Configuration

Create `/etc/nginx/sites-available/mb-mitra`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Increase maximum upload file size for high-res PDF and image tools
    client_max_body_size 50M;

    # Frontend Static SPA
    root /var/www/html/mb-mitra;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Backend Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Extended timeouts for AI processing (OCR, background removal, PDF parsing)
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/mb-mitra /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### 7. SSL / HTTPS Setup via Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

### 8. Verification & Health Check

After deployment, verify that:
1. Backend health check returns 200 OK: `curl http://localhost:5000/api/tools/categories`
2. Python document and AI dependencies execute correctly: `/var/www/mb-mitra/backend/venv/bin/python3 -c "import cv2, easyocr, fitz, openpyxl, PIL, pytesseract, docx, reportlab, pdf2docx, rembg; print('OK')"`
3. Tesseract is installed with the required language packs: `tesseract --list-langs` should include `eng` and `hin`.
4. Document generation and tokenized downloads function over HTTPS without mixed-content warnings.

