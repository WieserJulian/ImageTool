import React, { useState, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import Cropper from 'react-easy-crop';

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
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('original');
  const [customW, setCustomW] = useState(1);
  const [customH, setCustomH] = useState(1);
  const [cropStates, setCropStates] = useState<any[]>([]); // [{crop, zoom, croppedAreaPixels}]
  const [croppedPairs, setCroppedPairs] = useState<ImagePair[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [watermarkFontSize, setWatermarkFontSize] = useState<number>(18);
  const [watermarkColor, setWatermarkColor] = useState<string>('#ffffff'); // Standard: Weiß
  const [showCCIcon, setShowCCIcon] = useState<boolean>(false);
  const [watermarkPosition, setWatermarkPosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'>('bottom-right');

  // Initial File Upload
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const files = Array.from(event.target.files);
    setImageFiles(files);
    setImageUrls(files.map(f => URL.createObjectURL(f)));
    setCropStates(files.map(() => ({ crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null })));
    setCroppedPairs([]);
  };

  // Drag & Drop Handler
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setImageFiles(files);
    setImageUrls(files.map(f => URL.createObjectURL(f)));
    setCropStates(files.map(() => ({ crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null })));
    setCroppedPairs([]);
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

  // Cropping-Callback pro Bild
  const onCropComplete = (idx: number, croppedArea: any, croppedAreaPixels: any) => {
    setCropStates(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], croppedAreaPixels };
      return next;
    });
  };

  // Cropping, Komprimierung, Wasserzeichen für alle Bilder
  const handleProcessAll = async () => {
    setIsProcessing(true);
    const pairs: ImagePair[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const imgUrl = imageUrls[i];
      const cropState = cropStates[i];
      const croppedBlob = await getCroppedImg(imgUrl, cropState.croppedAreaPixels, file, aspectRatio, customW, customH);
      const compressedFile = await imageCompression(croppedBlob, {
        maxWidthOrHeight: MAX_WIDTH,
        useWebWorker: true,
        initialQuality: 0.7,
      });
      const watermarkedUrl = await addWatermarkToImage(compressedFile, watermarkText);
      pairs.push({ originalUrl: imgUrl, croppedUrl: watermarkedUrl, name: file.name });
    }
    setCroppedPairs(pairs);
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
  const addWatermarkToImage = async (file: File | Blob, text: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(MAX_WIDTH / img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
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
        if (showCCIcon) {
          const iconSize = watermarkFontSize + 6;
          const ccSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='${iconSize}' height='${iconSize}' viewBox='0 0 32 32'><circle cx='16' cy='16' r='16' fill='${watermarkColor}' fill-opacity='0.8'/><text x='16' y='22' text-anchor='middle' font-size='16' font-family='Arial' fill='black' font-weight='bold'>CC</text></svg>`;
          const ccImg = new window.Image();
          ccImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(ccSvg);
          ccImg.onload = () => {
            let iconX = x;
            let iconY = y;
            let textX = x;
            let textY = y;
            if (watermarkPosition.includes('right')) {
              iconX = canvas.width - iconSize - offset;
              textX = iconX - 8;
            } else {
              iconX = offset;
              textX = iconX + iconSize + 8;
            }
            if (watermarkPosition.includes('bottom')) {
              iconY = canvas.height - iconSize - offset;
              textY = canvas.height - offset;
            } else {
              iconY = offset;
              textY = offset + iconSize;
            }
            ctx.drawImage(ccImg, iconX, iconY, iconSize, iconSize);
            ctx.fillText(text, textX, textY);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          ccImg.onerror = () => {
            ctx.fillText(text, x, y);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          return;
        }
        ctx.fillText(text, x, y);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
    });
  };

  const handleDownload = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `cc-${name}`;
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
                <button
                  type="button"
                  className={`ml-4 px-3 py-1 rounded border ${showCCIcon ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => setShowCCIcon(v => !v)}
                  title="CC-Icon anzeigen/verstecken"
                >
                  {showCCIcon ? 'CC-Icon: AN' : 'CC-Icon: AUS'}
                </button>
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
            <div className="flex items-center gap-2">
              <label className="font-semibold">Seitenverhältnis:</label>
              <select
                className="border rounded px-2 py-1"
                value={aspectRatio}
                onChange={e => setAspectRatio(e.target.value as AspectRatioOption)}
              >
                <option value="original">Original</option>
                <option value="16:9">16:9</option>
                <option value="4:3">4:3</option>
                <option value="1:1">1:1</option>
                <option value="custom">Custom</option>
              </select>
              {aspectRatio === 'custom' && (
                <>
                  <input
                    type="number"
                    min={1}
                    value={customW}
                    onChange={e => setCustomW(Number(e.target.value))}
                    className="w-16 border rounded px-1 py-1"
                    placeholder="Breite"
                  />
                  <span>:</span>
                  <input
                    type="number"
                    min={1}
                    value={customH}
                    onChange={e => setCustomH(Number(e.target.value))}
                    className="w-16 border rounded px-1 py-1"
                    placeholder="Höhe"
                  />
                </>
              )}
            </div>
            {imageUrls.length > 0 && (
              <button
                className="mb-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={handleProcessAll}
                disabled={isProcessing}
              >
                {isProcessing ? 'Verarbeite...' : 'Alle Bilder croppen & komprimieren'}
              </button>
            )}
            <div className="flex flex-col gap-8">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="flex flex-col md:flex-row gap-8 items-start justify-center bg-gray-50 p-4 rounded shadow">
                  {/* Originalbild */}
                  <div className="flex flex-col items-center">
                    <div className="text-sm text-gray-500 mb-1">Original</div>
                    <img
                      src={url}
                      alt="Original"
                      className="max-w-[520px] max-h-[380px] border mb-2"
                    />
                  </div>
                  {/* Cropper für Ausschnitt */}
                  <div className="flex flex-col items-center">
                    <div className="text-sm text-gray-500 mb-1">Ausschnitt wählen</div>
                    <div className="relative w-[380px] h-[280px] bg-black mb-2">
                      <Cropper
                        image={url}
                        crop={cropStates[idx]?.crop || { x: 0, y: 0 }}
                        zoom={cropStates[idx]?.zoom || 1}
                        aspect={getAspectRatio(aspectRatio, customW, customH, 4, 3)}
                        onCropChange={crop => setCropStates(prev => { const next = [...prev]; next[idx] = { ...next[idx], crop }; return next; })}
                        onZoomChange={zoom => setCropStates(prev => { const next = [...prev]; next[idx] = { ...next[idx], zoom }; return next; })}
                        onCropComplete={(croppedArea, croppedAreaPixels) => onCropComplete(idx, croppedArea, croppedAreaPixels)}
                      />
                    </div>
                  </div>
                  {/* Komponierte Version: Nur der ausgeschnittene Bereich mit Copyright */}
                  <div className="flex flex-col items-center">
                    <div className="text-sm text-gray-500 mb-1">Fertiger Ausschnitt mit Copyright</div>
                    {croppedPairs[idx] ? (
                      <>
                        <img
                          src={croppedPairs[idx].croppedUrl}
                          alt="Bearbeitet"
                          className="max-w-[520px] max-h-[380px] border mb-2"
                        />
                        <button
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                          onClick={() => handleDownload(croppedPairs[idx].croppedUrl, croppedPairs[idx].name)}
                        >
                          Download
                        </button>
                      </>
                    ) : (
                      <div className="w-[520px] h-[380px] flex items-center justify-center text-gray-400 border mb-2 bg-white">Noch nicht verarbeitet</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

