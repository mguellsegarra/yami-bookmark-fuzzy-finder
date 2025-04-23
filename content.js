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

// Function to get the search placeholder text
function getSearchPlaceholder() {
  return chrome.i18n.getMessage("searchPlaceholder");
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

  // Ensure the container is displayed before adding visible class
  omnibarContainer.style.display = "block";
  // Use requestAnimationFrame to ensure the display change has taken effect
  requestAnimationFrame(() => {
    omnibarContainer.classList.add("visible");
  });

  hasMouseMovedSinceRender = false;
  lastMousePosition = null;
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

    // Hide the container after the transition
    setTimeout(() => {
      if (!isOmnibarVisible && omnibarContainer) {
        omnibarContainer.style.display = "none";
      }
    }, 250); // Slightly longer than the CSS transition
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
      // Find the original bookmark with the full URL
      const processedUrl = searchResults[selectedIndex].item.url;
      const originalBookmark = bookmarks.find(
        (b) =>
          b.url
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "")
            .replace(/\/$/, "") === processedUrl
      );
      openBookmark(originalBookmark.url);
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

    // Find the original bookmark with the full URL
    const processedUrl = result.item.url;
    const originalBookmark = bookmarks.find(
      (b) =>
        b.url
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .replace(/\/$/, "") === processedUrl
    );

    const favicon = document.createElement("img");
    favicon.className = "favicon";
    favicon.src = getFaviconUrl(originalBookmark.url);
    favicon.width = 16;
    favicon.height = 16;
    favicon.alt = "";

    const titleSpan = document.createElement("span");
    titleSpan.className = "title";
    titleSpan.textContent = result.item.title || "";

    const urlSpan = document.createElement("span");
    urlSpan.className = "url";
    urlSpan.textContent = result.item.url;

    li.appendChild(favicon);
    li.appendChild(titleSpan);
    li.appendChild(urlSpan);

    li.addEventListener("click", () => {
      openBookmark(originalBookmark.url);
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

  // Preprocess URLs before passing to Fuse
  const processedBookmarks = bookmarkData.map((bookmark) => ({
    ...bookmark,
    url: bookmark.url
      .replace(/^https?:\/\//, "") // Remove http:// or https://
      .replace(/^www\./, "") // Remove www.
      .replace(/\/$/, ""), // Remove trailing slash
  }));

  fuse = new Fuse(processedBookmarks, options);
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
