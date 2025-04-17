// --- Global Variables ---
let fuse;
let bookmarks = [];
let searchResults = [];
let selectedIndex = 0;
let omnibarContainer;
let searchInput;
let resultsList;
let isOmnibarVisible = false;

// --- Helper Functions ---
function getFaviconUrl(url) {
  const faviconUrl = new URL(chrome.runtime.getURL("/_favicon/"));
  faviconUrl.searchParams.set("pageUrl", url);
  faviconUrl.searchParams.set("size", "32");
  return faviconUrl.toString();
}

// --- Message Listener (Top Level) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in content script:", request);
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

// Handler for visibility change
function handleVisibilityChange() {
  if (document.hidden && isOmnibarVisible) {
    console.log("Tab hidden, hiding omnibar.");
    hideOmnibar();
  }
}

function showOmnibar() {
  let justCreated = false;
  if (!omnibarContainer) {
    createOmnibarUI();
    justCreated = true;
  }

  // --- Make UI visible and usable IMMEDIATELY ---
  omnibarContainer.style.display = "flex";
  searchInput.value = ""; // Clear input
  renderResults([]); // Render empty results initially
  searchInput.focus();
  document.addEventListener("keydown", handleGlobalKeys);
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  isOmnibarVisible = true;
  console.log("Omnibar shown, visibility listener added.");
  // --- End Immediate UI update ---

  // --- Fetch bookmarks asynchronously ---
  // Fetch only if the UI was just created, or perhaps if bookmarks are empty/stale?
  // For now, let's fetch if just created or if fuse isn't ready.
  if (justCreated || !fuse) {
    console.log("Fetching bookmarks asynchronously...");
    fetchBookmarks();
  }
}

function hideOmnibar() {
  if (omnibarContainer) {
    omnibarContainer.style.display = "none";
    document.removeEventListener("keydown", handleGlobalKeys);
    document.removeEventListener("click", handleClickOutside);
    // Remove visibility change listener when hidden
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    isOmnibarVisible = false;
    console.log("Omnibar hidden, visibility listener removed.");
    // We don't destroy the container or listeners attached within createOmnibarUI
  }
}

function toggleOmnibar() {
  if (isOmnibarVisible) {
    hideOmnibar();
  } else {
    showOmnibar();
  }
}

function closeOmnibar() {
  // For now, closeOmnibar just hides. We might rename this later.
  hideOmnibar();
}

// --- UI Creation (Called by showOmnibar if needed) ---
function createOmnibarUI() {
  // Check again in case of race conditions
  if (document.getElementById("bookmark-fuzzy-finder-container")) return;

  omnibarContainer = document.createElement("div");
  omnibarContainer.id = "bookmark-fuzzy-finder-container";
  // Start hidden, showOmnibar will make it flex
  omnibarContainer.style.display = "none";

  searchInput = document.createElement("input");
  searchInput.id = "bookmark-fuzzy-finder-input";
  searchInput.type = "text";
  searchInput.placeholder = "Search bookmarks...";

  resultsList = document.createElement("ul");
  resultsList.id = "bookmark-fuzzy-finder-results";

  omnibarContainer.appendChild(searchInput);
  omnibarContainer.appendChild(resultsList);
  document.body.appendChild(omnibarContainer);

  // Add event listeners (These persist as long as the elements exist)
  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("keydown", handleKeyboardNavigation);

  console.log("Omnibar UI created.");
}

// --- Event Handlers ---
function handleSearchInput(event) {
  const query = event.target.value.trim();

  // Check if Fuse is initialized before searching
  if (!fuse) {
    console.log("Fuse index not ready yet. Please wait for bookmarks to load.");
    // Optionally, show a loading indicator in the results list
    // resultsList.innerHTML = "<li>Loading bookmarks...</li>";
    renderResults([]); // Keep results empty
    return;
  }

  // Fuse is ready, proceed with search
  if (query) {
    searchResults = fuse.search(query);
    selectedIndex = 0; // Reset selection on new search
    renderResults(searchResults);
  } else {
    // Clear results if query is empty
    searchResults = [];
    renderResults([]);
  }
}

function handleKeyboardNavigation(event) {
  if (!searchResults.length) return; // No results to navigate

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
  // Only listen for Escape when the omnibar is visible
  if (event.key === "Escape" && isOmnibarVisible) {
    console.log("Escape pressed, hiding omnibar");
    event.preventDefault();
    event.stopPropagation();
    hideOmnibar();
  }
}

function handleClickOutside(event) {
  // Only hide if visible and click is outside the container
  if (
    isOmnibarVisible &&
    omnibarContainer &&
    !omnibarContainer.contains(event.target)
  ) {
    console.log("Clicked outside, hiding omnibar");
    hideOmnibar();
  }
}

// --- UI Rendering ---
function renderResults(resultsToRender) {
  if (!resultsList) return;
  resultsList.innerHTML = ""; // Clear previous results

  // Show all results instead of just 3
  resultsToRender.forEach((result, index) => {
    const li = document.createElement("li");
    // Store the index in the full searchResults array
    li.dataset.originalIndex = index;

    if (index === selectedIndex) {
      li.classList.add("selected");
    }

    // Create favicon image
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
    urlSpan.textContent = result.item.url;

    li.appendChild(favicon);
    li.appendChild(titleSpan);
    li.appendChild(urlSpan);

    li.addEventListener("click", () => {
      openBookmark(result.item.url);
      hideOmnibar();
    });
    li.addEventListener("mouseenter", () => {
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
      // Ensure the selected item is visible in the scrollable list
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
    console.error("Fuse.js not loaded!");
    hideOmnibar();
    return;
  }
  fuse = new Fuse(bookmarkData, options);
  // Don't render initial results here anymore
  // searchResults = bookmarks.map((b) => ({ item: b }));
  // renderResults();
}

function fetchBookmarks() {
  console.log("Fetching bookmarks...");
  chrome.runtime.sendMessage({ action: "getBookmarks" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error fetching bookmarks:", chrome.runtime.lastError);
      hideOmnibar();
      return;
    }
    if (response && response.bookmarks) {
      console.log(`Fetched ${response.bookmarks.length} bookmarks.`);
      bookmarks = response.bookmarks;
      initializeFuse(bookmarks);
    } else {
      console.error("Invalid response received for getBookmarks");
      hideOmnibar();
    }
  });
}

// --- Actions ---
function openBookmark(url) {
  chrome.runtime.sendMessage({ action: "openBookmark", url: url });
}

// --- Initial Setup (IIFE removed) ---
// The script now relies on messages from the background script to activate.
// No IIFE needed to auto-run.
console.log("Bookmark Fuzzy Finder content script loaded.");
