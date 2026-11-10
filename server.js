const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || "/data";
const DATA_FILE = path.join(DATA_DIR, "homebase.json");
const FAVICON_DIR = path.join(DATA_DIR, "favicons");
const FAVICON_POLICY_VERSION = 2;
const FAVICON_CACHE_MS = 24 * 60 * 60 * 1000;
const faviconRequests = new Map();
let faviconMaintenanceRunning = false;
const BACKGROUND_DIR = path.join(DATA_DIR, "background");
const PUBLIC_DIR = path.join(__dirname, "public");
const STATUS_TARGETS = parseStatusTargets(process.env.HOMEBASE_STATUS_TARGETS || "[]");
const { createAuth } = require("./auth");
const auth = createAuth({ directory: DATA_DIR });
const categoryColors = ["#35f0ff", "#56ff8f", "#ffb238", "#ff4f7a", "#c471ff", "#4aa8ff", "#ff6f3c"];

const defaultCategories = [
  ["Business", "briefcase", "#ffb238"],
  ["Server", "server", "#35f0ff"],
  ["Netzwerk", "network", "#56ff8f"],
  ["Smart Home", "home", "#c471ff"],
  ["Sicherheit", "shield", "#ff4f7a"],
  ["Werkstatt", "tool", "#ff6f3c"],
  ["Medien", "media", "#4aa8ff"]
].map(([name, icon, color]) => ({ id: crypto.randomUUID(), name, icon, color }));

const defaultData = {
  schemaVersion: 5,
  setupComplete: false,
  title: "HarborDash",
  subtitle: "Deine Startseite fuer Links, Profile und kleine Widgets",
  theme: "dark",
  appearance: {
    backgroundImage: "",
    backgroundImages: [],
    backgroundOpacity: 0.35,
    backgroundInterval: 30,
    linkTransparency: 72,
    categoryTransparency: 58
  },
  activeProfileId: "default",
  widgets: {
    clock: true,
    notes: [],
    googleSearch: false,
    statusOverview: false,
    linkStats: false,
    weather: {
      enabled: false,
      label: "Zuhause",
      latitude: "",
      longitude: ""
    }
  },
  preferences: {
    startpageMode: true,
    shareMode: false,
    showCategoryCounts: false,
    compactCategoryLayout: false,
    tileCategoryLayout: false,
    showLinkStatus: true,
    showNotes: true,
    openLinksInNewTab: true
  },
  admin: {
    allowedIps: []
  },
  profiles: [
    {
      id: "default",
      name: "Privat",
      categories: [{ id: crypto.randomUUID(), name: "Links", icon: "star", color: "#35f0ff" }],
      links: []
    }
  ]
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(FAVICON_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
  }
}

function readData() {
  ensureDataFile();
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const migrated = migrateData(data);
  if (JSON.stringify(migrated) !== JSON.stringify(data)) {
    fs.writeFileSync(DATA_FILE, `${JSON.stringify(migrated, null, 2)}\n`);
  }
  return migrated;
}

function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const existing = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : {};
  const safeData = normalizeData({
    ...data,
    admin: {
      ...existing.admin,
      ...data.admin
    },
    schemaVersion: data.schemaVersion || 5
  });
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(safeData, null, 2)}\n`);
  fs.renameSync(temporaryFile, DATA_FILE);
  return safeData;
}

function dataRevision(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

// Merge only edits since the client's snapshot; arrays of records use stable IDs.
function mergeEdits(base, edited, current) {
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (equal(base, edited)) return current;
  if (equal(base, current) || equal(edited, current)) return edited;
  const records = (value) => Array.isArray(value) && value.every((item) => item && typeof item.id === "string");
  if (records(base) && records(edited) && records(current)) {
    const byId = (items) => new Map(items.map((item) => [item.id, item]));
    const before = byId(base), after = byId(edited), latest = byId(current);
    return [...new Set([...latest.keys(), ...after.keys()])]
      .map((id) => mergeEdits(before.get(id), after.get(id), latest.get(id)))
      .filter((item) => item !== undefined);
  }
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);
  if (object(base) && object(edited) && object(current)) {
    return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(edited), ...Object.keys(current)])]
      .filter((key) => !["__proto__", "constructor", "prototype"].includes(key))
      .map((key) => [key, mergeEdits(base[key], edited[key], current[key])])
      .filter(([, value]) => value !== undefined));
  }
  const error = new Error("Dieser Eintrag wurde inzwischen von jemand anderem geaendert oder geloescht. Die Seite wurde aktualisiert. Bitte pruefe deine Aenderung erneut.");
  error.statusCode = 409;
  throw error;
}

function saveClientEdits(payload, req, settingsOnly = false) {
  const current = readData();
  if (!payload.base || !payload.revision || dataRevision(normalizeData(payload.base)) !== payload.revision) {
    const error = new Error("Bitte lade die Seite neu, bevor du speicherst.");
    error.statusCode = 428;
    throw error;
  }
  const allowed = settingsOnly
    ? ["title", "subtitle", "theme", "appearance", "preferences", "widgets", "admin"]
    : ["setupComplete", "title", "subtitle", "theme", "appearance", "activeProfileId", "widgets", "preferences", "admin", "profiles"];
  const latest = toPublicData(current, req);
  const updates = {};
  for (const key of allowed) {
    if (Object.hasOwn(payload, key)) updates[key] = mergeEdits(payload.base[key], payload[key], latest[key]);
  }
  return writeData({ ...current, ...updates });
}

function normalizeData(data) {
  if (isHomarrData(data)) {
    return normalizeData(convertHomarrData(data));
  }
  const title = String(data.title || "Startseite").slice(0, 80);
  const subtitle = String(data.subtitle || "").slice(0, 140);
  const rawProfiles = Array.isArray(data.profiles) && data.profiles.length
    ? data.profiles
    : [
        {
          id: data.activeProfileId || "default",
          name: "Start",
          categories: data.categories,
          links: data.links
        }
      ];
  const profiles = rawProfiles.map(normalizeProfile).filter((profile) => profile.links.length || profile.categories.length);
  if (!profiles.length) profiles.push(normalizeProfile(defaultData.profiles[0]));
  const activeProfileId = profiles.some((profile) => profile.id === data.activeProfileId)
    ? String(data.activeProfileId)
    : profiles[0].id;
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0];

  return {
    schemaVersion: Number(data.schemaVersion || 1),
    setupComplete: data.setupComplete !== false,
    title,
    subtitle,
    theme: normalizeTheme(data.theme),
    appearance: normalizeAppearance(data.appearance),
    activeProfileId,
    widgets: normalizeWidgets(data.widgets),
    preferences: normalizePreferences(data.preferences),
    admin: normalizeAdmin(data.admin),
    profiles,
    categories: activeProfile.categories,
    links: activeProfile.links
  };
}

function isHomarrData(data) {
  return Array.isArray(data?.apps) && Array.isArray(data?.categories) && !Array.isArray(data?.profiles);
}

function convertHomarrData(data) {
  const categories = parseHomarrCategories(data);
  const links = parseHomarrLinks(data, categories);
  const profileId = crypto.randomUUID();
  return {
    schemaVersion: 5,
    setupComplete: true,
    title: String(data.configProperties?.name || data.name || "Homarr").slice(0, 80),
    subtitle: "",
    theme: "retro",
    appearance: defaultData.appearance,
    activeProfileId: profileId,
    widgets: defaultData.widgets,
    preferences: defaultData.preferences,
    admin: defaultData.admin,
    profiles: [
      {
        id: profileId,
        name: String(data.configProperties?.name || data.name || "Homarr").slice(0, 50),
        categories: categories.map((category, index) => ({
          id: crypto.randomUUID(),
          name: category.name,
          icon: inferHomarrCategoryIcon(category.name),
          color: categoryColors[index % categoryColors.length]
        })),
        links
      }
    ]
  };
}

function parseHomarrCategories(data) {
  const categories = data.categories
    .map((category, index) => ({
      homarrId: String(category.id || ""),
      name: String(category.name || "").trim(),
      position: Number.isFinite(Number(category.position)) ? Number(category.position) : index
    }))
    .filter((category) => category.homarrId && category.name)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
  if (!categories.length) categories.push({ homarrId: "homarr-default", name: "Homarr", position: 0 });
  return categories;
}

function parseHomarrLinks(data, categories) {
  const categoryById = new Map(categories.map((category) => [category.homarrId, category.name]));
  const knownKeys = new Set();
  return [
    ...parseHomarrAppLinks(data, categoryById),
    ...parseHomarrBookmarkLinks(data, categoryById)
  ]
    .filter((link) => {
      if (!link.url || !/^https?:\/\//i.test(link.url)) return false;
      const key = `${link.url}::${link.title.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
      if (knownKeys.has(key)) return false;
      knownKeys.add(key);
      return true;
    })
    .sort((a, b) => a.category.localeCompare(b.category, "de", { sensitivity: "base" }) || a.position - b.position || a.title.localeCompare(b.title, "de", { sensitivity: "base" }))
    .map(({ position, ...link }) => link);
}

function parseHomarrAppLinks(data, categoryById) {
  return (Array.isArray(data.apps) ? data.apps : [])
    .map((app, index) => {
      const url = normalizeUrl(String(app.behaviour?.externalUrl || app.behaviour?.onClickUrl || app.url || "").trim());
      const category = homarrAppCategoryName(app, categoryById);
      const position = homarrAppPosition(app, index);
      return {
        id: crypto.randomUUID(),
        title: String(app.name || url || "Homarr Link").trim().slice(0, 80),
        url,
        category,
        note: "",
        position,
        statusWidget: { enabled: false, type: "basic", url: "", statusPath: "" }
      };
    });
}

function parseHomarrBookmarkLinks(data, categoryById) {
  return (Array.isArray(data.widgets) ? data.widgets : [])
    .filter((widget) => String(widget?.type || "").toLowerCase() === "bookmark")
    .flatMap((widget, widgetIndex) => {
      const category = homarrAreaCategoryName(widget, categoryById);
      const widgetPosition = homarrAppPosition(widget, widgetIndex) * 1000;
      const items = Array.isArray(widget.properties?.items) ? widget.properties.items : [];
      return items.map((item, itemIndex) => {
        const url = normalizeUrl(String(item.href || item.url || "").trim());
        return {
          id: crypto.randomUUID(),
          title: String(item.name || url || "Homarr Bookmark").trim().slice(0, 80),
          url,
          category,
          note: "",
          position: widgetPosition + itemIndex,
          statusWidget: { enabled: false, type: "basic", url: "", statusPath: "" }
        };
      });
    });
}

