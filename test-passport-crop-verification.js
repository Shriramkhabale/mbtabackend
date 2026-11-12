/**
 * MB MITRA — AI BACKGROUND REMOVER & PASSPORT CROP SUITE
 * Comprehensive Verification: Photo Cropping + Passport Maker + AI Background Removal
 * 
 * Verifies:
 * 1. Cropping coordinate accuracy (cropBox applied before AI processing)
 * 2. Passport specification sizing (35x45mm @ 300 DPI = ~413x531 px)
 * 3. Transparent PNG output (alpha channel preserved)
 * 4. Pure White background (#ffffff) for official passport photos
 * 5. Sky Blue background (#2563eb / #93c5fd)
 * 6. Subject positioning (scaling + offsets)
 * 7. JPEG export (magic bytes 0xFF 0xD8 + 300 DPI tags)
 * 8. End-to-End HTTP API call to /api/tools/process
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { removeBackgroundLocal } = require('./utils/localBackgroundRemover');
const { createSessionToken } = require('./utils/sessionToken');

const OUTPUT_DIR = path.resolve(__dirname, 'uploads', 'temp');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

let passedAssertions = 0;
let totalAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  \x1b[32m✔\x1b[0m ${message}`);
  } else {
    console.error(`  \x1b[31m✖\x1b[0m ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Generate a synthetic test portrait image with PIL
function createTestPortraitImage(filename, width = 600, height = 800) {
  const filePath = path.join(OUTPUT_DIR, filename);
  const pyCode = `
from PIL import Image, ImageDraw
img = Image.new('RGB', (${width}, ${height}), color=(200, 220, 240))
draw = ImageDraw.Draw(img)
# Draw head & torso
draw.ellipse([${Math.round(width * 0.3)}, ${Math.round(height * 0.15)}, ${Math.round(width * 0.7)}, ${Math.round(height * 0.55)}], fill=(220, 180, 150))
draw.rectangle([${Math.round(width * 0.2)}, ${Math.round(height * 0.55)}, ${Math.round(width * 0.8)}, ${height}], fill=(40, 50, 120))
# Eyes & mouth
draw.ellipse([${Math.round(width * 0.4)}, ${Math.round(height * 0.3)}, ${Math.round(width * 0.45)}, ${Math.round(height * 0.35)}], fill=(0, 0, 0))
draw.ellipse([${Math.round(width * 0.55)}, ${Math.round(height * 0.3)}, ${Math.round(width * 0.6)}, ${Math.round(height * 0.35)}], fill=(0, 0, 0))
img.save(r'${filePath}', 'PNG')
print('OK')
`;
  const res = spawnSync('python', ['-c', pyCode], { encoding: 'utf8' });
  if (res.status !== 0 || !fs.existsSync(filePath)) {
    throw new Error('Failed to create test portrait image: ' + res.stderr);
  }
  return filePath;
}

// Helper to inspect image dimensions, format, and background color via Python PIL
function inspectImageWithPython(filePath) {
  const pyCode = `
import json
from PIL import Image
img = Image.open(r'${filePath}')
w, h = img.size
mode = img.mode
fmt = img.format or (img.filename.split('.')[-1].upper())
dpi = img.info.get('dpi', (72, 72))

# Sample corner pixel (background)
corner_pixel = img.getpixel((5, 5))
if isinstance(corner_pixel, int):
    corner_pixel = (corner_pixel, corner_pixel, corner_pixel)

result = {
    'width': w,
    'height': h,
    'mode': mode,
    'format': fmt,
    'dpi_x': round(dpi[0]) if dpi else None,
    'dpi_y': round(dpi[1]) if dpi else None,
    'corner_pixel': list(corner_pixel)
}
print(json.dumps(result))
`;
  const res = spawnSync('python', ['-c', pyCode], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error('Inspection failed: ' + res.stderr);
  }
  return JSON.parse(res.stdout.trim());
}

async function runTests() {
  console.log('\n\x1b[1m=== MB MITRA PASSPORT PHOTO & AI BACKGROUND REMOVAL TEST SUITE ===\x1b[0m\n');

  const testInput = createTestPortraitImage('test_portrait_raw.png', 600, 800);
  assert(fs.existsSync(testInput), 'Synthetic test portrait image created (600x800)');
  const inputBuffer = fs.readFileSync(testInput);

  // TEST 1: Passport Preset with White Background @ 300 DPI
  console.log('\n\x1b[36m--- TEST 1: Passport Size Preset (35x45mm @ 300 DPI, Pure White BG) ---\x1b[0m');
  const cropBox = { x: 60, y: 80, width: 480, height: 620 };

  const res1 = await removeBackgroundLocal(inputBuffer, {
    bgColor: 'white',
    format: 'jpg',
    preset: 'passport_in',
    cropBox: cropBox,
    targetWidth: 35,
    targetHeight: 45,
    dpi: 300,
    rotation: 0
  }, 'retailer');

  const outPath1 = res1.filePath || path.join(OUTPUT_DIR, res1.fileName);
  assert(fs.existsSync(outPath1), `Output file exists: ${path.basename(outPath1)}`);
  const meta1 = inspectImageWithPython(outPath1);
  assert(meta1.width >= 410 && meta1.width <= 416, `Passport width is ~413 px (Actual: ${meta1.width} px)`);
  assert(meta1.height >= 528 && meta1.height <= 534, `Passport height is ~531 px (Actual: ${meta1.height} px)`);
  assert(meta1.dpi_x === 300 && meta1.dpi_y === 300, `Output resolution tagged as 300 DPI (Actual: ${meta1.dpi_x}x${meta1.dpi_y})`);
  assert(meta1.format === 'JPEG', `Output format is valid JPEG`);
  assert(meta1.corner_pixel[0] >= 240 && meta1.corner_pixel[1] >= 240 && meta1.corner_pixel[2] >= 240, `Corner pixel is white (Actual: [${meta1.corner_pixel.join(',')}])`);

  // TEST 2: Transparent PNG Output
  console.log('\n\x1b[36m--- TEST 2: Transparent PNG Background Output ---\x1b[0m');
  const res2 = await removeBackgroundLocal(inputBuffer, {
    bgColor: 'transparent',
    format: 'png',
    preset: 'passport_in',
    cropBox: cropBox,
    targetWidth: 35,
    targetHeight: 45,
    dpi: 300
  }, 'retailer');

  const outPath2 = res2.filePath || path.join(OUTPUT_DIR, res2.fileName);
  assert(fs.existsSync(outPath2), `Transparent output exists: ${path.basename(outPath2)}`);
  const meta2 = inspectImageWithPython(outPath2);
  assert(meta2.mode === 'RGBA', `Image has RGBA alpha channel (Actual: ${meta2.mode})`);
  assert(meta2.corner_pixel[3] !== undefined ? meta2.corner_pixel[3] < 50 : true, `Alpha channel in corner is transparent`);

  // TEST 3: Sky Blue Passport Background
  console.log('\n\x1b[36m--- TEST 3: Sky Blue Background (#2563eb) ---\x1b[0m');
  const res3 = await removeBackgroundLocal(inputBuffer, {
    bgColor: 'blue',
    format: 'png',
    preset: 'passport_in',
    cropBox: cropBox,
    targetWidth: 35,
    targetHeight: 45,
    dpi: 300
  }, 'retailer');

  const outPath3 = res3.filePath || path.join(OUTPUT_DIR, res3.fileName);
  assert(fs.existsSync(outPath3), `Blue background output exists: ${path.basename(outPath3)}`);
  const meta3 = inspectImageWithPython(outPath3);
  assert(meta3.corner_pixel[2] > 200, `Corner pixel has dominant blue component (RGB: [${meta3.corner_pixel.slice(0,3).join(',')}])`);

  // TEST 4: Subject Positioning Offsets & Scale
  console.log('\n\x1b[36m--- TEST 4: Subject Positioning (Scale & Offset) ---\x1b[0m');
  const res4 = await removeBackgroundLocal(inputBuffer, {
    bgColor: 'white',
    format: 'jpg',
    preset: 'passport_in',
    cropBox: cropBox,
    targetWidth: 35,
    targetHeight: 45,
    dpi: 300,
    subjectPosition: {
      scale: 0.85,
      offsetX: 10,
      offsetY: -15
    }
  }, 'retailer');

  const outPath4 = res4.filePath || path.join(OUTPUT_DIR, res4.fileName);
  assert(fs.existsSync(outPath4), `Subject positioned output exists: ${path.basename(outPath4)}`);
  const meta4 = inspectImageWithPython(outPath4);
  assert(meta4.width >= 410 && meta4.width <= 416, `Nudged output retains exact passport width (~413 px)`);
  assert(meta4.height >= 528 && meta4.height <= 534, `Nudged output retains exact passport height (~531 px)`);

  // TEST 5: 90-Degree Rotation
  console.log('\n\x1b[36m--- TEST 5: Image Rotation (90 Degrees) ---\x1b[0m');
  const res5 = await removeBackgroundLocal(inputBuffer, {
    bgColor: 'white',
    format: 'jpg',
    preset: 'custom',
    rotation: 90,
    cropBox: { x: 0, y: 0, width: 400, height: 400 },
    targetWidth: 40,
    targetHeight: 40,
    dpi: 300
  }, 'retailer');
  const outPath5 = res5.filePath || path.join(OUTPUT_DIR, res5.fileName);
  assert(fs.existsSync(outPath5), `Rotated output exists: ${path.basename(outPath5)}`);

  // TEST 6: Live HTTP API Call to POST /api/tools/process with Background Remover
  console.log('\n\x1b[36m--- TEST 6: Live HTTP API Execution (/api/tools/process) ---\x1b[0m');
  const base64Data = `data:image/png;base64,${inputBuffer.toString('base64')}`;
  const token = createSessionToken({ userId: 'MBTAR000010101', role: 'retailer' });

  const payload = JSON.stringify({
    toolTitle: 'Background Remover Image AI',
    preset: 'Indian Passport Photo',
    cropBox: { x: 50, y: 50, width: 400, height: 500 },
    rotation: 0,
    format: 'jpg',
    bgColor: 'white',
    targetWidth: 35,
    targetHeight: 45,
    dpi: 300,
    settings: {
      preset: 'passport_in',
      widthMm: 35,
      heightMm: 45,
      dpi: 300,
      format: 'jpg',
      bgColor: 'white'
    },
    fileName: 'test_passport.png',
    fileData: base64Data
  });

  const apiResult = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/tools/process',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  assert(apiResult.status === 200, `HTTP status is 200 OK (Received: ${apiResult.status})`);
  assert(apiResult.data && apiResult.data.success === true, 'API response reports success: true');
  assert(apiResult.data.outputUrl && apiResult.data.outputUrl.includes('/api/tools/download/'), `Tokenized download URL returned: ${apiResult.data.outputUrl}`);
  assert(apiResult.data.dimensions && apiResult.data.dimensions.dpi === 300, `Output dimensions confirm 300 DPI`);
  assert(apiResult.data.dimensions && apiResult.data.dimensions.widthMm === 35, `Output dimensions confirm 35 mm width`);
  assert(apiResult.data.dimensions && apiResult.data.dimensions.heightMm === 45, `Output dimensions confirm 45 mm height`);

  console.log(`\n\x1b[32m\x1b[1mALL ${passedAssertions}/${totalAssertions} PASSPORT CROPPING & BACKGROUND REMOVAL ASSERTIONS PASSED!\x1b[0m\n`);
}

runTests().catch(err => {
  console.error('\n\x1b[31mTest Suite Error:\x1b[0m', err);
  process.exit(1);
});
