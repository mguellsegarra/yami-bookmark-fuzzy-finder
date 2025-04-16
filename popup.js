let bookmarks = [];
let fuse;
let selectedIndex = -1;

// Initialize Fuse.js with bookmarks
function initializeFuse(bookmarkData) {
  const options = {
    keys: ["title", "url"],
    threshold: 0.4,
    includeScore: true,
  };
  fuse = new Fuse(bookmarkData, options);
}

// Get all bookmarks recursively
function processBookmarks(bookmarkNodes) {
  for (const node of bookmarkNodes) {
    if (node.children) {
      processBookmarks(node.children);
    } else if (node.url) {
      bookmarks.push({
        title: node.title,
        url: node.url,
        favicon: `chrome://favicon/${node.url}`,
      });
    }
  }
}

// Render search results
function renderResults(results) {
  const container = document.getElementById("results-container");
  container.innerHTML = "";

  results.forEach((result, index) => {
    const item = document.createElement("div");
    item.className = `result-item ${index === selectedIndex ? "selected" : ""}`;

    const favicon = document.createElement("img");
    favicon.className = "favicon";
    favicon.src = result.item.favicon;
    favicon.onerror = () => (favicon.style.display = "none");

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = result.item.title;

    item.appendChild(favicon);
    item.appendChild(title);

    item.addEventListener("click", () => {
      chrome.tabs.create({ url: result.item.url });
      window.close();
    });

    container.appendChild(item);
  });
}

// Handle keyboard navigation
function handleKeyboard(event) {
  const results = document.getElementsByClassName("result-item");

  if (event.key === "ArrowDown") {
    event.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    updateSelection();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection();
  } else if (event.key === "Enter" && selectedIndex >= 0) {
    event.preventDefault();
    const selectedResult = document.querySelector(".result-item.selected");
    if (selectedResult) {
      selectedResult.click();
    }
  }
}

// Update the selected item's visual state
function updateSelection() {
  const items = document.getElementsByClassName("result-item");
  Array.from(items).forEach((item, index) => {
    item.classList.toggle("selected", index === selectedIndex);
    if (index === selectedIndex) {
      item.scrollIntoView({ block: "nearest" });
    }
  });
}

// Initialize the extension
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("search-input");

  // Get all bookmarks
  chrome.bookmarks.getTree((tree) => {
    processBookmarks(tree);
    initializeFuse(bookmarks);

    // Initial search with empty query to show all bookmarks
    const results = fuse.search("");
    renderResults(results);
  });

  // Handle search input
  searchInput.addEventListener("input", (e) => {
    selectedIndex = 0;
    const results = e.target.value
      ? fuse.search(e.target.value)
      : fuse.search("");
    renderResults(results);
  });

  // Handle keyboard navigation
  searchInput.addEventListener("keydown", handleKeyboard);
});
