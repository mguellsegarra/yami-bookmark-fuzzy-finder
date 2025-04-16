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

// Handler for visibility change
function handleVisibilityChange() {
  if (document.hidden && isOmnibarVisible) {
    console.log("Tab hidden, hiding omnibar.");
    hideOmnibar();
  }
}

function showOmnibar() {
  if (!omnibarContainer) {
    createOmnibarUI();
    fetchBookmarks(); // Fetch bookmarks when UI is created
  } else {
    omnibarContainer.style.display = "flex";
  }
  searchInput.value = ""; // Clear input
  renderResults([]);
  searchInput.focus();
  document.addEventListener("keydown", handleGlobalKeys);
  document.addEventListener("click", handleClickOutside);
  // Add visibility change listener when shown
  document.addEventListener("visibilitychange", handleVisibilityChange);
  isOmnibarVisible = true;
  console.log("Omnibar shown, visibility listener added.");
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
  const query = event.target.value.trim(); // Trim whitespace
  if (fuse) {
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
function renderResults(resultsToRender) {
  if (!resultsList) return;
  resultsList.innerHTML = ""; // Clear previous results

  // Render only the top 3 results passed to the function
  resultsToRender.slice(0, 3).forEach((result, index) => {
    const li = document.createElement("li");
    li.dataset.index = index;
    // Note: selectedIndex now refers to the index within the *original* searchResults
    // We need to check if the current item's index in the original array matches
    const originalIndex = searchResults.findIndex(
      (r) => r.item.url === result.item.url
    );
    if (originalIndex === selectedIndex) {
      li.classList.add("selected");
    }

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
      // Find the index in the original searchResults array
      const hoverIndex = searchResults.findIndex(
        (r) => r.item.url === result.item.url
      );
      if (hoverIndex !== -1) {
        selectedIndex = hoverIndex;
        updateSelection(resultsToRender.slice(0, 3)); // Pass the currently rendered items
      }
    });

    resultsList.appendChild(li);
  });

  updateSelection(resultsToRender.slice(0, 3)); // Pass the currently rendered items
}

function updateSelection(renderedResults) {
  if (!resultsList) return;
  // Update selection based on the currently rendered list items
  Array.from(resultsList.children).forEach((item, index) => {
    // Find the corresponding full result based on the rendered item's URL (or title/data-index)
    const renderedUrl = renderedResults[index]?.item.url;
    const selectedUrl = searchResults[selectedIndex]?.item.url;
    const isSelected =
      renderedUrl && selectedUrl && renderedUrl === selectedUrl;

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
