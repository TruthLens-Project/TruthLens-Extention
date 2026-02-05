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

    // 6. Handle "Verify Video Audio"
    const verifyAudioBtn = document.getElementById('verifyAudioBtn');
    if (verifyAudioBtn) {
        verifyAudioBtn.addEventListener('click', () => {
            statusMsg.style.display = 'block';
            statusMsg.textContent = "Requesting Audio Capture...";
            statusMsg.style.color = "#e67e22";

            // Direct Capture in Popup (requires popup to stay open)
            chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
                if (chrome.runtime.lastError || !stream) {
                    statusMsg.textContent = "Capture Failed: " + (chrome.runtime.lastError ? chrome.runtime.lastError.message : "No Stream");
                    return;
                }

                statusMsg.textContent = "Recording Audio (15s)... DO NOT CLOSE POPUP.";

                // 2. Record the stream
                const mediaRecorder = new MediaRecorder(stream);
                const audioChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    console.log("Recording stopped. Processing...");
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });

                    // Stop all tracks to release the stream
                    stream.getTracks().forEach(track => track.stop());

                    // Send to Backend
                    statusMsg.textContent = "Analyzing Audio... Please Wait.";
                    sendAudioToBackend(audioBlob);
                };

                // Start recording
                mediaRecorder.start();

                // Stop after 15 seconds automatically
                setTimeout(() => {
                    if (mediaRecorder.state === "recording") {
                        mediaRecorder.stop();
                    }
                }, 15000);
            });
        });
    }

    // 7. Handle "Manual Record"
    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const recordingStatus = document.getElementById('recordingStatus');
    const audioLog = document.getElementById('audioLog');

    let manualRecorder = null;
    let manualChunks = [];
    let manualStream = null;

    if (startRecordBtn && stopRecordBtn) {
        startRecordBtn.addEventListener('click', () => {
            statusMsg.style.display = 'block';
            statusMsg.textContent = "Initializing Recorder...";

            chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
                if (chrome.runtime.lastError || !stream) {
                    statusMsg.textContent = "Capture Failed: " + (chrome.runtime.lastError ? chrome.runtime.lastError.message : "No Stream");
                    return;
                }

                // FIX: Play the audio locally
                const audioCtx = new AudioContext();
                const source = audioCtx.createMediaStreamSource(stream);
                source.connect(audioCtx.destination);

                manualStream = stream;
                manualChunks = []; // Reset

                try {
                    manualRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
                } catch (e) {
                    statusMsg.textContent = "Recorder Init Failed: " + e.message;
                    return;
                }

                manualRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) manualChunks.push(e.data);
                };

                manualRecorder.onstop = () => {
                    // Combine into one big blob
                    const fullBlob = new Blob(manualChunks, { type: 'audio/webm;codecs=opus' });
                    console.log("Full Blob Size:", fullBlob.size);

                    if (fullBlob.size > 0) {
                        statusMsg.textContent = "Analyzing Full Audio...";
                        audioLog.innerHTML += `<div style="color: blue;">Analyzing ${Math.round(fullBlob.size / 1024)} KB...</div>`;
                        sendAudioToBackend(fullBlob);
                    } else {
                        statusMsg.textContent = "Recording was empty.";
                    }

                    // Stop tracks
                    if (manualStream) {
                        manualStream.getTracks().forEach(t => t.stop());
                    }
                };

                // Start
                manualRecorder.start();

                // UI Updates
                startRecordBtn.classList.add('hidden');
                stopRecordBtn.classList.remove('hidden');
                recordingStatus.classList.remove('hidden');
                statusMsg.textContent = "Recording Active... Listen to the claim.";
            });
        });

        stopRecordBtn.addEventListener('click', () => {
            if (manualRecorder && manualRecorder.state === "recording") {
                manualRecorder.stop();

                // UI Updates
                startRecordBtn.classList.remove('hidden');
                stopRecordBtn.classList.add('hidden');
                recordingStatus.classList.add('hidden');
            }
        });
    }

    function sendAudioToBackend(blob) {
        const formData = new FormData();
        formData.append("file", blob, "audio_capture.wav");

        fetch("http://localhost:8000/analyze-audio", {
            method: "POST",
            body: formData
        })
            .then(response => response.json())
            .then(data => {
                statusMsg.style.display = 'none';

                // Show Result
                const resultDiv = document.createElement('div');
                resultDiv.className = 'section';
                resultDiv.style.borderLeft = data.score > 70 ? "5px solid #2ecc71" : "5px solid #e74c3c";

                resultDiv.innerHTML = `
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px; color: #e67e22;">
                [AUDIO] Verdict: ${data.verdict || "Analysis Complete"}
            </div>
            <div style="font-size: 14px; margin-bottom: 10px;">
                Truth Score: <strong>${data.score || "N/A"}/100</strong>
            </div>
            <div style="font-size: 12px; margin-bottom: 10px; font-style: italic; color: #666;">
                Transcription: "${data.transcription_snippet || ""}..."
            </div>
            <div style="font-size: 13px; color: #555; line-height: 1.4;">
                ${data.reasoning || "No reasoning provided."}
            </div>
            `;

                // Insert after capture section
                captureSection.parentNode.insertBefore(resultDiv, captureSection.nextSibling);
            })
            .catch(error => {
                console.error("Error sending audio:", error);
                statusMsg.textContent = "Analysis Failed: " + error.message;
            });
    }

    // Check for Audio Analysis Result specifically
    chrome.storage.local.get(['lastAudioAnalysis'], (result) => {
        if (result.lastAudioAnalysis) {
            const data = result.lastAudioAnalysis;
            // Clear storage so we don't show it forever
            chrome.storage.local.remove(['lastAudioAnalysis']);

            chrome.action.setBadgeText({ text: "" });

            const resultDiv = document.createElement('div');
            resultDiv.className = 'section';
            resultDiv.style.borderLeft = data.score > 70 ? "5px solid #2ecc71" : "5px solid #e74c3c";

            resultDiv.innerHTML = `
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px; color: #e67e22;">
                [AUDIO] Verdict: ${data.verdict || "Analysis Complete"}
            </div>
            <div style="font-size: 14px; margin-bottom: 10px;">
                Truth Score: <strong>${data.score || "N/A"}/100</strong>
            </div>
            <div style="font-size: 12px; margin-bottom: 10px; font-style: italic; color: #666;">
                Transcription: "${data.transcription_snippet || ""}..."
            </div>
            <div style="font-size: 13px; color: #555; line-height: 1.4;">
                ${data.reasoning || "No reasoning provided."}
            </div>
            `;

            // Insert at top or specific place
            captureSection.parentNode.insertBefore(resultDiv, captureSection.nextSibling);
        }
    });

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
