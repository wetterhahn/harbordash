const state = {
  setupComplete: true,
  title: "HarborDash",
  subtitle: "",
  theme: "retro",
  appearance: { backgroundImage: "", backgroundImages: [], backgroundOpacity: 0.35, backgroundInterval: 30, linkTransparency: 72, categoryTransparency: 58 },
  activeProfileId: "default",
  profiles: [],
  categories: [],
  links: [],
  widgets: { clock: true, notes: [], googleSearch: false, statusOverview: false, linkStats: false, weather: { enabled: false, label: "Zuhause", latitude: "", longitude: "" } },
  preferences: { startpageMode: true, shareMode: false, showCategoryCounts: false, compactCategoryLayout: false, tileCategoryLayout: false, showLinkStatus: true, showNotes: true, openLinksInNewTab: true },
  admin: { enabled: false, allowedIps: [], hasPassword: false },
  auth: { enabled: false, authenticated: true, ipAllowed: true },
  status: { configured: 0, updatedAt: "", items: [] },
  weather: { enabled: false },
  statusLoading: false,
  weatherLoading: false,
  query: "",
  searchOpen: true
};

let serverSnapshot = null;
let settingsSnapshot = null;
let saveInProgress = false;
const FAVICON_REFRESH_MS = 24 * 60 * 60 * 1000;

function acceptServerData(data) {
  serverSnapshot = structuredClone(data);
  Object.assign(state, data);
  syncActiveProfileAliases();
}

const elements = {
  title: document.querySelector("#pageTitle"),
  subtitle: document.querySelector("#pageSubtitle"),
  customBackgroundA: document.querySelector("#customBackgroundA"),
  customBackgroundB: document.querySelector("#customBackgroundB"),
  date: document.querySelector("#dateLabel"),
  time: document.querySelector("#timeLabel"),
  groups: document.querySelector("#groups"),
  empty: document.querySelector("#emptyState"),
  search: document.querySelector("#searchInput"),
  searchPanel: document.querySelector("#searchPanel"),
  searchToggleButton: document.querySelector("#searchToggleButton"),
  googleSearchButton: document.querySelector("#googleSearchButton"),
  addButton: document.querySelector("#addButton"),
  newNoteButton: document.querySelector("#newNoteButton"),
  settingsButton: document.querySelector("#settingsButton"),
  profileSelect: document.querySelector("#profileSelect"),
  newProfileButton: document.querySelector("#newProfileButton"),
  deleteProfileButton: document.querySelector("#deleteProfileButton"),
  themeSelect: document.querySelector("#themeSelect"),
  widgets: document.querySelector("#widgets"),
  googleWidget: document.querySelector("#googleWidget"),
  googleWidgetForm: document.querySelector("#googleWidgetForm"),
  googleWidgetInput: document.querySelector("#googleWidgetInput"),
  weatherWidget: document.querySelector("#weatherWidget"),
  weatherLabel: document.querySelector("#weatherLabel"),
  weatherBody: document.querySelector("#weatherBody"),
  refreshWeatherButton: document.querySelector("#refreshWeatherButton"),
  statusWidget: document.querySelector("#statusWidget"),
  statusList: document.querySelector("#statusList"),
  statusUpdated: document.querySelector("#statusUpdated"),
  refreshStatusButton: document.querySelector("#refreshStatusButton"),
  statsWidget: document.querySelector("#statsWidget"),
  statsList: document.querySelector("#statsList"),
  notesWidget: document.querySelector("#notesWidget"),
  notesList: document.querySelector("#notesList"),
  noteInput: document.querySelector("#noteInput"),
  addNoteButton: document.querySelector("#addNoteButton"),
  setupDialog: document.querySelector("#setupDialog"),
  setupForm: document.querySelector("#setupForm"),
  setupTitle: document.querySelector("#setupTitle"),
  setupProfileName: document.querySelector("#setupProfileName"),
  completeSetupButton: document.querySelector("#completeSetupButton"),
  editorDialog: document.querySelector("#editorDialog"),
  settingsPage: document.querySelector("#settingsPage"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  cancelSettingsButton: document.querySelector("#cancelSettingsButton"),
  loginDialog: document.querySelector("#loginDialog"),
  categoriesDialog: document.querySelector("#categoriesDialog"),
  categoriesForm: document.querySelector("#categoriesForm"),
  profileDialog: document.querySelector("#profileDialog"),
  importDialog: document.querySelector("#importDialog"),
  dialogTitle: document.querySelector("#dialogTitle"),
  linkForm: document.querySelector("#linkForm"),
  linkId: document.querySelector("#linkId"),
  linkTitle: document.querySelector("#linkTitle"),
  linkUrl: document.querySelector("#linkUrl"),
  linkCategory: document.querySelector("#linkCategory"),
  newLinkCategoryLabel: document.querySelector("#newLinkCategoryLabel"),
  newLinkCategory: document.querySelector("#newLinkCategory"),
  linkNote: document.querySelector("#linkNote"),
  linkStatusEnabled: document.querySelector("#linkStatusEnabled"),
  linkStatusFields: document.querySelector("#linkStatusFields"),
  linkStatusType: document.querySelector("#linkStatusType"),
  linkStatusUrl: document.querySelector("#linkStatusUrl"),
  linkStatusTokenId: document.querySelector("#linkStatusTokenId"),
  linkStatusTokenSecret: document.querySelector("#linkStatusTokenSecret"),
  linkStatusApiKey: document.querySelector("#linkStatusApiKey"),
  linkStatusEntities: document.querySelector("#linkStatusEntities"),
  linkStatusUsername: document.querySelector("#linkStatusUsername"),
  linkStatusPassword: document.querySelector("#linkStatusPassword"),
  linkStatusPath: document.querySelector("#linkStatusPath"),
  linkStatusDebug: document.querySelector("#linkStatusDebug"),
  toggleSecretFieldsButton: document.querySelector("#toggleSecretFieldsButton"),
  deleteButton: document.querySelector("#deleteButton"),
  saveLinkButton: document.querySelector("#saveLinkButton"),
  testLinkButton: document.querySelector("#testLinkButton"),
  linkStatus: document.querySelector("#linkStatus"),
  settingsForm: document.querySelector("#settingsForm"),
  settingsTitle: document.querySelector("#settingsTitle"),
  settingsSubtitle: document.querySelector("#settingsSubtitle"),
  settingsBackgroundFile: document.querySelector("#settingsBackgroundFile"),
  settingsBackgroundStatus: document.querySelector("#settingsBackgroundStatus"),
  backgroundGallery: document.querySelector("#backgroundGallery"),
  settingsBackgroundInterval: document.querySelector("#settingsBackgroundInterval"),
  settingsBackgroundIntervalValue: document.querySelector("#settingsBackgroundIntervalValue"),
  settingsBackgroundOpacity: document.querySelector("#settingsBackgroundOpacity"),
  settingsBackgroundOpacityValue: document.querySelector("#settingsBackgroundOpacityValue"),
  settingsLinkTransparency: document.querySelector("#settingsLinkTransparency"),
  settingsLinkTransparencyValue: document.querySelector("#settingsLinkTransparencyValue"),
  settingsCategoryTransparency: document.querySelector("#settingsCategoryTransparency"),
  settingsCategoryTransparencyValue: document.querySelector("#settingsCategoryTransparencyValue"),
  removeBackgroundButton: document.querySelector("#removeBackgroundButton"),
  settingShowCategoryCounts: document.querySelector("#settingShowCategoryCounts"),
  settingCompactCategoryLayout: document.querySelector("#settingCompactCategoryLayout"),
  settingTileCategoryLayout: document.querySelector("#settingTileCategoryLayout"),
  settingShowLinkStatus: document.querySelector("#settingShowLinkStatus"),
  settingShowNotes: document.querySelector("#settingShowNotes"),
  settingOpenLinksInNewTab: document.querySelector("#settingOpenLinksInNewTab"),
  settingStartpageMode: document.querySelector("#settingStartpageMode"),
  settingShareMode: document.querySelector("#settingShareMode"),
  settingShowGoogleWidget: document.querySelector("#settingShowGoogleWidget"),
  settingShowStatsWidget: document.querySelector("#settingShowStatsWidget"),
  settingShowStatusWidget: document.querySelector("#settingShowStatusWidget"),
  settingShowWeatherWidget: document.querySelector("#settingShowWeatherWidget"),
  settingAllowedIps: document.querySelector("#settingAllowedIps"),
  logoutButton: document.querySelector("#logoutButton"),
  loginForm: document.querySelector("#loginForm"),
  loginPassword: document.querySelector("#loginPassword"),
  loginButton: document.querySelector("#loginButton"),
  weatherSettings: document.querySelector("#weatherSettings"),
  settingWeatherLabel: document.querySelector("#settingWeatherLabel"),
  settingWeatherLatitude: document.querySelector("#settingWeatherLatitude"),
  settingWeatherLongitude: document.querySelector("#settingWeatherLongitude"),
  settingsCategoriesButton: document.querySelector("#settingsCategoriesButton"),
  createDemoButton: document.querySelector("#createDemoButton"),
  settingsBookmarkImportButton: document.querySelector("#settingsBookmarkImportButton"),
  settingsHomarrImportButton: document.querySelector("#settingsHomarrImportButton"),
  settingsImportButton: document.querySelector("#settingsImportButton"),
  settingsBackupButton: document.querySelector("#settingsBackupButton"),
  settingsRestoreButton: document.querySelector("#settingsRestoreButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  categoryEditor: document.querySelector("#categoryEditor"),
  addCategoryButton: document.querySelector("#addCategoryButton"),
  saveCategoriesButton: document.querySelector("#saveCategoriesButton"),
  profileName: document.querySelector("#profileName"),
  saveProfileButton: document.querySelector("#saveProfileButton"),
  importFile: document.querySelector("#importFile"),
  importMode: document.querySelector("#importMode"),
  importDialogTitle: document.querySelector("#importDialogTitle"),
  importText: document.querySelector("#importText"),
  runImportButton: document.querySelector("#runImportButton"),
  commandDialog: document.querySelector("#commandDialog"),
  commandForm: document.querySelector("#commandForm"),
  commandInput: document.querySelector("#commandInput"),
  commandResults: document.querySelector("#commandResults"),
  statusDetailDialog: document.querySelector("#statusDetailDialog"),
  statusDetailTitle: document.querySelector("#statusDetailTitle"),
  statusDetailBody: document.querySelector("#statusDetailBody"),
  toast: document.querySelector("#toast")
};

let categoryDrafts = [];
let linkMetadataTimer = null;
let linkMetadataAbort = null;
let compactLayoutTimer = null;
let backgroundTimer = null;
let backgroundIndex = 0;
let backgroundLayer = 0;
let backgroundSignature = "";
let currentBackgroundUrl = "";
let backgroundHiddenAt = 0;
const BACKGROUND_RESUME_REFRESH_DELAY = 15000;

const categoryIcons = [
  ["folder", "Ordner"],
  ["star", "Stern"],
  ["briefcase", "Business"],
  ["server", "Server"],
  ["network", "Netzwerk"],
  ["home", "Smart Home"],
  ["shield", "Sicherheit"],
  ["tool", "Werkstatt"],
  ["media", "Medien"],
  ["game", "Game"],
  ["link", "Link"]
];

const categoryColors = ["#35f0ff", "#56ff8f", "#ffb238", "#ff4f7a", "#c471ff", "#4aa8ff", "#ff6f3c"];

function activeProfile() {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0] || {
    id: "default",
    name: "Start",
    categories: [],
    links: []
  };
}

function canEdit() {
  return state.auth?.authenticated !== false;
}

function updateClock() {
  const now = new Date();
  const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(now);
  elements.time.textContent = time;
  elements.date.textContent = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(now);
}

async function loadData() {
  const response = await fetch("/api/homebase");
  if (!response.ok) throw new Error("Startseite konnte nicht geladen werden.");
  acceptServerData(await response.json());
  syncActiveProfileAliases();
  render();
  if (!state.setupComplete && state.auth?.authenticated && !elements.setupDialog.open) elements.setupDialog.showModal();
  if (state.auth?.enabled && !state.auth.authenticated) openLoginDialog();
  loadStatus().catch(() => {});
  loadWeather().catch(() => {});
}

function syncActiveProfileAliases() {
  const profile = activeProfile();
  state.categories = profile.categories || [];
  state.links = profile.links || [];
}

async function saveData(message = "Gespeichert") {
  if (saveInProgress) throw new Error("Bitte warte, bis das Speichern abgeschlossen ist.");
  saveInProgress = true;
  try {
    syncProfileFromAliases();
    const response = await fetch("/api/homebase", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base: serverSnapshot,
        revision: serverSnapshot?.revision,
        schemaVersion: state.schemaVersion || 5,
        setupComplete: state.setupComplete,
        title: state.title,
        subtitle: state.subtitle,
        theme: state.theme,
        appearance: state.appearance,
        activeProfileId: state.activeProfileId,
        widgets: state.widgets,
        preferences: state.preferences,
        admin: state.admin,
        profiles: state.profiles
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) openLoginDialog();
      if (response.status === 409 || response.status === 428) await loadData();
      throw new Error(payload.error || "Speichern fehlgeschlagen.");
    }

    acceptServerData(await response.json());
    render();
    showToast(message);
  } finally {
    saveInProgress = false;
  }
}

