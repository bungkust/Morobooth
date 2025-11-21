import React, { useState, useRef, useEffect } from 'react';
import { getPrinterSizeSettings } from '../services/configService';

interface Template {
  id: string;
  name: string;
  description: string;
  width: number; // mm
  height: number; // mm
  photoCount: number;
  layout: 'vertical' | 'horizontal' | 'grid';
  thermalSize: '58mm' | '80mm';
  customText?: string;
  customSubtext?: string;
}

interface TemplateSelectorProps {
  onTemplateSelected: (template: Template) => void;
  onBack?: () => void;
}

// Base templates (akan di-adjust berdasarkan settings)
const baseTemplates: Omit<Template, 'width' | 'thermalSize'>[] = [
  {
    id: 'single-photo',
    name: 'Single Portrait',
    description: '1 large photo in portrait orientation - perfect for individual shots',
    height: 80,
    photoCount: 1,
    layout: 'vertical',
  },
  {
    id: 'strip-horizontal',
    name: 'Double Strip',
    description: '2 photos stacked vertically - great for couples or friends',
    height: 120,
    photoCount: 2,
    layout: 'vertical',
  },
  {
    id: 'strip-vertical',
    name: 'Classic Strip',
    description: '3 photos stacked vertically - traditional photo booth style',
    height: 180,
    photoCount: 3,
    layout: 'vertical',
  },
  {
    id: 'strip-double',
    name: 'Quad Strip',
    description: '4 photos in 2x2 grid - perfect for group photos',
    height: 200,
    photoCount: 4,
    layout: 'grid',
  }
];

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onTemplateSelected, onBack }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [, setAdminTapCount] = useState<number>(0);
  const adminTapTimeoutRef = useRef<number | null>(null);
  
  // Load printer size from settings
  const [printerSize, setPrinterSize] = useState(getPrinterSizeSettings());

  // Update when settings change
  useEffect(() => {
    const updateSize = () => {
      const newSize = getPrinterSizeSettings();
      setPrinterSize(newSize);
      console.log('TemplateSelector: Printer size updated:', newSize);
    };

    // Check on mount
    updateSize();

    // Listen for storage changes (if changed in different tab/window)
    window.addEventListener('storage', updateSize);
    
    // Listen for custom event from AdminPage (same window)
    const handleSettingsChange = () => {
      updateSize();
    };
    window.addEventListener('printerSizeSettingsChanged', handleSettingsChange);
    
    // Also check periodically as fallback (reduced to 3 seconds)
    const interval = setInterval(updateSize, 3000);

    return () => {
      window.removeEventListener('storage', updateSize);
      window.removeEventListener('printerSizeSettingsChanged', handleSettingsChange);
      clearInterval(interval);
    };
  }, []);

  // Generate templates based on printer size settings
  const templates: Template[] = baseTemplates.map(template => ({
    ...template,
    width: printerSize.width,
    thermalSize: printerSize.thermalSize
  }));

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
  };

  const handleContinue = () => {
    const template = templates.find(t => t.id === selectedTemplateId);
    if (template) {
      onTemplateSelected(template);
    }
  };

  const handleAdminSecretTap = () => {
    setAdminTapCount((prev) => {
      const next = prev + 1;
      if (adminTapTimeoutRef.current) {
        window.clearTimeout(adminTapTimeoutRef.current);
        adminTapTimeoutRef.current = null;
      }

      if (next >= 4) {
        setTimeout(() => {
          window.location.href = '/admin';
        }, 0);
        return 0;
      }

      adminTapTimeoutRef.current = window.setTimeout(() => {
        setAdminTapCount(0);
        adminTapTimeoutRef.current = null;
      }, 1500);
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (adminTapTimeoutRef.current) {
        window.clearTimeout(adminTapTimeoutRef.current);
      }
    };
  }, []);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div id="template-selector">
      <div className="template-content">
        <h1 onClick={handleAdminSecretTap} style={{ cursor: 'pointer' }}>
          Morobooth
        </h1>
        <p className="template-subtitle">Choose Your Photo Layout</p>
        
        <div className="template-dropdown-container">
          <label htmlFor="template-select" className="dropdown-label">
            Select Layout:
          </label>
          <select
            id="template-select"
            value={selectedTemplateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="template-dropdown"
          >
            <option value="">-- Choose Template --</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        {selectedTemplate && (
          <div className="template-preview-card">
            <h3>{selectedTemplate.name}</h3>
            <p>{selectedTemplate.description}</p>
            <div className="template-specs">
              <div className="spec-row">
                <div className="spec-item">
                  <span className="spec-label">Photos:</span>
                  <span className="spec-value">{selectedTemplate.photoCount}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Layout:</span>
                  <span className="spec-value">{selectedTemplate.layout}</span>
                </div>
              </div>
              <div className="spec-description">
                {selectedTemplate.layout === 'vertical' && selectedTemplate.photoCount === 1 && 'Perfect for individual portraits and solo shots'}
                {selectedTemplate.layout === 'vertical' && selectedTemplate.photoCount > 1 && 'Traditional photo booth style with photos stacked vertically'}
                {selectedTemplate.layout === 'horizontal' && 'Great for couples, friends, or side-by-side poses'}
                {selectedTemplate.layout === 'grid' && 'Ideal for group photos and family shots in a neat 2x2 arrangement'}
              </div>
            </div>
          </div>
        )}

        <button 
          className="continue-button"
          onClick={handleContinue}
          disabled={!selectedTemplateId}
        >
          {selectedTemplate ? `Continue with ${selectedTemplate.name}` : 'Select a Template'}
        </button>
      </div>
      {onBack && (
        <div className="template-footer">
          <div className="footer-buttons">
            <button className="back-btn" onClick={onBack}>
              ← Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
