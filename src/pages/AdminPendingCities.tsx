import React, { useEffect, useState } from 'react';
import { GitMerge, AlertCircle, MapPin, Lock } from 'lucide-react';
import {
  adminCitiesService,
  locationsService,
  CityOption,
  PendingCityAssociationRecord,
  PendingCityListItem
} from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';

type PendingCustomCity = PendingCityListItem;

export default function AdminPendingCities() {
  const canApprovePending = useHasPermission('locations.cities.approve_pending');
  const [pendingCities, setPendingCities] = useState<PendingCustomCity[]>([]);
  const [approvedCities, setApprovedCities] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedPending, setSelectedPending] = useState<PendingCustomCity | null>(null);
  const [selectedApprovedCityId, setSelectedApprovedCityId] = useState('');
  const [finalCityName, setFinalCityName] = useState('');
  const [isLoadingApprovedCities, setIsLoadingApprovedCities] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [showAssociationsModal, setShowAssociationsModal] = useState(false);
  const [associations, setAssociations] = useState<PendingCityAssociationRecord[]>([]);
  const [isLoadingAssociations, setIsLoadingAssociations] = useState(false);
  const [associationsError, setAssociationsError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const getSessionToken = (): string | null => sessionManager.getSessionToken();

  async function fetchData() {
    setLoading(true);
    setPendingError(null);
    try {
      const sessionToken = getSessionToken();
      if (!sessionToken) {
        setPendingError('User session not found. Please log in again.');
        setPendingCities([]);
        return;
      }

      const result = await adminCitiesService.listPendingCustomCities(sessionToken);
      if (!result.success) {
        setPendingError(result.error || 'Failed to load pending cities');
        setPendingCities([]);
        return;
      }

      setPendingCities((result.items || []) as PendingCustomCity[]);
    } catch (error) {
      console.error('Error fetching data:', error);
      setPendingError('Failed to load pending cities');
    } finally {
      setLoading(false);
    }
  }

  async function loadApprovedCities(districtId: string) {
    try {
      setIsLoadingApprovedCities(true);
      const cities = await locationsService.getActiveCitiesByDistrictId(districtId);
      setApprovedCities(cities);
    } catch (error) {
      console.error('Error loading approved cities:', error);
      setApprovedCities([]);
    } finally {
      setIsLoadingApprovedCities(false);
    }
  }

  async function openAssociationsModal(city: PendingCustomCity) {
    const pendingCityId = city.pending_city_id;
    if (!pendingCityId) {
      alert('This pending city item cannot be resolved because it has no durable ID.');
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      alert('User session not found. Please log in again.');
      return;
    }

    setAssociations([]);
    setAssociationsError(null);
    setIsLoadingAssociations(true);
    setSelectedPending(city);
    setShowAssociationsModal(true);

    try {
      const result = await adminCitiesService.getPendingCityAssociations(sessionToken, pendingCityId);
      if (!result.success) {
        setAssociationsError(result.error || 'Failed to load associated records');
        return;
      }

      setAssociations(result.items || []);
    } catch (error) {
      console.error('Error loading pending city associations:', error);
      setAssociationsError('Failed to load associated records');
    } finally {
      setIsLoadingAssociations(false);
    }
  }

  function openResolveModal(city: PendingCustomCity) {
    setSelectedPending(city);
    setSelectedApprovedCityId('');
    setFinalCityName(city.other_city_name_display || '');
    setShowAssignModal(true);

    if (city.district_id) {
      loadApprovedCities(city.district_id);
    } else {
      setApprovedCities([]);
    }
  }

  async function handleAssign() {
    const pendingCityId = selectedPending?.pending_city_id;
    if (!selectedPending || !pendingCityId) {
      alert('Pending city identifier is missing.');
      return;
    }

    const trimmedFinalCityName = finalCityName.trim();
    if (!trimmedFinalCityName) {
      alert('Please enter the final city name');
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      alert('User session not found. Please log in again.');
      return;
    }

    setIsResolving(true);
    const result = await adminCitiesService.resolvePendingCity(sessionToken, pendingCityId, trimmedFinalCityName);
    setIsResolving(false);

    if (!result.success) {
      alert('Error resolving city: ' + (result.error || 'Unknown error'));
      return;
    }

    alert(
      `Pending city resolved successfully.\nAssigned city: ${result.assignedCityName || trimmedFinalCityName}\nUpdated records: ${result.updatedCount || 0}`
    );

    setShowAssignModal(false);
    setSelectedPending(null);
    setSelectedApprovedCityId('');
    setFinalCityName('');
    await fetchData();
  }

  function handleApprovedCitySelection(approvedCityId: string) {
    setSelectedApprovedCityId(approvedCityId);
    const selectedCity = approvedCities.find((item) => item.city_id === approvedCityId);
    if (selectedCity) {
      setFinalCityName(selectedCity.city_name);
    }
  }

  return (
    <PermissionGate
      permission="locations.cities.view"
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view pending cities.</p>
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Pending Cities Review</h1>
          <p className="mt-2 text-gray-600">
            Review and approve cities submitted through registration forms
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading pending cities...</p>
          </div>
        ) : pendingError ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <AlertCircle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
            <p className="text-gray-700">{pendingError}</p>
          </div>
        ) : pendingCities.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Cities</h3>
            <p className="text-gray-600">
              All submitted cities have been reviewed. New submissions will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingCities.map((city) => {
              const latestDate = city.latest_created_at
                ? new Date(city.latest_created_at).toLocaleDateString()
                : 'N/A';
              const canAssign = !!city.district_id;

              return (
                <div
                  key={city.key}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {city.other_city_name_display}
                        </h3>
                        <span className="px-2.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                          Pending Review
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">District:</span>{' '}
                          {city.district_name || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">State:</span>{' '}
                          {city.state_name || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Registrations:</span>{' '}
                          {city.associated_records_count ?? city.registrations_count}
                        </div>
                        <div>
                          <span className="font-medium">Latest:</span>{' '}
                          {latestDate}
                        </div>
                      </div>

                      {!city.district_id && (
                        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                            <p className="text-sm text-amber-900">
                              District not resolved. Assignment is disabled for this item.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {canApprovePending && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => openAssociationsModal(city)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                      >
                        View Associated Records
                      </button>
                      <button
                        onClick={() => openResolveModal(city)}
                        disabled={!canAssign || !city.pending_city_id}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                          canAssign && city.pending_city_id
                            ? 'bg-amber-600 text-white hover:bg-amber-700'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        <GitMerge className="w-4 h-4" />
                        Edit + Add/Assign
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {showAssociationsModal && selectedPending && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Associated Records</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Pending city: "{selectedPending.other_city_name_display}"
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 max-h-[60vh] overflow-auto">
                {isLoadingAssociations ? (
                  <p className="text-gray-600">Loading associated records...</p>
                ) : associationsError ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {associationsError}
                  </div>
                ) : associations.length === 0 ? (
                  <p className="text-gray-600">No linked registrations found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Registration ID</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {associations.map((record) => (
                          <tr key={record.registration_id}>
                            <td className="px-3 py-2 text-xs text-gray-700">{record.registration_id}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">{record.email || 'N/A'}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">{record.mobile_number || 'N/A'}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">{record.company_name || 'N/A'}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">{record.status || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={() => {
                    setShowAssociationsModal(false);
                    setAssociations([]);
                    setAssociationsError(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        {showAssignModal && selectedPending && canApprovePending && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Assign Approved City</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <p className="text-sm text-gray-600">
                  Edit and resolve "{selectedPending.other_city_name_display}" into an approved city:
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Final City Name *
                  </label>
                  <input
                    type="text"
                    value={finalCityName}
                    onChange={(e) => setFinalCityName(e.target.value)}
                    placeholder="Enter final city name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If this matches an existing approved city in the same district, it will be assigned. Otherwise a new approved city will be created.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Existing Approved City (Optional)
                  </label>
                  <select
                    value={selectedApprovedCityId}
                    onChange={(e) => handleApprovedCitySelection(e.target.value)}
                    disabled={isLoadingApprovedCities}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">{isLoadingApprovedCities ? 'Loading...' : 'Choose a city to autofill...'}</option>
                    {approvedCities.map((city) => (
                      <option key={city.city_id} value={city.city_id}>
                        {city.city_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">District:</span>{' '}
                    {selectedPending.district_name}
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedPending(null);
                    setSelectedApprovedCityId('');
                    setFinalCityName('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssign}
                  disabled={!finalCityName.trim() || isResolving}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResolving ? 'Resolving...' : 'Assign City'}
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
