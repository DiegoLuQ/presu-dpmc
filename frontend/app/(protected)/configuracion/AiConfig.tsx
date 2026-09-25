'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Sparkles, Check, Trash2, Eye, EyeOff, Loader2, Star, ChevronDown, Zap, XCircle, CheckCircle2, Building2 } from 'lucide-react';
import api from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';

const PROVIDER_META: Record<string, { label: string; color: string; docsUrl: string }> = {
    groq:       { label: 'Groq',       color: '#f55036', docsUrl: 'https://console.groq.com/keys' },
    nvidia:     { label: 'Nvidia NIM', color: '#76b900', docsUrl: 'https://build.nvidia.com/' },
    deepseek:   { label: 'DeepSeek',   color: '#4d6bfe', docsUrl: 'https://platform.deepseek.com/api_keys' },
    openrouter: { label: 'OpenRouter', color: '#6d28d9', docsUrl: 'https://openrouter.ai/keys' },
    gemini:     { label: 'Gemini',     color: '#1a73e8', docsUrl: 'https://aistudio.google.com/apikey' },
};

const PROVIDERS = Object.keys(PROVIDER_META);

interface ProviderData {
    proveedor: string;
    api_key_masked: string;
    modelo: string;
    es_default: boolean;
    activo: boolean;
}

interface ModeloInfo { id: string; label: string; }

