import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

export function BarcodeLabel({ value, name }: { value: string; name: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const valid = useMemo(() => {
    if (!/^[\x20-\x7e]{1,64}$/.test(value)) return false;
    try { JsBarcode({}, value, { format: 'CODE128' }); return true; } catch { return false; }
  }, [value]);
  useEffect(() => {
    if (!ref.current) return;
    if (valid) {
      JsBarcode(ref.current, value, { format: 'CODE128', width: 2, height: 55, margin: 16, displayValue: true, fontSize: 16 });
    } else ref.current.replaceChildren();
  }, [value, valid]);
  return <section className="space-y-2 min-w-0"><div className="barcode-label-print bg-white text-black p-3 overflow-x-auto"><p className="break-words">{name}</p><svg ref={ref} role="img" aria-label={`Barcode label ${value}`} className="max-w-full h-auto" /></div>
    {valid ? <><button type="button" className="underline min-h-11" onClick={() => window.print()}>Print barcode label / Save PDF</button><p className="text-sm">Code 128 label. Print at actual size and verify a sample with your scanner.</p></> : <p role="alert">This barcode cannot be printed as a Code 128 label. Use 1–64 printable ASCII characters.</p>}
  </section>;
}

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorConstructor = new () => Detector;
export function BarcodeCamera({ onDetected }: { onDetected: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null); const generation = useRef(0); const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [active, setActive] = useState(false); const [message, setMessage] = useState('');
  const DetectorApi = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  const supported = !!DetectorApi && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
  const release = () => { generation.current++; clearTimeout(timer.current); stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null; };
  useEffect(() => () => release(), []);
  const stop = () => { release(); setActive(false); };
  const start = async () => {
    if (!supported) return;
    stop(); const run = generation.current; setActive(true); setMessage('Point the camera at a barcode. Frames stay on this device.');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (generation.current !== run || !video.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; video.current.srcObject = media; await video.current.play();
      const detector = new DetectorApi();
      const scan = async () => {
        if (run !== generation.current || !video.current) return;
        try {
          const found = await detector.detect(video.current);
          if (run !== generation.current) return;
          const code = found.find(x => x.rawValue.trim().length > 0 && x.rawValue.length <= 128)?.rawValue.trim();
          if (code) { stop(); setMessage('Barcode captured. Review the lookup result.'); onDetected(code); return; }
          timer.current = setTimeout(() => void scan(), 250);
        } catch { if (run === generation.current) { stop(); setMessage('Camera scanning failed. Enter the barcode instead.'); } }
      };
      await scan();
    } catch { if (run === generation.current) { stop(); setMessage('Camera access is unavailable or was denied. Enter the barcode instead.'); } }
  };
  return <div className="mt-3 space-y-2">
    {supported ? <button type="button" className="underline min-h-11" onClick={() => active ? stop() : void start()}>{active ? 'Stop camera' : 'Scan with camera'}</button> : <p className="text-sm">Camera barcode scanning is not supported by this browser. Enter the code or use a USB scanner.</p>}
    <video ref={video} hidden={!active} muted playsInline aria-label="Barcode camera preview" className="w-full max-h-64 rounded" />
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
