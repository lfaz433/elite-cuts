import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

const ScannerModal = ({ onClose, currentBarber, handleCheckInSuccess }: any) => {
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, (text) => {
      const data = JSON.parse(text);
      if (data.type === 'check-in' && data.barberId === currentBarber?.id) {
        html5QrCode.stop().then(() => handleCheckInSuccess());
      }
    }, () => {}).then(() => setIsLoading(false)).catch(() => onClose());
    return () => { if (html5QrCode.isScanning) html5QrCode.stop(); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#141414] rounded-3xl p-8 text-center border border-[#D4AF37]/30">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40"><X /></button>
        <h3 className="text-xl font-bold text-white mb-6">Scanner QR</h3>
        <div className="relative aspect-square mb-4">
          {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10"><div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div></div>}
          <div id="qr-reader" className="w-full h-full rounded-2xl overflow-hidden bg-black"></div>
        </div>
      </div>
    </div>
  );
};

export default ScannerModal;