function homarrAppCategoryName(app, categoryById) {
  return homarrAreaCategoryName(app, categoryById);
}

function homarrAreaCategoryName(item, categoryById) {
  const areaType = String(item.area?.type || "").toLowerCase();
  const categoryId = String(item.area?.properties?.id || "");
  if (areaType === "category" && categoryById.has(categoryId)) return categoryById.get(categoryId);
  if (areaType === "sidebar") return "Sidebar";
  return "Homarr";
}

function homarrAppPosition(app, fallback) {
  for (const location of [app.shape?.lg?.location, app.shape?.md?.location, app.shape?.sm?.location]) {
    const x = Number(location?.x);
    const y = Number(location?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return y * 100 + x;
  }
  return fallback;
}

function inferHomarrCategoryIcon(name) {
  const normalized = String(name || "").toLowerCase();
  if (/(server|nas|idrac|ilo|vmware|proxmox)/.test(normalized)) return "server";
  if (/(internet|netz|switch|router|firewall)/.test(normalized)) return "network";
  if (/(medien|media|video|photo|foto)/.test(normalized)) return "media";
  if (/(smart|home|haus)/.test(normalized)) return "home";
  if (/(sicher|security|vault|passwort)/.test(normalized)) return "shield";
  if (/(werk|tool|tools|util|nutz)/.test(normalized)) return "tool";
  if (/(business|shop|rechnung|daily|täglich|taeglich)/.test(normalized)) return "briefcase";
  return "folder";
}

function normalizeProfile(profile) {
  const links = Array.isArray(profile.links) ? profile.links : [];
  const normalizedLinks = links
    .map((link) => ({
      id: String(link.id || crypto.randomUUID()),
      title: String(link.title || "Ohne Titel").slice(0, 80),
      url: normalizeUrl(String(link.url || "")),
      category: String(link.category || "Links").slice(0, 40),
      note: String(link.note || "").slice(0, 120),
      statusWidget: normalizeStatusWidget(link.statusWidget, link.url)
    }))
    .filter((link) => link.url);

  return {
    id: String(profile.id || crypto.randomUUID()),
    name: String(profile.name || "Start").slice(0, 50),
    categories: normalizeCategories(profile.categories, normalizedLinks),
    links: normalizedLinks
  };
}

function normalizeTheme(theme) {
  return ["retro", "time-circuit", "dark", "light", "terminal", "discord-dark", "discord-light"].includes(theme) ? theme : "retro";
}

function normalizeAppearance(appearance) {
  const backgroundImage = normalizeBackgroundImage(appearance?.backgroundImage || appearance?.backgroundUrl || "");
  const backgroundImages = normalizeBackgroundImages(appearance?.backgroundImages, backgroundImage);
  const rawOpacity = Number(appearance?.backgroundOpacity);
  const backgroundOpacity = Number.isFinite(rawOpacity)
    ? Math.min(0.9, Math.max(0, rawOpacity))
    : 0.35;
  const rawInterval = Number(appearance?.backgroundInterval);
  const backgroundInterval = Number.isFinite(rawInterval)
    ? Math.min(300, Math.max(5, Math.round(rawInterval)))
    : 30;
  const linkTransparency = normalizeTransparency(appearance?.linkTransparency, 72);
  const categoryTransparency = normalizeTransparency(appearance?.categoryTransparency, 58);
  return { backgroundImage, backgroundImages, backgroundOpacity, backgroundInterval, linkTransparency, categoryTransparency };
}

function normalizeTransparency(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function normalizeBackgroundImages(images, fallbackImage = "") {
  const seen = new Set();
  const normalized = (Array.isArray(images) ? images : [])
    .map((image) => {
      const url = normalizeBackgroundImage(image?.url || image);
      const id = String(image?.id || backgroundIdFromUrl(url) || crypto.randomUUID()).slice(0, 80);
      const name = String(image?.name || "Hintergrund").trim().slice(0, 80) || "Hintergrund";
      return { id, name, url };
    })
    .filter((image) => {
      if (!image.url || seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    })
    .slice(0, 24);
  if (!normalized.length && fallbackImage) {
    normalized.push({
      id: backgroundIdFromUrl(fallbackImage) || "legacy-background",
      name: "Hintergrund",
      url: fallbackImage
    });
  }
  return normalized;
}

function normalizeBackgroundImage(value) {
  const trimmed = String(value || "").trim().slice(0, 1000);
  if (!trimmed) return "";
  if (/^\/api\/background-image(?:\?.*)?$/i.test(trimmed)) return trimmed;
  if (/^\/api\/background-images\/[\w.-]+(?:\?.*)?$/i.test(trimmed)) return trimmed;
  const normalized = normalizeUrl(trimmed);
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? normalized : "";
  } catch {
    return "";
  }
}

function backgroundIdFromUrl(value) {
  const match = String(value || "").match(/\/api\/background-images\/([\w-]+)/i);
  return match ? match[1] : "";
}

function normalizeWidgets(widgets) {
  const legacyNote = String(widgets?.quickNote || "").trim();
  const notes = Array.isArray(widgets?.notes)
    ? widgets.notes
    : legacyNote
      ? [{ id: crypto.randomUUID(), text: legacyNote }]
      : [];

  return {
    clock: widgets?.clock !== false,
    googleSearch: widgets?.googleSearch === true,
    statusOverview: widgets?.statusOverview === true,
    linkStats: widgets?.linkStats === true,
    weather: normalizeWeatherWidget(widgets?.weather),
    notes: notes
      .map((note) => ({
        id: String(note.id || crypto.randomUUID()),
        text: String(note.text || "").trim().slice(0, 500)
      }))
      .filter((note) => note.text)
  };
}

function normalizeWeatherWidget(weather) {
  const rawLatitude = String(weather?.latitude || "").trim();
  const rawLongitude = String(weather?.longitude || "").trim();
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  return {
    enabled: weather?.enabled === true,
    label: String(weather?.label || "Zuhause").trim().slice(0, 40) || "Zuhause",
    latitude: rawLatitude && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? String(latitude) : "",
    longitude: rawLongitude && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? String(longitude) : ""
  };
}

function normalizePreferences(preferences) {
  return {
    startpageMode: preferences?.startpageMode !== false,
    shareMode: preferences?.shareMode === true,
    showCategoryCounts: preferences?.showCategoryCounts === true,
    compactCategoryLayout: preferences?.compactCategoryLayout === true,
    tileCategoryLayout: preferences?.tileCategoryLayout === true,
    showLinkStatus: preferences?.showLinkStatus !== false,
    showNotes: preferences?.showNotes !== false,
    openLinksInNewTab: preferences?.openLinksInNewTab !== false
  };
}

function normalizeAdmin(admin) {
  return { allowedIps: [] };
}

function normalizeStatusWidget(widget, fallbackUrl = "") {
  const enabled = widget?.enabled === true;
  return {
    enabled,
    type: ["basic", "proxmox", "unraid", "amp", "homeassistant"].includes(String(widget?.type || "").toLowerCase())
      ? String(widget.type).toLowerCase()
      : "basic",
    url: normalizeUrl(String(widget?.url || fallbackUrl || "")),
    statusPath: String(widget?.statusPath || "").slice(0, 160),
    tokenId: String(widget?.tokenId || "").slice(0, 160),
    tokenSecret: String(widget?.tokenSecret || "").slice(0, 260),
    apiKey: String(widget?.apiKey || "").slice(0, 260),
    username: String(widget?.username || "").slice(0, 160),
    password: String(widget?.password || "").slice(0, 260),
    entities: normalizeHomeAssistantEntities(widget?.entities),
    headerName: String(widget?.headerName || "").slice(0, 80),
    headerValue: String(widget?.headerValue || "").slice(0, 260),
    debug: widget?.debug === true
  };
}

function normalizeHomeAssistantEntities(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  return raw
    .split(/[\n,]+/)
    .map((entity) => entity.trim())
    .filter((entity) => /^[a-z_]+\.[\w-]+$/i.test(entity))
    .slice(0, 12);
}

function normalizeCategories(categories, links) {
  const seen = new Set();
  const normalizedCategories = (Array.isArray(categories) ? categories : [])
    .map((category) => ({
      id: String(category.id || crypto.randomUUID()),
      name: String(category.name || "").trim().slice(0, 40),
      icon: normalizeCategoryIcon(category.icon),
      color: normalizeCategoryColor(category.color)
    }))
    .filter((category) => {
      if (!category.name || seen.has(category.name)) return false;
      seen.add(category.name);
      return true;
    });

  for (const link of links) {
    if (!seen.has(link.category)) {
      normalizedCategories.push({ id: crypto.randomUUID(), name: link.category, icon: "folder", color: "#35f0ff" });
      seen.add(link.category);
    }
  }

  const categoryList = normalizedCategories.length ? normalizedCategories : defaultCategories;
  return categoryList.sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
}

function normalizeCategoryIcon(icon) {
  const normalized = String(icon || "").toLowerCase();
  return ["star", "server", "network", "home", "shield", "tool", "media", "briefcase", "game", "link", "folder"].includes(normalized)
    ? normalized
    : "folder";
}

function normalizeCategoryColor(color) {
  const normalized = String(color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#35f0ff";
}

function migrateData(data) {
  const normalized = normalizeData(data);
  const originalVersion = normalized.schemaVersion;

  if (originalVersion < 2) {
    normalized.links = normalized.links.map((link) => ({
      ...link,
      category: link.category || "Links"
    }));
  }

  normalized.schemaVersion = 5;
  normalized.subtitle = normalized.subtitle || defaultData.subtitle;
  const activeProfile = normalized.profiles.find((profile) => profile.id === normalized.activeProfileId) || normalized.profiles[0];
  activeProfile.categories = normalizeCategories(originalVersion < 2 ? [] : activeProfile.categories, activeProfile.links);
  normalized.categories = activeProfile.categories;
  normalized.links = activeProfile.links;

  return normalized;
}

function normalizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[\w.-]+(:\d+)?(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function isAuthed(req) { return auth.authenticated(req); }

function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  sendJson(res, 401, { error: "Login erforderlich" });
  return false;
}

function toPublicData(data, req) {
  const authEnabled = isAuthEnabled(data);
  const authenticated = !authEnabled || isAuthed(req);
  const publicData = authenticated ? data : createLockedData(data);
  return {
    ...publicData,
    revision: authenticated ? dataRevision(data) : "",
    admin: {
      allowedIps: authenticated ? data.admin?.allowedIps || [] : [],
      enabled: authEnabled,
      hasPassword: true
    },
    auth: {
      enabled: authEnabled,
      authenticated,
      rememberDays: auth.days,
      ipAllowed: authEnabled ? isAllowedIp(req, data.admin) : true
    }
  };
}

function isAuthEnabled() { return true; }
function isAllowedIp() { return false; }

function createLockedData() {
  return {
    ...defaultData, setupComplete: true, title: "HarborDash", subtitle: "Dein persönlicher Startpunkt.",
    theme: "dark", activeProfileId: "", profiles: [], categories: [], links: []
  };
}

function redactStatusSecrets(data) {
  const redactLink = (link) => link.statusWidget ? {
    ...link,
    statusWidget: {
      ...link.statusWidget,
      tokenId: "",
      tokenSecret: "",
      apiKey: "",
      username: "",
      password: "",
      headerValue: ""
    }
  } : link;
  const profiles = (data.profiles || []).map((profile) => ({
    ...profile,
    links: (profile.links || []).map(redactLink)
  }));
  return {
    ...data,
    profiles,
    links: (data.links || []).map(redactLink)
  };
}

function sendFaviconFallback(res) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#160b27"/><path d="M14 44h36M18 20h28M20 32h24" stroke="#26f4ff" stroke-width="5" stroke-linecap="round"/><path d="M14 44h36M18 20h28M20 32h24" stroke="#ff3df2" stroke-width="2" stroke-linecap="round"/></svg>`;
  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=86400"
  });
  res.end(svg);
}

