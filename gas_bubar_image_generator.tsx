import React, { useState, useEffect, useRef } from 'react';

const R = Math.random;

const formatImage = (base64Data, format) => {
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
            resolve(canvas.toDataURL(mimeType, 1.0));
        };
        img.onerror = () => resolve(`data:image/png;base64,${base64Data}`);
    });
};

const dataUrlToBlob = (dataUrl) => {
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

const applyMicroTextureIllusion = (ctx, width, height) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const noiseIntensity = 4;

    for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const lumaMask = 1.0 - (Math.abs(luma - 128) / 128); 
        const noiseValue = (R() - 0.5) * noiseIntensity * lumaMask;

        data[i]     = Math.min(255, Math.max(0, data[i]     + noiseValue));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noiseValue * 0.75));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noiseValue * 0.85));
    }
    ctx.putImageData(imageData, 0, 0);
};

const upscaleBlobUrl = async (blobUrl, resolution, format) => {
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
                }, format === 'jpg' ? 'image/jpeg' : 'image/png', 1.0);
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
            }, format === 'jpg' ? 'image/jpeg' : 'image/png', 1.0);
        };
        img.onerror = () => resolve(blobUrl);
        img.src = blobUrl;
    });
};

const CustomSpinner = ({ className = "h-6 w-6 text-orange-500" }) => (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const BriefcaseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>;
const CoffeeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const XCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
const SparklesIcon = ({ className, style }) => <svg className={className} style={style} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>;
const Wand2Icon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>;
const PlayIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>;
const PauseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>;
const DownloadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const FileTextIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
const EyeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const ImageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const AlertTriangleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const ChevronDownIcon = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="6 9 12 15 18 9"/></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const CopyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>;
const UploadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>;

const CATEGORIES_TECH = [
    "None",
    "Mockup Green Screen", 
    "Mockup White Screen",
    "Mockup Black Screen", 
    "Polaroid Green Screen", 
    "Polaroid White Screen", 
    "Polaroid Black Screen", 
    "Koran Green Screen",
    "Koran White Screen",
    "Koran Black Screen", 
    "Objek dgn Latar Belakang Putih",
    "Objek dgn Latar Belakang Hijau",
    "Objek dgn Latar Belakang Hitam",
    "Template Background Hijau",
    "Template Background Putih",
    "Template Background Hitam",
    "Mockup papan kayu",
    "Balok kayu",
    "Kotak kardus",
    "Abstrak Flat Background"
];

const CATEGORIES_STYLE = [
    "None",
    "--- 1. Foto Realistis ---",
    "Light Leaks & Lens Flare",
    "Dust & Scratches",
    "Travel & Landscape",
    "Product & Flat Lay",
    "Food & Culinary (Gastronomy)",
    "Macro & Texture",
    "Aerial / Drone Photography",
    "Street Photography & Urban",
    "Architectural & Interior",
    "Industrial & Manufacturing",
    "Automotive & Transportation",
    "Astrophotography",
    "--- 2. Ilustrasi Vektor ---",
    "Flat Design",
    "Corporate Memphis (Alegria)",
    "Hand-Drawn / Doodle",
    "Pop Art / Comic Style",
    "Vintage Travel Poster & Stamp Style",
    "Abstract & Fluid Design",
    "Line Art / Monoline",
    "Isometric Vector",
    "Geometric",
    "Siluet (Silhouette)",
    "Stiker",
    "Pixel Art",
    "Artistic Travel-Style Vector",
    "Mascot & Character Design",
    "Lettering & Typography Vector",
    "--- 3. Gambar 3D ---",
    "3D Abstract Geometric & Textured Backgrounds",
    "Cutaway / Cross-Section 3D",
    "3D Typography / Lettering",
    "Product Commercial Rendering",
    "Medical & Scientific 3D",
    "3D Isometric Infographics",
    "Low Poly",
    "High Poly / Photorealistic",
    "Stylized",
    "Voxel Art",
    "3D Mockups",
    "Architectural Visualization (Archviz) & Interior 3D",
    "Cel Shading / Toon Shading",
    "Organic Modeling & Digital Sculpting",
    "Clay Render / Claymation Style",
    "3D Environment / Level Design",
    "Procedural / Fractal 3D",
    "--- 4. Pattern (Pola) ---",
    "Seamless Pattern",
    "Memphis Style Pattern",
    "Terrazzo",
    "Tribal / Ethnic",
    "Tartan / Plaid",
    "Polka Dot",
    "Argyle",
    "Camouflage (Camo)",
    "Floral & Botanical",
    "Gingham & Checkered",
    "Abstract Pattern",
    "Damask / Ornate",
    "Toile",
    "Houndstooth",
    "Paisley",
    "Chevron & Herringbone",
    "Animal Print",
    "Batik & Ikat",
    "Monogram Pattern",
    "--- 5. [Icon] ---",
    "Line / Stroke Icons",
    "Line / Stroke Icons (Putus-putus)",
    "Glyph Flat Vector Icon",
    "Duocolor Line Icons",
    "Filled Outline Vector",
    "Duotone Icons",
    "Vector Infographic Templates & Diagram UI",
    "Infographic Title Ribbons & UI Banners",
    "Glossy / Skeuomorphic UI Elements",
    "Flat Icons",
    "Hand-Drawn / Sketched Icons",
    "Gradient / Vibrant Icons",
    "Claymorphism",
    "Material Design / System Icons",
    "--- 6. [Logo] ---",
    "3D / Volumetric Logo",
    "Pictorial Mark / Brand Mark",
    "Emblem / Badge",
    "Minimalist / Line Art Logo",
    "Negative Space Logo",
    "Dynamic Logo",
    "Hand-Drawn / Artisan Logo",
    "--- 7. Tekstur & Overlays ---",
    "Grunge / Distressed",
    "Paper & Canvas Textures",
    "Shadow Overlay",
    "Plastic Wrap / Cellophane",
    "Smoke, Fog & Cloud",
    "Glass, Raindrops & Condensation",
    "Wood Grain & Timber",
    "Fabric & Textile",
    "--- 8. Sketsa Tradisional & Tinta ---",
    "Hatching & Cross-Hatching",
    "Stippling / Pointillism",
    "Graphite & Charcoal",
    "Ink Wash",
    "Scratchboard",
    "Continuous Line / Contour Drawing",
    "Scumbling / Scribbling",
    "Sanguine / Red Chalk",
    "Ballpoint Pen Art",
    "Woodcut / Linocut Style",
    "Sumi-e",
    "--- 9. Isolated Watercolor Elements ---",
    "Watercolor Swashes & Brush Strokes",
    "Watercolor Splashes & Splatters",
    "Watercolor Stains & Blobs",
    "Watercolor Cosmetic & Lifestyle Objects",
    "Watercolor Floral & Botanical Cuts",
    "--- 10. Lukisan Konvensional / Seni Halus ---",
    "Transparent Watercolor",
    "Gouache",
    "Impasto",
    "Alla Prima",
    "Plein Air",
    "Oil Painting",
    "Acrylic Painting",
    "Fresco",
    "Tempera (Egg Tempera)",
    "Encaustic (Hot Wax Painting)",
    "Sfumato",
    "Chiaroscuro / Tenebrism",
    "--- 11. Matte Painting & Photobashing ---",
    "Set Extension",
    "Sci-Fi & Cyberpunk Environments",
    "Post-Apocalyptic Ruins",
    "Fantasy World-Building",
    "Creature / Character Photobashing",
    "Double Exposure",
    "Historical & Period Environments",
    "Space & Cosmic Scapes",
    "Surrealism & Dreamscapes",
    "Vehicle & Hard-Surface Photobashing",
    "Underwater Worlds",
    "Natural Disasters & Extreme Weather",
    "2.5D Camera Projection (Camera Mapping)",
    "--- 12. Mockup Produk & Desain ---",
    "Printable Stationery & Digital Planner Pages",
    "PSD Mockup Templates",
    "Device & Technology Mockups",
    "Apparel & Fashion Mockups",
    "Packaging Mockups",
    "Print & Editorial Mockups",
    "Branding / Stationery Kits",
    "Signage & Outdoor Mockups",
    "Home Decor & Wall Art Mockups",
    "Vehicle & Car Wrap Mockups",
    "Merchandise & Promotional Mockups",
    "Event & Exhibition Mockups",
    "Textile & Fabric Mockups",
    "UI/UX & Web Presentation Mockups",
    "--- 13. Background Design ---",
    "Islamic Background & Certificate Templates",
    "Decorative Corner Borders & Oriental Ornaments",
    "Mesh Gradient",
    "Holographic / Iridescent",
    "Soft Pastel Gradients",
    "Liquid / Fluid Waves",
    "Glassmorphism Background",
    "Abstract 3D Shapes",
    "Low Poly Background",
    "Particle & Network Nodes",
    "Cyber Grid / Wireframe",
    "Paper & Cardboard Texture",
    "Marble & Stone Texture",
    "Foil & Metallic Texture",
    "Studio Podium / Pedestal",
    "Soft Grain / Noise Surface",
    "Neumorphic Surface",
    "Micro-Patterns / Dotted",
    "Halftone Waves",
    "Geometric Abstract Background",
    "Grunge & Paint Strokes Abstract",
    "Light Trails & Bokeh"
];

const STYLE_DESCRIPTIONS = {
    // 1. Foto Realistis
    "Light Leaks & Lens Flare": "Pendaran cahaya bocor (biasanya bernuansa merah, oranye, atau pelangi) dan silau lensa kamera. Digunakan untuk menciptakan nuansa emosional, hangat, atau sinematik ala film analog.",
    "Dust & Scratches": "Lapisan transparan berisi bintik-bintik debu dan goresan halus untuk menciptakan estetika rekaman seluloid zaman dahulu atau foto lama.",
    "Travel & Landscape": "Menangkap lanskap alam, pemandangan kota (cityscape), atau situs budaya. Sering kali mengandalkan pencahayaan dramatis seperti golden hour atau cuaca ekstrem untuk estetika maksimal.",
    "Product & Flat Lay": "Sudut pandang top-down (dari atas) pada sekumpulan objek yang disusun rapi secara estetis, atau foto makro dari sebuah produk dengan pencahayaan studio yang tajam. STRICT MANDATE: Buat tampilan polosan murni tanpa tambahan label teks, tulisan, angka, atau embel-embel merk brand (no branding, no labels).",
    "Food & Culinary (Gastronomy)": "Foto makanan yang menggunakan trik penataan gaya (food styling) untuk membuatnya tampak sangat menggiurkan, sering kali menangkap momen aksi seperti tetesan sirup, uap panas, atau cipratan air.",
    "Macro & Texture": "Pengambilan gambar dari jarak sangat dekat yang memperlihatkan detail yang tidak terlihat oleh mata telanjang, seperti serat kain, butiran pasir, embun di daun, atau tekstur kulit.",
    "Aerial / Drone Photography": "Foto yang diambil dari udara (bird's-eye view), sangat efektif untuk memperlihatkan skala, pola geometris dari tata kota, kelok jalan, atau ombak di pantai.",
    "Street Photography & Urban": "Menangkap momen spontan di ruang publik, bermain dengan bayangan gedung, pantulan genangan air, atau dinamika kehidupan jalanan di kota besar.",
    "Architectural & Interior": "Fokus pada desain bangunan, garis simetris, struktur ruangan, and bagaimana cahaya alami mengisi sebuah ruangan. Sangat bergantung pada presisi dan nol distorsi perspektif.",
    "Industrial & Manufacturing": "Menyoroti lingkungan pabrik, pekerja konstruksi, alat berat, proses manufaktur, dan energi.",
    "Automotive & Transportation": "Fokus pada estetika kendaraan bermotor (mobil, motor), pesawat terbang, kapal, dan sistem transportasi.",
    "Astrophotography": "Fotografi yang berfokus pada objek langit malam, bintang, galaksi, dan fenomena astronomi.",
    
    // 2. Ilustrasi Vektor
    "One-Line Art": "Minimalist continuous one-line drawing, single unbroken black line, pure black line art, simple monoline outline, elegant thin black stroke, consistent line weight, strictly no fills, strictly no colors, strictly no shading, clean minimalist vector paths, flat 2D look, no shadows, no lighting.",
    "Flat Design": "Gaya minimalis dengan warna solid tanpa bayangan atau gradien kompleks, sangat efisien untuk desain antarmuka dan infografis.",
    "Corporate Memphis (Alegria)": "Gaya ilustrasi karakter yang sangat mendominasi desain UI/UX dan web modern. Ciri khasnya adalah karakter dengan proporsi tubuh yang dilebih-lebihkan (misal: lengan/kaki sangat besar, kepala kecil) dan warna-warna cerah.",
    "Hand-Drawn / Doodle": "Vektor yang sengaja direkayasa agar terlihat seperti coretan tangan kasar menggunakan pena atau kuas digital, memberikan kesan organik dan ramah.",
    "Pop Art / Comic Style": "Menggunakan titik-titik halftone, garis luar yang tebal, dan warna primer yang mencolok ala buku komik retro.",
    "Vintage Travel Poster & Stamp Style": "Gaya retro klasik yang meniru estetika poster perjalanan zaman dulu atau desain perangko vintage, biasanya menggunakan palet warna pudar dan tekstur khas.",
    "Abstract & Fluid Design": "Komposisi vektor yang mengandalkan bentuk-bentuk organik, melengkung (liquid/fluid), dan abstrak. Sangat umum digunakan untuk background website atau aset presentasi.",
    "Line Art / Monoline": "Style: Monoline Vector. Minimalist continuous one-line drawing, single unbroken black line, pure black line art, simple monoline outline, elegant thin black stroke, consistent line weight. ABSOLUTELY NO SHADOWS, ZERO LIGHTING, NO 3D EFFECTS. Flat 2D vector graphic. Strictly no fills, strictly no colors, strictly no shading, clean minimalist vector paths, perfectly flat look. Isolated on a flat pure solid white background.", 
    "Isometric Vector": "Penggambaran elemen 2D dengan sudut pandang miring (biasanya 30 derajat) untuk menciptakan ilusi ruang tiga dimensi tanpa perspektif yang mengecil.",
    "Geometric": "Karya visual yang murni dibangun dari perpaduan bentuk-bentuk dasar seperti lingkaran, persegi, dan segitiga untuk hasil yang presisi.",
    "Siluet (Silhouette)": "Fokus pada garis luar objek dengan warna solid (biasanya hitam atau monokrom), sangat efisien untuk aset ikonografi dan desain potong (die-cut).",
    "Stiker": "Seni digital bergaya stiker adalah karya visual fungsional yang dirancang khusus dengan mengutamakan siluet yang sangat jelas. Karakteristik utamanya adalah keberadaan garis batas tepi yang tegas (die-cut border—umumnya berupa garis luar putih tebal) yang mengelilingi keseluruhan bentuk objek, sehingga gambar tersebut terpisah secara absolut dari latar belakangnya.",
    "Pixel Art": "Classic 8-bit pixel art style, retro video game aesthetic, sharp square pixels, limited vibrant color palette, crisp edges, simplified shapes, nostalgic digital art, no soft lighting or gradients.",
    "Artistic Travel-Style Vector": "Ilustrasi pemandangan atau destinasi wisata dengan pendekatan sapuan digital yang lebih artistik dan ekspresif dibandingkan flat design konvensional.",
    "Mascot & Character Design": "Ilustrasi vektor yang berfokus khusus pada pembuatan karakter maskot untuk branding produk, logo e-sports, atau kampanye pemasaran.",
    "Lettering & Typography Vector": "Fokus pada seni tata huruf yang digambar dan diolah secara manual (custom), bukan sekadar mengetik menggunakan font yang sudah ada.",
    
    // 3. Gambar 3D
    "3D Abstract Geometric & Textured Backgrounds": "Kumpulan gambar 3D Rendered Environments berupa 3D Layered & Textured Backgrounds. Permainan kedalaman ruang (depth) melalui tumpukan bentuk geometris (kartu melingkar, heksagon, bola) yang saling overlapping. Pencahayaan studio sangat realistis menciptakan bayangan jatuh (soft drop shadows) serta penekanan pada material fisik nyata seperti tekstur serat kayu (wood grain), plastik matte berpori kasar, dan cahaya neon di sela-sela objek (backlighting).",
    "Cutaway / Cross-Section 3D": "Gaya gambar 3D yang memotong sebagian objek (seperti membelah mesin mobil, pesawat, atau gedung) untuk memperlihatkan struktur mekanis dan komponen rumit di bagian dalamnya.",
    "3D Typography / Lettering": "Seni merancang teks dan huruf dalam ruang 3 dimensi. Sering menggunakan material unik seperti kaca, logam, atau neon untuk tajuk utama atau poster.",
    "Product Commercial Rendering": "Ini adalah render produk akhir yang sangat detail (seperti jam tangan mewah, elektronik, kosmetik) dengan pencahayaan studio khusus untuk iklan high-end. STRICT MANDATE: Buat tampilan produk polosan murni tanpa penambahan teks, huruf, angka, atau embel-embel merk brand (strictly no branding, no text labels).",
    "Medical & Scientific 3D": "Render yang berfokus pada visualisasi mikroskopis, sel, molekul, virus, atau anatomi internal tubuh manusia untuk keperluan edukasi dan medis.",
    "3D Isometric Infographics": "Render 3D dengan sudut pandang isometrik untuk menyajikan visualisasi data, struktur bangunan, atau alur kerja yang profesional, estetis, dan rapi.",
    "Low Poly": "Model 3D yang sengaja menggunakan jumlah poligon sangat sedikit, menghasilkan permukaan bersudut tajam yang memberikan kesan artistik dan indie.",
    "High Poly / Photorealistic": "Model 3D dengan jutaan poligon dan tekstur material yang sangat akurat untuk menghasilkan gambar akhir yang sulit dibedakan dari foto asli.",
    "Stylized": "Model 3D yang proporsi dan teksturnya sengaja diubah menjadi lebih ekspresif atau bergaya kartun (seperti aset film animasi).",
    "Voxel Art": "Seni 3D yang dibangun menggunakan blok-blok kubus (volumetric pixels), menghasilkan estetika ruang yang menyerupai permainan retro.",
    "3D Mockups": "Render ruang, podium, atau objek kosong (seperti layar smartphone, kemasan produk, botol kosmetik) yang siap disisipi desain, sangat krusial untuk presentasi produk.",
    "Architectural Visualization (Archviz) & Interior 3D": "Visualisasi realistis dari eksterior bangunan, desain interior, tata ruang, atau lanskap properti yang belum dibangun.",
    "Cel Shading / Toon Shading": "Gaya render 3D yang sengaja dimanipulasi agar terlihat seperti gambar 2D, komik, atau anime. Ciri khasnya adalah warna yang datar dan garis tepi (outline) yang tegas.",
    "Organic Modeling & Digital Sculpting": "Berbeda dengan Hard Surface, ini adalah teknik mematung digital yang berfokus pada bentuk-bentuk organik yang kompleks, seperti anatomi manusia, makhluk fantasi (monster), hewan, dan flora dengan detail tinggi (biasanya menggunakan software seperti ZBrush).",
    "Clay Render / Claymation Style": "Gaya render 3D yang meniru tekstur dan pencahayaan tanah liat (clay) atau plastisin. Sering memberikan kesan lucu, hangat, atau estetika animasi stop-motion.",
    "3D Environment / Level Design": "Berfokus pada penciptaan latar belakang, pemandangan alam (lanskap), hutan, atau tata kota yang luas secara keseluruhan, bukan sekadar satu objek tunggal.",
    "Procedural / Fractal 3D": "Gambar 3D yang dihasilkan secara otomatis melalui rumus matematika, node, atau algoritma prosedural. Sering menghasilkan pola fraktal yang rumit, tak terbatas, atau struktur sci-fi yang sangat kompleks.",
    
    // 4. Pattern (Pola)
    "Seamless Pattern": "Pola yang didesain agar sisi kiri menyambung ke kanan, dan atas ke bawah tanpa terlihat garis batas patahannya (esensial untuk background dan tekstil).",
    "Memphis Style Pattern": "Pola era 80-an yang menggunakan warna-warna kontras tinggi dan perpaduan bentuk geometris acak seperti coretan zigzag, segitiga, dan polkadot.",
    "Terrazzo": "Meniru tekstur lantai terrazzo dengan serpihan-serpihan asimetris berbagai ukuran dan warna yang tersebar di atas warna dasar solid.",
    "Tribal / Ethnic": "Pola yang terinspirasi dari motif tenun tradisional berbagai budaya yang kaya akan pengulangan bentuk geometris spesifik.",
    "Tartan / Plaid": "Pola kotak-kotak persilangan garis vertikal dan horizontal dengan ketebalan dan warna bervariasi, identik dengan kain flanel.",
    "Polka Dot": "Pola sederhana dan timeless berupa lingkaran-lingkaran padat berukuran sama yang disusun berulang dengan jarak yang konsisten.",
    "Argyle": "Pola yang terdiri dari susunan bentuk intan (berlian/belah ketupat) yang saling tumpang tindih, biasanya dilengkapi dengan garis-garis diagonal (stripes tipis) di atasnya. Identik dengan pakaian rajut dan gaya preppy.",
    "Camouflage (Camo)": "Pola loreng organik tak beraturan yang awalnya dirancang untuk keperluan kamuflase militer, namun kini banyak diadaptasi untuk desain streetwear.",
    "Floral & Botanical": "Pola organik yang terdiri dari elemen-elemen alam seperti bunga, dedaunan, dan cabang pohon.",
    "Gingham & Checkered": "Gingham adalah pola persilangan garis warna dan putih yang menciptakan kotak-kotak dengan gradasi transparansi (khas taplak meja piknik). Sementara Checkered adalah pola kotak-kotak padat bergantian warna seperti papan catur. STRICT MANDATE: Pola murni, strictly no human figures, no people.",
    "Abstract Pattern": "Pola bebas yang tidak menggambarkan objek nyata secara langsung, sering menggunakan bentuk fluid atau perpaduan warna yang ekspresif.",
    "Damask / Ornate": "Pola dekoratif tradisional yang sangat rumit, elegan, dan simetris, sering dikaitkan dengan estetika vintage yang mewah.",
    "Toile": "Pola klasik (biasanya satu warna gelap di atas latar terang) yang menggambarkan ilustrasi pemandangan pastoral, flora, atau kehidupan pedesaan bergaya lukisan Eropa klasik.",
    "Houndstooth": "Pola kotak-kotak abstrak dua warna (umumnya hitam dan putih) dengan tepi bergerigi yang bentuknya menyerupai gigi anjing. Sangat klasik dan sering digunakan dalam industri fashion.",
    "Paisley": "Pola ornamental klasik yang bentuk dasarnya menyerupai tetesan air melengkung (seperti ginjal atau daun), dipenuhi dengan ornamen rumit. Berakar dari desain tradisional Persia dan India.",
    "Chevron & Herringbone": "Keduanya adalah pola zig-zag. Chevron adalah zig-zag mulus berkelanjutan (berbentuk huruf V), sedangkan Herringbone tersusun dari balok-balok miring yang saling memotong menyerupai susunan tulang ikan.",
    "Animal Print": "Pola organik yang secara spesifik meniru corak alami kulit atau bulu hewan, seperti macan tutul (leopard), zebra, harimau, atau sisik ular.",
    "Batik & Ikat": "Pola tradisional berbasis teknik pewarnaan kain (sangat populer di Indonesia). Batik sering menggunakan motif flora/fauna yang distilisasi, sedangkan Ikat memiliki ciri khas tepian motif yang agak kabur/bergerigi (feathered).",
    "Monogram Pattern": "Pola yang disusun dari pengulangan inisial huruf, lambang, atau logo sebuah brand. Sangat sering ditemukan pada desain fesyen mewah (luxury brands).",

    // 5. [Icon]
    "Line / Stroke Icons": "Bold thick black line art icon, minimalist ui icon style, uniform heavy stroke weight, rounded caps and joins, perfectly flat, strictly no fills, solid pure black outline only, simple geometric shapes, no shading, clean white background",
    "Line / Stroke Icons (Putus-putus)": "Bold dashed line art icon, dotted stroke outline, minimalist ui icon style, uniform heavy dashed stroke weight, rounded caps, perfectly flat, strictly no fills, solid pure black dashed outline only, strictly no continuous solid lines, simple geometric shapes, no shading, clean white background.",
    "Glyph Flat Vector Icon": "glyph flat vector icon of [objek], solid black fill, strictly no outlines, minimalist ui icon style, perfectly flat 2D vector design, clean edges, strictly no gradients, strictly no shadows, pure white background, perfectly centered, isolated.",
    "Duocolor Line Icons": "Two-tone duocolor minimalist line art icon, strictly uniform stroke weight, rounded caps and joins, exactly two colors used (one main, one accent), strictly no solid color fills, purely empty transparent interiors inside the strokes, flat 2D vector, pure solid white background.",
    "Filled Outline Vector": "Cartoonish filled outline vector illustration, solid flat vibrant colors inside, surrounded by bold thick black outlines, no gradients, flat 2D style.",
    "Duotone Icons": "Menggunakan perpaduan dua warna kontras (biasanya warna utama dan warna dengan opasitas rendah) untuk memberikan dimensi ekstra tanpa terlihat rumit.",
    "Vector Infographic Templates & Diagram UI": "Aset vektor murni (flat design) khusus visualisasi data/alur kerja (mind map, list, diagram). MUTLAK HARUS ADA: ruang kosong (placeholder) berupa lingkaran berangka (01, 02) atau bidang teks kosong. STRICTLY BLANK TEXT PLACEHOLDERS. NO actual readable words, only placeholder lines and numbered circles. Flat vector graphic, clean layout.",
    "Infographic Title Ribbons & UI Banners": "Vector flat design banner ribbons, lower thirds UI elements, numbered circles on the edge, strict empty blank space inside the ribbon for text placement, strictly no actual text.",
    "Glossy / Skeuomorphic UI Elements": "Web 2.0 aesthetic, heavy Skeuomorphism UI element, glossy 3D plastic/glass effect, heavy inner glow, drop shadows, highly polished reflective surface.",
    "Flat Icons": "Gaya desain ikon dua dimensi yang sangat minimalis, menggunakan warna solid tanpa efek bayangan, gradien, atau tekstur.",
    "Hand-Drawn / Sketched Icons": "Ikon bergaya coretan tangan manual atau doodle. Memberikan kesan organik, kasual, tidak kaku, dan lebih personal.",
    "Gradient / Vibrant Icons": "Ikon berbasis vektor datar namun memanfaatkan transisi gradien warna cerah yang mencolok untuk memberikan kesan modern, kedalaman, dan dinamis.",
    "Claymorphism": "Tren turunan dari 3D UI di mana elemen dan ikon dibuat seolah-olah terbuat dari tanah liat (clay) yang lembut, mengembang (fluffy), dengan sudut membulat dan pencahayaan pastel.",
    "Material Design / System Icons": "Ikon berpedoman ketat berbasis grid (seperti sistem ikon dari Google atau Apple) yang dirancang murni untuk fungsionalitas, keterbacaan maksimal, dan konsistensi antarmuka OS.",

    // 6. [Logo]
    "3D / Volumetric Logo": "Logo ilusi ruang 3 dimensi (Web3/Tech style). Pencahayaan realistis, gradien, tanpa detail mikroskopis kotor. STRICTLY NO TEXT.",
    "Pictorial Mark / Brand Mark": "Logo berupa ikon atau simbol grafis yang mewakili objek spesifik secara harfiah. STRICTLY NO TEXT, NO GIBBERISH. Blank copy space only. Flat vector graphic style, highly scalable, clean lines.",
    "Emblem / Badge": "Simbol di dalam bingkai lencana atau stempel vintage. STRICTLY BLANK TEXT AREA (empty ribbons/banners for placeholder). NO REAL TEXT, NO GIBBERISH LETTERS.",
    "Minimalist / Line Art Logo": "Logo modern murni dari ketebalan garis seragam (monoline) tanpa pewarnaan solid. STRICTLY NO TEXT. Elegant thin strokes, flat 2D style, scalable.",
    "Negative Space Logo": "Desain siluet cerdas menggunakan area kosong (latar belakang) untuk makna ganda. STRICTLY NO TEXT. Pure 2D graphic, flat vector, clever design.",
    "Dynamic Logo": "Logo adaptif/dinamis dengan kerangka dasar konsisten namun variasi interior. STRICTLY NO TEXT. Clean vector concept.",
    "Hand-Drawn / Artisan Logo": "Gaya coretan tangan manual/artisan. STRICTLY BLANK TEXT AREA. Organic, rough edges, authentic craft feel, no gibberish.",

    // 7. Tekstur & Overlays
    "Grunge / Distressed": "Efek permukaan kotor, berkarat, terkelupas, atau tergores. Memberikan karakter tangguh, vintage, atau gaya desain jalanan (streetwear).",
    "Paper & Canvas Textures": "Hasil pindaian resolusi tinggi dari kertas kusut, kertas daur ulang, sobekan kardus, atau serat kanvas lukis untuk memberikan nuansa analog pada desain digital.",
    "Shadow Overlay": "Soft diffused shadow overlay with gentle transparency, subtle light-grey cast shadow, minimal aesthetic, shadow cast from an invisible source, strictly solid pure white background, high-key lighting, overexposed background for absolute white effect, no object visible, just the shadow texture on the floor.",
    "Plastic Wrap / Cellophane": "Tekstur yang meniru pantulan cahaya dan kerutan dari pembungkus plastik bening, sangat populer untuk mockup kemasan, poster, atau sampul album musik.",
    "Smoke, Fog & Cloud": "Overlay berbasis partikel asap, kabut tebal, atau awan transparan untuk menciptakan kedalaman atmosfer atau nuansa misterius pada komposisi.",
    "Glass, Raindrops & Condensation": "Overlay efek kaca berembun, kaca pecah (shattered glass), atau tetesan air hujan pada lensa/jendela.",
    "Wood Grain & Timber": "Tekstur organik dari serat-serat alami kayu, mulai dari kayu ek (oak) yang bersih hingga kayu lapuk yang kasar.",
    "Fabric & Textile": "Tekstur jalinan benang atau kain, seperti rajutan sweater, serat linen, denim, atau kanvas kasar.",

    // 8. Sketsa Tradisional & Tinta
    "Hatching & Cross-Hatching": "Teknik yang menggunakan kumpulan garis sejajar atau saling menyilang rapat. Semakin rapat garisnya, semakin gelap bayangan yang dihasilkan. Sangat identik dengan ilustrasi buku klasik atau komik retro.",
    "Stippling / Pointillism": "Membangun bentuk, bayangan, dan tekstur murni hanya menggunakan jutaan titik kecil dari pena tinta. Membutuhkan presisi tinggi dan menghasilkan gradasi yang sangat bertekstur.",
    "Graphite & Charcoal": "Menggunakan pensil grafit atau batang arang untuk menghasilkan transisi bayangan yang sangat mulus (sering diusap/diblending). Arang memberikan warna hitam yang sangat pekat, ideal untuk potret chiaroscuro (kontras cahaya gelap-terang yang dramatis).",
    "Ink Wash": "Kombinasi garis pena tinta yang tegas dengan sapuan kuas basah (tinta yang diencerkan dengan air). Menghasilkan gradasi abu-abu seperti cat air, sering ditemukan pada lukisan sumi-e (gaya Asia Timur) atau sketsa arsitektur cepat.",
    "Scratchboard": "Teknik menggambar terbalik (negatif) di mana seniman menggoreskan pisau khusus di atas papan yang sudah dilapisi tinta hitam secara penuh untuk memunculkan lapisan putih di bawahnya.",
    "Continuous Line / Contour Drawing": "Teknik menggambar menggunakan satu garis lurus yang tak pernah terputus dari awal hingga akhir.",
    "Scumbling / Scribbling": "Teknik membangun volume, bayangan, atau tekstur menggunakan coretan-coretan melingkar, berantakan, atau acak yang saling menumpuk.",
    "Sanguine / Red Chalk": "Sketsa klasik bergaya Renaisans yang menggunakan kapur atau pensil berwarna merah kecokelatan (terra cotta).",
    "Ballpoint Pen Art": "Teknik sketsa tingkat lanjut (seringkali fotorealistik atau sangat mendetail) yang murni menggunakan tinta pulpen biasa.",
    "Woodcut / Linocut Style": "Gaya sketsa tinta hitam putih dengan kontras tinggi dan garis-garis tajam yang meniru hasil cetakan cukilan kayu kuno.",
    "Sumi-e": "Seni lukis kuas dan tinta hitam tradisional Asia Timur yang mengutamakan keluwesan sapuan tunggal yang minimalis dan ekspresif.",

    // 9. Isolated Watercolor Elements
    "Watercolor Swashes & Brush Strokes": "Elemen berupa sapuan kuas tebal, goresan memanjang, atau pita warna (ribbon). Karakteristik utamanya adalah tekstur bulu kuas yang terlihat jelas pada bagian ujung atau tepi sapuannya.",
    "Watercolor Splashes & Splatters": "Cipratan cat yang tidak beraturan, dinamis, dan menyebar. Tepi objeknya dipenuhi tetesan-tetesan kecil (droplets).",
    "Watercolor Stains & Blobs": "Noda atau bercak dengan bentuk yang lebih membulat, tenang, dan terkumpul (seperti noda dari pantat gelas kopi yang basah atau tetesan air tebal yang mengering perlahan).",
    "Watercolor Cosmetic & Lifestyle Objects": "Objek fisik dunia nyata (seperti noda lipstik kemerahan yang smudged, atau sikat maskara dengan cipratan hitam) diilustrasikan murni menggunakan gaya sapuan cat air yang fluid dan organik.",
    "Watercolor Floral & Botanical Cuts": "Ilustrasi satuan dari kelopak bunga, tangkai daun, atau ranting kering. Dipisah-pisah menjadi elemen individual.",

    // 10. Lukisan Konvensional / Seni Halus
    "Transparent Watercolor": "Teknik cat air (aquarelle) klasik di mana cat diencerkan untuk menciptakan lapisan warna tembus pandang (wash). Bagian yang putih atau terang biasanya dibiarkan kosong agar warna asli kertas terlihat. Memiliki kesan ringan, dreamy, dan mengalir.",
    "Gouache": "Medium berbasis air namun bersifat opaque (tidak tembus pandang/menutup). Menghasilkan warna solid, pekat, dan hasil akhir matte (tidak mengkilap). Sangat populer di kalangan ilustrator komersial dan desain poster karena warnanya yang tegas.",
    "Impasto": "Teknik di mana cat minyak atau akrilik diaplikasikan dengan sangat tebal, sering kali menggunakan pisau palet (palette knife). Jejak sapuan bertekstur secara fisik dan timbul dari kanvas. (Gaya khas Vincent van Gogh).",
    "Alla Prima": "Teknik lukisan cat minyak kilat di mana cat basah langsung ditumpuk di atas cat basah lainnya sebelum lapisan bawahnya mengering. Menghasilkan percampuran warna yang organik dan sapuan kuas yang spontan.",
    "Plein Air": "Berfokus pada subjek pemandangan alam yang dilukis secara langsung di luar ruangan. Menitikberatkan pada penangkapan cahaya alami, bayangan, dan atmosfer pada waktu tertentu secara akurat.",
    "Oil Painting": "Medium lukis klasik paling fundamental. Mengering dengan lambat, sehingga memungkinkan transisi warna (blending) yang sangat halus dan realistis.",
    "Acrylic Painting": "Medium modern berbasis polimer air. Cepat kering, serbaguna, dan sering digunakan untuk lukisan dengan warna-warna solid, vibrant, atau gaya kontemporer.",
    "Fresco": "Teknik melukis mural klasik di mana pigmen air diaplikasikan langsung ke atas plester dinding atau langit-langit yang masih basah.",
    "Tempera (Egg Tempera)": "Teknik kuno dari abad pertengahan yang menggunakan kuning telur sebagai zat pengikat pigmen warna. Menghasilkan warna yang awet dan cepat kering.",
    "Encaustic (Hot Wax Painting)": "Teknik melukis kuno menggunakan lilin lebah yang dipanaskan dan dicampur dengan pigmen warna, menghasilkan tekstur permukaan yang unik dan mengkilap.",
    "Sfumato": "Teknik blending tingkat tinggi untuk melembutkan transisi antara warna dan bayangan secara perlahan agar menyatu seperti asap, tanpa garis batas tegas (khas karya Leonardo da Vinci).",
    "Chiaroscuro / Tenebrism": "Gaya seni lukis yang menonjolkan pencahayaan dramatis dengan kontras ekstrem antara cahaya terang (fokus) dan bayangan gelap gulita di sekelilingnya.",

    // 11. Matte Painting & Photobashing
    "Set Extension": "Penciptaan latar belakang yang diperuntukkan bagi komposisi film atau VFX. Digunakan untuk menyambung atau memperluas set fisik di dunia nyata (misalnya: menambahkan pegunungan raksasa di belakang rekaman aktor di studio).",
    "Sci-Fi & Cyberpunk Environments": "Penggabungan tekstur foto benda-benda keras (papan sirkuit, logam industri, lampu neon, gedung pencakar langit) yang dimanipulasi perspektifnya untuk membangun desain kota masa depan atau pesawat luar aquasa.",
    "Post-Apocalyptic Ruins": "Manipulasi foto yang menumpuk elemen kehancuran (seperti karat, kaca pecah, jalanan retak, dan tanaman merambat liar) ke atas foto lanskap atau bangunan kota modern yang utuh.",
    "Fantasy World-Building": "Membangun lanskap kerajaan fiktif atau kastil dengan cara memotong foto-foto arsitektur kuno (gothic/klasik), tebing batu asli, dan awan dramatis, kemudian dilukis ulang pencahayaannya agar terlihat berada dalam satu dunia yang sama.",
    "Creature / Character Photobashing": "Menciptakan konsep monster atau zirah karakter dengan menempelkan tekstur foto kulit reptil asli, bulu binatang, atau potongan mesin ke sketsa anatomi dasar.",
    "Double Exposure": "Artistic double exposure style, silhouette of the main object blended with a secondary nature or abstract scene, dreamlike overlapping images, high contrast, elegant transparency, creative surrealism.",
    "Historical & Period Environments": "Rekonstruksi lanskap peradaban kuno, kota abad pertengahan, atau era historis tertentu yang menuntut akurasi arsitektur masa lalu.",
    "Space & Cosmic Scapes": "Pemandangan kosmik berskala masif yang murni menampilkan luar angkasa, galaksi, nebula, dan permukaan planet asing.",
    "Surrealism & Dreamscapes": "Lingkungan surealis yang mengabaikan hukum fisika, seperti pulau yang melayang di udara, arsitektur terbalik, atau visualisasi alam bawah sadar.",
    "Vehicle & Hard-Surface Photobashing": "Fokus spesifik pada perancangan kendaraan kompleks, mecha, atau persenjataan dengan menggabungkan potongan foto-foto mekanis, mesin, dan logam.",
    "Underwater Worlds": "Pembuatan lingkungan bawah laut yang imersif, seperti reruntuhan kota yang tenggelam, ekosistem laut dalam, atau pangkalan bawah air yang bercahaya.",
    "Natural Disasters & Extreme Weather": "Visualisasi cuaca ekstrem atau bencana alam skala besar, seperti letusan gunung berapi, tornado raksasa, badai pasir, atau gelombang tsunami.",
    "2.5D Camera Projection (Camera Mapping)": "Teknik pembuatan matte painting struktural yang dipersiapkan secara spesifik (dipecah dalam beberapa layer) untuk diproyeksikan ke dalam software 3D, guna menciptakan ilusi pergerakan kamera (parallax effect) yang realistis dalam produksi film.",

    // 12. Mockup Produk & Desain
    "Printable Stationery & Digital Planner Pages": "Desain layout kertas fungsional digital planner atau alat tulis yang dapat dicetak. Menampilkan garis lurus (ruled lines) presisi, blok header/footer kosong. Murni fungsional, tanpa tulisan yang bisa dibaca.",
    "PSD Mockup Templates": "Professional blank mockup, strictly empty surface, pure blank white label, perfectly plain, strictly no text, no logos, no branding, no typography, no graphic elements, smooth matte finish, studio lighting, clear and sharp edges for easy PSD smart object placement, no complex reflections, perfectly centered, isolated on a flat pure solid white background.",
    "Device & Technology Mockups": "Smartphone, laptop, desktop, or multi-device screen mockups. Strictly blank, empty, and clean screen surfaces (pure solid color or transparent chroma-key). NO fake logos, NO text, NO existing branding. Ready to use for placing custom UI/UX web designs.",
    "Apparel & Fashion Mockups": "T-Shirt, hoodie, or fabric accessory mockups (lifestyle or flat lay). Strictly blank, empty, and clean fabric surfaces. NO fake logos, NO text, NO existing branding. Ready to use for placing custom clothing line or POD designs.",
    "Print & Editorial Mockups": "Books, magazines, posters, flyers, or business cards mockups with realistic paper textures and folds. Strictly blank, empty, and clean paper surfaces. NO fake logos, NO text, NO existing branding. Ready to use for placing custom 2D graphic designs.",
    "Branding / Stationery Kits": "Complete corporate identity stationery kits (A4 letterhead, envelope, business card, notebook, pen) neatly arranged from a top-down or isometric view. Strictly blank, empty, and clean surfaces. NO fake logos, NO text, NO existing branding. Ready for brand guideline presentations.",
    "Signage & Outdoor Mockups": "Storefront signage, massive outdoor billboards, or neon signs. Strictly blank, empty, and clean sign boards (pure white or chroma-key). NO fake logos, NO text, NO existing branding. Ready to use for placing custom outdoor advertising designs.",
    "Home Decor & Wall Art Mockups": "Blank wall art frames or ceramic mugs in a minimalist, Scandinavian, or modern interior setting. Strictly blank, empty, and clean frame/mug surfaces. NO fake logos, NO text, NO existing branding. Ready to use for placing custom artwork or typography.",
    "Vehicle & Car Wrap Mockups": "Desain branding atau stiker yang diaplikasikan langsung pada bodi kendaraan, seperti mobil van kargo, truk, bus kota, atau mobil sport. Strictly blank surfaces ready for custom wrap designs. NO fake logos.",
    "Merchandise & Promotional Mockups": "Visualisasi untuk barang-barang souvenir dan promosi perusahaan, seperti tote bag, mug keramik, lanyard, enamel pin/badge, payung, dan pulpen. Strictly blank surfaces ready for brand placement.",
    "Event & Exhibition Mockups": "Kebutuhan visual presentasi untuk acara fisik, meliputi booth pameran, roll-up banner, meja promosi portabel, tenda event, dan gelang tiket. Strictly blank template boards. NO existing branding.",
    "Textile & Fabric Mockups": "Visualisasi yang digunakan untuk melihat bagaimana desain pola (seamless pattern) atau ilustrasi terlihat saat dicetak di atas bahan kain, seperti gulungan kain, handuk, selimut, atau gorden. Blank pure fabric.",
    "UI/UX & Web Presentation Mockups": "Berfokus pada kerangka presentasi antarmuka, seperti browser window, grid isometrik untuk alur aplikasi (app flow), dan tata letak dasbor digital kosong. Strictly empty container for UI insertion.",

    // 13. Background Design
    "Islamic Background & Certificate Templates": "Latar belakang bernuansa arsitektur Islam, pola geometris Timur Tengah, lentera, atau kubah. Berfungsi sebagai templat tata letak dengan ruang kosong (blank space) murni di tengah yang sengaja disiapkan untuk menyisipkan teks sertifikat atau jadwal. STRICT MANDATE: The center must be completely blank empty space. No real text allowed.",
    "Decorative Corner Borders & Oriental Ornaments": "Elemen dekoratif eksklusif di sudut kanvas (siku-siku). Bentuk diadaptasi dari seni Simpul Tiongkok (Chinese Knots), ukiran kayu tradisional Asia, motif awan/flora dengan dominasi warna merah. Berfungsi sebagai pembingkai. BAGIAN TENGAH KANVAS WAJIB 100% KOSONG MELOMPONG. Strictly positioned at the corners, framing the empty center.",
    "Mesh Gradient": "Abstract mesh gradient background. Smooth, non-linear blending of vibrant colors. Strictly design background only. Massive empty copy space. NO main subject, NO text, NO character.",
    "Holographic / Iridescent": "Holographic and iridescent surface background. Rainbow light reflection effect. Strictly design background only. Massive empty copy space. NO main subject, NO text.",
    "Soft Pastel Gradients": "Soft pastel gradient background. Minimal contrast, peaceful and clean atmospheric gradient. Strictly design background only. Massive empty copy space. NO main subject.",
    "Liquid / Fluid Waves": "Liquid and fluid 3D waves background. Dynamic organic thick flowing shapes. Strictly design background only. Massive empty copy space. NO main subject, NO text.",
    "Glassmorphism Background": "Glassmorphism aesthetic background. Frosted glass effect over colorful abstract shapes. Deep dimension. Strictly design background only. Massive empty copy space. NO main subject.",
    "Abstract 3D Shapes": "Abstract 3D geometric shapes floating in empty space with soft studio lighting. Strictly design background only. Massive empty copy space. NO main character, NO text.",
    "Low Poly Background": "Low poly geometric background. Hundreds of connecting triangles forming a 3D gradient space. Strictly design background only. Massive empty copy space. NO main subject.",
    "Particle & Network Nodes": "Particle and network nodes background. Glowing dots connected by thin lines, representing data or tech. Strictly design background only. Massive empty copy space. NO main subject.",
    "Cyber Grid / Wireframe": "Cyber grid wireframe background. Synthwave retro-futuristic perspective grid fading into a vanishing point. Strictly design background only. Massive empty copy space. NO main subject.",
    "Paper & Cardboard Texture": "High resolution paper, recycled cardboard, or torn canvas texture background. Organic and tactile. Strictly design background only. Massive empty copy space. NO main subject, NO text.",
    "Marble & Stone Texture": "Elegant marble or granite stone texture background. Luxury aesthetic. Strictly design background only. Massive empty copy space. NO main subject, NO text.",
    "Foil & Metallic Texture": "Crumpled gold, silver, or metallic foil texture background. High contrast reflections. Strictly design background only. Massive empty copy space. NO main subject.",
    "Studio Podium / Pedestal": "Empty 3D studio podium or pedestal background. Clean room with a single display stage and dramatic spotlight. Strictly empty design background. Massive empty copy space. NO product on the podium, NO main subject.",
    "Soft Grain / Noise Surface": "Soft grain and noise surface background. Solid color covered with aesthetic film-like grain texture. Strictly design background only. Massive empty copy space. NO main subject.",
    "Neumorphic Surface": "Neumorphic aesthetic surface background. Subtle extruded and debossed shapes made purely of drop shadows and inner shadows on a solid color. Strictly design background only. Massive empty copy space. NO main subject.",
    "Micro-Patterns / Dotted": "Micro-pattern or dotted crosshatch background. Very tiny repeating shapes that look like a texture from afar. Strictly design background only. Massive empty copy space. NO main subject.",
    "Halftone Waves": "Halftone dotted waves background. Expanding and shrinking dots creating a wavy gradient illusion. Strictly design background only. Massive empty copy space. NO main subject.",
    "Geometric Abstract Background": "Komposisi abstrak geometris dari perpotongan dan pengulangan bentuk matematis (lingkaran, segitiga, poligon). Estetika Bauhaus atau minimalis modern yang sangat terstruktur. Strictly design background only. Massive empty copy space. NO main subject, NO text.",
    "Grunge & Paint Strokes Abstract": "Latar belakang abstrak elemen fisik dan organik yang tidak beraturan, seperti percikan cat (splatter), coretan kuas tebal yang ekspresif (thick brush strokes), atau lelehan tinta. Artistik dan bertekstur. Strictly design background only. Massive empty copy space. NO main subject, NO text.",
    "Light Trails & Bokeh": "Latar belakang abstrak manipulasi cahaya. Garis-garis lampu neon yang memanjang (long exposure) atau lingkaran cahaya buram (bokeh) yang saling tumpang tindih secara elegan. Strictly design background only. Massive empty copy space. NO main subject, NO text."
};

const ASPECT_RATIOS = ['1:1', '3:2', '2:3', '3:4', '1:4', '4:1', '4:3', '4:5', '5:4', '1:8', '8:1', '9:16', '16:9', '21:9', '9:21', '16:10', '10:16', '2:1', '1:2', '7:5', '5:7'];
const RESOLUTIONS = ['Asli', '2K', '3K', '4K'];
const FORMATS = ['jpg', 'png'];

const apiKey = ""; 

const MODIFIERS_PHOTO_3D = [
    "Fokus pada komposisi Close-up ekstrim (Macro).",
    "Gunakan komposisi Wide-Angle yang memperlihatkan lingkungan luas.",
    "Gunakan sudut pandang Bird's-eye view (dari atas ke bawah).",
    "Gunakan sudut pandang Low Angle (dari bawah ke atas).",
    "Gunakan pencahayaan Golden Hour yang hangat dan dramatis.",
    "Gunakan pencahayaan Studio Lighting dengan kontras tajam (Chiaroscuro).",
    "Gunakan pencahayaan sinematik malam hari dengan aksen cahaya buatan.",
    "Ubah total properti atau benda-benda yang ada di latar belakang.",
    "Gunakan depth of field yang sangat dangkal (latar belakang sangat blur)."
];

const MODIFIERS_VECTOR_ART = [
    "Ubah total objek pendukung atau properti di sekitar elemen utama.",
    "Gunakan palet warna pastel yang lembut dan menenangkan.",
    "Gunakan palet warna neon atau kontras tinggi yang sangat mencolok.",
    "Bermain dengan tata letak asimetris yang dinamis.",
    "Bermain dengan komposisi proporsi yang tidak biasa (elemen besar dipadu elemen sangat kecil).",
    "Gunakan skema warna monokromatik (berbagai shade dari satu warna dasar).",
    "Ubah gaya presentasi komposisi menjadi lebih dinamis atau melayang."
];

const MODIFIERS_PATTERN_TEXTURE = [
    "Ubah kerapatan elemen menjadi sangat padat, rapat, dan rumit.",
    "Ubah kerapatan elemen menjadi sangat renggang dengan banyak ruang kosong (minimalis).",
    "Gunakan kombinasi warna komplementer yang berani dan estetik.",
    "Ubah arah aliran elemen (misal: sejajar, diagonal, atau menyebar acak).",
    "Fokus pada variasi ukuran elemen di dalam pola/tekstur.",
    "Ubah kontras warna menjadi sangat halus (low contrast)."
];

const MODIFIERS_NONE = [
    "Ubah total nuansa emosi menjadi ceria, terang, dan energik.",
    "Ubah total nuansa emosi menjadi misterius, gelap, dan moody.",
    "Eksplorasi gaya visual menjadi fotorealistik.",
    "Eksplorasi gaya visual menjadi ilustrasi vektor 2D.",
    "Eksplorasi gaya visual menjadi 3D render digital."
];

export default function App() {
    const [currentTime, setCurrentTime] = useState(new Date());
    
    // Panel Kontrol
    const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-image');
    const [selectedRatio, setSelectedRatio] = useState('1:1');
    const [selectedResolution, setSelectedResolution] = useState('Asli');
    const [selectedFormat, setSelectedFormat] = useState('jpg');
    
    // Accordion Builder AI
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    
    // Magic Ideas State
    const [magicKeyword, setMagicKeyword] = useState('');
    const [magicCount, setMagicCount] = useState(10); 
    const [magicSuggestions, setMagicSuggestions] = useState([]);
    const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);

    const [promptBuilders, setPromptBuilders] = useState([
        { id: Date.now(), topic: '', categoryTech: 'None', categoryStyle: 'None', amount: 1 }
    ]);
    const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);

    // Textarea Prompts
    const [promptText, setPromptText] = useState('');
    const [instructions, setInstructions] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    
    // Worker Settings
    const [workerCount, setWorkerCount] = useState(5);
    const [workerDelay, setWorkerDelay] = useState(5);
    const [zipFilename, setZipFilename] = useState('');

    const [images, setImages] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isZipping, setIsZipping] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    
    // Pagination, Modals & Notifications
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const [currentPage, setCurrentPage] = useState(1);
    const [previewImage, setPreviewImage] = useState(null);
    const [fileToDelete, setFileToDelete] = useState(null);
    const [clearAllConfirm, setClearAllConfirm] = useState(false);
    const [globalMessage, setGlobalMessage] = useState(null);

    // Refs
    const imagesRef = useRef([]);
    const isPausedRef = useRef(false);
    const isGeneratingRef = useRef(false);
    const abortControllerRef = useRef(null);
    const txtInputRef = useRef(null);

    useEffect(() => { imagesRef.current = images; }, [images]);

    useEffect(() => {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Share+Tech&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const timeString = currentTime.toLocaleTimeString('id-ID', { hour12: false });
    const dateString = currentTime.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    // Kalkulasi Status
    const promptLines = promptText.split('\n').filter(p => p.trim() !== '');
    const selectedCount = promptLines.length;
    
    const countPending = images.filter(f => f.status === 'pending').length;
    const countProcessing = images.filter(f => f.status === 'processing').length;
    const countSuccess = images.filter(f => f.status === 'done').length;
    const countFailed = images.filter(f => f.status === 'failed').length;

    const isAppLocked = isGenerating || countProcessing > 0;
    const canGenerate = (selectedCount > 0 || countPending > 0 || countFailed > 0) && !isGenerating && !isPaused;
    const canPauseResume = isGenerating || countProcessing > 0 || isPaused;
    const isZipActive = !isAppLocked && countSuccess > 0;

    const getStatusBorderColor = () => {
        if (isGenerating && !isPaused) return 'border-orange-400 shadow-md ring-1 ring-orange-200';
        if (isGenerating && isPaused) return 'border-amber-400 shadow-md ring-1 ring-amber-200';
        if (countFailed > 0) return 'border-red-200';
        if (countSuccess > 0 && countSuccess === images.length && images.length > 0) return 'border-green-300';
        return 'border-slate-200';
    };

    const inputClass = "w-full text-xs py-1.5 px-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-orange-500 focus:outline-none focus:border-orange-500 transition-all disabled:bg-gray-100 disabled:text-gray-400 h-[30px]";

    const fetchOnce = async (url, options, signal) => {
        const response = await fetch(url, { ...options, signal });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP Error ${response.status}`);
        }
        return await response.json();
    };

    const handleGenerateIdeas = async () => {
        if (!magicKeyword.trim()) {
            setGlobalMessage({ title: "Perhatian", type: "warning", text: "Silakan masukkan kata kunci utama untuk melacak ide!" });
            return;
        }
        setIsGeneratingIdeas(true);
        try {
            const cleanStyles = CATEGORIES_STYLE.filter(s => !s.startsWith("---") && s !== "None");
            const amount = parseInt(magicCount) || 10;
            const systemPrompt = `You are a Microstock Asset Analyst. Brainstorm EXACTLY ${amount} highly profitable, creative, and specific ideas for individual microstock assets (isolated objects or themes) based on the provided base keyword.
CRITICAL RULE: All object/theme text ideas MUST BE IN INDONESIAN LANGUAGE (Bahasa Indonesia). 
Also, recommend the single most suitable style name for each idea from this EXACT list of available style names: [${cleanStyles.join(', ')}].
Format strictly as a JSON object with a root key "suggestions": { "suggestions": [ { "text": "Ide spesifik dalam bahasa Indonesia", "style": "Exact style name here" } ] }`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
            const payload = { 
                contents: [{ parts: [{ text: `Kata Kunci Utama: ${magicKeyword.trim()}` }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { responseMimeType: "application/json" }
            };
            
            const res = await fetchOnce(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            let textRes = res.candidates[0].content.parts[0].text;
            const parsed = JSON.parse(textRes);
            if (parsed.suggestions) {
                setMagicSuggestions(parsed.suggestions.map(s => ({ ...s, addedId: null })));
            }
        } catch (err) {
            setGlobalMessage({ title: "Error Sistem", type: "error", text: "Gagal meracik ide ajaib: " + err.message });
        } finally {
            setIsGeneratingIdeas(false);
        }
    };

    const handleToggleIdea = (idx, idea) => {
        const updated = [...magicSuggestions];
        if (updated[idx].addedId) {
            const idToRemove = updated[idx].addedId;
            setPromptBuilders(prev => {
                if (prev.length === 1) {
                    return [{ id: Date.now() + R(), topic: '', categoryTech: 'None', categoryStyle: 'None', amount: 1 }]; 
                }
                return prev.filter(b => b.id !== idToRemove); 
            });
            updated[idx].addedId = null;
        } else {
            if (promptBuilders.length >= 10) return;
            
            const newId = Date.now() + R();
            let catStyle = "None";
            if (CATEGORIES_STYLE.includes(idea.style)) {
                catStyle = idea.style;
            }
            setPromptBuilders(prev => {
                const newRow = { id: newId, topic: idea.text, categoryTech: 'None', categoryStyle: catStyle, amount: 1 };
                if (prev.length === 1 && prev[0].topic === '' && prev[0].categoryTech === 'None' && prev[0].categoryStyle === 'None') {
                    return [newRow];
                }
                return [...prev, newRow];
            });
            updated[idx].addedId = newId;
        }
        setMagicSuggestions(updated);
    };

    const addBuilder = () => {
        if (promptBuilders.length >= 10) return;
        setPromptBuilders([...promptBuilders, { id: Date.now() + R(), topic: '', categoryTech: 'None', categoryStyle: 'None', amount: 1 }]);
    };

    const removeBuilder = (id) => {
        setPromptBuilders(prev => {
            if (prev.length === 1) {
                return [{ id: Date.now() + R(), topic: '', categoryTech: 'None', categoryStyle: 'None', amount: 1 }]; 
            }
            return prev.filter(b => b.id !== id);
        });
        setMagicSuggestions(prev => prev.map(s => s.addedId === id ? { ...s, addedId: null } : s));
    };

    const updateBuilder = (id, field, value) => {
        setPromptBuilders(promptBuilders.map(b => b.id === id ? { ...b, [field]: value } : b));
    };

    const handleGeneratePrompts = async () => {
        for (const builder of promptBuilders) {
            if (builder.categoryTech === "None" && builder.categoryStyle === "None" && !builder.topic.trim()) {
                setGlobalMessage({ title: "Perhatian", type: "warning", text: "Jika Anda membiarkan kedua kategori 'None', Anda WAJIB mengisi Topik!" });
                return;
            }
        }

        setIsGeneratingPrompts(true);
        try {
            // MEMORI KONTEKSTUAL: Membaca prompt yang sudah ada di kotak input
            let currentMemory = promptText.split('\n').filter(p => p.trim() !== '');
            
            for (const builder of promptBuilders) {
                const totalAmount = parseInt(builder.amount) || 1;
                const batchSize = 5; // Dikirim setiap 5
                let remaining = totalAmount;

                while (remaining > 0) {
                    const currentAmount = Math.min(remaining, batchSize);
                    let systemPrompt = "";
                    const isStyleActive = builder.categoryStyle !== "None";
                    const cat = isStyleActive ? builder.categoryStyle : builder.categoryTech;
                    const randomSeed = Math.floor(Math.random() * 1000000); 
                    
                    // ATURAN EKSKLUSI ANTI-KEMBAR (Mengingat 50 prompt terakhir, ambil 8 kata pertamanya saja agar token tidak jebol)
                    const recentMemory = currentMemory.slice(-50).map(l => l.split(' ').slice(0, 8).join(' '));
                    const exclusionRule = recentMemory.length > 0 
                        ? `\n\nCRITICAL EXCLUSION: DO NOT USE or REPEAT any of these past concepts/subjects: [${recentMemory.join(' | ')}]. You must provide entirely NEW, UNIQUE, and DIFFERENT variations from those past generations.` 
                        : "";
                    
                    if (cat === "None") {
                        systemPrompt = `[SEED: ${randomSeed}] Anda adalah ahli pembuat prompt gambar AI profesional. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris yang sangat detail dan fotorealistik berdasarkan Topik: "${builder.topic.trim()}".
ATURAN MUTLAK:
1. Anda WAJIB membuat ${currentAmount} prompt yang BERBEDA-BEDA secara detail meskipun memiliki topik dasar yang sama.
2. JANGAN berikan nomor urut, JANGAN berikan teks pengantar/penutup apa pun.
3. Pisahkan antar prompt HANYA dengan baris baru (ENTER).
4. Tulis prompt murni dalam bahasa Inggris.`;
                    } 
                    else if (isStyleActive) {
                        const styleDesc = STYLE_DESCRIPTIONS[cat];
                        const topicInsert = builder.topic.trim() ? ` Fokus/Objek utama gambar: "${builder.topic}".` : ` Buat komposisi yang sangat estetis sesuai dengan genre ini.`;
                        
                        let additionalRules = "";
                        if (cat === "Watercolor Swashes & Brush Strokes" || cat === "Watercolor Splashes & Splatters" || cat === "Watercolor Stains & Blobs" || cat === "Watercolor Cosmetic & Lifestyle Objects" || cat === "Watercolor Floral & Botanical Cuts") {
                            additionalRules = `\n4. WAJIB SUNTIKKAN KATA-KATA INI KE DALAM SETIAP PROMPT UNTUK MENGUNCI BACKGROUND: "single isolated element, centered, perfectly pure solid white background, strictly no canvas texture, no paper texture, no environmental shadows, clean edges with pure white empty space surrounding the object, high contrast cutout style"`;
                        } else if (cat.startsWith("--- 6. Logo")) {
                            additionalRules = `\n4. STRICTLY NO ACTUAL TEXT OR GIBBERISH. Use blank copy space/ribbons. Vector style only. Highly scalable, clean edges without complex 3D drop shadows.`;
                        } else if (cat === "Vector Infographic Templates & Diagram UI") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST include instructions for blank text placeholders and numbered steps (01, 02). NO REAL WORDS OR TEXT ALLOWED.`;
                        } else if (cat === "Decorative Corner Borders & Oriental Ornaments") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST instruct that the ornaments are strictly placed ONLY at the corners/edges, leaving the dead center of the canvas 100% pure blank white for copy space.`;
                        } else if (cat === "Glyph Flat Vector Icon") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST enforce these exact keywords in the prompt to ensure a pure flat silhouette: "solid black fill, strictly no outlines, perfectly flat 2D vector design, clean edges, strictly no gradients, strictly no shadows, pure white background".`;
                        } else if (cat === "Islamic Background & Certificate Templates") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST instruct that the ornaments and architectural elements are strictly placed at the edges/corners, leaving the center 100% pure blank for text layout. No real text allowed.`;
                        } else if (cat === "Printable Stationery & Digital Planner Pages") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST include instructions for completely blank header blocks and functional ruled lines. NO REAL WORDS OR TEXT ALLOWED.`;
                        } else if (cat === "Infographic Title Ribbons & UI Banners") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST include instructions for completely blank text placeholders inside the ribbons. NO REAL WORDS ALLOWED.`;
                        } else if (cat === "Dark Mode Line Art / Glowing Wireframe Icon") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST explicitly specify a pure solid pitch black background (#000000) and glowing thin lines for this dark mode asset.`;
                        } else if (cat === "Duocolor Line Icons / Two-Tone Monoline Vector") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST specify strictly uniform line weight, rounded caps, EXACTLY TWO colors (main and accent), and strictly NO solid fills (transparent interior inside lines).`;
                        } else if (cat === "Filled Outline Vector") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST specify thick bold black outlines surrounding flat solid vibrant colors inside. No gradients, no soft shadows.`;
                        }
                        
                        systemPrompt = `[SEED: ${randomSeed}] Anda adalah Prompt Engineer kelas dunia spesialis pembuatan aset Microstock. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris yang sangat detail untuk genre/gaya visual: "${cat}".
Deskripsi Panduan Gaya: ${styleDesc}
${topicInsert}
ATURAN MUTLAK:
1. Pastikan gaya visual, pencahayaan, sudut pandang, dan komposisi 100% mematuhi "Deskripsi Panduan Gaya" di atas.
2. Anda WAJIB merombak dan MENGACAK ide secara liar agar menghasilkan ${currentAmount} prompt yang benar-benar BERBEDA satu sama lain (beda setting, beda palet warna, dll) namun tetap di dalam koridor genre yang diminta.
3. JANGAN berikan nomor urut, pengantar, judul, atau penutup. Pisahkan HANYA dengan baris baru (ENTER). Tulis prompt murni dalam bahasa Inggris.${additionalRules}`;
                    }
                    else {
                        if (cat.startsWith("Mockup") && cat.includes("Screen")) {
                            const color = cat.includes("Green") ? "neon green (#00FF00)" : cat.includes("White") ? "pure white (#FFFFFF)" : "pure black (#000000)";
                            const topicInsert = builder.topic.trim() ? ` Elemen di sekitar atau suasana: "${builder.topic}".` : ` Suasana di depan atau di dalam toko/kafe yang estetik.`;
                            systemPrompt = `[SEED: ${randomSeed}] Anda adalah ahli pembuat prompt gambar AI profesional. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris yang sangat detail dan fotorealistik untuk desain Mockup Papan Iklan Toko.${topicInsert}
ATURAN MUTLAK:
1. Objek UTAMA WAJIB berupa papan reklame berdiri (standing signboard / A-frame board) yang biasa diletakkan di depan atau di dalam toko/cafe.
2. Area layar utama pada papan tersebut WAJIB dibiarkan KOSONG dan berwarna ${color} solid untuk keperluan mockup chroma-key/editing.
3. Anda WAJIB membuat ${currentAmount} prompt yang BERBEDA-BEDA suasana sekitar, lokasi (indoor/outdoor), atau bentuk papannya.
4. JANGAN berikan nomor urut, pengantar, atau penutup. Pisahkan HANYA dengan baris baru (ENTER). Tulis prompt dalam bahasa Inggris.`;
                        }
                        else if (cat.startsWith("Objek dgn Latar Belakang")) {
                            const color = cat.includes("Hijau") ? "pure solid neon green (#00FF00)" : cat.includes("Putih") ? "pure solid white (#FFFFFF)" : "pure solid black (#000000)";
                            const topicInsert = builder.topic.trim() ? ` Objek utama yang difoto: "${builder.topic}".` : ` Pilih satu objek acak yang menarik secara komersial (misal: gadget, makanan, aksesoris).`;
                            systemPrompt = `[SEED: ${randomSeed}] Anda adalah ahli pembuat prompt gambar AI profesional. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris yang sangat detail dan fotorealistik untuk fotografi studio produk.${topicInsert}
ATURAN MUTLAK:
1. Latar belakang (background) gambar WAJIB 100% bersih, rata, dan berwarna ${color} solid tanpa ada tekstur, gradasi, bayangan tajam, atau elemen pengganggu lainnya (isolated on ${color} background).
2. Objek utama berada tepat di tengah dengan pencahayaan studio yang merata dan sempurna.
3. Anda WAJIB membuat ${currentAmount} prompt yang BERBEDA-BEDA (beda objek atau beda angle/jenis barang).
4. JANGAN berikan nomor urut, pengantar, atau penutup. Pisahkan HANYA dengan baris baru (ENTER). Tulis prompt dalam bahasa Inggris.`;
                        }
                        else if (cat.startsWith("Template Background")) {
                            const color = cat.includes("Hijau") ? "neon green (#00FF00)" : cat.includes("Putih") ? "pure white (#FFFFFF)" : "pure black (#000000)";
                            const topicInsert = builder.topic.trim() ? ` Tema spesifik elemen dekorasi: "${builder.topic}".` : ` Gunakan gaya kreatif abstrak, floral, atau geometris yang estetik.`;
                            systemPrompt = `[SEED: ${randomSeed}] Anda adalah ahli pembuat prompt gambar AI profesional. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris untuk desain aesthetic background template.${topicInsert}
ATURAN MUTLAK:
1. Gambar ini adalah sebuah KANVAS KOSONG yang seluruh dasarnya berwarna ${color} solid yang sangat bersih.
2. Tambahkan elemen dekoratif (bentuk, coretan, atau bunga) HANYA di bagian PALING UJUNG/SUDUT (membingkai gambar dari tepi luar secara simetris atau asimetris).
3. Bagian TENGAH gambar WAJIB dibiarkan 100% KOSONG MELOMPONG berupa warna ${color} solid. (Tidak boleh ada objek di tengah).
4. Anda WAJIB membuat ${currentAmount} prompt desain yang BERBEDA-BEDA bentuk gaya dekorasi pinggirnya.
5. JANGAN berikan nomor urut, pengantar, atau penutup. Pisahkan HANYA dengan baris baru (ENTER). Tulis prompt dalam bahasa Inggris.`;
                        }
                        else if (cat === "Abstrak Flat Background") {
                            const topicInsert = builder.topic.trim() ? ` Elemen bentuk tambahan/tema: "${builder.topic}".` : ` Fokus pada gaya abstrak murni yang berenergi dan modern.`;
                            systemPrompt = `[SEED: ${randomSeed}] Anda adalah desainer grafis spesialis aset microstock abstrak. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris untuk desain "Abstract Flat Vector Background".${topicInsert}
ATURAN MUTLAK:
1. Gaya visual WAJIB berupa perpaduan Memphis style 80s/90s, Fluid Blob organic shapes, dan Geometric minimalis (flat design, no 3D shading, clean lines).
2. Anda WAJIB merombak dan MENGACAK (randomize) jenis bentuk (zig-zag, polka dots, speed lines, pill shapes, amoeba blobs) dan palet warna (neon, pastel, retro, primary colors) untuk setiap baris prompt agar komposisinya tak terbatas dan tidak ada yang kembar.
3. Anda WAJIB membuat ${currentAmount} prompt yang sepenuhnya BERBEDA satu sama lain.
4. JANGAN berikan nomor urut, pengantar, atau penutup. Pisahkan HANYA dengan baris baru (ENTER). Tulis prompt dalam bahasa Inggris.`;
                        }
                        else if (cat === "Shadow Overlay") {
                            const topicInsert = builder.topic.trim() ? ` Bayangan dari: "${builder.topic}".` : ` Bayangan dedaunan atau bingkai jendela.`;
                            systemPrompt = `[SEED: ${randomSeed}] Anda adalah ahli pembuat prompt gambar AI profesional. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris untuk desain aset "Shadow Overlay".${topicInsert}
ATURAN MUTLAK:
1. Gambar HANYA berisi bayangan abu-abu lembut transparan yang jatuh di atas lantai/dinding.
2. LATAR BELAKANG WAJIB murni putih bersih solid (pure solid white background, high-key lighting, overexposed background).
3. Objek aslinya TIDAK BOLEH terlihat sama sekali di dalam frame, hanya bayangannya saja yang tercetak.
4. Anda WAJIB membuat ${currentAmount} variasi bentuk bayangan yang BERBEDA.
5. JANGAN berikan nomor urut, pengantar, atau penutup. Pisahkan HANYA dengan baris baru (ENTER). Tulis prompt dalam bahasa Inggris.`;
                        }
                        else {
                            const topicInsert = builder.topic.trim() ? ` Fokus tambahan/konteks: "${builder.topic}".` : ` Fokus pada kualitas fotorealistik tinggi untuk kategori ini.`;
                            systemPrompt = `[SEED: ${randomSeed}] Anda adalah ahli pembuat prompt gambar AI profesional. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris yang sangat detail dan presisi berdasarkan Kategori/Niche: "${cat}".${topicInsert}
ATURAN MUTLAK:
1. Anda WAJIB membuat ${currentAmount} prompt yang BERBEDA-BEDA secara visual (beda angle, properti di sekitar, pencahayaan) namun tetap mempertahankan elemen utama dari kategori tersebut.
2. JANGAN berikan nomor urut, pengantar, atau penutup. Pisahkan HANYA dengan baris baru (ENTER). Tulis prompt dalam bahasa Inggris.`;
                        }
                    }

                    // SUNTIKKAN ANTIBODI ANTI-KEMBAR KE SISTEM
                    systemPrompt += exclusionRule;

                    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
                    const payload = { 
                        contents: [{ parts: [{ text: systemPrompt }] }],
                        generationConfig: { temperature: 1.0 } 
                    };
                    
                    const res = await fetchOnce(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    const text = res.candidates[0].content.parts[0].text;
                    
                    const cleanedLines = text.split('\n')
                        .filter(l => l.trim().length > 10)
                        .map(l => l.replace(/^\d+[\.\-\)]\s*/, '').trim());
                    
                    if (cleanedLines.length > 0) {
                        currentMemory = [...currentMemory, ...cleanedLines];
                        // Streaming update ke textarea UI
                        setPromptText(currentMemory.join('\n'));
                    }

                    remaining -= currentAmount;
                }
            }
        } catch (err) {
            setGlobalMessage({ title: "Error Sistem", type: "error", text: "Gagal meracik prompt AI: " + err.message });
        } finally {
            setIsGeneratingPrompts(false);
        }
    };

    const handleLoadTxt = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            setPromptText(prev => prev + (prev ? '\n' : '') + text);
            e.target.value = '';
        };
        reader.readAsText(file);
    };

    const handleCopyPrompt = () => {
        if (!promptText) return;
        const textArea = document.createElement("textarea");
        textArea.value = promptText;
        document.body.appendChild(textArea);
        textArea.select();
        try { document.execCommand('copy'); } catch (err) {}
        document.body.removeChild(textArea);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const copyCardPrompt = (promptText) => {
        if (!promptText) return;
        const textArea = document.createElement("textarea");
        textArea.value = promptText;
        document.body.appendChild(textArea);
        textArea.select();
        try { document.execCommand('copy'); } catch (err) {}
        document.body.removeChild(textArea);
    };

    const generateTitleAI = async (basePrompt, signal) => {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: `Buatkan 1 nama file gambar yang sangat singkat (maks 4 kata bahasa inggris) dari prompt ini. Tanpa tanda kutip: ${basePrompt}` }] }] };
            const result = await fetchOnce(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, signal);
            return result.candidates[0].content.parts[0].text.trim();
        } catch (e) {
            return basePrompt.split(' ').slice(0, 4).join(' ') + '...';
        }
    };

    const callAI = async (task, signal) => {
        let finalPrompt = task.basePrompt;
        let finalNegative = negativePrompt.trim();

        if (instructions.trim()) finalPrompt = `${instructions}. ${finalPrompt}`;
        if (finalNegative) finalPrompt += `. Do not include: ${finalNegative}`;
        // Jangan tambahkan aspectRatio manual di prompt untuk Imagen, tapi boleh untuk Gemini
        if (selectedModel !== 'imagen-4.0-generate-001') finalPrompt += `. Aspect ratio: ${selectedRatio}`;

        let imageUrl = '';
        let base64DataRaw = '';

        if (selectedModel === 'imagen-4.0-generate-001') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:predict?key=${apiKey}`;
            const payload = { instances: { prompt: finalPrompt }, parameters: { sampleCount: 1, aspectRatio: selectedRatio } };
            const result = await fetchOnce(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, signal);
            
            if (result.predictions?.[0]?.bytesBase64Encoded) {
                base64DataRaw = result.predictions[0].bytesBase64Encoded;
            } else throw new Error("Gagal mengambil gambar dari Imagen 4.");
        } else {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: finalPrompt }] }], generationConfig: { responseModalities: ['IMAGE'] } };
            const result = await fetchOnce(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, signal);
            
            const inlineData = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
            if (inlineData) {
                base64DataRaw = inlineData.data;
            } else throw new Error("Gagal mengambil gambar dari model Banana.");
        }

        const formattedDataUrl = await formatImage(base64DataRaw, task.format);
        const blob = dataUrlToBlob(formattedDataUrl);
        imageUrl = URL.createObjectURL(blob);
        
        return imageUrl;
    };

    const startGeneration = async (isResume = false) => {
        if (isGeneratingRef.current) return;
        
        if (!isResume) {
            if (promptLines.length === 0) return;
            const newTasks = promptLines.map(p => ({
                id: R().toString(36).substr(2, 9),
                title: 'Menunggu Antrean...',
                basePrompt: p,
                status: 'pending', url: null, error: null,
                format: selectedFormat
            }));
            
            setImages(prev => [...newTasks, ...prev.map(f => f.status === 'failed' ? { ...f, status: 'pending', error: null } : f)]);
            setCurrentPage(1); 
        }

        isGeneratingRef.current = true;
        setIsGenerating(true); 
        setIsPaused(false); 
        isPausedRef.current = false;
        
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        
        const runWorkers = async () => {
            const requestedWorkers = parseInt(workerCount) || 5;
            const filesToProcess = imagesRef.current.filter(f => f.status === 'pending').length;
            const concurrency = Math.max(1, Math.min(requestedWorkers, filesToProcess));
            const delayMs = (parseInt(workerDelay) || 0) * 1000;
            const workers = [];

            for (let workerId = 0; workerId < concurrency; workerId++) {
                workers.push((async () => {
                    if (workerId > 0 && delayMs > 0 && !isPausedRef.current) {
                        await new Promise(r => setTimeout(r, delayMs * workerId));
                    }

                    while (!isPausedRef.current) {
                        let taskToProcess = null;
                        
                        for (let j = 0; j < imagesRef.current.length; j++) {
                            if (imagesRef.current[j].status === 'pending') {
                                taskToProcess = imagesRef.current[j];
                                imagesRef.current[j] = { ...taskToProcess, status: 'processing', title: 'Sedang Memproses...', error: null };
                                break; 
                            }
                        }

                        if (!taskToProcess) break; 
                        setImages(prev => prev.map(f => f.id === taskToProcess.id ? { ...f, status: 'processing', title: 'Sedang Memproses...', error: null } : f));

                        try {
                            const [url, generatedTitle] = await Promise.all([
                                callAI(taskToProcess, signal),
                                generateTitleAI(taskToProcess.basePrompt, signal)
                            ]);

                            if (isPausedRef.current) {
                                setImages(prev => prev.map(f => f.id === taskToProcess.id ? { ...f, status: 'pending', title: 'Menunggu Antrean...' } : f));
                            } else {
                                setImages(prev => prev.map(f => f.id === taskToProcess.id ? { ...f, status: 'done', url, title: generatedTitle } : f));
                            }
                        } catch (error) {
                            if (error.name === 'AbortError' || isPausedRef.current) {
                                setImages(prev => prev.map(f => f.id === taskToProcess.id ? { ...f, status: 'pending', title: 'Menunggu Antrean...' } : f));
                            } else {
                                setImages(prev => prev.map(f => f.id === taskToProcess.id ? { ...f, status: 'failed', title: 'Gagal Render', error: error.message } : f));
                            }
                        }

                        if (delayMs > 0 && !isPausedRef.current) {
                            await new Promise(r => setTimeout(r, delayMs));
                        }
                    }
                })());
            }
            await Promise.all(workers);
        };

        while (!isPausedRef.current) {
            await runWorkers();
            
            await new Promise(r => {
                const check = setInterval(() => {
                    const processing = imagesRef.current.some(f => f.status === 'processing');
                    const pending = imagesRef.current.some(f => f.status === 'pending');
                    if (!processing || pending) { clearInterval(check); r(); } 
                }, 500);
            });

            const stillPending = imagesRef.current.some(f => f.status === 'pending');
            if (!stillPending) break; 
        }

        if (!isPausedRef.current) {
            setIsGenerating(false);
            isGeneratingRef.current = false;
        }
    };

    const handlePauseResume = () => {
        if ((isGenerating || countProcessing > 0) && !isPaused) { 
            setIsPaused(true); 
            isPausedRef.current = true; 
            if (abortControllerRef.current) abortControllerRef.current.abort();
            setImages(prev => prev.map(f => f.status === 'processing' ? { ...f, status: 'pending', title: 'Menunggu Antrean...', error: null } : f));
            setIsGenerating(false);
            isGeneratingRef.current = false;
        } else if (isPaused || (!isGenerating && countPending > 0)) {
            startGeneration(true); 
        }
    };

    const confirmClearAllAction = () => {
        setIsPaused(false); isPausedRef.current = false; setIsGenerating(false); isGeneratingRef.current = false;
        if (abortControllerRef.current) abortControllerRef.current.abort();
        
        images.forEach(img => {
            if (img.url) URL.revokeObjectURL(img.url);
        });
        
        setImages([]);
        setClearAllConfirm(false);
    };

    const confirmDeleteFile = () => {
        const fileToDel = images.find(f => f.id === fileToDelete);
        if (fileToDel && fileToDel.url) URL.revokeObjectURL(fileToDel.url);
        
        setImages(prev => prev.filter(f => f.id !== fileToDelete));
        setFileToDelete(null);
    };

    const handleDownloadSingle = async (img) => {
        setDownloadingId(img.id);
        try {
            const safeTitle = img.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const ext = img.format === 'jpg' ? 'jpg' : 'png';
            
            const upscaledUrl = await upscaleBlobUrl(img.url, selectedResolution, img.format);
            
            const link = document.createElement('a');
            link.href = upscaledUrl; 
            link.download = `GasBuBar-${safeTitle}-${img.id}.${ext}`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            
            if (upscaledUrl !== img.url) URL.revokeObjectURL(upscaledUrl);
        } finally {
            setDownloadingId(null);
        }
    };

    const handleDownloadZip = async () => {
        const doneImages = images.filter(f => f.status === 'done');
        if (doneImages.length === 0) return;
        setIsZipping(true);
        try {
            const JSZip = (await import('https://esm.sh/jszip')).default;
            const zip = new JSZip();

            for (let i = 0; i < doneImages.length; i++) {
                const img = doneImages[i];
                const safeTitle = img.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const ext = img.format === 'jpg' ? 'jpg' : 'png';
                
                const upscaledUrl = await upscaleBlobUrl(img.url, selectedResolution, img.format);
                const response = await fetch(upscaledUrl);
                const blob = await response.blob();
                
                zip.file(`GasBuBar-${safeTitle}-${img.id}.${ext}`, blob);
                if (upscaledUrl !== img.url) URL.revokeObjectURL(upscaledUrl);
            }

            const content = await zip.generateAsync({ type: 'blob' });
            const zipUrl = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = zipUrl;
            link.download = `${zipFilename.trim() || 'GasBuBar-Images'}.zip`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            URL.revokeObjectURL(zipUrl);
        } catch (err) {
            setGlobalMessage({ title: "Error Sistem", type: "error", text: "Gagal mengunduh file ZIP." });
        } finally {
            setIsZipping(false);
        }
    };

    const totalPages = Math.ceil(images.length / itemsPerPage);
    const paginatedImages = images.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <>
            <style>{`
                body { font-family: 'Share Tech', sans-serif; overscroll-behavior: contain; margin: 0; padding: 0; }
                .custom-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
                .custom-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-scroll::-webkit-scrollbar-thumb { background: #fdba74; border-radius: 4px; }
                .custom-scroll::-webkit-scrollbar-thumb:hover { background: #f97316; }
                .toggle-checkbox:checked { right: 0; border-color: #f97316; }
                .toggle-checkbox:checked + .toggle-label { background-color: #f97316; }
            `}</style>
            
            <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-100 text-slate-900 flex flex-col">
                
                <header className="bg-[#0f172a] border-b border-slate-800 sticky top-0 z-30 shadow-md h-14 flex items-center shrink-0">
                    <div className="w-full px-4 sm:px-6 flex justify-between items-center">
                        <div className="text-[28px] leading-none font-bold text-orange-500 tracking-widest flex items-center gap-2">
                            GAS.BUBAR
                        </div>
                        <div className="text-right flex flex-col justify-center items-end text-slate-100">
                            <div className="text-[16px] leading-none font-bold tracking-[0.1em]">{timeString}</div>
                            <div className="text-[11px] leading-tight text-slate-400 tracking-wider mt-0.5">{dateString}</div>
                        </div>
                    </div>
                </header>

                <main className="w-full flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative min-h-0 bg-slate-100">
                    
                    <aside className="w-full lg:w-[380px] bg-slate-50 lg:border-r border-slate-200 flex flex-col z-20 shrink-0 lg:h-full lg:overflow-hidden">
                        
                        <div className="flex-1 flex flex-col overflow-y-visible lg:overflow-y-auto overflow-x-hidden custom-scroll">
                            <div className="p-4 flex flex-col gap-4">
                                
                                <div className="flex gap-2 w-full">
                                    <button onClick={() => window.open('https://lynk.id/isaproject', '_blank')} className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 rounded-lg transition shadow-sm text-xs tracking-wide">
                                        <BriefcaseIcon /> My Project
                                    </button>
                                    <button onClick={() => window.open('https://lynk.id/isaproject/0581ez0729vx', '_blank')} className="flex-1 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg transition shadow-sm text-xs tracking-wide">
                                        <CoffeeIcon /> Support Project
                                    </button>
                                </div>

                                <div className="bg-white p-4 rounded-lg shadow-sm border border-orange-200">
                                    
                                    <div className="grid grid-cols-4 gap-2 mb-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-600 mb-1">Model AI</label>
                                            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} disabled={isAppLocked} className={`${inputClass} font-bold cursor-pointer disabled:opacity-60 px-1`}>
                                                <option value="gemini-3.1-flash-image">Banana 2</option>
                                                <option value="imagen-4.0-generate-001">Imagen 4 (Legacy)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-600 mb-1">Rasio</label>
                                            <select value={selectedRatio} onChange={(e) => setSelectedRatio(e.target.value)} disabled={isAppLocked} className={`${inputClass} font-bold cursor-pointer disabled:opacity-60 px-1`}>
                                                {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-600 mb-1">Resolusi</label>
                                            <select value={selectedResolution} onChange={(e) => setSelectedResolution(e.target.value)} disabled={isAppLocked} className={`${inputClass} font-bold cursor-pointer disabled:opacity-60 px-1 bg-amber-50 border-amber-200 text-amber-700`}>
                                                {RESOLUTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-600 mb-1">Format</label>
                                            <select value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value)} disabled={isAppLocked} className={`${inputClass} font-bold cursor-pointer disabled:opacity-60 px-1`}>
                                                {FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="border-b border-orange-100 mb-4 mt-2"></div>

                                    <div className="mb-4">
                                        <button 
                                            onClick={() => setIsBuilderOpen(!isBuilderOpen)}
                                            className="w-full flex items-center justify-between p-2.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded transition-colors"
                                        >
                                            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"><SparklesIcon className="w-3 h-3" /> Buat Ide & Prompt AI Otomatis</span>
                                            <ChevronDownIcon className={`w-4 h-4 transition-transform duration-300 ${isBuilderOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        
                                        {isBuilderOpen && (
                                            <div className="mt-2 flex flex-col gap-2">
                                                
                                                <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col gap-2 shadow-sm">
                                                    <div className="flex gap-2">
                                                        <div className="flex-1">
                                                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5 uppercase">Ketik Tema/Keyword</label>
                                                            <input 
                                                                type="text" 
                                                                value={magicKeyword} 
                                                                onChange={e => setMagicKeyword(e.target.value)} 
                                                                placeholder="e.g. Ramadhan, Teknologi..." 
                                                                className={`${inputClass} !h-[28px]`} 
                                                            />
                                                        </div>
                                                        <div className="w-20 shrink-0">
                                                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5 uppercase">Jml Ide</label>
                                                            <input 
                                                                type="number" 
                                                                min="1"
                                                                value={magicCount} 
                                                                onChange={e => setMagicCount(e.target.value)} 
                                                                className={`${inputClass} !h-[28px]`} 
                                                            />
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={handleGenerateIdeas} 
                                                        disabled={isGeneratingIdeas} 
                                                        className="py-2 bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold uppercase tracking-wider rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-70 shadow-sm mt-1"
                                                    >
                                                        {isGeneratingIdeas ? <><CustomSpinner className="h-3.5 w-3.5 text-white" /> Memikirkan Ide...</> : <><SparklesIcon className="w-3 h-3" /> Buat Ide</>}
                                                    </button>
                                                </div>

                                                <div className="flex flex-col border border-slate-200 rounded bg-white shadow-sm overflow-hidden">
                                                    <div className="h-[110px] p-2 overflow-y-auto custom-scroll border-b border-slate-200 bg-slate-50">
                                                        {magicSuggestions.length > 0 ? (
                                                            <div className="flex flex-col gap-1.5">
                                                                {magicSuggestions.map((idea, idx) => {
                                                                    const isMaxed = promptBuilders.length >= 10;
                                                                    return (
                                                                        <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 gap-2">
                                                                            <div className="flex flex-col min-w-0 flex-1">
                                                                                <span className="text-[10px] text-slate-800 font-medium leading-tight truncate" title={idea.text}>{idea.text}</span>
                                                                                <span className="text-[8px] text-orange-600 font-bold tracking-wide uppercase truncate mt-0.5">{idea.style}</span>
                                                                            </div>
                                                                            <button 
                                                                                onClick={() => handleToggleIdea(idx, idea)}
                                                                                disabled={!idea.addedId && isMaxed}
                                                                                className={`w-6 h-6 rounded flex items-center justify-center font-black text-sm shrink-0 transition-colors ${idea.addedId ? 'bg-red-500 text-white hover:bg-red-600 shadow-sm' : (!idea.addedId && isMaxed) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-orange-100 text-orange-600 hover:bg-orange-200 shadow-sm'}`}
                                                                                title={idea.addedId ? "Hapus dari List" : isMaxed ? "Batas Kategori Penuh (Maks 10)" : "Tambah ke List"}
                                                                            >
                                                                                {idea.addedId ? '-' : '+'}
                                                                            </button>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                                                <SparklesIcon className="w-5 h-5 mb-1 opacity-50" />
                                                                <span className="text-[10px] font-medium">Ide AI akan muncul di sini...</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="h-[110px] p-2 overflow-y-auto custom-scroll flex flex-col gap-2 bg-white">
                                                        {promptBuilders.map((builder) => (
                                                            <div key={builder.id} className="relative p-2 bg-slate-50 border border-slate-200 rounded shrink-0">
                                                                {promptBuilders.length > 1 && (
                                                                    <button onClick={() => removeBuilder(builder.id)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-0.5 hover:bg-red-200 z-10 shadow-sm"><XCircleIcon className="w-4 h-4" /></button>
                                                                )}
                                                                <div className="grid grid-cols-4 gap-2 mb-2">
                                                                    <div className="col-span-3">
                                                                        <label className="block text-[9px] font-bold text-slate-500 mb-0.5 uppercase">Topik</label>
                                                                        <input type="text" value={builder.topic} onChange={e => updateBuilder(builder.id, 'topic', e.target.value)} placeholder="Misal: Kopi, Meja Kerja..." className={`${inputClass} !h-[24px] !text-[10px]`} />
                                                                    </div>
                                                                    <div className="col-span-1">
                                                                        <label className="block text-[9px] font-bold text-slate-500 mb-0.5 uppercase">Jml</label>
                                                                        <input type="number" min="1" max="20" value={builder.amount} onChange={e => updateBuilder(builder.id, 'amount', e.target.value)} className={`${inputClass} !h-[24px] !text-[10px] !px-1`} />
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <div>
                                                                        <select 
                                                                            value={builder.categoryTech} 
                                                                            onChange={e => updateBuilder(builder.id, 'categoryTech', e.target.value)} 
                                                                            disabled={builder.categoryStyle !== 'None'}
                                                                            className={`${inputClass} !h-[24px] !text-[9px] !px-1 truncate ${builder.categoryStyle !== 'None' ? 'bg-slate-100 opacity-50' : 'bg-white'}`}
                                                                        >
                                                                            {CATEGORIES_TECH.map(c => <option key={c} value={c}>{c}</option>)}
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <select 
                                                                            value={builder.categoryStyle} 
                                                                            onChange={e => updateBuilder(builder.id, 'categoryStyle', e.target.value)} 
                                                                            disabled={builder.categoryTech !== 'None'}
                                                                            className={`${inputClass} !h-[24px] !text-[9px] !px-1 truncate ${builder.categoryTech !== 'None' ? 'bg-slate-100 opacity-50' : 'bg-white'}`}
                                                                        >
                                                                            {CATEGORIES_STYLE.map(c => (
                                                                                <option key={c} value={c} disabled={c.startsWith("---")}>
                                                                                    {c}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                
                                                <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col gap-2 shadow-sm">
                                                    <button onClick={addBuilder} disabled={promptBuilders.length >= 10} className="py-1.5 border border-dashed border-slate-300 text-slate-500 bg-white hover:bg-slate-100 hover:text-slate-700 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors disabled:opacity-50 shadow-sm">
                                                        <PlusIcon /> Tambah Kategori Manual (Maks 10)
                                                    </button>
                                                    <button onClick={handleGeneratePrompts} disabled={isGeneratingPrompts} className="py-2 bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold uppercase tracking-wider rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-70 shadow-sm mt-1">
                                                        {isGeneratingPrompts ? <><CustomSpinner className="h-3.5 w-3.5 text-white" /> Meracik Prompt...</> : <><SparklesIcon className="w-3 h-3" /> Buat Prompt</>}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mb-3">
                                        <div className="flex justify-between items-end mb-1">
                                            <label className="block text-[11px] font-bold text-slate-600">Daftar Prompt (1 Baris = 1 Gambar)</label>
                                        </div>
                                        <div className={`border rounded flex flex-col bg-white transition-all overflow-hidden ${isAppLocked ? 'border-gray-200' : 'border-gray-300 focus-within:ring-2 focus-within:ring-orange-500 focus-within:border-orange-500'}`}>
                                            <textarea 
                                                value={promptText} onChange={e => setPromptText(e.target.value)} disabled={isAppLocked}
                                                placeholder="Gunakan alat AI di atas atau ketik manual di sini..."
                                                className="w-full text-[10px] p-2 text-gray-900 bg-transparent outline-none resize-none custom-scroll leading-tight h-24 disabled:bg-gray-100"
                                            />
                                            <div className="flex justify-between items-center bg-slate-50 border-t border-gray-200 px-2 py-1.5 shrink-0">
                                                <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">
                                                    TOTAL: <span className="text-orange-600 ml-1">{promptLines.length}</span>
                                                </span>
                                                <div className="flex gap-3">
                                                    <input type="file" accept=".txt" ref={txtInputRef} onChange={handleLoadTxt} className="hidden" />
                                                    <button onClick={() => txtInputRef.current?.click()} disabled={isAppLocked} className="flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-slate-800 transition disabled:opacity-50">
                                                        <UploadIcon /> LOAD TXT
                                                    </button>
                                                    <button onClick={handleCopyPrompt} disabled={isAppLocked || !promptText} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 transition disabled:opacity-50">
                                                        <CopyIcon /> {isCopied ? 'TERSALIN' : 'SALIN'}
                                                    </button>
                                                    <button onClick={() => setPromptText('')} disabled={isAppLocked || !promptText} className="flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-700 transition disabled:opacity-50">
                                                        <TrashIcon /> CLEAR
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 mb-4">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Instruksi Tambahan</label>
                                            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} disabled={isAppLocked} className="w-full text-xs p-2 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-orange-500 outline-none h-16 resize-none custom-scroll leading-tight" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-red-600 mb-0.5">Negative Prompt</label>
                                            <textarea value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)} disabled={isAppLocked} className="w-full text-xs p-2 border border-red-200 rounded bg-red-50/50 focus:ring-2 focus:ring-red-500 outline-none h-16 resize-none custom-scroll leading-tight" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-5 gap-2 border-t border-slate-100 pt-3">
                                        <div className="col-span-1">
                                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Worker</label>
                                            <input type="number" min="1" value={workerCount} onChange={e => setWorkerCount(e.target.value)} disabled={isAppLocked} className={inputClass} />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Delay(s)</label>
                                            <input type="number" min="0" value={workerDelay} onChange={e => setWorkerDelay(e.target.value)} disabled={isAppLocked} className={inputClass} />
                                        </div>
                                        <div className="col-span-3">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <FileTextIcon />
                                                <label className="block text-[10px] font-bold text-slate-600 leading-none">Custom Nama ZIP</label>
                                            </div>
                                            <input type="text" value={zipFilename} onChange={e => setZipFilename(e.target.value)} disabled={isAppLocked} placeholder="GasBuBar-Images" className={`${inputClass} placeholder:text-slate-400`} />
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>

                        <div className="shrink-0 p-4 bg-slate-50 border-t border-slate-200 flex flex-col gap-4 z-10">
                            
                            <div className={`bg-white rounded-lg border ${getStatusBorderColor()} shadow-sm transition-all overflow-hidden`}>
                                <div className="grid grid-cols-3 gap-0 border-b border-gray-100 p-2 bg-gray-50">
                                    <div className="flex flex-col items-center justify-center border border-blue-200 rounded-lg bg-blue-50 py-1.5 shadow-sm transition-all">
                                        <div className="flex items-center gap-1 mb-1 text-blue-600">
                                            <ClockIcon /> <span className="text-xs font-medium uppercase leading-none">Selected</span>
                                        </div>
                                        <span className="text-xs font-black text-blue-600 tabular-nums">
                                            {isGenerating || countPending > 0 ? (countPending + countProcessing) : selectedCount}
                                        </span>
                                    </div>
                                    <div className="mx-1.5 flex flex-col items-center justify-center border border-green-200 rounded-lg bg-green-50 py-1.5 shadow-sm transition-all">
                                        <div className="flex items-center gap-1 mb-1 text-green-600">
                                            <CheckCircleIcon /> <span className="text-xs font-medium uppercase leading-none">Completed</span>
                                        </div>
                                        <span className="text-xs font-black text-green-700 tabular-nums">{countSuccess}</span>
                                    </div>
                                    <div className="flex flex-col items-center justify-center border border-red-200 rounded-lg bg-red-50 py-1.5 shadow-sm transition-all">
                                        <div className="flex items-center gap-1 mb-1 text-red-600">
                                            <XCircleIcon /> <span className="text-xs font-medium uppercase leading-none">Failed</span>
                                        </div>
                                        <span className="text-xs font-black text-red-700 tabular-nums">{countFailed}</span>
                                    </div>
                                </div>
                                <div className="p-2 bg-white flex items-center justify-between gap-3">
                                    <button onClick={() => setClearAllConfirm(true)} disabled={isAppLocked || images.length === 0} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold uppercase tracking-wide rounded border transition-colors ${images.length > 0 && !isGenerating ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'}`}>
                                        <TrashIcon /> CLEAR ALL KARTU
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-1.5 h-10">
                                {isGenerating ? (
                                    <div className={`flex-1 border text-xs font-bold rounded-lg flex items-center justify-center gap-2 shadow-sm select-none transition-all ${isPaused ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                                        <SparklesIcon className={`w-4 h-4 ${isPaused ? '' : 'animate-spin'} ${isPaused ? 'text-amber-600' : 'text-orange-600'}`} />
                                        <span className="uppercase tracking-wide">{isPaused ? 'Terhenti' : 'Memproses...'}</span>
                                    </div>
                                ) : (
                                    <button onClick={() => startGeneration(false)} disabled={!canGenerate} className={`flex-1 text-xs font-bold rounded-lg border shadow transition-colors flex items-center justify-center gap-2 uppercase tracking-wide truncate ${canGenerate ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-700 hover:-translate-y-0.5' : 'bg-slate-100 border-slate-200 cursor-not-allowed text-slate-400'}`}>
                                        <Wand2Icon /> Generate
                                    </button>
                                )}

                                <button onClick={handlePauseResume} disabled={!canPauseResume} className={`w-10 flex items-center justify-center rounded-lg border shadow-sm transition-all active:scale-95 shrink-0 ${!canPauseResume ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : isPaused ? 'bg-green-600 border-green-700 text-white hover:bg-green-700 hover:-translate-y-0.5' : 'bg-amber-100 border-amber-300 text-amber-600 hover:bg-amber-200 hover:-translate-y-0.5'}`}>
                                    {isPaused ? <PlayIcon /> : <PauseIcon />}
                                </button>

                                <button onClick={handleDownloadZip} disabled={!isZipActive || isZipping} className={`flex-1 text-xs font-bold rounded-lg border shadow transition-colors flex items-center justify-center gap-2 uppercase tracking-wide truncate ${isZipActive ? 'bg-green-600 hover:bg-green-700 text-white border-green-700 hover:-translate-y-0.5' : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-80'}`}>
                                    {isZipping ? <CustomSpinner className="w-4 h-4 text-white" /> : <DownloadIcon />}
                                    <span className="truncate">Ekspor ZIP</span>
                                </button>
                            </div>

                        </div>
                    </aside>

                    <section className="flex-1 flex flex-col lg:overflow-hidden relative min-h-0 bg-slate-100">
                        
                        <div className="bg-white border-b border-slate-200 p-3 flex justify-between items-center shrink-0 shadow-sm z-10">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                {[50, 100, 500, 1000].map(num => (
                                    <button 
                                        key={num} 
                                        onClick={() => { setItemsPerPage(num); setCurrentPage(1); }}
                                        className={`px-2 py-1 rounded border transition ${itemsPerPage === num ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200'}`}
                                    >
                                        {num}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-500">Hal {currentPage} / {totalPages || 1}</span>
                                <div className="flex gap-1">
                                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50 border border-slate-200 transition">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                                    </button>
                                    <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)} className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50 border border-slate-200 transition">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 p-4 lg:overflow-y-auto custom-scroll pb-20 lg:pb-4">
                            {images.length > 0 ? (
                                <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                                    {paginatedImages.map(f => (
                                        <div key={f.id} className={`bg-white hover:shadow-md rounded-lg shadow-sm border flex flex-col transition-all duration-300 ${f.status === 'processing' ? 'border-orange-400 ring-2 ring-orange-100' : f.status === 'failed' ? 'border-red-300' : 'border-slate-200'}`}>
                                            
                                            <div className="grid grid-cols-4 gap-2 p-2 bg-orange-50/50 border-b border-orange-100 rounded-t-lg shrink-0">
                                                <button onClick={() => setPreviewImage(f)} disabled={f.status !== 'done'} className="flex flex-row items-center justify-center gap-1.5 py-1.5 rounded border bg-white border-orange-200 text-orange-600 hover:bg-orange-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                                    <EyeIcon />
                                                    <span className="text-[10px] font-bold uppercase tracking-tight truncate">Prev</span>
                                                </button>
                                                <button onClick={() => copyCardPrompt(f.basePrompt)} className="flex flex-row items-center justify-center gap-1.5 py-1.5 rounded border bg-white border-orange-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                                    <CopyIcon />
                                                    <span className="text-[10px] font-bold uppercase tracking-tight truncate">Copy</span>
                                                </button>
                                                <button onClick={() => handleDownloadSingle(f)} disabled={f.status !== 'done' || downloadingId === f.id} className="flex flex-row items-center justify-center gap-1.5 py-1.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-50 text-green-600 border-green-200 hover:brightness-95">
                                                    {downloadingId === f.id ? <CustomSpinner className="h-3 w-3 text-green-600" /> : <DownloadIcon />}
                                                    <span className="text-[10px] font-bold uppercase tracking-tight truncate">{downloadingId === f.id ? 'Wait' : 'Dwn'}</span>
                                                </button>
                                                <button onClick={() => setFileToDelete(f.id)} disabled={isAppLocked || downloadingId === f.id} className="flex flex-row items-center justify-center gap-1.5 py-1.5 rounded border bg-white border-orange-200 text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                                    <TrashIcon />
                                                    <span className="text-[10px] font-bold uppercase tracking-tight truncate">Del</span>
                                                </button>
                                            </div>

                                            <div className="p-2 border-b border-slate-100 flex justify-between items-center gap-2 shrink-0 bg-white">
                                                <p className="text-[11px] font-bold text-slate-800 truncate" title={f.title}>{f.title}</p>
                                                <span className={`text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded border whitespace-nowrap ${f.status === 'done' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : f.status === 'processing' ? 'bg-orange-50 text-orange-700 border-orange-200' : f.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                    {f.status.toUpperCase()}
                                                </span>
                                            </div>

                                            <div className="p-2 flex gap-2 h-[150px] bg-white rounded-b-lg relative">
                                                
                                                <div className="flex-1 border border-slate-200 rounded-lg overflow-hidden bg-slate-50 relative flex items-center justify-center">
                                                    {f.status === 'done' && f.url ? (
                                                        <>
                                                            <img src={f.url} alt="Result" className={`w-full h-full object-cover transition-opacity duration-300 ${downloadingId === f.id ? 'opacity-30' : 'opacity-100'}`} />
                                                            {downloadingId === f.id && (
                                                                <div className="absolute inset-0 flex flex-col gap-2 items-center justify-center h-full m-auto">
                                                                    <CustomSpinner className="h-6 w-6 text-orange-500" />
                                                                    <span className="text-[8px] font-bold text-orange-600 uppercase tracking-widest bg-white/80 px-1 rounded">Upscaling...</span>
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : f.status === 'failed' ? (
                                                        <div className="flex items-center justify-center h-full bg-red-50 p-2">
                                                            <p className="text-[9px] text-red-600 font-mono font-bold text-center break-words">{f.error || "Gagal memproses."}</p>
                                                        </div>
                                                    ) : f.status === 'processing' ? (
                                                        <div className="flex flex-col gap-2 items-center justify-center text-[11px] font-bold text-orange-500 h-full m-auto">
                                                            <CustomSpinner className="h-6 w-6 text-orange-500" />
                                                            <span className="tracking-widest uppercase text-[9px]">Processing...</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-center h-full text-slate-300">
                                                            <ImageIcon />
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                <div className="flex-1 border border-orange-200 rounded-lg bg-orange-50/30 flex flex-col overflow-hidden">
                                                    <div className="p-1 border-b border-orange-100 bg-orange-100/50 sticky top-0 shrink-0">
                                                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest block text-center">Metadata Prompt:</span>
                                                    </div>
                                                    <div className="p-1.5 overflow-y-auto custom-scroll flex-1">
                                                        <p className="text-[10px] text-slate-700 leading-snug break-words">
                                                            {f.basePrompt}
                                                        </p>
                                                    </div>
                                                </div>

                                            </div>

                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center w-full h-full min-h-[50vh]">
                                    <div className="w-20 h-20 bg-orange-50 border border-orange-100 text-orange-300 rounded-full flex items-center justify-center mb-4">
                                        <Wand2Icon className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-700 mb-2">Belum Ada Antrean</h3>
                                    <p className="text-slate-500 text-sm max-w-md">Masukkan prompt atau gunakan AI Builder di panel kiri untuk mulai merender.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </main>

                {}
                {previewImage && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm transition-opacity" onClick={() => setPreviewImage(null)}>
                        <div className="relative bg-white rounded-lg shadow-2xl p-2 w-fit max-w-[95vw] max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <button className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:bg-red-600" onClick={() => setPreviewImage(null)}>
                                <XCircleIcon />
                            </button>
                            <img src={previewImage.url} className="max-w-full max-h-[85vh] object-contain rounded" alt="Preview" />
                        </div>
                    </div>
                )}

                {fileToDelete && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm flex flex-col items-center text-center">
                            <div className="bg-red-100 p-3 rounded-full mb-3">
                                <AlertTriangleIcon />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">Hapus Gambar?</h3>
                            <p className="text-sm text-slate-600 mt-2 mb-6">Gambar dan prompt ini akan dihapus dari antrean.</p>
                            <div className="flex w-full gap-3">
                                <button onClick={() => setFileToDelete(null)} className="flex-1 bg-slate-200 text-slate-700 font-bold py-2 rounded-lg hover:bg-slate-300 transition">Batal</button>
                                <button onClick={confirmDeleteFile} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg hover:bg-red-700 transition shadow-sm">Ya, Hapus</button>
                            </div>
                        </div>
                    </div>
                )}

                {clearAllConfirm && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm flex flex-col items-center text-center">
                            <div className="bg-red-100 p-3 rounded-full mb-3">
                                <AlertTriangleIcon />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">Hapus Semua?</h3>
                            <p className="text-sm text-slate-600 mt-2 mb-6">Anda akan menghapus <b>semua antrean</b> dari daftar secara permanen.</p>
                            <div className="flex w-full gap-3">
                                <button onClick={() => setClearAllConfirm(false)} className="flex-1 bg-slate-200 text-slate-700 font-bold py-2 rounded-lg hover:bg-slate-300 transition">Batal</button>
                                <button onClick={confirmClearAllAction} className="flex-1 bg-red-600 text-white font-bold py-2 rounded-lg hover:bg-red-700 transition shadow-sm">Ya, Hapus Semua</button>
                            </div>
                        </div>
                    </div>
                )}

                {globalMessage && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm flex flex-col items-center text-center">
                            <div className={`p-3 rounded-full mb-3 ${globalMessage.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                                <AlertTriangleIcon />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">{globalMessage.title}</h3>
                            <p className="text-sm text-slate-600 mt-2 mb-6">{globalMessage.text}</p>
                            <button onClick={() => setGlobalMessage(null)} className="w-full bg-slate-800 text-white font-bold py-2 rounded-lg hover:bg-slate-900 transition shadow-sm">Tutup</button>
                        </div>
                    </div>
                )}
                
            </div>
        </>
    );
}