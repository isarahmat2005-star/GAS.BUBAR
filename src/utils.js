export const MathRandom = Math.random;

export const formatImage = (base64Data, format) => {
    return new Promise((resolve) => {
        const img = new window.Image();
        img.src = `data:image/png;base64,${base64Data}`;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (format === 'jpg' || format === 'jpeg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0);
            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            // 1.0 (100% Quality) untuk JPG, sesuai mandat Microstock
            resolve(canvas.toDataURL(mimeType, format === 'jpg' ? 1.0 : 1.0));
        };
        img.onerror = () => resolve(`data:image/png;base64,${base64Data}`);
    });
};

export const dataUrlToBlob = (dataUrl) => {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
};

export const applyMicroTextureIllusion = (ctx, width, height) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const noiseIntensity = 4;

    for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const lumaMask = 1.0 - (Math.abs(luma - 128) / 128); 
        const noiseValue = (MathRandom() - 0.5) * noiseIntensity * lumaMask;

        data[i]     = Math.min(255, Math.max(0, data[i]     + noiseValue));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noiseValue * 0.75));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noiseValue * 0.85));
    }
    ctx.putImageData(imageData, 0, 0);
};

export const upscaleBlobUrl = async (blobUrl, resolution, format) => {
    if (resolution === 'Asli') return blobUrl;
    
    return new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => {
            const maxDim = Math.max(img.width, img.height);
            let targetMax = maxDim;
            if (resolution === '2K') targetMax = 2048;
            else if (resolution === '3K') targetMax = 2880;
            else if (resolution === '4K') targetMax = 3840;

            if (targetMax <= maxDim) {
                const passCanvas = document.createElement('canvas');
                passCanvas.width = img.width;
                passCanvas.height = img.height;
                const passCtx = passCanvas.getContext('2d');
                if (format === 'jpg') {
                    passCtx.fillStyle = '#FFFFFF';
                    passCtx.fillRect(0, 0, img.width, img.height);
                }
                passCtx.drawImage(img, 0, 0);
                passCanvas.toBlob((blob) => {
                    passCanvas.width = 0;
                    passCanvas.height = 0;
                    resolve(URL.createObjectURL(blob));
                }, format === 'jpg' ? 'image/jpeg' : 'image/png', format === 'jpg' ? 1.0 : 1.0);
                return;
            }

            let currentWidth = img.width;
            let currentHeight = img.height;
            let currentCanvas = document.createElement('canvas');
            currentCanvas.width = currentWidth;
            currentCanvas.height = currentHeight;
            let currentCtx = currentCanvas.getContext('2d');
            currentCtx.drawImage(img, 0, 0);

            const targetWidth = Math.round(img.width * (targetMax / maxDim));
            const targetHeight = Math.round(img.height * (targetMax / maxDim));

            while (currentWidth < targetWidth) {
                const stepScale = Math.min(2.0, targetWidth / currentWidth);
                const nextWidth = Math.round(currentWidth * stepScale);
                const nextHeight = Math.round(currentHeight * stepScale);

                if (nextWidth <= currentWidth) break; 

                const nextCanvas = document.createElement('canvas');
                nextCanvas.width = nextWidth;
                nextCanvas.height = nextHeight;
                const nextCtx = nextCanvas.getContext('2d');
                
                nextCtx.imageSmoothingEnabled = true;
                nextCtx.imageSmoothingQuality = 'high';
                nextCtx.drawImage(currentCanvas, 0, 0, nextWidth, nextHeight);

                currentCanvas.width = 0;
                currentCanvas.height = 0;

                currentCanvas = nextCanvas;
                currentWidth = nextWidth;
                currentHeight = nextHeight;
            }

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = currentWidth;
            finalCanvas.height = currentHeight;
            const ctx = finalCanvas.getContext('2d');

            if (format === 'jpg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
            }

            ctx.filter = 'blur(0.3px) brightness(101%) contrast(103%) saturate(107%)';
            ctx.drawImage(currentCanvas, 0, 0); 
            ctx.filter = 'none';

            currentCanvas.width = 0;
            currentCanvas.height = 0;

            const snapshotCanvas = document.createElement('canvas');
            snapshotCanvas.width = finalCanvas.width;
            snapshotCanvas.height = finalCanvas.height;
            const snapCtx = snapshotCanvas.getContext('2d');
            snapCtx.drawImage(finalCanvas, 0, 0);

            const sharpenRadius = resolution === '4K' ? 1.5 : resolution === '3K' ? 1.2 : 1.0;

            ctx.globalCompositeOperation = 'overlay';
            ctx.filter = `saturate(0%) blur(${sharpenRadius}px)`;
            ctx.globalAlpha = 0.28;
            ctx.drawImage(snapshotCanvas, 0, 0);

            ctx.globalCompositeOperation = 'soft-light';
            ctx.filter = `saturate(0%) blur(20px)`;
            ctx.globalAlpha = 0.12; 
            ctx.drawImage(snapshotCanvas, 0, 0);

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;
            ctx.filter = 'none';

            snapshotCanvas.width = 0;
            snapshotCanvas.height = 0;

            const noiseCanvas = document.createElement('canvas');
            noiseCanvas.width = finalCanvas.width;
            noiseCanvas.height = finalCanvas.height;
            const noiseCtx = noiseCanvas.getContext('2d', { willReadFrequently: true });
            noiseCtx.drawImage(finalCanvas, 0, 0);
            
            applyMicroTextureIllusion(noiseCtx, finalCanvas.width, finalCanvas.height);

            ctx.clearRect(0, 0, finalCanvas.width, finalCanvas.height);
            ctx.drawImage(noiseCanvas, 0, 0);

            noiseCanvas.width = 0;
            noiseCanvas.height = 0;

            finalCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                finalCanvas.width = 0;
                finalCanvas.height = 0;
                resolve(url);
            }, format === 'jpg' ? 'image/jpeg' : 'image/png', format === 'jpg' ? 1.0 : 1.0);
        };
        img.onerror = () => resolve(blobUrl);
        img.src = blobUrl;
    });
};

export const callGeminiApiViaProxy = (endpointPath, payload) => {
    return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(2, 15);
        
        const handleMessage = (event) => {
            const data = event.data;
            if (data && data.type === 'GEMINI_RESPONSE' && data.id === id) {
                window.removeEventListener('message', handleMessage);
                if (data.success) {
                    resolve(data.data);
                } else {
                    reject(new Error(data.error));
                }
            }
        };
        
        window.addEventListener('message', handleMessage);
        
        // Kirim tugas (pesan) ke Parent (Iframe Wrapper HTML)
        window.parent.postMessage({
            type: 'CALL_GEMINI',
            id: id,
            endpointPath: endpointPath,
            payload: payload
        }, '*');
    });
};
