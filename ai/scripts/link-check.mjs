// ai/scripts/link-check.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const SITE_DIR = join(PROJECT_ROOT, '_site');

// Configuration
const CONFIG = {
  checkExternal: false, // Set to true to check external links (requires network)
  pathPrefix: process.env.ELEVENTY_PATH_PREFIX || '', // e.g., '/letstalkcdc' for subdirectory hosting
  excludePatterns: [
    /^mailto:/,
    /^tel:/,
    /^javascript:/,
    /^#/, // Skip anchor-only links for now
    /^{{/, // Skip template variables that weren't processed
  ],
  timeout: 5000,
};

class LinkChecker {
  constructor() {
    this.checkedLinks = new Map();
    this.brokenLinks = [];
    this.warnings = [];
  }

  async findHtmlFiles(dir, files = []) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await this.findHtmlFiles(fullPath, files);
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      console.warn(`[link-check] Could not read directory ${dir}: ${err.message}`);
    }
    
    return files;
  }

  extractLinks(html) {
    const links = [];
    
    // Extract href links from <a> tags
    const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      links.push({ url: match[1], type: 'link' });
    }
    
    // Extract src from <img> tags
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
      links.push({ url: match[1], type: 'image' });
    }
    
    // Extract src from <script> tags
    const scriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((match = scriptRegex.exec(html)) !== null) {
      links.push({ url: match[1], type: 'script' });
    }
    
    // Extract href from <link> tags (CSS, etc.)
    const linkRegex = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      links.push({ url: match[1], type: 'stylesheet' });
    }
    
    return links;
  }

  shouldSkipLink(url) {
    // Skip external links if not configured to check them
    if (!CONFIG.checkExternal && (url.startsWith('http://') || url.startsWith('https://'))) {
      return true;
    }
    
    // Skip excluded patterns
    for (const pattern of CONFIG.excludePatterns) {
      if (pattern.test(url)) {
        return true;
      }
    }
    
    return false;
  }

  resolveInternalLink(fromFile, linkUrl) {
    // Remove query string and hash for file checking
    const urlWithoutHash = linkUrl.split('#')[0].split('?')[0];
    
    if (!urlWithoutHash) {
      // Pure anchor link, considered valid
      return null;
    }
    
    // Remove the path prefix if present
    let cleanUrl = urlWithoutHash;
    if (CONFIG.pathPrefix && cleanUrl.startsWith(CONFIG.pathPrefix + '/')) {
      cleanUrl = cleanUrl.substring(CONFIG.pathPrefix.length);
    } else if (CONFIG.pathPrefix && cleanUrl === CONFIG.pathPrefix) {
      cleanUrl = '/';
    }
    
    let targetPath;
    
    if (cleanUrl.startsWith('/')) {
      // Absolute path from site root
      targetPath = join(SITE_DIR, cleanUrl);
    } else {
      // Relative path
      const fromDir = dirname(fromFile);
      targetPath = join(fromDir, cleanUrl);
    }
    
    // Try different resolution strategies in order
    // 1. Try the path as-is
    if (existsSync(targetPath)) {
      return targetPath;
    }
    
    // 2. Try with .html extension
    const htmlPath = targetPath + '.html';
    if (existsSync(htmlPath)) {
      return htmlPath;
    }
    
    // 3. Try as directory with index.html
    const indexPath = join(targetPath, 'index.html');
    if (existsSync(indexPath)) {
      return indexPath;
    }
    
    // File not found
    return null;
  }

  async checkFile(filePath) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const links = this.extractLinks(content);
      const relativePath = relative(SITE_DIR, filePath);
      
      for (const { url, type } of links) {
        if (this.shouldSkipLink(url)) {
          continue;
        }
        
        // Check internal links
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          const resolvedPath = this.resolveInternalLink(filePath, url);
          
          if (resolvedPath === null && !url.startsWith('#')) {
            this.brokenLinks.push({
              file: relativePath,
              link: url,
              type,
              reason: 'File not found',
            });
          }
        }
      }
      
      return links.length;
    } catch (err) {
      this.warnings.push(`Error reading ${filePath}: ${err.message}`);
      return 0;
    }
  }

  async check() {
    console.log('[link-check] Starting link validation...');
    console.log(`[link-check] Scanning ${SITE_DIR}`);
    
    // Check if _site directory exists
    if (!existsSync(SITE_DIR)) {
      console.error('[link-check] Error: _site directory not found. Run `npm run build` first.');
      throw new Error('_site directory not found');
    }
    
    const htmlFiles = await this.findHtmlFiles(SITE_DIR);
    console.log(`[link-check] Found ${htmlFiles.length} HTML file(s) to check.`);
    
    let totalLinks = 0;
    for (const file of htmlFiles) {
      const count = await this.checkFile(file);
      totalLinks += count;
    }
    
    console.log(`[link-check] Checked ${totalLinks} link(s) across ${htmlFiles.length} file(s).`);
    
    // Report warnings
    if (this.warnings.length > 0) {
      console.log(`[link-check] Warnings: ${this.warnings.length}`);
      this.warnings.forEach(w => console.warn(`  - ${w}`));
    }
    
    // Report broken links
    if (this.brokenLinks.length > 0) {
      console.error(`[link-check] ❌ Found ${this.brokenLinks.length} broken link(s):`);
      this.brokenLinks.forEach(({ file, link, type, reason }) => {
        console.error(`  - ${file}: ${type} "${link}" (${reason})`);
      });
      return false;
    } else {
      console.log('[link-check] ✅ All links are valid!');
      return true;
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new LinkChecker();
  checker.check()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error('[link-check] Fatal error:', err);
      process.exit(1);
    });
}

export { LinkChecker };
