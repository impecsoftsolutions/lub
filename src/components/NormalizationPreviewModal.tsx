// Deprecated: kept temporarily while the single-field correction stepper is proven in active flows.
import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';

type PreviewData = Record<string, string | undefined>;

interface NormalizationPreviewModalProps {
  isOpen: boolean;
  original: PreviewData;
  normalized: PreviewData;
  onAcceptNormalized: (data: PreviewData) => void;
  onSubmitOriginal: () => void;
  onClose: () => void;
}

const NormalizationPreviewModal: React.FC<NormalizationPreviewModalProps> = ({
  isOpen,
  original,
  normalized,
  onAcceptNormalized,
  onSubmitOriginal,
  onClose
}) => {
  const [editedData, setEditedData] = useState<PreviewData>(normalized || {});

  useEffect(() => {
    setEditedData(normalized || {});
  }, [normalized]);

  if (!isOpen) return null;
  if (!original || !normalized) return null;

  // FULL list including Products & Services
  const fieldsToCheck = [
    { key: 'full_name', label: 'Full Name' },
    { key: 'company_name', label: 'Company Name' },
    { key: 'company_address', label: 'Company Address' },
    { key: 'products_services', label: 'Products & Services' },
    { key: 'alternate_contact_name', label: 'Alternate Contact Name' },
    { key: 'referred_by', label: 'Referred By' }
  ];

  const changedFields = fieldsToCheck.filter(
    field => original[field.key] !== normalized[field.key]
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center">
            <AlertCircle className="w-6 h-6 text-primary mr-3" />
            <div>
              <h2 className="text-xl font-bold text-foreground">Review Normalized Data</h2>
              <p className="text-sm text-muted-foreground">
                {changedFields.length === 0
                  ? 'No automatic corrections were made. You may still review and confirm.'
                  : `We've suggested ${changedFields.length} improvement(s). Please review:`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {fieldsToCheck.map(field => (
              <div key={field.key} className="border border-border rounded-lg p-4 bg-muted/30">
                <label className="block font-semibold text-foreground mb-3">
                  {field.label}
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Original */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center">
                      <X className="w-4 h-4 text-red-500 mr-1" /> Original
                    </p>
                    <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
                      {original[field.key] || '(empty)'}
                    </div>
                  </div>

                  {/* Normalized - Editable */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                      Normalized (Editable)
                    </p>
                    <input
                      type="text"
                      value={editedData?.[field.key] || ''}
                      onChange={(e) =>
                        setEditedData({ ...(editedData || {}), [field.key]: e.target.value })
                      }
                      className="w-full bg-green-50 border border-green-200 rounded p-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-border rounded-lg text-foreground bg-card hover:bg-muted/50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={onSubmitOriginal}
            className="px-6 py-2 border border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors"
          >
            Submit Original
          </button>
          <button
            onClick={() => onAcceptNormalized({ ...original, ...editedData })}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center"
          >
            <CheckCircle className="w-5 h-5 mr-2" />
            Accept Normalized
          </button>
        </div>

      </div>
    </div>
  );
};

export default NormalizationPreviewModal;
