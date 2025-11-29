import React, { useEffect, useState } from 'react';
import './PrintAnimationModal.css';

interface PrintAnimationModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageDataURL?: string | null;
}

export const PrintAnimationModal: React.FC<PrintAnimationModalProps> = ({
  isOpen,
  onClose,
  imageDataURL
}) => {
  const [animationStage, setAnimationStage] = useState<'printing' | 'thankyou'>('printing');
  const [showThankYou, setShowThankYou] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAnimationStage('printing');
      setShowThankYou(false);
      
      // Setelah 2.5 detik animasi printing selesai, tampilkan thank you
      const timer = setTimeout(() => {
        setAnimationStage('thankyou');
        setShowThankYou(true);
      }, 2500);

      // Auto close setelah 3 detik thank you (total 5.5 detik)
      const closeTimer = setTimeout(() => {
        onClose();
      }, 5500);

      return () => {
        clearTimeout(timer);
        clearTimeout(closeTimer);
      };
    } else {
      setAnimationStage('printing');
      setShowThankYou(false);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="print-animation-overlay">
      <div className="print-animation-container">
        {/* Printer Thermal Illustration */}
        <div className="printer-thermal">
          <div className="printer-body">
            <div className="printer-top"></div>
            <div className="printer-paper-slot">
              {/* Photo yang keluar dari printer */}
              {imageDataURL && (
                <div className={`printing-photo ${animationStage === 'printing' ? 'printing' : 'printed'}`}>
                  <img src={imageDataURL} alt="Printing" />
                </div>
              )}
              {/* Placeholder jika tidak ada image */}
              {!imageDataURL && (
                <div className={`printing-photo ${animationStage === 'printing' ? 'printing' : 'printed'}`}>
                  <div className="photo-placeholder"></div>
                </div>
              )}
            </div>
            <div className="printer-bottom"></div>
          </div>
        </div>

        {/* Thank You Message */}
        {showThankYou && (
          <div className={`thank-you-message ${showThankYou ? 'show' : ''}`}>
            <h2>Terimakasih</h2>
          </div>
        )}

        {/* Loading indicator saat printing */}
        {animationStage === 'printing' && (
          <div className="printing-indicator">
            <p>Mencetak...</p>
          </div>
        )}
      </div>
    </div>
  );
};

