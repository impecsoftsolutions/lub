import React, { useState, useEffect } from 'react';
import {
  CreditCard as Edit2,
  Check,
  X,
  AlertCircle,
  Loader2,
  TestTube,
  Shield,
  FileText,
  MapPin,
  Plus,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Lock
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { validationRulesService, ValidationRule } from '../lib/supabase';
import Toast from '../components/Toast';

const AdminValidationSettings: React.FC = () => {
  const [validationRules, setValidationRules] = useState<ValidationRule[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState(true);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editedPattern, setEditedPattern] = useState('');
  const [editedMessage, setEditedMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const [testRuleName, setTestRuleName] = useState('');
  const [testValue, setTestValue] = useState('');
  const [testResult, setTestResult] = useState<{ isValid: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newRule, setNewRule] = useState({
    rule_name: '',
    rule_type: 'text',
    category: '',
    validation_pattern: '',
    error_message: '',
    description: '',
    display_order: 0
  });
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameCheckResult, setNameCheckResult] = useState<'available' | 'taken' | null>(null);
  const [patternValid, setPatternValid] = useState<boolean | null>(null);
  const [modalTestValue, setModalTestValue] = useState('');
  const [modalTestResult, setModalTestResult] = useState<{ isValid: boolean; message: string } | null>(null);

  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  // Permission checks
  const canManageValidation = useHasPermission('settings.validation.manage');

  useEffect(() => {
    loadValidationRules();
    loadCategories();
  }, []);

  useEffect(() => {
    if (searchQuery && filteredRules.length > 0) {
      const categoriesWithMatches = new Set<string>();
      filteredRules.forEach(rule => categoriesWithMatches.add(rule.category));
      setExpandedCategories(categoriesWithMatches);
    }
  }, [searchQuery]);

  const loadValidationRules = async () => {
    try {
      setIsLoadingRules(true);
      const rules = await validationRulesService.getAllValidationRules();
      setValidationRules(rules);
    } catch (error) {
      console.error('Error loading validation rules:', error);
      showToast('error', 'Failed to load validation rules');
    } finally {
      setIsLoadingRules(false);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await validationRulesService.getAllCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const handleEditClick = (rule: ValidationRule) => {
    setEditingRuleId(rule.id);
    setEditedPattern(rule.validation_pattern);
    setEditedMessage(rule.error_message);
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
    setEditedPattern('');
    setEditedMessage('');
  };

  const handleSaveEdit = async (ruleId: string) => {
    if (!editedPattern.trim() || !editedMessage.trim()) {
      showToast('error', 'Pattern and error message cannot be empty');
      return;
    }

    try {
      setIsSaving(true);

      const testResult = await validationRulesService.testValidationRule(editedPattern, 'test');
      if (testResult.error) {
        showToast('error', testResult.error);
        setIsSaving(false);
        return;
      }

      const result = await validationRulesService.updateValidationRule(ruleId, {
        validation_pattern: editedPattern,
        error_message: editedMessage
      });

      if (result.success) {
        showToast('success', 'Validation rule updated successfully');
        await loadValidationRules();
        setEditingRuleId(null);
        setEditedPattern('');
        setEditedMessage('');
      } else {
        showToast('error', result.error || 'Failed to update rule');
      }
    } catch (error) {
      console.error('Error saving rule:', error);
      showToast('error', 'Failed to update rule');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (ruleId: string, currentStatus: boolean) => {
    try {
      const result = await validationRulesService.toggleValidationRuleActive(ruleId, !currentStatus);

      if (result.success) {
        showToast('success', `Rule ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
        await loadValidationRules();
      } else {
        showToast('error', result.error || 'Failed to toggle rule status');
      }
    } catch (error) {
      console.error('Error toggling rule:', error);
      showToast('error', 'Failed to toggle rule status');
    }
  };

  const handleTestValidation = async () => {
    if (!testRuleName || !testValue) {
      showToast('error', 'Please select a rule and enter a test value');
      return;
    }

    try {
      setIsTesting(true);
      const rule = validationRules.find(r => r.rule_name === testRuleName);

      if (!rule) {
        showToast('error', 'Rule not found');
        return;
      }

      const result = await validationRulesService.testValidationRule(rule.validation_pattern, testValue);

      if (result.error) {
        setTestResult({ isValid: false, message: result.error });
      } else {
        setTestResult({
          isValid: result.isValid,
          message: result.isValid ? 'Validation passed!' : rule.error_message
        });
      }
    } catch (error) {
      console.error('Error testing validation:', error);
      showToast('error', 'Failed to test validation');
    } finally {
      setIsTesting(false);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const handleOpenAddModal = async () => {
    const maxOrder = await validationRulesService.getMaxDisplayOrder();
    setNewRule({
      rule_name: '',
      rule_type: 'text',
      category: '',
      validation_pattern: '',
      error_message: '',
      description: '',
      display_order: maxOrder + 1
    });
    setIsCreatingNewCategory(false);
    setNewCategoryName('');
    setNameCheckResult(null);
    setPatternValid(null);
    setModalTestValue('');
    setModalTestResult(null);
    setShowAddModal(true);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setNewRule({
      rule_name: '',
      rule_type: 'text',
      category: '',
      validation_pattern: '',
      error_message: '',
      description: '',
      display_order: 0
    });
    setIsCreatingNewCategory(false);
    setNewCategoryName('');
    setNameCheckResult(null);
    setPatternValid(null);
  };

  const checkRuleName = async (name: string) => {
    if (!name.trim()) {
      setNameCheckResult(null);
      return;
    }

    setIsCheckingName(true);
    const exists = await validationRulesService.checkRuleNameExists(name);
    setNameCheckResult(exists ? 'taken' : 'available');
    setIsCheckingName(false);
  };

  const handleRuleNameChange = (value: string) => {
    const lowerValue = value.toLowerCase();
    setNewRule(prev => ({ ...prev, rule_name: lowerValue }));
    setNameCheckResult(null);
  };

  const handleRuleNameBlur = () => {
    if (newRule.rule_name) {
      checkRuleName(newRule.rule_name);
    }
  };

  const handlePatternChange = (value: string) => {
    setNewRule(prev => ({ ...prev, validation_pattern: value }));
    try {
      new RegExp(value);
      setPatternValid(value.length > 0);
    } catch {
      setPatternValid(false);
    }
  };

  const handleModalTestPattern = async () => {
    if (!newRule.validation_pattern || !modalTestValue) {
      return;
    }

    const result = await validationRulesService.testValidationRule(newRule.validation_pattern, modalTestValue);
    if (result.error) {
      setModalTestResult({ isValid: false, message: result.error });
    } else {
      setModalTestResult({
        isValid: result.isValid,
        message: result.isValid ? 'Pattern matches!' : 'Pattern does not match'
      });
    }
  };

  const handleSaveNewRule = async () => {
    if (!newRule.rule_name.trim()) {
      showToast('error', 'Rule name is required');
      return;
    }

    if (nameCheckResult === 'taken') {
      showToast('error', 'Rule name already exists');
      return;
    }

    if (!newRule.rule_type) {
      showToast('error', 'Rule type is required');
      return;
    }

    const categoryToUse = isCreatingNewCategory ? newCategoryName.trim() : newRule.category;
    if (!categoryToUse) {
      showToast('error', 'Category is required');
      return;
    }

    if (!newRule.validation_pattern.trim()) {
      showToast('error', 'Validation pattern is required');
      return;
    }

    if (patternValid === false) {
      showToast('error', 'Invalid regex pattern');
      return;
    }

    if (!newRule.error_message.trim()) {
      showToast('error', 'Error message is required');
      return;
    }

    try {
      setIsSaving(true);

      const result = await validationRulesService.createValidationRule({
        ...newRule,
        category: categoryToUse
      });

      if (result.success) {
        showToast('success', 'Validation rule created successfully');
        await loadValidationRules();
        await loadCategories();
        handleCloseAddModal();

        if (result.data) {
          setExpandedCategories(prev => new Set(prev).add(categoryToUse));
        }
      } else {
        showToast('error', result.error || 'Failed to create rule');
      }
    } catch (error) {
      console.error('Error creating rule:', error);
      showToast('error', 'Failed to create rule');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveRuleId(event.active.id as string);
    setIsDragging(true);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setIsDragging(false);
    setActiveRuleId(null);

    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const ruleId = active.id as string;
    const targetCategory = over.id as string;

    const rule = validationRules.find(r => r.id === ruleId);
    if (!rule || rule.category === targetCategory) {
      return;
    }

    try {
      const result = await validationRulesService.updateRuleCategory(ruleId, targetCategory);
      if (result.success) {
        showToast('success', `Rule moved to ${targetCategory}`);
        await loadValidationRules();
        setExpandedCategories(prev => new Set(prev).add(targetCategory));
      } else {
        showToast('error', result.error || 'Failed to move rule');
      }
    } catch (error) {
      console.error('Error moving rule:', error);
      showToast('error', 'Failed to move rule');
    }
  };

  const filteredRules = validationRules.filter(rule => {
    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'active' && rule.is_active) ||
      (filterStatus === 'inactive' && !rule.is_active);

    const matchesSearch =
      rule.rule_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const groupedRules = filteredRules.reduce((acc, rule) => {
    if (!acc[rule.category]) {
      acc[rule.category] = [];
    }
    acc[rule.category].push(rule);
    return acc;
  }, {} as Record<string, ValidationRule[]>);

  const sortedCategories = Object.keys(groupedRules).sort();

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Contact Validation':
        return <Shield className="w-5 h-5 text-blue-600" />;
      case 'Document Validation':
        return <FileText className="w-5 h-5 text-green-600" />;
      case 'Address Validation':
        return <MapPin className="w-5 h-5 text-orange-600" />;
      default:
        return <Shield className="w-5 h-5 text-gray-600" />;
    }
  };

  const getExampleValues = (ruleName: string) => {
    const examples: Record<string, { valid: string[]; invalid: string[] }> = {
      email_format: {
        valid: ['user@example.com', 'test.name@company.co.in'],
        invalid: ['user@', 'test@.com', 'invalid.email']
      },
      mobile_number: {
        valid: ['9876543210', '8765432109', '7654321098'],
        invalid: ['0123456789', '12345', '98765432101']
      },
      pin_code: {
        valid: ['110001', '400001', '560001'],
        invalid: ['1234', '12345', '1234567']
      },
      gst_number: {
        valid: ['22AAAAA0000A1Z5', '27AAPFU0939F1ZV'],
        invalid: ['INVALID123', '12345', 'ABC']
      },
      pan_number: {
        valid: ['ABCDE1234F', 'PQRST5678Z'],
        invalid: ['ABC123', 'ABCDE12345', '123456789']
      },
      aadhaar_number: {
        valid: ['123456789012', '987654321098'],
        invalid: ['12345', '12345678901', '1234567890123']
      }
    };
    return examples[ruleName] || { valid: [], invalid: [] };
  };

  const activeRule = activeRuleId ? validationRules.find(r => r.id === activeRuleId) : null;

  return (
    <PermissionGate
      permission="settings.validation.view"
      fallback={
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view validation settings.</p>
          </div>
        </div>
      }
    >
    <div className="min-h-screen bg-gray-50 py-8">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Validation Rules Management</h1>
              <p className="text-gray-600 mt-2">
                Configure validation patterns and error messages for form fields
              </p>
            </div>
            {canManageValidation && (
              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New Rule
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-4">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Rules</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>

              <div className="text-sm text-gray-600">
                Total: {filteredRules.length} | Active: {filteredRules.filter(r => r.is_active).length} | Inactive: {filteredRules.filter(r => !r.is_active).length}
              </div>
            </div>

            <input
              type="text"
              placeholder="Search rules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {isLoadingRules ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">Loading validation rules...</span>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="space-y-4">
                {sortedCategories.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No validation rules found matching your criteria.
                  </div>
                ) : (
                  sortedCategories.map(category => {
                    const rules = groupedRules[category];
                    const isExpanded = expandedCategories.has(category);

                    return (
                      <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleCategory(category)}
                          className="w-full bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
                          id={category}
                        >
                          <div className="flex items-center">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-gray-600 mr-2" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-gray-600 mr-2" />
                            )}
                            {getCategoryIcon(category)}
                            <h2 className="text-lg font-semibold text-gray-900 ml-2">{category}</h2>
                            <span className="ml-3 text-sm text-gray-600">({rules.length} {rules.length === 1 ? 'rule' : 'rules'})</span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div
                            className={`divide-y divide-gray-200 ${isDragging ? 'bg-blue-50' : ''}`}
                          >
                            {rules.map(rule => (
                              <div
                                key={rule.id}
                                id={rule.id}
                                className="p-4 hover:bg-gray-50 transition-colors flex items-start gap-3"
                              >
                                {canManageValidation && (
                                  <div
                                    className="cursor-move pt-1"
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                    }}
                                  >
                                    <GripVertical className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                                  </div>
                                )}

                                <div className="flex-1">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-base font-medium text-gray-900">
                                          {rule.rule_name.replace(/_/g, ' ').toUpperCase()}
                                        </h3>
                                        {canManageValidation ? (
                                          <button
                                            onClick={() => handleToggleActive(rule.id, rule.is_active)}
                                            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                              rule.is_active
                                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                            }`}
                                          >
                                            {rule.is_active ? 'Active' : 'Inactive'}
                                          </button>
                                        ) : (
                                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                                            rule.is_active
                                              ? 'bg-green-100 text-green-800'
                                              : 'bg-gray-100 text-gray-800'
                                          }`}>
                                            {rule.is_active ? 'Active' : 'Inactive'}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-sm text-gray-600 mb-3">{rule.description}</p>
                                    </div>

                                    {editingRuleId !== rule.id && canManageValidation && (
                                      <button
                                        onClick={() => handleEditClick(rule)}
                                        className="ml-4 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Edit rule"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>

                                  {editingRuleId === rule.id ? (
                                    <div className="space-y-3 bg-blue-50 p-4 rounded-lg">
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          Validation Pattern (Regex)
                                        </label>
                                        <input
                                          type="text"
                                          value={editedPattern}
                                          onChange={(e) => setEditedPattern(e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                                          placeholder="Enter regex pattern"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          Error Message
                                        </label>
                                        <textarea
                                          value={editedMessage}
                                          onChange={(e) => setEditedMessage(e.target.value)}
                                          rows={2}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                          placeholder="Enter error message"
                                        />
                                      </div>

                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => handleSaveEdit(rule.id)}
                                          disabled={isSaving}
                                          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          {isSaving ? (
                                            <>
                                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                              Saving...
                                            </>
                                          ) : (
                                            <>
                                              <Check className="w-4 h-4 mr-2" />
                                              Save
                                            </>
                                          )}
                                        </button>
                                        <button
                                          onClick={handleCancelEdit}
                                          disabled={isSaving}
                                          className="inline-flex items-center px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          <X className="w-4 h-4 mr-2" />
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div>
                                        <span className="text-xs font-medium text-gray-500 uppercase">Pattern:</span>
                                        <pre className="mt-1 p-2 bg-gray-100 rounded text-xs font-mono overflow-x-auto">
                                          {rule.validation_pattern}
                                        </pre>
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium text-gray-500 uppercase">Error Message:</span>
                                        <p className="mt-1 text-sm text-gray-700">{rule.error_message}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <DragOverlay>
                {activeRule ? (
                  <div className="bg-white border-2 border-blue-500 rounded-lg p-4 shadow-lg opacity-90">
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-5 h-5 text-gray-400" />
                      <div>
                        <h3 className="text-base font-medium text-gray-900">
                          {activeRule.rule_name.replace(/_/g, ' ').toUpperCase()}
                        </h3>
                        <p className="text-sm text-gray-600">{activeRule.category}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center mb-4">
            <TestTube className="w-5 h-5 text-blue-600 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">Test Validation Rules</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Test your validation rules by entering sample data to see if it passes validation.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Validation Rule
              </label>
              <select
                value={testRuleName}
                onChange={(e) => {
                  setTestRuleName(e.target.value);
                  setTestResult(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Choose a rule to test...</option>
                {validationRules.filter(r => r.is_active).map(rule => (
                  <option key={rule.id} value={rule.rule_name}>
                    {rule.rule_name.replace(/_/g, ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Value
              </label>
              <input
                type="text"
                value={testValue}
                onChange={(e) => {
                  setTestValue(e.target.value);
                  setTestResult(null);
                }}
                placeholder="Enter value to test"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {testRuleName && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-700 mb-2">Quick Test Examples:</p>
              <div className="flex flex-wrap gap-2">
                {getExampleValues(testRuleName).valid.map((example, idx) => (
                  <button
                    key={`valid-${idx}`}
                    onClick={() => setTestValue(example)}
                    className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200 transition-colors"
                  >
                    {example}
                  </button>
                ))}
                {getExampleValues(testRuleName).invalid.map((example, idx) => (
                  <button
                    key={`invalid-${idx}`}
                    onClick={() => setTestValue(example)}
                    className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleTestValidation}
            disabled={isTesting || !testRuleName || !testValue}
            className="inline-flex items-center px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <TestTube className="w-4 h-4 mr-2" />
                Test Validation
              </>
            )}
          </button>

          {testResult && (
            <div className={`mt-4 p-4 rounded-lg border-2 ${
              testResult.isValid
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start">
                {testResult.isValid ? (
                  <Check className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`font-medium ${
                    testResult.isValid ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {testResult.isValid ? 'Validation Passed' : 'Validation Failed'}
                  </p>
                  <p className={`text-sm mt-1 ${
                    testResult.isValid ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {testResult.message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAddModal && canManageValidation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Add New Validation Rule</h2>
              <button
                onClick={handleCloseAddModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newRule.rule_name}
                  onChange={(e) => handleRuleNameChange(e.target.value)}
                  onBlur={handleRuleNameBlur}
                  placeholder="e.g., email_format"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Rule name will be automatically converted to lowercase
                </p>
                {isCheckingName && (
                  <p className="text-xs text-gray-500 mt-1">Checking availability...</p>
                )}
                {nameCheckResult === 'available' && (
                  <p className="text-xs text-green-600 mt-1 flex items-center">
                    <Check className="w-3 h-3 mr-1" /> Available
                  </p>
                )}
                {nameCheckResult === 'taken' && (
                  <p className="text-xs text-red-600 mt-1 flex items-center">
                    <X className="w-3 h-3 mr-1" /> Already exists
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={newRule.rule_type}
                  onChange={(e) => setNewRule(prev => ({ ...prev, rule_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="number">Number</option>
                  <option value="url">URL</option>
                  <option value="phone">Phone</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                {!isCreatingNewCategory ? (
                  <>
                    <select
                      value={newRule.category}
                      onChange={(e) => {
                        if (e.target.value === '__create_new__') {
                          setIsCreatingNewCategory(true);
                          setNewRule(prev => ({ ...prev, category: '' }));
                        } else {
                          setNewRule(prev => ({ ...prev, category: e.target.value }));
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select a category...</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="__create_new__">+ Create New Category</option>
                    </select>
                  </>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Enter new category name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={() => {
                        setIsCreatingNewCategory(false);
                        setNewCategoryName('');
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Back to Categories
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Validation Pattern (Regex) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newRule.validation_pattern}
                    onChange={(e) => handlePatternChange(e.target.value)}
                    placeholder="^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  />
                  {newRule.validation_pattern && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {patternValid === true && (
                        <Check className="w-5 h-5 text-green-600" />
                      )}
                      {patternValid === false && (
                        <X className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                  )}
                </div>
                {patternValid === false && (
                  <p className="text-xs text-red-600 mt-1">Invalid regular expression</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Error Message <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newRule.error_message}
                  onChange={(e) => setNewRule(prev => ({ ...prev, error_message: e.target.value }))}
                  placeholder="Please enter a valid email address"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newRule.description}
                  onChange={(e) => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this validation rule checks"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Order <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={newRule.display_order}
                  onChange={(e) => setNewRule(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Test Pattern</h3>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={modalTestValue}
                    onChange={(e) => setModalTestValue(e.target.value)}
                    placeholder="Enter test value"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={handleModalTestPattern}
                    disabled={!newRule.validation_pattern || !modalTestValue}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Test
                  </button>
                </div>
                {modalTestResult && (
                  <div className={`p-3 rounded-lg ${
                    modalTestResult.isValid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                  }`}>
                    <p className="text-sm flex items-center">
                      {modalTestResult.isValid ? (
                        <Check className="w-4 h-4 mr-2" />
                      ) : (
                        <X className="w-4 h-4 mr-2" />
                      )}
                      {modalTestResult.message}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCloseAddModal}
                disabled={isSaving}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewRule}
                disabled={isSaving || nameCheckResult === 'taken' || patternValid === false}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Save Rule
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PermissionGate>
  );
};

export default AdminValidationSettings;
