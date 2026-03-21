import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

export interface FieldCorrectionStep {
  fieldName: string;
  label: string;
  value: string;
}

interface FieldCorrectionStepperProps {
  fields: FieldCorrectionStep[];
  onFieldConfirmed: (fieldName: string, value: string) => void;
  onComplete: () => void;
  onDiscard: () => void;
}

const FieldCorrectionStepper: React.FC<FieldCorrectionStepperProps> = ({
  fields,
  onFieldConfirmed,
  onComplete,
  onDiscard
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentValue, setCurrentValue] = useState('');

  const currentField = useMemo(() => fields[currentIndex] ?? null, [fields, currentIndex]);
  const isLastField = currentIndex === fields.length - 1;

  useEffect(() => {
    setCurrentIndex(0);
  }, [fields]);

  useEffect(() => {
    setCurrentValue(currentField?.value ?? '');
  }, [currentField]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDiscard();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onDiscard]);

  if (!currentField) {
    return null;
  }

  const handleConfirm = () => {
    onFieldConfirmed(currentField.fieldName, currentValue);

    if (isLastField) {
      onComplete();
      return;
    }

    setCurrentIndex(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900">Please check this</h2>
          <button
            type="button"
            onClick={onDiscard}
            className="text-gray-400 transition-colors hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-gray-600">Please make sure this is correct before continuing.</p>

          <div>
            <label htmlFor={`field-correction-${currentField.fieldName}`} className="mb-2 block text-sm font-medium text-gray-700">
              {currentField.label}
            </label>
            <input
              id={`field-correction-${currentField.fieldName}`}
              type="text"
              value={currentValue}
              onChange={(event) => setCurrentValue(event.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {isLastField ? 'Done' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldCorrectionStepper;
