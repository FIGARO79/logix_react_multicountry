import React, { useEffect, useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';

const Reconciliation = () => {
    const { setTitle } = useOutletContext();
    useEffect(() => { setTitle("Logix - Conciliación de Inbound"); }, [setTitle]);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterText, setFilterText] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'GRN', direction: 'ascending' });
    const [archiveVersions, setArchiveVersions] = useState([]);
    const [snapshotVersions, setSnapshotVersions] = useState([]);
    const [currentVersion, setCurrentVersion] = useState('');
    const [currentSnapshot, setCurrentSnapshot] = useState('');

    // Fetch data
    const fetchData = (params = {}) => {
        setLoading(true);
        const queryParams = new URLSearchParams();
        if (params.archive_date) queryParams.append('archive_date', params.archive_date);
        if (params.snapshot_date) queryParams.append('snapshot_date', params.snapshot_date);

        fetch(`/api/views/reconciliation?${queryParams.toString()}`, { credentials: 'include' })
            .then(res => res.json())
            .then(response => {
                if (response.data) setData(response.data);
                if (response.archive_versions) setArchiveVersions(response.archive_versions);
                if (response.snapshot_versions) setSnapshotVersions(response.snapshot_versions);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching reconciliation data:", err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleArchiveSnapshot = async () => {
        if (!data || data.length === 0) return alert("No hay datos para archivar");
        if (!confirm("¿Deseas guardar una instantánea (SNAPSHOT) de esta conciliación? Esto congelará las diferencias calculadas actualmente.")) return;

        try {
            const res = await fetch('/api/views/reconciliation/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                credentials: 'include'
            });
            if (res.ok) {
                const result = await res.json();
                alert(`Instantánea guardada correctamente: ${result.archive_date}`);
                fetchData(); // Recargar versiones
            } else {
                alert("Error al guardar la instantánea");
            }
        } catch (e) {
            alert("Error de conexión");
        }
    };

    const handleVersionChange = (e) => {
        const val = e.target.value;
        setCurrentVersion(val);
        setCurrentSnapshot(''); // Limpiar snapshot si cambia versión de logs
        fetchData({ archive_date: val });
    };

    const handleSnapshotChange = (e) => {
        const val = e.target.value;
        setCurrentSnapshot(val);
        setCurrentVersion(''); // Limpiar versión de logs si cambia snapshot
        fetchData({ snapshot_date: val });
    };

    const formatDateShort = (dateStr) => {
        if (!dateStr) return '';
        try {
            // Manejar fechas ISO o formatos de SQL
            const date = new Date(dateStr.replace(' ', 'T'));
            return date.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) { return dateStr; }
    };

    // Sorting logic
    const sortedData = useMemo(() => {
        let sortableItems = [...data];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aKey = a[sortConfig.key];
                let bKey = b[sortConfig.key];

                // Handle numbers correctly
                if (typeof aKey === 'number' && typeof bKey === 'number') {
                    return sortConfig.direction === 'ascending' ? aKey - bKey : bKey - aKey;
                }
                // Handle strings
                aKey = aKey ? aKey.toString().toLowerCase() : '';
                bKey = bKey ? bKey.toString().toLowerCase() : '';

                if (aKey < bKey) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aKey > bKey) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [data, sortConfig]);

    // Filtering logic
    const filteredData = useMemo(() => {
        return sortedData.filter(item => {
            if (!filterText) return true;
            return Object.values(item).some(val =>
                String(val).toLowerCase().includes(filterText.toLowerCase())
            );
        });
    }, [sortedData, filterText]);

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // Helper for Sort Icons
    const getSortIcon = (name) => {
        if (sortConfig.key !== name) return <span className="ml-1 text-gray-400">↕</span>;
        return sortConfig.direction === 'ascending' ? <span className="ml-1 text-black">↑</span> : <span className="ml-1 text-black">↓</span>;
    };

    return (
        <div className="p-2 sm:p-6 bg-gray-50 min-h-screen font-sans">
            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 bg-white p-4 rounded shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 md:mb-0 flex items-center gap-2">
                    Conciliación de inbound
                </h2>

                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto items-center">
                    {/* Select Logs Archived */}
                    <select 
                        value={currentVersion}
                        onChange={handleVersionChange}
                        className="h-8 text-[10px] font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#285f94] transition-all duration-150 cursor-pointer"
                    >
                        <option value="">-- Logs Actuales --</option>
                        {archiveVersions.map(v => (
                            <option key={v} value={v}>Logs: {formatDateShort(v)}</option>
                        ))}
                    </select>

                    {/* Select Snapshots (Frozen) */}
                    <select 
                        value={currentSnapshot}
                        onChange={handleSnapshotChange}
                        className="h-8 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-md shadow-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-[#285f94] transition-all duration-150 cursor-pointer"
                    >
                        <option value="">-- Historial Snapshots --</option>
                        {snapshotVersions.map(v => (
                            <option key={v} value={v}>Snapshot: {formatDateShort(v)}</option>
                        ))}
                    </select>

                    {/* Search Box */}
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="h-8 px-2 text-xs border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-[#285f94] focus:border-[#285f94] focus:outline-none w-48 transition-all duration-150"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />

                    {/* Export Button */}
                    <button
                        onClick={() => window.location.href = `/api/export_reconciliation?${currentVersion ? `archive_date=${currentVersion}` : ''}${currentSnapshot ? `snapshot_date=${currentSnapshot}` : ''}`}
                        className="h-8 px-4 text-xs font-medium bg-emerald-600 text-white border border-emerald-700 rounded-md shadow-sm hover:bg-emerald-700 transition-all duration-150 flex items-center justify-center gap-1.5"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.586l2.914 2.914a1 1 0 01.586 1.414V19a2 2 0 01-2 2z" /></svg>
                        Exportar
                    </button>

                    {/* Archive Snapshot Button */}
                    {!currentSnapshot && (
                        <button
                            onClick={handleArchiveSnapshot}
                            className="h-8 px-4 text-xs font-medium bg-blue-600 text-white border border-blue-700 rounded-md shadow-sm hover:bg-blue-700 transition-all duration-150 flex items-center justify-center gap-1.5"
                            title="Congelar esta vista en el historial"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                            Snapshot
                        </button>
                    )}
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
                {loading ? (
                    <div className="p-12 text-center text-gray-500 animate-pulse font-bold italic">
                        Calculando conciliación de datos...
                    </div>
                ) : (
                    <div className="overflow-x-auto max-h-[75vh]">
                        <table className="w-full text-[11px] border-collapse">
                            <thead className="bg-slate-800 text-white sticky top-0 z-10 shadow-sm">
                                <tr>
                                    {['Import_Reference', 'Waybill', 'GRN', 'Codigo_Item', 'Descripcion', 'Ubicacion', 'Reubicado', 'Cant_Esperada', 'Cant_Recibida', 'Diferencia'].map((head) => (
                                        <th
                                            key={head}
                                            onClick={() => requestSort(head)}
                                            className="px-2 py-2 text-left font-semibold cursor-pointer transition select-none whitespace-nowrap hover:bg-slate-700 border-r border-slate-600 last:border-0"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span>{head === 'Import_Reference' ? 'I.R.' : head.replace(/_/g, ' ')}</span>
                                                {getSortIcon(head)}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredData.length > 0 ? (
                                    filteredData.map((row, idx) => {
                                        const diff = row.Diferencia;
                                        const baseClass = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                                        
                                        let rowClass = `${baseClass} hover:bg-blue-50/50`;
                                        let textClass = "text-gray-600";

                                        if (diff > 0) {
                                            rowClass = "bg-blue-50 hover:bg-blue-100";
                                            textClass = "text-blue-700 font-bold";
                                        } else if (diff < 0) {
                                            rowClass = "bg-red-50 hover:bg-red-100";
                                            textClass = "text-red-700 font-bold";
                                        }

                                        return (
                                            <tr key={idx} className={`${rowClass} transition-colors border-b border-gray-100 leading-tight`}>
                                                <td className="px-2 py-1.5 whitespace-nowrap font-bold text-gray-800">{row.Import_Reference}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">{row.Waybill}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap text-gray-400 italic">{row.GRN}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap font-mono font-bold text-[#285f94]">{row.Codigo_Item}</td>
                                                <td className="px-2 py-1.5 truncate max-w-[220px]" title={row.Descripcion}>{row.Descripcion}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap font-mono text-gray-700">{row.Ubicacion || '-'}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap font-mono text-blue-600 font-bold">{row.Reubicado || '-'}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap text-center font-mono">{row.Cant_Esperada}</td>
                                                <td className="px-2 py-1.5 whitespace-nowrap text-center font-mono font-bold">{row.Cant_Recibida}</td>
                                                <td className={`px-2 py-1.5 whitespace-nowrap text-center font-mono text-xs ${textClass}`}>
                                                    {diff > 0 ? `+${diff}` : diff}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="10" className="px-2 py-8 text-center text-gray-400 italic">
                                            No se encontraron registros de conciliación pendientes.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Footer / Stats */}
                {!loading && (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex flex-col xs:flex-row items-center justify-between text-xs text-gray-500">
                        <span>Mostrando {filteredData.length} registros</span>
                        <span>Datos en tiempo real</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reconciliation;
