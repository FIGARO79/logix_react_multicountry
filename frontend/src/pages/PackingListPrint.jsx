import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const PackingListPrint = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // 1. Fetch Data
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/picking/packing_list/${id}`, { credentials: 'include' });
                if (!res.ok) throw new Error("Error loading data");
                const json = await res.json();
                setData(json);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();

        // 2. Disable SAP Fiori Styles (Conflicts with printing)
        const sapLink = document.querySelector('link[href*="sap_fiori_3"]');
        if (sapLink) {
            sapLink.disabled = true;
            console.log("SAP Theme disabled for printing");
        }

        // Cleanup: Re-enable on exit
        return () => {
            if (sapLink) {
                sapLink.disabled = false;
                console.log("SAP Theme re-enabled");
            }
        };
    }, [id]);

    const handlePrint = () => {
        // Simple, robust fallback to native printing
        // The CSS has 'print:hidden' for non-printable areas
        window.print();
    };

    if (loading) return <div className="p-8">Generando Packing List...</div>;
    if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
    if (!data) return <div className="p-8">No datos.</div>;

    const { packages } = data;
    const sortedPackageKeys = packages ? Object.keys(packages).sort((a, b) => parseInt(a) - parseInt(b)) : [];

    // Componente para el encabezado y la información del pedido (Reusable)
    const HeaderAndInfo = ({ currentPage, totalPages }) => (
        <>
            <div className="text-center mb-2 border-b border-black pb-2 print:mb-2">
                <h1 className="text-2xl uppercase tracking-tight mb-1 print:text-xl text-black">Packing List</h1>
                <div className="text-[10px] text-gray-500 print:text-black flex justify-between px-2">
                    <span>{data.timestamp || ''}</span>
                    <span className="font-bold">
                        PÁG {currentPage} / {totalPages}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2 text-[11px] print:gap-1 print:mb-1">
                <div className="pb-0.5 border-b border-gray-100">
                    <span className="text-gray-500 uppercase text-[8px] print:text-black mr-2">Cliente:</span>
                    <div className="text-sm text-black leading-tight">
                        <span className="font-mono mr-1">{data.customer_code}</span>
                        <span className="font-bold">{data.customer_name || 'N/A'}</span>
                    </div>
                </div>
                <div className="text-right pb-0.5 border-b border-gray-100">
                    <span className="text-gray-500 uppercase text-[8px] print:text-black mr-2">Total Bultos:</span>
                    <span className="text-lg font-bold text-[#285f94] print:text-black">{data.total_packages}</span>
                </div>
                <div className="col-span-2">
                    <span className="text-gray-500 uppercase text-[8px] print:text-black mr-2">Pedido / Despacho:</span>
                    <span className="text-sm font-bold text-black">
                        {data.order_number} <span className="mx-1 text-gray-300">/</span> {data.despatch_number}
                    </span>
                </div>
            </div>
        </>
    );

    return (
        <div className="bg-white min-h-screen text-black p-8 font-sans print:p-0">
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page { margin: 0.5cm; size: auto; }
                    body { -webkit-print-color-adjust: exact; color: #000 !important; background: #fff !important; }
                    thead, th, tr, td { background-color: transparent !important; background-image: none !important; color: #000 !important; }
                    .print-pure-black { color: #000 !important; border-color: #000 !important; }
                    .print-no-shadow { box-shadow: none !important; }
                    .print-bg-none { background: none !important; }
                    .print-border-bold { border-width: 1.5pt !important; border-color: #000 !important; }
                    .no-print { display: none !important; }
                }
            `}} />

            {/* Control Bar - Hidden when printing */}
            <div className="no-print mb-4 sticky top-0 bg-white border-b shadow-sm z-10 print:hidden">
                <div className="max-w-3xl mx-auto flex justify-between items-center p-4">
                    <h1 className="text-lg text-[#285f94]">Vista Previa Packing List</h1>
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
                            Imprimir
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="max-w-3xl mx-auto print:max-w-none print:w-full print:px-0">
                {sortedPackageKeys.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                        <h3 className="text-xl text-gray-400 mb-2">Sin Bultos Asignados</h3>
                        <p className="text-gray-500">No hay contenido disponible para imprimir en este pedido.</p>
                    </div>
                ) : (
                    sortedPackageKeys.map((key, index) => (
                        <div
                            key={key}
                            className={`border p-4 bg-white mb-2 shadow-sm rounded-lg print:border-none print:shadow-none print:p-1 print:m-0 print:rounded-none`}
                            style={index < sortedPackageKeys.length - 1 ? { pageBreakAfter: 'always' } : {}}
                        >
                            <HeaderAndInfo currentPage={index + 1} totalPages={sortedPackageKeys.length} />

                            <div className="mt-4 print:mt-2">
                                <div className="border border-black rounded-lg overflow-hidden print:border-black print:rounded-none">
                                    <div className="bg-white text-black px-3 py-1 border-b border-black print:py-0.5">
                                        <h3 className="text-base font-bold uppercase">Bulto #{key}</h3>
                                    </div>
                                    <table className="min-w-full text-base table-fixed">
                                        <thead className="bg-white text-black border-b border-black">
                                            <tr>
                                                <th className="px-2 py-1 text-left w-12 uppercase text-[10px]">Línea</th>
                                                <th className="px-2 py-1 text-left w-24 uppercase text-[10px]">Código</th>
                                                <th className="px-2 py-1 text-left uppercase text-[10px]">Descripción</th>
                                                <th className="px-2 py-1 text-right w-16 uppercase text-[10px]">Cant.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 print:divide-black">
                                            {data.packages[key] && data.packages[key].length > 0 ? (
                                                data.packages[key].map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-gray-50 print:bg-transparent">
                                                        <td className="px-2 py-1 font-mono text-black text-[10px] whitespace-nowrap">{item.order_line}</td>
                                                        <td className="px-2 py-1 font-mono text-black text-[11px] break-all">{item.item_code}</td>
                                                        <td className="px-2 py-1 text-black text-[11px] leading-tight break-words">{item.description}</td>
                                                        <td className="px-2 py-1 text-right text-sm font-bold whitespace-nowrap">{item.quantity}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="4" className="px-4 py-8 text-center text-gray-500 italic">Sin ítems</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="mt-8 pt-4 border-t border-gray-100 flex justify-center items-center text-[9px] text-gray-400 print:mt-12 print:border-gray-300 print:text-black">
                                <p className="tracking-widest uppercase">LOGIX - WMS</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default PackingListPrint;