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

interface ListParams {
  state?: string;
  manager?: string;
  start_date?: string;
  end_date?: string;
  include_sub_orgs?: boolean;
}

function buildQS(params?: ListParams): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  if (params.state) qs.set('state', params.state);
  if (params.manager) qs.set('manager', params.manager);
  if (params.start_date) qs.set('start_date', params.start_date);
  if (params.end_date) qs.set('end_date', params.end_date);
  if (params.include_sub_orgs) qs.set('include_sub_orgs', '1');
  const q = qs.toString();
  return q ? `?${q}` : '';
}

export const api = {
  health: () => request<{ status: string; dataSource: 'servicenow' | 'mock' }>('/health'),
  projects: {
    list: (params?: ListParams) => request<any[]>(`/projects${buildQS(params)}`),
    search: (q: string) => request<any[]>(`/projects/search?q=${encodeURIComponent(q)}`),
    import: (sys_id: string) => request<any>('/projects/import', { method: 'POST', body: JSON.stringify({ sys_id }) }),
    create: (data: any) => request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  },
  people: {
    list: (params?: ListParams) => request<any[]>(`/people${buildQS(params)}`),
    get: (id: string, params?: ListParams) => request<any>(`/people/${id}${buildQS(params)}`),
  },
  managers: {
    list: () => request<any[]>('/managers'),
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
  dashboard: {
    summary: (params?: ListParams) => request<any>(`/dashboard/summary${buildQS(params)}`),
  },
  publish: {
    preview: (data: any) => request<any>('/publish/preview', { method: 'POST', body: JSON.stringify(data) }),
    execute: (data: any) => request<any>('/publish', { method: 'POST', body: JSON.stringify(data) }),
  },
};
