'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useProjects(managerId?: string, startDate?: string, endDate?: string, includeSubOrgs?: boolean) {
  return useQuery({
    queryKey: ['projects', managerId, startDate, endDate, includeSubOrgs],
    queryFn: () => api.projects.list({
      manager: managerId,
      start_date: startDate,
      end_date: endDate,
      include_sub_orgs: includeSubOrgs,
    }),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { short_description: string; description?: string; state?: string; start_date?: string; end_date?: string; color?: string }) =>
      api.projects.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['people'] });
    },
  });
}