function readCachedFavicon(parsed) {
  fs.mkdirSync(FAVICON_DIR, { recursive: true });
  const cacheKey = crypto.createHash("sha256").update(parsed.href).digest("hex");
  const cacheFile = path.join(FAVICON_DIR, `${cacheKey}.bin`);
  const metaFile = path.join(FAVICON_DIR, `${cacheKey}.json`);
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch {}
  const fresh = meta.policyVersion === FAVICON_POLICY_VERSION && Date.now() - Number(meta.updatedAt || 0) < FAVICON_CACHE_MS;
  return { cacheFile, metaFile, meta, fresh };
}

async function refreshCachedFavicon(parsed) {
  const cached = readCachedFavicon(parsed);
  if (cached.fresh) return cached;
  let pending = faviconRequests.get(parsed.href);
  if (!pending) {
    pending = (async () => {
      let meta = cached.meta;
      try {
        const icon = await fetchBestFavicon(parsed);
        fs.writeFileSync(cached.cacheFile, icon.buffer);
        meta = { contentType: icon.contentType };
      } catch {
        // Keep the previous image, and postpone another attempt for a day.
      }
      fs.writeFileSync(cached.metaFile, JSON.stringify({ ...meta, updatedAt: Date.now(), policyVersion: FAVICON_POLICY_VERSION }));
      return readCachedFavicon(parsed);
    })().finally(() => faviconRequests.delete(parsed.href));
    faviconRequests.set(parsed.href, pending);
  }
  return pending;
}

async function serveFavicon(res, targetUrl) {
  const parsed = parseHttpUrl(targetUrl);
  if (!parsed) {
    sendFaviconFallback(res);
    return;
  }
  const cached = await refreshCachedFavicon(parsed);
  if (!fs.existsSync(cached.cacheFile)) {
    sendFaviconFallback(res);
    return;
  }
  res.writeHead(200, { "Content-Type": cached.meta.contentType || "image/x-icon", "Cache-Control": "public, max-age=86400" });
  fs.createReadStream(cached.cacheFile).pipe(res);
}

async function refreshStoredFavicons() {
  if (faviconMaintenanceRunning) return;
  faviconMaintenanceRunning = true;
  try {
    const urls = new Set(readData().profiles.flatMap((profile) => profile.links.map((link) => link.url)));
    for (const url of urls) {
      const parsed = parseHttpUrl(url);
      if (parsed) await refreshCachedFavicon(parsed);
    }
  } catch (error) {
    console.error(`Favicon-Aktualisierung fehlgeschlagen: ${error.message}`);
  } finally {
    faviconMaintenanceRunning = false;
  }
}

function serveBackgroundImage(res) {
  const file = findStoredBackground();
  if (!file) {
    sendJson(res, 404, { error: "No background image" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentTypeForExtension(path.extname(file)),
    "Cache-Control": "no-cache"
  });
  fs.createReadStream(file).pipe(res);
}

function serveBackgroundGalleryImage(res, requestPath) {
  const name = path.basename(requestPath);
  if (!/^[-\w]+\.(png|jpe?g|webp|gif|avif)$/i.test(name)) {
    sendJson(res, 404, { error: "Background image not found" });
    return;
  }
  const file = path.join(BACKGROUND_DIR, name);
  if (!isInsideDirectory(file, BACKGROUND_DIR) || !fs.existsSync(file)) {
    sendJson(res, 404, { error: "Background image not found" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentTypeForExtension(path.extname(file)),
    "Cache-Control": "public, max-age=604800"
  });
  fs.createReadStream(file).pipe(res);
}

function saveBackgroundGalleryImage(buffer, contentType, originalName = "") {
  const extension = extensionForContentType(contentType);
  if (!extension) throw new Error("Nur PNG, JPG, WebP, GIF oder AVIF sind erlaubt");
  if (!buffer.length) throw new Error("Bilddatei ist leer");

  fs.mkdirSync(BACKGROUND_DIR, { recursive: true });
  const id = crypto.randomUUID();
  const filePath = path.join(BACKGROUND_DIR, `${id}${extension}`);
  fs.writeFileSync(filePath, buffer);
  const data = readData();
  const image = {
    id,
    name: sanitizeBackgroundName(originalName) || `Hintergrund ${data.appearance?.backgroundImages?.length ? data.appearance.backgroundImages.length + 1 : 1}`,
    url: `/api/background-images/${id}${extension}?v=${Date.now()}`
  };
  const backgroundImages = [...(data.appearance?.backgroundImages || []), image].slice(0, 24);
  return writeData({
    ...data,
    appearance: {
      ...(data.appearance || {}),
      backgroundImage: data.appearance?.backgroundImage || image.url,
      backgroundImages
    }
  });
}

function deleteBackgroundGalleryImage(id) {
  const data = readData();
  const backgroundImages = (data.appearance?.backgroundImages || []).filter((image) => image.id !== id);
  const removed = (data.appearance?.backgroundImages || []).find((image) => image.id === id);
  if (removed?.url) {
    const file = filePathForBackgroundUrl(removed.url);
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  }
  const nextBackgroundImage = data.appearance?.backgroundImage === removed?.url
    ? backgroundImages[0]?.url || ""
    : data.appearance?.backgroundImage || backgroundImages[0]?.url || "";
  return writeData({
    ...data,
    appearance: {
      ...(data.appearance || {}),
      backgroundImage: nextBackgroundImage,
      backgroundImages
    }
  });
}

function saveBackgroundImage(buffer, contentType) {
  const extension = extensionForContentType(contentType);
  if (!extension) throw new Error("Nur PNG, JPG, WebP, GIF oder AVIF sind erlaubt");
  if (!buffer.length) throw new Error("Bilddatei ist leer");

  fs.mkdirSync(BACKGROUND_DIR, { recursive: true });
  for (const file of fs.readdirSync(BACKGROUND_DIR)) {
    if (file.startsWith("custom-background.")) fs.unlinkSync(path.join(BACKGROUND_DIR, file));
  }
  const filePath = path.join(BACKGROUND_DIR, `custom-background${extension}`);
  fs.writeFileSync(filePath, buffer);
  const data = readData();
  return writeData({
    ...data,
    appearance: {
      ...(data.appearance || {}),
      backgroundImage: `/api/background-image?v=${Date.now()}`
    }
  });
}

function filePathForBackgroundUrl(url) {
  const match = String(url || "").match(/\/api\/background-images\/([-\w]+\.(?:png|jpe?g|webp|gif|avif))/i);
  if (!match) return "";
  const file = path.join(BACKGROUND_DIR, path.basename(match[1]));
  return isInsideDirectory(file, BACKGROUND_DIR) ? file : "";
}

function isInsideDirectory(file, directory) {
  const relative = path.relative(directory, file);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function sanitizeBackgroundName(value) {
  return String(value || "")
    .trim()
    .replace(/[^\p{L}\p{N} ._-]+/gu, "")
    .slice(0, 80);
}

function deleteBackgroundImage() {
  fs.mkdirSync(BACKGROUND_DIR, { recursive: true });
  for (const file of fs.readdirSync(BACKGROUND_DIR)) {
    if (/^(custom-background\.|[-\w]+\.(png|jpe?g|webp|gif|avif)$)/i.test(file)) fs.unlinkSync(path.join(BACKGROUND_DIR, file));
  }
  const data = readData();
  return writeData({
    ...data,
    appearance: {
      ...(data.appearance || {}),
      backgroundImage: "",
      backgroundImages: []
    }
  });
}

function findStoredBackground() {
  if (!fs.existsSync(BACKGROUND_DIR)) return "";
  const file = fs.readdirSync(BACKGROUND_DIR)
    .find((name) => /^custom-background\.(png|jpe?g|webp|gif|avif)$/i.test(name));
  return file ? path.join(BACKGROUND_DIR, file) : "";
}

function extensionForContentType(contentType) {
  const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();
  return {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif"
  }[normalized] || "";
}

function contentTypeForExtension(extension) {
  return {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif"
  }[String(extension || "").toLowerCase()] || "application/octet-stream";
}

async function fetchBestFavicon(pageUrl) {
  const html = await requestBuffer(pageUrl.href, { accept: "text/html,*/*", limit: 1_500_000 }).catch(() => null);
  const candidates = [];

  if (html?.buffer) {
    const htmlText = html.buffer.toString("utf8");
    candidates.push(...extractIconUrls(htmlText, pageUrl));
  }

  candidates.push(new URL("/favicon.ico", pageUrl.origin).href);
  candidates.push(new URL("/favicon.png", pageUrl.origin).href);
  candidates.push(new URL("/favicon.svg", pageUrl.origin).href);
  candidates.push(new URL("/apple-touch-icon.png", pageUrl.origin).href);

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    try {
      const response = await requestBuffer(candidate, { accept: "image/*,*/*", limit: 500_000 });
      const bytes = response.buffer;
      const inferred = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
        : bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])) ? "image/x-icon"
        : bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg"
        : /^GIF8/.test(bytes.subarray(0, 4).toString()) ? "image/gif" : "";
      if (bytes.length > 0 && (response.contentType.startsWith("image/") || inferred)) {
        return { ...response, contentType: inferred || response.contentType };
      }
    } catch {
      // Try the next declared or conventional favicon location.
    }
  }

  throw new Error("No favicon found");
}

