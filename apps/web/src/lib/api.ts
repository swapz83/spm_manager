const BASE = '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  projects: {
    list: (state?: string) => request<any[]>(`/projects${state ? `?state=${state}` : ''}`),
    create: (data: any) => request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  },
  people: {
    list: () => request<any[]>('/people'),
    get: (id: string) => request<any>(`/people/${id}`),
  },
  assignments: {
    list: (params?: { project?: string; resource?: string }) => {
      const qs = new URLSearchParams(params as any).toString();
      return request<any[]>(`/assignments${qs ? `?${qs}` : ''}`);
    },
    create: (data: any) => request<any>('/assignments', { method: 'POST', body: JSON.stringify(data) }),
    bulkCreate: (data: any) => request<any>('/assignments/bulk', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/assignments/${id}`, { method: 'DELETE' }),
  },
};
