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
    queryFn: async () => {
      const managers = await api.managers.list();
      return [...(managers || [])].sort((a: any, b: any) => {
        const af = (a.first_name || '').toLowerCase();
        const bf = (b.first_name || '').toLowerCase();
        if (af !== bf) return af < bf ? -1 : 1;
        const al = (a.last_name || '').toLowerCase();
        const bl = (b.last_name || '').toLowerCase();
        return al < bl ? -1 : al > bl ? 1 : 0;
      });
    },
  });
}
