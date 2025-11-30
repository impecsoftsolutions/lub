import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface ValidationRule {
  id: string;
  rule_name: string;
  rule_type: string;
  category: string;
  validation_pattern: string;
  error_message: string;
  description: string;
  is_active: boolean;
  display_order: number;
}

interface CheckResult {
  allRules: ValidationRule[];
  activeRules: ValidationRule[];
  missingRules: string[];
  inactiveRules: string[];
  mappingIssues: string[];
}

const ValidationCheck: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkValidationRules();
  }, []);

  const checkValidationRules = async () => {
    try {
      setLoading(true);
      setError(null);

      // Query all validation rules
      const { data: allRules, error: allError } = await supabase
        .from('validation_rules')
        .select('*')
        .order('display_order');

      if (allError) {
        setError('Error fetching validation rules: ' + allError.message);
        return;
      }

      // Query active rules
      const { data: activeRules } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      // Expected rules
      const expectedRules = [
        'email_format',
        'mobile_number',
        'gst_number',
        'pan_number',
        'aadhaar_number',
        'pin_code'
      ];

      const missingRules: string[] = [];
      const inactiveRules: string[] = [];

      for (const expectedRule of expectedRules) {
        const found = allRules?.find(r => r.rule_name === expectedRule);
        if (!found) {
          missingRules.push(expectedRule);
        } else if (!found.is_active) {
          inactiveRules.push(expectedRule);
        }
      }

      // Field mapping check
      const fieldMapping: Record<string, string> = {
        'email': 'email_format',
        'mobile_number': 'mobile_number',
        'alternate_mobile': 'mobile_number',
        'pin_code': 'pin_code',
        'pan_company': 'pan_number',
        'gst_number': 'gst_number'
      };

      const mappingIssues: string[] = [];

      for (const [field, ruleName] of Object.entries(fieldMapping)) {
        const found = allRules?.find(r => r.rule_name === ruleName);
        if (!found) {
          mappingIssues.push(field + ' → ' + ruleName + ' (missing)');
        } else if (!found.is_active) {
          mappingIssues.push(field + ' → ' + ruleName + ' (inactive)');
        }
      }

      setResult({
        allRules: allRules || [],
        activeRules: activeRules || [],
        missingRules,
        inactiveRules,
        mappingIssues
      });
    } catch (err) {
      setError('Unexpected error: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Checking validation rules...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-start">
              <XCircle className="w-6 h-6 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-red-900 mb-2">Error</h3>
                <p className="text-red-800">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const hasIssues = result.missingRules.length > 0 || result.inactiveRules.length > 0 || result.mappingIssues.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Validation Rules Database Check</h1>

        {/* Summary */}
        <div className={`border rounded-lg p-6 mb-6 ${hasIssues ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-start">
            {hasIssues ? (
              <AlertCircle className="w-6 h-6 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-6 h-6 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="text-xl font-semibold mb-4">Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Total Rules</p>
                  <p className="text-2xl font-bold">{result.allRules.length}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Active Rules</p>
                  <p className="text-2xl font-bold text-green-600">{result.activeRules.length}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Missing Rules</p>
                  <p className={`text-2xl font-bold ${result.missingRules.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {result.missingRules.length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Mapping Issues</p>
                  <p className={`text-2xl font-bold ${result.mappingIssues.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {result.mappingIssues.length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Issues */}
        {hasIssues && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Issues Found</h2>

            {result.missingRules.length > 0 && (
              <div className="mb-4">
                <h3 className="text-lg font-medium text-red-900 mb-2 flex items-center">
                  <XCircle className="w-5 h-5 mr-2" />
                  Missing Rules ({result.missingRules.length})
                </h3>
                <ul className="list-disc list-inside text-red-800">
                  {result.missingRules.map(rule => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.inactiveRules.length > 0 && (
              <div className="mb-4">
                <h3 className="text-lg font-medium text-yellow-900 mb-2 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Inactive Rules ({result.inactiveRules.length})
                </h3>
                <ul className="list-disc list-inside text-yellow-800">
                  {result.inactiveRules.map(rule => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.mappingIssues.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-red-900 mb-2 flex items-center">
                  <XCircle className="w-5 h-5 mr-2" />
                  Field Mapping Issues ({result.mappingIssues.length})
                </h3>
                <ul className="list-disc list-inside text-red-800">
                  {result.mappingIssues.map(issue => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* All Rules */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">All Validation Rules</h2>

          {result.allRules.length === 0 ? (
            <p className="text-gray-600">No validation rules found in database.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rule Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {result.allRules.map(rule => (
                    <tr key={rule.id} className={!rule.is_active ? 'bg-gray-50' : ''}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rule.rule_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{rule.rule_type}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{rule.category}</td>
                      <td className="px-4 py-3 text-sm">
                        {rule.is_active ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            <XCircle className="w-3 h-3 mr-1" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{rule.error_message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ValidationCheck;
