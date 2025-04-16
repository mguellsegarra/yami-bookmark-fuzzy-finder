// --- Global Variables ---
let fuse;
let bookmarks = [];
let searchResults = [];
let selectedIndex = 0;
let omnibarContainer;
let searchInput;
let resultsList;
let isOmnibarVisible = false;

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
function showOmnibar() {
  if (!omnibarContainer) {
    createOmnibarUI(); // Create if it doesn't exist
    fetchBookmarks(); // Fetch bookmarks only when showing for the first time or after closing fully
  } else {
    omnibarContainer.style.display = "flex"; // Just show if already exists
  }
  searchInput.value = ""; // Clear input
  searchResults = bookmarks.map((b) => ({ item: b })); // Reset results
  renderResults(); // Render initial/full list
  searchInput.focus();
  document.addEventListener("keydown", handleGlobalKeys); // Re-attach global key listener
  document.addEventListener("click", handleClickOutside); // Re-attach click listener
  isOmnibarVisible = true;
}

function hideOmnibar() {
  if (omnibarContainer) {
    omnibarContainer.style.display = "none";
    document.removeEventListener("keydown", handleGlobalKeys);
    document.removeEventListener("click", handleClickOutside);
    isOmnibarVisible = false;
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
  searchInput.placeholder = "type to search...";

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
  const query = event.target.value;
  if (fuse) {
    searchResults = query
      ? fuse.search(query)
      : bookmarks.map((b) => ({ item: b })); // Show all if empty
    selectedIndex = 0; // Reset selection on new search
    renderResults();
  }
}

function handleKeyboardNavigation(event) {
  const numResults = resultsList.children.length;
  if (!numResults) return; // Don't handle nav if no results

  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex = (selectedIndex + 1) % numResults;
    updateSelection();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex = (selectedIndex - 1 + numResults) % numResults;
    updateSelection();
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
      const selectedBookmark = searchResults[selectedIndex].item;
      openBookmark(selectedBookmark.url);
      hideOmnibar(); // Hide after opening
    }
  } else if (event.key === "Escape") {
    // Specific Escape handling moved to handleGlobalKeys
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
function renderResults() {
  if (!resultsList) return;
  resultsList.innerHTML = ""; // Clear previous results

  searchResults.slice(0, 10).forEach((result, index) => {
    // Limit to top 10 results
    const li = document.createElement("li");
    li.dataset.index = index;
    if (index === selectedIndex) {
      li.classList.add("selected");
    }

    // --- Icon Handling REMOVED ---

    const titleSpan = document.createElement("span");
    titleSpan.className = "title";
    titleSpan.textContent = result.item.title || "";

    const urlSpan = document.createElement("span");
    urlSpan.className = "url";
    urlSpan.textContent = result.item.url;

    // Append only title and URL
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
  Array.from(resultsList.children).forEach((item, index) => {
    const isSelected = index === selectedIndex;
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
    console.error("Fuse.js not loaded!");
    hideOmnibar();
    return;
  }
  fuse = new Fuse(bookmarkData, options);
  // Initial render is now handled by showOmnibar
  searchResults = bookmarks.map((b) => ({ item: b })); // Prepare initial results
  renderResults();
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