export default function AiConfig() {
    const { user, colegios, colegioActivo } = useAuth();
    const nombreColegioActivo =
        colegios.find(c => c.id_colegio === colegioActivo)?.nombre
        ?? (user as any)?.colegio?.nombre
        ?? 'tu colegio';

    const [configs, setConfigs] = useState<Record<string, ProviderData>>({});
    const [modelos, setModelos] = useState<Record<string, ModeloInfo[]>>({});
    const [forms, setForms] = useState<Record<string, { api_key: string; modelo: string; es_default: boolean; showKey: boolean }>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [deleting, setDeleting] = useState<Record<string, boolean>>({});
    const [saved, setSaved] = useState<Record<string, boolean>>({});
    const [modelOpenProv, setModelOpenProv] = useState<string | null>(null);
    const modelRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [testing, setTesting] = useState<Record<string, boolean>>({});
    const [testResult, setTestResult] = useState<Record<string, { ok: boolean; latencia_ms?: number; respuesta?: string; error?: string } | null>>({});

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (modelOpenProv) {
                const ref = modelRefs.current[modelOpenProv];
                if (ref && !ref.contains(e.target as Node)) setModelOpenProv(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [modelOpenProv]);

    const load = async () => {
        const [provRes, modRes] = await Promise.all([
            api.get('/ai/proveedores').catch(() => ({ data: [] })),
            api.get('/ai/modelos').catch(() => ({ data: {} })),
        ]);
        const map: Record<string, ProviderData> = {};
        for (const p of provRes.data) map[p.proveedor] = p;
        setConfigs(map);
        setModelos(modRes.data);

        const initialForms: typeof forms = {};
        for (const prov of PROVIDERS) {
            const existing = map[prov];
            const availableModels: ModeloInfo[] = modRes.data[prov] ?? [];
            initialForms[prov] = {
                api_key: existing ? existing.api_key_masked : '',
                modelo: existing?.modelo ?? availableModels[0]?.id ?? '',
                es_default: existing?.es_default ?? false,
                showKey: false,
            };
        }
        setForms(initialForms);
    };

    useEffect(() => { load(); }, []);

    const handleSave = async (prov: string) => {
        const f = forms[prov];
        if (!f.api_key.trim()) return;
        setSaving(s => ({ ...s, [prov]: true }));
        try {
            await api.put(`/ai/proveedores/${prov}`, {
                proveedor: prov,
                api_key: f.api_key,
                modelo: f.modelo,
                es_default: f.es_default,
            });
            setSaved(s => ({ ...s, [prov]: true }));
            setTimeout(() => setSaved(s => ({ ...s, [prov]: false })), 2000);
            await load();
        } catch (e: any) {
            alert(e.response?.data?.detail ?? 'Error al guardar');
        } finally {
            setSaving(s => ({ ...s, [prov]: false }));
        }
    };

    const handleDelete = async (prov: string) => {
        if (!confirm(`¿Eliminar la configuración de ${PROVIDER_META[prov].label}?`)) return;
        setDeleting(d => ({ ...d, [prov]: true }));
        try {
            await api.delete(`/ai/proveedores/${prov}`);
            await load();
        } finally {
            setDeleting(d => ({ ...d, [prov]: false }));
        }
    };

    const setDefault = async (prov: string) => {
        const f = forms[prov];
        const existing = configs[prov];
        if (!existing) return;
        setSaving(s => ({ ...s, [prov]: true }));
        try {
            await api.put(`/ai/proveedores/${prov}`, {
                proveedor: prov,
                api_key: f.api_key,
                modelo: f.modelo,
                es_default: true,
            });
            await load();
        } finally {
            setSaving(s => ({ ...s, [prov]: false }));
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div>
                <h3 className="text-lg font-bold text-gray-900">Proveedores de Inteligencia Artificial</h3>
                <p className="text-sm text-gray-500 mt-1">
                    Configura las API keys de cada proveedor. Las claves se almacenan cifradas.
                    El proveedor marcado como <span className="font-semibold text-amber-600">predeterminado</span> será
                    el que usen todos los usuarios de este colegio en las asesorías con IA.
                </p>
            </div>

            {/* Las keys se guardan en el colegio activo, no globalmente: hacerlo
                explícito evita configurar un colegio creyendo configurar los dos. */}
            <div className="flex items-start gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <Building2 size={15} className="text-slate-400 shrink-0 mt-0.5" />
                <div className="text-[12px] text-slate-600 leading-relaxed">
                    Estás configurando las keys de{' '}
                    <span className="font-bold text-slate-900">{nombreColegioActivo}</span>.
                    {colegios.length > 1 && (
                        <> Para registrar keys propias de otro colegio, cámbialo en <span className="font-semibold">Colegio activo</span> (barra lateral) y vuelve a esta pantalla.</>
                    )}
                    <div className="mt-1 text-slate-500">
                        Un colegio sin keys propias usa automáticamente las del colegio que sí las tenga configuradas; su consumo de tokens se registra por separado.
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5">
                {PROVIDERS.map(prov => {
                    const meta = PROVIDER_META[prov];
                    const existing = configs[prov];
                    const form = forms[prov] ?? { api_key: '', modelo: '', es_default: false, showKey: false };
                    const modList: ModeloInfo[] = modelos[prov] ?? [];
                    const isConfigured = !!existing;
                    const isDefault = existing?.es_default;

                    return (
                        <div key={prov} className={`bg-white border rounded-2xl p-6 shadow-sm transition-all ${isDefault ? 'border-amber-300 shadow-amber-50' : 'border-gray-100'}`}>
                            <div className="flex items-start justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm"
                                        style={{ backgroundColor: meta.color }}>
                                        <Sparkles size={18} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-gray-900 text-base">{meta.label}</h4>
                                            {isDefault && (
                                                <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-bold text-amber-700">
                                                    <Star size={9} fill="currentColor" /> Predeterminado
                                                </span>
                                            )}
                                            {isConfigured && !isDefault && (
                                                <span className="px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-[10px] font-bold text-green-700">Configurado</span>
                                            )}
                                        </div>
                                        <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer"
                                            className="text-xs text-primary hover:underline">
                                            Obtener API key →
                                        </a>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {isConfigured && !isDefault && (
                                        <button onClick={() => setDefault(prov)} title="Establecer como predeterminado"
                                            className="p-2 rounded-xl border border-amber-200 text-amber-600 hover:bg-amber-50 transition-colors">
                                            <Star size={15} />
                                        </button>
                                    )}
                                    {isConfigured && (
                                        <button onClick={() => handleDelete(prov)}
                                            disabled={deleting[prov]}
                                            className="p-2 rounded-xl border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                            {deleting[prov] ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* API Key */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">API Key</label>
                                    <div className="relative">
                                        <input
                                            type={form.showKey ? 'text' : 'password'}
                                            value={form.api_key}
                                            onChange={e => setForms(f => ({ ...f, [prov]: { ...f[prov], api_key: e.target.value } }))}
                                            placeholder="sk-••••••••••••••••"
                                            className="w-full pl-3 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                        />
                                        <button type="button"
                                            onClick={() => setForms(f => ({ ...f, [prov]: { ...f[prov], showKey: !f[prov].showKey } }))}
                                            className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                                            {form.showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Modelo — combobox libre */}
                                <div className="space-y-1.5"
                                    ref={el => { modelRefs.current[prov] = el; }}>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                        Modelo
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={form.modelo}
                                            onChange={e => {
                                                setForms(f => ({ ...f, [prov]: { ...f[prov], modelo: e.target.value } }));
                                                setModelOpenProv(prov);
                                            }}
                                            onFocus={() => setModelOpenProv(prov)}
                                            placeholder="Escribe o selecciona un modelo..."
                                            className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                        />
                                        <button type="button"
                                            onClick={() => setModelOpenProv(modelOpenProv === prov ? null : prov)}
                                            className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                                            <ChevronDown size={14} className={`transition-transform ${modelOpenProv === prov ? 'rotate-180' : ''}`} />
                                        </button>

                                        {modelOpenProv === prov && (
                                            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                                                {modList.length > 0 && (
                                                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                                                        Modelos sugeridos
                                                    </div>
                                                )}
                                                <div className="max-h-52 overflow-y-auto">
                                                    {modList
                                                        .filter(m =>
                                                            !form.modelo ||
                                                            m.id.toLowerCase().includes(form.modelo.toLowerCase()) ||
                                                            m.label.toLowerCase().includes(form.modelo.toLowerCase())
                                                        )
                                                        .map(m => {
                                                            const isSelected = form.modelo === m.id;
                                                            return (
                                                                <button key={m.id} type="button"
                                                                    onMouseDown={e => e.preventDefault()}
                                                                    onClick={() => {
                                                                        setForms(f => ({ ...f, [prov]: { ...f[prov], modelo: m.id } }));
                                                                        setModelOpenProv(null);
                                                                    }}
                                                                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                                                                >
                                                                    <div className="flex flex-col flex-1 min-w-0">
                                                                        <span className={`text-xs font-mono truncate ${isSelected ? 'text-primary font-bold' : 'text-gray-700 font-semibold'}`}>
                                                                            {m.id}
                                                                        </span>
                                                                        <span className="text-[10px] text-gray-400">{m.label}</span>
                                                                    </div>
                                                                    {isSelected && <Check size={13} className="text-primary shrink-0 mt-0.5" />}
                                                                </button>
                                                            );
                                                        })
                                                    }
                                                    {modList.length > 0 && (
                                                        <div className="px-3 py-2 border-t border-gray-50 bg-gray-50/50">
                                                            <p className="text-[10px] text-gray-400 font-medium">
                                                                También puedes escribir directamente el ID de cualquier modelo compatible.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Resultado del test */}
                            {testResult[prov] && (
                                <div className={`mt-4 px-4 py-3 rounded-xl border text-xs flex flex-col gap-1.5 ${testResult[prov]!.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                    <div className="flex items-center gap-2">
                                        {testResult[prov]!.ok
                                            ? <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                                            : <XCircle size={14} className="text-red-500 shrink-0" />}
                                        <span className={`font-bold ${testResult[prov]!.ok ? 'text-green-800' : 'text-red-700'}`}>
                                            {testResult[prov]!.ok
                                                ? `Conexión exitosa · ${testResult[prov]!.latencia_ms} ms`
                                                : 'Conexión fallida'}
                                        </span>
                                    </div>
                                    {testResult[prov]!.ok && testResult[prov]!.respuesta && (
                                        <p className="text-green-700 font-mono bg-green-100/60 px-2 py-1 rounded-lg">
                                            Respuesta del modelo: "{testResult[prov]!.respuesta}"
                                        </p>
                                    )}
                                    {!testResult[prov]!.ok && testResult[prov]!.error && (
                                        <p className="text-red-600 break-all">{testResult[prov]!.error}</p>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="checkbox"
                                        checked={form.es_default}
                                        onChange={e => setForms(f => ({ ...f, [prov]: { ...f[prov], es_default: e.target.checked } }))}
                                        className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20"
                                    />
                                    <span className="text-xs font-semibold text-gray-600">Establecer como predeterminado</span>
                                </label>

                                <div className="flex items-center gap-2">
                                    {/* Botón probar conexión */}
                                    <button
                                        type="button"
                                        disabled={testing[prov] || !(form.api_key ?? '').trim() || !(form.modelo ?? '').trim()}
                                        onClick={async () => {
                                            setTesting(t => ({ ...t, [prov]: true }));
                                            setTestResult(r => ({ ...r, [prov]: null }));
                                            try {
                                                const res = await api.post('/ai/test-conexion', {
                                                    proveedor: prov,
                                                    modelo: form.modelo,
                                                    api_key: form.api_key,
                                                });
                                                setTestResult(r => ({ ...r, [prov]: { ok: true, latencia_ms: res.data.latencia_ms, respuesta: res.data.respuesta } }));
                                            } catch (err: any) {
                                                const msg = err.response?.data?.detail ?? 'Error desconocido';
                                                setTestResult(r => ({ ...r, [prov]: { ok: false, error: msg } }));
                                            } finally {
                                                setTesting(t => ({ ...t, [prov]: false }));
                                            }
                                        }}
                                        className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white text-gray-600 rounded-xl text-xs font-bold hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-all active:scale-95"
                                    >
                                        {testing[prov]
                                            ? <Loader2 size={13} className="animate-spin" />
                                            : <Zap size={13} />}
                                        {testing[prov] ? 'Probando...' : 'Probar conexión'}
                                    </button>

                                    {/* Botón guardar */}
                                    <button onClick={() => handleSave(prov)}
                                        disabled={saving[prov] || !(form.api_key ?? '').trim()}
                                        className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-40 transition-all active:scale-95"
                                    >
                                        {saving[prov]
                                            ? <Loader2 size={13} className="animate-spin" />
                                            : saved[prov]
                                                ? <Check size={13} />
                                                : <Sparkles size={13} />}
                                        {saved[prov] ? 'Guardado' : 'Guardar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
