document.addEventListener('DOMContentLoaded', () => {
    const captureSection = document.getElementById('captureSection');
    const captureContent = document.getElementById('captureContent');
    const captureLabel = document.getElementById('captureLabel');
    const analyzeCapturedBtn = document.getElementById('analyzeCapturedBtn');

    const manualLinkInput = document.getElementById('manualLinkInput');
    const analyzeManualBtn = document.getElementById('analyzeManualBtn');
    const statusMsg = document.getElementById('statusMsg');

    // 1. Check for stored data from Context Menu
    chrome.storage.local.get(['lastAnalysis'], (result) => {
        if (result.lastAnalysis) {
            const data = result.lastAnalysis;

            // Show the capture section
            captureSection.classList.remove('hidden');

            // Format display based on type
            if (data.type === 'text') {
                captureLabel.textContent = "SELECTED TEXT";
                captureContent.textContent = data.content;
            } else if (data.type === 'link') {
                captureLabel.textContent = "SELECTED LINK";
                captureContent.textContent = data.content;
            } else if (data.type === 'image') {
                captureLabel.textContent = "CAPTURED IMAGE";
                captureContent.innerHTML = ''; // Clear text
                const img = document.createElement('img');
                img.src = data.content;
                img.style.maxWidth = '100%';
                img.style.border = '1px solid #ddd';
                captureContent.appendChild(img);
            }

            // Clear the badge since we've seen it
            chrome.action.setBadgeText({ text: "" });
        }
    });

    // 2. Handle "Analyze This" (Captured Data)
    analyzeCapturedBtn.addEventListener('click', () => {
        // Placeholder for sending to backend
        simulateAnalysis(captureContent.textContent);
    });

    // 3. Handle "Analyze Link" (Manual Input)
    analyzeManualBtn.addEventListener('click', () => {
        const url = manualLinkInput.value.trim();
        if (url) {
            simulateAnalysis(url);
        }
    });

    // 4. Handle "Analyze Article on Page"
    const analyzeArticleBtn = document.getElementById('analyzeArticleBtn');
    if (analyzeArticleBtn) {
        analyzeArticleBtn.addEventListener('click', () => {
            statusMsg.style.display = 'block';
            statusMsg.textContent = "Extracting article...";

            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (!tabs[0]) return;

                chrome.tabs.sendMessage(tabs[0].id, { action: "PARSE_ARTICLE" }, function (response) {
                    if (chrome.runtime.lastError) {
                        statusMsg.textContent = "Error: Please reload the page.";
                        console.error(chrome.runtime.lastError);
                        return;
                    }

                    if (response && response.success) {
                        const article = response.data;
                        statusMsg.textContent = "Article Extracted!";

                        // Show it in the capture section
                        captureSection.classList.remove('hidden');
                        captureLabel.textContent = "EXTRACTED ARTICLE: " + (article.title.substring(0, 30) + "...");
                        captureContent.textContent = article.content.substring(0, 500) + "... [Truncated]";

                        // Automatically trigger analysis? Or let user click "Analyze This"?
                        // Let's just show it for now.
                    } else {
                        statusMsg.textContent = "Failed: " + (response ? response.error : "Unknown error");
                    }
                });
            });
        });
    }

    // 5. Handle "Smart Screenshot"
    const smartScreenshotBtn = document.getElementById('smartScreenshotBtn');
    if (smartScreenshotBtn) {
        smartScreenshotBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (!tabs[0]) return;

                // Inject the cropper script programmatically
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ['cropper.js']
                }, () => {
                    // Close the popup so the user can interact with the page
                    window.close();
                });
            });
        });
    }

    function simulateAnalysis(content) {
        statusMsg.style.display = 'block';
        statusMsg.textContent = "Analyzing with AI...";
        statusMsg.style.color = "#3498db"; // Blue

        // API Endpoint (Localhost for now)
        const API_URL = "http://localhost:8000/analyze";

        const payload = {
            text: content,
            source_url: window.location.href // This might be the popup URL, better if we passed the real URL
        };

        fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error("Server Error: " + response.status);
                }
                return response.json();
            })
            .then(data => {
                // successful response
                // Expected format: { "score": 85, "verdict": "Likely True", "reasoning": "..." }

                statusMsg.style.display = 'none'; // Hide "Analyzing..."

                // Show Result Section
                const resultDiv = document.createElement('div');
                resultDiv.className = 'section';
                resultDiv.style.borderLeft = data.score > 70 ? "5px solid #2ecc71" : "5px solid #e74c3c";

                resultDiv.innerHTML = `
                <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">
                    Verdict: ${data.verdict || "Analysis Complete"}
                </div>
                <div style="font-size: 14px; margin-bottom: 10px;">
                    Truth Score: <strong>${data.score || "N/A"}/100</strong>
                </div>
                <div style="font-size: 13px; color: #555; line-height: 1.4;">
                    ${data.reasoning || "No reasoning provided."}
                </div>
            `;

                // Insert after capture section
                captureSection.parentNode.insertBefore(resultDiv, captureSection.nextSibling);

            })
            .catch(error => {
                console.error("TruthLens Error:", error);
                statusMsg.textContent = "Connection Failed. Is the backend running at localhost:8000?";
                statusMsg.style.color = "#e74c3c"; // Red
            });
    }
});
