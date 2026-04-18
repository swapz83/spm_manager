'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cloud, Database, CheckCircle2, XCircle, Loader2, RefreshCw, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface FieldState {
  instance: string;
  userEmail: string;
  userToken: string;
  cookie: string;
}

export function ConfigView() {
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['config', 'servicenow'],
    queryFn: () => api.config.get(),
    refetchInterval: false,
  });

  const [fields, setFields] = useState<FieldState>({
    instance: '',
    userEmail: '',
    userToken: '',
    cookie: '',
  });

  // Pre-fill instance and email from server when loaded
  useEffect(() => {
    if (status) {
      setFields(prev => ({
        ...prev,
        instance:  status.instance  ?? prev.instance,
        userEmail: status.userEmail ?? prev.userEmail,
      }));
    }
  }, [status]);

  const [showToken,  setShowToken]  = useState(false);
  const [showCookie, setShowCookie] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'warn' } | null>(null);

  const mutation = useMutation({
    mutationFn: (data: Partial<FieldState>) => api.config.update(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['config', 'servicenow'] });
      queryClient.invalidateQueries({ queryKey: ['health'] });
      // Clear sensitive fields after save
      setFields(prev => ({ ...prev, userToken: '', cookie: '' }));
      const type = result.connected ? 'success' : result.configured ? 'warn' : 'error';
      setMessage({ text: result.message, type });
    },
    onError: (err: Error) => {
      setMessage({ text: err.message, type: 'error' });
    },
  });

  const handleSave = () => {
    setMessage(null);
    const payload: Partial<FieldState> = {};
    if (fields.instance.trim())   payload.instance   = fields.instance.trim();
    if (fields.userEmail.trim())  payload.userEmail  = fields.userEmail.trim();
    if (fields.userToken.trim())  payload.userToken  = fields.userToken.trim();
    if (fields.cookie.trim())     payload.cookie     = fields.cookie.trim();
    mutation.mutate(payload);
  };

  const isConnected  = status?.connected  ?? false;
  const isConfigured = status?.configured ?? false;
  const isSaving     = mutation.isPending;

  const canSave = !isSaving && Boolean(
    fields.instance.trim() || fields.userEmail.trim() ||
    fields.userToken.trim() || fields.cookie.trim()
  );

  return (
    <div className="max-w-[1600px] mx-auto px-8 py-10">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-gray-900 mb-1">ServiceNow Configuration</h1>
        <p className="text-[13px] text-gray-500">
          Configure live credentials to sync SPM data from your ServiceNow instance.
          Credentials are kept in-memory only and are never written to disk.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Status card ── */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] border border-gray-100 p-5">
            <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-4">
              Connection Status
            </div>

            {statusLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-[13px]">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking…
              </div>
            ) : (
              <div className="space-y-4">
                {/* Connected badge */}
                <div className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border',
                  isConnected
                    ? 'bg-emerald-50 border-emerald-200'
                    : isConfigured
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-gray-50 border-gray-200'
                )}>
                  {isConnected
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    : isConfigured
                      ? <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      : <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  }
                  <div>
                    <div className={cn('text-[13px] font-semibold',
                      isConnected ? 'text-emerald-700' : isConfigured ? 'text-amber-700' : 'text-gray-500'
                    )}>
                      {isConnected ? 'Connected' : isConfigured ? 'Connection failed' : 'Not configured'}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {isConnected
                        ? 'Live ServiceNow data'
                        : isConfigured
                          ? 'Check token / cookie'
                          : 'Enter credentials to connect'}
                    </div>
                  </div>
                </div>

                {/* Data source */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-gray-500">Data source</span>
                    <span className={cn('font-semibold flex items-center gap-1',
                      isConnected ? 'text-emerald-600' : 'text-gray-500'
                    )}>
                      {isConnected
                        ? <><Cloud className="w-3.5 h-3.5" /> ServiceNow</>
                        : <><Database className="w-3.5 h-3.5" /> Mock data</>
                      }
                    </span>
                  </div>

                  {status?.instance && (
                    <div className="flex items-start justify-between text-[12px] gap-2">
                      <span className="text-gray-500 flex-shrink-0">Instance</span>
                      <span className="font-medium text-gray-700 text-right truncate">{status.instance}</span>
                    </div>
                  )}

                  {status?.userEmail && (
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-gray-500">User email</span>
                      <span className="font-medium text-gray-700 truncate">{status.userEmail}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-gray-500">User token</span>
                    <span className={cn('font-semibold', status?.hasUserToken ? 'text-emerald-600' : 'text-gray-400')}>
                      {status?.hasUserToken ? '● set' : '○ not set'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-gray-500">Cookie</span>
                    <span className={cn('font-semibold', status?.hasCookie ? 'text-emerald-600' : 'text-gray-400')}>
                      {status?.hasCookie ? '● set' : '○ not set'}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
                  Credentials are stored in-memory only and reset on server restart.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Credentials form ── */}
        <div className="col-span-1 lg:col-span-2">
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(17,24,39,0.06),0_2px_8px_rgba(17,24,39,0.04)] border border-gray-100 p-5">
            <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-5">
              Update Credentials
            </div>

            <div className="space-y-4">
              {/* Instance URL */}
              <div>
                <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-1.5">
                  Instance URL
                </label>
                <input
                  type="url"
                  placeholder={status?.instance ?? 'https://mycompany.service-now.com'}
                  value={fields.instance}
                  onChange={e => setFields(f => ({ ...f, instance: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#1A56DB]"
                />
              </div>

              {/* User email */}
              <div>
                <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-1.5">
                  Your ServiceNow Email
                </label>
                <input
                  type="email"
                  placeholder={status?.userEmail ?? 'you@company.com'}
                  value={fields.userEmail}
                  onChange={e => setFields(f => ({ ...f, userEmail: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#1A56DB]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Used to locate your org in ServiceNow — must match your sys_user email.
                </p>
              </div>

              {/* X-UserToken */}
              <div>
                <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-1.5">
                  X-UserToken {status?.hasUserToken && <span className="text-emerald-500 normal-case font-normal">(currently set)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    placeholder="Paste X-UserToken value…"
                    value={fields.userToken}
                    onChange={e => setFields(f => ({ ...f, userToken: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 pr-10 text-[13px] text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#1A56DB] font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Copy from browser DevTools → Network tab → any SN request → Request Headers → X-UserToken.
                </p>
              </div>

              {/* Cookie */}
              <div>
                <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-1.5">
                  Cookie {status?.hasCookie && <span className="text-emerald-500 normal-case font-normal">(currently set)</span>}
                </label>
                <div className="relative">
                  <textarea
                    rows={3}
                    placeholder="Paste raw Cookie header value…"
                    value={fields.cookie}
                    onChange={e => setFields(f => ({ ...f, cookie: e.target.value }))}
                    className={cn(
                      'w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 pr-10 text-[13px] text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#1A56DB] font-mono resize-none',
                      !showCookie && fields.cookie && 'text-security-disc',
                    )}
                    style={!showCookie && fields.cookie ? { WebkitTextSecurity: 'disc' } as React.CSSProperties : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCookie(v => !v)}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showCookie ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Copy from DevTools → Network → any SN request → Request Headers → Cookie. Expires in ~1 hour.
                </p>
              </div>

              {/* Message banner */}
              {message && (
                <div className={cn(
                  'flex items-start gap-2.5 px-3.5 py-3 rounded-lg border text-[12px]',
                  message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                  message.type === 'warn'    ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                              'bg-red-50 border-red-200 text-red-700'
                )}>
                  {message.type === 'success'
                    ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    : message.type === 'warn'
                      ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  }
                  {message.text}
                </div>
              )}

              {/* Save button */}
              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-gray-400">
                  Leave a field blank to keep the existing value.
                </p>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className={cn(
                    'flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold transition-colors',
                    canSave
                      ? 'bg-[#1A56DB] text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  )}
                >
                  {isSaving
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</>
                    : <><RefreshCw className="w-3.5 h-3.5" /> Save &amp; Reconnect</>
                  }
                </button>
              </div>
            </div>
          </div>

          {/* ── How-to hint ── */}
          <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-blue-400 mb-2">
              How to get your credentials
            </div>
            <ol className="space-y-1.5 text-[12px] text-blue-700">
              <li><span className="font-semibold">1.</span> Open your ServiceNow instance in Chrome and log in.</li>
              <li><span className="font-semibold">2.</span> Open DevTools (F12) → Network tab. Reload the page.</li>
              <li><span className="font-semibold">3.</span> Click any request to your SN domain → Headers → Request Headers.</li>
              <li><span className="font-semibold">4.</span> Copy the <code className="bg-blue-100 px-1 rounded">X-UserToken</code> value and paste it above.</li>
              <li><span className="font-semibold">5.</span> Copy the full <code className="bg-blue-100 px-1 rounded">Cookie</code> header value and paste it above.</li>
              <li><span className="font-semibold">6.</span> Click <strong>Save &amp; Reconnect</strong> — a live sync will start immediately.</li>
            </ol>
          </div>
        </div>

      </div>
    </div>
  );
}
