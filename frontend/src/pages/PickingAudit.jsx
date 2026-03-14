import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ScannerModal from '../components/ScannerModal';

// Sound effects using Web Audio API
const createBeep = (frequency, duration) => {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = frequency > 600 ? 'sine' : 'square';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
        console.error("Audio error", e);
    }
};

const playSuccess = () => createBeep(800, 0.1);
const playError = () => createBeep(200, 0.2);

const PickingAudit = () => {
    const { setTitle } = useOutletContext();

    // -- State --
    // Load Section
    const [orderNumber, setOrderNumber] = useState('');
    const [despatchNumber, setDespatchNumber] = useState('');
    const [loadingOrder, setLoadingOrder] = useState(false);
    const [trackingData, setTrackingData] = useState([]);
    const [sortOrder, setSortOrder] = useState('desc');

    // Audit Section
    const [auditActive, setAuditActive] = useState(false);
    const [customerCode, setCustomerCode] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [orderItems, setOrderItems] = useState([]);

    // Scanning
    const [itemCodeInput, setItemCodeInput] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);

    // Quantity Modal
    const [showQtyModal, setShowQtyModal] = useState(false);
    const [scannedItem, setScannedItem] = useState(null);
    const [tempQty, setTempQty] = useState(1);
    const qtyInputRef = useRef(null);

    // Modals & Finalize
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showAssignmentModal, setShowAssignmentModal] = useState(false);
    const [packagesCount, setPackagesCount] = useState('1');
    const [activePackage, setActivePackage] = useState(1);
    const [packageAssignments, setPackageAssignments] = useState({}); // { item_code: { pkg_index: qty } }

    useEffect(() => {
        setTitle("Logix - Chequeo de Picking");
        loadTrackingData();
    }, [setTitle]);


    // -- API Calls --

    const [loadingTracking, setLoadingTracking] = useState(false);

    const loadTrackingData = async () => {
        setLoadingTracking(true);
        try {
            const res = await fetch('/api/picking/tracking', { credentials: 'include' });
            if (res.ok) {
                setTrackingData(await res.json());
                toast.success("Lista actualizada");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error actualizando lista");
        } finally {
            setLoadingTracking(false);
        }
    };

    const handleLoadOrder = async () => {
        if (!orderNumber || !despatchNumber) {
            toast.error("Ingrese Order y Despatch Number");
            return;
        }
        setLoadingOrder(true);
        try {
            const res = await fetch(`/api/picking/order/${orderNumber}/${despatchNumber}`, { credentials: 'include' }); // Matches picking.py endpoint
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    setCustomerCode(data[0]['Customer Code'] || '');
                    setCustomerName(data[0]['Customer Name']);
                    // Map CSV columns to internal state
                    const items = data.map(row => ({
                        code: row['Item Code'],
                        description: row['Item Description'],
                        order_line: row['Order Line'],
                        qty_req: parseInt(row['Qty'] || 0),
                        qty_scan: 0,
                        difference: 0
                    }));
                    setOrderItems(items);

                    // Initialize assignments for dynamic allocation using unique key (code:order_line)
                    const initialAssignments = {};
                    items.forEach(item => {
                        const itemKey = `${item.code}:${item.order_line || ''}`;
                        initialAssignments[itemKey] = { 1: 0 };
                    });
                    setPackageAssignments(initialAssignments);
                    setPackagesCount('1');
                    setActivePackage(1);

                    setAuditActive(true);
                    toast.success("Pedido cargado");
                } else {
                    toast.error("Pedido vacio o no encontrado");
                }
            } else {
                toast.error("Pedido no encontrado");
            }
        } catch (e) {
            toast.error("Error de conexión");
        } finally {
            setLoadingOrder(false);
        }
    };

    const handleReset = () => {
        setAuditActive(false);
        setOrderItems([]);
        setOrderNumber('');
        setDespatchNumber('');
        setCustomerCode('');
        setCustomerName('');
        setShowAssignmentModal(false);
        setPackageAssignments({});
        setPackagesCount('1');
        setActivePackage(1);
        loadTrackingData();
    };

    const handleAssignmentChange = (itemKey, pkgNum, value) => {
        const val = parseInt(value) || 0;
        setPackageAssignments(prev => {
            const next = {
                ...prev,
                [itemKey]: {
                    ...prev[itemKey],
                    [pkgNum]: val
                }
            };
            
            // Sincronizar qty_scan en orderItems
            const [code, line] = itemKey.split(':');
            const newItems = [...orderItems];
            const itemIdx = newItems.findIndex(i => i.code === code && (i.order_line || '') === line);
            
            if (itemIdx > -1) {
                const totalAssigned = Object.values(next[itemKey]).reduce((a, b) => a + (parseInt(b) || 0), 0);
                newItems[itemIdx].qty_scan = totalAssigned;
                newItems[itemIdx].difference = totalAssigned - newItems[itemIdx].qty_req;
                setOrderItems(newItems);
            }
            
            return next;
        });
    };

    // -- Audit Logic --

    const handleScan = (code) => {
        const cleanCode = code.trim().toUpperCase();
        if (!cleanCode) return;

        // Find item in list
        // Prioridad: Buscar primero una línea que NO esté completa
        let itemIndex = orderItems.findIndex(i => i.code === cleanCode && i.qty_scan < i.qty_req);

        // Si todas están completas (o no encontró), buscar la primera coincidencia general para sumar el exceso
        if (itemIndex === -1) {
            itemIndex = orderItems.findIndex(i => i.code === cleanCode);
        }

        if (itemIndex > -1) {
            const item = orderItems[itemIndex];
            setScannedItem({ ...item, index: itemIndex });
            setTempQty(1); // Default to 1
            setShowQtyModal(true);
            setItemCodeInput('');
            playSuccess();
        } else {
            playError();
            toast.error(`Item NO pertenece al pedido: ${cleanCode}`);
            setItemCodeInput('');
        }
    };

    const confirmQuantity = () => {
        if (!scannedItem) return;

        let qtyToAdd = parseInt(tempQty) || 0;
        const totalAdding = qtyToAdd;
        if (qtyToAdd <= 0) {
            setShowQtyModal(false);
            return;
        }

        const newItems = [...orderItems];
        const packageUpdates = {};

        for (let i = 0; i < newItems.length && qtyToAdd > 0; i++) {
            if (newItems[i].code === scannedItem.code && newItems[i].qty_scan < newItems[i].qty_req) {
                const needed = newItems[i].qty_req - newItems[i].qty_scan;
                const toAdd = Math.min(needed, qtyToAdd);

                newItems[i].qty_scan += toAdd;
                newItems[i].difference = newItems[i].qty_scan - newItems[i].qty_req;
                qtyToAdd -= toAdd;

                const itemKey = `${newItems[i].code}:${newItems[i].order_line || ''}`;
                packageUpdates[itemKey] = (packageUpdates[itemKey] || 0) + toAdd;
            }
        }

        if (qtyToAdd > 0) {
            const targetIndex = scannedItem.index;
            newItems[targetIndex].qty_scan += qtyToAdd;
            newItems[targetIndex].difference = newItems[targetIndex].qty_scan - newItems[targetIndex].qty_req;

            const itemKey = `${newItems[targetIndex].code}:${newItems[targetIndex].order_line || ''}`;
            packageUpdates[itemKey] = (packageUpdates[itemKey] || 0) + qtyToAdd;
        }

        setOrderItems(newItems);

        setPackageAssignments(prev => {
            const next = { ...prev };
            Object.entries(packageUpdates).forEach(([itemKey, qtyAdded]) => {
                const currentItemAssignments = next[itemKey] || {};
                const currentPkgQty = currentItemAssignments[activePackage] || 0;
                next[itemKey] = {
                    ...currentItemAssignments,
                    [activePackage]: currentPkgQty + qtyAdded
                };
            });
            return next;
        });

        setShowQtyModal(false);
        setScannedItem(null);

        const anyOver = newItems.filter(i => i.code === scannedItem.code).some(i => i.qty_scan > i.qty_req);
        if (!anyOver) {
            toast.success(`Leído: ${scannedItem.code} (+${totalAdding})`);
        } else {
            playError();
            toast.warning(`Exceso: ${scannedItem.code} (+${totalAdding})`);
        }
    };

    const handleFinalize = () => {
        const hasDifferences = orderItems.some(i => i.qty_scan !== i.qty_req);
        if (hasDifferences) {
            setShowConfirmModal(true);
        } else {
            setShowAssignmentModal(true);
        }
    };

    const submitAudit = async (statusOverride) => {
        const hasDifferences = orderItems.some(i => i.qty_scan !== i.qty_req);
        const payload = {
            order_number: orderNumber,
            despatch_number: despatchNumber,
            customer_code: customerCode,
            customer_name: customerName,
            status: statusOverride || (hasDifferences ? 'Con Diferencia' : 'Completo'),
            items: orderItems.map(i => ({
                code: i.code,
                description: i.description,
                order_line: i.order_line,
                qty_req: i.qty_req,
                qty_scan: i.qty_scan
            })),
            packages: parseInt(packagesCount || 0),
            packages_assignment: packageAssignments
        };

        try {
            const res = await fetch('/api/save_picking_audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success("Auditoría Finalizada Correctamente");
                handleReset();
                setShowConfirmModal(false);
                setShowAssignmentModal(false);
                setPackagesCount('1');
            } else {
                const err = await res.json();
                toast.error(err.detail || "Error al guardar");
            }
        } catch (e) {
            toast.error("Error de conexión");
        }
    };

    // -- Render --

    if (auditActive) {
        return (
            <div className="container-wrapper max-w-5xl mx-auto px-4 py-4">
                <ToastContainer position="top-right" autoClose={2000} />
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                    <div className="flex justify-between items-start mb-6 border-b pb-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Auditoría en Curso</h1>
                            <p className="text-gray-600">Orden: <span className="font-mono font-bold text-black">{orderNumber} / {despatchNumber}</span></p>
                            <p className="text-gray-600">Cliente: <span className="font-bold text-black">{customerCode} - {customerName}</span></p>
                        </div>
                        <button onClick={handleReset} className="btn-sap btn-secondary text-xs">Cancelar / Salir</button>
                    </div>

                    {/* Active Package Selector Compact */}
                    <div className="mb-4 p-2 px-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-3">
                        <span className="text-[10px] uppercase font-bold text-slate-500 whitespace-nowrap">Bulto Activo:</span>
                        <div className="flex gap-1.5 flex-wrap">
                            {Array.from({ length: parseInt(packagesCount) || 1 }).map((_, i) => (
                                <button
                                    key={i + 1}
                                    onClick={() => setActivePackage(i + 1)}
                                    className={`w-8 h-8 rounded-full font-bold text-xs transition-all ${activePackage === i + 1
                                        ? 'bg-[#285f94] text-white shadow-sm'
                                        : 'bg-white text-slate-600 border border-slate-300 hover:border-[#285f94]'}`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                            
                            <div className="flex gap-1">
                                {(parseInt(packagesCount) || 1) > 1 && (
                                    <button
                                        onClick={() => {
                                            const currentTotal = parseInt(packagesCount);
                                            // Verificar si el último bulto tiene algo asignado
                                            let hasAssignments = false;
                                            Object.values(packageAssignments).forEach(itemPkgs => {
                                                if (itemPkgs[currentTotal] > 0) hasAssignments = true;
                                            });

                                            if (hasAssignments) {
                                                toast.warning("El último bulto no está vacío");
                                                return;
                                            }

                                            const newCount = currentTotal - 1;
                                            setPackagesCount(newCount.toString());
                                            if (activePackage > newCount) setActivePackage(newCount);
                                        }}
                                        className="w-8 h-8 rounded-full border border-red-200 bg-red-50 text-red-500 font-bold text-xs hover:bg-red-500 hover:text-white flex items-center justify-center transition-all"
                                        title="Eliminar Último Bulto"
                                    >
                                        −
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        const newCount = (parseInt(packagesCount) || 1) + 1;
                                        setPackagesCount(newCount.toString());
                                        setActivePackage(newCount);
                                        setPackageAssignments(prev => {
                                            const updated = { ...prev };
                                            Object.keys(updated).forEach(key => {
                                                updated[key] = { ...updated[key], [newCount]: 0 };
                                            });
                                            return updated;
                                        });
                                    }}
                                    className="w-8 h-8 rounded-full border border-[#285f94] bg-white text-[#285f94] font-bold text-xs hover:bg-[#285f94] hover:text-white flex items-center justify-center transition-all"
                                    title="Añadir Bulto"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                        <div className="hidden sm:block flex-grow text-[11px] text-slate-500 italic">
                            Asignando al <strong>Bulto {activePackage}</strong>.
                        </div>
                    </div>

                    {/* Scan Input */}
                    <div className="mb-6 flex gap-2">
                        <div className="flex-grow">
                            <label className="form-label">Item Code (Scan)</label>
                            <input
                                type="text"
                                value={itemCodeInput}
                                onChange={e => setItemCodeInput(e.target.value.toUpperCase())}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleScan(itemCodeInput);
                                    }
                                }}
                                className="w-full uppercase"
                                placeholder="Escanear o escribir..."
                                autoFocus
                            />
                        </div>
                        <div className="flex items-end gap-2">
                            <button
                                onClick={() => setScannerOpen(true)}
                                className="btn-sap btn-secondary h-[38px] px-3"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" /><path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" /><path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" /><path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" /><path d="M12 9h2V8h-2z" /></svg>
                            </button>
                            <button onClick={() => handleScan(itemCodeInput)} className="btn-sap btn-secondary h-[38px]">Buscar</button>
                        </div>
                    </div>

                    {/* Table */}
                    {/* Desktop Table View */}
                    <div className="hidden sm:block overflow-x-auto border border-gray-300 rounded mb-6">
                        <table className="w-full text-left sap-table">
                            <thead>
                                <tr>
                                    <th className="text-center w-12">Línea</th>
                                    <th>Item</th>
                                    <th>Descripción</th>
                                    <th className="text-center w-16">Req</th>
                                    <th className="text-center w-16">Scan</th>
                                    <th className="text-center w-16">Dif</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orderItems.map((item, idx) => {
                                    const diff = item.qty_scan - item.qty_req;
                                    const isComplete = item.qty_scan === item.qty_req;
                                    const isOver = item.qty_scan > item.qty_req;

                                    return (
                                        <tr key={idx} className={isComplete ? 'bg-green-50' : isOver ? 'bg-red-50' : ''}>
                                            <td className="text-center font-mono text-xs">{item.order_line}</td>
                                            <td className="font-medium">
                                                {item.code}
                                                <div className="text-[10px] text-slate-500 flex gap-1 flex-wrap mt-1">
                                                    {Object.entries(packageAssignments[`${item.code}:${item.order_line || ''}`] || {})
                                                        .filter(([_, qty]) => qty > 0)
                                                        .map(([pkg, qty]) => (
                                                            <span key={pkg} className="bg-slate-100 px-1 rounded border">B{pkg}: {qty}</span>
                                                        ))
                                                    }
                                                </div>
                                            </td>
                                            <td className="text-sm truncate max-w-[200px]">{item.description}</td>
                                            <td className="text-center">{item.qty_req}</td>
                                            <td className="text-center font-bold">{item.qty_scan}</td>
                                            <td className={`text-center font-bold ${diff !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                {diff > 0 ? `+${diff}` : diff}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="block sm:hidden space-y-3 mb-6">
                        {orderItems.map((item, idx) => {
                            const diff = item.qty_scan - item.qty_req;
                            const isComplete = item.qty_scan === item.qty_req;
                            const isOver = item.qty_scan > item.qty_req;

                            return (
                                <div key={idx} className={`p-4 rounded-lg shadow-sm border ${isComplete ? 'bg-green-50 border-green-200' : isOver ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                                    {/* Header */}
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-lg text-gray-800">{item.code}</span>
                                            <span className="text-[10px] font-mono text-gray-500">LÍNEA {item.order_line}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 text-xs font-bold rounded ${diff === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {diff > 0 ? `+${diff}` : diff !== 0 ? diff : 'OK'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mb-2 truncate">{item.description}</p>

                                    {/* Package Breakdown Mobile */}
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {Object.entries(packageAssignments[`${item.code}:${item.order_line || ''}`] || {})
                                            .filter(([_, qty]) => qty > 0)
                                            .map(([pkg, qty]) => (
                                                <span key={pkg} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 shadow-sm">
                                                    B{pkg}: <span className="font-bold text-slate-800">{qty}</span>
                                                </span>
                                            ))
                                        }
                                    </div>

                                    {/* Grid */}
                                    <div className="grid grid-cols-2 gap-4 text-sm bg-white/50 p-2 rounded">
                                        <div className="flex flex-col border-r border-gray-200">
                                            <span className="text-gray-500 text-[10px] uppercase tracking-wider">Requerido</span>
                                            <span className="font-mono font-medium text-lg">{item.qty_req}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-gray-500 text-[10px] uppercase tracking-wider">Escaneado</span>
                                            <span className={`font-bold text-xl ${diff !== 0 ? 'text-[#285f94]' : 'text-green-600'}`}>{item.qty_scan}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <button onClick={handleFinalize} className="btn-sap btn-primary w-full py-3 text-lg">
                        Finalizar Auditoría
                    </button>
                </div>

                {/* Modals */}
                {/* Scanner Modal */}
                {scannerOpen && (
                    <ScannerModal
                        title="Escanear Código"
                        onScan={(code) => {
                            setScannerOpen(false);
                            handleScan(code);
                        }}
                        onClose={() => setScannerOpen(false)}
                    />
                )}

                {/* Quantity Modal */}
                {showQtyModal && scannedItem && (
                    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                        <div className="bg-white p-6 rounded-lg shadow-2xl max-w-sm w-full border-t-4 border-[#285f94]">
                            <h3 className="text-xl font-bold text-gray-800 mb-1">{scannedItem.code}</h3>
                            <p className="text-sm text-gray-500 mb-4 truncate">{scannedItem.description}</p>

                            <div className="bg-blue-50 p-3 rounded mb-4 flex justify-between text-sm">
                                <div>
                                    <span className="block text-gray-500 text-[10px] uppercase">Línea</span>
                                    <span className="font-bold text-lg">{scannedItem.order_line}</span>
                                </div>
                                <div>
                                    <span className="block text-gray-500 text-[10px] uppercase">Requerido</span>
                                    <span className="font-bold text-lg">{scannedItem.qty_req}</span>
                                </div>
                                <div className="text-right">
                                    <span className="block text-gray-500 text-[10px] uppercase">Auditado</span>
                                    <span className="font-bold text-lg text-[#285f94]">{scannedItem.qty_scan}</span>
                                </div>
                            </div>

                            <label className="form-label text-center block mb-2 font-bold">CANTIDAD A SUMAR</label>
                            <input
                                type="number"
                                value={tempQty}
                                onChange={e => setTempQty(e.target.value)}
                                className="text-center text-3xl font-bold w-full p-4 border-2 border-[#285f94] rounded mb-6"
                                autoFocus
                                onFocus={(e) => e.target.select()}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') confirmQuantity();
                                    if (e.key === 'Escape') setShowQtyModal(false);
                                }}
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setShowQtyModal(false)}
                                    className="px-4 py-3 border border-gray-300 rounded text-gray-600 font-bold hover:bg-gray-100"
                                >
                                    CANCELAR
                                </button>
                                <button
                                    onClick={confirmQuantity}
                                    className="px-4 py-3 bg-[#285f94] text-white rounded font-bold hover:bg-[#1e4a74] shadow-md"
                                >
                                    CONFIRMAR
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Confirmation Modal */}
                {showConfirmModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                            <h3 className="text-lg font-bold text-yellow-600 mb-2">Diferencias Detectadas</h3>
                            <p className="mb-4 text-gray-700">Hay ítems con diferencias. ¿Desea finalizar con errores?</p>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setShowConfirmModal(false)} className="btn-sap btn-secondary">Cancelar</button>
                                <button onClick={() => { setShowConfirmModal(false); setShowAssignmentModal(true); }} className="btn-sap btn-primary bg-yellow-500 border-yellow-600">Sí, Continuar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Assignment Modal */}
                {showAssignmentModal && (
                    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                        <div className="bg-white p-6 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                            <h3 className="text-lg font-bold mb-4">Distribuir Ítems en Bultos</h3>

                            {/* Desktop View */}
                            <div className="hidden sm:block overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="p-2 text-left border w-16">Línea</th>
                                            <th className="p-2 text-left border">Item</th>
                                            <th className="p-2 text-center border w-24">Total Scan</th>
                                            {Array.from({ length: parseInt(packagesCount) || 1 }).map((_, i) => (
                                                <th key={i} className="p-2 text-center border w-20">Bulto {i + 1}</th>
                                            ))}
                                            <th className="p-2 text-center border w-24">Asignado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orderItems.map((item, idx) => {
                                            const itemKey = `${item.code}:${item.order_line || ''}`;
                                            const assignments = packageAssignments[itemKey] || {};
                                            const totalAssigned = Object.values(assignments).reduce((a, b) => a + b, 0);
                                            const isMatch = totalAssigned === item.qty_scan;

                                            // Only show items that have been scanned
                                            if (item.qty_scan === 0) return null;

                                            return (
                                                <tr key={idx} className="border-b hover:bg-gray-50">
                                                    <td className="p-2 border text-center font-mono text-xs">{item.order_line}</td>
                                                    <td className="p-2 border font-medium">
                                                        {item.code}
                                                        <div className="text-xs text-gray-500 truncate max-w-xs">{item.description}</div>
                                                    </td>
                                                    <td className="p-2 text-center border font-bold">{item.qty_scan}</td>
                                                    {Array.from({ length: parseInt(packagesCount) || 1 }).map((_, i) => (
                                                        <td key={i} className="p-1 border text-center">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                className="w-16 text-center border rounded p-1"
                                                                value={assignments[i + 1] || 0}
                                                                onChange={(e) => handleAssignmentChange(itemKey, i + 1, e.target.value)}
                                                                onFocus={(e) => e.target.select()}
                                                            />
                                                        </td>
                                                    ))}
                                                    <td className={`p-2 text-center border font-bold ${isMatch ? 'text-green-600' : 'text-red-600'}`}>
                                                        {totalAssigned}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile View */}
                            <div className="block sm:hidden space-y-4">
                                {orderItems.map((item, idx) => {
                                    if (item.qty_scan === 0) return null;

                                    const itemKey = `${item.code}:${item.order_line || ''}`;
                                    const assignments = packageAssignments[itemKey] || {};
                                    const totalAssigned = Object.values(assignments).reduce((a, b) => a + b, 0);
                                    const isMatch = totalAssigned === item.qty_scan;
                                    const pkgCount = parseInt(packagesCount) || 1;

                                    return (
                                        <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <div className="font-bold text-gray-800">{item.code}</div>
                                                    <div className="text-xs text-gray-500 truncate">{item.description}</div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] font-mono text-gray-400">LÍNEA {item.order_line}</span>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center mb-3 text-sm">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase text-gray-500">Escaneado</span>
                                                    <span className="font-bold text-lg">{item.qty_scan}</span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] uppercase text-gray-500">Asignado</span>
                                                    <span className={`font-bold text-lg ${isMatch ? 'text-green-600' : 'text-red-600'}`}>
                                                        {totalAssigned}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                {Array.from({ length: pkgCount }).map((_, i) => (
                                                    <div key={i} className="flex flex-col">
                                                        <label className="text-[10px] uppercase text-gray-500 mb-1">Bulto {i + 1}</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            className="w-full text-center border rounded p-2 text-lg font-bold bg-white focus:ring-2 focus:ring-[#285f94]"
                                                            value={assignments[i + 1] || 0}
                                                            onChange={(e) => handleAssignmentChange(itemKey, i + 1, e.target.value)}
                                                            onFocus={(e) => e.target.select()}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex justify-end gap-2 mt-6">
                                <button onClick={() => setShowAssignmentModal(false)} className="btn-sap btn-secondary">Atrás</button>
                                <button onClick={() => submitAudit()} className="btn-sap btn-success bg-green-600 border-green-700 text-white">
                                    Guardar y Finalizar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Load Order View
    return (
        <div className="container-wrapper max-w-3xl mx-auto px-4 py-8">
            <ToastContainer position="top-right" autoClose={3000} />

            <div className="bg-white p-8 rounded-lg shadow-xl border border-gray-200">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">Cargar Pedido Picking</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="form-label">Order Number</label>
                        <input
                            type="text"
                            value={orderNumber}
                            onChange={e => setOrderNumber(e.target.value)}
                            placeholder="Ej: 0043785"
                        />
                    </div>
                    <div>
                        <label className="form-label">Despatch Number</label>
                        <input
                            type="text"
                            value={despatchNumber}
                            onChange={e => setDespatchNumber(e.target.value)}
                            placeholder="Ej: 00"
                        />
                    </div>
                </div>

                <button
                    onClick={handleLoadOrder}
                    disabled={loadingOrder}
                    className="btn-sap btn-primary w-full py-3 mb-8 text-base shadow-sm"
                >
                    {loadingOrder ? 'Cargando...' : 'Comenzar Auditoría'}
                </button>

                {/* Tracking Table */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-semibold text-gray-700">Pedidos Recientes</h3>
                        <button
                            onClick={loadTrackingData}
                            disabled={loadingTracking}
                            className={`text-sm ${loadingTracking ? 'text-gray-400 cursor-not-allowed' : 'text-[#285f94] hover:underline'}`}
                        >
                            {loadingTracking ? 'Actualizando...' : 'Actualizar'}
                        </button>
                    </div>
                    {/* Desktop View */}
                    <div className="hidden sm:block border border-gray-200 rounded overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-sm sap-table">
                            <thead className="sticky top-0 z-10 bg-slate-700 text-white shadow-sm">
                                <tr>
                                    <th className="py-2.5 px-3 font-semibold">Order</th>
                                    <th className="py-2.5 px-3 font-semibold">Despatch</th>
                                    <th className="py-2.5 px-3 font-semibold">Cód. Cliente</th>
                                    <th className="py-2.5 px-3 font-semibold">Cliente</th>
                                    <th className="py-2.5 px-3 font-semibold text-center">Líneas</th>
                                    <th
                                        className="py-2.5 px-3 font-semibold cursor-pointer hover:bg-slate-600 select-none flex items-center gap-1"
                                        onClick={() => {
                                            setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
                                        }}
                                        title="Ordenar por fecha"
                                    >
                                        Fecha
                                        <span className="text-xs">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {trackingData.length === 0 ? (
                                    <tr><td colSpan="5" className="text-center p-4 text-gray-500">No hay pedidos recientes</td></tr>
                                ) : (
                                    [...trackingData]
                                        .sort((a, b) => {
                                            const dateA = new Date(a.print_date);
                                            const dateB = new Date(b.print_date);
                                            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
                                        })
                                        .map((t, idx) => (
                                            <tr key={idx}
                                                className={`cursor-pointer ${t.is_audited ? 'bg-slate-100 opacity-75' : 'hover:bg-blue-50'}`}
                                                onClick={() => {
                                                    setOrderNumber(t.order_number);
                                                    setDespatchNumber(t.despatch_number);
                                                }}
                                            >
                                                <td className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        {t.order_number}
                                                        {t.is_audited && <span className="text-[10px] bg-slate-400 text-white px-1 rounded">AUDITADO</span>}
                                                    </div>
                                                </td>
                                                <td>{t.despatch_number}</td>
                                                <td>{t.customer_code}</td>
                                                <td className="truncate max-w-[150px]">{t.customer_name}</td>
                                                <td className="text-center font-bold text-[#285f94]">{t.total_lines}</td>
                                                <td className="text-gray-500 text-xs">{t.print_date}</td>
                                            </tr>
                                        ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="block sm:hidden space-y-2 max-h-60 overflow-y-auto">
                        {trackingData.length === 0 ? (
                            <div className="text-center p-4 text-gray-500 bg-gray-50 rounded">No hay pedidos recientes</div>
                        ) : (
                            trackingData.map((t, idx) => (
                                <div key={idx}
                                    className={`${t.is_audited ? 'bg-slate-100 border-slate-200 opacity-80' : 'bg-blue-50 border-blue-100'} p-3 rounded border cursor-pointer active:bg-blue-100`}
                                    onClick={() => {
                                        setOrderNumber(t.order_number);
                                        setDespatchNumber(t.despatch_number);
                                    }}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold ${t.is_audited ? 'text-slate-600' : 'text-[#1e4a74]'} text-lg`}>{t.order_number}</span>
                                            <span className="text-xs font-mono text-gray-500 bg-white px-1.5 rounded border">{t.despatch_number}</span>
                                            {t.is_audited && <span className="text-[10px] bg-slate-400 text-white px-1 rounded uppercase">Auditado</span>}
                                        </div>
                                        <span className={`${t.is_audited ? 'bg-slate-500' : 'bg-[#285f94]'} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>{t.total_lines} líneas</span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">Cliente:</span>
                                        <span className="text-xs font-bold text-gray-700">{t.customer_code}</span>
                                    </div>
                                    <div className="text-sm text-gray-800 font-medium mb-2 truncate">{t.customer_name}</div>
                                    <div className="text-right text-xs text-gray-400">
                                        {t.print_date}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PickingAudit;