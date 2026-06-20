import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Search, ToggleLeft, ToggleRight, X, Users, Shield, MapPin, ArrowUp, ArrowDown, GripVertical, Lock, MoreHorizontal, Edit3, Trash2, ListChecks } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { companyDesignationsService, CompanyDesignation, lubRolesService, LubRole, memberLubRolesService, MemberLubRoleAssignment, MemberRoleCandidate, statesService, locationsService, StateMaster, DistrictOption } from '../lib/supabase';
import { formatDateTimeValue } from '../lib/dateTimeManager';
import Toast from '../components/Toast';
import { PageHeader } from '../components/ui/PageHeader';

type MemberSearchResult = {
  id: string;
  full_name: string;
  company_name: string;
  email: string;
  city: string;
  district: string;
};

type CommitteeRow = {
  id: string;
  role_id: string;
  candidate: MemberRoleCandidate | null;
  searchTerm: string;
  searchResults: MemberRoleCandidate[];
  isSearching: boolean;
};

type CommitteeSkippedRow = {
  rowId: string;
  roleName: string;
  memberName: string;
  reason: string;
};

type CommitteeGroupSummary = {
  key: string;
  level: 'national' | 'state' | 'district' | 'city';
  state: string;
  district: string;
  committee_year: string;
  role_start_date: string;
  role_end_date: string;
  count: number;
  hasMixedPeriod: boolean;
};

