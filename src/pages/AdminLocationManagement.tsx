import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, Plus, Search, ArrowLeft, Building2, Users, AlertCircle, Loader2, X, Lock, MoreHorizontal, Edit3, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { locationsService, DistrictOption, CityOption, statesService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import Toast from '../components/Toast';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';

const AdminLocationManagement: React.FC = () => {
  const { stateName } = useParams<{ stateName: string }>();
  const canManageDistricts = useHasPermission('locations.districts.manage');
  const canManageCities = useHasPermission('locations.cities.manage');
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictOption | null>(null);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(true);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal state
  const [isAddDistrictOpen, setIsAddDistrictOpen] = useState(false);
  const [isAddCityOpen, setIsAddCityOpen] = useState(false);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  
  // Form state
  const [newDistrictName, setNewDistrictName] = useState('');
  const [newDistrictIsActive, setNewDistrictIsActive] = useState(true);
  const [isAddingDistrict, setIsAddingDistrict] = useState(false);
  
  const [newCityName, setNewCityName] = useState('');
  const [newCityIsPopular, setNewCityIsPopular] = useState(false);
  const [newCityIsActive, setNewCityIsActive] = useState(true);
  const [isAddingCity, setIsAddingCity] = useState(false);
  
  // Current state data
  const [currentStateId, setCurrentStateId] = useState<string | null>(null);
  
  // Edit district modal state
  const [isEditDistrictOpen, setIsEditDistrictOpen] = useState(false);
  const [editingDistrict, setEditingDistrict] = useState<DistrictOption | null>(null);
  const [editDistrictName, setEditDistrictName] = useState('');
  const [editDistrictIsActive, setEditDistrictIsActive] = useState(true);
  const [isUpdatingDistrict, setIsUpdatingDistrict] = useState(false);
  
  // Delete district state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingDistrict, setDeletingDistrict] = useState<DistrictOption | null>(null);
  const [isDeletingDistrict, setIsDeletingDistrict] = useState(false);
  
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  const navigate = useNavigate();

  const getSessionToken = (): string | null => sessionManager.getSessionToken();

  const loadStateId = async (state: string) => {
    console.log('[AdminLocationManagement] Loading state ID for:', state);
    try {
      const states = await statesService.getAllStates();
      const currentState = states.find(s => s.state_name === state);
      if (currentState) {
        console.log('[AdminLocationManagement] State ID found:', currentState.id);
        setCurrentStateId(currentState.id);
      } else {
        console.log('[AdminLocationManagement] State not found in database');
      }
    } catch (error) {
      console.error('[AdminLocationManagement] Error loading state ID:', error);
    }
  };

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  const loadDistricts = useCallback(async (state: string) => {
    try {
      setIsLoadingDistricts(true);
      const districtsData = await locationsService.getActiveDistrictsByStateName(state);
      setDistricts(districtsData);
    } catch (error) {
      console.error('Error loading districts:', error);
      showToast('error', 'Failed to load districts');
    } finally {
      setIsLoadingDistricts(false);
    }
  }, [showToast]);

  const loadCities = async (districtId: string) => {
    try {
      setIsLoadingCities(true);
      const citiesData = await locationsService.getActiveCitiesByDistrictId(districtId);
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading cities:', error);
      showToast('error', 'Failed to load cities');
    } finally {
      setIsLoadingCities(false);
    }
  };

  const handleDistrictSelect = async (district: DistrictOption) => {
    console.log('[AdminLocationManagement] District selected:', district.district_name);
    setSelectedDistrict(district);
    await loadCities(district.district_id);
  };

  useEffect(() => {
    if (stateName) {
      const decodedStateName = decodeURIComponent(stateName);
      void loadStateId(decodedStateName);
      void loadDistricts(decodedStateName);
    }
  }, [loadDistricts, stateName]);

  const handleAddDistrict = async () => {
    console.log('[AdminLocationManagement] Adding new district:', newDistrictName);
    if (!newDistrictName.trim() || !currentStateId) {
      console.log('[AdminLocationManagement] Validation failed - missing name or state ID');
      showToast('error', 'Please enter a district name');
      return;
    }

    if (newDistrictName.trim().length < 2) {
      console.log('[AdminLocationManagement] Validation failed - name too short');
      showToast('error', 'District name must be at least 2 characters long');
      return;
    }

    try {
      setIsAddingDistrict(true);
      const result = await locationsService.addDistrict(currentStateId, newDistrictName, newDistrictIsActive);

      if (result.success) {
        console.log('[AdminLocationManagement] District added successfully');
        showToast('success', 'District added successfully');
        setIsAddDistrictOpen(false);
        setNewDistrictName('');
        setNewDistrictIsActive(true);
        if (stateName) {
          await loadDistricts(decodeURIComponent(stateName));
        }
      } else {
        console.log('[AdminLocationManagement] Failed to add district:', result.error);
        showToast('error', result.error || 'Failed to add district');
      }
    } catch (error) {
      console.error('[AdminLocationManagement] Error adding district:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsAddingDistrict(false);
    }
  };

  const handleAddCity = async () => {
    console.log('[AdminLocationManagement] Adding new city:', newCityName, 'to district:', selectedDistrictId);
    if (!newCityName.trim() || !selectedDistrictId || !currentStateId) {
      console.log('[AdminLocationManagement] Validation failed - missing name or district ID');
      showToast('error', 'Please enter a city name');
      return;
    }

    if (newCityName.trim().length < 2) {
      console.log('[AdminLocationManagement] Validation failed - name too short');
      showToast('error', 'City name must be at least 2 characters long');
      return;
    }

    try {
      setIsAddingCity(true);
      const sessionToken = getSessionToken();
      if (!sessionToken) {
        console.error('[AdminLocationManagement] User session not found');
        showToast('error', 'User session not found. Please log in again.');
        return;
      }

      const result = await locationsService.addCity(
        sessionToken,
        currentStateId,
        selectedDistrictId,
        newCityName,
        newCityIsPopular,
        newCityIsActive
      );

      if (result.success) {
        console.log('[AdminLocationManagement] City added successfully');
        showToast('success', 'City added successfully');
        setIsAddCityOpen(false);
        setNewCityName('');
        setNewCityIsPopular(false);
        setNewCityIsActive(true);
        await loadCities(selectedDistrictId);
      } else {
        console.error('[AdminLocationManagement] Failed to add city:', result.error);
        showToast('error', result.error || 'Failed to add city');
      }
    } catch (error) {
      console.error('[AdminLocationManagement] Error adding city:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsAddingCity(false);
    }
  };

  const handleEditDistrict = (district: DistrictOption) => {
    setEditingDistrict(district);
    setEditDistrictName(district.district_name);
    setEditDistrictIsActive(true); // Assume active since we're only showing active districts
    setIsEditDistrictOpen(true);
  };

  const handleUpdateDistrict = async () => {
    console.log('[AdminLocationManagement] Updating district:', editingDistrict?.district_id);
    if (!editingDistrict || !editDistrictName.trim()) {
      console.log('[AdminLocationManagement] Validation failed - missing district or name');
      showToast('error', 'Please enter a district name');
      return;
    }

    if (editDistrictName.trim().length < 3) {
      console.log('[AdminLocationManagement] Validation failed - name too short');
      showToast('error', 'District name must be at least 3 characters long');
      return;
    }

    try {
      setIsUpdatingDistrict(true);
      const { success, error } = await locationsService.updateDistrict(
        editingDistrict.district_id,
        editDistrictName,
        editDistrictIsActive
      );

      if (success) {
        console.log('[AdminLocationManagement] District updated successfully');
        showToast('success', 'District updated successfully');
        setIsEditDistrictOpen(false);
        setEditingDistrict(null);
        setEditDistrictName('');
        if (stateName) {
          await loadDistricts(decodeURIComponent(stateName));
        }
      } else {
        console.log('[AdminLocationManagement] Failed to update district:', error);
        showToast('error', error || 'Failed to update district');
      }
    } catch (error) {
      console.error('[AdminLocationManagement] Error updating district:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsUpdatingDistrict(false);
    }
  };

  const handleDeleteDistrict = async (district: DistrictOption) => {
    console.log('[AdminLocationManagement] Delete requested for district:', district.district_name);
    try {
      const check = await locationsService.canDeleteDistrict(district.district_id);
      console.log('[AdminLocationManagement] Can delete check result:', check.canDelete);

      setDeletingDistrict(district);

      if (!check.canDelete) {
        console.log('[AdminLocationManagement] District cannot be hard deleted, offering disable option');
        // Show dialog offering disable instead of hard delete
        setDeleteConfirmOpen(true);
      } else {
        console.log('[AdminLocationManagement] District can be safely deleted');
        // Safe to hard delete - show confirmation
        if (confirm(`Delete "${district.district_name}" permanently?`)) {
          await performDeleteDistrict(district.district_id);
        } else {
          console.log('[AdminLocationManagement] Delete cancelled by user');
        }
      }
    } catch (error) {
      console.error('[AdminLocationManagement] Error checking district deletion:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  const performDeleteDistrict = async (districtId: string) => {
    console.log('[AdminLocationManagement] Performing hard delete for district:', districtId);
    try {
      setIsDeletingDistrict(true);

      const result = await locationsService.deleteDistrictHard(districtId);

      if (result.success) {
        console.log('[AdminLocationManagement] District deleted successfully');
        showToast('success', 'District deleted successfully');

        // Clear selected district if it was the deleted one
        if (selectedDistrict?.district_id === districtId) {
          console.log('[AdminLocationManagement] Clearing selected district as it was deleted');
          setSelectedDistrict(null);
          setCities([]);
        }

        // Refresh the districts list
        if (stateName) {
          await loadDistricts(decodeURIComponent(stateName));
        }
      } else {
        console.log('[AdminLocationManagement] Failed to delete district:', result.error);
        showToast('error', result.error || 'Failed to delete district');
      }
    } catch (error) {
      console.error('[AdminLocationManagement] Error deleting district:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsDeletingDistrict(false);
      setDeleteConfirmOpen(false);
      setDeletingDistrict(null);
    }
  };

  const handleDisableDistrict = async () => {
    if (!deletingDistrict) return;

    try {
      setIsDeletingDistrict(true);

      const result = await locationsService.toggleDistrictActive(deletingDistrict.district_id, false);

      if (result.success) {
        showToast('success', 'District disabled successfully');

        // Refresh the districts list
        if (stateName) {
          await loadDistricts(decodeURIComponent(stateName));
        }
      } else {
        showToast('error', result.error || 'Failed to disable district');
      }
    } catch (error) {
      console.error('Error disabling district:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsDeletingDistrict(false);
      setDeleteConfirmOpen(false);
      setDeletingDistrict(null);
    }
  };
  const filteredDistricts = districts.filter(district =>
    district.district_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const decodedStateName = stateName ? decodeURIComponent(stateName) : '';

  return (
    <PermissionGate
      permission="locations.districts.view"
      fallback={
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view location management.</p>
          </div>
        </div>
      }
    >
    <div className="min-h-screen bg-background">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-7xl mx-auto">
        {/* Back to State Management Button */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin/state-management')}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to State Management
          </button>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground flex items-center">
                <MapPin className="w-8 h-8 mr-3 text-primary" />
                Location Management
              </h1>
              <p className="text-muted-foreground mt-2">{decodedStateName}</p>
            </div>
            <div className="flex gap-3">
              {canManageDistricts && (
              <button
                className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                onClick={() => setIsAddDistrictOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add District
              </button>
            )}
              {selectedDistrict && canManageCities && (
                <button
                  className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  onClick={() => {
                    setSelectedDistrictId(selectedDistrict.district_id);
                    setIsAddCityOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add City
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Districts Panel */}
          <div className="bg-card rounded-lg shadow-sm border border-border">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-section font-semibold text-foreground flex items-center">
                  <Building2 className="w-5 h-5 mr-2 text-primary" />
                  Districts in {decodedStateName}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {districts.length} district{districts.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              {/* Search */}
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search districts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {isLoadingDistricts ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading districts...</p>
                </div>
              ) : filteredDistricts.length === 0 ? (
                <div className="p-6 text-center">
                  <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {searchTerm ? 'No districts found' : 'No districts yet'}
                  </h3>
                  <p className="text-muted-foreground">
                    {searchTerm 
                      ? 'Try adjusting your search criteria'
                      : 'Districts will appear here once added to the system'
                    }
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredDistricts.map((district) => (
                    <div
                      key={district.district_id}
                      className={`p-4 cursor-pointer transition-colors hover:bg-muted/30 ${
                        selectedDistrict?.district_id === district.district_id
                          ? 'bg-primary/5 border-r-4 border-primary'
                          : ''
                      }`}
                      onClick={() => handleDistrictSelect(district)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-foreground">{district.district_name}</h3>
                        </div>
                        {canManageDistricts && (
                          <DropdownMenu>
                            <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-7 w-7')}>
                              <span className="sr-only">Open actions menu</span>
                              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditDistrict(district)}>
                                <Edit3 className="w-4 h-4" />Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => handleDeleteDistrict(district)}>
                                <Trash2 className="w-4 h-4" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cities Panel */}
          <div className="bg-card rounded-lg shadow-sm border border-border">
            <div className="p-6 border-b border-border">
              <h2 className="text-section font-semibold text-foreground flex items-center">
                <Users className="w-5 h-5 mr-2 text-primary" />
                Cities in {selectedDistrict ? selectedDistrict.district_name : 'Select District'}
              </h2>
              {selectedDistrict && (
                <p className="text-sm text-muted-foreground mt-1">
                  {cities.length} cit{cities.length !== 1 ? 'ies' : 'y'}
                </p>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {!selectedDistrict ? (
                <div className="p-6 text-center">
                  <MapPin className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="text-sm font-medium text-foreground mb-2">Select a District</h3>
                  <p className="text-muted-foreground">Choose a district from the left panel to view its cities</p>
                </div>
              ) : isLoadingCities ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading cities...</p>
                </div>
              ) : cities.length === 0 ? (
                <div className="p-6 text-center">
                  <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="text-sm font-medium text-foreground mb-2">No cities yet</h3>
                  <p className="text-muted-foreground">Cities will appear here once added to this district</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {cities.map((city) => (
                    <div key={city.city_id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center">
                            <h3 className="font-medium text-foreground">{city.city_name}</h3>
                            {city.is_popular && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                Popular
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">ID: {city.city_id}</p>
                        </div>
                        {canManageCities && (
                        <div className="flex items-center space-x-2">
                          <button
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => showToast('success', 'City actions coming soon!')}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-8 bg-card rounded-lg shadow-sm border border-border p-6">
          <h3 className="text-section font-semibold text-foreground mb-4">Location Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-xl font-semibold text-primary">{districts.length}</div>
              <div className="text-sm text-muted-foreground">Total Districts</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-primary">{cities.length}</div>
              <div className="text-sm text-muted-foreground">Cities in Selected District</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold text-primary">
                {cities.filter(city => city.is_popular).length}
              </div>
              <div className="text-sm text-muted-foreground">Popular Cities</div>
            </div>
          </div>
        </div>
      </div>

      {/* Add District Modal */}
      {isAddDistrictOpen && canManageDistricts && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section font-semibold text-foreground">Add New District</h3>
              <button
                onClick={() => setIsAddDistrictOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  District Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newDistrictName}
                  onChange={(e) => setNewDistrictName(e.target.value)}
                  placeholder="Enter district name"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
                {newDistrictName.trim().length > 0 && newDistrictName.trim().length < 2 && (
                  <p className="text-destructive text-sm mt-1">District name must be at least 2 characters long</p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="newDistrictIsActive"
                  checked={newDistrictIsActive}
                  onChange={(e) => setNewDistrictIsActive(e.target.checked)}
                  className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring focus:ring-2"
                />
                <label htmlFor="newDistrictIsActive" className="ml-2 text-sm font-medium text-foreground">
                  Set as active district
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setIsAddDistrictOpen(false)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDistrict}
                disabled={isAddingDistrict || !newDistrictName.trim() || newDistrictName.trim().length < 2}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isAddingDistrict ? 'Adding...' : 'Add District'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add City Modal */}
      {isAddCityOpen && selectedDistrict && canManageCities && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section font-semibold text-foreground">Add New City</h3>
              <button
                onClick={() => setIsAddCityOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-primary/5 rounded-lg">
              <p className="text-sm text-foreground">
                <strong>District:</strong> {selectedDistrict.district_name}
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  City Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  placeholder="Enter city name"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
                {newCityName.trim().length > 0 && newCityName.trim().length < 2 && (
                  <p className="text-destructive text-sm mt-1">City name must be at least 2 characters long</p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="newCityIsPopular"
                  checked={newCityIsPopular}
                  onChange={(e) => setNewCityIsPopular(e.target.checked)}
                  className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring focus:ring-2"
                />
                <label htmlFor="newCityIsPopular" className="ml-2 text-sm font-medium text-foreground">
                  Mark as popular city
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="newCityIsActive"
                  checked={newCityIsActive}
                  onChange={(e) => setNewCityIsActive(e.target.checked)}
                  className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring focus:ring-2"
                />
                <label htmlFor="newCityIsActive" className="ml-2 text-sm font-medium text-foreground">
                  Set as active city
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setIsAddCityOpen(false)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCity}
                disabled={isAddingCity || !newCityName.trim() || newCityName.trim().length < 2}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isAddingCity ? 'Adding...' : 'Add City'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit District Modal */}
      {isEditDistrictOpen && editingDistrict && canManageDistricts && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section font-semibold text-foreground">Edit District</h3>
              <button
                onClick={() => setIsEditDistrictOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  District Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={editDistrictName}
                  onChange={(e) => setEditDistrictName(e.target.value)}
                  placeholder="Enter district name"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
                {editDistrictName.trim().length > 0 && editDistrictName.trim().length < 3 && (
                  <p className="text-destructive text-sm mt-1">District name must be at least 3 characters long</p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editDistrictIsActive"
                  checked={editDistrictIsActive}
                  onChange={(e) => setEditDistrictIsActive(e.target.checked)}
                  className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring focus:ring-2"
                />
                <label htmlFor="editDistrictIsActive" className="ml-2 text-sm font-medium text-foreground">
                  Set as active district
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setIsEditDistrictOpen(false)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateDistrict}
                disabled={isUpdatingDistrict || !editDistrictName.trim() || editDistrictName.trim().length < 3}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isUpdatingDistrict ? 'Updating...' : 'Update District'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete District Confirmation Dialog */}
      {deleteConfirmOpen && deletingDistrict && canManageDistricts && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <AlertCircle className="w-6 h-6 text-primary mr-3" />
              <h3 className="text-section font-semibold text-foreground">Cannot Delete District</h3>
            </div>
            
            <p className="text-muted-foreground mb-6">
              This district has cities mapped to it. You cannot delete it now.
              You can either disable it or first delete/move its cities.
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeletingDistrict(null);
                }}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDisableDistrict}
                disabled={isDeletingDistrict}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDeletingDistrict ? 'Disabling...' : 'Disable District'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PermissionGate>
  );
};

export default AdminLocationManagement;



