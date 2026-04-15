'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function usePeople(managerId?: string, startDate?: string, endDate?: string, includeSubOrgs?: boolean) {
  return useQuery({
    queryKey: ['people', managerId, startDate, endDate, includeSubOrgs],
    queryFn: () => api.people.list({
      manager: managerId,
      start_date: startDate,
      end_date: endDate,
      include_sub_orgs: includeSubOrgs,
    }),
  });
}

export function useManagers() {
  return useQuery({
    queryKey: ['managers'],
    queryFn: () => api.managers.list(),
  });
}