async function saveSettingsData(payload, message = "Einstellungen gespeichert") {
  const response = await fetch("/api/homebase/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, base: settingsSnapshot || serverSnapshot, revision: (settingsSnapshot || serverSnapshot)?.revision })
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    if (response.status === 401) openLoginDialog();
    if (response.status === 409 || response.status === 428) {
      await loadData();
      openSettingsPage();
    }
    throw new Error(errorPayload.error || "Einstellungen konnten nicht gespeichert werden.");
  }

  acceptServerData(await response.json());
  syncActiveProfileAliases();
  render();
  showToast(message);
}

async function loadStatus() {
  state.statusLoading = true;
  renderStatus();
  try {
    const response = await fetch("/api/status");
    if (!response.ok) throw new Error("Status konnte nicht geladen werden");
    state.status = await response.json();
  } finally {
    state.statusLoading = false;
    renderStatus();
    renderStatsWidget();
    renderGroups();
  }
}

async function loadWeather() {
  if (state.widgets?.weather?.enabled !== true) {
    state.weather = { enabled: false };
    renderWeather();
    return;
  }
  state.weatherLoading = true;
  renderWeather();
  try {
    const response = await fetch("/api/weather");
    if (!response.ok) throw new Error("Wetter konnte nicht geladen werden");
    state.weather = await response.json();
  } finally {
    state.weatherLoading = false;
    renderWeather();
  }
}

function syncProfileFromAliases() {
  const index = state.profiles.findIndex((profile) => profile.id === state.activeProfileId);
  const nextProfile = {
    ...activeProfile(),
    categories: state.categories,
    links: state.links
  };
  if (index >= 0) state.profiles.splice(index, 1, nextProfile);
  else state.profiles.push(nextProfile);
}

function render() {
  document.title = state.title || "HarborDash";
  document.body.dataset.theme = state.theme || "retro";
  renderAppearance();
  elements.title.textContent = state.title;
  elements.subtitle.textContent = state.subtitle;
  elements.themeSelect.value = state.theme || "retro";
  renderAdminState();
  renderProfiles();
  renderCategoryList();
  renderSearch();
  renderWidgets();
  renderGroups();
}

function renderAppearance() {
  const images = getBackgroundImages();
  const opacity = normalizeBackgroundOpacity(state.appearance?.backgroundOpacity);
  applyGlassTransparency();
  const signature = images.map((image) => image.url).join("|");
  document.body.classList.toggle("has-custom-background", Boolean(images.length));
  window.clearInterval(backgroundTimer);
  backgroundTimer = null;

  if (!images.length) {
    currentBackgroundUrl = "";
    backgroundSignature = "";
    [elements.customBackgroundA, elements.customBackgroundB].forEach((layer) => {
      layer.style.backgroundImage = "";
      layer.style.opacity = "0";
    });
    return;
  }

  if (signature !== backgroundSignature) {
    backgroundIndex = 0;
    backgroundLayer = 0;
    currentBackgroundUrl = "";
    backgroundSignature = signature;
  }

  showBackgroundImage(images[backgroundIndex % images.length].url, opacity, false);
  if (images.length > 1) {
    backgroundTimer = window.setInterval(() => {
      const nextImages = getBackgroundImages();
      if (nextImages.length <= 1) return;
      backgroundIndex = (backgroundIndex + 1) % nextImages.length;
      showBackgroundImage(nextImages[backgroundIndex].url, normalizeBackgroundOpacity(state.appearance?.backgroundOpacity), true);
    }, normalizeBackgroundInterval(state.appearance?.backgroundInterval) * 1000);
  }
}

function applyGlassTransparency() {
  const linkTransparency = normalizeTransparency(state.appearance?.linkTransparency, 72);
  const categoryTransparency = normalizeTransparency(state.appearance?.categoryTransparency, 58);
  const linkFill = (100 - linkTransparency) / 100;
  const categoryFill = (100 - categoryTransparency) / 100;

  document.body.style.setProperty("--button-glass-alpha", formatAlpha(0.82 * linkFill));
  document.body.style.setProperty("--button-glass-hover-alpha", formatAlpha(0.94 * linkFill));
  document.body.style.setProperty("--button-glass-blur", `${Math.round(18 * linkFill)}px`);
  document.body.style.setProperty("--primary-button-transparency", `${linkTransparency}%`);
  document.body.style.setProperty("--link-glass-white", formatAlpha(0.42 * linkFill));
  document.body.style.setProperty("--link-glass-white-soft", formatAlpha(0.12 * linkFill));
  document.body.style.setProperty("--link-glass-dark", formatAlpha(0.28 * linkFill));
  document.body.style.setProperty("--link-glass-shine", formatAlpha(0.3 * linkFill));
  document.body.style.setProperty("--link-glass-overlay", formatAlpha(0.58 * linkFill));
  document.body.style.setProperty("--link-glass-accent", formatAlpha(0.34 * linkFill));
  document.body.style.setProperty("--link-glass-blur", `${Math.round(24 * linkFill)}px`);
  document.body.style.setProperty("--category-glass-alpha", formatAlpha(0.78 * categoryFill));
  document.body.style.setProperty("--category-glass-top", formatAlpha(0.18 * categoryFill));
  document.body.style.setProperty("--category-glass-sweep", formatAlpha(0.16 * categoryFill));
  document.body.style.setProperty("--category-glass-shadow", formatAlpha(0.28 * categoryFill));
  document.body.style.setProperty("--category-glass-blur", `${Math.round(18 * categoryFill)}px`);
}

function formatAlpha(value) {
  return Math.min(1, Math.max(0, value)).toFixed(3);
}

function refreshBackgroundAfterResume() {
  if (!getBackgroundImages().length) return;
  window.clearInterval(backgroundTimer);
  backgroundTimer = null;
  backgroundSignature = "";
  currentBackgroundUrl = "";
  window.requestAnimationFrame(renderAppearance);
}

function showBackgroundImage(url, opacity, smooth) {
  const layers = [elements.customBackgroundA, elements.customBackgroundB];
  if (!url) return;
  if (!smooth || !currentBackgroundUrl) {
    layers[0].style.backgroundImage = `url("${escapeCssUrl(url)}")`;
    layers[0].style.opacity = String(opacity);
    layers[1].style.opacity = "0";
    backgroundLayer = 0;
    currentBackgroundUrl = url;
    return;
  }
  if (url === currentBackgroundUrl) {
    layers[backgroundLayer].style.opacity = String(opacity);
    return;
  }
  const nextLayer = backgroundLayer === 0 ? 1 : 0;
  layers[nextLayer].style.backgroundImage = `url("${escapeCssUrl(url)}")`;
  layers[nextLayer].style.opacity = "0";
  window.requestAnimationFrame(() => {
    layers[nextLayer].style.opacity = String(opacity);
    layers[backgroundLayer].style.opacity = "0";
    backgroundLayer = nextLayer;
    currentBackgroundUrl = url;
  });
}

function renderAdminState() {
  document.body.classList.toggle("is-locked", state.auth?.enabled === true && state.auth.authenticated === false);
  document.body.classList.toggle("is-startpage-mode", state.preferences?.startpageMode !== false);
  document.body.classList.toggle("is-share-mode", state.preferences?.shareMode === true);
}

function renderProfiles() {
  elements.profileSelect.replaceChildren(
    ...state.profiles
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }))
      .map((profile) => {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.name;
        return option;
      })
  );
  elements.profileSelect.value = state.activeProfileId;
  elements.deleteProfileButton.disabled = state.profiles.length <= 1 || !canEdit();
}

function renderWidgets() {
  const notes = getNotes();
  renderGoogleWidget();
  renderWeather();
  renderStatus();
  renderStatsWidget();
  const notesHidden = state.preferences?.showNotes === false || (!notes.length && !state.noteComposerOpen);
  elements.notesWidget.hidden = notesHidden;
  elements.widgets.hidden = notesHidden && elements.googleWidget.hidden && elements.statusWidget.hidden && elements.statsWidget.hidden;
  elements.noteInput.disabled = !canEdit();
  elements.addNoteButton.disabled = !canEdit();
  elements.notesList.replaceChildren(...notes.map(createNoteCard));
}

function renderGoogleWidget() {
  elements.googleWidget.hidden = state.widgets?.googleSearch !== true;
}

function renderWeather() {
  const enabled = state.widgets?.weather?.enabled === true;
  elements.weatherWidget.hidden = !enabled;
  if (!enabled) return;
  elements.refreshWeatherButton.disabled = state.weatherLoading;
  elements.refreshWeatherButton.textContent = state.weatherLoading ? "..." : "↻";
  elements.weatherLabel.textContent = state.widgets.weather.label || "Wetter";
  const weather = state.weather || {};
  if (state.weatherLoading && !weather.ok) {
    elements.weatherBody.replaceChildren(createWeatherMessage("Wetter wird geladen"));
    return;
  }
  if (!weather.ok) {
    elements.weatherBody.replaceChildren(createWeatherMessage(weather.message || "Noch keine Wetterdaten"));
    return;
  }

  const temp = document.createElement("strong");
  temp.className = "weather-temp";
  temp.textContent = `${weather.temperature ?? "-"}°`;
  const condition = document.createElement("p");
  condition.className = "weather-condition";
  condition.textContent = weather.condition || "Wetter";
  const copy = document.createElement("div");
  copy.className = "weather-copy";
  copy.append(temp, condition);
  const orb = document.createElement("span");
  orb.className = "weather-orb";
  orb.setAttribute("aria-hidden", "true");
  const metrics = document.createElement("div");
  metrics.className = "weather-metrics";
  const values = [
    ["H/L", weather.high !== null && weather.low !== null ? `${weather.high}°/${weather.low}°` : "-"],
    ["Regen", weather.rainChance !== null ? `${weather.rainChance}%` : "-"],
    ["Luft", weather.humidity !== null ? `${weather.humidity}%` : "-"]
  ];
  metrics.replaceChildren(...values.map(([label, value]) => {
    const item = document.createElement("span");
    const small = document.createElement("small");
    small.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    item.append(small, strong);
    return item;
  }));
  const summary = document.createElement("div");
  summary.className = "weather-summary";
  summary.append(orb, copy);
  elements.weatherBody.replaceChildren(summary, metrics);
}

