// cropper.js
// Handles the "Snipping Tool" overlay and logic.

(function () {
    if (window.truthLensCropperActive) return;
    window.truthLensCropperActive = true;

    // Create Overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.zIndex = '2147483647'; // Max Z-Index
    overlay.style.backgroundColor = 'rgba(0,0,0,0.3)';
    overlay.style.cursor = 'crosshair';
    document.body.appendChild(overlay);

    // Selection Box
    const selection = document.createElement('div');
    selection.style.border = '2px dashed #eee';
    selection.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    selection.style.position = 'fixed';
    selection.style.display = 'none';
    overlay.appendChild(selection);

    let startX, startY;
    let isDragging = false;

    const onMouseDown = (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        selection.style.left = startX + 'px';
        selection.style.top = startY + 'px';
        selection.style.width = '0px';
        selection.style.height = '0px';
        selection.style.display = 'block';
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const currentX = e.clientX;
        const currentY = e.clientY;

        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        const left = Math.min(currentX, startX);
        const top = Math.min(currentY, startY);

        selection.style.width = width + 'px';
        selection.style.height = height + 'px';
        selection.style.left = left + 'px';
        selection.style.top = top + 'px';
    };

    const onMouseUp = (e) => {
        isDragging = false;
        const rect = selection.getBoundingClientRect();

        // Remove listeners and UI
        cleanup();

        if (rect.width > 10 && rect.height > 10) {
            // Need to adjust for device pixel ratio for high-DPI screens
            const dpr = window.devicePixelRatio || 1;
            const cropArea = {
                x: rect.left * dpr,
                y: rect.top * dpr,
                width: rect.width * dpr,
                height: rect.height * dpr
            };

            console.log("TruthLens: Requesting Screenshot for Crop...", cropArea);

            // Send coordinates to background, which will capture tab and send back full image
            chrome.runtime.sendMessage({
                action: "CAPTURE_AND_CROP",
                area: cropArea
            });
        }

        window.truthLensCropperActive = false;
    };

    function cleanup() {
        overlay.removeEventListener('mousedown', onMouseDown);
        overlay.removeEventListener('mousemove', onMouseMove);
        overlay.removeEventListener('mouseup', onMouseUp);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);

    // Listener for the actual cropping (Phase 2 of the operation)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "PERFORM_CROP") {
            const { imageUrl, area } = request;

            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = area.width;
                canvas.height = area.height;
                const ctx = canvas.getContext('2d');

                // ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
                ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);

                const croppedDataUrl = canvas.toDataURL('image/png');

                // Save to storage
                chrome.storage.local.set({
                    "lastAnalysis": {
                        type: "image",
                        content: croppedDataUrl, // This could be large, storage.local has 5MB limit. Should be ok for snippets.
                        timestamp: Date.now()
                    }
                }, () => {
                    console.log("TruthLens: Image cropped and saved.");
                    // Provide feedback?
                    alert("Screenshot Captured! Open TruthLens to analyze.");
                });
            };
            img.src = imageUrl;
        }
    });

})();
