// ai/scripts/data-sync.mjs
import { promises as fs } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');
const dataDir = join(projectRoot, 'src', '_data');
const stateDir = join(projectRoot, 'ai', '_state');
const cacheDir = join(stateDir, 'data');

const require = createRequire(import.meta.url);

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const readJsonFile = async (filePath, fallback = null) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[data-sync] Unable to read JSON ${relative(projectRoot, filePath)}:`, error.message);
    return fallback;
  }
};

const writeJsonFile = async (filePath, data) => {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  try {
    const existing = await fs.readFile(filePath, 'utf8');
    if (existing === serialized) {
      return false;
    }
  } catch (_) {
    // File does not exist — we'll create it below.
  }

  await fs.writeFile(filePath, serialized, 'utf8');
  return true;
};

const toStringSafe = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
};

const normalizeBadge = (badge) => {
  if (!badge || typeof badge !== 'object') {
    return null;
  }
  const label = toStringSafe(badge.label);
  const variant = toStringSafe(badge.variant);
  if (!label && !variant) {
    return null;
  }
  return {
    label: label || null,
    variant: variant || null,
  };
};

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((tag) => {
      if (!tag || typeof tag !== 'object') {
        return null;
      }
      const label = toStringSafe(tag.label);
      const variant = toStringSafe(tag.variant);
      if (!label && !variant) {
        return null;
      }
      return {
        label: label || null,
        variant: variant || null,
      };
    })
    .filter(Boolean);
};

const normalizeSeriesEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const key = toStringSafe(entry.key || entry.slug || entry.id);
  if (!key) {
    return null;
  }

  const totalSteps = Number.isFinite(entry.totalSteps) && entry.totalSteps > 0
    ? Math.round(entry.totalSteps)
    : null;

  return {
    key,
    title: toStringSafe(entry.title) || key,
    description: toStringSafe(entry.description) || null,
    href: toStringSafe(entry.href) || null,
    ctaLabel: toStringSafe(entry.ctaLabel) || null,
    isRecommended: Boolean(entry.isRecommended),
    badge: normalizeBadge(entry.badge),
    tags: normalizeTags(entry.tags),
    totalSteps,
  };
};

const normalizeSeries = (series) => {
  if (!Array.isArray(series)) {
    return [];
  }
  return series
    .map(normalizeSeriesEntry)
    .filter(Boolean);
};

const buildTagSummary = (series) => {
  const summaryMap = new Map();
  series.forEach((entry) => {
    entry.tags.forEach((tag) => {
      const key = tag.variant || tag.label || 'unknown';
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          key,
          variant: tag.variant || null,
          labels: new Set(),
          count: 0,
        });
      }
      const record = summaryMap.get(key);
      record.count += 1;
      if (tag.label) {
        record.labels.add(tag.label);
      }
    });
  });

  return Array.from(summaryMap.values())
    .map((record) => ({
      key: record.key,
      variant: record.variant,
      count: record.count,
      labels: Array.from(record.labels).sort(),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

const normalizeSite = (site) => {
  const payload = typeof site === 'object' && site !== null ? site : {};
  return {
    title: toStringSafe(payload.title) || null,
    tagline: toStringSafe(payload.tagline) || null,
    description: toStringSafe(payload.description) || null,
    host: toStringSafe(payload.host) || null,
    pathPrefix: toStringSafe(payload.pathPrefix) || null,
    author: toStringSafe(payload.author) || null,
    copyright: toStringSafe(payload.copyright) || null,
    generatedAt: new Date().toISOString(),
  };
};

const normalizeAppwrite = (config) => {
  const payload = typeof config === 'object' && config !== null ? config : {};
  const normalized = {
    endpoint: toStringSafe(payload.endpoint),
    project: toStringSafe(payload.project),
    databaseId: toStringSafe(payload.databaseId),
    progressCollectionId: toStringSafe(payload.progressCollectionId),
    eventsCollectionId: toStringSafe(payload.eventsCollectionId),
  };
  const missing = Object.entries(normalized)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    ...normalized,
    missing,
    isConfigured: missing.length === 0,
  };
};

const loadDataModule = async (fileName) => {
  const absolutePath = join(dataDir, fileName);
  try {
    if (fileName.endsWith('.json')) {
      return await readJsonFile(absolutePath, null);
    }
    return require(absolutePath);
  } catch (error) {
    console.warn(`[data-sync] Failed to load ${relative(projectRoot, absolutePath)}:`, error.message);
    return null;
  }
};

const main = async () => {
  await ensureDir(cacheDir);

  const rawSeries = await loadDataModule('series.cjs');
  const rawSite = await loadDataModule('site.cjs');
  const rawAppwrite = await loadDataModule('appwrite.cjs');

  const series = normalizeSeries(rawSeries);
  const site = normalizeSite(rawSite);
  const appwrite = normalizeAppwrite(rawAppwrite);

  const dashboardModules = series.map((entry) => ({
    id: entry.key,
    title: entry.title,
    href: entry.href,
    isRecommended: entry.isRecommended,
    totalSteps: entry.totalSteps,
    badge: entry.badge,
  }));

  const tagSummary = buildTagSummary(series);

  const outputs = [];
  const writeOutput = async (relativePath, data) => {
    const target = join(stateDir, relativePath);
    await ensureDir(dirname(target));
    const changed = await writeJsonFile(target, data);
    outputs.push({ file: relative(projectRoot, target), changed });
  };

  await writeOutput('data/site.json', site);
  await writeOutput('data/series.json', {
    generatedAt: site.generatedAt,
    items: series,
  });
  await writeOutput('data/appwrite.json', {
    generatedAt: site.generatedAt,
    ...appwrite,
  });
  await writeOutput('data/dashboard-modules.json', {
    generatedAt: site.generatedAt,
    items: dashboardModules,
  });
  await writeOutput('data/tag-summary.json', {
    generatedAt: site.generatedAt,
    tags: tagSummary,
  });

  const manifestPath = join(stateDir, 'data-manifest.json');
  const manifestEntry = {
    file: relative(projectRoot, manifestPath),
    changed: false,
  };

  const manifest = {
    generatedAt: site.generatedAt,
    moduleCount: series.length,
    recommendedCount: series.filter((entry) => entry.isRecommended).length,
    configuredAppwrite: appwrite.isConfigured,
    outputs: [...outputs, manifestEntry],
  };

  const manifestChanged = await writeJsonFile(manifestPath, manifest);
  manifestEntry.changed = manifestChanged;
  outputs.push(manifestEntry);

  if (manifestChanged) {
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  const updated = outputs.filter((entry) => entry.changed).length;
  const skipped = outputs.length - updated;
  console.log(
    `[data-sync] Completed. ${outputs.length} file(s) processed — ${updated} updated, ${skipped} unchanged.`
  );
};

main().catch((error) => {
  console.error('[data-sync] Failed:', error);
  process.exitCode = 1;
});