function createWeatherMessage(message) {
  const item = document.createElement("p");
  item.className = "empty-note";
  item.textContent = message;
  return item;
}

function renderStatus() {
  const items = Array.isArray(state.status.items) ? state.status.items : [];
  elements.statusWidget.hidden = state.widgets?.statusOverview !== true;
  elements.refreshStatusButton.disabled = state.statusLoading;
  elements.refreshStatusButton.textContent = state.statusLoading ? "Lädt..." : "Aktualisieren";
  elements.statusList.replaceChildren(
    ...(items.length ? items.map(createStatusCard) : [createEmptyStatus()])
  );
  elements.statusUpdated.textContent = state.status.updatedAt
    ? `Stand ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(state.status.updatedAt))}`
    : "";
}

function renderStatsWidget() {
  elements.statsWidget.hidden = state.widgets?.linkStats !== true;
  if (elements.statsWidget.hidden) return;
  const online = (state.status.items || []).filter((item) => item.status === "online").length;
  const configured = (state.status.items || []).length;
  const stats = [
    { label: "Links", value: state.links.length },
    { label: "Kategorien", value: getCategoryNames().length },
    { label: "Status online", value: configured ? `${online}/${configured}` : "0" }
  ];
  elements.statsList.replaceChildren(...stats.map((stat) => {
    const item = document.createElement("span");
    const value = document.createElement("strong");
    value.textContent = stat.value;
    const label = document.createElement("small");
    label.textContent = stat.label;
    item.append(value, label);
    return item;
  }));
}

function createStatusCard(item) {
  const card = document.createElement("article");
  card.className = `service-card is-${item.status || "offline"}`;

  const head = document.createElement("div");
  head.className = "service-head";
  const title = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = item.name;
  const type = document.createElement("span");
  type.textContent = formatStatusType(item.type);
  title.append(name, type);
  const badge = document.createElement("span");
  badge.className = "service-badge";
  badge.textContent = item.status === "online" ? "Online" : item.status === "warning" ? "Warnung" : "Offline";
  head.append(title, badge);

  const message = document.createElement("p");
  message.className = "service-message";
  message.textContent = item.message || (item.ok ? "Erreichbar" : "Nicht erreichbar");

  const metrics = document.createElement("div");
  metrics.className = "service-metrics";
  const metricItems = Array.isArray(item.metrics) ? item.metrics : [];
  metrics.replaceChildren(
    ...(metricItems.length ? metricItems.map(createStatusMetric) : [createStatusMetric({ label: "Status", value: item.ok ? "OK" : "Fehler" })])
  );

  card.append(head, message, metrics);
  const details = createStatusDetails(item.details);
  if (details) card.append(details);
  return card;
}

function createStatusMetric(metric) {
  const item = document.createElement("span");
  item.className = "service-metric";
  const label = document.createElement("small");
  label.textContent = metric.label;
  const value = document.createElement("strong");
  value.textContent = metric.value;
  item.append(label, value);
  return item;
}

function createStatusDetails(details) {
  const detailItems = Array.isArray(details) ? details.slice(0, 6) : [];
  if (!detailItems.length) return null;
  const list = document.createElement("div");
  list.className = "status-details";
  list.replaceChildren(...detailItems.map((detail) => {
    const row = document.createElement("p");
    if (typeof detail.online === "boolean") row.classList.add(detail.online ? "is-online" : "is-offline");
    const label = document.createElement("span");
    label.className = "status-detail-name";
    if (typeof detail.online === "boolean") {
      const dot = document.createElement("i");
      dot.className = "status-detail-dot";
      dot.ariaHidden = "true";
      label.append(dot);
    }
    const name = document.createElement("span");
    name.textContent = detail.label || "Status";
    label.append(name);
    const value = document.createElement("strong");
    value.className = "status-detail-value";
    if (detail.memory) {
      const memory = document.createElement("span");
      memory.textContent = detail.memory;
      value.append(memory);
    }
    if (detail.users !== undefined && detail.users !== "") {
      const users = document.createElement("span");
      users.className = "status-detail-users";
      users.ariaLabel = `${detail.users} User`;
      const icon = document.createElement("i");
      icon.className = "user-icon";
      icon.ariaHidden = "true";
      const count = document.createElement("span");
      count.textContent = detail.users;
      users.append(icon, count);
      value.append(users);
    }
    if (!value.childElementCount) value.textContent = detail.value || "";
    row.append(label, value);
    return row;
  }));
  return list;
}

function createEmptyStatus() {
  const empty = document.createElement("p");
  empty.className = "empty-note";
  empty.textContent = "Keine Statusquellen konfiguriert";
  return empty;
}

function formatStatusType(type) {
  const names = {
    proxmox: "Proxmox",
    unraid: "Unraid",
    amp: "AMP",
    homeassistant: "Home Assistant",
    basic: "Service"
  };
  return names[type] || type || "Service";
}

function renderSearch() {
  elements.searchPanel.hidden = false;
  elements.searchToggleButton.hidden = true;
}

function getNotes() {
  const notes = Array.isArray(state.widgets.notes) ? state.widgets.notes : [];
  if (!notes.length && state.widgets.quickNote) {
    return [{ id: createId(), text: state.widgets.quickNote }];
  }
  return notes;
}

function createNoteCard(note) {
  const card = document.createElement("div");
  card.className = "note-card";
  const text = document.createElement("p");
  text.textContent = note.text;
  const remove = document.createElement("button");
  remove.className = "icon-button";
  remove.type = "button";
  remove.textContent = "x";
  remove.ariaLabel = "Notiz löschen";
  remove.addEventListener("click", async () => {
    const nextNotes = getNotes().filter((candidate) => candidate.id !== note.id);
    state.widgets.notes = nextNotes;
    if (!nextNotes.length) state.noteComposerOpen = false;
    await saveData("Notiz gelöscht");
  });
  card.append(text, remove);
  return card;
}

function renderCategoryList() {
  elements.linkCategory.replaceChildren(
    ...getCategoryNames().map((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      return option;
    }),
    createOption("__new_category__", "+ Neue Kategorie")
  );
  renderNewLinkCategory();
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function renderNewLinkCategory() {
  const isNewCategory = elements.linkCategory.value === "__new_category__";
  elements.newLinkCategoryLabel.hidden = !isNewCategory;
  elements.newLinkCategory.required = isNewCategory;
  if (!isNewCategory) elements.newLinkCategory.value = "";
}

function renderGroups() {
  const query = state.query.trim().toLowerCase();
  const tileLayout = state.preferences?.tileCategoryLayout === true;
  const compactLayout = !tileLayout && state.preferences?.compactCategoryLayout === true;
  elements.groups.classList.toggle("is-compact", compactLayout);
  elements.groups.classList.toggle("is-tiles", tileLayout);
  const links = state.links.filter((link) => {
    const haystack = `${link.title} ${link.category} ${link.note}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  const grouped = links.reduce((groups, link) => {
    const category = link.category || "Links";
    groups.set(category, [...(groups.get(category) || []), link]);
    return groups;
  }, new Map());
  if (!query) {
    for (const category of getCategoryNames()) {
      if (!grouped.has(category)) grouped.set(category, []);
    }
  }

  const sections = [...grouped.entries()].sort(([a], [b]) => compareNames(a, b)).map(([category, groupLinks]) => createGroupSection(category, groupLinks));
  elements.groups.replaceChildren(...(compactLayout ? packCompactGroups(sections) : sections.map(({ section }) => section)));
  elements.empty.hidden = links.length > 0 || !query;
}

function createGroupSection(category, groupLinks) {
  const meta = getCategoryMeta(category);
  const section = document.createElement("article");
  section.className = "group";
  section.style.setProperty("--category-color", meta.color);
  const heading = document.createElement("h2");
  const icon = document.createElement("span");
  icon.className = `category-icon is-${meta.icon}`;
  icon.ariaHidden = "true";
  const text = document.createElement("span");
  text.textContent = state.preferences?.showCategoryCounts ? `${category} (${groupLinks.length})` : category;
  heading.append(icon, text);
  const list = document.createElement("div");
  list.className = "link-list";
  if (groupLinks.length) {
    list.replaceChildren(...groupLinks.slice().sort((a, b) => compareNames(a.title, b.title)).map(createLinkCard));
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-category";
    empty.textContent = "Noch leer";
    list.append(empty);
  }
  section.append(heading, list);
  return {
    section
  };
}

function packCompactGroups(groups) {
  if (!groups.length) {
    elements.groups.style.setProperty("--compact-columns", 1);
    return [];
  }
  const width = elements.groups.clientWidth || document.documentElement.clientWidth || window.innerWidth;
  const targetWidth = width >= 1900 ? 270 : 300;
  const desiredColumns = Math.max(1, Math.min(groups.length, Math.floor((width + 14) / (targetWidth + 14))));
  const groupsPerColumn = Math.ceil(groups.length / desiredColumns);
  const columnCount = Math.ceil(groups.length / groupsPerColumn);
  elements.groups.style.setProperty("--compact-columns", columnCount);
  const columns = Array.from({ length: columnCount }, () => document.createElement("div"));
  columns.forEach((column) => {
    column.className = "group-column";
  });
  groups.forEach((group, index) => {
    columns[Math.floor(index / groupsPerColumn)].append(group.section);
  });
  return columns;
}

function compareNames(a, b) {
  return String(a).localeCompare(String(b), "de", { sensitivity: "base" });
}

function getCategoryNames() {
  const seen = new Set();
  const names = [];
  for (const category of state.categories || []) {
    const name = String(category.name || "").trim();
    if (name && !seen.has(name)) {
      names.push(name);
      seen.add(name);
    }
  }
  for (const link of state.links) {
    if (link.category && !seen.has(link.category)) {
      names.push(link.category);
      seen.add(link.category);
    }
  }
  return names.sort(compareNames);
}

function getCategoryMeta(name) {
  const category = (state.categories || []).find((candidate) => candidate.name === name) || {};
  return {
    icon: category.icon || "folder",
    color: normalizeColor(category.color || "#35f0ff")
  };
}

function normalizeColor(color) {
  const value = String(color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#35f0ff";
}

function createLinkCard(link) {
  const wrapper = document.createElement("div");
  wrapper.className = "link-card";
  wrapper.style.setProperty("--category-color", getCategoryMeta(link.category || "Links").color);
  const status = state.preferences?.showLinkStatus === false ? null : getStatusForLink(link);
  if (status) wrapper.classList.add(`has-status`, `is-${status.status || "offline"}`);
  const anchor = document.createElement("a");
  anchor.href = link.url;
  if (state.preferences?.openLinksInNewTab !== false) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }

  const title = document.createElement("p");
  title.className = "link-title";
  const icon = document.createElement("img");
  icon.className = "favicon";
  icon.alt = "";
  icon.loading = "lazy";
  icon.decoding = "async";
  icon.dataset.url = link.url;
  icon.src = `/api/favicon?url=${encodeURIComponent(link.url)}&policy=2&v=${Math.floor(Date.now() / FAVICON_REFRESH_MS)}`;
  icon.addEventListener("error", () => {
    icon.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#35383f"/><text x="32" y="43" text-anchor="middle" fill="white" font-size="36">' + (link.title.trim().charAt(0).match(/[a-z0-9]/i)?.[0] || "?") + '</text></svg>');
  }, { once: true });
  const titleText = document.createElement("span");
  titleText.textContent = link.title;
  title.append(icon, titleText);

  anchor.append(title);
  if (link.note) {
    const note = document.createElement("p");
    note.className = "link-note";
    note.textContent = link.note;
    anchor.append(note);
  }
  if (status) anchor.append(createLinkStatus(status));
  anchor.className = "link-content";

  const edit = document.createElement("button");
  edit.className = "edit-link";
  edit.type = "button";
  edit.textContent = "...";
  edit.ariaLabel = `${link.title} bearbeiten`;
  edit.addEventListener("click", () => openLinkDialog(link));
  wrapper.append(anchor, edit);
  return wrapper;
}

function getStatusForLink(link) {
  const items = Array.isArray(state.status.items) ? state.status.items : [];
  const linkOrigin = getUrlOrigin(link.url);
  const title = normalizeMatchText(link.title);
  return items.find((item) => {
    if (item.id && item.id === link.id) return true;
    const itemOrigin = getUrlOrigin(item.url);
    if (linkOrigin && itemOrigin && linkOrigin === itemOrigin) return true;
    const itemName = normalizeMatchText(item.name);
    return itemName && title && itemName === title;
  });
}

function createLinkStatus(status) {
  const panel = document.createElement("div");
  const isHomeAssistant = status.type === "homeassistant";
  panel.className = `link-status-panel${isHomeAssistant ? " is-homeassistant" : ""}`;
  panel.role = "button";
  panel.tabIndex = 0;
  panel.ariaLabel = `Details zu ${status.name || "Status"} anzeigen`;
  const openDetails = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openStatusDetail(status);
  };
  panel.addEventListener("click", openDetails);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") openDetails(event);
  });

  const line = document.createElement("p");
  line.className = "link-status-line";
  const dot = document.createElement("span");
  dot.className = "link-status-dot";
  const message = document.createElement("span");
  message.textContent = isHomeAssistant ? "Home" : status.message || (status.ok ? "Online" : "Offline");
  line.append(dot, message);
  if (isHomeAssistant) {
    const version = getStatusMetric(status, "Version");
    if (version) {
      const versionText = document.createElement("strong");
      versionText.className = "ha-version";
      versionText.textContent = version;
      line.append(versionText);
    }
  }

  const metrics = document.createElement("div");
  metrics.className = "link-status-metrics";
  const metricItems = (Array.isArray(status.metrics) ? status.metrics : [])
    .filter((metric) => String(metric.label).toLowerCase() !== "user")
    .filter((metric) => !isHomeAssistant || String(metric.label).toLowerCase() !== "version")
    .slice(0, 5);
  metrics.replaceChildren(...metricItems.map((metric) => {
    const item = document.createElement("span");
    const metricKind = getStatusMetricKind(metric.label);
    if (metricKind) {
      item.className = `link-status-metric is-${metricKind}`;
      item.ariaLabel = `${metric.label} ${metric.value}`;
      const icon = document.createElement("i");
      icon.className = `metric-icon metric-icon-${metricKind}`;
      icon.ariaHidden = "true";
      const value = document.createElement("span");
      value.textContent = metric.value;
      item.append(icon, value);
    } else {
      item.textContent = `${metric.label} ${metric.value}`;
    }
    return item;
  }));

  panel.append(line);
  if (metricItems.length && !isHomeAssistant) panel.append(metrics);
  const controls = createHomeAssistantControls(status);
  if (controls) panel.append(controls);
  const details = createStatusDetails(status.details);
  if (details) panel.append(details);
  if (Array.isArray(status.debug) && status.debug.length) {
    const debug = document.createElement("pre");
    debug.className = "link-status-debug";
    debug.textContent = status.debug.join("\n");
    panel.append(debug);
  }
  return panel;
}

function getStatusMetric(status, label) {
  const metric = (Array.isArray(status.metrics) ? status.metrics : [])
    .find((candidate) => String(candidate.label).toLowerCase() === label.toLowerCase());
  return metric?.value ? String(metric.value) : "";
}

function createHomeAssistantControls(status) {
  const controls = Array.isArray(status.controls) ? status.controls : [];
  if (!controls.length) return null;
  const list = document.createElement("div");
  list.className = "ha-controls";
  list.replaceChildren(...controls.map((control) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ha-control is-${control.state === "on" ? "on" : "off"}`;
    button.textContent = control.label;
    button.title = `${control.entityId}: ${control.state}`;
    button.disabled = !control.toggleable || !control.online;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleHomeAssistantControl(status, control, button).catch((error) => showToast(error.message));
    });
    return button;
  }));
  return list;
}