const createCommitteeRow = (roleId = ''): CommitteeRow => ({
  id: `committee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role_id: roleId,
  candidate: null,
  searchTerm: '',
  searchResults: [],
  isSearching: false,
});

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
    role_end_date: '',
    assignee_kind: 'main' as 'main' | 'alternate',
    alternate_contact_name: ''
  });

  // Member search state
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<MemberRoleCandidate[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<MemberRoleCandidate | null>(null);

  // Committee builder state
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    level: '' as 'national' | 'state' | 'district' | 'city' | '',
    state: '',
    district: '',
    committee_year: '',
    role_start_date: '',
    role_end_date: ''
  });
  const [committeeRows, setCommitteeRows] = useState<CommitteeRow[]>([createCommitteeRow()]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkAvailableDistricts, setBulkAvailableDistricts] = useState<DistrictOption[]>([]);
  const [bulkResult, setBulkResult] = useState<{
    addedCount: number;
    skippedCount: number;
    emptyCount: number;
    skipped: CommitteeSkippedRow[];
  } | null>(null);
  const [showEditCommitteeModal, setShowEditCommitteeModal] = useState(false);
  const [editingCommitteeGroup, setEditingCommitteeGroup] = useState<CommitteeGroupSummary | null>(null);
  const [committeeEditForm, setCommitteeEditForm] = useState({
    level: '' as 'national' | 'state' | 'district' | 'city' | '',
    state: '',
    district: '',
    committee_year: '',
    role_start_date: '',
    role_end_date: ''
  });
  const [editCommitteeDistricts, setEditCommitteeDistricts] = useState<DistrictOption[]>([]);
  const [isLoadingEditCommitteeDistricts, setIsLoadingEditCommitteeDistricts] = useState(false);
  const [isUpdatingCommittee, setIsUpdatingCommittee] = useState(false);

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

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  const loadStates = useCallback(async () => {
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
  }, [showToast]);

  const loadDistricts = useCallback(async (stateName: string) => {
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
  }, [showToast]);

  const loadAssignmentStates = useCallback(async () => {
    try {
      const states = await statesService.getAllStates();
      setAssignmentStates(states.filter(state => state.is_active));
    } catch (error) {
      console.error('[AdminDesignationsManagement] Error loading assignment filter states:', error);
    }
  }, []);

  const loadAssignmentDistricts = useCallback(async (stateName: string) => {
    try {
      const districts = await locationsService.getActiveDistrictsByStateName(stateName);
      setAssignmentDistricts(districts);
    } catch (error) {
      console.error('[AdminDesignationsManagement] Error loading assignment filter districts:', error);
    }
  }, []);

  const loadEditCommitteeDistricts = useCallback(async (stateName: string) => {
    try {
      setIsLoadingEditCommitteeDistricts(true);
      const districts = await locationsService.getActiveDistrictsByStateName(stateName);
      setEditCommitteeDistricts(districts);
    } catch (error) {
      console.error('[AdminDesignationsManagement] Error loading edit committee districts:', error);
      showToast('error', 'Failed to load districts');
    } finally {
      setIsLoadingEditCommitteeDistricts(false);
    }
  }, [showToast]);

  const loadCompanyDesignations = useCallback(async () => {
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
  }, [showToast]);

  const loadLubRoles = useCallback(async () => {
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
  }, [showToast]);

  const loadMemberAssignments = useCallback(async () => {
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
  }, [searchTermAssignments, showToast]);

  const searchMembers = async (searchTerm: string) => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setMemberSearchResults([]);
      return;
    }

    try {
      setIsSearchingMembers(true);
      const results = await memberLubRolesService.searchMemberCandidates(searchTerm);
      setMemberSearchResults(results);
    } catch (error) {
      console.error('Error searching members:', error);
      showToast('error', 'Failed to search members');
    } finally {
      setIsSearchingMembers(false);
    }
  };

  useEffect(() => {
    void loadStates();
  }, [loadStates]);

  useEffect(() => {
    if (activeTab === 'company') {
      void loadCompanyDesignations();
    } else if (activeTab === 'lub') {
      void loadLubRoles();
      if (lubRolesSubTab === 'assignments') {
        void loadMemberAssignments();
      }
    }
  }, [activeTab, loadCompanyDesignations, loadLubRoles, loadMemberAssignments, lubRolesSubTab]);

  useEffect(() => {
    if (assignmentForm.state && (assignmentForm.level === 'district' || assignmentForm.level === 'city')) {
      void loadDistricts(assignmentForm.state);
    } else {
      setAvailableDistricts([]);
      setAssignmentForm(prev => ({ ...prev, district: '' }));
    }
  }, [assignmentForm.level, assignmentForm.state, loadDistricts]);

  useEffect(() => {
    if (lubRolesSubTab === 'assignments') {
      void loadAssignmentStates();
    }
  }, [loadAssignmentStates, lubRolesSubTab]);

  useEffect(() => {
    if (assignmentFilters.state && (assignmentFilters.level === 'district' || assignmentFilters.level === 'city')) {
      void loadAssignmentDistricts(assignmentFilters.state);
    } else {
      setAssignmentDistricts([]);
      if (assignmentFilters.level !== 'all' && assignmentFilters.level !== 'national' && assignmentFilters.level !== 'state') {
        setAssignmentFilters(prev => ({ ...prev, district: '' }));
      }
    }
  }, [assignmentFilters.level, assignmentFilters.state, loadAssignmentDistricts]);

  useEffect(() => {
    if (
      committeeEditForm.state
      && (committeeEditForm.level === 'district' || committeeEditForm.level === 'city')
    ) {
      void loadEditCommitteeDistricts(committeeEditForm.state);
    } else {
      setEditCommitteeDistricts([]);
      if (committeeEditForm.level !== 'district' && committeeEditForm.level !== 'city' && committeeEditForm.district) {
        setCommitteeEditForm(prev => ({ ...prev, district: '' }));
      }
    }
  }, [committeeEditForm.district, committeeEditForm.level, committeeEditForm.state, loadEditCommitteeDistricts]);

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
        member_id:               assignmentForm.member_id,
        role_id:                 assignmentForm.role_id,
        level:                   assignmentForm.level,
        state:                   assignmentForm.state || undefined,
        district:                assignmentForm.district || undefined,
        committee_year:          assignmentForm.committee_year,
        role_start_date:         assignmentForm.role_start_date || null,
        role_end_date:           assignmentForm.role_end_date || null,
        assignee_kind:           assignmentForm.assignee_kind,
        alternate_contact_name:  assignmentForm.alternate_contact_name || null,
        alternate_mobile:        null,
        alternate_photo_url:     null
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
      role_end_date: assignment.role_end_date || '',
      assignee_kind: assignment.assignee_kind || 'main',
      alternate_contact_name: assignment.alternate_contact_name_snapshot || ''
    });
    setSelectedMember({
      id: assignment.member_id,
      full_name: assignment.member_name,
      company_name: assignment.member_registrations?.company_name || '',
      email: assignment.member_email,
      city: '',
      district: assignment.district || ''
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
      role_end_date: '',
      assignee_kind: 'main',
      alternate_contact_name: ''
    });
    setSelectedMember(null);
    setSelectedCandidate(null);
    setMemberSearchTerm('');
    setMemberSearchResults([]);
  };

  // ─── Bulk Assignment Handlers ───────────────────────────────────────────────

  const loadBulkDistricts = useCallback(async (stateName: string) => {
    try {
      const districts = await locationsService.getActiveDistrictsByStateName(stateName);
      setBulkAvailableDistricts(districts);
    } catch (error) {
      console.error('[AdminDesignationsManagement] Error loading committee districts:', error);
      showToast('error', 'Failed to load districts');
    }
  }, [showToast]);

  const resetBulkForm = () => {
    setBulkForm({
      level: '',
      state: '',
      district: '',
      committee_year: '',
      role_start_date: '',
      role_end_date: ''
    });
    setCommitteeRows([createCommitteeRow()]);
    setBulkAvailableDistricts([]);
    setBulkResult(null);
  };

  const resetCommitteeEditForm = () => {
    setCommitteeEditForm({
      level: '',
      state: '',
      district: '',
      committee_year: '',
      role_start_date: '',
      role_end_date: ''
    });
    setEditingCommitteeGroup(null);
    setEditCommitteeDistricts([]);
  };

  const openCommitteeBuilder = () => {
    const activeRows = lubRoles
      .filter(role => role.is_active)
      .map(role => createCommitteeRow(role.id));
    setCommitteeRows(activeRows.length > 0 ? activeRows : [createCommitteeRow()]);
    setBulkResult(null);
    setShowBulkAssignModal(true);
  };

  const openEditCommittee = () => {
    if (!canEditCommitteeGroup || !editableCommitteeGroup) {
      showToast('error', 'Narrow the list to one committee before editing committee details.');
      return;
    }

    setEditingCommitteeGroup(editableCommitteeGroup);
    setCommitteeEditForm({
      level: editableCommitteeGroup.level,
      state: editableCommitteeGroup.state,
      district: editableCommitteeGroup.district,
      committee_year: editableCommitteeGroup.committee_year,
      role_start_date: editableCommitteeGroup.role_start_date,
      role_end_date: editableCommitteeGroup.role_end_date
    });
    setEditCommitteeDistricts([]);
    if (
      editableCommitteeGroup.state
      && (editableCommitteeGroup.level === 'district' || editableCommitteeGroup.level === 'city')
    ) {
      void loadEditCommitteeDistricts(editableCommitteeGroup.state);
    }
    setShowEditCommitteeModal(true);
  };

  const updateCommitteeRow = (rowId: string, patch: Partial<CommitteeRow>) => {
    setCommitteeRows(prev => prev.map(row => row.id === rowId ? { ...row, ...patch } : row));
  };

  const addCommitteeRow = (roleId = '') => {
    setCommitteeRows(prev => [...prev, createCommitteeRow(roleId)]);
    setBulkResult(null);
  };

  const removeCommitteeRow = (rowId: string) => {
    setCommitteeRows(prev => prev.length > 1 ? prev.filter(row => row.id !== rowId) : [createCommitteeRow()]);
    setBulkResult(null);
  };

  const searchCommitteeMembers = async (rowId: string, searchTerm: string) => {
    const currentRow = committeeRows.find(row => row.id === rowId);
    const keepCandidate = currentRow?.candidate?.display_name === searchTerm ? currentRow.candidate : null;
    updateCommitteeRow(rowId, {
      searchTerm,
      candidate: searchTerm.trim() ? keepCandidate : null,
    });

    if (!searchTerm.trim() || searchTerm.trim().length < 2) {
      updateCommitteeRow(rowId, { searchResults: [], isSearching: false });
      return;
    }

    updateCommitteeRow(rowId, { isSearching: true });
    try {
      const selectedKeys = new Set(
        committeeRows
          .filter(row => row.id !== rowId && row.candidate)
          .map(row => `${row.candidate!.member_id}:${row.candidate!.assignee_kind}:${row.candidate!.alternate_contact_name ?? ''}`)
      );
      const results = await memberLubRolesService.searchMemberCandidates(searchTerm);
      updateCommitteeRow(rowId, {
        searchResults: results.filter(candidate => !selectedKeys.has(`${candidate.member_id}:${candidate.assignee_kind}:${candidate.alternate_contact_name ?? ''}`)),
      });
    } catch (error) {
      console.error('[AdminDesignationsManagement] Error searching committee members:', error);
      showToast('error', 'Failed to search members');
    } finally {
      updateCommitteeRow(rowId, { isSearching: false });
    }
  };

  const selectCommitteeCandidate = (rowId: string, candidate: MemberRoleCandidate) => {
    updateCommitteeRow(rowId, {
      candidate,
      searchTerm: candidate.display_name,
      searchResults: [],
      isSearching: false,
    });
    setBulkResult(null);
  };

  const clearCommitteeCandidate = (rowId: string) => {
    updateCommitteeRow(rowId, {
      candidate: null,
      searchTerm: '',
      searchResults: [],
      isSearching: false,
    });
    setBulkResult(null);
  };

  const handleBulkAssign = async () => {
    if (!bulkForm.level) {
      showToast('error', 'Level is required');
      return;
    }
    if ((bulkForm.level === 'state' || bulkForm.level === 'district' || bulkForm.level === 'city') && !bulkForm.state) {
      showToast('error', 'State is required for this level');
      return;
    }
    if ((bulkForm.level === 'district' || bulkForm.level === 'city') && !bulkForm.district) {
      showToast('error', 'District is required for this level');
      return;
    }
    if (!bulkForm.committee_year) {
      showToast('error', 'Committee Year is required');
      return;
    }
    if (!/^\d{4}$/.test(bulkForm.committee_year)) {
      showToast('error', 'Please enter a valid Committee Year (e.g., 2025)');
      return;
    }
    if (bulkForm.role_start_date && bulkForm.role_end_date) {
      if (new Date(bulkForm.role_end_date) < new Date(bulkForm.role_start_date)) {
        showToast('error', 'Period To date cannot be before Period From date');
        return;
      }
    }

    const completeRows = committeeRows.filter(row => row.role_id && row.candidate);
    const emptyCount = committeeRows.filter(row => row.role_id && !row.candidate).length;
    const incompleteRows = committeeRows.filter(row => !row.role_id && row.candidate);

    if (incompleteRows.length > 0) {
      showToast('error', 'Select a LUB Role for every row that has a member.');
      return;
    }

    if (completeRows.length === 0) {
      showToast('error', 'Select at least one committee member before creating assignments.');
      return;
    }

    try {
      setIsBulkSubmitting(true);
      setBulkResult(null);
      let addedCount = 0;
      const skipped: CommitteeSkippedRow[] = [];

      for (const row of completeRows) {
        const candidate = row.candidate!;
        const roleName = lubRoles.find(role => role.id === row.role_id)?.role_name ?? 'Selected role';
        const result = await memberLubRolesService.createAssignment({
          member_id: candidate.member_id,
          role_id: row.role_id,
          level: bulkForm.level as 'national' | 'state' | 'district' | 'city',
          state: bulkForm.state || undefined,
          district: bulkForm.district || undefined,
          committee_year: bulkForm.committee_year,
          role_start_date: bulkForm.role_start_date || null,
          role_end_date: bulkForm.role_end_date || null,
          assignee_kind: candidate.assignee_kind,
          alternate_contact_name: candidate.alternate_contact_name || null,
          alternate_mobile: candidate.alternate_mobile || null,
        });

        if (result.success) {
          addedCount += 1;
        } else {
          skipped.push({
            rowId: row.id,
            roleName,
            memberName: candidate.display_name,
            reason: result.error ?? 'Assignment failed',
          });
        }
      }

      setBulkResult({
        addedCount,
        skippedCount: skipped.length,
        emptyCount,
        skipped,
      });

      if (addedCount > 0) {
        await loadMemberAssignments();
      }

      if (skipped.length === 0) {
        showToast('success', `${addedCount} committee assignment${addedCount !== 1 ? 's' : ''} created successfully`);
        setShowBulkAssignModal(false);
        resetBulkForm();
      } else {
        showToast(
          addedCount > 0 ? 'success' : 'error',
          `Added ${addedCount}, skipped ${skipped.length}`
        );
      }
    } catch (error) {
      console.error('[AdminDesignationsManagement] Create committee error:', error);
      showToast('error', 'An unexpected error occurred while creating the committee');
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleUpdateCommitteeGroup = async () => {
    if (!editingCommitteeGroup) {
      showToast('error', 'Select a committee to edit');
      return;
    }

    if (!committeeEditForm.level) {
      showToast('error', 'Level is required');
      return;
    }

    if ((committeeEditForm.level === 'state' || committeeEditForm.level === 'district' || committeeEditForm.level === 'city') && !committeeEditForm.state) {
      showToast('error', 'State is required for this level');
      return;
    }

    if ((committeeEditForm.level === 'district' || committeeEditForm.level === 'city') && !committeeEditForm.district) {
      showToast('error', 'District is required for this level');
      return;
    }

    if (!committeeEditForm.committee_year || !/^\d{4}$/.test(committeeEditForm.committee_year)) {
      showToast('error', 'Please enter a valid Committee Year (e.g., 2025)');
      return;
    }

    if (committeeEditForm.role_start_date && committeeEditForm.role_end_date) {
      if (new Date(committeeEditForm.role_end_date) < new Date(committeeEditForm.role_start_date)) {
        showToast('error', 'Period To date cannot be before Period From date');
        return;
      }
    }

    try {
      setIsUpdatingCommittee(true);
      const result = await memberLubRolesService.updateCommitteeGroup({
        current: {
          level: editingCommitteeGroup.level,
          state: editingCommitteeGroup.state || null,
          district: editingCommitteeGroup.district || null,
          committee_year: editingCommitteeGroup.committee_year,
        },
        next: {
          level: committeeEditForm.level,
          state: committeeEditForm.state || null,
          district: committeeEditForm.district || null,
          committee_year: committeeEditForm.committee_year,
          role_start_date: committeeEditForm.role_start_date || null,
          role_end_date: committeeEditForm.role_end_date || null,
        },
      });

      if (result.success) {
        showToast('success', `Committee updated successfully (${result.updatedCount ?? editingCommitteeGroup.count} assignments)`);
        setShowEditCommitteeModal(false);
        resetCommitteeEditForm();
        setAssignmentFilters({
          level: committeeEditForm.level,
          state: committeeEditForm.level === 'national' ? '' : committeeEditForm.state,
          district: (committeeEditForm.level === 'district' || committeeEditForm.level === 'city') ? committeeEditForm.district : '',
          committeeYear: committeeEditForm.committee_year
        });
        await loadMemberAssignments();
      } else {
        showToast('error', result.error || 'Failed to update committee');
      }
    } catch (error) {
      console.error('[AdminDesignationsManagement] Update committee error:', error);
      showToast('error', 'An unexpected error occurred while updating the committee');
    } finally {
      setIsUpdatingCommittee(false);
    }
  };

  const handleMemberSearchChange = (value: string) => {
    setMemberSearchTerm(value);
    if (value.length >= 2) {
      searchMembers(value);
    } else {
      setMemberSearchResults([]);
    }
  };

  const handleMemberSelect = (candidate: MemberRoleCandidate) => {
    setSelectedCandidate(candidate);
    // Populate selectedMember for display (full_name shows the assignee's actual name)
    setSelectedMember({
      id: candidate.member_id,
      full_name: candidate.assignee_kind === 'alternate'
        ? candidate.alternate_contact_name!
        : candidate.main_member_name,
      company_name: candidate.company_name,
      email: candidate.email,
      city: candidate.city,
      district: candidate.district
    });
    setAssignmentForm(prev => ({
      ...prev,
      member_id:              candidate.member_id,
      assignee_kind:          candidate.assignee_kind,
      alternate_contact_name: candidate.alternate_contact_name || ''
    }));
    setMemberSearchTerm(candidate.display_name);
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

  const visibleCommitteeGroups = useMemo(() => {
    const groups = new Map<string, CommitteeGroupSummary>();

    filteredMemberAssignments.forEach((assignment) => {
      const level = assignment.level;
      const state = (assignment.state || '').trim();
      const district = (assignment.district || '').trim();
      const committeeYear = (assignment.committee_year || '').trim();
      const key = [level, state.toLowerCase(), district.toLowerCase(), committeeYear].join('|');
      const existing = groups.get(key);
      const roleStartDate = assignment.role_start_date || '';
      const roleEndDate = assignment.role_end_date || '';

      if (!existing) {
        groups.set(key, {
          key,
          level,
          state,
          district,
          committee_year: committeeYear,
          role_start_date: roleStartDate,
          role_end_date: roleEndDate,
          count: 1,
          hasMixedPeriod: false,
        });
        return;
      }

      existing.count += 1;
      if (existing.role_start_date !== roleStartDate || existing.role_end_date !== roleEndDate) {
        existing.hasMixedPeriod = true;
        existing.role_start_date = '';
        existing.role_end_date = '';
      }
    });

    return Array.from(groups.values());
  }, [filteredMemberAssignments]);

  const editableCommitteeGroup = visibleCommitteeGroups.length === 1
    ? visibleCommitteeGroups[0]
    : null;

  const canEditCommitteeGroup = !!editableCommitteeGroup && !searchTermAssignments.trim();

  const formatDate = (dateString: string) => {
    return formatDateTimeValue(dateString);
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

  const getCommitteeDisplayName = (
    level: string,
    state?: string,
    district?: string
  ) => {
    if (level === 'national') return 'National Committee';
    if (level === 'state') return `${state || 'State'} State Committee`;
    if (level === 'district') return `${district || 'District'} District Unit`;
    if (level === 'city') return `${district || 'City'} City Unit`;
    return 'Committee';
  };

  const getLevelColor = (level: string) => {
    const colors = {
      national: 'bg-primary/10 text-primary',
      state: 'bg-primary/10 text-primary',
      district: 'bg-primary/10 text-primary',
      city: 'bg-muted text-foreground'
    };
    return colors[level as keyof typeof colors] || 'bg-muted text-muted-foreground';
  };


  return (
    <div>
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div>
        <PageHeader
          title="Designations Management"
          subtitle="Manage company roles, LUB roles, and member assignments"
        />
        {/* Main Tabs */}
        <div className="bg-card rounded-lg shadow-sm border border-border mb-6">
          <div className="border-b border-border">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('company')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'company'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <Building2 className="w-4 h-4 inline mr-2" />
                Company Roles
              </button>
              <button
                onClick={() => setActiveTab('lub')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'lub'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
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
                  <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground">You don't have permission to view company roles.</p>
                </div>
              }
            >
            <div className="p-6">
              {/* Search and Add Button */}
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search company roles..."
                    value={searchTermCompany}
                    onChange={(e) => setSearchTermCompany(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                  />
                </div>
                {canManageDesignations && (
                  <button
                    onClick={() => setShowAddCompanyModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Company Role
                  </button>
                )}
              </div>

              {/* Company Designations Table */}
              {isLoadingCompany ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading company roles...</p>
                </div>
              ) : filteredCompanyDesignations.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="text-sm font-medium text-foreground mb-2">No company roles found</h3>
                  <p className="text-muted-foreground">
                    {searchTermCompany ? 'Try adjusting your search criteria' : 'No company roles have been added yet'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                          Role Name
                        </th>
                        <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                          Created
                        </th>
                        <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                          Updated
                        </th>
                        <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredCompanyDesignations.map((designation) => (
                        <tr key={designation.id} className="hover:bg-muted/30">
                          <td className="whitespace-nowrap">
                            <span className="font-medium text-foreground">{designation.designation_name}</span>
                          </td>
                          <td className="whitespace-nowrap">
                            {canManageDesignations ? (
                              <button
                                onClick={() => handleToggleCompanyActive(designation.id, designation.is_active)}
                                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                                  designation.is_active
                                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
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
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {designation.is_active ? 'Active' : 'Inactive'}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDate(designation.created_at)}
                          </td>
                          <td className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDate(designation.updated_at)}
                          </td>
                          <td className="whitespace-nowrap text-sm font-medium">
                            {canManageDesignations && (
                              <DropdownMenu>
                                <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-7 w-7')}>
                                  <span className="sr-only">Open actions menu</span>
                                  <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEditCompanyDesignation(designation)}>
                                    <Edit3 className="w-4 h-4" />Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onClick={() => handleDeleteCompanyDesignation(designation.id)}>
                                    <Trash2 className="w-4 h-4" />Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
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
              <div className="border-b border-border">
                <nav className="flex space-x-8 px-6">
                  <button
                    onClick={() => setLubRolesSubTab('roles')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      lubRolesSubTab === 'roles'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    }`}
                  >
                    <Shield className="w-4 h-4 inline mr-2" />
                    Roles Master
                  </button>
                  <button
                    onClick={() => setLubRolesSubTab('assignments')}
                    className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      lubRolesSubTab === 'assignments'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
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
                      <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                      <p className="text-muted-foreground">You don't have permission to view LUB roles.</p>
                    </div>
                  }
                >
                <div className="p-6">
                  {/* Search and Add Button */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search LUB roles..."
                        value={searchTermLubRoles}
                        onChange={(e) => setSearchTermLubRoles(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                      />
                    </div>
                    {canManageDesignations && (
                      <button
                        onClick={() => setShowAddLubRoleModal(true)}
                        className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add LUB Role
                      </button>
                    )}
                  </div>

                  {/* Info Message */}
                  {lubRolesSortOrder === 'custom' && filteredLubRoles.length > 0 && (
                    <div className="mb-4 p-3 bg-primary/5 border border-border rounded-lg">
                      <p className="text-sm text-foreground">
                        <GripVertical className="w-4 h-4 inline mr-1" />
                        Drag and drop rows to reorder roles. Click "Role Name" to sort alphabetically.
                      </p>
                    </div>
                  )}

                  {isReordering && (
                    <div className="mb-4 p-3 bg-muted/50 border border-border rounded-lg">
                      <p className="text-sm text-foreground">
                        Saving new order...
                      </p>
                    </div>
                  )}

                  {/* LUB Roles Table */}
                  {isLoadingLubRoles ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Loading LUB roles...</p>
                    </div>
                  ) : filteredLubRoles.length === 0 ? (
                    <div className="text-center py-12">
                      <Shield className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                      <h3 className="text-sm font-medium text-foreground mb-2">No LUB roles found</h3>
                      <p className="text-muted-foreground">
                        {searchTermLubRoles ? 'Try adjusting your search criteria' : 'No LUB roles have been added yet'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-border">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider w-12">
                              {/* Drag handle column */}
                            </th>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              <button
                                onClick={handleToggleLubRolesSort}
                                className="inline-flex items-center space-x-1 hover:text-foreground transition-colors"
                              >
                                <span>Role Name</span>
                                {lubRolesSortOrder === 'asc' && <ArrowUp className="w-4 h-4" />}
                                {lubRolesSortOrder === 'desc' && <ArrowDown className="w-4 h-4" />}
                                {lubRolesSortOrder === 'custom' && (
                                  <span className="text-xs text-muted-foreground">(Custom)</span>
                                )}
                              </button>
                            </th>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Status
                            </th>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Created
                            </th>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Updated
                            </th>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
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
                                  ? 'bg-primary/5 border-t-2 border-primary'
                                  : 'hover:bg-muted/30'
                              } ${lubRolesSortOrder === 'custom' && !isReordering ? 'cursor-move' : ''}`}
                            >
                              <td className="whitespace-nowrap text-muted-foreground">
                                {lubRolesSortOrder === 'custom' && !isReordering && (
                                  <GripVertical className="w-5 h-5" />
                                )}
                              </td>
                              <td className="whitespace-nowrap">
                                <span className="font-medium text-foreground">{role.role_name}</span>
                              </td>
                              <td className="whitespace-nowrap">
                                {canManageDesignations ? (
                                  <button
                                    onClick={() => handleToggleLubRoleActive(role.id, role.is_active)}
                                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                                      role.is_active
                                        ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
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
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {role.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap text-sm text-muted-foreground">
                                {formatDate(role.created_at)}
                              </td>
                              <td className="whitespace-nowrap text-sm text-muted-foreground">
                                {formatDate(role.updated_at)}
                              </td>
                              <td className="whitespace-nowrap text-sm font-medium">
                                {canManageDesignations && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-7 w-7')}>
                                      <span className="sr-only">Open actions menu</span>
                                      <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEditLubRole(role)}>
                                        <Edit3 className="w-4 h-4" />Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem variant="destructive" onClick={() => handleDeleteLubRole(role.id)}>
                                        <Trash2 className="w-4 h-4" />Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
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
                      <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                      <p className="text-muted-foreground">You don't have permission to view member role assignments.</p>
                    </div>
                  }
                >
                <div className="p-6">
                  {/* Search and Add Button */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search member assignments..."
                        value={searchTermAssignments}
                        onChange={(e) => setSearchTermAssignments(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                      />
                    </div>
                    {canManageDesignations && (
                      <div className="flex gap-2">
                        <button
                          onClick={openEditCommittee}
                          disabled={!canEditCommitteeGroup || isLoadingAssignments}
                          title={
                            searchTermAssignments.trim()
                              ? 'Clear member search before editing a whole committee'
                              : editableCommitteeGroup
                              ? `Edit ${editableCommitteeGroup.count} assignment${editableCommitteeGroup.count !== 1 ? 's' : ''} in this committee`
                              : 'Narrow the list to one committee group before editing'
                          }
                          className="inline-flex items-center px-4 py-2 border border-border bg-background text-foreground rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit Committee
                        </button>
                        <button
                          onClick={openCommitteeBuilder}
                          className="inline-flex items-center px-4 py-2 border border-border bg-background text-foreground rounded-lg hover:bg-muted transition-colors"
                        >
                          <ListChecks className="w-4 h-4 mr-2" />
                          Create Committee
                        </button>
                        <button
                          onClick={() => setShowAddAssignmentModal(true)}
                          className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Assignment
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Geographic Filters */}
                  <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium text-foreground">Filter by Geographic Scope</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Committee Year Filter */}
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Committee Year</label>
                        <select
                          value={assignmentFilters.committeeYear}
                          onChange={(e) => {
                            setAssignmentFilters(prev => ({
                              ...prev,
                              committeeYear: e.target.value
                            }));
                          }}
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                        >
                          <option value="">All Years</option>
                          {committeeYearOptions.map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>

                      {/* Level Filter */}
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Level</label>
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
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
                        <label className="block text-xs font-medium text-muted-foreground mb-1">State</label>
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
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted disabled:cursor-not-allowed"
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
                        <label className="block text-xs font-medium text-muted-foreground mb-1">District</label>
                        <select
                          value={assignmentFilters.district}
                          onChange={(e) => {
                            setAssignmentFilters(prev => ({
                              ...prev,
                              district: e.target.value
                            }));
                          }}
                          disabled={assignmentFilters.level !== 'district' && assignmentFilters.level !== 'city'}
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted disabled:cursor-not-allowed"
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
                    {filteredMemberAssignments.length > 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {searchTermAssignments.trim()
                          ? 'Clear member search before using Edit Committee.'
                          : editableCommitteeGroup
                          ? `Current list is one committee group with ${editableCommitteeGroup.count} assignment${editableCommitteeGroup.count !== 1 ? 's' : ''}.`
                          : `Current list contains ${visibleCommitteeGroups.length} committee groups. Narrow the committee filters before using Edit Committee.`}
                      </p>
                    )}
                  </div>

                  {/* Member Assignments Table */}
                  {isLoadingAssignments ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Loading member assignments...</p>
                    </div>
                  ) : filteredMemberAssignments.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                      <h3 className="text-sm font-medium text-foreground mb-2">No member assignments found</h3>
                      <p className="text-muted-foreground">
                        {searchTermAssignments ? 'Try adjusting your search criteria' : 'No member role assignments have been added yet'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-border">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Member
                            </th>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Role
                            </th>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Level
                            </th>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Geographic Scope
                            </th>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Created
                            </th>
                            <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredMemberAssignments.map((assignment) => (
                            <tr key={assignment.id} className="hover:bg-muted/30">
                              <td className="whitespace-nowrap">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-foreground">
                                      {assignment.assignee_kind === 'alternate' && assignment.alternate_contact_name_snapshot
                                        ? assignment.alternate_contact_name_snapshot
                                        : assignment.member_name}
                                    </span>
                                    {assignment.assignee_kind === 'alternate' ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                        Alternate
                                      </span>
                                    ) : null}
                                  </div>
                                  {assignment.assignee_kind === 'alternate' && (
                                    <div className="text-xs text-muted-foreground">for {assignment.member_name}</div>
                                  )}
                                  <div className="text-sm text-muted-foreground">{assignment.member_email}</div>
                                  {assignment.assignee_kind === 'alternate' && (
                                    <div className="text-xs text-muted-foreground">
                                      {assignment.alternate_contact_mobile_snapshot || '—'}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="whitespace-nowrap">
                                <span className="font-medium text-foreground">{assignment.role_name}</span>
                              </td>
                              <td className="whitespace-nowrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getLevelColor(assignment.level)}`}>
                                  {getLevelLabel(assignment.level)}
                                </span>
                              </td>
                              <td className="whitespace-nowrap text-sm text-muted-foreground">
                                {assignment.level === 'national' ? (
                                  <span className="text-primary font-medium">All India</span>
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
                              <td className="whitespace-nowrap text-sm text-muted-foreground">
                                {formatDate(assignment.created_at)}
                              </td>
                              <td className="whitespace-nowrap text-sm font-medium">
                                {canManageDesignations && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-7 w-7')}>
                                      <span className="sr-only">Open actions menu</span>
                                      <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEditAssignment(assignment)}>
                                        <Edit3 className="w-4 h-4" />Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem variant="destructive" onClick={() => handleDeleteAssignment(assignment.id)}>
                                        <Trash2 className="w-4 h-4" />Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
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
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section font-semibold text-foreground">Add Company Role</h3>
              <button
                onClick={() => setShowAddCompanyModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Role Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newCompanyDesignationName}
                  onChange={(e) => setNewCompanyDesignationName(e.target.value)}
                  placeholder="Enter role name"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="newCompanyIsActive"
                  checked={newCompanyIsActive}
                  onChange={(e) => setNewCompanyIsActive(e.target.checked)}
                  className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring focus:ring-2"
                />
                <label htmlFor="newCompanyIsActive" className="ml-2 text-sm font-medium text-foreground">
                  Set as active role
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowAddCompanyModal(false)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCompanyDesignation}
                disabled={isSavingCompany || !newCompanyDesignationName.trim()}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingCompany ? 'Adding...' : 'Add Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Designation Modal */}
      {showEditCompanyModal && editingCompanyDesignation && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section font-semibold text-foreground">Edit Company Role</h3>
              <button
                onClick={() => setShowEditCompanyModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Role Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={editCompanyDesignationName}
                  onChange={(e) => setEditCompanyDesignationName(e.target.value)}
                  placeholder="Enter role name"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editCompanyIsActive"
                  checked={editCompanyIsActive}
                  onChange={(e) => setEditCompanyIsActive(e.target.checked)}
                  className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring focus:ring-2"
                />
                <label htmlFor="editCompanyIsActive" className="ml-2 text-sm font-medium text-foreground">
                  Set as active role
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowEditCompanyModal(false)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateCompanyDesignation}
                disabled={isSavingCompany || !editCompanyDesignationName.trim()}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingCompany ? 'Updating...' : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add LUB Role Modal */}
      {showAddLubRoleModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section font-semibold text-foreground">Add LUB Role</h3>
              <button
                onClick={() => setShowAddLubRoleModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Role Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newLubRoleName}
                  onChange={(e) => setNewLubRoleName(e.target.value)}
                  placeholder="Enter LUB role name"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="newLubRoleIsActive"
                  checked={newLubRoleIsActive}
                  onChange={(e) => setNewLubRoleIsActive(e.target.checked)}
                  className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring focus:ring-2"
                />
                <label htmlFor="newLubRoleIsActive" className="ml-2 text-sm font-medium text-foreground">
                  Set as active role
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowAddLubRoleModal(false)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLubRole}
                disabled={isSavingLubRole || !newLubRoleName.trim()}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingLubRole ? 'Adding...' : 'Add Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit LUB Role Modal */}
      {showEditLubRoleModal && editingLubRole && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section font-semibold text-foreground">Edit LUB Role</h3>
              <button
                onClick={() => setShowEditLubRoleModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Role Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={editLubRoleName}
                  onChange={(e) => setEditLubRoleName(e.target.value)}
                  placeholder="Enter LUB role name"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editLubRoleIsActive"
                  checked={editLubRoleIsActive}
                  onChange={(e) => setEditLubRoleIsActive(e.target.checked)}
                  className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring focus:ring-2"
                />
                <label htmlFor="editLubRoleIsActive" className="ml-2 text-sm font-medium text-foreground">
                  Set as active role
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowEditLubRoleModal(false)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateLubRole}
                disabled={isSavingLubRole || !editLubRoleName.trim()}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingLubRole ? 'Updating...' : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Assignment Modal */}
      {showAddAssignmentModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section font-semibold text-foreground">Add Member Role Assignment</h3>
              <button
                onClick={() => {
                  setShowAddAssignmentModal(false);
                  resetAssignmentForm();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Member Search */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Member <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={memberSearchTerm}
                    onChange={(e) => handleMemberSearchChange(e.target.value)}
                    placeholder="Search by name, email, or alternate contact…"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                  />
                  {isSearchingMembers && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    </div>
                  )}
                </div>
                
                {/* Search Results */}
                {memberSearchResults.length > 0 && (
                  <div className="mt-2 border border-border rounded-lg max-h-60 overflow-y-auto">
                    {memberSearchResults.map((candidate, idx) => (
                      <button
                        key={`${candidate.member_id}-${candidate.assignee_kind}-${idx}`}
                        onClick={() => handleMemberSelect(candidate)}
                        className="w-full text-left px-3 py-3 hover:bg-muted/30 border-b border-border last:border-b-0"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground">{candidate.display_name}</span>
                          {candidate.assignee_kind === 'alternate' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 shrink-0">
                              Alternate
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary shrink-0">
                              Main
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">{candidate.secondary_text}</div>
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Selected Member */}
                {selectedMember && (
                  <div className="mt-2 p-3 bg-primary/5 border border-border rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">{selectedMember.full_name}</span>
                          {selectedCandidate?.assignee_kind === 'alternate' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 shrink-0">
                              Alternate contact
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary shrink-0">
                              Main member
                            </span>
                          )}
                        </div>
                        {selectedCandidate?.assignee_kind === 'alternate' && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Alternate for {selectedCandidate.main_member_name}
                          </div>
                        )}
                        <div className="text-sm text-muted-foreground mt-0.5">{selectedMember.email}</div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedMember(null);
                          setSelectedCandidate(null);
                          setAssignmentForm(prev => ({ ...prev, member_id: '', assignee_kind: 'main', alternate_contact_name: '' }));
                          setMemberSearchTerm('');
                        }}
                        className="text-primary hover:text-primary/80 shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {selectedCandidate?.assignee_kind === 'alternate' && (
                      <div className="mt-2">
                        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
                          This role will be assigned to the alternate contact, not the main member.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  LUB Role <span className="text-destructive">*</span>
                </label>
                <select
                  value={assignmentForm.role_id}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, role_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                >
                  <option value="">Select LUB Role</option>
                  {lubRoles.filter(role => role.is_active).map(role => (
                    <option key={role.id} value={role.id}>{role.role_name}</option>
                  ))}
                </select>
              </div>

              {/* Level Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Level <span className="text-destructive">*</span>
                </label>
                <select
                  value={assignmentForm.level}
                  onChange={(e) => setAssignmentForm(prev => ({ 
                    ...prev, 
                    level: e.target.value as 'national' | 'state' | 'district' | 'city' | '',
                    state: e.target.value === 'national' ? '' : prev.state,
                    district: e.target.value === 'national' || e.target.value === 'state' ? '' : prev.district
                  }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
                  <label className="block text-sm font-medium text-foreground mb-1">
                    State <span className="text-destructive">*</span>
                  </label>
                  {isLoadingStates ? (
                    <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-muted-foreground">
                      Loading states...
                    </div>
                  ) : (
                    <select
                      value={assignmentForm.state}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, state: e.target.value, district: '' }))}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
                  <label className="block text-sm font-medium text-foreground mb-1">
                    District <span className="text-destructive">*</span>
                  </label>
                  {isLoadingDistricts ? (
                    <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-muted-foreground">
                      Loading districts...
                    </div>
                  ) : (
                    <select
                      value={assignmentForm.district}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, district: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
                <label className="block text-sm font-medium text-foreground mb-1">
                  Committee Year <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={assignmentForm.committee_year}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, committee_year: e.target.value }))}
                  placeholder="2025"
                  maxLength={4}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>

              {/* Period From Date */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Period From <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="date"
                  value={assignmentForm.role_start_date}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, role_start_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>

              {/* Period To Date */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Period To <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="date"
                  value={assignmentForm.role_end_date}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, role_end_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-border">
              <button
                onClick={() => {
                  setShowAddAssignmentModal(false);
                  resetAssignmentForm();
                }}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAssignment}
                disabled={isSavingAssignment || !assignmentForm.member_id || !assignmentForm.role_id || !assignmentForm.level || !assignmentForm.committee_year}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingAssignment ? 'Adding...' : 'Add Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Committee Modal */}
      {showBulkAssignModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-6xl w-full max-h-[92vh] overflow-hidden flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div>
                <h3 className="text-section font-semibold text-foreground">Create Committee</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Build a complete committee for a level, place, and year. Empty member rows are allowed while editing and are ignored on submit.
                </p>
              </div>
              <button
                onClick={() => { setShowBulkAssignModal(false); resetBulkForm(); }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close create committee"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              {bulkResult && (
                <div className={`mb-5 p-4 rounded-lg border ${
                  bulkResult.skippedCount > 0
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                    : 'bg-primary/5 border-border'
                }`}>
                  <div className="font-medium text-foreground mb-1">
                    Result: Added {bulkResult.addedCount}, Skipped {bulkResult.skippedCount}
                    {bulkResult.emptyCount > 0 ? `, Empty rows ignored ${bulkResult.emptyCount}` : ''}
                  </div>
                  {bulkResult.skippedCount > 0 && (
                    <div className="space-y-2 mt-3">
                      {bulkResult.skipped.map(skip => (
                        <div key={skip.rowId} className="text-sm">
                          <span className="font-medium text-foreground">{skip.roleName}</span>
                          <span className="text-muted-foreground"> - {skip.memberName}: {skip.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Level <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={bulkForm.level}
                      onChange={(e) => {
                        const lv = e.target.value as 'national' | 'state' | 'district' | 'city' | '';
                        setBulkForm(prev => ({
                          ...prev,
                          level: lv,
                          state: lv === 'national' ? '' : prev.state,
                          district: (lv === 'national' || lv === 'state') ? '' : prev.district,
                        }));
                        setBulkAvailableDistricts([]);
                      }}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                    >
                      <option value="">Select Level</option>
                      <option value="national">National</option>
                      <option value="state">State</option>
                      <option value="district">District</option>
                      <option value="city">City</option>
                    </select>
                  </div>

                  {(bulkForm.level === 'state' || bulkForm.level === 'district' || bulkForm.level === 'city') && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        State <span className="text-destructive">*</span>
                      </label>
                      <select
                        value={bulkForm.state}
                        onChange={(e) => {
                          const stateName = e.target.value;
                          setBulkForm(prev => ({ ...prev, state: stateName, district: '' }));
                          setBulkAvailableDistricts([]);
                          if (stateName && (bulkForm.level === 'district' || bulkForm.level === 'city')) {
                            void loadBulkDistricts(stateName);
                          }
                        }}
                        className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                      >
                        <option value="">Select State</option>
                        {allStates.map(state => (
                          <option key={state.id} value={state.state_name}>{state.state_name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(bulkForm.level === 'district' || bulkForm.level === 'city') && bulkForm.state && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        District <span className="text-destructive">*</span>
                      </label>
                      <select
                        value={bulkForm.district}
                        onChange={(e) => setBulkForm(prev => ({ ...prev, district: e.target.value }))}
                        className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                      >
                        <option value="">Select District</option>
                        {bulkAvailableDistricts.map(district => (
                          <option key={district.district_id} value={district.district_name}>
                            {district.district_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Committee Year <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={bulkForm.committee_year}
                      onChange={(e) => setBulkForm(prev => ({ ...prev, committee_year: e.target.value }))}
                      placeholder="2026"
                      maxLength={4}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Period From <span className="text-muted-foreground">(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={bulkForm.role_start_date}
                      onChange={(e) => setBulkForm(prev => ({ ...prev, role_start_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Period To <span className="text-muted-foreground">(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={bulkForm.role_end_date}
                      onChange={(e) => setBulkForm(prev => ({ ...prev, role_end_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-border overflow-visible">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Committee Roles</h4>
                    <p className="text-xs text-muted-foreground">Roles are loaded from active LUB roles. Add duplicate rows when a role has multiple members.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addCommitteeRow()}
                      className="inline-flex items-center px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Role Row
                    </button>
                    {lubRoles.some(role => role.is_active && role.role_name.toLowerCase().includes('executive')) && (
                      <button
                        type="button"
                        onClick={() => addCommitteeRow(lubRoles.find(role => role.is_active && role.role_name.toLowerCase().includes('executive'))?.id ?? '')}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Executive Member
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-muted/20 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium w-[32%]">Role</th>
                        <th className="px-4 py-2 text-left font-medium">Member / Alternate Contact</th>
                        <th className="px-4 py-2 text-right font-medium w-20">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {committeeRows.map((row, index) => (
                        <tr key={row.id} className="border-t border-border align-top">
                          <td className="px-4 py-3">
                            <select
                              value={row.role_id}
                              onChange={(e) => {
                                updateCommitteeRow(row.id, { role_id: e.target.value });
                                setBulkResult(null);
                              }}
                              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                              aria-label={`Committee role ${index + 1}`}
                            >
                              <option value="">Select LUB Role</option>
                              {lubRoles.filter(role => role.is_active).map(role => (
                                <option key={role.id} value={role.id}>{role.role_name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            {row.candidate ? (
                              <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                                <div className="min-w-0">
                                  <div className="font-medium text-foreground">
                                    {row.candidate.display_name}
                                    {row.candidate.assignee_kind === 'alternate' && (
                                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Alternate</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">{row.candidate.secondary_text}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => clearCommitteeCandidate(row.id)}
                                  className="text-muted-foreground hover:text-destructive shrink-0"
                                  aria-label={`Clear ${row.candidate.display_name}`}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="relative">
                                <input
                                  type="text"
                                  value={row.searchTerm}
                                  onChange={(e) => { void searchCommitteeMembers(row.id, e.target.value); }}
                                  placeholder="Search name, email, member mobile, alternate name or alternate mobile"
                                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                                />
                                {row.isSearching && (
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                                  </div>
                                )}
                                {row.searchResults.length > 0 && (
                                  <div className="absolute left-0 right-0 z-[60] mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                                    {row.searchResults.map(candidate => (
                                      <button
                                        key={`${candidate.member_id}-${candidate.assignee_kind}-${candidate.alternate_contact_name ?? 'main'}`}
                                        type="button"
                                        onClick={() => selectCommitteeCandidate(row.id, candidate)}
                                        className="w-full text-left px-3 py-2.5 hover:bg-muted/50 border-b border-border last:border-b-0"
                                      >
                                        <div className="flex items-center gap-2 font-medium text-foreground text-sm">
                                          {candidate.display_name}
                                          {candidate.assignee_kind === 'alternate' && (
                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Alternate</span>
                                          )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{candidate.secondary_text}</div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <p className="mt-1 text-xs text-muted-foreground">Leave empty if this position is not finalized yet.</p>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeCommitteeRow(row.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                              aria-label={`Remove committee row ${index + 1}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
              <div className="text-xs text-muted-foreground">
                {committeeRows.filter(row => row.role_id && row.candidate).length} ready to save, {committeeRows.filter(row => row.role_id && !row.candidate).length} empty role rows.
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowBulkAssignModal(false); resetBulkForm(); }}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                >
                  {bulkResult ? 'Close' : 'Cancel'}
                </button>
                <button
                  onClick={() => { void handleBulkAssign(); }}
                  disabled={isBulkSubmitting || !bulkForm.level || !bulkForm.committee_year}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isBulkSubmitting ? 'Creating...' : 'Create Committee'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Committee Modal */}
      {showEditCommitteeModal && editingCommitteeGroup && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-section font-semibold text-foreground">Edit Committee Details</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Updating {editingCommitteeGroup.count} assignment{editingCommitteeGroup.count !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEditCommitteeModal(false);
                  resetCommitteeEditForm();
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close edit committee"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4">
              <label className="block text-sm font-medium text-foreground mb-1">
                Committee
              </label>
              <div className="text-sm text-muted-foreground">
                {getCommitteeDisplayName(committeeEditForm.level, committeeEditForm.state, committeeEditForm.district)}
              </div>
              {editingCommitteeGroup.hasMixedPeriod && (
                <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  Existing assignments have mixed period dates. Saving will set the same period on all assignments in this committee.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Level <span className="text-destructive">*</span>
                </label>
                <select
                  value={committeeEditForm.level}
                  onChange={(e) => {
                    const level = e.target.value as 'national' | 'state' | 'district' | 'city' | '';
                    setCommitteeEditForm(prev => ({
                      ...prev,
                      level,
                      state: level === 'national' ? '' : prev.state,
                      district: (level === 'national' || level === 'state') ? '' : prev.district
                    }));
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                >
                  <option value="">Select Level</option>
                  <option value="national">National</option>
                  <option value="state">State</option>
                  <option value="district">District</option>
                  <option value="city">City</option>
                </select>
              </div>

              {(committeeEditForm.level === 'state' || committeeEditForm.level === 'district' || committeeEditForm.level === 'city') && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    State <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={committeeEditForm.state}
                    onChange={(e) => setCommitteeEditForm(prev => ({ ...prev, state: e.target.value, district: '' }))}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                  >
                    <option value="">Select State</option>
                    {allStates.map(state => (
                      <option key={state.id} value={state.state_name}>{state.state_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {(committeeEditForm.level === 'district' || committeeEditForm.level === 'city') && committeeEditForm.state && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    District <span className="text-destructive">*</span>
                  </label>
                  {isLoadingEditCommitteeDistricts ? (
                    <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-muted-foreground">
                      Loading districts...
                    </div>
                  ) : (
                    <select
                      value={committeeEditForm.district}
                      onChange={(e) => setCommitteeEditForm(prev => ({ ...prev, district: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                    >
                      <option value="">Select District</option>
                      {editCommitteeDistricts.map(district => (
                        <option key={district.district_id} value={district.district_name}>
                          {district.district_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Committee Year <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={committeeEditForm.committee_year}
                  onChange={(e) => setCommitteeEditForm(prev => ({ ...prev, committee_year: e.target.value }))}
                  placeholder="2025"
                  maxLength={4}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Period From <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="date"
                  value={committeeEditForm.role_start_date}
                  onChange={(e) => setCommitteeEditForm(prev => ({ ...prev, role_start_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Period To <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="date"
                  value={committeeEditForm.role_end_date}
                  onChange={(e) => setCommitteeEditForm(prev => ({ ...prev, role_end_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring bg-background"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-border">
              <button
                onClick={() => {
                  setShowEditCommitteeModal(false);
                  resetCommitteeEditForm();
                }}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleUpdateCommitteeGroup(); }}
                disabled={isUpdatingCommittee || !committeeEditForm.level || !committeeEditForm.committee_year}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isUpdatingCommittee ? 'Updating...' : 'Update Committee'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Member Assignment Modal */}
      {showEditAssignmentModal && editingAssignment && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section font-semibold text-foreground">Edit Member Role Assignment</h3>
              <button
                onClick={() => {
                  setShowEditAssignmentModal(false);
                  setEditingAssignment(null);
                  resetAssignmentForm();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Member Info (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Member
                </label>
                <div className="p-3 bg-muted/50 border border-border rounded-lg">
                  <div className="font-medium text-foreground">{editingAssignment.member_name}</div>
                  <div className="text-sm text-muted-foreground">{editingAssignment.member_email}</div>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  LUB Role <span className="text-destructive">*</span>
                </label>
                <select
                  value={assignmentForm.role_id}
                  onChange={(e) => setAssignmentForm(prev => ({ ...prev, role_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                >
                  <option value="">Select LUB Role</option>
                  {lubRoles.filter(role => role.is_active).map(role => (
                    <option key={role.id} value={role.id}>{role.role_name}</option>
                  ))}
                </select>
              </div>

              {/* Level Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Level <span className="text-destructive">*</span>
                </label>
                <select
                  value={assignmentForm.level}
                  onChange={(e) => setAssignmentForm(prev => ({ 
                    ...prev, 
                    level: e.target.value as 'national' | 'state' | 'district' | 'city' | '',
                    state: e.target.value === 'national' ? '' : prev.state,
                    district: e.target.value === 'national' || e.target.value === 'state' ? '' : prev.district
                  }))}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
                  <label className="block text-sm font-medium text-foreground mb-1">
                    State <span className="text-destructive">*</span>
                  </label>
                  {isLoadingStates ? (
                    <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-muted-foreground">
                      Loading states...
                    </div>
                  ) : (
                    <select
                      value={assignmentForm.state}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, state: e.target.value, district: '' }))}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
                  <label className="block text-sm font-medium text-foreground mb-1">
                    District <span className="text-destructive">*</span>
                  </label>
                  {isLoadingDistricts ? (
                    <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-muted-foreground">
                      Loading districts...
                    </div>
                  ) : (
                    <select
                      value={assignmentForm.district}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, district: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
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
            
            <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-border">
              <button
                onClick={() => {
                  setShowEditAssignmentModal(false);
                  setEditingAssignment(null);
                  resetAssignmentForm();
                }}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateAssignment}
                disabled={isSavingAssignment || !assignmentForm.role_id || !assignmentForm.level}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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



