import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import AdminLayout from '../components/AdminLayout';
import { useNavigate } from 'react-router-dom';
import * as Icons from '../components/Icons';

const SlottingConfig = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('storage');
    const [config, setConfig] = useState({ turnover: {}, storage: {} });
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [searchTerm, setSearchSpec] = useState('');
    
    const [showUpload, setShowUpload] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const fileInputRef = useRef(null);
    const statsRef = useRef(null);
    const [statsHeight, setStatsHeight] = useState(null);

    useEffect(() => {
        if (!statsRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setStatsHeight(entry.contentRect.height);
            }
        });
        observer.observe(statsRef.current);
        return () => observer.disconnect();
    }, []);

    const fetchSummary = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/slotting-summary', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                console.log("DEBUG SLOT SUMMARY:", data);
                setSummary(data);
            } else {
                setSummary({ total: 0, in_use: 0, free: 0, occupancy_pct: 0, by_zone: {} });
            }
        } catch (err) {
            setSummary({ total: 0, in_use: 0, free: 0, occupancy_pct: 0, by_zone: {} });
        }
    }, []);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/slotting-config', { credentials: 'include' });
            if (res.status === 401 || res.status === 403) {
                navigate('/admin/login');
                return;
            }
            if (!res.ok) throw new Error('No se pudo cargar la configuración');
            const data = await res.json();
            setConfig(data);
            fetchSummary();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [navigate, fetchSummary]);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleSave = async (updatedConfig = config) => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch('/api/admin/slotting-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedConfig),
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Error al guardar en el servidor');
            setSuccess('Configuración actualizada correctamente.');
            setConfig(updatedConfig);
            fetchSummary();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleFileUpload = async () => {
        if (!selectedFile) return;
        if (!window.confirm("¿Está seguro de reemplazar TODO el layout actual? Esta acción borrará las ubicaciones que no estén en el archivo.")) return;

        setSaving(true);
        setError(null);
        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const res = await fetch('/api/admin/slotting-upload', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Error al procesar archivo');
            setSuccess(data.message);
            setShowUpload(false);
            setSelectedFile(null);
            fetchConfig();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const updateBin = (binCode, field, value) => {
        const newConfig = { ...config };
        newConfig.storage[binCode][field] = field === 'level' ? parseInt(value) || 0 : value;
        setConfig(newConfig);
    };

    const filteredBins = useMemo(() => {
        return Object.entries(config.storage)
            .filter(([code]) => code.toLowerCase().includes(searchTerm.toLowerCase()))
            .slice(0, 150);
    }, [config.storage, searchTerm]);

    const getSpotColor = (spot) => {
        switch(spot?.toLowerCase()) {
            case 'hot': return 'text-[#354a5f] font-black';
            case 'warm': return 'text-[#0070f3] font-bold';
            case 'cold': return 'text-[#6a6d70]';
            default: return 'text-gray-400';
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setSelectedFile(e.dataTransfer.files[0]);
        }
    };

    return (
        <AdminLayout title="Configuración de Almacenamiento">
            {/* Header Area */}
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                <h1 className="text-2xl font-normal text-gray-800">Estrategia de Slotting y Layout</h1>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowUpload(!showUpload)} 
                        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                        <Icons.UploadIcon className="w-4 h-4" />
                        Cargar Excel
                    </button>
                    <button 
                        onClick={() => handleSave()} 
                        disabled={saving} 
                        className="bg-[#285f94] text-white px-6 py-2 rounded hover:bg-[#1e4a74] transition-colors text-sm font-bold shadow-sm disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? 'Guardando...' : <><Icons.CheckCircleIcon className="w-4 h-4 text-white/80" /> Publicar Cambios</>}
                    </button>
                </div>
            </div>

            {success && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-r shadow-sm">{success}</div>}
            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-r shadow-sm">{error}</div>}

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 mb-6">
                <button
                    onClick={() => setActiveTab('storage')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'storage' ? 'border-[#285f94] text-[#285f94]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    <span className="flex items-center gap-2">
                        <Icons.DocumentIcon className="w-4 h-4" />
                        Mapa de Ubicaciones
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('turnover')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'turnover' ? 'border-[#285f94] text-[#285f94]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    <span className="flex items-center gap-2">
                        <Icons.ChartIcon className="w-4 h-4" />
                        Estrategia SIC
                    </span>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-3 space-y-6">
                    {showUpload && (
                        <div className="bg-[#ebf5fe] border-l-4 border-[#285f94] rounded p-6 shadow-sm animate-fadeIn">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-base font-semibold text-[#32363a] flex items-center gap-2">
                                    <Icons.UploadIcon className="w-5 h-5 text-[#285f94]" />
                                    Carga Masiva de Layout
                                </h2>
                                <button 
                                    onClick={() => window.location.href = '/api/admin/slotting-template'} 
                                    className="text-xs font-bold text-[#285f94] hover:underline flex items-center gap-1"
                                >
                                    <Icons.DownloadIcon className="w-3 h-3" />
                                    Descargar Layout Actual
                                </button>
                            </div>
                            <div 
                                className="border-2 border-dashed border-[#285f94]/30 rounded-lg p-8 text-center cursor-pointer hover:bg-white/50 transition-colors" 
                                onClick={() => fileInputRef.current.click()}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                            >
                                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" onChange={e => setSelectedFile(e.target.files[0])} />
                                <p className="text-sm text-gray-600 font-medium">{selectedFile ? `Seleccionado: ${selectedFile.name}` : 'Arrastre su archivo Excel o haga clic aquí'}</p>
                            </div>
                            <div className="mt-4 flex justify-end gap-3">
                                <button onClick={() => {setShowUpload(false); setSelectedFile(null);}} className="text-sm font-medium text-gray-500 px-4 py-2">Cancelar</button>
                                <button onClick={handleFileUpload} disabled={!selectedFile || saving} className="bg-[#285f94] text-white px-6 py-2 rounded text-sm font-bold hover:bg-[#1e4a74] transition-colors disabled:bg-gray-300">Subir y Reemplazar</button>
                            </div>
                        </div>
                    )}

                    <div className="bg-white shadow-sm rounded border border-[#d9d9d9] overflow-hidden">
                        <div className="bg-[#f2f2f2] px-4 py-1.5 border-b border-[#e5e5e5] flex flex-row justify-between items-center gap-4">
                            <div className="flex-1 max-w-[180px]">
                                <input 
                                    type="text" 
                                    placeholder="Filtrar..." 
                                    className="h-6 w-full p-0 text-[11px] border border-[#89919a] rounded focus:ring-1 focus:ring-[#285f94] outline-none transition-all" 
                                    value={searchTerm} 
                                    onChange={e => setSearchSpec(e.target.value)} 
                                />
                            </div>
                            <div className="whitespace-nowrap shrink-0">
                                <span className="text-[10px] text-[#6a6d70] font-bold uppercase tracking-tight">{filteredBins.length} registros</span>
                            </div>
                        </div>
                        <div className="overflow-x-auto" style={{ overflowY: 'auto', maxHeight: statsHeight ? `${statsHeight}px` : 'calc(100vh - 175px)' }}>
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#354a5f] sticky top-0 z-10 shadow-sm text-white">
                                    {activeTab === 'storage' ? (
                                        <tr>
                                            <th className="px-3 py-1.5 text-xs font-semibold uppercase">BIN</th>
                                            <th className="px-3 py-1.5 text-xs font-semibold uppercase">ZONA</th>
                                            <th className="px-3 py-1.5 text-xs font-semibold uppercase text-center w-20">PASILLO</th>
                                            <th className="px-3 py-1.5 text-xs font-semibold uppercase text-center w-20">NIVEL</th>
                                            <th className="px-3 py-1.5 text-xs font-semibold uppercase text-center">SPOT</th>
                                        </tr>
                                    ) : (
                                        <tr>
                                            <th className="px-3 py-1.5 text-xs font-semibold uppercase">SIC</th>
                                            <th className="px-3 py-1.5 text-xs font-semibold uppercase">RANGO</th>
                                            <th className="px-3 py-1.5 text-xs font-semibold uppercase text-center">ESTRATEGIA</th>
                                        </tr>
                                    )}
                                </thead>
                                <tbody className="divide-y divide-[#e5e5e5]">
                                    {loading ? (
                                        <tr><td colSpan="5" className="p-8 text-center text-gray-400 text-sm italic">Sincronizando...</td></tr>
                                    ) : activeTab === 'storage' ? (
                                        filteredBins.map(([code, info]) => (
                                            <tr key={code} className="hover:bg-[#f5f5f5] transition-colors leading-none">
                                                <td className="px-3 py-0.5 font-mono text-[12px] font-semibold text-[#285f94]">{code}</td>
                                                <td className="px-3 py-0.5">
                                                    <select value={info.zone} onChange={e => updateBin(code, 'zone', e.target.value)} className="bg-transparent border-none text-[11px] font-medium focus:ring-0 p-0 h-6 w-full cursor-pointer">
                                                        <option value="Rack">Rack</option>
                                                        <option value="Minuteria">Minutería</option>
                                                        <option value="Cantilever">Cantilever</option>
                                                        <option value="Floor">Piso / Isla</option>
                                                    </select>
                                                </td>
                                                <td className="px-3 py-0.5 text-center w-20">
                                                    <input type="text" value={info.aisle} onChange={e => updateBin(code, 'aisle', e.target.value)} className="bg-transparent border-none w-10 text-[11px] font-bold text-center h-6 p-0" />
                                                </td>
                                                <td className="px-3 py-0.5 text-center w-20">
                                                    <input type="number" value={info.level} onChange={e => updateBin(code, 'level', e.target.value)} className="bg-transparent border-none w-10 text-[11px] font-bold text-center h-6 p-0" />
                                                </td>
                                                <td className="px-3 py-0.5 text-center leading-none">
                                                    <select value={info.spot} onChange={e => updateBin(code, 'spot', e.target.value)} className={`text-[9px] bg-transparent border-none outline-none cursor-pointer uppercase tracking-tighter p-0 h-6 text-center w-full ${getSpotColor(info.spot)}`}>
                                                        <option value="Hot" className="text-gray-800">Hot</option>
                                                        <option value="Warm" className="text-gray-800">Warm</option>
                                                        <option value="Cold" className="text-gray-800">Cold</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        Object.entries(config.turnover).map(([sic, info]) => (
                                            <tr key={sic} className="hover:bg-[#f5f5f5] transition-colors leading-none">
                                                <td className="px-3 py-1 font-bold text-gray-700 text-[12px]">{sic}</td>
                                                <td className="px-3 py-1 text-gray-500 font-medium text-[11px]">{info.range}</td>
                                                <td className="px-3 py-1 text-center">
                                                    <select value={info.spot} onChange={e => { const n = {...config}; n.turnover[sic].spot = e.target.value; setConfig(n); }} className={`text-[9px] bg-transparent border-none outline-none cursor-pointer uppercase tracking-tighter p-0 h-6 text-center w-24 ${getSpotColor(info.spot)}`}>
                                                        <option value="hot" className="text-gray-800">Hot</option>
                                                        <option value="warm" className="text-gray-800">Warm</option>
                                                        <option value="cold" className="text-gray-800">Cold</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="mt-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center italic">
                        {activeTab === 'storage' ? `Mostrando registros del layout maestro` : 'Estrategia de asignación según frecuencia de rotación'}
                    </div>
                </div>

                {/* Right Panel: Summary Dashboard */}
                <div className="lg:col-span-1">
                    <div ref={statsRef} className="bg-white p-6 rounded shadow-sm border border-[#d9d9d9] sticky top-20">
                        <h2 className="text-lg font-normal text-gray-800 mb-4 border-b pb-2">
                            Estado del Almacén
                        </h2>
                        {!summary ? (
                            <div className="flex justify-center py-8 text-gray-400 text-xs italic">Calculando estadísticas...</div>
                        ) : (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 tracking-tighter">Capacidad Física</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1">
                                            <span className="text-gray-600">Total Bins</span>
                                            <span className="font-mono font-medium text-gray-800 text-right min-w-[60px]">{summary.total}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1">
                                            <span className="text-gray-600">Bins en Uso</span>
                                            <span className="font-mono font-bold text-[#285f94] text-right min-w-[60px]">{summary.in_use}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600">Disponibles</span>
                                            <span className="font-mono font-medium text-emerald-600 text-right min-w-[60px]">{summary.free}</span>
                                        </div>
                                        <div className="pt-2">
                                            <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1 uppercase">
                                                <span>Índice de Ocupación</span>
                                                <span className={summary.occupancy_pct > 90 ? 'text-red-600 font-black' : 'text-[#285f94]'}>{summary.occupancy_pct}%</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden shadow-inner">
                                                <div className={`h-full transition-all duration-1000 ${summary.occupancy_pct > 90 ? 'bg-red-500' : 'bg-[#285f94]'}`} style={{ width: `${summary.occupancy_pct}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-t pt-4">Zonas de Inventario</h3>
                                    <div className="space-y-2">
                                        {Object.entries(summary.by_zone || {}).sort((a,b) => b[1] - a[1]).map(([zone, count]) => (
                                            <div key={zone} className="flex justify-between items-center text-xs group py-0.5 border-b border-transparent hover:border-gray-100">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-[#285f94] transition-colors"></span>
                                                    <span className="text-gray-600 group-hover:text-gray-900 transition-colors">{zone}</span>
                                                </div>
                                                <span className="font-mono font-medium text-gray-500">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-t pt-4">Saturación de Ubicaciones</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-1">
                                            <span className="text-gray-600">Total ítems activos</span>
                                            <span className="font-mono font-medium text-gray-800">{summary.total_items_in_bins ?? '—'}</span>
                                        </div>
                                        <div className="pt-1">
                                            <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1 uppercase">
                                                <span>Promedio ítems / bin</span>
                                                <span className={
                                                    (summary.avg_items_per_bin ?? 0) > 5 ? 'text-red-600 font-black' :
                                                    (summary.avg_items_per_bin ?? 0) > 2 ? 'text-amber-500 font-black' :
                                                    'text-emerald-600'
                                                }>
                                                    {summary.avg_items_per_bin ?? '—'}
                                                </span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden shadow-inner">
                                                <div
                                                    className={`h-full transition-all duration-1000 ${
                                                        (summary.avg_items_per_bin ?? 0) > 5 ? 'bg-red-500' :
                                                        (summary.avg_items_per_bin ?? 0) > 2 ? 'bg-amber-400' :
                                                        'bg-emerald-500'
                                                    }`}
                                                    style={{ width: `${Math.min(((summary.avg_items_per_bin ?? 0) / 8) * 100, 100)}%` }}
                                                ></div>
                                            </div>
                                            <div className="flex justify-between text-[9px] text-gray-300 mt-0.5 font-mono">
                                                <span>0</span><span>4</span><span>8+</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {/* Zonas por saturación de ítems */}
                                {summary.zones_by_items && Object.keys(summary.zones_by_items).length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-t pt-4">Zonas más saturadas</h3>
                                        <div className="space-y-2.5">
                                            {(() => {
                                                const entries = Object.entries(summary.zones_by_items);
                                                const maxVal = entries[0]?.[1] || 1;
                                                return entries.map(([zone, count]) => (
                                                    <div key={zone}>
                                                        <div className="flex justify-between text-[10px] font-medium text-gray-600 mb-0.5">
                                                            <span>{zone}</span>
                                                            <span className="font-mono text-gray-500">{count} ítems</span>
                                                        </div>
                                                        <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                                                            <div
                                                                className="h-full bg-[#285f94] transition-all duration-700"
                                                                style={{ width: `${(count / maxVal) * 100}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                )}
                                {/* Top pasillos */}
                                {summary.top_aisles && Object.keys(summary.top_aisles).length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-t pt-4">Top pasillos</h3>
                                        <div className="space-y-2.5">
                                            {(() => {
                                                const entries = Object.entries(summary.top_aisles);
                                                const maxVal = entries[0]?.[1] || 1;
                                                return entries.map(([aisle, count], idx) => (
                                                    <div key={aisle} className="flex items-center gap-2">
                                                        <span className="text-[9px] font-black text-gray-300 w-3 text-right shrink-0">{idx + 1}</span>
                                                        <div className="flex-1">
                                                            <div className="flex justify-between text-[10px] font-medium text-gray-600 mb-0.5">
                                                                <span className="font-mono font-bold text-[#285f94]">Pasillo {aisle}</span>
                                                                <span className="text-gray-500">{count}</span>
                                                            </div>
                                                            <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                                                                <div
                                                                    className={`h-full transition-all duration-700 ${idx === 0 ? 'bg-red-400' : idx === 1 ? 'bg-amber-400' : 'bg-[#285f94]/60'}`}
                                                                    style={{ width: `${(count / maxVal) * 100}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default SlottingConfig;
