import React, { useState } from 'react';

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
}

const templates: Template[] = [
  {
    id: 'single-photo',
    name: 'Single Portrait',
    description: '1 large photo in portrait orientation - perfect for individual shots',
    width: 58,
    height: 80,
    photoCount: 1,
    layout: 'vertical',
    thermalSize: '58mm'
  },
  {
    id: 'strip-horizontal',
    name: 'Double Strip',
    description: '2 photos stacked vertically - great for couples or friends',
    width: 58,
    height: 120,
    photoCount: 2,
    layout: 'vertical',
    thermalSize: '58mm'
  },
  {
    id: 'strip-vertical',
    name: 'Classic Strip',
    description: '3 photos stacked vertically - traditional photo booth style',
    width: 58,
    height: 180,
    photoCount: 3,
    layout: 'vertical',
    thermalSize: '58mm'
  },
  {
    id: 'strip-double',
    name: 'Quad Strip',
    description: '4 photos in 2x2 grid - perfect for group photos',
    width: 58,
    height: 200,
    photoCount: 4,
    layout: 'grid',
    thermalSize: '58mm'
  }
];

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onTemplateSelected }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
  };

  const handleContinue = () => {
    const template = templates.find(t => t.id === selectedTemplateId);
    if (template) {
      onTemplateSelected(template);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div id="template-selector">
      <div className="template-content">
        <h1>Morobooth</h1>
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
    </div>
  );
};
