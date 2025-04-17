// --- Global Variables ---
let fuse;
let bookmarks = [];
let searchResults = [];
let selectedIndex = 0;
let omnibarContainer;
let searchInput;
let resultsList;
let isOmnibarVisible = false;
let hasMouseMovedSinceRender = false;
let lastMousePosition = null;

// Translations for the search placeholder
export const searchPlaceholderTranslations = {
  // English
  "en-GB": "Search bookmarks",
  "en-US": "Search bookmarks",

  // Chinese
  "zh-CN": "搜索书签", // Simplified Chinese
  "zh-TW": "搜尋書籤", // Traditional Chinese
  "zh-HK": "搜尋書籤", // Hong Kong Traditional Chinese

  // Spanish
  "es-ES": "Buscar marcadores", // Spain
  "es-419": "Buscar marcadores", // Latin American Spanish

  // Portuguese
  "pt-BR": "Pesquisar favoritos", // Brazilian Portuguese
  "pt-PT": "Pesquisar marcadores", // European Portuguese

  // Other languages
  hi: "बुकमार्क खोजें",
  ar: "ابحث في الإشارات المرجعية",
  bn: "বুকমার্কগুলি অনুসন্ধান করুন",
  ru: "Поиск по закладкам", // Chrome RU: Закладки = Bookmarks
  ja: "ブックマークを検索",
  de: "Lesezeichen durchsuchen",
  fr: "Rechercher dans les favoris",
  id: "Cari bookmark",
  ko: "북마크 검색",
  tr: "Yer işaretlerini ara",
  it: "Cerca nei preferiti", // Chrome IT: Preferiti
  th: "ค้นหาบุ๊กมาร์ก",
  fa: "جستجوی نشانک‌ها",
  pl: "Szukaj zakładek",
  nl: "Bladwijzers zoeken",
  vi: "Tìm kiếm dấu trang",
  ca: "Cerca a les adreces d'interès", // Chrome CA: adreces d'interès
  eu: "Laster-markak bilatu", // Chrome EU: laster‑markak
  gl: "Buscar marcadores", // Chrome GL: marcadores
};

// Function to get the appropriate translation
function getSearchPlaceholder() {
  const fullLocale = chrome.i18n.getUILanguage(); // Get full locale (e.g. zh-TW, pt-BR)
  const baseLocale = fullLocale.split("-")[0]; // Get base locale (e.g. zh, pt)

  // First try the full locale (e.g. zh-TW)
  if (searchPlaceholderTranslations[fullLocale]) {
    return searchPlaceholderTranslations[fullLocale] + "...";
  }

  // Then try the base locale (e.g. zh)
  if (searchPlaceholderTranslations[baseLocale]) {
    return searchPlaceholderTranslations[baseLocale] + "...";
  }

  // Fallback to English
  return searchPlaceholderTranslations.en + "...";
}

// --- Helper Functions ---
function getFaviconUrl(url) {
  const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"));
  faviconUrl.searchParams.set("pageUrl", url);
  faviconUrl.searchParams.set("size", "32");
  return faviconUrl.toString();
}

// --- Message Listener (Top Level) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping") {
    sendResponse({ status: "pong" });
    return true;
  }
  if (request.action === "toggle") {
    toggleOmnibar();
    sendResponse({ status: isOmnibarVisible ? "shown" : "hidden" });
    return true;
  }
});

// --- Core Logic Functions ---
function handleVisibilityChange() {
  if (document.hidden && isOmnibarVisible) {
    hideOmnibar();
  }
}

function handleWindowBlur() {
  if (isOmnibarVisible) {
    hideOmnibar();
  }
}

function showOmnibar() {
  let justCreated = false;
  if (!omnibarContainer) {
    createOmnibarUI();
    justCreated = true;
  }

  hasMouseMovedSinceRender = false;
  lastMousePosition = null;
  omnibarContainer.classList.add("visible");
  searchInput.value = "";
  renderResults([]);
  searchInput.focus();
  document.addEventListener("keydown", handleGlobalKeys);
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", handleWindowBlur);
  isOmnibarVisible = true;

  if (justCreated || !fuse) {
    fetchBookmarks();
  }
}

function hideOmnibar() {
  if (omnibarContainer) {
    omnibarContainer.classList.remove("visible");
    document.removeEventListener("keydown", handleGlobalKeys);
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.removeEventListener("mousemove", handleFirstMouseMove);
    window.removeEventListener("blur", handleWindowBlur);
    isOmnibarVisible = false;
  }
}

function toggleOmnibar() {
  if (isOmnibarVisible) {
    hideOmnibar();
  } else {
    showOmnibar();
  }
}