async function toggleHomeAssistantControl(status, control, button) {
  button.disabled = true;
  const nextState = control.state === "on" ? "off" : "on";
  updateHomeAssistantControlState(status.id, control.entityId, nextState);
  const response = await fetch("/api/homeassistant/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linkId: status.id, entityId: control.entityId })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    updateHomeAssistantControlState(status.id, control.entityId, control.state);
    throw new Error(result.error || "Schalten fehlgeschlagen");
  }
  if (result.id) updateStatusItem(result);
  showToast(`${control.label} geschaltet`);
  window.setTimeout(() => loadStatus().catch(() => {}), 1200);
}

function updateHomeAssistantControlState(statusId, entityId, nextState) {
  const item = (state.status.items || []).find((candidate) => candidate.id === statusId);
  if (!item || !Array.isArray(item.controls)) return;
  item.controls = item.controls.map((control) => control.entityId === entityId
    ? { ...control, state: nextState, online: true }
    : control);
  renderStatus();
  renderStatsWidget();
  renderGroups();
}

function updateStatusItem(item) {
  const items = Array.isArray(state.status.items) ? state.status.items.slice() : [];
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) items.splice(index, 1, item);
  else items.push(item);
  state.status = {
    ...(state.status || {}),
    items,
    updatedAt: new Date().toISOString()
  };
  renderStatus();
  renderStatsWidget();
  renderGroups();
}

function openStatusDetail(status) {
  elements.statusDetailTitle.textContent = status.name || "Status";
  const body = document.createElement("div");
  body.className = `service-card is-${status.status || "offline"}`;
  const message = document.createElement("p");
  message.className = "service-message";
  message.textContent = status.message || (status.ok ? "Erreichbar" : "Nicht erreichbar");
  const metrics = document.createElement("div");
  metrics.className = "service-metrics";
  const metricItems = Array.isArray(status.metrics) ? status.metrics : [];
  metrics.replaceChildren(
    ...(metricItems.length ? metricItems.map(createStatusMetric) : [createStatusMetric({ label: "Status", value: status.ok ? "OK" : "Fehler" })])
  );
  body.append(message, metrics);
  const details = createStatusDetails(status.details);
  if (details) body.append(details);
  if (Array.isArray(status.debug) && status.debug.length) {
    const debug = document.createElement("pre");
    debug.className = "link-status-debug";
    debug.textContent = status.debug.join("\n");
    body.append(debug);
  }
  elements.statusDetailBody.replaceChildren(body);
  elements.statusDetailDialog.showModal();
}

function getStatusMetricKind(label) {
  const normalized = String(label || "").toLowerCase();
  if (normalized === "server") return "server";
  if (normalized === "cpu") return "cpu";
  if (normalized === "ram" || normalized === "speicher") return "ram";
  if (normalized === "entities") return "server";
  if (normalized === "updates") return "updates";
  return "";
}

function getUrlOrigin(value) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeMatchText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function openLinkDialog(link = null) {
  if (!canEdit()) return openAdminDialog();
  elements.dialogTitle.textContent = link ? "Link bearbeiten" : "Link hinzufügen";
  elements.linkId.value = link?.id || "";
  elements.linkTitle.value = link?.title || "";
  elements.linkTitle.dataset.autoTitle = link ? "false" : "true";
  elements.linkUrl.value = link?.url || "";
  renderCategoryList();
  elements.linkCategory.value = link?.category || getCategoryNames()[0] || "Links";
  renderNewLinkCategory();
  elements.linkCategory.dataset.autoCategory = link ? "false" : "true";
  elements.linkNote.value = link?.note || "";
  setLinkStatusWidgetForm(link?.statusWidget);
  setLinkStatus("idle", "Nicht getestet");
  elements.deleteButton.hidden = !link;
  elements.editorDialog.showModal();
  elements.linkUrl.focus();
}

function setLinkStatusWidgetForm(widget = {}) {
  elements.linkStatusEnabled.checked = widget?.enabled === true;
  elements.linkStatusType.value = widget?.type || "basic";
  elements.linkStatusUrl.value = widget?.url || "";
  elements.linkStatusTokenId.value = widget?.tokenId || "";
  elements.linkStatusTokenSecret.value = widget?.tokenSecret || "";
  elements.linkStatusApiKey.value = widget?.apiKey || "";
  elements.linkStatusEntities.value = Array.isArray(widget?.entities) ? widget.entities.join(", ") : widget?.entities || "";
  elements.linkStatusUsername.value = widget?.username || "";
  elements.linkStatusPassword.value = widget?.password || "";
  elements.linkStatusTokenSecret.type = "password";
  elements.linkStatusApiKey.type = "password";
  elements.linkStatusPassword.type = "password";
  elements.toggleSecretFieldsButton.textContent = "Zugangsdaten anzeigen";
  elements.linkStatusPath.value = widget?.statusPath || "";
  elements.linkStatusDebug.checked = widget?.debug === true;
  renderLinkStatusFields();
}

function renderLinkStatusFields() {
  const enabled = elements.linkStatusEnabled.checked;
  const type = elements.linkStatusType.value || "basic";
  elements.linkStatusFields.hidden = !enabled;
  elements.linkStatusFields.querySelectorAll("[data-status-field]").forEach((field) => {
    field.hidden = !field.dataset.statusField.split(/\s+/).includes(type);
  });
}

function toggleSecretFields() {
  const secretInputs = [elements.linkStatusTokenSecret, elements.linkStatusApiKey, elements.linkStatusPassword];
  const reveal = secretInputs.some((input) => input.type === "password");
  secretInputs.forEach((input) => {
    input.type = reveal ? "text" : "password";
  });
  elements.toggleSecretFieldsButton.textContent = reveal ? "Zugangsdaten verbergen" : "Zugangsdaten anzeigen";
}

