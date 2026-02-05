// Initialize Context Menus on Installation
chrome.runtime.onInstalled.addListener(() => {
  // Clear existing items to avoid duplicates during dev reload
  chrome.contextMenus.removeAll(() => {

    // 1. Context Menu for Selected Text
    chrome.contextMenus.create({
      id: "check_text",
      title: "TruthLens Check: \"%s\"",
      contexts: ["selection"]
    });

    // 2. Context Menu for Links
    chrome.contextMenus.create({
      id: "check_link",
      title: "TruthLens Check Link",
      contexts: ["link"]
    });

  });
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  let dataToStore = {};

  if (info.menuItemId === "check_text") {
    console.log("Selected Text:", info.selectionText);
    dataToStore = {
      type: "text",
      content: info.selectionText,
      timestamp: Date.now()
    };
  } else if (info.menuItemId === "check_link") {
    console.log("Selected Link:", info.linkUrl);
    dataToStore = {
      type: "link",
      content: info.linkUrl,
      timestamp: Date.now()
    };
  }

  // Store the data so the Popup can read it
  if (dataToStore.content) {
    chrome.storage.local.set({ "lastAnalysis": dataToStore }, () => {
      console.log("Data saved for analysis");
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
    });
  }
});

// Handle Messages (e.g., from Cropper)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_AND_CROP") {
    // 1. Capture the visible tab
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ success: false, error: "Capture failed" });
        return;
      }

      // 2. We have the full image. 
      // Since we are in a Service Worker, we can't use Canvas to crop easily.
      // We will send the full image back to the Content Script (sender.tab.id) to do the cropping.

      chrome.tabs.sendMessage(sender.tab.id, {
        action: "PERFORM_CROP",
        imageUrl: dataUrl,
        area: request.area
      });

      sendResponse({ success: true });
    });
    return true; // Async response
  }

  if (request.action === "SOCIAL_CAPTURED") {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#2ecc71" }); // Green for social?
  }

  // Handle Audio Capture for Video Verification
  if (request.action === "START_AUDIO_CAPTURE") {
    console.log("Starting Audio Capture...");

    // 1. Capture the tab audio stream
    chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
      if (chrome.runtime.lastError || !stream) {
        console.error("Capture failed:", chrome.runtime.lastError);
        sendResponse({ success: false, error: "Capture failed" });
        return;
      }

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
        sendAudioToBackend(audioBlob);
      };

      // Start recording
      mediaRecorder.start();

      // Stop after 15 seconds automatically (for now)
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 15000);

      sendResponse({ success: true, message: "Recording started (15s limit)" });
    });

    return true; // Async response
  }
});

function sendAudioToBackend(blob) {
  const formData = new FormData();
  formData.append("file", blob, "audio_capture.wav");

  console.log("Sending audio to backend...");

  fetch("http://localhost:8000/analyze-audio", {
    method: "POST",
    body: formData
  })
    .then(response => response.json())
    .then(data => {
      console.log("Audio Analysis Result:", data);

      // Store result to show in popup
      chrome.storage.local.set({ "lastAudioAnalysis": data }, () => {
        // Notify popup if open? Or just badge
        chrome.action.setBadgeText({ text: "AUDIO" });
        chrome.action.setBadgeBackgroundColor({ color: "#e67e22" });
      });
    })
    .catch(error => {
      console.error("Error sending audio:", error);
    });
}
