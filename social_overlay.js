// social_overlay.js
// Inject "TruthLens" icons into social media feeds.

console.log("TruthLens Social Overlay loaded.");

// SVG Icon for the button
const LENS_ICON_SVG = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

function createLensButton(clickHandler) {
    const btn = document.createElement('div');
    btn.className = 'truthlens-btn';
    btn.innerHTML = LENS_ICON_SVG;
    btn.style.cursor = 'pointer';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.padding = '8px';
    btn.style.marginLeft = '8px';
    btn.style.color = '#1DA1F2'; // Default Twitter Blue-ish
    btn.title = "Verify with TruthLens";

    // Hover effect
    btn.onmouseover = () => btn.style.backgroundColor = 'rgba(29, 161, 242, 0.1)';
    btn.onmouseout = () => btn.style.backgroundColor = 'transparent';
    btn.style.borderRadius = '9999px';
    btn.style.transition = 'background-color 0.2s';

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clickHandler();
    });

    return btn;
}

function handleTwitter() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]:not([data-truthlens-processed])');

    tweets.forEach(tweet => {
        tweet.setAttribute('data-truthlens-processed', 'true');

        // Find the action bar (Reply, Retweet, Like, Share)
        const actionBar = tweet.querySelector('div[role="group"]');
        if (actionBar) {
            const btn = createLensButton(() => {
                // Extract text
                const textElement = tweet.querySelector('div[data-testid="tweetText"]');
                const text = textElement ? textElement.innerText : "";

                // Extract author
                const authorElement = tweet.querySelector('div[data-testid="User-Name"]');
                const author = authorElement ? authorElement.innerText : "Unknown";

                const content = `Tweet by ${author}:\n${text}`;

                saveData(content, "social_twitter");
            });

            // Append to action bar
            actionBar.appendChild(btn);
        }
    });
}

function handleWhatsApp() {
    // WhatsApp logic is tricker due to encryption/DOM structure, 
    // but we can look for message bubbles.
    const messages = document.querySelectorAll('div[data-testid^="msg-"]:not([data-truthlens-processed])');

    messages.forEach(msg => {
        msg.setAttribute('data-truthlens-processed', 'true');

        // Try to find the time/status container to inject next to
        const metaLocation = msg.querySelector('div[data-testid="msg-meta"]');

        if (metaLocation) {
            // WhatsApp is tight on space, so maybe a smaller icon or absolute position
            const btn = createLensButton(() => {
                const textSpan = msg.querySelector('span.selectable-text');
                const text = textSpan ? textSpan.innerText : "";
                if (text) {
                    saveData(text, "social_whatsapp");
                }
            });
            btn.style.padding = '4px';
            btn.style.width = '20px';
            btn.style.height = '20px';

            metaLocation.parentNode.insertBefore(btn, metaLocation);
        }
    });
}

function saveData(text, type) {
    if (!text) return;

    console.log("TruthLens: Saving Social Post", text);

    chrome.storage.local.set({
        "lastAnalysis": {
            type: "text", // Treat as text for now, or new type
            content: text,
            source: type,
            timestamp: Date.now()
        }
    }, () => {
        // Feedback
        chrome.runtime.sendMessage({ action: "SOCIAL_CAPTURED" });
        alert("TruthLens: Post Captured!");
    });
}

// Observer for infinite scroll
const observer = new MutationObserver((mutations) => {
    const isTwitter = window.location.hostname.includes('twitter.com') || window.location.hostname.includes('x.com');
    const isWhatsApp = window.location.hostname.includes('whatsapp.com');

    if (isTwitter) handleTwitter();
    if (isWhatsApp) handleWhatsApp();
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial run
setTimeout(() => {
    const isTwitter = window.location.hostname.includes('twitter.com') || window.location.hostname.includes('x.com');
    const isWhatsApp = window.location.hostname.includes('whatsapp.com');
    if (isTwitter) handleTwitter();
    if (isWhatsApp) handleWhatsApp();
}, 2000);