function openSettingsPage() {
  settingsSnapshot = structuredClone(serverSnapshot);
  if (!canEdit()) return openAdminDialog();
  elements.settingsTitle.value = state.title;
  elements.settingsSubtitle.value = state.subtitle;
  elements.themeSelect.value = state.theme || "retro";
  elements.settingsBackgroundFile.value = "";
  renderBackgroundStatus();
  renderBackgroundGallery();
  elements.settingsBackgroundInterval.value = String(normalizeBackgroundInterval(state.appearance?.backgroundInterval));
  renderBackgroundIntervalValue();
  elements.settingsBackgroundOpacity.value = String(Math.round(normalizeBackgroundOpacity(state.appearance?.backgroundOpacity) * 100));
  renderBackgroundOpacityValue();
  elements.settingsLinkTransparency.value = String(normalizeTransparency(state.appearance?.linkTransparency, 72));
  renderLinkTransparencyValue();
  elements.settingsCategoryTransparency.value = String(normalizeTransparency(state.appearance?.categoryTransparency, 58));
  renderCategoryTransparencyValue();
  elements.settingShowCategoryCounts.checked = state.preferences?.showCategoryCounts === true;
  elements.settingCompactCategoryLayout.checked = state.preferences?.compactCategoryLayout === true;
  elements.settingTileCategoryLayout.checked = state.preferences?.tileCategoryLayout === true;
  elements.settingShowLinkStatus.checked = state.preferences?.showLinkStatus !== false;
  elements.settingShowNotes.checked = state.preferences?.showNotes !== false;
  elements.settingOpenLinksInNewTab.checked = state.preferences?.openLinksInNewTab !== false;
  elements.settingStartpageMode.checked = state.preferences?.startpageMode !== false;
  elements.settingShareMode.checked = state.preferences?.shareMode === true;
  elements.settingShowGoogleWidget.checked = state.widgets?.googleSearch === true;
  elements.settingShowStatsWidget.checked = state.widgets?.linkStats === true;
  elements.settingShowStatusWidget.checked = state.widgets?.statusOverview === true;
  elements.settingShowWeatherWidget.checked = state.widgets?.weather?.enabled === true;
  elements.settingWeatherLabel.value = state.widgets?.weather?.label || "Zuhause";
  elements.settingWeatherLatitude.value = state.widgets?.weather?.latitude || "";
  elements.settingWeatherLongitude.value = state.widgets?.weather?.longitude || "";
  elements.settingAllowedIps.value = (Array.isArray(state.admin?.allowedIps) ? state.admin.allowedIps : []).join("\n");
  document.querySelector('#devicesButton').hidden = !state.auth?.authenticated;
  elements.logoutButton.hidden = !(state.auth?.enabled && state.auth.authenticated);
  renderWeatherSettings();
  renderLayoutSettings();
  elements.settingsPage.hidden = false;
  document.body.classList.add("is-settings-page");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeSettingsPage() {
  elements.settingsPage.hidden = true;
  document.body.classList.remove("is-settings-page");
}

function openLoginDialog() {
  if (elements.loginDialog.open) return;
  elements.loginPassword.value = "";
  document.querySelector("#loginError").hidden = true;
  elements.loginDialog.showModal();
  window.requestAnimationFrame(() => elements.loginPassword.focus());
}

async function login() {
  if (!elements.loginForm.reportValidity()) return;
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      password: elements.loginPassword.value,
      remember: document.querySelector("#loginRemember").checked,
      deviceName: document.querySelector("#loginDeviceName").value.trim()
    })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Login fehlgeschlagen");
  }
  state.auth = await response.json();
  elements.loginPassword.value = "";
  elements.loginDialog.close();
  await loadData();
  showToast("Eingeloggt");
}

async function logout() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Abmelden fehlgeschlagen");
  state.auth = await response.json();
  closeSettingsPage();
  await loadData();
  showToast("Abgemeldet");
}

function renderLayoutSettings() {
  elements.settingCompactCategoryLayout.disabled = elements.settingTileCategoryLayout.checked;
}

function renderWeatherSettings() {
  elements.weatherSettings.hidden = !elements.settingShowWeatherWidget.checked;
}

function renderBackgroundOpacityValue() {
  elements.settingsBackgroundOpacityValue.textContent = `${elements.settingsBackgroundOpacity.value || 0}%`;
}

function renderLinkTransparencyValue() {
  elements.settingsLinkTransparencyValue.textContent = `${elements.settingsLinkTransparency.value || 0}%`;
}

function renderCategoryTransparencyValue() {
  elements.settingsCategoryTransparencyValue.textContent = `${elements.settingsCategoryTransparency.value || 0}%`;
}

function renderBackgroundIntervalValue() {
  elements.settingsBackgroundIntervalValue.textContent = `${elements.settingsBackgroundInterval.value || 0}s`;
}

function renderBackgroundStatus() {
  const count = getBackgroundImages().length;
  elements.settingsBackgroundStatus.textContent = count ? `${count} Bild${count === 1 ? "" : "er"} gespeichert` : "Kein Bild";
  elements.removeBackgroundButton.disabled = count === 0;
}

function renderBackgroundGallery() {
  const images = getBackgroundImages();
  elements.backgroundGallery.replaceChildren(
    ...(images.length ? images.map(createBackgroundThumb) : [createBackgroundEmpty()])
  );
}

function createBackgroundThumb(image) {
  const item = document.createElement("div");
  item.className = "background-thumb";
  const preview = document.createElement("span");
  preview.className = "background-thumb-preview";
  preview.style.backgroundImage = `url("${escapeCssUrl(image.url)}")`;
  const name = document.createElement("span");
  name.className = "background-thumb-name";
  name.textContent = image.name || "Hintergrund";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-button";
  remove.textContent = "x";
  remove.ariaLabel = `${image.name || "Bild"} entfernen`;
  remove.addEventListener("click", () => removeBackgroundImage(image.id === "legacy-background" ? "" : image.id).catch((error) => showToast(error.message)));
  item.append(preview, name, remove);
  return item;
}

function createBackgroundEmpty() {
  const item = document.createElement("p");
  item.className = "empty-note";
  item.textContent = "Noch keine Hintergrundbilder";
  return item;
}

function openNoteComposer() {
  if (!canEdit()) return openAdminDialog();
  state.preferences = {
    ...(state.preferences || {}),
    showNotes: true
  };
  state.noteComposerOpen = true;
  closeSettingsPage();
  renderWidgets();
  window.requestAnimationFrame(() => elements.noteInput.focus());
}

function openCategoriesDialog() {
  if (!canEdit()) return openAdminDialog();
  categoryDrafts = getCategoryNames().map((name) => {
    const category = state.categories.find((candidate) => candidate.name === name);
    return {
      id: category?.id || createId(),
      originalName: name,
      name,
      icon: category?.icon || "folder",
      color: normalizeColor(category?.color || "#35f0ff")
    };
  });
  renderCategoryEditor();
  elements.categoriesDialog.showModal();
}

function renderCategoryEditor(focusId = "") {
  elements.categoryEditor.replaceChildren(
    ...categoryDrafts.sort((a, b) => compareNames(a.name, b.name)).map((category) => {
      const row = document.createElement("div");
      row.className = "category-row";
      const input = document.createElement("input");
      input.value = category.name;
      input.maxLength = 40;
      input.placeholder = "Neue Kategorie";
      input.ariaLabel = "Kategoriename";
      input.addEventListener("input", (event) => {
        category.name = event.target.value;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveCategories().catch((error) => showToast(error.message));
        }
      });
      const iconSelect = document.createElement("select");
      iconSelect.ariaLabel = "Kategorie-Icon";
      iconSelect.replaceChildren(...categoryIcons.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }));
      iconSelect.value = category.icon || "folder";
      iconSelect.addEventListener("change", (event) => {
        category.icon = event.target.value;
      });
      const color = document.createElement("input");
      color.type = "color";
      color.value = normalizeColor(category.color || "#35f0ff");
      color.ariaLabel = "Kategorie-Farbe";
      color.addEventListener("input", (event) => {
        category.color = event.target.value;
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger subtle-danger";
      remove.textContent = "Löschen";
      remove.addEventListener("click", () => {
        categoryDrafts = categoryDrafts.filter((candidate) => candidate.id !== category.id);
        renderCategoryEditor();
      });
      row.append(input, iconSelect, color, remove);
      if (category.id === focusId) {
        window.requestAnimationFrame(() => {
          input.focus();
          input.select();
        });
      }
      return row;
    })
  );
}

function addCategory() {
  const id = createId();
  categoryDrafts.push({ id, originalName: "", name: "", icon: "folder", color: categoryColors[categoryDrafts.length % categoryColors.length] });
  renderCategoryEditor(id);
}

async function saveCategories() {
  const seen = new Set();
  const nextCategories = categoryDrafts
    .map((category) => ({
      id: category.id || createId(),
      originalName: category.originalName,
      name: category.name.trim(),
      icon: category.icon || "folder",
      color: normalizeColor(category.color)
    }))
    .filter((category) => {
      if (!category.name || seen.has(category.name)) return false;
      seen.add(category.name);
      return true;
    });
  const renames = new Map();
  for (const category of nextCategories) {
    if (category.originalName && category.originalName !== category.name) renames.set(category.originalName, category.name);
  }
  const nextNames = new Set(nextCategories.map((category) => category.name));
  state.links = state.links.map((link) => {
    if (renames.has(link.category)) return { ...link, category: renames.get(link.category) };
    if (!nextNames.has(link.category)) return { ...link, category: "Links" };
    return link;
  });
  if (state.links.some((link) => link.category === "Links") && !nextNames.has("Links")) {
    nextCategories.push({ id: createId(), name: "Links", icon: "link", color: "#35f0ff" });
  }
  state.categories = nextCategories.map(({ id, name, icon, color }) => ({ id, name, icon, color })).sort((a, b) => compareNames(a.name, b.name));
  await saveData("Kategorien gespeichert");
  elements.categoriesDialog.close();
}

function upsertCategoryFromLink(name) {
  const categoryName = String(name || "").trim();
  if (!categoryName) return "Links";
  const existing = (state.categories || []).find((category) => category.name.toLowerCase() === categoryName.toLowerCase());
  if (existing) return existing.name;
  state.categories.push({
    id: createId(),
    name: categoryName,
    icon: "folder",
    color: categoryColors[state.categories.length % categoryColors.length]
  });
  state.categories.sort((a, b) => compareNames(a.name, b.name));
  return categoryName;
}

function selectedLinkCategory() {
  if (elements.linkCategory.value !== "__new_category__") return elements.linkCategory.value.trim() || "Links";
  return upsertCategoryFromLink(elements.newLinkCategory.value);
}

function chooseLinkCategory(categoryName) {
  const name = String(categoryName || "").trim();
  if (!name) return;
  const existing = getCategoryNames().find((category) => category.toLowerCase() === name.toLowerCase());
  if (existing) {
    elements.linkCategory.value = existing;
    renderNewLinkCategory();
    return;
  }
  elements.linkCategory.value = "__new_category__";
  elements.newLinkCategory.value = name;
  renderNewLinkCategory();
}

async function saveLink() {
  if (!elements.linkForm.reportValidity()) return;
  const url = normalizeUrl(elements.linkUrl.value);
  const link = {
    id: elements.linkId.value || createId(),
    title: elements.linkTitle.value.trim() || titleFromUrl(url),
    url,
    category: selectedLinkCategory(),
    note: elements.linkNote.value.trim(),
    statusWidget: {
      enabled: elements.linkStatusEnabled.checked,
      type: elements.linkStatusType.value,
      url: normalizeUrl(elements.linkStatusUrl.value || elements.linkUrl.value),
      tokenId: elements.linkStatusTokenId.value.trim(),
      tokenSecret: elements.linkStatusTokenSecret.value.trim(),
      apiKey: elements.linkStatusApiKey.value.trim(),
      entities: elements.linkStatusEntities.value.trim(),
      username: elements.linkStatusUsername.value.trim(),
      password: elements.linkStatusPassword.value,
      statusPath: elements.linkStatusPath.value.trim(),
      debug: elements.linkStatusDebug.checked
    }
  };
  const existingIndex = state.links.findIndex((candidate) => candidate.id === link.id);
  if (existingIndex >= 0) state.links.splice(existingIndex, 1, link);
  else state.links.push(link);
  await saveData("Link gespeichert");
  elements.editorDialog.close();
  loadStatus().catch(() => {});
}

function scheduleLinkMetadataLookup() {
  window.clearTimeout(linkMetadataTimer);
  if (!elements.editorDialog.open || elements.linkId.value) return;
  linkMetadataTimer = window.setTimeout(() => lookupLinkMetadata().catch((error) => {
    if (error.name !== "AbortError") setLinkStatus("bad", "Keine Seitendaten");
  }), 650);
}