async function readLinkMetadata(targetUrl) {
  const parsed = parseHttpUrl(normalizeUrl(String(targetUrl || "")));
  if (!parsed) return { ok: false, message: "Ungueltige URL" };

  try {
    const html = await requestText(parsed.href, { accept: "text/html,*/*", limit: 1_500_000 });
    const title = extractPageTitle(html);
    const category = suggestCategoryForLink({ title, url: parsed.href });
    return {
      ok: Boolean(title),
      url: parsed.href,
      title: title.slice(0, 80),
      suggestedCategory: category,
      message: title ? "" : "Seitentitel nicht gefunden"
    };
  } catch (error) {
    return {
      ok: false,
      url: parsed.href,
      title: "",
      suggestedCategory: suggestCategoryForLink({ title: "", url: parsed.href }),
      message: error.message
    };
  }
}

function extractPageTitle(html) {
  const ogTitle = getMetaContent(html, "property", "og:title")
    || getMetaContent(html, "name", "og:title")
    || getMetaContent(html, "property", "twitter:title")
    || getMetaContent(html, "name", "twitter:title");
  const title = ogTitle || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return decodeHtmlText(title).replace(/\s+/g, " ").trim();
}

function getMetaContent(html, attrName, attrValue) {
  const metaPattern = /<meta\b[^>]*>/gi;
  for (const [tag] of html.matchAll(metaPattern)) {
    const attrs = readHtmlAttrs(tag);
    if (String(attrs[attrName] || "").toLowerCase() === attrValue.toLowerCase()) {
      return attrs.content || "";
    }
  }
  return "";
}

function extractIconUrls(html, pageUrl) {
  const urls = [];
  const linkPattern = /<link\b[^>]*>/gi;
  for (const [tag] of html.matchAll(linkPattern)) {
    const attrs = readHtmlAttrs(tag);
    const rel = attrs.rel || "";
    const href = attrs.href || "";
    if (href && /\b(icon|apple-touch-icon)\b/i.test(rel)) {
      try {
        const url = new URL(href, pageUrl.href);
        if (!parseHttpUrl(url.href)) continue;
        // Prefer explicit scalable/raster artwork over conventional framework ICO files.
        const format = String(attrs.type || "").toLowerCase();
        const score = /svg/.test(format) || /\.svg$/i.test(url.pathname) ? 3
          : /png|webp|avif/.test(format) || /\.(png|webp|avif)$/i.test(url.pathname) ? 2 : 1;
        urls.push({ url: url.href, score });
      } catch {}
    }
  }
  return urls.sort((a, b) => b.score - a.score).map((icon) => icon.url);
}

