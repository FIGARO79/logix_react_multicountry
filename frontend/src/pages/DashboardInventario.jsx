import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';

const DashboardInventario = () => {
    const { setTitle } = useOutletContext();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setTitle("Dashboard de Inteligencia de Inventario");
        fetchStats();
    }, [setTitle]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/counts/dashboard_stats');
            if (!res.ok) throw new Error("Error cargando estadísticas");
            const data = await res.json();
            setStats(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatMoney = (val) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
    };

    if (loading) return <div className="p-10 text-center text-gray-500 italic">Analizando datos maestros...</div>;
    if (error) return <div className="p-10 text-center text-red-500 font-bold">{error}</div>;
    if (stats?.empty) return <div className="p-10 text-center text-gray-500">No hay datos suficientes para generar el dashboard. Inicie los conteos cíclicos.</div>;

    return (
        <div className="max-w-7xl mx-auto px-6 py-8 font-sans bg-gray-50 min-h-screen">
            
            {/* 1. KPIs de Exactitud (ERI) */}
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                Exactitud de Registro de Inventario (ERI)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <div className="bg-slate-800 text-white p-6 rounded-xl shadow-lg border-b-4 border-blue-500 relative overflow-hidden">
                    <label className="text-[10px] uppercase text-blue-300 font-bold tracking-tighter">ERI GLOBAL</label>
                    <div className="text-4xl font-mono font-bold mt-1">{stats.eri.Global}%</div>
                    <div className="text-[10px] text-gray-400 mt-2 italic">Muestra: {stats.total_items} items</div>
                    <div className="absolute top-[-10px] right-[-10px] opacity-10">
                        <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500">
                    <label className="text-[10px] uppercase text-gray-400 font-bold">ERI CLASE A</label>
                    <div className="text-3xl font-bold text-gray-800 mt-1">{stats.eri.A}%</div>
                    <div className="w-full bg-gray-100 h-1.5 mt-3 rounded-full overflow-hidden">
                        <div className="bg-red-500 h-full" style={{width: `${stats.eri.A}%`}}></div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-yellow-500">
                    <label className="text-[10px] uppercase text-gray-400 font-bold">ERI CLASE B</label>
                    <div className="text-3xl font-bold text-gray-800 mt-1">{stats.eri.B}%</div>
                    <div className="w-full bg-gray-100 h-1.5 mt-3 rounded-full overflow-hidden">
                        <div className="bg-yellow-500 h-full" style={{width: `${stats.eri.B}%`}}></div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500">
                    <label className="text-[10px] uppercase text-gray-400 font-bold">ERI CLASE C</label>
                    <div className="text-3xl font-bold text-gray-800 mt-1">{stats.eri.C}%</div>
                    <div className="w-full bg-gray-100 h-1.5 mt-3 rounded-full overflow-hidden">
                        <div className="bg-green-500 h-full" style={{width: `${stats.eri.C}%`}}></div>
                    </div>
                </div>
            </div>

            {/* 2. Impacto Financiero y Ajustes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m.5-1c.28 0 .546-.083.783-.232M6 14a6 6 0 1112 0 6 6 0 01-12 0z"/></svg>
                        Valorización de Ajustes
                    </h3>
                    <div className="space-y-6">
                        <div className="flex justify-between items-end border-b pb-4">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-tight">Impacto Neto (Financiero)</p>
                                <p className={`text-3xl font-mono font-bold ${stats.adjustments.value.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatMoney(stats.adjustments.value.net)}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] uppercase font-bold text-gray-400">Unidades Netas</p>
                                <p className="text-xl font-bold text-gray-700">{stats.adjustments.units.net > 0 ? '+' : ''}{stats.adjustments.units.net}</p>
                            </div>
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-tight">Volumen Bruto de Error (Pérdida de Control)</p>
                                <p className="text-3xl font-mono font-bold text-orange-600">{formatMoney(stats.adjustments.value.gross)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] uppercase font-bold text-gray-400">Unidades Brutas</p>
                                <p className="text-xl font-bold text-gray-700">{stats.adjustments.units.gross}</p>
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-400 italic bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200">
                            * El ajuste bruto representa la suma absoluta de todos los errores. Es el indicador real de la calidad operativa de los procesos de picking y almacenamiento.
                        </p>
                    </div>
                </div>

                {/* Pareto de Pérdidas */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-800 p-4">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                            <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                            Top 10: Mayores Discrepancias Financieras
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-gray-500 uppercase">Item</th>
                                    <th className="px-4 py-3 text-gray-500 uppercase">Unidades</th>
                                    <th className="px-4 py-3 text-gray-500 uppercase text-right">Valor Absoluto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {stats.top_losses.map((item, i) => (
                                    <tr key={i} className="hover:bg-red-50 transition-colors">
                                        <td className="px-4 py-2">
                                            <div className="font-bold text-gray-700">{item.code}</div>
                                            <div className="text-[10px] text-gray-400 truncate max-w-[180px]">{item.desc}</div>
                                        </td>
                                        <td className={`px-4 py-2 font-mono font-bold ${item.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {item.diff > 0 ? '+' : ''}{item.diff}
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono font-bold text-gray-800">
                                            {formatMoney(item.abs_val_diff)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* 3. Productividad y Zonas Críticas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Productividad de Usuarios */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                        Productividad y Calidad por Usuario
                    </h3>
                    <div className="space-y-4">
                        {stats.productivity.map((u, i) => (
                            <div key={i} className="group">
                                <div className="flex justify-between text-[11px] mb-1">
                                    <span className="font-bold text-gray-600">{u.user}</span>
                                    <span className="text-gray-400">{u.items} conteos | Error: <span className={u.error_rate > 10 ? 'text-red-500 font-bold' : 'text-green-600'}>{u.error_rate}%</span></span>
                                </div>
                                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-[#285f94] h-full group-hover:bg-blue-400 transition-all" style={{width: `${(u.items / stats.total_items) * 100}%`}}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Zonas Calientes de Error */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-6 flex items-center gap-2 text-red-600">
                        <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        Densidad de Error por Zona (Pasillos)
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                        {stats.zones.map((z, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-red-600 text-white rounded-lg flex items-center justify-center font-bold text-lg shadow-sm">
                                        {z.zone}
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-red-800 tracking-tight">ZONA {z.zone}</p>
                                        <p className="text-xs text-red-600">{z.total} muestras auditadas</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xl font-mono font-bold text-red-700">{z.error_rate}%</p>
                                    <p className="text-[9px] uppercase text-red-400 font-bold italic text-right">Tasa de Error</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    );
};

export default DashboardInventario;