// --- UI Creation ---
function createOmnibarUI() {
  if (document.getElementById("bookmark-fuzzy-finder-container")) return;

  omnibarContainer = document.createElement("div");
  omnibarContainer.id = "bookmark-fuzzy-finder-container";
  omnibarContainer.style.display = "none";

  searchInput = document.createElement("input");
  searchInput.id = "bookmark-fuzzy-finder-input";
  searchInput.type = "text";
  searchInput.placeholder = getSearchPlaceholder();

  resultsList = document.createElement("ul");
  resultsList.id = "bookmark-fuzzy-finder-results";

  omnibarContainer.appendChild(searchInput);
  omnibarContainer.appendChild(resultsList);
  document.body.appendChild(omnibarContainer);

  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("keydown", handleKeyboardNavigation);
}

// --- Event Handlers ---
function handleSearchInput(event) {
  const query = event.target.value.trim();
  selectedIndex = 0;

  if (!fuse) {
    searchResults = [];
    renderResults([]);
    return;
  }

  if (query) {
    searchResults = fuse.search(query);
    renderResults(searchResults);
  } else {
    searchResults = [];
    renderResults([]);
  }
}

function handleKeyboardNavigation(event) {
  if (!searchResults.length) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex = (selectedIndex + 1) % searchResults.length;
    updateSelection();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex =
      (selectedIndex - 1 + searchResults.length) % searchResults.length;
    updateSelection();
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
      const selectedBookmark = searchResults[selectedIndex].item;
      openBookmark(selectedBookmark.url);
      hideOmnibar();
    }
  }
}

function handleGlobalKeys(event) {
  if (event.key === "Escape" && isOmnibarVisible) {
    event.preventDefault();
    event.stopPropagation();
    hideOmnibar();
  }
}

function handleClickOutside(event) {
  if (
    isOmnibarVisible &&
    omnibarContainer &&
    !omnibarContainer.contains(event.target)
  ) {
    hideOmnibar();
  }
}

// Add handler for first mouse movement
function handleFirstMouseMove(e) {
  // Only count movement if the mouse position has actually changed since results rendered
  if (
    lastMousePosition &&
    (e.clientX !== lastMousePosition.x || e.clientY !== lastMousePosition.y)
  ) {
    hasMouseMovedSinceRender = true;
    document.removeEventListener("mousemove", handleFirstMouseMove);
  }
}

// --- UI Rendering ---
function renderResults(resultsToRender) {
  if (!resultsList) return;
  resultsList.innerHTML = "";

  // Store current mouse position when rendering results
  lastMousePosition = { x: 0, y: 0 };
  const mouseEvent = window.event;
  if (mouseEvent && "clientX" in mouseEvent) {
    lastMousePosition.x = mouseEvent.clientX;
    lastMousePosition.y = mouseEvent.clientY;
  }

  hasMouseMovedSinceRender = false; // Reset flag when rendering new results
  document.addEventListener("mousemove", handleFirstMouseMove); // Re-add the listener

  resultsToRender.forEach((result, index) => {
    const li = document.createElement("li");
    li.dataset.originalIndex = index;

    if (index === selectedIndex) {
      li.classList.add("selected");
    }

    const favicon = document.createElement("img");
    favicon.className = "favicon";
    favicon.src = getFaviconUrl(result.item.url);
    favicon.width = 16;
    favicon.height = 16;
    favicon.alt = "";

    const titleSpan = document.createElement("span");
    titleSpan.className = "title";
    titleSpan.textContent = result.item.title || "";

    const urlSpan = document.createElement("span");
    urlSpan.className = "url";
    urlSpan.textContent = result.item.url.replace(/^https?:\/\//, "");

    li.appendChild(favicon);
    li.appendChild(titleSpan);
    li.appendChild(urlSpan);

    li.addEventListener("click", () => {
      openBookmark(result.item.url);
      hideOmnibar();
    });

    li.addEventListener("mouseenter", () => {
      if (!hasMouseMovedSinceRender) return;
      selectedIndex = index;
      updateSelection();
    });

    resultsList.appendChild(li);
  });

  updateSelection();
}

function updateSelection() {
  if (!resultsList) return;

  Array.from(resultsList.children).forEach((item) => {
    const itemIndex = parseInt(item.dataset.originalIndex, 10);
    const isSelected = itemIndex === selectedIndex;

    item.classList.toggle("selected", isSelected);
    if (isSelected) {
      item.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  });
}

// --- Data Fetching & Initialization ---
function initializeFuse(bookmarkData) {
  const options = {
    keys: ["title", "url"],
    threshold: 0.4,
    includeScore: true,
  };
  if (typeof Fuse === "undefined") {
    hideOmnibar();
    return;
  }
  fuse = new Fuse(bookmarkData, options);
}

function fetchBookmarks() {
  chrome.runtime.sendMessage({ action: "getBookmarks" }, (response) => {
    if (chrome.runtime.lastError) {
      hideOmnibar();
      return;
    }
    if (response && response.bookmarks) {
      bookmarks = response.bookmarks;
      initializeFuse(bookmarks);
    } else {
      hideOmnibar();
    }
  });
}

// --- Actions ---
function openBookmark(url) {
  chrome.runtime.sendMessage({ action: "openBookmark", url: url });
}
