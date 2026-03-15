import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import QRCode from 'qrcode';
import ScannerModal from '../components/ScannerModal';
import '../styles/Label.css';

const Inbound = () => {
    const { setTitle } = useOutletContext();
    useEffect(() => { setTitle("Logix - Inbound"); }, [setTitle]);
    // ... (rest of states)
    // --- Estados del Formulario ---
    const [importRef, setImportRef] = useState('');
    const [waybill, setWaybill] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [quantity, setQuantity] = useState('');
    const [relocatedBin, setRelocatedBin] = useState('');

    // --- Estados de Datos ---
    const [itemData, setItemData] = useState(null);
    const [logs, setLogs] = useState([]);
    const [versions, setVersions] = useState([]);
    const [currentVersion, setCurrentVersion] = useState('');

    // --- Estados de UI ---
    const [loading, setLoading] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [qrImage, setQrImage] = useState(null);
    const [editId, setEditId] = useState(null); // ID si estamos editando

    // --- Refs ---
    const quantityRef = useRef(null);
    const itemCodeRef = useRef(null);
    const printFrameRef = useRef(null);

    // Carga inicial
    useEffect(() => {
        loadLogs();
        loadVersions();
    }, []);

    // Generar QR para la etiqueta cuando cambia el item
    useEffect(() => {
        if (itemData?.itemCode) {
            QRCode.toDataURL(itemData.itemCode, { width: 96, margin: 1 })
                .then(url => setQrImage(url))
                .catch(err => console.error(err));
        } else {
            setQrImage(null);
        }
    }, [itemData]);

    // --- Funciones API ---

    const loadLogs = async (version = '') => {
        setCurrentVersion(version);
        try {
            const url = version
                ? `/api/get_logs?version_date=${version}`
                : `/api/get_logs`;
            const res = await fetch(url, { credentials: 'include' });
            if (res.ok) {
                setLogs(await res.json());
            } else {
                console.error("Failed to load logs:", res.status, res.statusText);
                if (res.status === 401) window.location.href = '/login';
            }
        } catch (e) { console.error("Error loading logs", e); }
    };

    const loadVersions = async () => {
        try {
            const res = await fetch('/api/inbound/versions', { credentials: 'include' });
            if (res.ok) setVersions(await res.json());
        } catch (e) { console.error(e); }
    };

    const handleLookupReference = async (type, value) => {
        if (!value || editId) return;
        try {
            const params = type === 'waybill' ? `waybill=${encodeURIComponent(value)}` : `import_ref=${encodeURIComponent(value)}`;
            const res = await fetch(`/api/inbound/lookup_reference?${params}`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data.waybill && !waybill) setWaybill(data.waybill);
                if (data.import_ref && !importRef) setImportRef(data.import_ref);
            }
        } catch (e) { console.error("Error lookup", e); }
    };

    const findItem = async () => {
        if (!itemCode || !importRef) {
            alert("Ingrese Import Reference e Item Code");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`/api/find_item/${encodeURIComponent(itemCode)}/${encodeURIComponent(importRef)}`, { credentials: 'include' });
            const data = await res.json();
            if (res.ok) {
                setItemData(data);
                if (!editId) setQuantity('');
                quantityRef.current?.focus();
            } else {
                alert(data.error || "Item no encontrado");
                setItemData(null);
            }
        } catch (e) {
            alert("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveLog = async (e) => {
        e.preventDefault();
        if (!itemData) return alert("Busque un item primero");

        const payload = {
            importReference: importRef.trim().toUpperCase(),
            waybill: waybill.trim().toUpperCase(),
            itemCode: itemData.itemCode,
            quantity: parseInt(quantity),
            relocatedBin: relocatedBin.trim().toUpperCase()
        };

        try {
            let res;
            if (editId) {
                // Endpoint para actualizar
                res = await fetch(`/api/update_log/${editId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        waybill: payload.waybill,
                        qtyReceived: payload.quantity,
                        relocatedBin: payload.relocatedBin
                    })
                });
            } else {
                // Endpoint para crear
                res = await fetch(`/api/add_log`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(payload)
                });
            }

            if (res.ok) {
                loadLogs();
                resetForm();
            } else {
                const err = await res.json();
                alert(err.detail || err.error || "Error al guardar");
            }
        } catch (e) { alert("Error de conexión"); }
    };

    const handleDelete = async (id) => {
        if (!confirm("¿Eliminar registro?")) return;
        try {
            await fetch(`/api/delete_log/${id}`, { method: 'DELETE', credentials: 'include' });
            loadLogs();
        } catch (e) { alert("Error"); }
    };

    const handleArchive = async () => {
        if (!confirm("¿Archivar registros actuales y limpiar base?")) return;
        try {
            await fetch(`/api/inbound/archive`, { method: 'POST', credentials: 'include' });
            loadLogs();
            loadVersions();
        } catch (e) { alert("Error"); }
    };

    // --- Helpers UI ---
    const resetForm = () => {
        setEditId(null);
        setItemCode('');
        setQuantity('');
        setRelocatedBin('');
        setItemData(null);
        // Mantener Import Ref y Waybill por comodidad (UX legacy)
        // Focus en itemCode para entrada rápida de datos
        setTimeout(() => itemCodeRef.current?.focus(), 300);
    };

    const startEdit = (log) => {
        setEditId(log.id);
        setImportRef(log.importReference ? log.importReference.trim() : '');
        setWaybill(log.waybill ? log.waybill.trim() : '');
        setItemCode(log.itemCode);
        setQuantity(log.qtyReceived);
        setRelocatedBin(log.relocatedBin ? log.relocatedBin.trim() : '');
        // Buscar datos del item para llenar la UI
        fetch(`/api/find_item/${encodeURIComponent(log.itemCode)}/${encodeURIComponent(log.importReference)}`)
            .then(r => r.json())
            .then(data => setItemData(data));
    };

    // Escáner
    // Escáner
    const handleScan = (code) => {
        const upperCode = code.toUpperCase();
        setItemCode(upperCode);
        setScannerOpen(false);
        setTimeout(() => checkAndFind(upperCode), 200);
    };

    // Helper wrapper to ensure state is fresh or passed directly
    const checkAndFind = (code) => {
        if (!code || !importRef) return; // Silent return if missing deps
        // Logic duplicated from findItem but accepts code arg
        setLoading(true);
        fetch(`/api/find_item/${encodeURIComponent(code)}/${encodeURIComponent(importRef)}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                    setItemData(null);
                } else {
                    setItemData(data);
                    if (!editId) setQuantity('');
                    quantityRef.current?.focus();
                }
            })
            .catch(() => alert("Error de conexión"))
            .finally(() => setLoading(false));
    };

    // Cálculos para Inbound Ciego
    const itemLogs = logs.filter(l => l.itemCode === itemData?.itemCode);
    const cumulativeQty = itemLogs.reduce((acc, curr) => acc + curr.qtyReceived, 0);
    const auditCount = itemLogs.length;
    const displayQty = (cumulativeQty + parseInt(quantity || 0));

    const totalWeight = itemData ? (parseFloat(itemData.weight || 0) * parseInt(quantity || 1)).toFixed(2) : 'N/A';

    const handlePrint = () => {
        const frame = printFrameRef.current;
        if (!frame) {
            alert("Error: No se encontró el marco de impresión.");
            return;
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Etiqueta ${itemData ? itemData.itemCode : ''}</title>
                <style>
                    @page { size: 70mm 100mm; margin: 0; }
                    html, body { 
                        width: 70mm; height: 100mm; margin: 0; padding: 0; 
                        overflow: hidden; background: white; 
                        font-family: Arial, sans-serif; 
                    }
                    .label-container {
                        width: 70mm; height: 100mm; 
                        box-sizing: border-box;
                        padding: 3.5mm; 
                        position: relative;
                        background: white;
                    }
                    .label-logo { 
                        height: 7mm; 
                        display: block; 
                        margin-bottom: 3.5mm; 
                    }
                    
                    /* Header */
                    .label-item-code {
                        font-size: 12pt; font-weight: bold; margin-bottom: 0;
                        line-height: 1.2; color: #000;
                    }
                    .label-item-description {
                        font-size: 12pt; font-weight: bold; margin-bottom: 18mm;
                        line-height: 1.2; color: #000;
                    }

                    /* Data Table */
                    .label-data-table {
                        font-size: 9pt;
                        line-height: 1.4;
                        margin-bottom: 9mm;
                    }
                    .label-row {
                        display: grid;
                        grid-template-columns: 28mm 1fr;
                        /* gap: 2mm; */
                    }
                    .label-label {
                         font-weight: normal; color: #000;
                    }
                    .label-value {
                         font-weight: normal; color: #000;
                    }
                    
                    /* Footer */
                    .label-footer { 
                        position: absolute; 
                        bottom: 3.5mm; 
                        left: 3.5mm; 
                        right: 3.5mm;
                        display: flex; 
                        align-items: flex-end; 
                        justify-content: space-between; 
                    }
                    
                    .label-disclaimer { 
                        font-size: 7pt; 
                        color: #000; 
                        max-width: 40mm; 
                        line-height: 1.1; 
                        margin: 0; 
                    }
                    
                    #qrCodeContainer { 
                        width: 25mm; 
                        height: 25mm; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                    }
                    #qrCodeContainer img { width: 100%; height: 100%; object-fit: contain; }
                </style>
            </head>
            <body>
                <div class="label-container">
                    <!-- Logo -->
                    <img src="/static/images/logotype_sandvik.png" alt="Sandvik" class="label-logo" />
                    
                    <!-- Header -->
                    <div class="label-item-code">${itemData?.itemCode || 'CODE'}</div>
                    <div class="label-item-description">${itemData?.description || 'Description'}</div>

                    <!-- Data Grid -->
                    <div class="label-data-table">
                        <div class="label-row">
                            <div class="label-label">Quantity/pack</div>
                            <div class="label-value">${quantity || 1} EA</div>
                        </div>
                        <div class="label-row">
                            <div class="label-label">Product weight</div>
                            <div class="label-value">${totalWeight} kg</div>
                        </div>
                        <div class="label-row">
                            <div class="label-label">Packaging date</div>
                            <div class="label-value">${new Date().toLocaleDateString('es-CO', { year: '2-digit', month: '2-digit', day: '2-digit' })}</div>
                        </div>
                        <div class="label-row">
                            <div class="label-label">Bin location</div>
                            <div class="label-value">${relocatedBin || itemData?.binLocation || 'BIN'}</div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="label-footer">
                        <div style="display:flex; flex-direction:column; justify-content:flex-end; height: 25mm;">
                             <p class="label-disclaimer">All trademarks and logotypes appearing on this label are owned by Sandvik Group</p>
                        </div>
                     
                        <div id="qrCodeContainer">
                            ${qrImage ? `<img src="${qrImage}" />` : ''}
                        </div>
                    </div>
                </div>
                <script>
                    window.onload = function() { setTimeout(function(){ window.print(); }, 200); }
                </script>
            </body>
            </html>
        `;

        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(htmlContent);
        doc.close();
    };

    return (
        <>
            <div className="container-wrapper px-4 py-4">
                <form onSubmit={handleSaveLog}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4">

                        {/* COLUMNA IZQUIERDA: FORMULARIO */}
                        <div className="lg:col-span-2 bg-white p-4 rounded shadow border border-gray-200">
                            {/* Header Form */}
                            <div className="bg-gray-50 text-gray-900 px-4 py-3 -mx-4 -mt-4 mb-4 rounded-t border-b border-gray-200">
                                <h1 className="text-base font-semibold tracking-tight">Inbound - Recepción</h1>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
                                <div>
                                    <label className="form-label">Import Reference</label>
                                    <input type="text" value={importRef} 
                                        onChange={e => setImportRef(e.target.value.toUpperCase())} 
                                        onBlur={e => handleLookupReference('import_ref', e.target.value)}
                                        placeholder="I.R." required disabled={!!editId} />
                                </div>
                                <div>
                                    <label className="form-label">Waybill</label>
                                    <input type="text" value={waybill} 
                                        onChange={e => setWaybill(e.target.value.toUpperCase())} 
                                        onBlur={e => handleLookupReference('waybill', e.target.value)}
                                        placeholder="W.B." required />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="form-label">Item Code</label>
                                    <div className="flex gap-2">
                                        <input type="text" ref={itemCodeRef} value={itemCode} onChange={e => setItemCode(e.target.value.toUpperCase())}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), findItem())}
                                            placeholder="Escanear o Escribir" required disabled={!!editId} />
                                        {!editId && (
                                            <>
                                                <button type="button" className="btn-sap btn-secondary" onClick={() => setScannerOpen(true)} title="Escanear">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5M.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5M4 4h1v1H4z" /><path d="M7 2H2v5h5zM3 3h3v3H3zm2 8H4v1h1z" /><path d="M7 9H2v5h5zm-4 1h3v3H3zm8-6h1v1h-1z" /><path d="M9 2h5v5H9zm1 1v3h3V3zM8 8v2h1v1H8v1h2v-2h1v2h1v-1h2v-1h-3V8zm2 2H9V9h1zm4 2h-1v1h-2v1h3zm-4 2v-1H8v1z" /><path d="M12 9h2V8h-2z" /></svg>
                                                </button>
                                                <button type="button" className="btn-sap btn-secondary" onClick={findItem} disabled={loading}>
                                                    {loading ? '...' : '🔍'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="form-label">Item Description</label>
                                <div className="data-field">{itemData?.description || ''}</div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                                <div>
                                    <label className="form-label">Qty Received</label>
                                    <input type="number" ref={quantityRef} value={quantity} onChange={e => setQuantity(e.target.value)} required min="1" />
                                </div>
                                <div>
                                    <label className="form-label">Bin (Original)</label>
                                    <div className="data-field">{itemData?.binLocation || ''}</div>
                                </div>
                                <div>
                                    <label className="form-label">Relocate (New)</label>
                                    <input type="text" value={relocatedBin} onChange={e => setRelocatedBin(e.target.value.toUpperCase())} placeholder="(Opcional)" />
                                </div>
                                <div>
                                    <label className="form-label">Aditional Bins</label>
                                    <div className="data-field text-xs">{itemData?.aditionalBins || ''}</div>
                                </div>
                                <div>
                                    <label className="form-label">ABC Type</label>
                                    <div className="data-field">{itemData?.itemType || ''}</div>
                                </div>
                                <div>
                                    <label className="form-label">SIC Code</label>
                                    <div className="data-field">{itemData?.sicCode || ''}</div>
                                </div>
                            </div>

                            {/* Resumen Cantidades (Proceso Ciego) */}
                            <div className="bg-gray-50 p-4 border border-gray-300 rounded mb-4">
                                <h3 className="text-xs font-bold uppercase text-gray-700 border-b-2 border-blue-600 pb-1 mb-3">Resumen de Cantidades</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="form-label">Qty Received (Total)</label>
                                        <div className="data-field font-bold text-blue-700">{displayQty}</div>
                                    </div>
                                    <div>
                                        <label className="form-label">Contado</label>
                                        <div className="data-field font-bold text-gray-700">
                                            {auditCount} {auditCount === 1 ? 'vez' : 'veces'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button type="submit" className="btn-sap btn-primary w-60 h-10">
                                    {editId ? 'Guardar Cambios' : 'Añadir Registro'}
                                </button>
                                {editId && (
                                    <button type="button" onClick={resetForm} className="btn-sap btn-secondary w-60 h-10">
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* COLUMNA DERECHA: ETIQUETA (PREVIEW & PRINT) */}
                        <div className="lg:col-span-1">
                            <h2 className="text-lg font-semibold text-center mb-3">Vista Etiqueta</h2>

                            {/* Área de Impresión (clase label-print-area activada por CSS print) */}
                            {/* Área de Impresión (clase label-print-area activada por CSS print) */}
                            <div className="flex justify-center">
                                <div style={{
                                    width: '70mm',
                                    height: '100mm',
                                    padding: '3.5mm',
                                    boxSizing: 'border-box',
                                    background: 'white',
                                    border: '1px solid #ccc',
                                    position: 'relative',
                                    fontFamily: 'Arial, sans-serif',
                                    overflow: 'hidden'
                                }}>
                                    {/* Logo */}
                                    <img src="/static/images/logotype_sandvik.png" alt="Sandvik" style={{ height: '7mm', display: 'block', marginBottom: '3.5mm' }} />

                                    {/* Header */}
                                    <div style={{ fontSize: '12pt', fontWeight: 'bold', lineHeight: 1.2 }}>{itemData?.itemCode || 'ITEM CODE'}</div>
                                    <div style={{ fontSize: '12pt', fontWeight: 'bold', lineHeight: 1.2, marginBottom: '18mm' }}>{itemData?.description || 'Description'}</div>

                                    {/* Data Table */}
                                    <div style={{ fontSize: '9pt', lineHeight: 1.4, marginBottom: '9mm' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                            <div>Quantity/pack</div>
                                            <div>{quantity || 1} EA</div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                            <div>Product weight</div>
                                            <div>{totalWeight} kg</div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                            <div>Packaging date</div>
                                            <div>{new Date().toLocaleDateString('es-CO', { year: '2-digit', month: '2-digit', day: '2-digit' })}</div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '28mm 1fr' }}>
                                            <div>Bin location</div>
                                            <div>{relocatedBin || itemData?.binLocation || 'BIN'}</div>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div style={{ position: 'absolute', bottom: '3.5mm', left: '3.5mm', right: '3.5mm', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '25mm' }}>
                                            <p style={{ fontSize: '7pt', margin: 0, maxWidth: '40mm', lineHeight: 1.1, color: '#000' }}>
                                                All trademarks and logotypes appearing on this label are owned by Sandvik Group
                                            </p>
                                        </div>
                                        <div style={{ width: '25mm', height: '25mm' }}>
                                            {qrImage ? <img src={qrImage} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div className="border border-gray-200 w-full h-full"></div>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="w-full flex justify-center mt-4">
                                <button type="button" onClick={handlePrint} className="btn-sap btn-primary btn-print-label h-10" disabled={!itemData}>
                                    Imprimir Etiqueta
                                </button>
                            </div>
                        </div>
                    </div>
                </form>

                {/* TABLA DE REGISTROS */}
                <div className="bg-white border border-gray-300 rounded shadow-sm overflow-hidden">
                    <div className="bg-gray-50 text-gray-900 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                        <h2 className="text-base font-semibold tracking-tight">Registros de Inbound</h2>
                        <div className="flex gap-2 items-center">
                            <button onClick={() => window.location.href = '/update'} className="h-8 px-4 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-all duration-150 flex items-center justify-center">
                                Act. Archivos
                            </button>
                            <button onClick={() => window.location.href = currentVersion ? `/api/inbound/export?version=${currentVersion}` : '/api/inbound/export'} className="h-8 px-4 text-xs font-medium bg-emerald-600 text-white border border-emerald-700 rounded-md shadow-sm hover:bg-emerald-700 transition-all duration-150 flex items-center justify-center gap-1.5">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.586l2.914 2.914a1 1 0 01.586 1.414V19a2 2 0 01-2 2z" /></svg>
                                Exportar
                            </button>
                            <select onChange={(e) => loadLogs(e.target.value)} className="h-8 w-44 px-3 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 cursor-pointer">
                                <option value="">-- Versión Actual --</option>
                                {versions.map(v => (
                                    <option key={v} value={v}>Archivado: {new Date(v).toLocaleString()}</option>
                                ))}
                            </select>
                            <button onClick={handleArchive} className="h-8 px-4 text-xs font-medium bg-red-600 text-white border border-red-700 rounded-md shadow-sm hover:bg-red-700 transition-all duration-150 flex items-center justify-center">
                                Base Limpia
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead className="bg-slate-700 text-white">
                                <tr>
                                    <th className="px-2 py-1.5 text-left font-medium">Ref</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Waybill</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Item Code</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Descripción</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Bin (Orig)</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Bin (New)</th>
                                    <th className="px-2 py-1.5 text-center font-medium">Qty Rec</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Fecha/Hora</th>
                                    <th className="px-2 py-1.5 text-center font-medium">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {logs.length === 0 ? (
                                    <tr><td colSpan="9" className="text-center py-4 text-gray-500">No hay registros</td></tr>
                                ) : logs.map((log, idx) => (
                                    <tr key={log.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                                        <td className="px-2 py-1.5">{log.importReference}</td>
                                        <td className="px-2 py-1.5">{log.waybill}</td>
                                        <td className="px-2 py-1.5 font-mono">{log.itemCode}</td>
                                        <td className="px-2 py-1.5 max-w-[180px] truncate" title={log.itemDescription}>{log.itemDescription}</td>
                                        <td className="px-2 py-1.5">{log.binLocation}</td>
                                        <td className="px-2 py-1.5">{log.relocatedBin}</td>
                                        <td className="px-2 py-1.5 text-center">{log.qtyReceived}</td>
                                        <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                        <td className="px-2 py-1.5">
                                            <div className="flex gap-1 justify-center">
                                                <button onClick={() => startEdit(log)} className="w-6 h-6 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded flex items-center justify-center transition-colors" title="Editar">✎</button>
                                                <button onClick={() => handleDelete(log.id)} className="w-6 h-6 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded flex items-center justify-center transition-colors" title="Eliminar">🗑</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Hidden Iframe for Printing Labels */}
            <iframe
                ref={printFrameRef}
                title="print-label-frame"
                style={{ position: 'fixed', top: '-1000px', left: '-1000px', width: '1px', height: '1px', border: 'none' }}
            />

            {/* Modal Scanner */}
            {/* Modal Scanner */}
            {scannerOpen && (
                <ScannerModal
                    onScan={handleScan}
                    onClose={() => setScannerOpen(false)}
                />
            )}
        </>
    );
};

export default Inbound;