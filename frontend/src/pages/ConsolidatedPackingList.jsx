import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const ConsolidatedPackingList = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/shipments/${id}/packing_list`, { credentials: 'include' });
                if (!res.ok) throw new Error("Error al cargar datos del envío");
                setData(await res.json());
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();

        // Desactivar estilos SAP Fiori para impresión limpia
        const sapLink = document.querySelector('link[href*="sap_fiori_3"]');
        if (sapLink) sapLink.disabled = true;
        return () => { if (sapLink) sapLink.disabled = false; };
    }, [id]);

    const handlePrint = () => window.print();

    if (loading) return <div className="p-8">Generando Packing List Consolidado...</div>;
    if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
    if (!data) return <div className="p-8">No hay datos.</div>;

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

    // Encabezado del envío reutilizable
    const ShipmentHeader = ({ pageLabel }) => (
        <div className="text-center mb-4 border-b border-black pb-3 print:mb-3">
            <h1 className="text-3xl uppercase tracking-tight mb-1 print:text-2xl text-black">
                Packing List Consolidado
            </h1>
            <div className="text-xs text-gray-500 print:text-black">
                {formatDate(data.created_at)}
                {data.carrier && (
                    <span className="ml-3 border-l border-black pl-3 text-sm">
                        {data.carrier}
                    </span>
                )}
                <span className="ml-3 border-l border-black pl-3 text-sm">
                    {pageLabel}
                </span>
            </div>
            {data.note && (
                <div className="text-[10px] text-gray-500 mt-1 print:text-black">
                    Nota: {data.note}
                </div>
            )}
        </div>
    );

    // Info del pedido individual
    const OrderInfo = ({ order }) => (
        <div className="grid grid-cols-2 gap-4 mb-3 text-sm print:gap-2 print:mb-2">
            <div className="pb-1 border-b border-gray-100">
                <span className="text-gray-500 uppercase text-[9px] print:text-black mr-2">Cliente:</span>
                <span className="text-lg text-black leading-tight">{order.customer_name || 'N/A'}</span>
            </div>
            <div className="text-right pb-1 border-b border-gray-100">
                <span className="text-gray-500 uppercase text-[9px] print:text-black mr-2">Total Bultos:</span>
                <span className="text-xl text-[#285f94] print:text-black">{order.total_packages}</span>
            </div>
            <div className="col-span-2">
                <span className="text-gray-500 uppercase text-[9px] print:text-black mr-2">Pedido / Despacho:</span>
                <span className="text-base text-black">
                    {order.order_number} <span className="mx-1 text-gray-300">/</span> {order.despatch_number}
                </span>
            </div>
        </div>
    );

    // Tabla de un bulto
    const PackageTable = ({ keyName, packageData, hideHeader = false }) => (
        <div className="border border-black overflow-hidden print:border-black mb-2 last:mb-0">
            {!hideHeader && (
                <div className="bg-white text-black px-4 py-1 border-b border-black flex justify-between items-center print:py-0.5">
                    <h3 className="text-sm font-bold uppercase">Bulto #{keyName}</h3>
                    <span className="text-[10px] font-mono border border-black px-1.5 rounded">BOX-{keyName.padStart(3, '0')}</span>
                </div>
            )}
            <table className="min-w-full text-sm">
                <thead className="bg-white text-black border-b border-black">
                    <tr>
                        <th className="px-3 py-0.5 text-left w-12 uppercase text-[9px]">Línea</th>
                        <th className="px-3 py-0.5 text-left w-1/4 uppercase text-[9px]">Código</th>
                        <th className="px-3 py-0.5 text-left w-1/2 uppercase text-[9px]">Descripción</th>
                        <th className="px-3 py-0.5 text-right w-1/4 uppercase text-[9px]">Cant.</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 print:divide-black">
                    {packageData && packageData.length > 0 ? (
                        packageData.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 print:bg-transparent">
                                <td className="px-3 py-0.5 font-mono text-black text-[10px] font-bold">{item.order_line}</td>
                                <td className="px-3 py-0.5 font-mono text-black text-[10px]">{item.item_code}</td>
                                <td className="px-3 py-0.5 text-black text-[10px] truncate max-w-[200px]">{item.description}</td>
                                <td className="px-3 py-0.5 text-right text-[10px] font-bold">{item.quantity}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="3" className="px-3 py-2 text-center text-[10px] text-gray-500 italic">Sin ítems</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    // Calcular total de páginas (1 por pedido)
    const totalPages = data.orders.length;

    return (
        <div className="bg-white min-h-screen text-black p-4 font-sans print:p-0">
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page { margin: 0.5cm; }
                    body { -webkit-print-color-adjust: exact; color: #000 !important; background: #fff !important; }
                    thead, th, tr, td { background-color: transparent !important; background-image: none !important; color: #000 !important; }
                    .no-print, .print-hidden { display: none !important; }
                }
            `}} />

            {/* Barra de control — NO se imprime */}
            <div className="no-print mb-4 sticky top-0 bg-white border-b shadow-sm z-10 print:hidden">
                <div className="max-w-4xl mx-auto flex justify-between items-center p-4">
                    <div>
                        <h1 className="text-lg text-[#285f94]">Packing List Consolidado — Envío #{data.shipment_id}</h1>
                        <p className="text-xs text-gray-500">{data.total_orders} pedido(s) · {data.carrier || 'Sin transportadora'}</p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 transition-colors"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={handlePrint}
                            className="bg-[#285f94] text-white px-4 py-2 rounded hover:bg-[#1e4a74] shadow-md transition-all active:scale-95"
                        >
                            Imprimir Todo
                        </button>
                    </div>
                </div>
            </div>

            {/* Contenido: Diseño compacto sin saltos de página obligatorios */}
            <div className="max-w-4xl mx-auto print:max-w-none print:w-full">
                {data.orders.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                        <h3 className="text-xl text-gray-400 mb-2">Sin Pedidos</h3>
                        <p className="text-gray-500">Este envío no tiene pedidos asociados.</p>
                    </div>
                ) : (
                    <div className="border p-6 bg-white shadow-md rounded-lg print:border-none print:shadow-none print:p-0 print:m-0 print:rounded-none">
                        <ShipmentHeader pageLabel={`CONSOLIDADO DE ${totalPages} PEDIDO(S)`} />

                        {/* Info del Cliente (tomada del primer pedido) */}
                        <div className="flex justify-between items-end mb-4 border-b border-gray-100 pb-1 print:mb-2">
                            <div>
                                <span className="text-gray-500 uppercase text-[9px] print:text-black mr-2">Cliente:</span>
                                <span className="text-lg font-bold text-black uppercase">{data.orders[0]?.customer_name || 'N/A'}</span>
                            </div>
                        </div>

                        {data.orders.map((order, orderIndex) => {
                            const sortedPkgKeys = order.packages
                                ? Object.keys(order.packages).sort((a, b) => parseInt(a) - parseInt(b))
                                : [];

                            return (
                                <div key={order.audit_id} className="mb-4 last:mb-0 print:mb-2 break-inside-avoid">
                                    <div className="mb-1">
                                        <span className="text-gray-500 uppercase text-[8px] print:text-black mr-2">Pedido / Despacho:</span>
                                        <span className="text-base font-bold text-black">
                                            {order.order_number} <span className="mx-1 text-gray-300">/</span> {order.despatch_number}
                                        </span>
                                    </div>

                                    <div className="space-y-1">
                                        {sortedPkgKeys.length > 0 ? (
                                            sortedPkgKeys.map(key => (
                                                <PackageTable
                                                    key={key}
                                                    keyName={key}
                                                    packageData={order.packages[key]}
                                                    hideHeader={true}
                                                />
                                            ))
                                        ) : (
                                            <div className="text-center py-2 text-gray-400 italic border border-dashed rounded-lg text-[10px]">
                                                Sin bultos registrados para este pedido
                                            </div>
                                        )}
                                    </div>

                                    {/* New table for order lines */}
                                    {order.items && order.items.length > 0 && (
                                        <div className="border border-black overflow-hidden print:border-black mt-2">
                                            <div className="bg-white text-black px-4 py-1 border-b border-black flex justify-between items-center print:py-0.5">
                                                <h3 className="text-sm font-bold uppercase">Detalle del Pedido</h3>
                                            </div>
                                            <table className="min-w-full text-sm">
                                                <thead>
                                                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                                        <th className="p-1 px-2 text-left w-12 text-[10px]">LÍNEA</th>
                                                        <th className="p-1 px-2 text-left text-[10px]">CÓDIGO</th>
                                                        <th className="p-1 text-left text-[10px]">DESCRIPCIÓN</th>
                                                        <th className="p-1 text-center w-16 text-[10px]">CANT.</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {order.items.map((item, idx) => (
                                                        <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                                            <td className="p-1 px-2 font-mono text-[10px] text-gray-400">{item.order_line}</td>
                                                            <td className="p-1 px-2 font-mono text-[11px] font-bold text-slate-700">{item.item_code}</td>
                                                            <td className="p-1 text-[11px] text-slate-600 truncate max-w-[150px]" title={item.description}>
                                                                {item.description}
                                                            </td>
                                                            <td className="p-1 text-center font-bold text-slate-800 text-[11px]">{item.quantity}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <div className="mt-8 pt-2 border-t border-gray-100 flex justify-center items-center text-[9px] text-gray-400 print:mt-10 print:border-gray-300 print:text-black">
                            <p className="tracking-widest uppercase">LOGIX - WMS</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConsolidatedPackingList;
