import React, { useState, useEffect, useRef } from 'react';
import { 
    CATEGORIES_TECH, CATEGORIES_STYLE, STYLE_DESCRIPTIONS, 
    ASPECT_RATIOS, RESOLUTIONS, FORMATS 
} from './constants.js';
import { 
    CustomSpinner, BriefcaseIcon, CoffeeIcon, ClockIcon, 
    CheckCircleIcon, XCircleIcon, TrashIcon, SparklesIcon, 
    Wand2Icon, PlayIcon, PauseIcon, DownloadIcon, FileTextIcon, 
    EyeIcon, ImageIcon, AlertTriangleIcon, ChevronDownIcon, 
    PlusIcon, CopyIcon, UploadIcon 
} from './icons.jsx';
import { 
    MathRandom, formatImage, dataUrlToBlob, 
    upscaleBlobUrl, callGeminiApiViaProxy 
} from './utils.js';

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

            const payload = { 
                contents: [{ parts: [{ text: `Kata Kunci Utama: ${magicKeyword.trim()}` }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { responseMimeType: "application/json" }
            };
            
            const res = await callGeminiApiViaProxy('gemini-2.5-flash-preview-09-2025:generateContent', payload);
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
                    return [{ id: Date.now() + MathRandom(), topic: '', categoryTech: 'None', categoryStyle: 'None', amount: 1 }]; 
                }
                return prev.filter(b => b.id !== idToRemove); 
            });
            updated[idx].addedId = null;
        } else {
            if (promptBuilders.length >= 10) return;
            
            const newId = Date.now() + MathRandom();
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
        setPromptBuilders([...promptBuilders, { id: Date.now() + MathRandom(), topic: '', categoryTech: 'None', categoryStyle: 'None', amount: 1 }]);
    };

    const removeBuilder = (id) => {
        setPromptBuilders(prev => {
            if (prev.length === 1) {
                return [{ id: Date.now() + MathRandom(), topic: '', categoryTech: 'None', categoryStyle: 'None', amount: 1 }]; 
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
            let currentMemory = promptText.split('\n').filter(p => p.trim() !== '');
            let usedMemory = [...currentMemory];
            
            for (const builder of promptBuilders) {
                const totalAmount = parseInt(builder.amount) || 1;
                const batchSize = 5; 
                let remaining = totalAmount;

                while (remaining > 0) {
                    if (abortControllerRef.current?.signal.aborted) throw new Error("Dibatalkan");
                    
                    const currentAmount = Math.min(remaining, batchSize);
                    let systemPrompt = "";
                    const isStyleActive = builder.categoryStyle !== "None";
                    const cat = isStyleActive ? builder.categoryStyle : builder.categoryTech;
                    
                    const recentMemory = usedMemory.slice(-50).map(l => l.split(' ').slice(0, 10).join(' '));
                    const exclusionRule = recentMemory.length > 0 
                        ? `\n\nCRITICAL EXCLUSION: DO NOT USE or REPEAT any of these past concepts/subjects: [${recentMemory.join(' | ')}]. You must provide entirely NEW, UNIQUE, and DIFFERENT variations from those past generations.` 
                        : "";
                    
                    if (cat === "None") {
                        systemPrompt = `Anda adalah ahli pembuat prompt gambar AI profesional. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris yang sangat detail dan fotorealistik berdasarkan Topik: "${builder.topic.trim()}".
ATURAN MUTLAK:
1. Anda WAJIB merombak total 5 elemen ini pada setiap prompt: Aksi subjek, Benda pendukung, Sudut kamera, Palet Warna, dan Waktu (Pagi/Malam) agar tidak ada yang kembar!
2. JANGAN berikan nomor urut, JANGAN berikan teks pengantar/penutup apa pun.
3. Pisahkan antar prompt HANYA dengan baris baru (ENTER). Tulis murni dalam bahasa Inggris.`;
                    } 
                    else if (isStyleActive) {
                        const styleDesc = STYLE_DESCRIPTIONS[cat];
                        const topicInsert = builder.topic.trim() ? ` Fokus/Objek utama gambar: "${builder.topic}".` : ` Buat komposisi yang sangat estetis sesuai dengan genre ini.`;
                        
                        let additionalRules = "";
                        if (cat.includes("Watercolor")) {
                            additionalRules = `\n4. WAJIB SUNTIKKAN KATA INI UNTUK MENGUNCI BACKGROUND: "single isolated element, perfectly pure solid white background, strictly no canvas texture, no paper texture, no environmental shadows, clean edges with pure white empty space surrounding the object, high contrast cutout style"`;
                        } else if (cat.startsWith("--- 6. Logo")) {
                            additionalRules = `\n4. STRICTLY NO ACTUAL TEXT OR GIBBERISH. Use blank copy space/ribbons. Vector style only.`;
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
                        } else if (cat === "Duocolor Line Icons") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST specify strictly uniform line weight, rounded caps, EXACTLY TWO colors (main and accent), and strictly NO solid fills (transparent interior inside lines).`;
                        } else if (cat === "Filled Outline Vector") {
                            additionalRules = `\n4. STRICT MANDATE: You MUST specify thick bold black outlines surrounding flat solid vibrant colors inside. No gradients, no soft shadows.`;
                        } else if (cat === "Product Commercial Rendering") {
                            additionalRules = `\n4. STRICT MANDATE: Buat tampilan produk polosan murni tanpa penambahan teks, huruf, angka, atau embel-embel merk brand (strictly no branding, no text labels).`;
                        } else if (cat === "Gingham & Checkered") {
                            additionalRules = `\n4. STRICT MANDATE: Pola murni, strictly no human figures, no people.`;
                        }
                        
                        systemPrompt = `Anda adalah Prompt Engineer kelas dunia spesialis pembuatan aset Microstock. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris yang sangat detail untuk genre/gaya visual: "${cat}".
Deskripsi Panduan Gaya: ${styleDesc}
${topicInsert}
ATURAN MUTLAK:
1. Gaya visual, pencahayaan, sudut pandang 100% mematuhi "Deskripsi Panduan Gaya".
2. PENTING: Anda WAJIB merombak total 4 elemen ini: 1. Aksi subjek/Fokus spesifik, 2. Properti pendukung, 3. Angle komposisi, 4. Palet Warna, agar tidak ada yang kembar!
3. JANGAN berikan nomor urut atau pengantar. Pisahkan HANYA dengan baris baru (ENTER). Tulis murni dalam bahasa Inggris.${additionalRules}`;
                    }
                    else {
                        const topicInsert = builder.topic.trim() ? ` Fokus/Tema tambahan: "${builder.topic}".` : ` Fokus pada gaya abstrak murni yang berenergi dan modern.`;
                        systemPrompt = `Anda adalah desainer grafis spesialis microstock. Buatkan tepat ${currentAmount} prompt gambar berbahasa Inggris untuk kategori: "${cat}".${topicInsert}
ATURAN MUTLAK:
1. Pastikan objek memenuhi kriteria teknis layar hijau/putih/hitam jika itu mockup.
2. Anda WAJIB merombak total elemen bentuk, palet warna, dan komposisi (tata letak) untuk setiap baris prompt agar komposisinya liar dan tidak ada yang kembar.
3. JANGAN berikan nomor urut atau pengantar. Pisahkan HANYA dengan baris baru (ENTER). Tulis prompt dalam bahasa Inggris.`;
                    }

                    systemPrompt += exclusionRule;

                    const payload = { 
                        contents: [{ parts: [{ text: systemPrompt }] }],
                        generationConfig: { temperature: 1.0 } 
                    };
                    
                    const res = await callGeminiApiViaProxy('gemini-2.5-flash-preview-09-2025:generateContent', payload);
                    const text = res.candidates[0].content.parts[0].text;
                    
                    const cleanedLines = text.split('\n')
                        .filter(l => l.trim().length > 10)
                        .map(l => l.replace(/^\d+[\.\-\)]\s*/, '').trim());
                    
                    if (cleanedLines.length > 0) {
                        usedMemory = [...usedMemory, ...cleanedLines];
                        setPromptText(usedMemory.join('\n'));
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

    const generateTitleAI = async (basePrompt) => {
        try {
            const payload = { contents: [{ parts: [{ text: `Buatkan 1 nama file gambar yang sangat singkat (maks 4 kata bahasa inggris) dari prompt ini. Tanpa tanda kutip: ${basePrompt}` }] }] };
            const result = await callGeminiApiViaProxy('gemini-2.5-flash-preview-09-2025:generateContent', payload);
            return result.candidates[0].content.parts[0].text.trim();
        } catch (e) {
            return basePrompt.split(' ').slice(0, 4).join(' ') + '...';
        }
    };

    const callAI = async (task) => {
        let finalPrompt = task.basePrompt;
        let finalNegative = negativePrompt.trim();

        if (instructions.trim()) finalPrompt = `${instructions}. ${finalPrompt}`;
        if (finalNegative) finalPrompt += `. Do not include: ${finalNegative}`;
        
        if (selectedModel !== 'imagen-4.0-generate-001') finalPrompt += `. Aspect ratio: ${selectedRatio}`;

        let imageUrl = '';
        let base64DataRaw = '';

        if (selectedModel === 'imagen-4.0-generate-001') {
            const payload = { instances: { prompt: finalPrompt }, parameters: { sampleCount: 1, aspectRatio: selectedRatio } };
            const result = await callGeminiApiViaProxy(`${selectedModel}:predict`, payload);
            
            if (result.predictions?.[0]?.bytesBase64Encoded) {
                base64DataRaw = result.predictions[0].bytesBase64Encoded;
            } else throw new Error("Gagal mengambil gambar dari Imagen.");
        } else {
            const payload = { contents: [{ parts: [{ text: finalPrompt }] }], generationConfig: { responseModalities: ['IMAGE'] } };
            const result = await callGeminiApiViaProxy(`${selectedModel}:generateContent`, payload);
            
            const inlineData = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
            if (inlineData) {
                base64DataRaw = inlineData.data;
            } else throw new Error("Gagal mengambil gambar dari model Gemini.");
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
                id: MathRandom().toString(36).substr(2, 9),
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
                                callAI(taskToProcess),
                                generateTitleAI(taskToProcess.basePrompt)
                            ]);

                            if (isPausedRef.current) {
                                setImages(prev => prev.map(f => f.id === taskToProcess.id ? { ...f, status: 'pending', title: 'Menunggu Antrean...' } : f));
                            } else {
                                setImages(prev => prev.map(f => f.id === taskToProcess.id ? { ...f, status: 'done', url, title: generatedTitle } : f));
                            }
                        } catch (error) {
                            if (isPausedRef.current) {
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
            setImages(prev => prev.map(f => f.status === 'processing' ? { ...f, status: 'pending', title: 'Menunggu Antrean...', error: null } : f));
            setIsGenerating(false);
            isGeneratingRef.current = false;
        } else if (isPaused || (!isGenerating && countPending > 0)) {
            startGeneration(true); 
        }
    };

    const confirmClearAllAction = () => {
        setIsPaused(false); isPausedRef.current = false; setIsGenerating(false); isGeneratingRef.current = false;
        
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
                                            <option value="imagen-4.0-generate-001">Imagen (Legacy)</option>
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
                                    <button onClick={() => setIsBuilderOpen(!isBuilderOpen)} className="w-full flex items-center justify-between p-2.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded transition-colors">
                                        <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"><SparklesIcon className="w-3 h-3" /> Buat Ide & Prompt AI Otomatis</span>
                                        <ChevronDownIcon className={`w-4 h-4 transition-transform duration-300 ${isBuilderOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    
                                    {isBuilderOpen && (
                                        <div className="mt-2 flex flex-col gap-2">
                                            <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col gap-2 shadow-sm">
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5 uppercase">Ketik Tema/Keyword</label>
                                                        <input type="text" value={magicKeyword} onChange={e => setMagicKeyword(e.target.value)} placeholder="e.g. Ramadhan, Teknologi..." className={`${inputClass} !h-[28px]`} />
                                                    </div>
                                                    <div className="w-20 shrink-0">
                                                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5 uppercase">Jml Ide</label>
                                                        <input type="number" min="1" value={magicCount} onChange={e => setMagicCount(e.target.value)} className={`${inputClass} !h-[28px]`} />
                                                    </div>
                                                </div>
                                                <button onClick={handleGenerateIdeas} disabled={isGeneratingIdeas} className="py-2 bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold uppercase tracking-wider rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-70 shadow-sm mt-1">
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
                                                                        <button onClick={() => handleToggleIdea(idx, idea)} disabled={!idea.addedId && isMaxed} className={`w-6 h-6 rounded flex items-center justify-center font-black text-sm shrink-0 transition-colors ${idea.addedId ? 'bg-red-500 text-white hover:bg-red-600 shadow-sm' : (!idea.addedId && isMaxed) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-orange-100 text-orange-600 hover:bg-orange-200 shadow-sm'}`}>
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
                                                                    <select value={builder.categoryTech} onChange={e => updateBuilder(builder.id, 'categoryTech', e.target.value)} disabled={builder.categoryStyle !== 'None'} className={`${inputClass} !h-[24px] !text-[9px] !px-1 truncate ${builder.categoryStyle !== 'None' ? 'bg-slate-100 opacity-50' : 'bg-white'}`}>
                                                                        {CATEGORIES_TECH.map(c => <option key={c} value={c}>{c}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <select value={builder.categoryStyle} onChange={e => updateBuilder(builder.id, 'categoryStyle', e.target.value)} disabled={builder.categoryTech !== 'None'} className={`${inputClass} !h-[24px] !text-[9px] !px-1 truncate ${builder.categoryTech !== 'None' ? 'bg-slate-100 opacity-50' : 'bg-white'}`}>
                                                                        {CATEGORIES_STYLE.map(c => (
                                                                            <option key={c} value={c} disabled={c.startsWith("---")}>{c}</option>
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
                                                <button onClick={() => txtInputRef.current?.click()} disabled={isAppLocked} className="flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-slate-800 transition disabled:opacity-50"><UploadIcon /> LOAD TXT</button>
                                                <button onClick={handleCopyPrompt} disabled={isAppLocked || !promptText} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 transition disabled:opacity-50"><CopyIcon /> {isCopied ? 'TERSALIN' : 'SALIN'}</button>
                                                <button onClick={() => setPromptText('')} disabled={isAppLocked || !promptText} className="flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-700 transition disabled:opacity-50"><TrashIcon /> CLEAR</button>
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
                                    <div className="flex items-center gap-1 mb-1 text-blue-600"><ClockIcon /> <span className="text-xs font-medium uppercase leading-none">Selected</span></div>
                                    <span className="text-xs font-black text-blue-600 tabular-nums">{isGenerating || countPending > 0 ? (countPending + countProcessing) : selectedCount}</span>
                                </div>
                                <div className="mx-1.5 flex flex-col items-center justify-center border border-green-200 rounded-lg bg-green-50 py-1.5 shadow-sm transition-all">
                                    <div className="flex items-center gap-1 mb-1 text-green-600"><CheckCircleIcon /> <span className="text-xs font-medium uppercase leading-none">Completed</span></div>
                                    <span className="text-xs font-black text-green-700 tabular-nums">{countSuccess}</span>
                                </div>
                                <div className="flex flex-col items-center justify-center border border-red-200 rounded-lg bg-red-50 py-1.5 shadow-sm transition-all">
                                    <div className="flex items-center gap-1 mb-1 text-red-600"><XCircleIcon /> <span className="text-xs font-medium uppercase leading-none">Failed</span></div>
                                    <span className="text-xs font-black text-red-700 tabular-nums">{countFailed}</span>
                                </div>
                            </div>
                            <div className="p-2 bg-white flex items-center justify-between gap-3">
                                <button onClick={() => setClearAllConfirm(true)} disabled={isAppLocked || images.length === 0} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold uppercase tracking-wide rounded border transition-colors ${images.length > 0 && !isGenerating ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'}`}><TrashIcon /> CLEAR ALL KARTU</button>
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
                                <button key={num} onClick={() => { setItemsPerPage(num); setCurrentPage(1); }} className={`px-2 py-1 rounded border transition ${itemsPerPage === num ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200'}`}>{num}</button>
                            ))}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-500">Hal {currentPage} / {totalPages || 1}</span>
                            <div className="flex gap-1">
                                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50 border border-slate-200 transition"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
                                <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)} className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50 border border-slate-200 transition"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 p-4 lg:overflow-y-auto custom-scroll pb-20 lg:pb-4">
                        {images.length > 0 ? (
                            <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                                {paginatedImages.map(f => (
                                    <div key={f.id} className={`bg-white hover:shadow-md rounded-lg shadow-sm border flex flex-col transition-all duration-300 ${f.status === 'processing' ? 'border-orange-400 ring-2 ring-orange-100' : f.status === 'failed' ? 'border-red-300' : 'border-slate-200'}`}>
                                        <div className="grid grid-cols-4 gap-2 p-2 bg-orange-50/50 border-b border-orange-100 rounded-t-lg shrink-0">
                                            <button onClick={() => setPreviewImage(f)} disabled={f.status !== 'done'} className="flex flex-row items-center justify-center gap-1.5 py-1.5 rounded border bg-white border-orange-200 text-orange-600 hover:bg-orange-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><EyeIcon /><span className="text-[10px] font-bold uppercase tracking-tight truncate">Prev</span></button>
                                            <button onClick={() => copyCardPrompt(f.basePrompt)} className="flex flex-row items-center justify-center gap-1.5 py-1.5 rounded border bg-white border-orange-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><CopyIcon /><span className="text-[10px] font-bold uppercase tracking-tight truncate">Copy</span></button>
                                            <button onClick={() => handleDownloadSingle(f)} disabled={f.status !== 'done' || downloadingId === f.id} className="flex flex-row items-center justify-center gap-1.5 py-1.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-50 text-green-600 border-green-200 hover:brightness-95">{downloadingId === f.id ? <CustomSpinner className="h-3 w-3 text-green-600" /> : <DownloadIcon />}<span className="text-[10px] font-bold uppercase tracking-tight truncate">{downloadingId === f.id ? 'Wait' : 'Dwn'}</span></button>
                                            <button onClick={() => setFileToDelete(f.id)} disabled={isAppLocked || downloadingId === f.id} className="flex flex-row items-center justify-center gap-1.5 py-1.5 rounded border bg-white border-orange-200 text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><TrashIcon /><span className="text-[10px] font-bold uppercase tracking-tight truncate">Del</span></button>
                                        </div>
                                        <div className="p-2 border-b border-slate-100 flex justify-between items-center gap-2 shrink-0 bg-white">
                                            <p className="text-[11px] font-bold text-slate-800 truncate" title={f.title}>{f.title}</p>
                                            <span className={`text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded border whitespace-nowrap ${f.status === 'done' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : f.status === 'processing' ? 'bg-orange-50 text-orange-700 border-orange-200' : f.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{f.status.toUpperCase()}</span>
                                        </div>
                                        <div className="p-2 flex gap-2 h-[150px] bg-white rounded-b-lg relative">
                                            <div className="flex-1 border border-slate-200 rounded-lg overflow-hidden bg-slate-50 relative flex items-center justify-center">
                                                {f.status === 'done' && f.url ? (
                                                    <><img src={f.url} alt="Result" className={`w-full h-full object-cover transition-opacity duration-300 ${downloadingId === f.id ? 'opacity-30' : 'opacity-100'}`} />{downloadingId === f.id && (<div className="absolute inset-0 flex flex-col gap-2 items-center justify-center h-full m-auto"><CustomSpinner className="h-6 w-6 text-orange-500" /><span className="text-[8px] font-bold text-orange-600 uppercase tracking-widest bg-white/80 px-1 rounded">Upscaling...</span></div>)}</>
                                                ) : f.status === 'failed' ? (
                                                    <div className="flex items-center justify-center h-full bg-red-50 p-2"><p className="text-[9px] text-red-600 font-mono font-bold text-center break-words">{f.error || "Gagal memproses."}</p></div>
                                                ) : f.status === 'processing' ? (
                                                    <div className="flex flex-col gap-2 items-center justify-center text-[11px] font-bold text-orange-500 h-full m-auto"><CustomSpinner className="h-6 w-6 text-orange-500" /><span className="tracking-widest uppercase text-[9px]">Processing...</span></div>
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-slate-300"><ImageIcon /></div>
                                                )}
                                            </div>
                                            <div className="flex-1 border border-orange-200 rounded-lg bg-orange-50/30 flex flex-col overflow-hidden">
                                                <div className="p-1 border-b border-orange-100 bg-orange-100/50 sticky top-0 shrink-0"><span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest block text-center">Metadata Prompt:</span></div>
                                                <div className="p-1.5 overflow-y-auto custom-scroll flex-1"><p className="text-[10px] text-slate-700 leading-snug break-words">{f.basePrompt}</p></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center w-full h-full min-h-[50vh]">
                                <div className="w-20 h-20 bg-orange-50 border border-orange-100 text-orange-300 rounded-full flex items-center justify-center mb-4"><Wand2Icon className="w-8 h-8" /></div>
                                <h3 className="text-xl font-bold text-slate-700 mb-2">Belum Ada Antrean</h3>
                                <p className="text-slate-500 text-sm max-w-md">Masukkan prompt atau gunakan AI Builder di panel kiri untuk mulai merender.</p>
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {previewImage && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm transition-opacity" onClick={() => setPreviewImage(null)}>
                    <div className="relative bg-white rounded-lg shadow-2xl p-2 w-fit max-w-[95vw] max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <button className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:bg-red-600" onClick={() => setPreviewImage(null)}><XCircleIcon /></button>
                        <img src={previewImage.url} className="max-w-full max-h-[85vh] object-contain rounded" alt="Preview" />
                    </div>
                </div>
            )}

            {fileToDelete && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm flex flex-col items-center text-center">
                        <div className="bg-red-100 p-3 rounded-full mb-3"><AlertTriangleIcon /></div>
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
                        <div className="bg-red-100 p-3 rounded-full mb-3"><AlertTriangleIcon /></div>
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
                        <div className={`p-3 rounded-full mb-3 ${globalMessage.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}><AlertTriangleIcon /></div>
                        <h3 className="text-lg font-bold text-slate-800">{globalMessage.title}</h3>
                        <p className="text-sm text-slate-600 mt-2 mb-6">{globalMessage.text}</p>
                        <button onClick={() => setGlobalMessage(null)} className="w-full bg-slate-800 text-white font-bold py-2 rounded-lg hover:bg-slate-900 transition shadow-sm">Tutup</button>
                    </div>
                </div>
            )}
        </div>
    );
}
