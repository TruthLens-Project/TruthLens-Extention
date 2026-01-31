// content.js
// Listens for messages from the popup to parse the article.

console.log("TruthLens content script loaded.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PARSE_ARTICLE") {
        console.log("TruthLens: Parsing article...");
        try {
            // Check if Readability is available
            if (typeof Readability === 'undefined') {
                console.error("TruthLens: Readability library not found!");
                sendResponse({ success: false, error: "Library missing" });
                return;
            }

            // We need to clone the document because Readability mutates it
            const documentClone = document.cloneNode(true);
            const article = new Readability(documentClone).parse();

            if (article) {
                console.log("TruthLens: Article parsed successfully.", article.title);
                sendResponse({
                    success: true,
                    data: {
                        title: article.title,
                        byline: article.byline,
                        content: article.textContent, // textContent is cleaner for AI analysis than 'content' (HTML)
                        // excerpt: article.excerpt,
                        url: window.location.href
                    }
                });
            } else {
                console.warn("TruthLens: Readability failed to identify an article.");
                sendResponse({ success: false, error: "No article found" });
            }

        } catch (e) {
            console.error("TruthLens: Parsing error:", e);
            sendResponse({ success: false, error: e.message });
        }
    }
    // Return true to indicate we wish to send a response asynchronously (if needed), 
    // though here we are synchronous.
    return true;
});
