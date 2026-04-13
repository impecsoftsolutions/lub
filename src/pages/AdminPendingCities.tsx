import React, { useCallback, useEffect, useState } from 'react';
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
import { PageHeader } from '../components/ui/PageHeader';

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

  const getSessionToken = (): string | null => sessionManager.getSessionToken();

  const fetchData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

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
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view pending cities.</p>
          </div>
        </div>
      }
    >
      <div className="p-6">
      <div>
        <PageHeader
          title="Pending Cities Review"
          subtitle="Review and approve cities submitted through registration forms"
        />

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-2 text-muted-foreground">Loading pending cities...</p>
          </div>
        ) : pendingError ? (
          <div className="bg-card rounded-lg shadow-sm border border-border p-8 text-center">
            <AlertCircle className="w-10 h-10 text-primary mx-auto mb-3" />
            <p className="text-foreground">{pendingError}</p>
          </div>
        ) : pendingCities.length === 0 ? (
          <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
            <MapPin className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-sm font-medium text-foreground mb-2">No Pending Cities</h3>
            <p className="text-muted-foreground">
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
                  className="bg-card rounded-lg shadow-sm border border-border p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-section font-semibold text-foreground">
                          {city.other_city_name_display}
                        </h3>
                        <span className="px-2.5 py-0.5 bg-muted text-foreground text-xs font-medium rounded-full">
                          Pending Review
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm text-muted-foreground">
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
                        <div className="mb-4 p-3 bg-muted/50 border border-border rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
                            <p className="text-sm text-foreground">
                              District not resolved. Assignment is disabled for this item.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {canApprovePending && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                      <button
                        onClick={() => openAssociationsModal(city)}
                        className="flex items-center gap-2 px-4 py-2 rounded-md bg-card text-foreground border border-border hover:bg-muted/50"
                      >
                        View Associated Records
                      </button>
                      <button
                        onClick={() => openResolveModal(city)}
                        disabled={!canAssign || !city.pending_city_id}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                          canAssign && city.pending_city_id
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'bg-muted text-muted-foreground cursor-not-allowed'
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
          <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg shadow-sm max-w-4xl w-full">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-section font-semibold text-foreground">Associated Records</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pending city: "{selectedPending.other_city_name_display}"
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 max-h-[60vh] overflow-auto">
                {isLoadingAssociations ? (
                  <p className="text-muted-foreground">Loading associated records...</p>
                ) : associationsError ? (
                  <div className="p-3 bg-destructive/5 border border-destructive/30 rounded-lg text-destructive text-sm">
                    {associationsError}
                  </div>
                ) : associations.length === 0 ? (
                  <p className="text-muted-foreground">No linked registrations found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">Registration ID</th>
                          <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                          <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">Mobile</th>
                          <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                          <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-card divide-y divide-border">
                        {associations.map((record) => (
                          <tr key={record.registration_id}>
                            <td className="text-xs text-foreground">{record.registration_id}</td>
                            <td className="text-sm text-foreground">{record.email || 'N/A'}</td>
                            <td className="text-sm text-foreground">{record.mobile_number || 'N/A'}</td>
                            <td className="text-sm text-foreground">{record.company_name || 'N/A'}</td>
                            <td className="text-sm text-foreground">{record.status || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 bg-muted/50 border-t border-border flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={() => {
                    setShowAssociationsModal(false);
                    setAssociations([]);
                    setAssociationsError(null);
                  }}
                  className="px-4 py-2 text-foreground bg-card border border-border rounded-md hover:bg-muted/50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        {showAssignModal && selectedPending && canApprovePending && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg shadow-sm max-w-md w-full">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-section font-semibold text-foreground">Assign Approved City</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Edit and resolve "{selectedPending.other_city_name_display}" into an approved city:
                </p>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Final City Name *
                  </label>
                  <input
                    type="text"
                    value={finalCityName}
                    onChange={(e) => setFinalCityName(e.target.value)}
                    placeholder="Enter final city name"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    If this matches an existing approved city in the same district, it will be assigned. Otherwise a new approved city will be created.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Select Existing Approved City (Optional)
                  </label>
                  <select
                    value={selectedApprovedCityId}
                    onChange={(e) => handleApprovedCitySelection(e.target.value)}
                    disabled={isLoadingApprovedCities}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                  >
                    <option value="">{isLoadingApprovedCities ? 'Loading...' : 'Choose a city to autofill...'}</option>
                    {approvedCities.map((city) => (
                      <option key={city.city_id} value={city.city_id}>
                        {city.city_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p-3 bg-primary/5 rounded-lg">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">District:</span>{' '}
                    {selectedPending.district_name}
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 bg-muted/50 border-t border-border flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedPending(null);
                    setSelectedApprovedCityId('');
                    setFinalCityName('');
                  }}
                  className="px-4 py-2 text-foreground bg-card border border-border rounded-lg hover:bg-muted/50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssign}
                  disabled={!finalCityName.trim() || isResolving}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
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



