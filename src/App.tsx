import React, { useState, useRef, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import Cropper from 'react-easy-crop';
import JSZip from 'jszip';

interface ImagePair {
  originalUrl: string;
  croppedUrl: string;
  name: string;
}

type AspectRatioOption = 'original' | '16:9' | '4:3' | '1:1' | 'custom';

const MAX_WIDTH = 400;

function getAspectRatio(option: AspectRatioOption, customW: number, customH: number, imgW: number, imgH: number) {
  switch (option) {
    case '16:9': return 16 / 9;
    case '4:3': return 4 / 3;
    case '1:1': return 1;
    case 'custom': return customW > 0 && customH > 0 ? customW / customH : 1;
    case 'original':
    default:
      return imgW / imgH || 1;
  }
}

function App() {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [watermarkText, setWatermarkText] = useState<string>('Copyright CC');
  const [cropStates, setCropStates] = useState<{
    crop: { x: number; y: number };
    zoom: number;
    croppedAreaPixels: any;
    aspectRatio: AspectRatioOption;
    customW: number;
    customH: number;
  }[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [compressedSizes, setCompressedSizes] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [watermarkFontSize, setWatermarkFontSize] = useState<number>(18);
  const [watermarkColor, setWatermarkColor] = useState<string>('#ffffff');
  const [showCCIcon, setShowCCIcon] = useState<boolean>(false);
  const [watermarkPosition, setWatermarkPosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'>('bottom-right');
  const [showCopyrightSymbol, setShowCopyrightSymbol] = useState<boolean>(false);

  // Initial File Upload
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const files = Array.from(event.target.files);
    setImageFiles(files);
    setImageUrls(files.map((f: File) => URL.createObjectURL(f)));
    setCropStates(files.map(() => ({
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: null,
      aspectRatio: 'original',
      customW: 1,
      customH: 1
    })));
  };

  // Drag & Drop Handler
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const files = Array.from(event.dataTransfer.files).filter((f: File) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setImageFiles(files);
    setImageUrls(files.map((f: File) => URL.createObjectURL(f)));
    setCropStates(files.map(() => ({
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: null,
      aspectRatio: 'original',
      customW: 1,
      customH: 1
    })));
  };
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };
  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
  };
  const handleDropzoneClick = () => {
    fileInputRef.current?.click();
  };

  // Preview für ein Bild generieren
  const updatePreviewForIndex = async (idx: number, cropStateOverride?: Partial<typeof cropStates[0]>) => {
    const file = imageFiles[idx];
    const imgUrl = imageUrls[idx];
    const cropState = { ...cropStates[idx], ...cropStateOverride };
    if (!file || !imgUrl || !cropState?.croppedAreaPixels) return;
    const croppedBlob = await getCroppedImg(
      imgUrl,
      cropState.croppedAreaPixels,
      file,
      cropState.aspectRatio,
      cropState.customW,
      cropState.customH
    );
    // Komprimierung: verlustfrei
    let compressedFile: File | Blob = croppedBlob;
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      compressedFile = await imageCompression(croppedBlob, {
        quality: 1.0,
        fileType: 'image/jpeg',
        maxSizeMB: 10,
      });
    } else if (file.type === 'image/png') {
      // PNG: keine Komprimierung, nur Resize falls nötig
      compressedFile = await imageCompression(croppedBlob, {
        fileType: 'image/png',
        maxSizeMB: 10,
        quality: 1.0,
      });
    }
    const text = showCopyrightSymbol ? `© ${watermarkText}` : watermarkText;
    const watermarkedUrl = await addWatermarkToImage(compressedFile, text, file.type);
    setPreviewUrls(prev => {
      const next = [...prev];
      next[idx] = watermarkedUrl;
      return next;
    });
    setCompressedSizes(prev => {
      const next = [...prev];
      next[idx] = compressedFile.size;
      return next;
    });
  };

  // Cropping-Callback pro Bild
  const onCropChange = (idx: number, crop: { x: number; y: number }) => {
    setCropStates(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], crop };
      return next;
    });
  };
  const onZoomChange = (idx: number, zoom: number) => {
    setCropStates(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], zoom };
      return next;
    });
  };
  const onCropComplete = (idx: number, croppedArea: any, croppedAreaPixels: any) => {
    setCropStates(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], croppedAreaPixels };
      return next;
    });
    // Preview sofort aktualisieren
    updatePreviewForIndex(idx, { croppedAreaPixels });
  };

  // Seitenverhältnis pro Bild ändern
  const handleAspectRatioChange = (idx: number, value: AspectRatioOption) => {
    setCropStates(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], aspectRatio: value };
      return next;
    });
  };
  const handleCustomWChange = (idx: number, value: number) => {
    setCropStates(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], customW: value };
      return next;
    });
  };
  const handleCustomHChange = (idx: number, value: number) => {
    setCropStates(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], customH: value };
      return next;
    });
  };

  // Previews automatisch neu generieren, wenn relevante Werte sich ändern
  useEffect(() => {
    const updateAllPreviews = async () => {
      if (!imageFiles.length) return;
      for (let i = 0; i < imageFiles.length; i++) {
        await updatePreviewForIndex(i);
      }
    };
    updateAllPreviews();
    // eslint-disable-next-line
  }, [imageFiles, imageUrls, watermarkText, watermarkFontSize, watermarkColor, watermarkPosition, showCopyrightSymbol]);

  // Cropping, Komprimierung, Wasserzeichen für alle Bilder
  const handleProcessAll = async () => {
    setIsProcessing(true);
    const pairs: ImagePair[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const imgUrl = imageUrls[i];
      const cropState = cropStates[i];
      const croppedBlob = await getCroppedImg(imgUrl, cropState.croppedAreaPixels, file, cropState.aspectRatio, cropState.customW, cropState.customH);
      const compressedFile = await imageCompression(croppedBlob, {
        maxWidthOrHeight: MAX_WIDTH,
        useWebWorker: true,
        initialQuality: 0.7,
      });
      const watermarkedUrl = await addWatermarkToImage(compressedFile, watermarkText);
      pairs.push({ originalUrl: imgUrl, croppedUrl: watermarkedUrl, name: file.name });
    }
    setPreviewUrls(pairs.map(pair => pair.croppedUrl));
    setIsProcessing(false);
  };

  // Cropping Utility
  const getCroppedImg = (imageSrc: string, crop: any, file: File, aspect: AspectRatioOption, customW: number, customH: number) => {
    return new Promise<Blob>((resolve) => {
      const img = new window.Image();
      img.src = imageSrc;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = getAspectRatio(aspect, customW, customH, img.width, img.height);
        let width = crop.width;
        let height = crop.height;
        if (!width || !height) {
          // fallback: ganzes Bild
          width = img.width;
          height = img.height;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);
        ctx.drawImage(
          img,
          crop.x,
          crop.y,
          width,
          height,
          0,
          0,
          width,
          height
        );
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        }, 'image/jpeg', 0.95);
      };
    });
  };

  // Wasserzeichen
  const addWatermarkToImage = async (file: File | Blob, text: string, fileType: string = 'image/jpeg'): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Keine Resize mehr, immer Originalgröße
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(img.src);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.font = `bold ${watermarkFontSize}px Arial`;
        ctx.fillStyle = watermarkColor + 'cc';
        ctx.textAlign = watermarkPosition.includes('right') ? 'right' : 'left';
        ctx.textBaseline = watermarkPosition.includes('bottom') ? 'bottom' : 'top';
        let offset = 10;
        let x = watermarkPosition.includes('right') ? canvas.width - offset : offset;
        let y = watermarkPosition.includes('bottom') ? canvas.height - offset : offset;
        ctx.fillText(text, x, y);
        // Speichere mit Qualität 1.0
        if (fileType === 'image/png') {
          resolve(canvas.toDataURL('image/png'));
        } else {
          resolve(canvas.toDataURL('image/jpeg', 1.0));
        }
      };
    });
  };

  // Einzel-Download-Button pro Bild
  const handleDownload = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `cc-${name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download alle als ZIP
  const handleDownloadAll = async () => {
    const zip = new JSZip();
    for (let i = 0; i < previewUrls.length; i++) {
      const url = previewUrls[i];
      if (!url) continue;
      const response = await fetch(url);
      const blob = await response.blob();
      zip.file(`cc-${imageFiles[i]?.name || 'image' + i}.jpg`, blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = 'cc-images.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen min-w-screen w-full h-full bg-gray-100 p-0 m-0">
      <div className="w-full h-full flex flex-col pl-30 pr-30 pt-10 pb-10">
        <div className="flex-1 flex flex-col justify-center items-center">
          <div className="w-full bg-white rounded shadow p-6 m-0">
            <h1 className="text-2xl font-bold mb-4 text-center">ImageTool – Copyright CC, Cropping & Komprimierung</h1>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div
                className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors duration-200 ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-100 hover:border-blue-400'}`}
                onClick={handleDropzoneClick}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleDropzoneClick(); }}
                style={{ minHeight: 120 }}
                aria-label="Bilder hierher ziehen oder klicken zum Auswählen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4a1 1 0 011-1h8a1 1 0 011 1v12m-4 4h-4a1 1 0 01-1-1v-4h6v4a1 1 0 01-1 1z" /></svg>
                <span className="text-gray-600 text-center">Bilder hierher ziehen<br/>oder klicken zum Auswählen</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  tabIndex={-1}
                />
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <input
                type="text"
                value={watermarkText}
                onChange={e => setWatermarkText(e.target.value)}
                placeholder="Copyright-Text (z.B. Copyright CC)"
                className="block w-full border rounded px-2 py-1 mb-2 md:mb-0"
              />
              <div className="flex flex-col md:flex-row items-center gap-2">
                <label className="font-semibold">Größe:</label>
                <input
                  type="range"
                  min={10}
                  max={64}
                  value={watermarkFontSize}
                  onChange={e => setWatermarkFontSize(Number(e.target.value))}
                  className="w-32"
                />
                <span className="w-10 text-center">{watermarkFontSize}px</span>
                <label className="font-semibold ml-4">Farbe:</label>
                <input
                  type="color"
                  value={watermarkColor}
                  onChange={e => setWatermarkColor(e.target.value)}
                  className="w-8 h-8 p-0 border-0 bg-transparent"
                  title="Farbe wählen"
                />
                {/* Slide Toggle für CC-Icon + Trademark */}
                <label className="flex items-center ml-4 cursor-pointer select-none">
                  <span className="mr-2">™</span>
                  <span className="mr-2">CC-Icon</span>
                  <span className="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                    <input
                      type="checkbox"
                      checked={showCCIcon}
                      onChange={() => setShowCCIcon(v => !v)}
                      className="absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-200 ease-in shadow"
                      style={{ left: showCCIcon ? '20px' : '0px', top: '0px' }}
                    />
                    <span
                      className={`block overflow-hidden h-6 rounded-full bg-gray-300 transition-all duration-200 ease-in ${showCCIcon ? 'bg-blue-600' : ''}`}
                      style={{ width: '40px' }}
                    ></span>
                  </span>
                </label>
                <label className="font-semibold ml-4">Position:</label>
                <select
                  className="border rounded px-2 py-1"
                  value={watermarkPosition}
                  onChange={e => setWatermarkPosition(e.target.value as any)}
                  title="Wasserzeichen-Position wählen"
                >
                  <option value="bottom-right">Rechts unten</option>
                  <option value="bottom-left">Links unten</option>
                  <option value="top-right">Rechts oben</option>
                  <option value="top-left">Links oben</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-8">
              {imageUrls.map((url: string, idx: number) => (
                <div key={idx} className="flex flex-col md:flex-row gap-8 items-start justify-center bg-gray-50 p-4 rounded shadow">
                  {/* Originalbild */}
                  <div className="flex flex-col items-center">
                    <div className="text-sm text-gray-500 mb-1">Original</div>
                    <img
                      src={url}
                      alt="Original"
                      className="max-w-[520px] max-h-[380px] border mb-2"
                    />
                    <div className="text-xs text-gray-400 mb-2">
                      Größe: {(imageFiles[idx]?.size / 1024).toFixed(1)} kB
                    </div>
                  </div>
                  {/* Cropper für Ausschnitt */}
                  <div className="flex flex-col items-center">
                    <div className="text-sm text-gray-500 mb-1">Ausschnitt wählen</div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="font-semibold">Seitenverhältnis:</label>
                      <select
                        className="border rounded px-2 py-1"
                        value={cropStates[idx]?.aspectRatio || 'original'}
                        onChange={e => handleAspectRatioChange(idx, e.target.value as AspectRatioOption)}
                      >
                        <option value="original">Original</option>
                        <option value="16:9">16:9</option>
                        <option value="4:3">4:3</option>
                        <option value="1:1">1:1</option>
                        <option value="custom">Custom</option>
                      </select>
                      {cropStates[idx]?.aspectRatio === 'custom' && (
                        <>
                          <input
                            type="number"
                            min={1}
                            value={cropStates[idx]?.customW || 1}
                            onChange={e => handleCustomWChange(idx, Number(e.target.value))}
                            className="w-16 border rounded px-1 py-1"
                            placeholder="Breite"
                          />
                          <span>:</span>
                          <input
                            type="number"
                            min={1}
                            value={cropStates[idx]?.customH || 1}
                            onChange={e => handleCustomHChange(idx, Number(e.target.value))}
                            className="w-16 border rounded px-1 py-1"
                            placeholder="Höhe"
                          />
                        </>
                      )}
                    </div>
                    <div className="relative w-[380px] h-[280px] bg-black mb-2">
                      <Cropper
                        image={url}
                        crop={cropStates[idx]?.crop || { x: 0, y: 0 }}
                        zoom={cropStates[idx]?.zoom || 1}
                        aspect={getAspectRatio(
                          cropStates[idx]?.aspectRatio || 'original',
                          cropStates[idx]?.customW || 1,
                          cropStates[idx]?.customH || 1,
                          4, 3
                        )}
                        onCropChange={crop => onCropChange(idx, crop)}
                        onZoomChange={zoom => onZoomChange(idx, zoom)}
                        onCropComplete={(croppedArea, croppedAreaPixels) => onCropComplete(idx, croppedArea, croppedAreaPixels)}
                      />
                    </div>
                  </div>
                  {/* Vorschau: aktueller Ausschnitt mit Copyright */}
                  <div className="flex flex-col items-center">
                    <div className="text-sm text-gray-500 mb-1">Vorschau (aktueller Ausschnitt mit Copyright)</div>
                    {previewUrls[idx] ? (
                      <>
                        <img
                          src={previewUrls[idx]}
                          alt="Preview"
                          className="max-w-[520px] max-h-[380px] border mb-2"
                        />
                        <div className="text-xs text-gray-400 mb-2">
                          Größe: {compressedSizes[idx] ? (compressedSizes[idx] / 1024).toFixed(1) : '?'} kB
                        </div>
                        <button
                          className="mt-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                          onClick={() => handleDownload(previewUrls[idx], imageFiles[idx]?.name || `image${idx}`)}
                        >
                          Download
                        </button>
                      </>
                    ) : (
                      <div className="w-[520px] h-[380px] flex items-center justify-center text-gray-400 border mb-2 bg-white">Noch kein Ausschnitt</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Ganz unten: Download-alle-Button */}
            {previewUrls.length > 0 && (
              <div className="flex justify-center mt-8">
                <button
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  onClick={handleDownloadAll}
                >
                  Alle komprimieren & herunterladen
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

