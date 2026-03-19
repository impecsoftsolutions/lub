import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, locationsService, citiesService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { Search, Plus, CreditCard as Edit2, Trash2, Eye, MapPin, Building2, Check, X, ArrowLeft, Lock } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';

interface City {
  id: string;
  city_name: string;
  district_id: string;
  state_id: string;
  status: 'pending' | 'approved' | 'rejected';
  submission_source: string;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  merged_into_city_id: string | null;
  notes: string | null;
  created_at: string;
  district?: {
    district_name: string;
  };
  state?: {
    state_name: string;
  };
}

interface District {
  id: string;
  district_name: string;
}

interface State {
  id: string;
  state_name: string;
}

export default function AdminCityManagement() {
  const canViewCities = useHasPermission('locations.cities.view');
  const canManageCities = useHasPermission('locations.cities.manage');
  const navigate = useNavigate();
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('approved');
  const [districtFilter, setDistrictFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [newCity, setNewCity] = useState({
    city_name: '',
    district_id: '',
    state_id: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
    checkUserRole();
  }, [statusFilter, districtFilter]);

  const getSessionToken = (): string | null => sessionManager.getSessionToken();

  async function checkUserRole() {
    console.log('[AdminCityManagement] Checking user role and RLS policies...');
    try {
      const requestingUserId = sessionManager.getUserData()?.id;

      if (requestingUserId) {
        console.log('[AdminCityManagement] User authenticated:', requestingUserId);
        const { data: roles, error } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', requestingUserId);

        if (error) {
          console.error('[AdminCityManagement] Error fetching user roles:', error);
        } else if (!roles || roles.length === 0) {
          console.warn('[AdminCityManagement] WARNING: User has NO roles assigned in user_roles table!');
        } else {
          console.log('[AdminCityManagement] User roles:', roles.length, 'role(s) found');
        }
      } else {
        console.log('[AdminCityManagement] No user found');
      }
    } catch (error) {
      console.error('[AdminCityManagement] Error checking user role:', error);
    }
  }

  async function fetchData() {
    console.log('[AdminCityManagement] Loading data (districts, states, cities)...');
    setLoading(true);
    try {
      const [districtsRes, statesRes] = await Promise.all([
        supabase.from('districts_master').select('*').eq('is_active', true).order('district_name'),
        supabase.from('states_master').select('*').eq('is_active', true).order('state_name')
      ]);

      if (districtsRes.data) {
        console.log('[AdminCityManagement] Districts loaded:', districtsRes.data.length);
        setDistricts(districtsRes.data);
      }
      if (statesRes.data) {
        console.log('[AdminCityManagement] States loaded:', statesRes.data.length);
        setStates(statesRes.data);
      }

      await fetchCities();
    } catch (error) {
      console.error('[AdminCityManagement] Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCities() {
    console.log('[AdminCityManagement] Fetching cities with filters:', {
      statusFilter,
      districtFilter: districtFilter || 'all'
    });
    let query = supabase
      .from('cities_master')
      .select(`
        *,
        district:districts_master(district_name),
        state:states_master(state_name)
      `)
      .order('city_name');

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (districtFilter) {
      query = query.eq('district_id', districtFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[AdminCityManagement] Error fetching cities:', error);
      return;
    }

    console.log('[AdminCityManagement] Cities loaded:', data?.length || 0, 'cities');
    setCities(data || []);
  }

  async function handleAddCity() {
    console.log('[AdminCityManagement] Adding new city:', newCity.city_name);
    if (!newCity.city_name || !newCity.district_id || !newCity.state_id) {
      console.log('[AdminCityManagement] Validation failed - missing required fields');
      alert('Please fill in all required fields');
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      console.error('[AdminCityManagement] User session not found');
      alert('User session not found. Please log in again.');
      return;
    }

    const result = await locationsService.addCity(
      sessionToken,
      newCity.state_id,
      newCity.district_id,
      newCity.city_name.trim(),
      false,
      false,
      newCity.notes || null
    );

    if (!result.success) {
      const errorMessage = result.error || 'Unknown error';
      console.error('[AdminCityManagement] Error adding city:', errorMessage);
      alert('Error adding city: ' + errorMessage);
      return;
    }

    console.log('[AdminCityManagement] City added successfully');
    setShowAddModal(false);
    setNewCity({ city_name: '', district_id: '', state_id: '', notes: '' });
    fetchData();
  }

  async function handleUpdateCity() {
    if (!editingCity) return;

    console.log('[AdminCityManagement] Updating city:', editingCity.id, editingCity.city_name);
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      console.error('[AdminCityManagement] User session not found');
      alert('User session not found. Please log in again.');
      return;
    }

    const result = await citiesService.adminUpdateCity({
      cityId: editingCity.id,
      cityName: editingCity.city_name.trim(),
      stateId: editingCity.state_id,
      districtId: editingCity.district_id,
      notes: editingCity.notes ?? null,
      sessionToken
    });

    if (!result.success) {
      console.error('[AdminCityManagement] Error updating city:', result.error);
      alert('Error updating city: ' + (result.error || 'Unknown error'));
      return;
    }

    console.log('[AdminCityManagement] City updated successfully');
    alert('City updated successfully!');

    setShowEditModal(false);
    setEditingCity(null);
    await fetchData();
  }

  async function handleDeleteCity(cityId: string) {
    console.log('[AdminCityManagement] Delete requested for city:', cityId);
    if (!confirm('Are you sure you want to delete this city?')) {
      console.log('[AdminCityManagement] Delete cancelled by user');
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      console.error('[AdminCityManagement] User session not found');
      alert('User session not found. Please log in again.');
      return;
    }

    const result = await citiesService.adminDeleteCity(cityId, sessionToken);

    if (!result.success) {
      console.error('[AdminCityManagement] Error deleting city:', result.error);
      alert('Error deleting city: ' + (result.error || 'Unknown error'));
      return;
    }

    console.log('[AdminCityManagement] City deleted successfully');
    alert('City deleted successfully');
    fetchData();
  }

  const filteredCities = cities.filter(city =>
    city.city_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <PermissionGate
      permission="locations.cities.view"
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view city management.</p>
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">City Management</h1>
            <p className="mt-2 text-gray-600">Manage approved cities in the system</p>
          </div>
          {canManageCities && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-5 h-5" />
              Add City
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Cities
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by city name..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                District
              </label>
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Districts</option>
                {districts.map(district => (
                  <option key={district.id} value={district.id}>
                    {district.district_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading cities...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      City Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      District
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      State
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCities.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No cities found
                      </td>
                    </tr>
                  ) : (
                    filteredCities.map((city) => (
                      <tr key={city.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                            <span className="text-sm font-medium text-gray-900">
                              {city.city_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {city.district?.district_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {city.state?.state_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            city.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : city.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {city.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {city.submission_source.replace('_', ' ')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {canManageCities && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingCity(city);
                                    setShowEditModal(true);
                                  }}
                                  className="text-blue-600 hover:text-blue-900"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCity(city.id)}
                                  className="text-red-600 hover:text-red-900"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Showing {filteredCities.length} of {cities.length} cities
              </p>
            </div>
          </div>
        )}

        {showAddModal && canManageCities && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Add New City</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City Name *
                  </label>
                  <input
                    type="text"
                    value={newCity.city_name}
                    onChange={(e) => setNewCity({ ...newCity, city_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter city name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State *
                  </label>
                  <select
                    value={newCity.state_id}
                    onChange={(e) => setNewCity({ ...newCity, state_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select State</option>
                    {states.map(state => (
                      <option key={state.id} value={state.id}>
                        {state.state_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    District *
                  </label>
                  <select
                    value={newCity.district_id}
                    onChange={(e) => setNewCity({ ...newCity, district_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select District</option>
                    {districts.map(district => (
                      <option key={district.id} value={district.id}>
                        {district.district_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={newCity.notes}
                    onChange={(e) => setNewCity({ ...newCity, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Optional notes"
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewCity({ city_name: '', district_id: '', state_id: '', notes: '' });
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCity}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add City
                </button>
              </div>
            </div>
          </div>
        )}

        {showEditModal && editingCity && canManageCities && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Edit City</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City Name *
                  </label>
                  <input
                    type="text"
                    value={editingCity.city_name}
                    onChange={(e) => setEditingCity({ ...editingCity, city_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State *
                  </label>
                  <select
                    value={editingCity.state_id}
                    onChange={(e) => setEditingCity({ ...editingCity, state_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {states.map(state => (
                      <option key={state.id} value={state.id}>
                        {state.state_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    District *
                  </label>
                  <select
                    value={editingCity.district_id}
                    onChange={(e) => setEditingCity({ ...editingCity, district_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {districts.map(district => (
                      <option key={district.id} value={district.id}>
                        {district.district_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={editingCity.notes || ''}
                    onChange={(e) => setEditingCity({ ...editingCity, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingCity(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateCity}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Update City
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </PermissionGate>
  );
}