async function lookupLinkMetadata() {
  const url = normalizeUrl(elements.linkUrl.value || "");
  if (!url || !parseHttpLink(url)) return;
  linkMetadataAbort?.abort();
  linkMetadataAbort = new AbortController();
  setLinkStatus("checking", "Hole Titel...");
  const response = await fetch(`/api/link-metadata?url=${encodeURIComponent(url)}`, { signal: linkMetadataAbort.signal });
  const metadata = await response.json();
  if (metadata.title && (elements.linkTitle.dataset.autoTitle === "true" || !elements.linkTitle.value.trim())) {
    elements.linkTitle.value = metadata.title;
    elements.linkTitle.dataset.autoTitle = "true";
  }
  if (metadata.suggestedCategory && elements.linkCategory.dataset.autoCategory === "true") {
    chooseLinkCategory(metadata.suggestedCategory);
  }
  if (!metadata.title) {
    setLinkStatus("bad", metadata.message || "Titel nicht gefunden");
    return;
  }
  setLinkStatus(metadata.message ? "idle" : "good", metadata.suggestedCategory ? `Vorschlag: ${metadata.suggestedCategory}` : "Titel gefunden");
}

async function deleteLink() {
  state.links = state.links.filter((link) => link.id !== elements.linkId.value);
  await saveData("Link gelöscht");
  elements.editorDialog.close();
}

async function testLink() {
  const url = normalizeUrl(elements.linkUrl.value || "");
  if (!url) return setLinkStatus("bad", "Keine URL");
  setLinkStatus("idle", "Teste...");
  const response = await fetch(`/api/link-status?url=${encodeURIComponent(url)}`);
  const result = await response.json();
  setLinkStatus(result.ok ? "good" : "bad", result.ok ? `OK ${result.status}` : `Fehler ${result.status || ""}`.trim());
}

function setLinkStatus(kind, text) {
  elements.linkStatus.className = `status-pill is-${kind}`;
  elements.linkStatus.textContent = text;
}

function parseHttpLink(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function titleFromUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./i, "").split(".")[0] || "Link";
  } catch {
    return "Link";
  }
}

async function saveSettings() {
  if (!elements.settingsForm.reportValidity()) return;
  const allowedIps = elements.settingAllowedIps.value
    .split(/[\n,;]/)
    .map((ip) => ip.trim())
    .filter(Boolean);
  const settingsPayload = {
    title: elements.settingsTitle.value.trim(),
    subtitle: elements.settingsSubtitle.value.trim(),
    theme: elements.themeSelect.value || "retro",
    appearance: {
      ...(settingsSnapshot?.appearance || {}),
      backgroundOpacity: normalizeBackgroundOpacity(Number(elements.settingsBackgroundOpacity.value) / 100),
      backgroundInterval: normalizeBackgroundInterval(elements.settingsBackgroundInterval.value),
      linkTransparency: normalizeTransparency(elements.settingsLinkTransparency.value, 72),
      categoryTransparency: normalizeTransparency(elements.settingsCategoryTransparency.value, 58)
    },
    preferences: {
      ...(settingsSnapshot?.preferences || {}),
      showCategoryCounts: elements.settingShowCategoryCounts.checked,
      compactCategoryLayout: elements.settingCompactCategoryLayout.checked,
      tileCategoryLayout: elements.settingTileCategoryLayout.checked,
      showLinkStatus: elements.settingShowLinkStatus.checked,
      showNotes: elements.settingShowNotes.checked,
      openLinksInNewTab: elements.settingOpenLinksInNewTab.checked,
      startpageMode: elements.settingStartpageMode.checked,
      shareMode: elements.settingShareMode.checked
    },
    widgets: {
      ...(settingsSnapshot?.widgets || {}),
      googleSearch: elements.settingShowGoogleWidget.checked,
      linkStats: elements.settingShowStatsWidget.checked,
      statusOverview: elements.settingShowStatusWidget.checked,
      weather: {
        ...(settingsSnapshot?.widgets?.weather || {}),
        enabled: elements.settingShowWeatherWidget.checked,
        label: elements.settingWeatherLabel.value.trim() || "Zuhause",
        latitude: elements.settingWeatherLatitude.value.trim(),
        longitude: elements.settingWeatherLongitude.value.trim()
      }
    },
    admin: {
      allowedIps
    }
  };
  await saveSettingsData(settingsPayload, "Einstellungen gespeichert");
  closeSettingsPage();
  loadWeather().catch(() => {});
}

async function uploadBackgroundImages(files) {
  const selectedFiles = Array.from(files || []);
  if (!selectedFiles.length) return;
  for (const file of selectedFiles) {
    await uploadBackgroundImage(file);
  }
  elements.settingsBackgroundFile.value = "";
  render();
  if (!elements.settingsPage.hidden) {
    renderBackgroundStatus();
    renderBackgroundGallery();
    renderBackgroundIntervalValue();
    renderBackgroundOpacityValue();
  }
  showToast(`${selectedFiles.length} Bild${selectedFiles.length === 1 ? "" : "er"} gespeichert`);
}

async function uploadBackgroundImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Bitte eine Bilddatei wählen");
  if (file.size > 8_000_000) throw new Error(`${file.name} ist zu groß`);
  const response = await fetch("/api/background-images", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name)
    },
    body: file
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Upload fehlgeschlagen");
  }
  acceptServerData(await response.json());
}

async function removeBackgroundImage(id = "") {
  const url = id ? `/api/background-images?id=${encodeURIComponent(id)}` : "/api/background-image";
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Entfernen fehlgeschlagen");
  }
  acceptServerData(await response.json());
  render();
  if (!elements.settingsPage.hidden) {
    renderBackgroundStatus();
    renderBackgroundGallery();
  }
  showToast(id ? "Bild entfernt" : "Hintergründe entfernt");
}

function openProfileDialog() {
  if (!canEdit()) return openAdminDialog();
  elements.profileName.value = "";
  elements.profileDialog.showModal();
}

async function saveProfile() {
  const name = elements.profileName.value.trim();
  if (!name) return;
  const id = createId();
  state.profiles.push({ id, name, categories: [{ id: createId(), name: "Links", icon: "link", color: "#35f0ff" }], links: [] });
  state.activeProfileId = id;
  syncActiveProfileAliases();
  await saveData("Profil erstellt");
  elements.profileDialog.close();
}

async function deleteProfile() {
  if (!canEdit() || state.profiles.length <= 1) return;
  const current = activeProfile();
  if (!window.confirm(`Profil "${current.name}" wirklich löschen?`)) return;
  state.profiles = state.profiles.filter((profile) => profile.id !== current.id);
  state.activeProfileId = state.profiles[0].id;
  syncActiveProfileAliases();
  await saveData("Profil gelöscht");
}

async function createDemoProfile() {
  if (!canEdit()) return openAdminDialog();
  const existing = state.profiles.find((profile) => profile.id === "demo");
  if (existing && !window.confirm("Demo-Profil neu erstellen und vorhandene Demo-Daten ersetzen?")) return;
  const demoProfile = {
    id: "demo",
    name: "Demo",
    categories: [
      { id: createId(), name: "Business", icon: "briefcase", color: "#ffb238" },
      { id: createId(), name: "Gameserver", icon: "game", color: "#56ff8f" },
      { id: createId(), name: "Netzwerk", icon: "network", color: "#35f0ff" },
      { id: createId(), name: "Medien", icon: "media", color: "#4aa8ff" }
    ],
    links: [
      createDemoLink("Rechnungstool", "https://example.com/business", "Business", "Demo-Link ohne private Daten"),
      createDemoLink("AMP Panel", "https://example.com/amp", "Gameserver", "Status-Widget kann hier gepflegt werden"),
      createDemoLink("Router", "https://example.com/router", "Netzwerk", ""),
      createDemoLink("Medienserver", "https://example.com/media", "Medien", "")
    ]
  };
  state.profiles = state.profiles.filter((profile) => profile.id !== "demo");
  state.profiles.push(demoProfile);
  state.activeProfileId = "demo";
  syncActiveProfileAliases();
  await saveData("Demo-Profil erstellt");
  closeSettingsPage();
}

function createDemoLink(title, url, category, note) {
  return {
    id: createId(),
    title,
    url,
    category,
    note,
    statusWidget: { enabled: false, type: "basic", url: "", statusPath: "" }
  };
}

function openImportDialog(mode = "json") {
  if (!canEdit()) return openAdminDialog();
  const config = {
    json: {
      title: "Importieren",
      button: "Importieren",
      accept: "application/json,.json",
      placeholder: "{\"profiles\":[...]}"
    },
    restore: {
      title: "Backup wiederherstellen",
      button: "Wiederherstellen",
      accept: "application/json,.json",
      placeholder: "{\"profiles\":[...]}"
    },
    bookmarks: {
      title: "Browser-Bookmarks importieren",
      button: "Bookmarks importieren",
      accept: "text/html,.html,.htm",
      placeholder: "<!DOCTYPE NETSCAPE-Bookmark-file-1>"
    },
    homarr: {
      title: "Homarr-Board importieren",
      button: "Homarr importieren",
      accept: "application/json,.json",
      placeholder: "{\"schemaVersion\":2,\"categories\":[...],\"apps\":[...]}"
    }
  }[mode] || {};
  elements.importMode.value = mode;
  elements.importDialogTitle.textContent = config.title || "Importieren";
  elements.importFile.accept = config.accept || "application/json,.json";
  elements.importText.placeholder = config.placeholder || "";
  elements.runImportButton.textContent = config.button || "Importieren";
  elements.importFile.value = "";
  elements.importText.value = "";
  elements.importDialog.showModal();
}

function downloadBackup() {
  if (!canEdit()) return openAdminDialog();
  const link = document.createElement("a");
  link.href = "/api/homebase/export";
  link.download = "homebase.json";
  document.body.append(link);
  link.click();
  link.remove();
}

async function runImport() {
  let text = elements.importText.value.trim();
  if (!text && elements.importFile.files[0]) text = await elements.importFile.files[0].text();
  const mode = elements.importMode.value || "json";
  if (!text) return showToast(mode === "bookmarks" ? "Keine Bookmark-Daten" : "Keine JSON-Daten");
  if (mode === "bookmarks") {
    const count = await importBookmarks(text);
    elements.importDialog.close();
    showToast(`${count} Bookmarks importiert`);
    return;
  }
  if (mode === "homarr") {
    const count = await importHomarr(text);
    elements.importDialog.close();
    showToast(`${count} Homarr-Links importiert`);
    return;
  }
  if (mode === "json" && isHomarrJson(text)) {
    const count = await importHomarr(text);
    elements.importDialog.close();
    showToast(`${count} Homarr-Links importiert`);
    return;
  }
  if (mode === "restore" && !window.confirm("Backup wirklich wiederherstellen? Die aktuelle Konfiguration wird ersetzt.")) return;
  const response = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: text
  });
  if (!response.ok) throw new Error((await response.json()).error || "Import fehlgeschlagen");
  acceptServerData(await response.json());
  syncActiveProfileAliases();
  render();
  elements.importDialog.close();
  showToast("Importiert");
}

function isHomarrJson(text) {
  try {
    const board = JSON.parse(text);
    return Array.isArray(board?.apps) && Array.isArray(board?.categories) && !Array.isArray(board?.profiles);
  } catch {
    return false;
  }
}

