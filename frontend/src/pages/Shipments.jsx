import React, { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Shipments = () => {
    const { setTitle } = useOutletContext();
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);

    useEffect(() => {
        setTitle("Envíos Consolidados");
        fetchShipments();
    }, [setTitle]);

    const fetchShipments = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/shipments/', { credentials: 'include' });
            if (!res.ok) throw new Error('Error al cargar envíos');
            setShipments(await res.json());
        } catch (err) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async (id) => {
        if (!confirm(`¿Cancelar envío #${id}?`)) return;
        try {
            const res = await fetch(`/api/shipments/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Error al cancelar');
            toast.success(`Envío #${id} cancelado`);
            fetchShipments();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleString('es-CO', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: false
            });
        } catch { return dateStr; }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <ToastContainer position="top-right" autoClose={3000} />

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-800">Mis Envíos</h2>
                <button
                    onClick={fetchShipments}
                    className="text-sm text-[#285f94] hover:underline"
                >
                    Actualizar
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#285f94]"></div>
                </div>
            ) : shipments.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <h3 className="text-lg text-gray-400 mb-1">Sin Envíos</h3>
                    <p className="text-sm text-gray-500">
                        Crea un envío desde el{' '}
                        <Link to="/view_picking_audits" className="text-[#285f94] hover:underline">
                            Historial de Auditorías
                        </Link>
                    </p>
                </div>
            ) : (
                <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
                    {/* Desktop Table */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr className="border-b border-gray-200 text-left text-xs font-bold uppercase tracking-wider">
                                    <th className="px-3 py-2 text-center w-8"></th>
                                    <th className="px-3 py-2">ID</th>
                                    <th className="px-3 py-2">Fecha</th>
                                    <th className="px-3 py-2">Usuario</th>
                                    <th className="px-3 py-2">Transportadora</th>
                                    <th className="px-3 py-2 text-center">Pedidos</th>
                                    <th className="px-3 py-2 text-center">Estado</th>
                                    <th className="px-3 py-2 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shipments.map(s => (
                                    <React.Fragment key={s.id}>
                                        <tr
                                            className={`border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors
                                                ${s.status === 'cancelled' ? 'opacity-50' : ''}
                                                ${expandedId === s.id ? 'bg-blue-50' : ''}`}
                                            onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                                        >
                                            <td className="px-3 py-2 text-center">
                                                <svg
                                                    className={`w-4 h-4 text-gray-500 transform transition-transform ${expandedId === s.id ? 'rotate-90' : ''}`}
                                                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </td>
                                            <td className="px-3 py-2 text-xs font-bold text-[#285f94]">#{s.id}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600">{formatDate(s.created_at)}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600">{s.username}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600">{s.carrier || '—'}</td>
                                            <td className="px-3 py-2 text-center">
                                                <span className="bg-[#285f94] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                                    {s.total_orders}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${
                                                    s.status === 'active'
                                                        ? 'bg-green-100 text-green-800 border-green-200'
                                                        : 'bg-red-100 text-red-800 border-red-200'
                                                }`}>
                                                    {s.status === 'active' ? 'Activo' : 'Cancelado'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <div className="flex justify-center gap-2" onClick={e => e.stopPropagation()}>
                                                    {s.status === 'active' && (
                                                        <>
                                                            <Link
                                                                to={`/shipments/print/${s.id}`}
                                                                className="p-1.5 bg-gray-50 text-gray-600 hover:bg-[#285f94] hover:text-white rounded transition-colors border border-gray-200 shadow-sm"
                                                                title="Imprimir Packing List Consolidado"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                                </svg>
                                                            </Link>
                                                            <button
                                                                onClick={() => handleCancel(s.id)}
                                                                className="p-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded transition-colors border border-red-100 shadow-sm"
                                                                title="Cancelar Envío"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Expanded detail */}
                                        {expandedId === s.id && (
                                            <tr className="bg-gray-50">
                                                <td colSpan="8" className="p-4 border-b border-gray-200">
                                                    <div className="bg-white rounded border border-gray-200 p-4">
                                                        {s.note && (
                                                            <p className="text-sm text-gray-600 mb-3">
                                                                <span className="font-semibold">Nota:</span> {s.note}
                                                            </p>
                                                        )}
                                                        <h4 className="font-bold text-gray-700 mb-2 text-sm uppercase tracking-wide">Pedidos Incluidos</h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                            {s.audits.map(a => (
                                                                <div key={a.audit_id} className="bg-gray-50 rounded border border-gray-200 p-3">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <span className="font-bold text-[#285f94]">{a.order_number}</span>
                                                                        <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded border">{a.despatch_number}</span>
                                                                    </div>
                                                                    <div className="text-xs text-gray-600 truncate">{a.customer_name}</div>
                                                                    <div className="text-xs text-gray-400 mt-1">{a.packages} bulto(s)</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="block sm:hidden bg-gray-50 p-2 space-y-3">
                        {shipments.map(s => (
                            <div key={s.id} className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${s.status === 'cancelled' ? 'opacity-60' : ''}`}>
                                <div className="p-4" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-bold text-[#285f94]">Envío #{s.id}</span>
                                            <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${
                                                s.status === 'active'
                                                    ? 'bg-green-100 text-green-800 border-green-200'
                                                    : 'bg-red-100 text-red-800 border-red-200'
                                            }`}>
                                                {s.status === 'active' ? 'Activo' : 'Cancelado'}
                                            </span>
                                        </div>
                                        <span className="bg-[#285f94] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                            {s.total_orders} pedido(s)
                                        </span>
                                    </div>

                                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                                        <span>{formatDate(s.created_at)}</span>
                                        <span>{s.carrier || ''}</span>
                                    </div>

                                    {s.status === 'active' && (
                                        <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                                            <Link
                                                to={`/shipments/print/${s.id}`}
                                                className="flex-1 text-center py-2 bg-[#285f94] text-white rounded text-sm font-bold"
                                            >
                                                Imprimir
                                            </Link>
                                            <button
                                                onClick={() => handleCancel(s.id)}
                                                className="px-4 py-2 bg-red-50 text-red-600 rounded text-sm font-bold border border-red-100"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {expandedId === s.id && (
                                    <div className="bg-gray-50 border-t border-gray-100 p-3 space-y-2">
                                        {s.note && <p className="text-xs text-gray-600"><span className="font-semibold">Nota:</span> {s.note}</p>}
                                        {s.audits.map(a => (
                                            <div key={a.audit_id} className="bg-white p-2 rounded border border-gray-200 flex justify-between items-center text-sm">
                                                <div>
                                                    <span className="font-bold text-[#285f94]">{a.order_number}</span>
                                                    <span className="text-xs text-gray-400 ml-2">/ {a.despatch_number}</span>
                                                </div>
                                                <span className="text-xs text-gray-500">{a.customer_name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Shipments;
