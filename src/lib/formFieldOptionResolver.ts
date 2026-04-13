import type {
  CityOption,
  CompanyDesignation,
  DistrictOption,
  PublicPaymentState,
  SignupFormFieldV2
} from './supabase';

export interface SelectOption {
  value: string;
  label: string;
}

const CONTROLLED_FIELD_KEYS = new Set([
  'gender',
  'state',
  'district',
  'city',
  'company_designation_id',
  'payment_mode',
  'gst_registered',
  'esic_registered',
  'epf_registered'
]);

const STATIC_CONTROLLED_OPTIONS: Record<string, SelectOption[]> = {
  gender: [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' }
  ],
  payment_mode: [
    { value: 'QR Code / UPI', label: 'QR Code / UPI' },
    { value: 'Bank Transfer (NEFT/RTGS/IMPS)', label: 'Bank Transfer (NEFT/RTGS/IMPS)' },
    { value: 'Cheque', label: 'Cheque' },
    { value: 'Demand Draft', label: 'Demand Draft' },
    { value: 'Cash', label: 'Cash' }
  ],
  gst_registered: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' }
  ],
  esic_registered: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' }
  ],
  epf_registered: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' }
  ]
};

export interface ControlledOptionSources {
  states?: PublicPaymentState[];
  districts?: DistrictOption[];
  cities?: CityOption[];
  designations?: CompanyDesignation[];
}

const toUniqueOptions = (options: SelectOption[]): SelectOption[] => {
  const seen = new Set<string>();
  const deduped: SelectOption[] = [];
  for (const option of options) {
    const value = option.value?.trim() ?? '';
    if (!value || seen.has(value)) continue;
    seen.add(value);
    deduped.push({ value, label: option.label?.trim() || value });
  }
  return deduped;
};

const toOptionItems = (optionItems?: string[] | null): SelectOption[] =>
  toUniqueOptions((optionItems || []).map(item => ({ value: item, label: item })));

export const hasControlledSelectSource = (fieldKey: string): boolean =>
  CONTROLLED_FIELD_KEYS.has((fieldKey || '').trim().toLowerCase());

const resolveControlledOptions = (
  fieldKey: string,
  sources?: ControlledOptionSources
): SelectOption[] | null => {
  const key = (fieldKey || '').trim().toLowerCase();
  if (!hasControlledSelectSource(key)) {
    return null;
  }

  if (STATIC_CONTROLLED_OPTIONS[key]) {
    return STATIC_CONTROLLED_OPTIONS[key];
  }

  if (key === 'state') {
    return toUniqueOptions((sources?.states || []).map(item => ({
      value: item.state,
      label: item.state
    })));
  }

  if (key === 'district') {
    return toUniqueOptions((sources?.districts || []).map(item => ({
      value: item.district_name,
      label: item.district_name
    })));
  }

  if (key === 'city') {
    return toUniqueOptions((sources?.cities || []).map(item => ({
      value: item.city_name,
      label: item.city_name
    })));
  }

  if (key === 'company_designation_id') {
    return toUniqueOptions((sources?.designations || []).map(item => ({
      value: item.id,
      label: item.designation_name
    })));
  }

  return [];
};

export const resolveSelectOptions = (
  field: Pick<SignupFormFieldV2, 'field_key' | 'field_type' | 'option_items'>,
  sources?: ControlledOptionSources
): SelectOption[] => {
  if (field.field_type !== 'select') {
    return [];
  }

  const controlled = resolveControlledOptions(field.field_key, sources);
  if (controlled !== null) {
    return toUniqueOptions(controlled);
  }

  return toOptionItems(field.option_items);
};

export const canSelectFieldBeRequired = (
  field: Pick<SignupFormFieldV2, 'field_key' | 'field_type' | 'option_items'>
): boolean => {
  if (field.field_type !== 'select') {
    return true;
  }

  if (hasControlledSelectSource(field.field_key)) {
    return true;
  }

  return (field.option_items || []).length > 0;
};