function readHtmlAttrs(tag) {
  const attrs = {};
  const attrPattern = /\s([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(attrPattern)) {
    attrs[match[1].toLowerCase()] = decodeHtmlText(match[3] || match[4] || match[5] || "");
  }
  return attrs;
}

function decodeHtmlText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function hostLabel(parsed) {
  return parsed.hostname.replace(/^www\./i, "").split(".")[0] || "Link";
}

function suggestCategoryForLink({ title, url }) {
  const data = readData();
  const activeProfile = data.profiles.find((profile) => profile.id === data.activeProfileId) || data.profiles[0];
  const categories = activeProfile?.categories || [];
  const links = activeProfile?.links || [];
  const parsed = parseHttpUrl(url);
  const origin = parsed?.origin.toLowerCase() || "";
  const text = normalizeSuggestText(`${title} ${url}`);
  const scores = new Map();

  for (const link of links) {
    if (origin && parseHttpUrl(link.url)?.origin.toLowerCase() === origin) {
      scores.set(link.category, (scores.get(link.category) || 0) + 12);
    }
  }

  for (const category of categories) {
    const normalizedName = normalizeSuggestText(category.name);
    if (!normalizedName) continue;
    if (text.includes(normalizedName)) scores.set(category.name, (scores.get(category.name) || 0) + 8);
    for (const token of normalizedName.split(" ").filter((token) => token.length >= 4)) {
      if (text.includes(token)) scores.set(category.name, (scores.get(category.name) || 0) + 2);
    }
  }

  const hints = [
    ["Medien", ["youtube", "netflix", "plex", "photo", "immich", "spotify", "twitch"]],
    ["Business", ["billbee", "ebay", "etsy", "shop", "kasuwa", "paypal", "stripe"]],
    ["Netzwerk", ["fritz", "router", "mikrotik", "adguard", "dns", "wifi", "wlan"]],
    ["Server", ["docker", "proxmox", "nginx", "portainer", "idrac", "unraid", "nas"]],
    ["Smart Home", ["home assistant", "homematic", "zigbee", "mqtt", "shelly"]],
    ["Sicherheit", ["vaultwarden", "bitwarden", "password", "backup"]],
    ["Werkstatt", ["tool", "werkstatt", "svg", "3d", "druck"]]
  ];
  const knownNames = new Map(categories.map((category) => [category.name.toLowerCase(), category.name]));
  for (const [name, keywords] of hints) {
    const category = knownNames.get(name.toLowerCase());
    if (!category) continue;
    if (keywords.some((keyword) => text.includes(keyword))) scores.set(category, (scores.get(category) || 0) + 5);
  }

  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function normalizeSuggestText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseStatusTargets(raw) {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    const targets = Array.isArray(parsed) ? parsed : [parsed];
    return targets
      .map((target) => ({
        id: String(target.id || target.name || crypto.randomUUID()).slice(0, 80),
        name: String(target.name || target.type || "Status").slice(0, 80),
        type: String(target.type || "basic").toLowerCase(),
        url: normalizeUrl(String(target.url || "")),
        statusPath: String(target.statusPath || ""),
        apiKey: String(target.apiKey || ""),
        username: String(target.username || ""),
        password: String(target.password || ""),
        tokenId: String(target.tokenId || ""),
        tokenSecret: String(target.tokenSecret || ""),
        headerName: String(target.headerName || ""),
        headerValue: String(target.headerValue || "")
      }))
      .filter((target) => target.url && parseHttpUrl(target.url));
  } catch (error) {
    console.error(`HOMEBASE_STATUS_TARGETS konnte nicht gelesen werden: ${error.message}`);
    return [];
  }
}

function publicStatusTarget(target) {
  return {
    id: target.id,
    name: target.name,
    type: target.type,
    url: target.url
  };
}

function getConfiguredStatusTargets(data) {
  const linkTargets = [];
  for (const profile of data.profiles || []) {
    for (const link of profile.links || []) {
      if (!link.statusWidget?.enabled) continue;
      linkTargets.push({
        ...link.statusWidget,
        id: link.id,
        name: link.title,
        url: link.statusWidget.url || link.url
      });
    }
  }
  return [...STATUS_TARGETS, ...linkTargets].filter((target) => target.url && parseHttpUrl(target.url));
}

async function readStatusTargets() {
  const targets = getConfiguredStatusTargets(readData());
  const items = await Promise.all(targets.map(readStatusTarget));
  return {
    configured: targets.length,
    updatedAt: new Date().toISOString(),
    items
  };
}

async function readStatusTarget(target) {
  const base = {
    ...publicStatusTarget(target),
    ok: false,
    status: "offline",
    details: [],
    metrics: []
  };

  try {
    if (target.type === "proxmox") return await readProxmoxStatus(target, base);
    if (target.type === "unraid" && target.apiKey) return await readUnraidStatus(target, base);
    if (target.type === "amp" && target.username && target.password) return await readAmpStatus(target, base);
    if (target.type === "homeassistant") {
      if (!target.apiKey) return { ...base, message: "Home Assistant Token fehlt" };
      return await readHomeAssistantStatus(target, base);
    }
    return await readGenericServiceStatus(target, base);
  } catch (error) {
    return {
      ...base,
      message: error.message || "Nicht erreichbar"
    };
  }
}

async function readHomeAssistantStatus(target, base) {
  const headers = { Authorization: `Bearer ${target.apiKey}` };
  const apiBase = new URL(target.statusPath || "/api/", target.url).href;
  const info = await requestJson(apiBase, { headers });
  const config = await requestJson(new URL("/api/config", target.url).href, { headers }).catch(() => ({}));
  const states = await requestJson(new URL("/api/states", target.url).href, { headers }).catch(() => []);
  const entities = Array.isArray(states) ? states : [];
  const controls = buildHomeAssistantControls(target, entities);
  const controlsOn = controls.filter((entity) => entity.state === "on").length;
  const metrics = [
    { label: "Schalter", value: `${controlsOn}/${controls.length}` }
  ];
  if (config.version) metrics.push({ label: "Version", value: String(config.version).slice(0, 24) });

  return {
    ...base,
    ok: true,
    status: "online",
    message: config.location_name || info.message || "Home Assistant erreichbar",
    controls,
    details: controls
      .filter((control) => !control.online)
      .map((control) => ({ label: control.label, value: control.state, online: false })),
    metrics
  };
}

function buildHomeAssistantControls(target, states) {
  const stateMap = new Map(states.map((entity) => [entity.entity_id, entity]));
  return normalizeHomeAssistantEntities(target.entities).map((entityId) => {
    const entity = stateMap.get(entityId) || {};
    const domain = entityId.split(".")[0];
    return {
      entityId,
      domain,
      label: entity.attributes?.friendly_name || entityId.replace(/^[^.]+\./, "").replace(/_/g, " "),
      state: String(entity.state || "unknown"),
      online: !["unavailable", "unknown"].includes(String(entity.state || "unknown")),
      toggleable: ["switch", "light", "input_boolean", "fan", "cover", "script", "scene", "automation"].includes(domain)
    };
  });
}

function findHomeAssistantTarget(data, linkId) {
  for (const profile of data.profiles || []) {
    for (const link of profile.links || []) {
      if (link.id !== linkId || link.statusWidget?.type !== "homeassistant" || !link.statusWidget?.enabled) continue;
      return {
        ...link.statusWidget,
        id: link.id,
        name: link.title,
        url: link.statusWidget.url || link.url
      };
    }
  }
  return null;
}

async function toggleHomeAssistantEntity(linkId, entityId) {
  const data = readData();
  const target = findHomeAssistantTarget(data, linkId);
  if (!target) throw new Error("Home Assistant Widget nicht gefunden");
  if (!target.apiKey) throw new Error("Home Assistant Token fehlt");
  const controls = normalizeHomeAssistantEntities(target.entities);
  if (!controls.includes(entityId)) throw new Error("Entity ist nicht fuer Buttons freigegeben");
  const domain = entityId.split(".")[0];
  const service = ["script", "scene"].includes(domain) ? "turn_on" : "toggle";
  await requestJsonPost(new URL(`/api/services/${encodeURIComponent(domain)}/${service}`, target.url).href, {
    headers: { Authorization: `Bearer ${target.apiKey}` },
    body: { entity_id: entityId }
  });
  return readStatusTarget({
    ...target,
    id: linkId,
    type: "homeassistant"
  });
}

async function readUnraidStatus(target, base) {
  const response = await requestJsonPost(new URL(target.statusPath || "/graphql", target.url).href, {
    headers: { "x-api-key": target.apiKey },
    body: {
      query: `query HarborDashStatus {
        info {
          os { distro release uptime }
          cpu { cores threads }
        }
        array {
          state
          capacity { disks { used total free } }
        }
        dockerContainers {
          id
          state
        }
      }`
    }
  });

  if (response.errors?.length) throw new Error(response.errors[0].message || "Unraid API Fehler");
  const data = response.data || {};
  const containers = Array.isArray(data.dockerContainers) ? data.dockerContainers : [];
  const runningContainers = containers.filter((container) => String(container.state).toLowerCase() === "running").length;
  const diskCapacity = data.array?.capacity?.disks || {};
  const used = Number(diskCapacity.used || 0);
  const total = Number(diskCapacity.total || 0);
  const metrics = [
    { label: "Array", value: String(data.array?.state || "unknown") },
    { label: "Docker", value: `${runningContainers}/${containers.length}` }
  ];
  if (total > 0) metrics.push({ label: "Speicher", value: `${Math.round((used / total) * 100)}%` });
  if (data.info?.cpu?.cores) metrics.push({ label: "CPU", value: `${data.info.cpu.cores} Cores` });

  return {
    ...base,
    ok: true,
    status: "online",
    message: data.info?.os?.release ? `Unraid ${data.info.os.release}` : "API erreichbar",
    metrics
  };
}

async function readAmpStatus(target, base) {
  const login = await requestJsonPost(new URL("/API/Core/Login", target.url).href, {
    body: {
      username: target.username,
      password: target.password,
      token: "",
      rememberMe: false
    }
  });
  const sessionId = login.sessionID || login.SESSIONID || login.sessionId || login.result?.sessionID;
  if (!sessionId) throw new Error("AMP Login fehlgeschlagen");

  const status = await requestJsonPost(new URL("/API/Core/GetStatus", target.url).href, {
    body: { SESSIONID: sessionId }
  });
  const metrics = [];
  const source = status.result || status;
  const instances = filterAmpServerInstances(await readAmpInstances(target, sessionId));
  const instanceStatuses = filterAmpServerInstances(await readAmpInstanceStatuses(target, sessionId));
  const instanceStatusDetails = await Promise.all(instances.map((instance) => readAmpInstanceCoreStatus(target, sessionId, instance)));
  let mergedInstances = mergeAmpInstances(instances.length ? instances : instanceStatuses, instanceStatuses, instanceStatusDetails);
  mergedInstances = await Promise.all(mergedInstances.map((instance) => readAmpApplicationStatus(target, instance)));
  const totalInstances = mergedInstances.length;
  if (totalInstances) {
    const online = Math.min(mergedInstances.filter(isAmpInstanceOnline).length, totalInstances);
    metrics.push({ label: "Server", value: `${online}/${totalInstances}` });
  }
  const cpu = totalInstances
    ? averageNumbers(mergedInstances.map(readAmpCpuPercent))
    : readAmpCpuPercent(source);
  const memory = totalInstances
    ? sumNumbers(mergedInstances.map(readAmpMemoryMb))
    : readAmpMemoryMb(source);
  const users = totalInstances
    ? sumNumbers(mergedInstances.map(readAmpUsersOnline))
    : readAmpUsersOnline(source);
  if (cpu !== undefined) metrics.push({ label: "CPU", value: formatAmpMetric(cpu, "%") });
  if (memory !== undefined) metrics.push({ label: "RAM", value: formatAmpMetric(memory, "MB") });
  if (users !== undefined) metrics.push({ label: "User", value: String(users).slice(0, 24) });

  return {
    ...base,
    ok: true,
    status: "online",
    message: getAmpStatusMessage(source),
    details: getAmpInstanceDetails(mergedInstances),
    metrics,
    debug: target.debug === true ? getAmpDebugLines(source, mergedInstances) : []
  };
}

async function readAmpInstances(target, sessionId) {
  try {
    const response = await requestJsonPost(new URL("/API/ADSModule/GetInstances", target.url).href, {
      body: { SESSIONID: sessionId }
    });
    return extractAmpInstances(response);
  } catch {
    return [];
  }
}

async function readAmpInstanceStatuses(target, sessionId) {
  try {
    const response = await requestJsonPost(new URL("/API/ADSModule/GetInstanceStatuses", target.url).href, {
      body: { SESSIONID: sessionId }
    });
    return extractAmpInstances(response);
  } catch {
    return [];
  }
}

async function readAmpInstanceCoreStatus(target, sessionId, instance) {
  const instanceId = getAmpInstanceId(instance);
  if (!instanceId) return {};
  const instanceBase = new URL(`/API/ADSModule/Servers/${encodeURIComponent(instanceId)}/API/`, target.url).href;
  const directStatus = await readAmpProxiedCoreStatus(instanceBase, sessionId);
  if (Object.keys(directStatus).length) return { ...directStatus, InstanceID: instanceId, DebugSource: "proxy" };
  try {
    const login = await requestJsonPost(new URL(`/API/ADSModule/Servers/${encodeURIComponent(instanceId)}/API/Core/Login`, target.url).href, {
      body: {
        SESSIONID: sessionId,
        username: target.username,
        password: target.password,
        token: "",
        rememberMe: true
      }
    });
    const instanceSessionId = login.sessionID || login.SESSIONID || login.sessionId || login.result?.sessionID;
    if (!instanceSessionId) return {};
    const loginStatus = await readAmpProxiedCoreStatus(instanceBase, instanceSessionId);
    return { ...loginStatus, InstanceID: instanceId, DebugSource: "instance-login" };
  } catch {
    return {};
  }
}

async function readAmpProxiedCoreStatus(instanceBase, sessionId) {
  const status = await requestJsonPost(new URL("Core/GetStatus", instanceBase).href, {
    body: { SESSIONID: sessionId }
  }).catch(() => ({}));
  const updates = await requestJsonPost(new URL("Core/GetUpdates", instanceBase).href, {
    body: { SESSIONID: sessionId }
  }).catch(() => ({}));
  const statusSource = status.result || status;
  const updateSource = updates.result || updates;
  const liveStatus = updateSource.Status || updateSource.status || {};
  if (!Object.keys(statusSource).length && !Object.keys(updateSource).length) return {};
  return {
    ...(liveStatus || {}),
    ...status,
    ...statusSource,
    Updates: updateSource
  };
}

async function readAmpApplicationStatus(_target, instance) {
  return instance;
}

function extractAmpInstances(response) {
  const candidates = [
    response.result,
    response.Result,
    response.instances,
    response.Instances,
    response.availableInstances,
    response.AvailableInstances,
    response.data,
    response.Data,
    response
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const instances = candidate.flatMap((item) => {
        if (Array.isArray(item?.AvailableInstances) || Array.isArray(item?.availableInstances)) return extractAmpInstances(item);
        return isAmpInstanceLike(item) ? [item] : extractAmpInstances(item);
      });
      if (instances.length) return instances;
    }
    if (candidate && typeof candidate === "object") {
      const availableInstances = Array.isArray(candidate.AvailableInstances)
        ? candidate.AvailableInstances
        : Array.isArray(candidate.availableInstances)
          ? candidate.availableInstances
          : undefined;
      if (availableInstances) return availableInstances.filter(isAmpInstanceLike);
      if (isAmpInstanceLike(candidate)) return [candidate];
      const values = Object.values(candidate).filter((value) => value && typeof value === "object");
      const instances = values.flatMap((value) => {
        const nestedInstances = Array.isArray(value.AvailableInstances)
          ? value.AvailableInstances
          : Array.isArray(value.availableInstances)
            ? value.availableInstances
            : undefined;
        if (nestedInstances) return nestedInstances;
        if (isAmpInstanceLike(value)) return [value];
        return [];
      }).filter(isAmpInstanceLike);
      if (instances.length) return instances;
    }
  }
  return [];
}

function filterAmpServerInstances(instances) {
  const filtered = instances.filter(isAmpServerInstance);
  return filtered.length ? filtered : instances.filter((instance) => !isAmpDaemonInstance(instance));
}

function mergeAmpInstances(primaryInstances, ...sources) {
  const map = new Map();
  for (const instance of primaryInstances) {
    if (!instance || typeof instance !== "object") continue;
    const key = getAmpInstanceKey(instance) || crypto.randomUUID();
    map.set(key, { ...instance });
  }
  for (const source of sources.flat()) {
    if (!source || typeof source !== "object" || !Object.keys(source).length) continue;
    const key = getAmpInstanceKey(source);
    if (key && map.has(key)) map.set(key, { ...map.get(key), ...source });
    else if (!key && map.size === 1) {
      const [existingKey] = map.keys();
      map.set(existingKey, { ...map.get(existingKey), ...source });
    } else if (!primaryInstances.length && key) map.set(key, { ...(map.get(key) || {}), ...source });
  }
  return [...map.values()];
}

function isAmpServerInstance(instance) {
  if (!instance || typeof instance !== "object" || isAmpDaemonInstance(instance)) return false;
  if (instance.Disabled === true || instance.Suspended === true) return false;
  const moduleName = getAmpModuleName(instance);
  if (!moduleName) return true;
  return !/\b(ads|amp|admin|daemon)\b/i.test(moduleName);
}