async function importHomarr(text) {
  let board;
  try {
    board = JSON.parse(text);
  } catch {
    throw new Error("Homarr-JSON konnte nicht gelesen werden");
  }
  const categories = parseHomarrCategories(board);
  const links = parseHomarrApps(board, categories);
  if (!links.length) throw new Error("Keine Homarr-Apps mit URL gefunden");
  const profileName = uniqueProfileName(String(board.configProperties?.name || board.name || "Homarr").trim() || "Homarr");
  const profile = {
    id: createId(),
    name: profileName,
    categories: categories.map((category, index) => ({
      id: createId(),
      name: category.name,
      icon: inferCategoryIcon(category.name),
      color: categoryColors[index % categoryColors.length]
    })),
    links
  };
  state.profiles.push(profile);
  state.activeProfileId = profile.id;
  syncActiveProfileAliases();
  await saveData("Homarr importiert");
  return links.length;
}

function parseHomarrCategories(board) {
  const rawCategories = Array.isArray(board?.categories) ? board.categories : [];
  const categories = rawCategories
    .map((category, index) => ({
      homarrId: String(category.id || ""),
      name: String(category.name || "").trim(),
      position: Number.isFinite(Number(category.position)) ? Number(category.position) : index
    }))
    .filter((category) => category.homarrId && category.name)
    .sort((a, b) => a.position - b.position || compareNames(a.name, b.name));
  if (!categories.length) categories.push({ homarrId: "homarr-default", name: "Homarr", position: 0 });
  return categories;
}

function parseHomarrApps(board, categories) {
  const categoryById = new Map(categories.map((category) => [category.homarrId, category.name]));
  const knownKeys = new Set();
  return [
    ...parseHomarrAppLinks(board, categoryById),
    ...parseHomarrBookmarkLinks(board, categoryById)
  ]
    .filter((link) => {
      if (!link.url || !/^https?:\/\//i.test(link.url)) return false;
      const key = `${link.url}::${normalizeMatchText(link.title)}`;
      if (knownKeys.has(key)) return false;
      knownKeys.add(key);
      return true;
    })
    .sort((a, b) => compareNames(a.category, b.category) || a.position - b.position || compareNames(a.title, b.title))
    .map(({ position, ...link }) => link);
}

function parseHomarrAppLinks(board, categoryById) {
  const apps = Array.isArray(board?.apps) ? board.apps : [];
  return apps
    .map((app, index) => {
      const url = normalizeUrl(String(app.behaviour?.externalUrl || app.behaviour?.onClickUrl || app.url || "").trim());
      const category = homarrAppCategory(app, categoryById);
      const position = homarrAppPosition(app, index);
      return {
        id: createId(),
        title: String(app.name || url || "Homarr Link").trim().slice(0, 80),
        url,
        category,
        note: "",
        position,
        statusWidget: { enabled: false, type: "basic", url: "", statusPath: "" }
      };
    });
}

function parseHomarrBookmarkLinks(board, categoryById) {
  const widgets = Array.isArray(board?.widgets) ? board.widgets : [];
  return widgets
    .filter((widget) => String(widget?.type || "").toLowerCase() === "bookmark")
    .flatMap((widget, widgetIndex) => {
      const category = homarrAreaCategory(widget, categoryById);
      const widgetPosition = homarrAppPosition(widget, widgetIndex) * 1000;
      const items = Array.isArray(widget.properties?.items) ? widget.properties.items : [];
      return items.map((item, itemIndex) => {
        const url = normalizeUrl(String(item.href || item.url || "").trim());
        return {
          id: createId(),
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

function homarrAppCategory(app, categoryById) {
  return homarrAreaCategory(app, categoryById);
}

function homarrAreaCategory(item, categoryById) {
  const areaType = String(item.area?.type || "").toLowerCase();
  const categoryId = String(item.area?.properties?.id || "");
  if (areaType === "category" && categoryById.has(categoryId)) return categoryById.get(categoryId);
  if (areaType === "sidebar") return "Sidebar";
  return "Homarr";
}

function homarrAppPosition(app, fallback) {
  const locations = [app.shape?.lg?.location, app.shape?.md?.location, app.shape?.sm?.location];
  for (const location of locations) {
    const x = Number(location?.x);
    const y = Number(location?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return y * 100 + x;
  }
  return fallback;
}

function uniqueProfileName(baseName) {
  const existingNames = new Set(state.profiles.map((profile) => profile.name.toLowerCase()));
  if (!existingNames.has(baseName.toLowerCase())) return baseName;
  let index = 2;
  while (existingNames.has(`${baseName} ${index}`.toLowerCase())) index += 1;
  return `${baseName} ${index}`;
}

function inferCategoryIcon(name) {
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

async function importBookmarks(html) {
  const bookmarks = parseBookmarkHtml(html);
  if (!bookmarks.length) throw new Error("Keine Bookmarks gefunden");
  const knownCategories = new Set(getCategoryNames());
  const knownLinks = new Set(state.links.map((link) => `${normalizeUrl(link.url)}::${normalizeMatchText(link.title)}`));
  const nextLinks = [];
  for (const bookmark of bookmarks) {
    const title = bookmark.title.trim();
    const url = normalizeUrl(bookmark.url);
    const category = bookmark.category || "Bookmarks";
    if (!title || !url) continue;
    const key = `${url}::${normalizeMatchText(title)}`;
    if (knownLinks.has(key)) continue;
    knownLinks.add(key);
    knownCategories.add(category);
    nextLinks.push({
      id: createId(),
      title,
      url,
      category,
      note: "",
      statusWidget: { enabled: false, type: "basic", url: "", statusPath: "" }
    });
  }
  if (!nextLinks.length) throw new Error("Keine neuen Bookmarks gefunden");
  state.categories = [...knownCategories].map((name) => {
    const existing = state.categories.find((category) => category.name === name);
    return existing || { id: createId(), name, icon: "folder", color: categoryColors[state.categories.length % categoryColors.length] };
  }).sort((a, b) => compareNames(a.name, b.name));
  state.links = [...state.links, ...nextLinks];
  await saveData("Bookmarks importiert");
  return nextLinks.length;
}

function parseBookmarkHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector("dl") || doc.body;
  const bookmarks = [];
  const visit = (node, category = "Bookmarks") => {
    let child = node.firstElementChild;
    while (child) {
      if (child.tagName === "DT") {
        const folder = child.querySelector(":scope > h3");
        const link = child.querySelector(":scope > a");
        if (folder) {
          const nextCategory = folder.textContent.trim() || category;
          const nested = child.querySelector(":scope > dl") || (child.nextElementSibling?.tagName === "DL" ? child.nextElementSibling : null);
          if (nested) visit(nested, nextCategory);
        } else if (link) {
          const href = link.getAttribute("href") || "";
          if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
            bookmarks.push({ title: link.textContent || href, url: href, category });
          }
        }
      } else if (child.tagName === "DL") {
        visit(child, category);
      }
      child = child.nextElementSibling;
    }
  };
  visit(root);
  return bookmarks;
}

async function completeSetup() {
  if (!elements.setupForm.reportValidity()) return;
  const response = await fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: elements.setupTitle.value.trim(),
      profileName: elements.setupProfileName.value.trim(),
      categories: ["Links"],
      theme: state.theme || "retro"
    })
  });
  if (!response.ok) throw new Error((await response.json()).error || "Setup fehlgeschlagen");
  acceptServerData(await response.json());
  state.auth = { ...(state.auth || {}), authenticated: true };
  syncActiveProfileAliases();
  render();
  elements.setupDialog.close();
  showToast("HarborDash eingerichtet");
}

function openAdminDialog() {
  if (state.auth?.enabled && !state.auth.authenticated) {
    openLoginDialog();
    return;
  }
  showToast("Bearbeiten ist aktiv");
}

function normalizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeBackgroundImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\/api\/background-image(?:\?.*)?$/i.test(raw)) return raw;
  if (/^\/api\/background-images\/[\w.-]+(?:\?.*)?$/i.test(raw)) return raw;
  const normalized = normalizeUrl(raw);
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? normalized : "";
  } catch {
    return "";
  }
}

function getBackgroundImages() {
  const seen = new Set();
  const images = (Array.isArray(state.appearance?.backgroundImages) ? state.appearance.backgroundImages : [])
    .map((image) => ({
      id: String(image.id || image.url || createId()),
      name: String(image.name || "Hintergrund"),
      url: normalizeBackgroundImageUrl(image.url || image)
    }))
    .filter((image) => {
      if (!image.url || seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    });
  const legacy = normalizeBackgroundImageUrl(state.appearance?.backgroundImage || "");
  if (!images.length && legacy) images.push({ id: "legacy-background", name: "Hintergrund", url: legacy });
  return images;
}

function normalizeBackgroundOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.35;
  return Math.min(0.9, Math.max(0, number));
}

function normalizeBackgroundInterval(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 30;
  return Math.min(300, Math.max(5, Math.round(number)));
}

