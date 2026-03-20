import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Plus, Search, CreditCard as Edit3, Trash2, ToggleLeft, ToggleRight, X, Users, Shield, MapPin, ArrowUp, ArrowDown, GripVertical, Lock } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { companyDesignationsService, CompanyDesignation, lubRolesService, LubRole, memberLubRolesService, MemberLubRoleAssignment, statesService, locationsService, StateMaster, DistrictOption } from '../lib/supabase';
import Toast from '../components/Toast';

type MemberSearchResult = {
  id: string;
  full_name: string;
  company_name: string;
  email: string;
  city: string;
  district: string;
};

const AdminDesignationsManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'company' | 'lub'>('company');
  const [lubRolesSubTab, setLubRolesSubTab] = useState<'roles' | 'assignments'>('roles');
  
  // Company Designations State
  const [companyDesignations, setCompanyDesignations] = useState<CompanyDesignation[]>([]);
  const [isLoadingCompany, setIsLoadingCompany] = useState(true);
  const [searchTermCompany, setSearchTermCompany] = useState('');
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [showEditCompanyModal, setShowEditCompanyModal] = useState(false);
  const [editingCompanyDesignation, setEditingCompanyDesignation] = useState<CompanyDesignation | null>(null);
  const [newCompanyDesignationName, setNewCompanyDesignationName] = useState('');
  const [newCompanyIsActive, setNewCompanyIsActive] = useState(true);
  const [editCompanyDesignationName, setEditCompanyDesignationName] = useState('');
  const [editCompanyIsActive, setEditCompanyIsActive] = useState(true);
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  // LUB Roles State
  const [lubRoles, setLubRoles] = useState<LubRole[]>([]);
  const [isLoadingLubRoles, setIsLoadingLubRoles] = useState(true);
  const [searchTermLubRoles, setSearchTermLubRoles] = useState('');
  const [showAddLubRoleModal, setShowAddLubRoleModal] = useState(false);
  const [showEditLubRoleModal, setShowEditLubRoleModal] = useState(false);
  const [editingLubRole, setEditingLubRole] = useState<LubRole | null>(null);
  const [newLubRoleName, setNewLubRoleName] = useState('');
  const [newLubRoleIsActive, setNewLubRoleIsActive] = useState(true);
  const [editLubRoleName, setEditLubRoleName] = useState('');
  const [editLubRoleIsActive, setEditLubRoleIsActive] = useState(true);
  const [isSavingLubRole, setIsSavingLubRole] = useState(false);
  const [lubRolesSortOrder, setLubRolesSortOrder] = useState<'asc' | 'desc' | 'custom'>('custom');
  const [draggedRole, setDraggedRole] = useState<LubRole | null>(null);
  const [dragOverRole, setDragOverRole] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  // Member LUB Role Assignments State
  const [memberAssignments, setMemberAssignments] = useState<MemberLubRoleAssignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);
  const [searchTermAssignments, setSearchTermAssignments] = useState('');
  const [assignmentFilters, setAssignmentFilters] = useState({
    level: 'all',
    state: '',
    district: '',
    committeeYear: ''
  });
  const [assignmentStates, setAssignmentStates] = useState<StateMaster[]>([]);
  const [assignmentDistricts, setAssignmentDistricts] = useState<DistrictOption[]>([]);
  const [showAddAssignmentModal, setShowAddAssignmentModal] = useState(false);
  const [showEditAssignmentModal, setShowEditAssignmentModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<MemberLubRoleAssignment | null>(null);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);

  // Assignment Form State
  const [assignmentForm, setAssignmentForm] = useState({
    member_id: '',
    role_id: '',
    level: '' as 'national' | 'state' | 'district' | 'city' | '',
    state: '',
    district: '',
    committee_year: '',
    role_start_date: '',
    role_end_date: ''
  });

  // Member search state
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<MemberSearchResult[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);

  // Geographic data
  const [allStates, setAllStates] = useState<StateMaster[]>([]);
  const [availableDistricts, setAvailableDistricts] = useState<DistrictOption[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(false);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);

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
  const canManageDesignations = useHasPermission('organization.designations.manage');

  useEffect(() => {
    loadStates();
  }, []);

  useEffect(() => {
    if (activeTab === 'company') {
      loadCompanyDesignations();
    } else if (activeTab === 'lub') {
      loadLubRoles();
      if (lubRolesSubTab === 'assignments') {
        loadMemberAssignments();
      }
    }
  }, [activeTab, lubRolesSubTab]);

  // Load districts when state changes
  useEffect(() => {
    if (assignmentForm.state && (assignmentForm.level === 'district' || assignmentForm.level === 'city')) {
      loadDistricts(assignmentForm.state);
    } else {
      setAvailableDistricts([]);
      setAssignmentForm(prev => ({ ...prev, district: '' }));
    }
  }, [assignmentForm.state, assignmentForm.level]);

  useEffect(() => {
    if (lubRolesSubTab === 'assignments') {
      loadAssignmentStates();
    }
  }, [lubRolesSubTab]);

  useEffect(() => {
    if (assignmentFilters.state && (assignmentFilters.level === 'district' || assignmentFilters.level === 'city')) {
      loadAssignmentDistricts(assignmentFilters.state);
    } else {
      setAssignmentDistricts([]);
      if (assignmentFilters.level !== 'all' && assignmentFilters.level !== 'national' && assignmentFilters.level !== 'state') {
        setAssignmentFilters(prev => ({ ...prev, district: '' }));
      }
    }
  }, [assignmentFilters.state, assignmentFilters.level]);


  const loadStates = async () => {
    try {
      setIsLoadingStates(true);
      const states = await statesService.getAllStates();
      setAllStates(states.filter(state => state.is_active));
    } catch (error) {
      console.error('Error loading states:', error);
      showToast('error', 'Failed to load states');
    } finally {
      setIsLoadingStates(false);
    }
  };

  const loadDistricts = async (stateName: string) => {
    try {
      setIsLoadingDistricts(true);
      const districts = await locationsService.getActiveDistrictsByStateName(stateName);
      setAvailableDistricts(districts);
    } catch (error) {
      console.error('Error loading districts:', error);
      showToast('error', 'Failed to load districts');
    } finally {
      setIsLoadingDistricts(false);
    }
  };

  const loadAssignmentStates = async () => {
    try {
      const states = await statesService.getAllStates();
      setAssignmentStates(states.filter(state => state.is_active));
    } catch (error) {
      console.error('[AdminDesignationsManagement] Error loading assignment filter states:', error);
    }
  };

  const loadAssignmentDistricts = async (stateName: string) => {
    try {
      const districts = await locationsService.getActiveDistrictsByStateName(stateName);
      setAssignmentDistricts(districts);
    } catch (error) {
      console.error('[AdminDesignationsManagement] Error loading assignment filter districts:', error);
    }
  };

  const loadCompanyDesignations = async () => {
    try {
      setIsLoadingCompany(true);
      const designations = await companyDesignationsService.getAllDesignations();
      setCompanyDesignations(designations);
    } catch (error) {
      console.error('Error loading company designations:', error);
      showToast('error', 'Failed to load company designations');
    } finally {
      setIsLoadingCompany(false);
    }
  };

  const loadLubRoles = async () => {
    try {
      setIsLoadingLubRoles(true);
      const roles = await lubRolesService.getAllRoles();
      setLubRoles(roles);
    } catch (error) {
      console.error('Error loading LUB roles:', error);
      showToast('error', 'Failed to load LUB roles');
    } finally {
      setIsLoadingLubRoles(false);
    }
  };

  const loadMemberAssignments = async () => {
    try {
      setIsLoadingAssignments(true);
      const assignments = await memberLubRolesService.getAllAssignments({ search: searchTermAssignments || undefined });

      setMemberAssignments(assignments);
      console.log(`[AdminDesignationsManagement] Loaded ${assignments.length} member role assignments`);
    } catch (error) {
      console.error('[AdminDesignationsManagement] Error loading member assignments:', error);
      showToast('error', 'Failed to load member assignments');
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  const searchMembers = async (searchTerm: string) => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setMemberSearchResults([]);
      return;
    }

    try {
      setIsSearchingMembers(true);
      const results = await memberLubRolesService.searchMembers(searchTerm);
      setMemberSearchResults(results);
    } catch (error) {
      console.error('Error searching members:', error);
      showToast('error', 'Failed to search members');
    } finally {
      setIsSearchingMembers(false);
    }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  // Company Designations Functions
  const handleAddCompanyDesignation = async () => {
    if (!newCompanyDesignationName.trim()) {
      showToast('error', 'Please enter a designation name');
      return;
    }

    try {
      setIsSavingCompany(true);
      const result = await companyDesignationsService.createDesignation(newCompanyDesignationName, newCompanyIsActive);

      if (result.success) {
        showToast('success', 'Company designation added successfully');
        setShowAddCompanyModal(false);
        setNewCompanyDesignationName('');
        setNewCompanyIsActive(true);
        await loadCompanyDesignations();
      } else {
        showToast('error', result.error || 'Failed to add company designation');
      }
    } catch (error) {
      console.error('Error adding company designation:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleEditCompanyDesignation = (designation: CompanyDesignation) => {
    setEditingCompanyDesignation(designation);
    setEditCompanyDesignationName(designation.designation_name);
    setEditCompanyIsActive(designation.is_active);
    setShowEditCompanyModal(true);
  };

  const handleUpdateCompanyDesignation = async () => {
    if (!editingCompanyDesignation || !editCompanyDesignationName.trim()) {
      showToast('error', 'Please enter a designation name');
      return;
    }

    try {
      setIsSavingCompany(true);
      const result = await companyDesignationsService.updateDesignation(
        editingCompanyDesignation.id,
        editCompanyDesignationName,
        editCompanyIsActive
      );

      if (result.success) {
        showToast('success', 'Company designation updated successfully');
        setShowEditCompanyModal(false);
        setEditingCompanyDesignation(null);
        await loadCompanyDesignations();
      } else {
        showToast('error', result.error || 'Failed to update company designation');
      }
    } catch (error) {
      console.error('Error updating company designation:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleToggleCompanyActive = async (designationId: string, currentStatus: boolean) => {
    try {
      const result = await companyDesignationsService.updateDesignation(designationId, undefined, !currentStatus);

      if (result.success) {
        showToast('success', `Company designation ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
        await loadCompanyDesignations();
      } else {
        showToast('error', result.error || 'Failed to update company designation status');
      }
    } catch (error) {
      console.error('Error toggling company designation status:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  const handleDeleteCompanyDesignation = async (designationId: string) => {
    if (!confirm('Are you sure you want to delete this company designation?')) return;

    try {
      const result = await companyDesignationsService.deleteDesignation(designationId);

      if (result.success) {
        showToast('success', 'Company designation deleted successfully');
        await loadCompanyDesignations();
      } else {
        showToast('error', result.error || 'Failed to delete company designation');
      }
    } catch (error) {
      console.error('Error deleting company designation:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  // LUB Roles Functions
  const handleAddLubRole = async () => {
    if (!newLubRoleName.trim()) {
      showToast('error', 'Please enter a role name');
      return;
    }

    try {
      setIsSavingLubRole(true);
      const result = await lubRolesService.createRole(newLubRoleName, newLubRoleIsActive);

      if (result.success) {
        showToast('success', 'LUB role added successfully');
        setShowAddLubRoleModal(false);
        setNewLubRoleName('');
        setNewLubRoleIsActive(true);
        await loadLubRoles();
      } else {
        showToast('error', result.error || 'Failed to add LUB role');
      }
    } catch (error) {
      console.error('Error adding LUB role:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsSavingLubRole(false);
    }
  };

  const handleEditLubRole = (role: LubRole) => {
    setEditingLubRole(role);
    setEditLubRoleName(role.role_name);
    setEditLubRoleIsActive(role.is_active);
    setShowEditLubRoleModal(true);
  };

  const handleUpdateLubRole = async () => {
    if (!editingLubRole || !editLubRoleName.trim()) {
      showToast('error', 'Please enter a role name');
      return;
    }

    try {
      setIsSavingLubRole(true);
      const result = await lubRolesService.updateRole(
        editingLubRole.id,
        editLubRoleName,
        editLubRoleIsActive
      );

      if (result.success) {
        showToast('success', 'LUB role updated successfully');
        setShowEditLubRoleModal(false);
        setEditingLubRole(null);
        await loadLubRoles();
      } else {
        showToast('error', result.error || 'Failed to update LUB role');
      }
    } catch (error) {
      console.error('Error updating LUB role:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsSavingLubRole(false);
    }
  };

  const handleToggleLubRoleActive = async (roleId: string, currentStatus: boolean) => {
    try {
      const result = await lubRolesService.updateRole(roleId, undefined, !currentStatus);

      if (result.success) {
        showToast('success', `LUB role ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
        await loadLubRoles();
      } else {
        showToast('error', result.error || 'Failed to update LUB role status');
      }
    } catch (error) {
      console.error('Error toggling LUB role status:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  const handleDeleteLubRole = async (roleId: string) => {
    if (!confirm('Are you sure you want to delete this LUB role?')) return;

    try {
      const result = await lubRolesService.deleteRole(roleId);

      if (result.success) {
        showToast('success', 'LUB role deleted successfully');
        await loadLubRoles();
      } else {
        showToast('error', result.error || 'Failed to delete LUB role');
      }
    } catch (error) {
      console.error('Error deleting LUB role:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  // LUB Roles Sorting Functions
  const handleToggleLubRolesSort = () => {
    if (lubRolesSortOrder === 'custom') {
      setLubRolesSortOrder('asc');
    } else if (lubRolesSortOrder === 'asc') {
      setLubRolesSortOrder('desc');
    } else {
      setLubRolesSortOrder('custom');
    }
  };

  // LUB Roles Drag and Drop Functions
  const handleDragStart = (e: React.DragEvent, role: LubRole) => {
    setDraggedRole(role);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, roleId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverRole(roleId);
  };

  const handleDragLeave = () => {
    setDragOverRole(null);
  };

  const handleDrop = async (e: React.DragEvent, targetRole: LubRole) => {
    e.preventDefault();
    setDragOverRole(null);

    if (!draggedRole || draggedRole.id === targetRole.id) {
      setDraggedRole(null);
      return;
    }

    try {
      setIsReordering(true);

      // Get the current order
      const reorderedRoles = [...filteredLubRoles];
      const draggedIndex = reorderedRoles.findIndex(r => r.id === draggedRole.id);
      const targetIndex = reorderedRoles.findIndex(r => r.id === targetRole.id);

      console.log('[RolesMaster] Drag result:', {
        draggedRole: draggedRole.role_name,
        targetRole: targetRole.role_name,
        draggedIndex,
        targetIndex
      });

      // Remove dragged item and insert at target position
      reorderedRoles.splice(draggedIndex, 1);
      reorderedRoles.splice(targetIndex, 0, draggedRole);

      console.log('[RolesMaster] New local order:', reorderedRoles.map((r, idx) => ({
        index: idx + 1,
        id: r.id,
        name: r.role_name
      })));

      // Extract role IDs in new order
      const roleIdsInOrder = reorderedRoles.map(r => r.id);

      const result = await lubRolesService.reorderRoles({
        roleIdsInOrder
      });

      if (result.success) {
        showToast('success', 'Roles reordered successfully');
        setLubRolesSortOrder('custom');
        await loadLubRoles();
      } else {
        showToast('error', result.error || 'Failed to reorder roles');
        await loadLubRoles();
      }
    } catch (error) {
      console.error('[RolesMaster] Error reordering roles:', error);
      showToast('error', 'An unexpected error occurred');
      await loadLubRoles();
    } finally {
      setIsReordering(false);
      setDraggedRole(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedRole(null);
    setDragOverRole(null);
  };

  // Member Assignment Functions
  const handleAddAssignment = async () => {
    if (!assignmentForm.member_id || !assignmentForm.role_id || !assignmentForm.level) {
      showToast('error', 'Please fill in all required fields');
      return;
    }

    // Validate geographic requirements
    if ((assignmentForm.level === 'state' || assignmentForm.level === 'district' || assignmentForm.level === 'city') && !assignmentForm.state) {
      showToast('error', 'State is required for this level');
      return;
    }

    if ((assignmentForm.level === 'district' || assignmentForm.level === 'city') && !assignmentForm.district) {
      showToast('error', 'District is required for this level');
      return;
    }

    // Validate committee year (required)
    if (!assignmentForm.committee_year) {
      showToast('error', 'Committee Year is required');
      return;
    }

    if (!/^\d{4}$/.test(assignmentForm.committee_year)) {
      showToast('error', 'Please enter a valid Committee Year (e.g., 2025)');
      return;
    }

    // Validate dates if both are provided
    if (assignmentForm.role_start_date && assignmentForm.role_end_date) {
      if (new Date(assignmentForm.role_end_date) < new Date(assignmentForm.role_start_date)) {
        showToast('error', 'Period To date cannot be before Period From date');
        return;
      }
    }

    try {
      setIsSavingAssignment(true);

      const result = await memberLubRolesService.createAssignment({
        member_id: assignmentForm.member_id,
        role_id: assignmentForm.role_id,
        level: assignmentForm.level,
        state: assignmentForm.state || undefined,
        district: assignmentForm.district || undefined,
        committee_year: assignmentForm.committee_year,
        role_start_date: assignmentForm.role_start_date || null,
        role_end_date: assignmentForm.role_end_date || null
      });

      if (result.success) {
        showToast('success', 'Member role assignment added successfully');
        setShowAddAssignmentModal(false);
        resetAssignmentForm();
        await loadMemberAssignments();
      } else {
        showToast('error', result.error || 'Failed to add member role assignment');
      }
    } catch (error) {
      console.error('Error adding member assignment:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const handleEditAssignment = (assignment: MemberLubRoleAssignment) => {
    setEditingAssignment(assignment);
    setAssignmentForm({
      member_id: assignment.member_id,
      role_id: assignment.role_id,
      level: assignment.level,
      state: assignment.state || '',
      district: assignment.district || '',
      committee_year: assignment.committee_year || '',
      role_start_date: assignment.role_start_date || '',
      role_end_date: assignment.role_end_date || ''
    });
    setSelectedMember({
      id: assignment.member_id,
      full_name: assignment.member_name,
      email: assignment.member_email
    });
    setShowEditAssignmentModal(true);
  };

  const handleUpdateAssignment = async () => {
    if (!editingAssignment || !assignmentForm.role_id || !assignmentForm.level) {
      showToast('error', 'Please fill in all required fields');
      return;
    }

    // Validate geographic requirements
    if ((assignmentForm.level === 'state' || assignmentForm.level === 'district' || assignmentForm.level === 'city') && !assignmentForm.state) {
      showToast('error', 'State is required for this level');
      return;
    }

    if ((assignmentForm.level === 'district' || assignmentForm.level === 'city') && !assignmentForm.district) {
      showToast('error', 'District is required for this level');
      return;
    }

    try {
      setIsSavingAssignment(true);

      const result = await memberLubRolesService.updateAssignment({
        id: editingAssignment.id,
        role_id: assignmentForm.role_id,
        level: assignmentForm.level,
        state: assignmentForm.state || undefined,
        district: assignmentForm.district || undefined,
        committee_year: assignmentForm.committee_year || undefined,
        role_start_date: assignmentForm.role_start_date || null,
        role_end_date: assignmentForm.role_end_date || null
      });

      if (result.success) {
        showToast('success', 'Member role assignment updated successfully');
        setShowEditAssignmentModal(false);
        setEditingAssignment(null);
        resetAssignmentForm();
        await loadMemberAssignments();
      } else {
        showToast('error', result.error || 'Failed to update member role assignment');
      }
    } catch (error) {
      console.error('Error updating member assignment:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to delete this member role assignment?')) return;

    try {
      const result = await memberLubRolesService.deleteAssignment({
        assignmentId
      });

      if (result.success) {
        showToast('success', 'Member role assignment deleted successfully');
        await loadMemberAssignments();
      } else {
        showToast('error', result.error || 'Failed to delete member role assignment');
      }
    } catch (error) {
      console.error('[AdminDesignationsManagement] Error deleting member assignment:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  const resetAssignmentForm = () => {
    setAssignmentForm({
      member_id: '',
      role_id: '',
      level: '',
      state: '',
      district: '',
      committee_year: '',
      role_start_date: '',
      role_end_date: ''
    });
    setSelectedMember(null);
    setMemberSearchTerm('');
    setMemberSearchResults([]);
  };

  const handleMemberSearchChange = (value: string) => {
    setMemberSearchTerm(value);
    if (value.length >= 2) {
      searchMembers(value);
    } else {
      setMemberSearchResults([]);
    }
  };

  const handleMemberSelect = (member: MemberSearchResult) => {
    setSelectedMember(member);
    setAssignmentForm(prev => ({ ...prev, member_id: member.id }));
    setMemberSearchTerm(member.full_name);
    setMemberSearchResults([]);
  };

  // Filter functions
  const filteredCompanyDesignations = companyDesignations.filter(designation =>
    designation.designation_name.toLowerCase().includes(searchTermCompany.toLowerCase())
  );

  const filteredLubRoles = lubRoles
    .filter(role => role.role_name.toLowerCase().includes(searchTermLubRoles.toLowerCase()))
    .sort((a, b) => {
      if (lubRolesSortOrder === 'asc') {
        return a.role_name.localeCompare(b.role_name);
      } else if (lubRolesSortOrder === 'desc') {
        return b.role_name.localeCompare(a.role_name);
      } else {
        // Custom order by display_order
        return (a.display_order || 0) - (b.display_order || 0);
      }
    });

  const committeeYearOptions = useMemo(() => {
    const years = Array.from(
        new Set(
          memberAssignments
          .map((a) => a.committee_year)
          .filter((y): y is string => !!y && y.trim().length > 0)
        )
      );

    years.sort((a, b) => b.localeCompare(a)); // Newest first
    return years;
  }, [memberAssignments]);

  const filteredMemberAssignments = memberAssignments
    .filter(assignment => {
      // Geographic filters
      if (assignmentFilters.level !== 'all' && assignment.level !== assignmentFilters.level) {
        return false;
      }

      if (assignmentFilters.state) {
        const assignmentState = (assignment.state || '').toLowerCase().trim();
        const filterState = assignmentFilters.state.toLowerCase().trim();
        if (assignmentState !== filterState) {
          return false;
        }
      }

      if (assignmentFilters.district) {
        const assignmentDistrict = (assignment.district || '').toLowerCase().trim();
        const filterDistrict = assignmentFilters.district.toLowerCase().trim();
        if (assignmentDistrict !== filterDistrict) {
          return false;
        }
      }

      if (assignmentFilters.committeeYear) {
        const assignmentYear = assignment.committee_year ?? '';
        if (assignmentYear !== assignmentFilters.committeeYear) {
          return false;
        }
      }

      // Text search filter
      const searchLower = searchTermAssignments.toLowerCase();
      if (searchLower) {
        return (
          assignment.member_name.toLowerCase().includes(searchLower) ||
          assignment.member_email.toLowerCase().includes(searchLower) ||
          assignment.role_name.toLowerCase().includes(searchLower)
        );
      }

      return true;
    })
    .sort((a, b) => {
      // Primary sort: display_order
      const orderA = a.lub_role_display_order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.lub_role_display_order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // Secondary sort: role name
      const roleCompare = (a.role_name || '').localeCompare(b.role_name || '');
      if (roleCompare !== 0) {
        return roleCompare;
      }

      // Tertiary sort: member name
      return (a.member_name || '').localeCompare(b.member_name || '');
    });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getLevelLabel = (level: string) => {
    const labels = {
      national: 'National',
      state: 'State',
      district: 'District',
      city: 'City'
    };
    return labels[level as keyof typeof labels] || level;
  };

  const getLevelColor = (level: string) => {
    const colors = {
      national: 'bg-purple-100 text-purple-800',
      state: 'bg-blue-100 text-blue-800',
      district: 'bg-green-100 text-green-800',
      city: 'bg-orange-100 text-orange-800'
    };
    return colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };


  return (
    <div className="min-h-screen bg-gray-50">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Building2 className="w-8 h-8 mr-3 text-blue-600" />
                Designations Management
              </h1>
              <p className="text-gray-600 mt-2">
                Manage company roles, LUB roles, and member assignments
              </p>
            </div>
          </div>
        </div>
        {/* Main Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('company')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'company'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Building2 className="w-4 h-4 inline mr-2" />
                Company Roles
              </button>
              <button
                onClick={() => setActiveTab('lub')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'lub'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Shield className="w-4 h-4 inline mr-2" />
                LUB Roles
              </button>
            </nav>
          </div>

          {/* Company Roles Tab Content */}
          {activeTab === 'company' && (
            <PermissionGate
              permission="organization.designations.view"
              fallback={
                <div className="p-6 text-center">
                  <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">You don't have permission to view company roles.</p>
                </div>
              }
            >
            <div className="p-6">
              {/* Search and Add Button */}
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search company roles..."
                    value={searchTermCompany}
                    onChange={(e) => setSearchTermCompany(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {canManageDesignations && (
                  <button
                    onClick={() => setShowAddCompanyModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Company Role
                  </button>
                )}
              </div>

              {/* Company Designations Table */}
              {isLoadingCompany ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading company roles...</p>
                </div>
              ) : filteredCompanyDesignations.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No company roles found</h3>
                  <p className="text-gray-600">
                    {searchTermCompany ? 'Try adjusting your search criteria' : 'No company roles have been added yet'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Updated
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredCompanyDesignations.map((designation) => (
                        <tr key={designation.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-medium text-gray-900">{designation.designation_name}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {canManageDesignations ? (
                              <button
                                onClick={() => handleToggleCompanyActive(designation.id, designation.is_active)}
                                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                                  designation.is_active
                                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                }`}
                              >
                                {designation.is_active ? (
                                  <>
                                    <ToggleRight className="w-4 h-4 mr-1" />
                                    Active
                                  </>
                                ) : (
                                  <>
                                    <ToggleLeft className="w-4 h-4 mr-1" />
                                    Inactive
                                  </>
                                )}
                              </button>
                            ) : (
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                designation.is_active
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {designation.is_active ? 'Active' : 'Inactive'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(designation.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(designation.updated_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-2">
                              {canManageDesignations && (
                                <>
                                  <button
                                    onClick={() => handleEditCompanyDesignation(designation)}
                                    className="text-blue-600 hover:text-blue-900 transition-colors"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCompanyDesignation(designation.id)}
                                    className="text-red-600 hover:text-red-900 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </PermissionGate>
          )}

          {/* LUB Roles Tab Content */}
          {activeTab === 'lub' && (
            <div>
              {/* LUB Roles Sub-tabs */}
              <div className="border-b border-gray-200">
                <nav className="flex space-x-8 px-6">
                  <button
                    onClick={() => setLubRolesSubTab('roles')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      lubRolesSubTab === 'roles'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Shield className="w-4 h-4 inline mr-2" />
                    Roles Master
                  </button>
                  <button
                    onClick={() => setLubRolesSubTab('assignments')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      lubRolesSubTab === 'assignments'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Users className="w-4 h-4 inline mr-2" />
                    Member Role Assignments
                  </button>
                </nav>
              </div>

              {/* Roles Master Sub-tab */}
              {lubRolesSubTab === 'roles' && (
                <PermissionGate
                  permission="organization.designations.view"
                  fallback={
                    <div className="p-6 text-center">
                      <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">You don't have permission to view LUB roles.</p>
                    </div>
                  }
                >
                <div className="p-6">
                  {/* Search and Add Button */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search LUB roles..."
                        value={searchTermLubRoles}
                        onChange={(e) => setSearchTermLubRoles(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    {canManageDesignations && (
                      <button
                        onClick={() => setShowAddLubRoleModal(true)}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add LUB Role
                      </button>
                    )}
                  </div>

                  {/* Info Message */}
                  {lubRolesSortOrder === 'custom' && filteredLubRoles.length > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <GripVertical className="w-4 h-4 inline mr-1" />
                        Drag and drop rows to reorder roles. Click "Role Name" to sort alphabetically.
                      </p>
                    </div>
                  )}

                  {isReordering && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        Saving new order...
                      </p>
                    </div>
                  )}

                  {/* LUB Roles Table */}
                  {isLoadingLubRoles ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading LUB roles...</p>
                    </div>
                  ) : filteredLubRoles.length === 0 ? (
                    <div className="text-center py-12">
                      <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No LUB roles found</h3>
                      <p className="text-gray-600">
                        {searchTermLubRoles ? 'Try adjusting your search criteria' : 'No LUB roles have been added yet'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                              {/* Drag handle column */}
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              <button
                                onClick={handleToggleLubRolesSort}
                                className="inline-flex items-center space-x-1 hover:text-gray-700 transition-colors"
                              >
                                <span>Role Name</span>
                                {lubRolesSortOrder === 'asc' && <ArrowUp className="w-4 h-4" />}
                                {lubRolesSortOrder === 'desc' && <ArrowDown className="w-4 h-4" />}
                                {lubRolesSortOrder === 'custom' && (
                                  <span className="text-xs text-gray-400">(Custom)</span>
                                )}
                              </button>
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Created
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Updated
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredLubRoles.map((role) => (
                            <tr
                              key={role.id}
                              draggable={lubRolesSortOrder === 'custom' && !isReordering}
                              onDragStart={(e) => handleDragStart(e, role)}
                              onDragOver={(e) => handleDragOver(e, role.id)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, role)}
                              onDragEnd={handleDragEnd}
                              className={`transition-all ${
                                draggedRole?.id === role.id
                                  ? 'opacity-50'
                                  : dragOverRole === role.id
                                  ? 'bg-blue-50 border-t-2 border-blue-400'
                                  : 'hover:bg-gray-50'
                              } ${lubRolesSortOrder === 'custom' && !isReordering ? 'cursor-move' : ''}`}
                            >
                              <td className="px-2 py-4 whitespace-nowrap text-gray-400">
                                {lubRolesSortOrder === 'custom' && !isReordering && (
                                  <GripVertical className="w-5 h-5" />
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="font-medium text-gray-900">{role.role_name}</span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {canManageDesignations ? (
                                  <button
                                    onClick={() => handleToggleLubRoleActive(role.id, role.is_active)}
                                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                                      role.is_active
                                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                    }`}
                                  >
                                    {role.is_active ? (
                                      <>
                                        <ToggleRight className="w-4 h-4 mr-1" />
                                        Active
                                      </>
                                    ) : (
                                      <>
                                        <ToggleLeft className="w-4 h-4 mr-1" />
                                        Inactive
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                    role.is_active
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {role.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                {formatDate(role.created_at)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                {formatDate(role.updated_at)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center space-x-2">
                                  {canManageDesignations && (
                                    <>
                                      <button
                                        onClick={() => handleEditLubRole(role)}
                                        className="text-blue-600 hover:text-blue-900 transition-colors"
                                      >
                                        <Edit3 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteLubRole(role.id)}
                                        className="text-red-600 hover:text-red-900 transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                </PermissionGate>
              )}

              {/* Member Role Assignments Sub-tab */}
              {lubRolesSubTab === 'assignments' && (
                <PermissionGate
                  permission="organization.designations.view"
                  fallback={
                    <div className="p-6 text-center">
                      <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">You don't have permission to view member role assignments.</p>
                    </div>
                  }
                >
                <div className="p-6">
                  {/* Search and Add Button */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search member assignments..."
                        value={searchTermAssignments}
                        onChange={(e) => setSearchTermAssignments(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    {canManageDesignations && (
                      <button
                        onClick={() => setShowAddAssignmentModal(true)}
                        className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Assignment
                      </button>
                    )}
                  </div>

                  {/* Geographic Filters */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="w-4 h-4 text-gray-600" />
                      <h3 className="text-sm font-medium text-gray-700">Filter by Geographic Scope</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Committee Year Filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Committee Year</label>
                        <select
                          value={assignmentFilters.committeeYear}
                          onChange={(e) => {
                            setAssignmentFilters(prev => ({
                              ...prev,
                              committeeYear: e.target.value
                            }));
                          }}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">All Years</option>
                          {committeeYearOptions.map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>

                      {/* Level Filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Level</label>
                        <select
                          value={assignmentFilters.level}
                          onChange={(e) => {
                            const newLevel = e.target.value;
                            setAssignmentFilters({
                              level: newLevel,
                              state: (newLevel === 'all' || newLevel === 'national') ? '' : assignmentFilters.state,
                              district: (newLevel === 'all' || newLevel === 'national' || newLevel === 'state') ? '' : assignmentFilters.district,
                              committeeYear: assignmentFilters.committeeYear
                            });
                          }}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="all">All Levels</option>
                          <option value="national">National</option>
                          <option value="state">State</option>
                          <option value="district">District</option>
                          <option value="city">City</option>
                        </select>
                      </div>

                      {/* State Filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                        <select
                          value={assignmentFilters.state}
                          onChange={(e) => {
                            setAssignmentFilters(prev => ({
                              ...prev,
                              state: e.target.value,
                              district: ''
                            }));
                          }}
                          disabled={assignmentFilters.level === 'all' || assignmentFilters.level === 'national'}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                          <option value="">All States</option>
                          {assignmentStates.map(state => (
                            <option key={state.id} value={state.state_name}>
                              {state.state_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* District Filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">District</label>
                        <select
                          value={assignmentFilters.district}
                          onChange={(e) => {
                            setAssignmentFilters(prev => ({
                              ...prev,
                              district: e.target.value
                            }));
                          }}
                          disabled={assignmentFilters.level !== 'district' && assignmentFilters.level !== 'city'}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                          <option value="">All Districts</option>
                          {assignmentDistricts.map(district => (
                            <option key={district.district_id} value={district.district_name}>
                              {district.district_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Member Assignments Table */}
                  {isLoadingAssignments ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading member assignments...</p>
                    </div>
                  ) : filteredMemberAssignments.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No member assignments found</h3>
                      <p className="text-gray-600">
                        {searchTermAssignments ? 'Try adjusting your search criteria' : 'No member role assignments have been added yet'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Member
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Role
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Level
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Geographic Scope
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Created
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredMemberAssignments.map((assignment) => (
                            <tr key={assignment.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="font-medium text-gray-900">{assignment.member_name}</div>
                                  <div className="text-sm text-gray-500">{assignment.member_email}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="font-medium text-gray-900">{assignment.role_name}</span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getLevelColor(assignment.level)}`}>
                                  {getLevelLabel(assignment.level)}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                {assignment.level === 'national' ? (
                                  <span className="text-purple-600 font-medium">All India</span>
                                ) : (
                                  <div>
                                    {assignment.state && (
                                      <div className="flex items-center">
                                        <MapPin className="w-3 h-3 mr-1" />
                                        {assignment.state}
                                        {assignment.district && `, ${assignment.district}`}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                {formatDate(assignment.created_at)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center space-x-2">
                                  {canManageDesignations && (
                                    <>
                                      <button
                                        onClick={() => handleEditAssignment(assignment)}
                                        className="text-blue-600 hover:text-blue-900 transition-colors"
                                      >
                                        <Edit3 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteAssignment(assignment.id)}
                                        className="text-red-600 hover:text-red-900 transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                </PermissionGate>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Company Designation Modal */}
      {showAddCompanyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Company Role</h3>
              <button
                onClick={() => setShowAddCompanyModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCompanyDesignationName}
                  onChange={(e) => setNewCompanyDesignationName(e.target.value)}
                  placeholder="Enter role name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="newCompanyIsActive"
                  checked={newCompanyIsActive}
                  onChange={(e) => setNewCompanyIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="newCompanyIsActive" className="ml-2 text-sm font-medium text-gray-700">
                  Set as active role
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowAddCompanyModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCompanyDesignation}
                disabled={isSavingCompany || !newCompanyDesignationName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingCompany ? 'Adding...' : 'Add Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Designation Modal */}
      {showEditCompanyModal && editingCompanyDesignation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Company Role</h3>
              <button
                onClick={() => setShowEditCompanyModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editCompanyDesignationName}
                  onChange={(e) => setEditCompanyDesignationName(e.target.value)}
                  placeholder="Enter role name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editCompanyIsActive"
                  checked={editCompanyIsActive}
                  onChange={(e) => setEditCompanyIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="editCompanyIsActive" className="ml-2 text-sm font-medium text-gray-700">
                  Set as active role
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowEditCompanyModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateCompanyDesignation}
                disabled={isSavingCompany || !editCompanyDesignationName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingCompany ? 'Updating...' : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add LUB Role Modal */}
      {showAddLubRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add LUB Role</h3>
              <button
                onClick={() => setShowAddLubRoleModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newLubRoleName}
                  onChange={(e) => setNewLubRoleName(e.target.value)}
                  placeholder="Enter LUB role name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="newLubRoleIsActive"
                  checked={newLubRoleIsActive}
                  onChange={(e) => setNewLubRoleIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="newLubRoleIsActive" className="ml-2 text-sm font-medium text-gray-700">
                  Set as active role
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowAddLubRoleModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLubRole}
                disabled={isSavingLubRole || !newLubRoleName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingLubRole ? 'Adding...' : 'Add Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit LUB Role Modal */}
      {showEditLubRoleModal && editingLubRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit LUB Role</h3>
              <button
                onClick={() => setShowEditLubRoleModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editLubRoleName}
                  onChange={(e) => setEditLubRoleName(e.target.value)}
                  placeholder="Enter LUB role name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editLubRoleIsActive"
                  checked={editLubRoleIsActive}
                  onChange={(e) => setEditLubRoleIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="editLubRoleIsActive" className="ml-2 text-sm font-medium text-gray-700">
                  Set as active role
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowEditLubRoleModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateLubRole}
                disabled={isSavingLubRole || !editLubRoleName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingLubRole ? 'Updating...' : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Assignment Modal */}
      {showAddAssignmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Member Role Assignment</h3>
              <button
                onClick={() => {
                  setShowAddAssignmentModal(false);
                  resetAssignmentForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Member Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Member <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={memberSearchTerm}
                    onChange={(e) => handleMemberSearchChange(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {isSearchingMembers && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
                
                {/* Search Results */}
                {memberSearchResults.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                    {memberSearchResults.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => handleMemberSelect(member)}
                        className="w-full text-left px-3 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-medium text-gray-900 mb-1">{member.full_name}</div>
                        <div className="text-sm text-gray-600 mb-0.5">{member.company_name} • {member.city}, {member.district}</div>
                        <div className="text-sm text-gray-500">{member.email}</div>
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Selected Member */}
                {selectedMember && (
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-blue-900">{selectedMember.full_name}</div>
                        <div className="text-sm text-blue-700">{selectedMember.email}</div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedMember(null);
                          setAssignmentForm(prev => ({ ...prev, member_id: '' }));
                          setMemberSearchTerm('');
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  LUB Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={assignmentForm.role_id}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, role_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select LUB Role</option>
                  {lubRoles.filter(role => role.is_active).map(role => (
                    <option key={role.id} value={role.id}>{role.role_name}</option>
                  ))}
                </select>
              </div>

              {/* Level Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Level <span className="text-red-500">*</span>
                </label>
                <select
                  value={assignmentForm.level}
                  onChange={(e) => setAssignmentForm(prev => ({ 
                    ...prev, 
                    level: e.target.value as 'national' | 'state' | 'district' | 'city' | '',
                    state: e.target.value === 'national' ? '' : prev.state,
                    district: e.target.value === 'national' || e.target.value === 'state' ? '' : prev.district
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Level</option>
                  <option value="national">National</option>
                  <option value="state">State</option>
                  <option value="district">District</option>
                  <option value="city">City</option>
                </select>
              </div>

              {/* State Selection */}
              {(assignmentForm.level === 'state' || assignmentForm.level === 'district' || assignmentForm.level === 'city') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State <span className="text-red-500">*</span>
                  </label>
                  {isLoadingStates ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                      Loading states...
                    </div>
                  ) : (
                    <select
                      value={assignmentForm.state}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, state: e.target.value, district: '' }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select State</option>
                      {allStates.map(state => (
                        <option key={state.id} value={state.state_name}>{state.state_name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* District Selection */}
              {(assignmentForm.level === 'district' || assignmentForm.level === 'city') && assignmentForm.state && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    District <span className="text-red-500">*</span>
                  </label>
                  {isLoadingDistricts ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                      Loading districts...
                    </div>
                  ) : (
                    <select
                      value={assignmentForm.district}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, district: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select District</option>
                      {availableDistricts.map(district => (
                        <option key={district.district_id} value={district.district_name}>
                          {district.district_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Committee Year */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Committee Year <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={assignmentForm.committee_year}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, committee_year: e.target.value }))}
                  placeholder="2025"
                  maxLength={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Period From Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period From <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="date"
                  value={assignmentForm.role_start_date}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, role_start_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Period To Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period To <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="date"
                  value={assignmentForm.role_end_date}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, role_end_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowAddAssignmentModal(false);
                  resetAssignmentForm();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAssignment}
                disabled={isSavingAssignment || !assignmentForm.member_id || !assignmentForm.role_id || !assignmentForm.level || !assignmentForm.committee_year}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingAssignment ? 'Adding...' : 'Add Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Assignment Modal */}
      {showEditAssignmentModal && editingAssignment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Member Role Assignment</h3>
              <button
                onClick={() => {
                  setShowEditAssignmentModal(false);
                  setEditingAssignment(null);
                  resetAssignmentForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Member Info (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Member
                </label>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="font-medium text-gray-900">{editingAssignment.member_name}</div>
                  <div className="text-sm text-gray-500">{editingAssignment.member_email}</div>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  LUB Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={assignmentForm.role_id}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, role_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select LUB Role</option>
                  {lubRoles.filter(role => role.is_active).map(role => (
                    <option key={role.id} value={role.id}>{role.role_name}</option>
                  ))}
                </select>
              </div>

              {/* Level Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Level <span className="text-red-500">*</span>
                </label>
                <select
                  value={assignmentForm.level}
                  onChange={(e) => setAssignmentForm(prev => ({ 
                    ...prev, 
                    level: e.target.value as 'national' | 'state' | 'district' | 'city' | '',
                    state: e.target.value === 'national' ? '' : prev.state,
                    district: e.target.value === 'national' || e.target.value === 'state' ? '' : prev.district
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Level</option>
                  <option value="national">National</option>
                  <option value="state">State</option>
                  <option value="district">District</option>
                  <option value="city">City</option>
                </select>
              </div>

              {/* State Selection */}
              {(assignmentForm.level === 'state' || assignmentForm.level === 'district' || assignmentForm.level === 'city') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State <span className="text-red-500">*</span>
                  </label>
                  {isLoadingStates ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                      Loading states...
                    </div>
                  ) : (
                    <select
                      value={assignmentForm.state}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, state: e.target.value, district: '' }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select State</option>
                      {allStates.map(state => (
                        <option key={state.id} value={state.state_name}>{state.state_name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* District Selection */}
              {(assignmentForm.level === 'district' || assignmentForm.level === 'city') && assignmentForm.state && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    District <span className="text-red-500">*</span>
                  </label>
                  {isLoadingDistricts ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                      Loading districts...
                    </div>
                  ) : (
                    <select
                      value={assignmentForm.district}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, district: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select District</option>
                      {availableDistricts.map(district => (
                        <option key={district.district_id} value={district.district_name}>
                          {district.district_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowEditAssignmentModal(false);
                  setEditingAssignment(null);
                  resetAssignmentForm();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateAssignment}
                disabled={isSavingAssignment || !assignmentForm.role_id || !assignmentForm.level}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingAssignment ? 'Updating...' : 'Update Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDesignationsManagement;