function isAmpDaemonInstance(instance) {
  if (!instance || typeof instance !== "object") return false;
  if (instance.Daemon === true || instance.daemon === true) return true;
  const moduleName = getAmpModuleName(instance);
  const name = String(instance.InstanceName || instance.FriendlyName || instance.DisplayName || instance.Name || "").toLowerCase();
  return /\b(ads|amp|admin|daemon)\b/i.test(moduleName) || /\b(ads|amp|admin|daemon|local instances|controller|target)\b/i.test(name);
}

function getAmpModuleName(instance) {
  return String(
    instance?.ModuleDisplayName ??
    instance?.ModuleName ??
    instance?.Module ??
    instance?.moduleDisplayName ??
    instance?.moduleName ??
    instance?.module ??
    ""
  );
}

function getAmpInstanceKey(instance) {
  return String(
    getAmpInstanceId(instance) ||
    instance?.InstanceName ||
    instance?.FriendlyName ||
    instance?.DisplayName ||
    instance?.Name ||
    instance?.name ||
    ""
  ).toLowerCase();
}

function getAmpInstanceId(instance) {
  return String(
    instance?.InstanceID ??
    instance?.InstanceId ??
    instance?.instanceId ??
    instance?.id ??
    instance?.Id ??
    ""
  );
}

function getAmpInstanceName(instance, fallback = "Instanz") {
  return String(
    instance?.FriendlyName ||
    instance?.InstanceName ||
    instance?.DisplayName ||
    instance?.Name ||
    instance?.name ||
    fallback
  );
}

function getAmpInstanceDetails(instances) {
  return instances.slice(0, 6).map((instance, index) => {
    const online = isAmpInstanceOnline(instance);
    const memory = readAmpMemoryMb(instance);
    const users = readAmpUsersOnline(instance);
    const detailParts = [];
    if (memory !== undefined) detailParts.push(formatAmpMetric(memory, "MB"));
    if (users !== undefined) detailParts.push(String(users));
    return {
      label: getAmpInstanceName(instance, `Instanz ${index + 1}`).slice(0, 40),
      value: detailParts.join(" · "),
      online,
      memory: memory !== undefined ? formatAmpMetric(memory, "MB") : "",
      users: users !== undefined ? String(users) : ""
    };
  });
}

function isAmpInstanceLike(value) {
  return Boolean(value && typeof value === "object" && (
    value.InstanceID ||
    value.InstanceName ||
    value.FriendlyName ||
    value.DisplayName ||
    value.Module ||
    value.ModuleName ||
    value.AppState ||
    value.app_state ||
    value.State ||
    value.state ||
    value.Status ||
    value.status ||
    value.Running !== undefined
    || value.running !== undefined
    || value.IsRunning !== undefined
    || value.is_running !== undefined
  ));
}

function isAmpInstanceOnline(instance) {
  if (instance.AppOnline === true) return true;
  if (instance.AppOnline === false) return false;
  const portStatus = readAmpRequiredPortStatus(instance);
  if (portStatus !== undefined) return portStatus;
  const appState = readAmpApplicationState(instance);
  if (appState !== undefined) return appState === 20 || /\b(ready|running|started|online)\b/i.test(String(appState));
  const runningValue = instance.Running ?? instance.running ?? instance.IsRunning ?? instance.is_running;
  if (runningValue === false || runningValue === 0 || String(runningValue).toLowerCase() === "false") return false;
  return false;
}

function readAmpRequiredPortStatus(instance) {
  const ports = [
    ...(Array.isArray(instance?.Updates?.Ports) ? instance.Updates.Ports : []),
    ...(Array.isArray(instance?.Updates?.ports) ? instance.Updates.ports : []),
    ...(Array.isArray(instance?.Ports) ? instance.Ports : []),
    ...(Array.isArray(instance?.ports) ? instance.ports : [])
  ];
  const relevantPorts = ports.filter((port) => {
    const label = String(port.Name || port.name || port.Description || port.description || "").toLowerCase();
    if (/amp|admin|web|metrics|rcon|query/.test(label)) return false;
    return port.Required === true || port.required === true || /minecraft|game|server/.test(label);
  });
  if (!relevantPorts.length) return undefined;
  return relevantPorts.some((port) => port.Listening === true || port.listening === true);
}

function readAmpApplicationState(instance) {
  const candidates = [
    instance?.Status?.State,
    instance?.status?.state,
    instance?.Updates?.Status?.State,
    instance?.Updates?.Status?.state,
    instance?.Updates?.status?.State,
    instance?.Updates?.status?.state,
    instance?.State,
    instance?.state,
    typeof instance?.Status === "object" ? undefined : instance?.Status,
    typeof instance?.status === "object" ? undefined : instance?.status,
    instance?.CurrentState,
    instance?.current_state,
    instance?.AppState,
    instance?.app_state
  ].filter((value) => value !== undefined && value !== null && value !== "");
  if (!candidates.length) return undefined;
  const numeric = candidates.map((value) => Number(value)).find((value) => Number.isFinite(value));
  if (numeric !== undefined) return numeric;
  const text = String(candidates[0]).toLowerCase();
  if (/\b(stopped|sleeping|offline|suspended|failed|stopping|maintenance|indeterminate)\b/.test(text)) return 0;
  if (/\b(ready|running|started|online)\b/.test(text)) return 20;
  return text;
}

function readAmpCpuPercent(source) {
  return ignoreZeroMetric(readAmpMetricValue(source, [
    "CPUUsage",
    "CPU",
    "CPU Usage",
    "CPU Usage %",
    "Processor Usage"
  ], ["Percent", "percent", "RawValue", "rawValue", "Value", "value"]));
}

function readAmpMemoryMb(source) {
  return ignoreZeroMetric(readAmpMetricValue(source, [
    "MemoryUsageMB",
    "Memory",
    "Memory Usage",
    "RAM",
    "RAM Usage"
  ], ["RawValue", "rawValue", "Value", "value", "MB", "mb"]));
}

function readAmpUsersOnline(source) {
  const direct = readAmpDirectNumber(source, [
    "AppPlayers",
    "appPlayers",
    "Players",
    "players",
    "PlayerCount",
    "playerCount",
    "PlayersOnline",
    "playersOnline",
    "OnlinePlayers",
    "onlinePlayers",
    "CurrentPlayers",
    "currentPlayers",
    "UsersOnline",
    "usersOnline",
    "ActiveUsers",
    "activeUsers",
    "UserCount",
    "userCount",
    "ClientCount",
    "clientCount"
  ]);
  if (direct !== undefined) return direct;
  return readAmpMetricValue(source, [
    "UsersOnline",
    "Active Users",
    "Connected Users",
    "User Count",
    "Users",
    "Players",
    "Players Online",
    "Online Players",
    "Current Players",
    "Player Count",
    "Connected Players",
    "Clients",
    "Clients Connected"
  ], ["RawValue", "rawValue", "Value", "value", "Count", "count"]);
}

function readAmpMetricValue(source, names, fields) {
  if (!source || typeof source !== "object") return undefined;
  const sources = [
    source,
    source.Status,
    source.status,
    source.Updates?.Status,
    source.Updates?.status
  ].filter((candidate) => candidate && typeof candidate === "object");
  for (const candidate of sources) {
    for (const name of names) {
      const direct = toFiniteNumber(candidate[name]);
      if (direct !== undefined) return direct;
    }
    const metrics = candidate.Metrics || candidate.metrics || {};
    const metricEntries = Object.entries(metrics);
    for (const name of names) {
      const metric = findAmpMetric(metrics, metricEntries, name);
      if (!metric || typeof metric !== "object") continue;
      for (const field of fields) {
        const value = toFiniteNumber(metric[field]);
        if (value !== undefined) return value;
      }
    }
  }
  return undefined;
}

function readAmpDirectNumber(source, names) {
  if (!source || typeof source !== "object") return undefined;
  const sources = [
    source,
    source.Status,
    source.status,
    source.Updates?.Status,
    source.Updates?.status
  ].filter((candidate) => candidate && typeof candidate === "object");
  for (const candidate of sources) {
    for (const name of names) {
      const direct = toFiniteNumber(candidate[name]);
      if (direct !== undefined) return direct;
    }
  }
  return undefined;
}

function findAmpMetric(metrics, entries, name) {
  return metrics[name] ||
    metrics[name.toLowerCase()] ||
    entries.find(([key]) => normalizeAmpMetricName(key) === normalizeAmpMetricName(name))?.[1] ||
    entries.find(([key]) => normalizeAmpMetricName(key).includes(normalizeAmpMetricName(name)))?.[1];
}

function normalizeAmpMetricName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function averageNumbers(values) {
  const numbers = values.map(toFiniteNumber).filter((value) => value !== undefined);
  if (!numbers.length) return undefined;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function sumNumbers(values) {
  const numbers = values.map(toFiniteNumber).filter((value) => value !== undefined);
  if (!numbers.length) return undefined;
  return numbers.reduce((sum, value) => sum + value, 0);
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function ignoreZeroMetric(value) {
  return value === 0 ? undefined : value;
}

function getAmpDebugLines(source, instances) {
  const lines = [];
  lines.push(`ADS state=${shortDebugValue(source?.State ?? source?.state ?? source?.Status ?? source?.status ?? "n/a")}`);
  instances.slice(0, 8).forEach((instance, index) => {
    const name = getAmpInstanceName(instance, `Instanz ${index + 1}`);
    const state = readAmpApplicationState(instance);
    const raw = [
      `app=${shortDebugValue(instance.AppState ?? instance.app_state)}`,
      `state=${shortDebugValue(instance.State ?? instance.state)}`,
      `live=${shortDebugValue(instance.Updates?.Status?.State ?? instance.Updates?.status?.state ?? instance.Status?.State ?? instance.status?.state)}`,
      `ports=${shortDebugValue(formatAmpDebugPorts(instance))}`,
      `users=${shortDebugValue(readAmpUsersOnline(instance))}`,
      `running=${shortDebugValue(instance.Running ?? instance.running ?? instance.IsRunning ?? instance.is_running)}`,
      `src=${shortDebugValue(instance.DebugSource || "list")}`
    ].join(" ");
    lines.push(`${name}: online=${isAmpInstanceOnline(instance)} resolved=${shortDebugValue(state)} ${raw}`);
  });
  return lines;
}

function formatAmpDebugPorts(instance) {
  const ports = [
    ...(Array.isArray(instance?.Updates?.Ports) ? instance.Updates.Ports : []),
    ...(Array.isArray(instance?.Updates?.ports) ? instance.Updates.ports : []),
    ...(Array.isArray(instance?.Ports) ? instance.Ports : []),
    ...(Array.isArray(instance?.ports) ? instance.ports : [])
  ];
  if (!ports.length) return "-";
  return ports.slice(0, 4).map((port) => {
    const name = String(port.Name || port.name || "port").replace(/\s+/g, "");
    const number = port.Port || port.port || port.PortNumber || port.port_number || "?";
    const listening = port.Listening ?? port.listening;
    return `${name}:${number}:${listening === true ? "on" : "off"}`;
  }).join(",");
}

function shortDebugValue(value) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "object") return "{...}";
  return String(value).slice(0, 24);
}

