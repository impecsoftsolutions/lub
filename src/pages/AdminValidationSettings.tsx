import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
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
  Lock,
  MoreHorizontal
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { validationRulesService, ValidationRule } from '../lib/supabase';
import Toast from '../components/Toast';
import { PageHeader } from '../components/ui/PageHeader';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';

const AdminValidationSettings: React.FC = () => {
  const [validationRules, setValidationRules] = useState<ValidationRule[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState(true);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editedPattern, setEditedPattern] = useState('');
  const [editedMessage, setEditedMessage] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
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

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  const loadValidationRules = useCallback(async () => {
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
  }, [showToast]);

  const loadCategories = async () => {
    try {
      const cats = await validationRulesService.getAllCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleEditClick = (rule: ValidationRule) => {
    setEditingRuleId(rule.id);
    setEditedPattern(rule.validation_pattern);
    setEditedMessage(rule.error_message);
    setEditedDescription(rule.description ?? '');
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
    setEditedPattern('');
    setEditedMessage('');
    setEditedDescription('');
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
        error_message: editedMessage,
        description: editedDescription
      });

      if (result.success) {
        showToast('success', 'Validation rule updated successfully');
        await loadValidationRules();
        setEditingRuleId(null);
        setEditedPattern('');
        setEditedMessage('');
        setEditedDescription('');
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

  useEffect(() => {
    void loadValidationRules();
    void loadCategories();
  }, [loadValidationRules]);

  useEffect(() => {
    if (searchQuery && filteredRules.length > 0) {
      const categoriesWithMatches = new Set<string>();
      filteredRules.forEach(rule => categoriesWithMatches.add(rule.category));
      setExpandedCategories(categoriesWithMatches);
    }
  }, [filteredRules, searchQuery]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Contact Validation':
        return <Shield className="w-5 h-5 text-primary" />;
      case 'Document Validation':
        return <FileText className="w-5 h-5 text-primary" />;
      case 'Address Validation':
        return <MapPin className="w-5 h-5 text-primary" />;
      default:
        return <Shield className="w-5 h-5 text-muted-foreground" />;
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
        <div className="py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view validation settings.</p>
          </div>
        </div>
      }
    >
    <div className="p-6">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div>
        <div className="mb-4">
          <Link
            to="/admin/settings"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Settings Hub
          </Link>
        </div>

        <PageHeader
          title="Validation Rules Management"
          subtitle="Configure validation patterns and error messages for form fields"
          actions={canManageValidation ? (
            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add New Rule
            </button>
          ) : undefined}
        />

        <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-4">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
                className="px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
              >
                <option value="all">All Rules</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>

              <div className="text-sm text-muted-foreground">
                Total: {filteredRules.length} | Active: {filteredRules.filter(r => r.is_active).length} | Inactive: {filteredRules.filter(r => !r.is_active).length}
              </div>
            </div>

            <input
              type="text"
              placeholder="Search rules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
            />
          </div>

          {isLoadingRules ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading validation rules...</span>
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
                  <div className="text-center py-12 text-muted-foreground">
                    No validation rules found matching your criteria.
                  </div>
                ) : (
                  sortedCategories.map(category => {
                    const rules = groupedRules[category];
                    const isExpanded = expandedCategories.has(category);

                    return (
                      <div key={category} className="border border-border rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleCategory(category)}
                          className="w-full bg-muted/50 px-4 py-3 border-b border-border flex items-center justify-between hover:bg-muted transition-colors"
                          id={category}
                        >
                          <div className="flex items-center">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-muted-foreground mr-2" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-muted-foreground mr-2" />
                            )}
                            {getCategoryIcon(category)}
                            <h2 className="text-section font-semibold text-foreground ml-2">{category}</h2>
                            <span className="ml-3 text-sm text-muted-foreground">({rules.length} {rules.length === 1 ? 'rule' : 'rules'})</span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div
                            className={`divide-y divide-border ${isDragging ? 'bg-primary/5' : ''}`}
                          >
                            {rules.map(rule => (
                              <div
                                key={rule.id}
                                id={rule.id}
                                className="p-4 hover:bg-muted/30 transition-colors flex items-start gap-3"
                              >
                                {canManageValidation && (
                                  <div
                                    className="cursor-move pt-1"
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                    }}
                                  >
                                    <GripVertical className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                                  </div>
                                )}

                                <div className="flex-1">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-base font-medium text-foreground">
                                          {rule.rule_name.replace(/_/g, ' ').toUpperCase()}
                                        </h3>
                                        <div className="inline-flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => canManageValidation && handleToggleActive(rule.id, rule.is_active)}
                                            disabled={!canManageValidation}
                                            className={`inline-flex items-center justify-center w-11 h-6 rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                                              rule.is_active
                                                ? 'bg-primary border-primary hover:bg-primary/90'
                                                : 'bg-muted/90 border-input hover:bg-muted'
                                            } ${!canManageValidation ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                            role="switch"
                                            aria-checked={rule.is_active}
                                            aria-label={`${rule.rule_name.replace(/_/g, ' ')} status toggle`}
                                          >
                                            <span
                                              className={`block w-4 h-4 bg-background border border-border/60 rounded-full shadow-sm transition-transform ${
                                                rule.is_active ? 'translate-x-2.5' : '-translate-x-2.5'
                                              }`}
                                            />
                                          </button>
                                          <span className={`text-xs font-medium ${
                                            rule.is_active ? 'text-primary' : 'text-muted-foreground'
                                          }`}>
                                            {rule.is_active ? 'ON' : 'OFF'}
                                          </span>
                                        </div>
                                      </div>
                                      <p className="text-sm text-muted-foreground mb-3">{rule.description}</p>
                                    </div>

                                    {editingRuleId !== rule.id && canManageValidation && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            type="button"
                                            className="ml-4 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                            aria-label={`Open actions for ${rule.rule_name.replace(/_/g, ' ')}`}
                                          >
                                            <MoreHorizontal className="w-4 h-4" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={() => handleEditClick(rule)}>
                                            <Edit2 className="w-4 h-4" />
                                            Edit
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>

                                  {editingRuleId === rule.id ? (
                                    <div className="space-y-3 bg-primary/5 p-4 rounded-lg">
                                      <div>
                                        <label className="block text-sm font-medium text-foreground mb-1">
                                          Validation Pattern (Regex)
                                        </label>
                                        <input
                                          type="text"
                                          value={editedPattern}
                                          onChange={(e) => setEditedPattern(e.target.value)}
                                          className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring font-mono text-sm"
                                          placeholder="Enter regex pattern"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-sm font-medium text-foreground mb-1">
                                          Error Message
                                        </label>
                                        <textarea
                                          value={editedMessage}
                                          onChange={(e) => setEditedMessage(e.target.value)}
                                          rows={2}
                                          className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm"
                                          placeholder="Enter error message"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-sm font-medium text-foreground mb-1">
                                          Description
                                        </label>
                                        <textarea
                                          value={editedDescription}
                                          onChange={(e) => setEditedDescription(e.target.value)}
                                          rows={2}
                                          className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm"
                                          placeholder="Enter a short description of what this rule validates"
                                        />
                                      </div>

                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => handleSaveEdit(rule.id)}
                                          disabled={isSaving}
                                          className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                                          className="inline-flex items-center px-4 py-2 bg-muted text-foreground text-sm font-medium rounded-lg hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          <X className="w-4 h-4 mr-2" />
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div>
                                        <span className="text-xs font-medium text-muted-foreground uppercase">Pattern:</span>
                                        <pre className="mt-1 p-2 bg-muted rounded text-xs font-mono overflow-x-auto">
                                          {rule.validation_pattern}
                                        </pre>
                                      </div>
                                      <div>
                                        <span className="text-xs font-medium text-muted-foreground uppercase">Error Message:</span>
                                        <p className="mt-1 text-sm text-foreground">{rule.error_message}</p>
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
                <div className="bg-card border-2 border-primary rounded-lg p-4 shadow-sm opacity-90">
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <h3 className="text-base font-medium text-foreground">
                          {activeRule.rule_name.replace(/_/g, ' ').toUpperCase()}
                        </h3>
                        <p className="text-sm text-muted-foreground">{activeRule.category}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        <div className="bg-card rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <TestTube className="w-5 h-5 text-primary mr-2" />
            <h2 className="text-section font-semibold text-foreground">Test Validation Rules</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Test your validation rules by entering sample data to see if it passes validation.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Select Validation Rule
              </label>
              <select
                value={testRuleName}
                onChange={(e) => {
                  setTestRuleName(e.target.value);
                  setTestResult(null);
                }}
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
              <label className="block text-sm font-medium text-foreground mb-2">
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
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
              />
            </div>
          </div>

          {testRuleName && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs font-medium text-foreground mb-2">Quick Test Examples:</p>
              <div className="flex flex-wrap gap-2">
                {getExampleValues(testRuleName).valid.map((example, idx) => (
                  <button
                    key={`valid-${idx}`}
                    onClick={() => setTestValue(example)}
                    className="px-3 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
                  >
                    {example}
                  </button>
                ))}
                {getExampleValues(testRuleName).invalid.map((example, idx) => (
                  <button
                    key={`invalid-${idx}`}
                    onClick={() => setTestValue(example)}
                    className="px-3 py-1 text-xs bg-destructive/10 text-destructive rounded hover:bg-destructive/20 transition-colors"
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
            className="inline-flex items-center px-6 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                ? 'bg-primary/5 border-primary/30'
                : 'bg-destructive/5 border-destructive/30'
            }`}>
              <div className="flex items-start">
                {testResult.isValid ? (
                  <Check className="w-5 h-5 text-primary mr-2 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-destructive mr-2 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`font-medium ${
                    testResult.isValid ? 'text-primary' : 'text-destructive'
                  }`}>
                    {testResult.isValid ? 'Validation Passed' : 'Validation Failed'}
                  </p>
                  <p className={`text-sm mt-1 ${
                    testResult.isValid ? 'text-primary' : 'text-destructive'
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
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-section font-semibold text-foreground">Add New Validation Rule</h2>
              <button
                onClick={handleCloseAddModal}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Rule Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newRule.rule_name}
                  onChange={(e) => handleRuleNameChange(e.target.value)}
                  onBlur={handleRuleNameBlur}
                  placeholder="e.g., email_format"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Rule name will be automatically converted to lowercase
                </p>
                {isCheckingName && (
                  <p className="text-xs text-muted-foreground mt-1">Checking availability...</p>
                )}
                {nameCheckResult === 'available' && (
                  <p className="text-xs text-primary mt-1 flex items-center">
                    <Check className="w-3 h-3 mr-1" /> Available
                  </p>
                )}
                {nameCheckResult === 'taken' && (
                  <p className="text-xs text-destructive mt-1 flex items-center">
                    <X className="w-3 h-3 mr-1" /> Already exists
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Rule Type <span className="text-destructive">*</span>
                </label>
                <select
                  value={newRule.rule_type}
                  onChange={(e) => setNewRule(prev => ({ ...prev, rule_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
                <label className="block text-sm font-medium text-foreground mb-1">
                  Category <span className="text-destructive">*</span>
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
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                    <button
                      onClick={() => {
                        setIsCreatingNewCategory(false);
                        setNewCategoryName('');
                      }}
                      className="text-sm text-primary hover:text-primary/80"
                    >
                      Back to Categories
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Validation Pattern (Regex) <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newRule.validation_pattern}
                    onChange={(e) => handlePatternChange(e.target.value)}
                    placeholder="^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$"
                    className="w-full px-3 py-2 pr-10 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring font-mono text-sm"
                  />
                  {newRule.validation_pattern && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {patternValid === true && (
                        <Check className="w-5 h-5 text-primary" />
                      )}
                      {patternValid === false && (
                        <X className="w-5 h-5 text-destructive" />
                      )}
                    </div>
                  )}
                </div>
                {patternValid === false && (
                  <p className="text-xs text-destructive mt-1">Invalid regular expression</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Error Message <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newRule.error_message}
                  onChange={(e) => setNewRule(prev => ({ ...prev, error_message: e.target.value }))}
                  placeholder="Please enter a valid email address"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Description
                </label>
                <textarea
                  value={newRule.description}
                  onChange={(e) => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this validation rule checks"
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Display Order <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  value={newRule.display_order}
                  onChange={(e) => setNewRule(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-medium text-foreground mb-3">Test Pattern</h3>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={modalTestValue}
                    onChange={(e) => setModalTestValue(e.target.value)}
                    placeholder="Enter test value"
                    className="flex-1 px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                  />
                  <button
                    onClick={handleModalTestPattern}
                    disabled={!newRule.validation_pattern || !modalTestValue}
                    className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Test
                  </button>
                </div>
                {modalTestResult && (
                  <div className={`p-3 rounded-lg ${
                    modalTestResult.isValid ? 'bg-primary/5 text-primary' : 'bg-destructive/5 text-destructive'
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

            <div className="sticky bottom-0 bg-muted/50 border-t border-border px-6 py-4 flex justify-end gap-3">
              <button
                onClick={handleCloseAddModal}
                disabled={isSaving}
                className="px-4 py-2 text-foreground bg-card border border-border rounded-lg hover:bg-muted/50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewRule}
                disabled={isSaving || nameCheckResult === 'taken' || patternValid === false}
                className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

