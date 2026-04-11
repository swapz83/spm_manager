'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: () => api.people.list(),
  });
}