function getAmpStatusMessage(source) {
  const status = source.Status || source.StateName || source.StateDescription || "";
  if (status && !/^\d+$/.test(String(status))) return String(status).slice(0, 40);
  return "AMP erreichbar";
}

function formatAmpMetric(value, fallbackUnit = "") {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value).slice(0, 24);
  const rounded = Math.round(number * 10) / 10;
  return `${rounded}${fallbackUnit}`;
}

async function readGenericServiceStatus(target, base) {
  const statusUrl = target.statusPath ? new URL(target.statusPath, target.url).href : target.url;
  const headers = target.headerName && target.headerValue ? { [target.headerName]: target.headerValue } : {};
  const result = await requestHead(statusUrl, headers).catch(async () => {
    const json = await requestJson(statusUrl, { headers });
    return { ok: true, status: 200, statusText: "OK", json };
  });

  const metrics = [];
  if (result.json && typeof result.json === "object") {
    const value = result.json.status || result.json.state || result.json.version || result.json.name;
    if (value) metrics.push({ label: "API", value: String(value).slice(0, 40) });
  }

  return {
    ...base,
    ok: result.ok,
    status: result.ok ? "online" : "warning",
    message: result.ok ? "Erreichbar" : `HTTP ${result.status || 0}`,
    metrics
  };
}

async function readProxmoxStatus(target, base) {
  const headers = target.tokenId && target.tokenSecret
    ? { Authorization: `PVEAPIToken=${target.tokenId}=${target.tokenSecret}` }
    : {};
  const metrics = [];

  if (!headers.Authorization) {
    await requestHead(target.url).catch(async () => requestProxmoxJson(new URL("/api2/json/version", target.url).href, { headers: {} }));
    return {
      ...base,
      ok: true,
      status: "online",
      message: "Proxmox erreichbar",
      metrics: [{ label: "Token", value: "fehlt" }]
    };
  }

  const versionResult = await requestProxmoxJson(new URL("/api2/json/version", target.url).href, { headers }).catch((error) => ({ error }));
  if (versionResult.data?.version) metrics.push({ label: "Version", value: String(versionResult.data.version) });

  const resources = await requestProxmoxJson(new URL("/api2/json/cluster/resources", target.url).href, { headers });
  const data = Array.isArray(resources.data) ? resources.data : [];
  const nodes = data.filter((item) => item.type === "node");
  const guests = data.filter((item) => item.type === "qemu" || item.type === "lxc");
  const onlineNodes = nodes.filter((item) => item.status === "online").length;
  const runningGuests = guests.filter((item) => item.status === "running").length;
  const totalMemory = nodes.reduce((sum, item) => sum + Number(item.maxmem || 0), 0);
  const usedMemory = nodes.reduce((sum, item) => sum + Number(item.mem || 0), 0);
  const updates = await readProxmoxUpdates(target, headers, nodes);
  if (versionResult.error) updates.debug.unshift(`version: ${shortDebugValue(versionResult.error.message || versionResult.error)}`);
  const updateValue = formatProxmoxUpdateValue(updates);

  metrics.push({ label: "Nodes", value: `${onlineNodes}/${nodes.length || 0}` });
  metrics.push({ label: "VM/CT", value: `${runningGuests}/${guests.length || 0}` });
  if (updates.checked) metrics.push({ label: "Updates", value: updateValue });
  if (totalMemory > 0) metrics.push({ label: "RAM", value: `${Math.round((usedMemory / totalMemory) * 100)}%` });

  return {
    ...base,
    ok: onlineNodes > 0 || nodes.length === 0,
    status: onlineNodes === nodes.length ? "online" : "warning",
    message: onlineNodes === nodes.length ? "Cluster online" : "Teilweise erreichbar",
    details: nodes.slice(0, 4).map((node) => {
      const nodeName = getProxmoxNodeName(node) || "Node";
      const nodeUpdates = updates.nodes.get(nodeName);
      const hasUpdateCount = Number.isFinite(nodeUpdates);
      const nodeExact = updates.exactNodes.get(nodeName) === true;
      const updateLabel = hasUpdateCount ? `${nodeUpdates}${nodeExact ? "" : "+"} Updates` : updates.checked ? "Updates ?" : "";
      return {
        label: nodeName,
        value: updateLabel ? `${node.status || "unknown"} · ${updateLabel}` : node.status || "unknown"
      };
    }),
    debug: target.debug === true ? updates.debug : [],
    metrics
  };
}

async function readProxmoxUpdates(target, headers, nodes) {
  const nodeNames = nodes
    .map(getProxmoxNodeName)
    .filter(Boolean)
    .slice(0, 8);
  const empty = { checked: false, exact: false, total: undefined, nodes: new Map(), exactNodes: new Map(), debug: [] };
  if (!nodeNames.length) return empty;

  const results = await Promise.all(nodeNames.map(async (nodeName) => {
    const errors = [];
    try {
      const payload = await requestProxmoxJson(new URL(`/api2/json/nodes/${encodeURIComponent(nodeName)}/apt/update`, target.url).href, { headers });
      const updates = extractProxmoxUpdateList(payload);
      return { nodeName, count: updates.length, exact: true, source: "apt/update", errors };
    } catch (error) {
      errors.push(`${nodeName} apt/update: ${shortDebugValue(error.message || error)}`);
    }

    try {
      const payload = await requestProxmoxJson(new URL(`/api2/json/nodes/${encodeURIComponent(nodeName)}/apt/versions`, target.url).href, { headers });
      const updates = extractProxmoxVersionUpdates(payload);
      return { nodeName, count: updates.length, exact: false, source: "apt/versions", errors };
    } catch (error) {
      errors.push(`${nodeName} apt/versions: ${shortDebugValue(error.message || error)}`);
      return { nodeName, count: undefined, exact: false, source: "", errors };
    }
  }));
  const known = results.filter((result) => Number.isFinite(result.count));
  const debug = results.flatMap((result) => [
    ...result.errors,
    ...(result.source && result.source !== "apt/update" ? [`${result.nodeName} updates via ${result.source}`] : [])
  ]);
  if (!known.length) return { checked: true, exact: false, total: undefined, nodes: new Map(), exactNodes: new Map(), debug };

  return {
    checked: true,
    exact: known.every((result) => result.exact === true),
    total: known.reduce((sum, result) => sum + result.count, 0),
    nodes: new Map(known.map((result) => [result.nodeName, result.count])),
    exactNodes: new Map(known.map((result) => [result.nodeName, result.exact === true])),
    debug
  };
}

function formatProxmoxUpdateValue(updates) {
  if (!Number.isFinite(updates.total)) return "?";
  return `${updates.total}${updates.exact ? "" : "+"}`;
}

function getProxmoxNodeName(node) {
  const raw = node?.node || node?.id || "";
  return String(raw).replace(/^node\//, "").trim();
}

function extractProxmoxUpdateList(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.updates)) return data.updates;
  if (Array.isArray(data?.packages)) return data.packages;
  return [];
}

function extractProxmoxVersionUpdates(payload) {
  return extractProxmoxUpdateList(payload).filter((item) => {
    const oldVersion = item?.OldVersion || item?.oldVersion || item?.oldversion;
    const newVersion = item?.Version || item?.version;
    return oldVersion && newVersion && String(oldVersion) !== String(newVersion);
  });
}

async function requestProxmoxJson(targetUrl, { headers = {} } = {}) {
  const proxmoxHeaders = { Connection: "close", ...headers };
  try {
    return await requestJson(targetUrl, { headers: proxmoxHeaders, timeout: 10000 });
  } catch (error) {
    if (!isTransientNetworkError(error)) throw error;
    return await requestJson(targetUrl, {
      headers: proxmoxHeaders,
      timeout: 15000,
      requestOptions: { maxVersion: "TLSv1.2" }
    });
  }
}

function isTransientNetworkError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return ["ECONNRESET", "EPIPE", "ETIMEDOUT"].includes(code) || message.includes("socket hang up");
}

async function requestJson(targetUrl, { headers = {}, timeout = 5000, requestOptions = {} } = {}) {
  const response = await requestBuffer(targetUrl, {
    accept: "application/json,*/*",
    headers,
    limit: 1_000_000,
    timeout,
    requestOptions
  });
  return JSON.parse(response.buffer.toString("utf8"));
}

async function readWeather() {
  const data = readData();
  const weather = normalizeWeatherWidget(data.widgets?.weather);
  if (!weather.enabled) return { enabled: false };
  if (!weather.latitude || !weather.longitude) {
    return { enabled: true, ok: false, label: weather.label, message: "Koordinaten fehlen" };
  }

  const params = new URLSearchParams({
    latitude: weather.latitude,
    longitude: weather.longitude,
    current: "temperature_2m,relative_humidity_2m,weather_code,precipitation",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "1"
  });
  const payload = await requestJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  const current = payload.current || {};
  const daily = payload.daily || {};
  const temperature = roundNumber(current.temperature_2m);
  const code = Number(current.weather_code);

  return {
    enabled: true,
    ok: true,
    label: weather.label,
    updatedAt: current.time || new Date().toISOString(),
    temperature,
    condition: weatherCodeText(code),
    weatherCode: Number.isFinite(code) ? code : null,
    precipitation: roundNumber(current.precipitation),
    humidity: roundNumber(current.relative_humidity_2m),
    rainChance: roundNumber(firstArrayValue(daily.precipitation_probability_max)),
    high: roundNumber(firstArrayValue(daily.temperature_2m_max)),
    low: roundNumber(firstArrayValue(daily.temperature_2m_min))
  };
}

function firstArrayValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function roundNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function weatherCodeText(code) {
  if ([0].includes(code)) return "Klar";
  if ([1, 2].includes(code)) return "Teilweise wolkig";
  if ([3].includes(code)) return "Bewölkt";
  if ([45, 48].includes(code)) return "Nebel";
  if ([51, 53, 55, 56, 57].includes(code)) return "Nieselregen";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Regen";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Schnee";
  if ([95, 96, 99].includes(code)) return "Gewitter";
  return "Wetter";
}

