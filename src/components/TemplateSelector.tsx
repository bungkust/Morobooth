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

  // Render preview icon based on template type
  const renderPreviewIcon = (template: Template) => {
    const iconSize = 80;
    const gap = 4;
    
    if (template.id === 'single-photo') {
      // Single Portrait → 1 rectangle
      return (
        <div className="template-preview-icon">
          <div className="preview-rectangle" style={{ width: `${iconSize * 0.6}px`, height: `${iconSize}px` }} />
        </div>
      );
    } else if (template.id === 'strip-vertical') {
      // Strip Vertical → 3 stacked rectangles
      const rectHeight = (iconSize - gap * 2) / 3;
      return (
        <div className="template-preview-icon">
          <div className="preview-rectangle" style={{ width: `${iconSize * 0.6}px`, height: `${rectHeight}px`, marginBottom: `${gap}px` }} />
          <div className="preview-rectangle" style={{ width: `${iconSize * 0.6}px`, height: `${rectHeight}px`, marginBottom: `${gap}px` }} />
          <div className="preview-rectangle" style={{ width: `${iconSize * 0.6}px`, height: `${rectHeight}px` }} />
        </div>
      );
    } else if (template.id === 'strip-horizontal') {
      // Strip Horizontal → 2 stacked rectangles (vertical layout)
      const rectHeight = (iconSize - gap) / 2;
      return (
        <div className="template-preview-icon">
          <div className="preview-rectangle" style={{ width: `${iconSize * 0.6}px`, height: `${rectHeight}px`, marginBottom: `${gap}px` }} />
          <div className="preview-rectangle" style={{ width: `${iconSize * 0.6}px`, height: `${rectHeight}px` }} />
        </div>
      );
    } else if (template.id === 'strip-double') {
      // Quad Frame → 4 squares in 2×2 layout
      const squareSize = (iconSize - gap) / 2;
      return (
        <div className="template-preview-icon">
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}>
            <div style={{ display: 'flex', gap: `${gap}px` }}>
              <div className="preview-rectangle" style={{ width: `${squareSize}px`, height: `${squareSize}px` }} />
              <div className="preview-rectangle" style={{ width: `${squareSize}px`, height: `${squareSize}px` }} />
            </div>
            <div style={{ display: 'flex', gap: `${gap}px` }}>
              <div className="preview-rectangle" style={{ width: `${squareSize}px`, height: `${squareSize}px` }} />
              <div className="preview-rectangle" style={{ width: `${squareSize}px`, height: `${squareSize}px` }} />
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Map template IDs to display names as per user requirements
  const getDisplayName = (template: Template) => {
    if (template.id === 'single-photo') return 'Single Portrait';
    if (template.id === 'strip-vertical') return 'Strip Vertical';
    if (template.id === 'strip-horizontal') return 'Strip Horizontal';
    if (template.id === 'strip-double') return 'Quad Frame';
    return template.name;
  };

  // Order templates for display: Single Portrait, Strip Vertical, Strip Horizontal, Quad Frame
  const orderedTemplates = [
    templates.find(t => t.id === 'single-photo'),
    templates.find(t => t.id === 'strip-vertical'),
    templates.find(t => t.id === 'strip-horizontal'),
    templates.find(t => t.id === 'strip-double'),
  ].filter(Boolean) as Template[];

  return (
    <div id="template-selector">
      <div className="template-content">
        <h1 onClick={handleAdminSecretTap} style={{ cursor: 'pointer' }}>
          Morobooth
        </h1>
        <p className="template-subtitle">Step 1 of 4</p>
        
        <div className="template-grid-container">
          <div className="template-grid">
            {orderedTemplates.map((template) => {
              const isSelected = selectedTemplateId === template.id;
              return (
                <div
                  key={template.id}
                  className={`template-grid-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleTemplateChange(template.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleTemplateChange(template.id);
                    }
                  }}
                >
                  <div className="template-card-icon">
                    {renderPreviewIcon(template)}
                  </div>
                  <div className="template-card-name">
                    {getDisplayName(template)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button 
          className="continue-button"
          onClick={handleContinue}
          disabled={!selectedTemplateId}
        >
          Continue
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
