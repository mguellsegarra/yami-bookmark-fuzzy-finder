// Function to inject scripts and styles
function injectContent(tab) {
  if (tab.id) {
    // Check if already injected
    chrome.tabs.sendMessage(tab.id, { action: "ping" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        // Not injected or script crashed, inject now
        chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            files: ["fuse.min.js", "content.js"], // Inject Fuse.js first
          })
          .then(() => {
            chrome.scripting
              .insertCSS({
                target: { tabId: tab.id },
                files: ["styles.css"],
              })
              .then(() => {
                // After successful injection, send the toggle message
                setTimeout(() => {
                  chrome.tabs.sendMessage(tab.id, { action: "toggle" });
                }, 50); // Small delay to ensure everything is ready
              });
          })
          .catch((err) =>
            console.error("Failed to inject script or CSS: ", err)
          );
      } else {
        // Already injected, send toggle message
        chrome.tabs.sendMessage(tab.id, { action: "toggle" });
      }
    });
  }
}

// Listener for clicks on the extension icon
chrome.action.onClicked.addListener((tab) => {
  injectContent(tab);
});

// Explicit listener for the keyboard shortcut command
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "_execute_action") {
    injectContent(tab);
  }
});

// Listen for messages from content script (e.g., to open a bookmark)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openBookmark") {
    if (request.openInNewWindow) {
      chrome.windows.create({ url: request.url });
    } else if (request.openInNewTab) {
      chrome.tabs.create({ url: request.url });
    } else if (request.openInCurrentTab) {
      chrome.tabs.update(sender.tab.id, { url: request.url });
    }
    sendResponse({ status: "Bookmark opened" });
    return true; // Keep the message channel open for asynchronous response
  }

  if (request.action === "getBookmarks") {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      let bookmarks = [];
      function flattenBookmarks(nodes) {
        nodes.forEach((node) => {
          if (node.url) {
            bookmarks.push({ title: node.title, url: node.url });
          }
          if (node.children) {
            flattenBookmarks(node.children);
          }
        });
      }
      flattenBookmarks(bookmarkTreeNodes);
      sendResponse({ bookmarks: bookmarks });
    });
    return true; // Required for async sendResponse
  }
  // Add a listener for the 'ping' message from content script
  if (request.action === "ping") {
    sendResponse({ status: "pong" });
    return true;
  }

  // Removed handler for favicon URLs
  // if (request.action === "getFaviconUrl") { ... }
});