function requestJsonPost(targetUrl, { headers = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = parseHttpUrl(targetUrl);
    if (!parsed) {
      reject(new Error("Invalid URL"));
      return;
    }

    const payload = JSON.stringify(body);
    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request(
      parsed,
      {
        method: "POST",
        headers: {
          Accept: "application/json,*/*",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": "HarborDash/1.0",
          ...headers
        },
        rejectUnauthorized: false,
        timeout: 5000
      },
      (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("Request timeout")));
    request.on("error", reject);
    request.end(payload);
  });
}

function requestBuffer(targetUrl, { accept, limit, headers = {}, timeout = 5000, requestOptions = {} }) {
  return new Promise((resolve, reject) => {
    const parsed = parseHttpUrl(targetUrl);
    if (!parsed) {
      reject(new Error("Invalid URL"));
      return;
    }

    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request(
      parsed,
      {
        headers: { Accept: accept, "User-Agent": "HarborDash/1.0", ...headers },
        rejectUnauthorized: false,
        timeout,
        ...requestOptions
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          requestBuffer(new URL(response.headers.location, parsed.href).href, { accept, headers, limit, timeout, requestOptions }).then(resolve, reject);
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        let size = 0;
        response.on("error", reject);
        response.on("aborted", () => reject(new Error("Response aborted")));
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > limit) {
            response.destroy(new Error("Response too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: String(response.headers["content-type"] || "application/octet-stream").split(";")[0]
          });
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("Request timeout")));
    request.on("error", reject);
    request.end();
  });
}

function requestText(targetUrl, { accept, limit, headers = {} }) {
  return new Promise((resolve, reject) => {
    const parsed = parseHttpUrl(targetUrl);
    if (!parsed) {
      reject(new Error("Invalid URL"));
      return;
    }

    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request(
      parsed,
      {
        headers: { Accept: accept, "User-Agent": "HarborDash/1.0", ...headers },
        rejectUnauthorized: false,
        timeout: 5000
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          requestText(new URL(response.headers.location, parsed.href).href, { accept, headers, limit }).then(resolve, reject);
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        let size = 0;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve(Buffer.concat(chunks).toString("utf8"));
        };
        response.on("data", (chunk) => {
          size += chunk.length;
          chunks.push(chunk);
          const text = Buffer.concat(chunks).toString("utf8");
          if (size >= limit || /<\/head>/i.test(text) || /<\/title>/i.test(text)) {
            response.destroy();
            finish();
          }
        });
        response.on("end", finish);
      }
    );
    request.on("timeout", () => request.destroy(new Error("Request timeout")));
    request.on("error", (error) => {
      if (error.code === "ECONNRESET") return;
      reject(error);
    });
    request.end();
  });
}

function requestHead(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = parseHttpUrl(targetUrl);
    if (!parsed) {
      reject(new Error("Invalid URL"));
      return;
    }
    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request(
      parsed,
      {
        method: "HEAD",
        headers: { "User-Agent": "HarborDash/1.0", ...headers },
        rejectUnauthorized: false,
        timeout: 5000
      },
      (response) => {
        response.resume();
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 400,
          status: response.statusCode,
          statusText: response.statusMessage || ""
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("Request timeout")));
    request.on("error", reject);
    request.end();
  });
}

function parseHttpUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readBinaryRequestBody(req, limit = 8_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error("Bild ist zu gross. Maximal 8 MB."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath === "/" ? "index.html" : safePath);

  if (path.relative(PUBLIC_DIR, filePath).startsWith("..") || path.isAbsolute(path.relative(PUBLIC_DIR, filePath))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
        res.end(fallback);
      });
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (!auth.guard(req, res)) return;
    const url = new URL(req.url, 'http://localhost');
    const publicRoutes = new Set(['/api/health', '/api/auth/status', '/api/auth/login', '/api/homebase']);
    const publicRead = req.method === 'GET' && publicRoutes.has(url.pathname);
    const publicLogin = req.method === 'POST' && url.pathname === '/api/auth/login';
    if (url.pathname.startsWith('/api/') && !publicRead && !publicLogin && !requireAuth(req, res)) return;
    if (url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/homebase" && req.method === "GET") {
      sendJson(res, 200, toPublicData(readData(), req));
      return;
    }

    if (url.pathname === "/api/homebase" && req.method === "PUT") {
      if (!requireAuth(req, res)) return;
      const body = await readRequestBody(req);
      const saved = saveClientEdits(JSON.parse(body), req);
      sendJson(res, 200, toPublicData(saved, req));
      return;
    }

    if (url.pathname === "/api/homebase/settings" && req.method === "PUT") {
      if (!requireAuth(req, res)) return;
      const body = await readRequestBody(req);
      const saved = saveClientEdits(JSON.parse(body), req, true);
      sendJson(res, 200, toPublicData(saved, req));
      return;
    }

    if (url.pathname === "/api/setup" && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      const current = readData();
      if (current.setupComplete && isAuthEnabled(current) && !isAuthed(req)) {
        sendJson(res, 409, { error: "Setup already completed" });
        return;
      }
      const body = JSON.parse(await readRequestBody(req));
      const firstProfile = normalizeProfile({
        id: "default",
        name: body.profileName || "Start",
        categories: (Array.isArray(body.categories) ? body.categories : ["Links"]).map((name) => ({ name })),
        links: []
      });
      const saved = writeData({
        ...current,
        setupComplete: true,
        title: body.title || current.title,
        subtitle: body.subtitle || current.subtitle,
        theme: body.theme || current.theme,
        admin: current.admin,
        activeProfileId: firstProfile.id,
        profiles: [firstProfile]
      });
      sendJson(res, 200, toPublicData(saved, req));
      return;
    }

    if (url.pathname === "/api/import" && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      const body = JSON.parse(await readRequestBody(req));
      const saved = writeData({ ...body, setupComplete: true });
      sendJson(res, 200, toPublicData(saved, req));
      return;
    }

    if (url.pathname === "/api/auth/status" && req.method === "GET") {
      const data = readData();
      const enabled = isAuthEnabled(data);
      sendJson(res, 200, {
        enabled,
        authenticated: !enabled || isAuthed(req),
        ipAllowed: enabled ? isAllowedIp(req, data.admin) : true
      });
      return;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = JSON.parse(await readRequestBody(req));
      if (auth.login(req, res, body)) sendJson(res, 200, { enabled: true, authenticated: true, ipAllowed: false });
      return;
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      auth.logout(req, res);
      sendJson(res, 200, { enabled: true, authenticated: false, ipAllowed: false });
      return;
    }

    if (url.pathname === "/api/auth/sessions" && req.method === "GET") {
      sendJson(res, 200, { days: auth.days, sessions: auth.list(req) });
      return;
    }

    if (url.pathname === "/api/auth/sessions" && req.method === "DELETE") {
      auth.revoke(req, res, url.searchParams.get('id'));
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/link-status" && req.method === "GET") {
      if (!requireAuth(req, res)) return;
      const target = url.searchParams.get("url") || "";
      const parsed = parseHttpUrl(target);
      if (!parsed) {
        sendJson(res, 200, { ok: false, status: 0, error: "Invalid URL" });
        return;
      }
      try {
        const result = await requestHead(parsed.href);
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 200, { ok: false, status: 0, error: error.message });
      }
      return;
    }

    if (url.pathname === "/api/link-metadata" && req.method === "GET") {
      if (!requireAuth(req, res)) return;
      sendJson(res, 200, await readLinkMetadata(url.searchParams.get("url") || ""));
      return;
    }

    if (url.pathname === "/api/status" && req.method === "GET") {
      if (!requireAuth(req, res)) return;
      sendJson(res, 200, await readStatusTargets());
      return;
    }

    if (url.pathname === "/api/homeassistant/toggle" && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      const body = JSON.parse(await readRequestBody(req));
      sendJson(res, 200, await toggleHomeAssistantEntity(String(body.linkId || ""), String(body.entityId || "")));
      return;
    }

    if (url.pathname === "/api/weather" && req.method === "GET") {
      if (!requireAuth(req, res)) return;
      sendJson(res, 200, await readWeather());
      return;
    }

    if (url.pathname === "/api/background-image" && req.method === "GET") {
      serveBackgroundImage(res);
      return;
    }

    if (url.pathname.startsWith("/api/background-images/") && req.method === "GET") {
      serveBackgroundGalleryImage(res, url.pathname);
      return;
    }

    if (url.pathname === "/api/background-images" && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      const body = await readBinaryRequestBody(req);
      const filename = decodeURIComponent(String(req.headers["x-file-name"] || ""));
      const saved = saveBackgroundGalleryImage(body, req.headers["content-type"] || "", filename);
      sendJson(res, 200, toPublicData(saved, req));
      return;
    }

    if (url.pathname === "/api/background-images" && req.method === "DELETE") {
      if (!requireAuth(req, res)) return;
      const saved = deleteBackgroundGalleryImage(String(url.searchParams.get("id") || ""));
      sendJson(res, 200, toPublicData(saved, req));
      return;
    }

    if (url.pathname === "/api/background-image" && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      const body = await readBinaryRequestBody(req);
      const saved = saveBackgroundImage(body, req.headers["content-type"] || "");
      sendJson(res, 200, toPublicData(saved, req));
      return;
    }

    if (url.pathname === "/api/background-image" && req.method === "DELETE") {
      if (!requireAuth(req, res)) return;
      const saved = deleteBackgroundImage();
      sendJson(res, 200, toPublicData(saved, req));
      return;
    }

    if (url.pathname === "/api/homebase/export" && req.method === "GET") {
      if (!requireAuth(req, res)) return;
      const data = JSON.stringify(readData(), null, 2);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=homebase.json"
      });
      res.end(data);
      return;
    }

    if (url.pathname === "/api/favicon" && req.method === "GET") {
      await serveFavicon(res, url.searchParams.get("url") || "");
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, error.statusCode || 400, { error: error.message || "Bad request" });
  }
});

ensureDataFile();
server.listen(PORT, HOST, () => {
  console.log(`HarborDash running on http://${HOST}:${PORT}`);
  setTimeout(refreshStoredFavicons, 1000).unref();
  setInterval(refreshStoredFavicons, 60 * 60 * 1000).unref();
});