function normalizeTransparency(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function escapeCssUrl(value) {
  return String(value).replace(/["\\\n\r]/g, (character) => `\\${character}`);
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.setTimeout(() => elements.toast.classList.remove("show"), 1600);
}

function openCommandPalette() {
  elements.commandInput.value = state.query || "";
  renderCommandResults();
  elements.commandDialog.showModal();
  window.requestAnimationFrame(() => elements.commandInput.focus());
}

function renderCommandResults() {
  const query = elements.commandInput.value.trim();
  const results = getCommandResults(query);
  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = query ? "Keine Treffer" : "Tippe, um Links zu suchen";
    elements.commandResults.replaceChildren(empty);
    return;
  }
  elements.commandResults.replaceChildren(...results.map((result, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "command-result";
    row.dataset.index = String(index);
    const title = document.createElement("strong");
    title.textContent = result.title;
    const meta = document.createElement("span");
    meta.textContent = result.meta;
    row.append(title, meta);
    row.addEventListener("click", () => activateCommandResult(result));
    return row;
  }));
}

function getCommandResults(query) {
  const normalized = query.toLowerCase();
  const matches = state.links
    .filter((link) => {
      const haystack = `${link.title} ${link.category} ${link.note}`.toLowerCase();
      return !normalized || haystack.includes(normalized);
    })
    .slice()
    .sort((a, b) => compareNames(a.title, b.title))
    .slice(0, 8)
    .map((link) => ({ type: "link", title: link.title, meta: link.category || "Link", url: link.url }));
  if (!normalized) return matches;
  const categories = getCategoryNames()
    .filter((category) => category.toLowerCase().includes(normalized))
    .slice(0, 4)
    .map((category) => ({ type: "category", title: category, meta: "Kategorie" }));
  const notes = getNotes()
    .filter((note) => note.text.toLowerCase().includes(normalized))
    .slice(0, 3)
    .map((note) => ({ type: "note", title: note.text.slice(0, 70), meta: "Notiz" }));
  const google = { type: "google", title: `Google: ${query}`, meta: "Websuche", url: googleSearchUrl(query) };
  return [[...matches, ...categories, ...notes].slice(0, 9), google].flat();
}

function activateCommandResult(result) {
  if ((result.type === "link" || result.type === "google") && result.url) {
    const target = state.preferences?.openLinksInNewTab === false ? "_self" : "_blank";
    window.open(result.url, target, target === "_blank" ? "noopener,noreferrer" : undefined);
  } else {
    state.query = result.title;
    elements.search.value = result.title;
    state.searchOpen = true;
    renderSearch();
    renderGroups();
  }
  elements.commandDialog.close();
}

function googleSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
}

function openGoogleSearch(query, fallbackInput = elements.search) {
  const search = query.trim();
  if (!search) {
    if (fallbackInput === elements.search) {
      state.searchOpen = true;
      renderSearch();
    }
    fallbackInput.focus();
    showToast("Suchtext eingeben");
    return;
  }
  const target = state.preferences?.openLinksInNewTab === false ? "_self" : "_blank";
  window.open(googleSearchUrl(search), target, target === "_blank" ? "noopener,noreferrer" : undefined);
}

elements.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderGroups();
});
elements.search.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  openGoogleSearch(elements.search.value);
});
elements.googleSearchButton.addEventListener("click", () => openGoogleSearch(elements.search.value));
elements.googleWidgetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  openGoogleSearch(elements.googleWidgetInput.value, elements.googleWidgetInput);
});
elements.searchToggleButton.addEventListener("click", () => {
  state.searchOpen = !state.searchOpen;
  if (!state.searchOpen) {
    state.query = "";
    elements.search.value = "";
    renderGroups();
  }
  renderSearch();
  if (state.searchOpen) elements.search.focus();
});
elements.addButton.addEventListener("click", () => openLinkDialog());
elements.settingsButton.addEventListener("click", openSettingsPage);
elements.newNoteButton.addEventListener("click", openNoteComposer);
elements.settingsCategoriesButton.addEventListener("click", () => {
  closeSettingsPage();
  openCategoriesDialog();
});
elements.settingsBackgroundOpacity.addEventListener("input", renderBackgroundOpacityValue);
elements.settingsBackgroundInterval.addEventListener("input", renderBackgroundIntervalValue);
elements.settingTileCategoryLayout.addEventListener("change", renderLayoutSettings);
elements.settingsLinkTransparency.addEventListener("input", () => {
  renderLinkTransparencyValue();
  state.appearance = { ...(state.appearance || {}), linkTransparency: normalizeTransparency(elements.settingsLinkTransparency.value, 72) };
  applyGlassTransparency();
});
elements.settingsCategoryTransparency.addEventListener("input", () => {
  renderCategoryTransparencyValue();
  state.appearance = { ...(state.appearance || {}), categoryTransparency: normalizeTransparency(elements.settingsCategoryTransparency.value, 58) };
  applyGlassTransparency();
});
elements.settingsBackgroundFile.addEventListener("change", (event) => {
  uploadBackgroundImages(event.target.files).catch((error) => showToast(error.message));
});
elements.removeBackgroundButton.addEventListener("click", () => {
  removeBackgroundImage().catch((error) => showToast(error.message));
});
elements.settingsImportButton.addEventListener("click", () => {
  closeSettingsPage();
  openImportDialog("json");
});
elements.settingsBookmarkImportButton.addEventListener("click", () => {
  closeSettingsPage();
  openImportDialog("bookmarks");
});
elements.settingsHomarrImportButton.addEventListener("click", () => {
  closeSettingsPage();
  openImportDialog("homarr");
});
elements.createDemoButton.addEventListener("click", () => createDemoProfile().catch((error) => showToast(error.message)));
elements.settingShowWeatherWidget.addEventListener("change", renderWeatherSettings);
elements.settingsBackupButton.addEventListener("click", downloadBackup);
elements.settingsRestoreButton.addEventListener("click", () => {
  closeSettingsPage();
  openImportDialog("restore");
});
elements.refreshStatusButton.addEventListener("click", () => loadStatus().catch((error) => showToast(error.message)));
elements.refreshWeatherButton.addEventListener("click", () => loadWeather().catch((error) => showToast(error.message)));
elements.saveLinkButton.addEventListener("click", () => saveLink().catch((error) => showToast(error.message)));
elements.linkForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  saveLink().catch((error) => showToast(error.message));
});
elements.deleteButton.addEventListener("click", () => deleteLink().catch((error) => showToast(error.message)));
elements.testLinkButton.addEventListener("click", () => testLink().catch((error) => setLinkStatus("bad", error.message)));
elements.linkUrl.addEventListener("input", scheduleLinkMetadataLookup);
elements.linkUrl.addEventListener("blur", () => lookupLinkMetadata().catch((error) => {
  if (error.name !== "AbortError") setLinkStatus("bad", "Keine Seitendaten");
}));
elements.linkTitle.addEventListener("input", () => {
  elements.linkTitle.dataset.autoTitle = "false";
});
elements.linkCategory.addEventListener("change", () => {
  elements.linkCategory.dataset.autoCategory = "false";
  renderNewLinkCategory();
  if (elements.linkCategory.value === "__new_category__") elements.newLinkCategory.focus();
});
elements.linkStatusEnabled.addEventListener("change", renderLinkStatusFields);
elements.linkStatusType.addEventListener("change", renderLinkStatusFields);
elements.toggleSecretFieldsButton.addEventListener("click", toggleSecretFields);
elements.closeSettingsButton.addEventListener("click", closeSettingsPage);
elements.cancelSettingsButton.addEventListener("click", closeSettingsPage);
elements.saveSettingsButton.addEventListener("click", () => saveSettings().catch((error) => showToast(error.message)));
elements.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveSettings().catch((error) => showToast(error.message));
});

elements.logoutButton.addEventListener("click", () => logout().catch((error) => showToast(error.message)));
elements.loginForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  elements.loginButton.disabled = true;
  document.querySelector('#loginError').hidden = true;
  login().catch(error => {
    const message = document.querySelector('#loginError');
    message.textContent = error.message;
    message.hidden = false;
  }).finally(() => { elements.loginButton.disabled = false; });
});
elements.addCategoryButton.addEventListener("click", addCategory);
elements.saveCategoriesButton.addEventListener("click", () => saveCategories().catch((error) => showToast(error.message)));
elements.categoriesForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  saveCategories().catch((error) => showToast(error.message));
});
elements.newProfileButton.addEventListener("click", openProfileDialog);
elements.saveProfileButton.addEventListener("click", () => saveProfile().catch((error) => showToast(error.message)));
elements.deleteProfileButton.addEventListener("click", () => deleteProfile().catch((error) => showToast(error.message)));
elements.profileSelect.addEventListener("change", async (event) => {
  state.activeProfileId = event.target.value;
  syncActiveProfileAliases();
  await saveData("Profil gewechselt");
});
elements.addNoteButton.addEventListener("click", async () => {
  if (!canEdit()) return openAdminDialog();
  const text = elements.noteInput.value.trim();
  if (!text) return;
  state.widgets.notes = [...getNotes(), { id: createId(), text }];
  delete state.widgets.quickNote;
  state.noteComposerOpen = false;
  elements.noteInput.value = "";
  await saveData("Notiz gespeichert");
});
elements.runImportButton.addEventListener("click", () => runImport().catch((error) => showToast(error.message)));
elements.completeSetupButton.addEventListener("click", () => completeSetup().catch((error) => showToast(error.message)));
elements.commandInput.addEventListener("input", renderCommandResults);
elements.commandForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const first = getCommandResults(elements.commandInput.value.trim())[0];
  if (first) activateCommandResult(first);
});
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  const openDialog = document.querySelector("dialog[open]");
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (!openDialog || openDialog === elements.commandDialog) openCommandPalette();
    return;
  }
  if (event.key === "/" && !isTyping && !openDialog) {
    event.preventDefault();
    state.searchOpen = true;
    renderSearch();
    elements.search.focus();
  }
});
window.addEventListener("resize", () => {
  if (state.preferences?.compactCategoryLayout !== true) return;
  window.clearTimeout(compactLayoutTimer);
  compactLayoutTimer = window.setTimeout(renderGroups, 120);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) refreshBackgroundAfterResume();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    backgroundHiddenAt = Date.now();
    return;
  }
  if (backgroundHiddenAt && Date.now() - backgroundHiddenAt > BACKGROUND_RESUME_REFRESH_DELAY) {
    refreshBackgroundAfterResume();
  }
  backgroundHiddenAt = 0;
});

updateClock();
window.setInterval(updateClock, 1000);
window.setInterval(() => loadStatus().catch(() => {}), 60000);
window.setInterval(() => loadWeather().catch(() => {}), 15 * 60 * 1000);
async function refreshSharedData() {
  if (state.auth?.authenticated && !document.hidden) {
    const status = await fetch('/api/auth/status', { cache: 'no-store' });
    if (status.ok && !(await status.json()).authenticated) {
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
      closeSettingsPage();
      await loadData();
      return;
    }
  }
  if (document.hidden || saveInProgress || !serverSnapshot || !state.auth?.authenticated
      || !elements.settingsPage.hidden || document.querySelector("dialog[open]") || state.noteComposerOpen) return;
  if (JSON.stringify(state.profiles) !== JSON.stringify(serverSnapshot.profiles)
      || JSON.stringify(state.widgets) !== JSON.stringify(serverSnapshot.widgets)) return;
  const previous = serverSnapshot.revision;
  const response = await fetch("/api/homebase", { cache: "no-store" });
  if (!response.ok) return;
  const data = await response.json();
  if (saveInProgress || serverSnapshot.revision !== previous || document.querySelector("dialog[open]") || !elements.settingsPage.hidden) return;
  if (data.revision !== previous) {
    acceptServerData(data);
    syncActiveProfileAliases();
    render();
  }
}
window.setInterval(() => refreshSharedData().catch(() => {}), 10000);
window.addEventListener("focus", () => refreshSharedData().catch(() => {}));
function refreshFavicons() {
  if (document.hidden) return;
  for (const icon of document.querySelectorAll(".favicon[data-url]")) {
    const source = `/api/favicon?url=${encodeURIComponent(icon.dataset.url)}&policy=2&v=${Math.floor(Date.now() / FAVICON_REFRESH_MS)}`;
    if (icon.getAttribute("src") !== source) icon.src = source;
  }
}
window.setInterval(refreshFavicons, FAVICON_REFRESH_MS);
window.addEventListener("focus", refreshFavicons);
elements.loginDialog.addEventListener('cancel', event => event.preventDefault());
document.querySelector('#devicesButton').addEventListener('click', () => openDevices().catch(error => showToast(error.message)));
document.querySelector('#closeDevicesButton').addEventListener('click', () => document.querySelector('#devicesDialog').close());
document.querySelector('#revokeOthersButton').addEventListener('click', () => revokeDevice('others').catch(error => showToast(error.message)));

async function openDevices() {
  const response = await fetch('/api/auth/sessions');
  if (!response.ok) throw new Error('Geräte konnten nicht geladen werden.');
  const data = await response.json();
  const list = document.querySelector('#deviceList');
  list.replaceChildren();
  for (const device of data.sessions) {
    const row = document.createElement('div');
    row.className = 'device-row';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = device.label + (device.current ? ' · Dieses Gerät' : '');
    const detail = document.createElement('small');
    detail.textContent = 'Angemeldet: ' + new Date(device.createdAt).toLocaleDateString('de-DE') + ' · Gültig bis ' + new Date(device.expiresAt).toLocaleDateString('de-DE');
    info.append(name, detail);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Abmelden';
    button.addEventListener('click', () => revokeDevice(device.id, device.current).catch(error => showToast(error.message)));
    row.append(info, button);
    list.append(row);
  }
  const dialog = document.querySelector('#devicesDialog');
  if (!dialog.open) dialog.showModal();
}

async function revokeDevice(id, current = false) {
  const response = await fetch('/api/auth/sessions?id=' + encodeURIComponent(id), { method: 'DELETE' });
  if (!response.ok) throw new Error('Abmelden fehlgeschlagen.');
  if (current) {
    document.querySelector('#devicesDialog').close();
    closeSettingsPage();
    await loadData();
  } else await openDevices();
}

loadData().catch((error) => showToast(error.message));
