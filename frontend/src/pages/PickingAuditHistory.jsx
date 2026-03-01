import React, { useState, useEffect } from 'react';
import { Link, useOutletContext, useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const PickingAuditHistory = () => {
    const { setTitle } = useOutletContext();
    const [audits, setAudits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedAuditId, setExpandedAuditId] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingAudit, setEditingAudit] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // --- Shipment selection ---
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showShipmentModal, setShowShipmentModal] = useState(false);
    const [shipmentNote, setShipmentNote] = useState('');
    const [shipmentCarrier, setShipmentCarrier] = useState('');
    const [creatingShipment, setCreatingShipment] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        setTitle("Pickings Empacados");
    }, []);

    useEffect(() => {
        fetchAudits();
    }, []);

    const fetchAudits = async () => {
        try {
            const response = await fetch('/api/views/view_picking_audits', { credentials: 'include' });
            if (!response.ok) {
                throw new Error('Error al cargar auditorías');
            }
            const data = await response.json();
            setAudits(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (id) => {
        setExpandedAuditId(expandedAuditId === id ? null : id);
    };

    const normalizeDate = (dateString) => {
        if (!dateString) return null;
        let normalized = dateString.trim().replace(' ', 'T');
        if (normalized.length === 10 && normalized.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return `${normalized}T00:00:00`;
        }
        const hasTimeZone = normalized.includes('Z') ||
            normalized.match(/[+-]\d{2}:\d{2}$/) ||
            (normalized.includes('-') && normalized.split('T')[1]?.includes('-'));
        if (!hasTimeZone) {
            normalized = `${normalized}Z`;
        }
        return normalized;
    };

    const isToday = (dateString) => {
        const normalized = normalizeDate(dateString);
        if (!normalized) return false;
        const date = new Date(normalized);
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    const formatDate = (dateString) => {
        const normalized = normalizeDate(dateString);
        if (!normalized) return '';
        const date = new Date(normalized);
        if (isNaN(date.getTime())) return 'Fecha Inválida';
        return date.toLocaleString(undefined, {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
    };

    const handleEditClick = (audit) => {
        const clonedAudit = {
            ...audit,
            items: audit.items.map(item => ({ ...item }))
        };
        setEditingAudit(clonedAudit);
        setIsEditModalOpen(true);
    };

    const handleQtyChange = (idx, value) => {
        const val = parseInt(value) || 0;
        const newItems = [...editingAudit.items];
        newItems[idx].qty_scan = val;
        newItems[idx].difference = val - newItems[idx].qty_req;
        setEditingAudit({ ...editingAudit, items: newItems });
    };

    const handleSaveEdit = async () => {
        setIsSubmitting(true);
        try {
            const payload = {
                order_number: editingAudit.order_number,
                despatch_number: editingAudit.despatch_number,
                customer_name: editingAudit.customer_name || 'N/A',
                status: editingAudit.status,
                items: editingAudit.items.map(item => ({
                    code: item.item_code,
                    description: item.description,
                    order_line: item.order_line || '',
                    qty_req: item.qty_req,
                    qty_scan: item.qty_scan
                })),
                packages: editingAudit.packages || 0,
                packages_assignment: editingAudit.packages_assignment || {}
            };

            const response = await fetch(`/api/update_picking_audit/${editingAudit.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include'
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Error al actualizar');
            }

            await fetchAudits();
            setIsEditModalOpen(false);
            setEditingAudit(null);
            toast.success("Auditoría actualizada exitosamente");
        } catch (err) {
            toast.error(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleCreateShipment = async () => {
        setCreatingShipment(true);
        try {
            const res = await fetch('/api/shipments/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audit_ids: [...selectedIds],
                    note: shipmentNote || null,
                    carrier: shipmentCarrier || null
                }),
                credentials: 'include'
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Error al crear envío');
            }
            const result = await res.json();
            toast.success(result.message);
            setShowShipmentModal(false);
            setSelectedIds(new Set());
            setShipmentNote('');
            setShipmentCarrier('');
            setTimeout(() => navigate('/shipments'), 1500);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setCreatingShipment(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <ToastContainer position="top-right" autoClose={3000} />

            {loading && (
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#285f94]"></div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                    <p className="text-red-700">{error}</p>
                </div>
            )}

            {!loading && !error && (
                <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr className="border-b border-gray-200 text-left text-xs font-bold uppercase tracking-wider">
                                    <th className="px-2 py-2 text-center w-10">Envío</th>
                                    <th className="px-3 py-2 text-center w-8"></th>
                                    <th className="px-3 py-2">ID</th>
                                    <th className="px-3 py-2">Pedido</th>
                                    <th className="px-3 py-2">Despacho</th>
                                    <th className="px-3 py-2">Cliente</th>
                                    <th className="px-3 py-2">Usuario</th>
                                    <th className="px-3 py-2">Fecha</th>
                                    <th className="px-3 py-2 text-center">Estado</th>
                                    <th className="px-3 py-2 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {audits.map((audit) => (
                                    <React.Fragment key={audit.id}>
                                        <tr
                                            className={`border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer
                                                ${expandedAuditId === audit.id ? 'bg-blue-50' : ''}
                                                ${selectedIds.has(audit.id) ? 'bg-indigo-50' : ''}`}
                                            onClick={() => toggleExpand(audit.id)}
                                        >
                                            <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(audit.id)}
                                                    onChange={() => toggleSelect(audit.id)}
                                                    className="rounded border-gray-300 text-[#285f94] focus:ring-[#285f94] cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <svg
                                                    className={`w-4 h-4 text-gray-500 transform transition-transform duration-200 ${expandedAuditId === audit.id ? 'rotate-90' : ''}`}
                                                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </td>
                                            <td className="px-3 py-2 text-xs font-medium text-gray-900">{audit.id}</td>
                                            <td className="px-3 py-2 text-xs text-[#285f94] font-semibold">{audit.order_number}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600">{audit.despatch_number}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[150px]">{audit.customer_name || 'N/A'}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600">{audit.username}</td>
                                            <td className="px-3 py-2 text-xs text-gray-600">{formatDate(audit.timestamp)}</td>
                                            <td className="px-3 py-2 text-center">
                                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full border ${audit.status === 'Completado' || audit.status === 'Completo'
                                                    ? 'bg-green-100 text-green-800 border-green-200' :
                                                    'bg-yellow-100 text-yellow-800 border-yellow-200'
                                                    }`}>
                                                    {audit.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <div className="flex justify-center gap-2">
                                                    {isToday(audit.timestamp) && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleEditClick(audit); }}
                                                            className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded border border-blue-100 shadow-sm"
                                                            title="Editar Auditoría"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    <Link
                                                        to={`/packing_list/print/${audit.id}`}
                                                        className="p-1.5 bg-gray-50 text-gray-600 hover:bg-[#285f94] hover:text-white rounded border border-gray-200 shadow-sm"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title="Imprimir Packing List"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                        </svg>
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>

                                        {expandedAuditId === audit.id && (
                                            <tr className="bg-gray-50">
                                                <td colSpan="10" className="p-4 border-b border-gray-200">
                                                    <div className="bg-white rounded border border-gray-200 p-4">
                                                        <h4 className="font-bold text-gray-700 mb-3 text-sm uppercase">Detalle de Ítems</h4>
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="border-b text-gray-500">
                                                                    <th className="py-1 text-left w-12">Línea</th>
                                                                    <th className="py-1 text-left">Código Item</th>
                                                                    <th className="py-1 text-left">Descripción</th>
                                                                    <th className="py-1 text-right">Req.</th>
                                                                    <th className="py-1 text-right">Esc.</th>
                                                                    <th className="py-1 text-right">Dif.</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {audit.items.map((item, idx) => (
                                                                    <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                                                                        <td className="py-1.5 font-mono text-[10px] text-gray-400">{item.order_line}</td>
                                                                        <td className="py-1.5 font-medium">{item.item_code}</td>
                                                                        <td className="py-1.5 text-gray-600 truncate max-w-[200px]">{item.description}</td>
                                                                        <td className="py-1.5 text-right">{item.qty_req}</td>
                                                                        <td className="py-1.5 text-right">{item.qty_scan}</td>
                                                                        <td className={`py-1.5 text-right font-bold ${item.difference !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                            {item.difference > 0 ? `+${item.difference}` : item.difference}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="block sm:hidden bg-gray-50 p-2 space-y-3">
                        {audits.map((audit) => (
                            <div key={audit.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                                <div className="p-4" onClick={() => toggleExpand(audit.id)}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-bold text-[#285f94]">{audit.order_number}</span>
                                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border">{audit.despatch_number}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${audit.status === 'Completo' || audit.status === 'Completado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100'}`}>
                                            {audit.status}
                                        </span>
                                    </div>
                                    <div className="text-sm font-medium mb-1">{audit.customer_name}</div>
                                    <div className="flex justify-between items-end text-xs text-gray-500">
                                        <div>{formatDate(audit.timestamp)}</div>
                                        <div className="flex gap-2">
                                            <Link to={`/packing_list/print/${audit.id}`} className="p-2 border rounded" onClick={e => e.stopPropagation()}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                </svg>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                                {expandedAuditId === audit.id && (
                                    <div className="p-4 bg-gray-50 border-t space-y-2">
                                        {audit.items.map((item, idx) => (
                                            <div key={idx} className="bg-white p-2 rounded shadow-sm border text-xs">
                                                <div className="flex justify-between font-bold mb-1">
                                                    <span>{item.item_code} (L: {item.order_line})</span>
                                                    <span className={item.difference === 0 ? 'text-green-600' : 'text-red-500'}>
                                                        {item.qty_scan} / {item.qty_req}
                                                    </span>
                                                </div>
                                                <div className="text-gray-500 truncate">{item.description}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#285f94] text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-[slideUp_0.3s_ease-out]">
                    <span className="text-sm font-medium">{selectedIds.size} seleccionados</span>
                    <button onClick={() => setShowShipmentModal(true)} className="bg-white text-[#285f94] px-4 py-1.5 rounded-full text-sm font-bold">Crear Envío</button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-white/70 hover:text-white">✕</button>
                </div>
            )}

            {showShipmentModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold mb-4">Crear Envío Consolidado</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Transportadora</label>
                                <input type="text" value={shipmentCarrier} onChange={e => setShipmentCarrier(e.target.value)} className="w-full border rounded p-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Nota</label>
                                <textarea value={shipmentNote} onChange={e => setShipmentNote(e.target.value)} className="w-full border rounded p-2" rows={2} />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setShowShipmentModal(false)} className="px-4 py-2 border rounded">Cancelar</button>
                            <button onClick={handleCreateShipment} className="px-4 py-2 bg-[#285f94] text-white rounded">
                                {creatingShipment ? 'Creando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isEditModalOpen && editingAudit && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-6 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-xl font-bold">Editar Auditoría #{editingAudit.id}</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-2xl">✕</button>
                        </div>
                        <div className="overflow-y-auto mb-4">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="p-2 text-center w-12">Línea</th>
                                        <th className="p-2 text-left">Código</th>
                                        <th className="p-2 text-left">Descripción</th>
                                        <th className="p-2 text-center">Req.</th>
                                        <th className="p-2 text-center w-32">Escaneado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {editingAudit.items.map((item, idx) => (
                                        <tr key={idx} className="border-b">
                                            <td className="p-2 text-center text-gray-400 font-mono text-[10px]">{item.order_line}</td>
                                            <td className="p-2 font-bold">{item.item_code}</td>
                                            <td className="p-2 truncate max-w-xs">{item.description}</td>
                                            <td className="p-2 text-center">{item.qty_req}</td>
                                            <td className="p-2 text-center">
                                                <input type="number" value={item.qty_scan} onChange={(e) => handleQtyChange(idx, e.target.value)} className="w-20 text-center border rounded font-bold" min="0" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <button onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 border rounded">Cancelar</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-[#285f94] text-white rounded" disabled={isSubmitting}>
                                {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PickingAuditHistory;
