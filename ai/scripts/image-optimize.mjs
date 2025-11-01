// ai/scripts/image-optimize.mjs
import { readdir, stat, mkdir, access } from 'node:fs/promises';
import { join, extname, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const SRC_DIR = join(PROJECT_ROOT, 'src');

// Configurable options
const CONFIG = {
  targetFormats: ['webp'], // Formats to convert to
  quality: 85, // Quality for compressed images
  minFileSizeKB: 10, // Only optimize files larger than this
  supportedExtensions: ['.jpg', '.jpeg', '.png', '.gif'],
  excludeDirs: ['node_modules', '_site', 'dist', '.git'],
};

async function findImages(dir, images = []) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!CONFIG.excludeDirs.includes(entry.name)) {
          await findImages(fullPath, images);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (CONFIG.supportedExtensions.includes(ext)) {
          const stats = await stat(fullPath);
          if (stats.size > CONFIG.minFileSizeKB * 1024) {
            images.push(fullPath);
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[image] Could not read directory ${dir}: ${err.message}`);
  }
  
  return images;
}

async function optimizeImages() {
  console.log('[image] Starting image optimization...');
  
  try {
    // Check if sharp is available
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch (err) {
      console.log('[image] sharp not installed. Run: npm install --save-dev sharp');
      console.log('[image] Skipping image optimization for now.');
      return;
    }
    
    const images = await findImages(SRC_DIR);
    
    if (images.length === 0) {
      console.log('[image] No images found that need optimization.');
      return;
    }
    
    console.log(`[image] Found ${images.length} image(s) to check for optimization.`);
    
    let optimized = 0;
    let skipped = 0;
    
    for (const imagePath of images) {
      const ext = extname(imagePath).toLowerCase();
      const dir = dirname(imagePath);
      const name = basename(imagePath, ext);
      
      try {
        // For now, just report what would be optimized
        // In production, this would actually convert and optimize
        const stats = await stat(imagePath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        // Check if WebP version already exists
        const webpPath = join(dir, `${name}.webp`);
        let hasWebP = false;
        try {
          await access(webpPath);
          hasWebP = true;
        } catch {
          // WebP doesn't exist
        }
        
        if (!hasWebP && ext !== '.webp') {
          console.log(`[image] Would optimize: ${imagePath.replace(PROJECT_ROOT, '.')} (${sizeMB} MB)`);
          // Uncomment to actually optimize:
          // await sharp(imagePath)
          //   .webp({ quality: CONFIG.quality })
          //   .toFile(webpPath);
          optimized++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.warn(`[image] Error processing ${imagePath}: ${err.message}`);
      }
    }
    
    console.log(`[image] Summary: ${optimized} would be optimized, ${skipped} already optimized or skipped.`);
    console.log('[image] Note: Actual optimization is disabled by default to avoid modifying source files.');
    console.log('[image] Enable by uncommenting the sharp conversion code in image-optimize.mjs');
    
  } catch (err) {
    console.error(`[image] Error during optimization: ${err.message}`);
    throw err;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  optimizeImages()
    .then(() => {
      console.log('[image] Image optimization check complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[image] Failed:', err);
      process.exit(1);
    });
}

export { optimizeImages };
