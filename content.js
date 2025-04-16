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
  const displayedItems = resultsList.children;
  const numDisplayed = displayedItems.length;
  if (!numDisplayed) return; // No items displayed, do nothing

  // Find the current display index (0, 1, or 2) based on selectedIndex
  let currentDisplayIndex = -1;
  for (let i = 0; i < numDisplayed; i++) {
    if (
      parseInt(displayedItems[i].dataset.originalIndex, 10) === selectedIndex
    ) {
      currentDisplayIndex = i;
      break;
    }
  }

  // If nothing is currently selected visually (e.g., index > 2), default to -1 or 0 for navigation
  if (currentDisplayIndex === -1) {
    // If pressing down, start from the first visible item (display index 0)
    // If pressing up, start from the last visible item (display index numDisplayed - 1)
    // This handles cases where selectedIndex is outside the visible range
    currentDisplayIndex = event.key === "ArrowUp" ? numDisplayed : -1;
  }

  let nextDisplayIndex = currentDisplayIndex; // Initialize with current

  if (event.key === "ArrowDown") {
    event.preventDefault();
    nextDisplayIndex = (currentDisplayIndex + 1) % numDisplayed;
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    nextDisplayIndex = (currentDisplayIndex - 1 + numDisplayed) % numDisplayed;
  } else if (event.key === "Enter") {
    event.preventDefault();
    // Enter still uses the global selectedIndex which might be outside the visible range
    // but should correspond to the correct full result list index
    if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
      const selectedBookmark = searchResults[selectedIndex].item;
      openBookmark(selectedBookmark.url);
      hideOmnibar();
    }
    return; // Don't update selection on Enter
  } else {
    return; // Ignore other keys like Escape here
  }

  // Find the new selectedIndex based on the nextDisplayIndex
  const newItem = displayedItems[nextDisplayIndex];
  if (newItem) {
    const newOriginalIndex = parseInt(newItem.dataset.originalIndex, 10);
    if (newOriginalIndex !== selectedIndex) {
      selectedIndex = newOriginalIndex;
      updateSelection();
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

  // Determine the slice to display (max 3 items)
  // This logic could be enhanced to show a slice around the selectedIndex,
  // but for now, we just show the top 3.
  const displaySlice = resultsToRender.slice(0, 3);

  displaySlice.forEach((result, displayIndex) => {
    const li = document.createElement("li");
    // Find the index in the *original* full searchResults array
    const originalIndex = searchResults.findIndex(
      (r) => r.item.url === result.item.url
    );
    li.dataset.originalIndex = originalIndex; // Store the original index

    if (originalIndex === selectedIndex) {
      li.classList.add("selected");
    }

    const titleSpan = document.createElement("span");
    titleSpan.className = "title";
    titleSpan.textContent = result.item.title || "";

    const urlSpan = document.createElement("span");
    urlSpan.className = "url";
    urlSpan.textContent = result.item.url;

    li.appendChild(titleSpan);
    li.appendChild(urlSpan);

    li.addEventListener("click", () => {
      openBookmark(result.item.url);
      hideOmnibar();
    });
    li.addEventListener("mouseenter", () => {
      // Update selectedIndex based on the original index of the hovered item
      if (originalIndex !== -1) {
        selectedIndex = originalIndex;
        updateSelection(); // Update highlighting
      }
    });

    resultsList.appendChild(li);
  });

  updateSelection(); // Update highlighting based on potentially new selectedIndex
}

function updateSelection() {
  if (!resultsList) return;

  Array.from(resultsList.children).forEach((item) => {
    const itemOriginalIndex = parseInt(item.dataset.originalIndex, 10);
    const isSelected = itemOriginalIndex === selectedIndex;

    item.classList.toggle("selected", isSelected);
    if (isSelected) {
      // Scroll the item into view if it's selected
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
