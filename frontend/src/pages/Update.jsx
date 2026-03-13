import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

const Update = () => {
    const { setTitle } = useOutletContext();
    const [messages, setMessages] = useState({ success: '', error: '', info: '' });
    const [isLoading, setIsLoading] = useState(false);

    // Drag and Drop State
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState([]);

    useEffect(() => { setTitle("Actualizar Ficheros"); }, [setTitle]);

    // States for update options
    const [updateOption, setUpdateOption] = useState('combine');

    // Robot Date States
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

    const formatDateForInput = (date) => {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();
        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;
        return [year, month, day].join('-');
    };

    const [robotStartDate, setRobotStartDate] = useState(formatDateForInput(firstDayOfYear));
    const [robotEndDate, setRobotEndDate] = useState(formatDateForInput(today));

    // Password states
    const [clearPassword, setClearPassword] = useState('');
    const [backupPassword, setBackupPassword] = useState('');

    // GRN Selection State
    const [availableGrns, setAvailableGrns] = useState([]);
    const [selectedGrns, setSelectedGrns] = useState([]);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [previewedFile, setPreviewedFile] = useState(null);

    // Effect to preview GRNs when files change
    useEffect(() => {
        const grnFile = files.find(f => {
            const name = f.name.toLowerCase();
            return name.includes('280') || name.includes('pedido') || name.includes('reporte');
        });

        if (grnFile) {
            if (grnFile !== previewedFile && !isPreviewing) {
                fetchPreviewGrns(grnFile);
            }
        } else {
            // Reset if no GRN file
            setAvailableGrns([]);
            setSelectedGrns([]);
            setPreviewedFile(null);
        }
    }, [files, previewedFile, isPreviewing]);

    const fetchPreviewGrns = async (file) => {
        setIsPreviewing(true);
        setPreviewedFile(file);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/preview_grn_file', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok && data.grns) {
                setAvailableGrns(data.grns);
                setSelectedGrns(data.grns); // Default select all
            }
        } catch (err) {
            console.error("Error previewing GRNs:", err);
            setMessages({ success: '', error: "Error al leer las GRNs del archivo.", info: '' });
            setPreviewedFile(null);
        } finally {
            setIsPreviewing(false);
        }
    };

    // Drag Handlers
    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFiles(e.dataTransfer.files);
        }
    };

    const handleChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFiles(e.target.files);
        }
    };

    const handleFiles = (newFiles) => {
        setFiles(prev => [...prev, ...Array.from(newFiles)]);
    };

    const removeFile = (idx) => {
        setFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleFileUpdate = async (e) => {
        e.preventDefault();
        setMessages({ success: '', error: '', info: '' });
        setIsLoading(true);

        const formData = new FormData();

        // Auto-detect file types based on keywords
        files.forEach(file => {
            const name = file.name.toLowerCase();
            if (name.includes('master') || name.includes('item') || name.includes('maestro') || name.includes('inventario') || name.includes('250')) {
                formData.append('item_master', file);
            } else if (name.includes('280') || name.includes('pedido') || name.includes('reporte') || name.includes('grn') || name.includes('entrada')) {
                formData.append('grn_file', file);
            } else if (name.includes('240') || name.includes('picking') || name.includes('salida')) {
                formData.append('picking_file', file);
            } else if (name.includes('extractor') || name.includes('purchase')) {
                formData.append('po_extractor', file);
            }
        });

        formData.append('update_option_280', updateOption);

        if (availableGrns.length > 0) {
            formData.append('selected_grns_280', JSON.stringify(selectedGrns));
        }

        try {
            const res = await fetch('/api/update', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                setMessages({ success: data.message, error: '', info: '' });
                setFiles([]);
                setAvailableGrns([]);
                setSelectedGrns([]);
            } else {
                setMessages({ success: '', error: data.error || "Error subiendo archivos", info: '' });
            }
        } catch (err) {
            setMessages({ success: '', error: err.message, info: '' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearDB = async (e) => {
        e.preventDefault();
        if (!window.confirm("¡PELIGRO! ¿Estás seguro de que quieres borrar TODOS los logs? Esta acción no se puede deshacer.")) return;

        setMessages({ success: '', error: '', info: '' });
        setIsLoading(true);

        const formData = new FormData();
        formData.append('password', clearPassword);

        try {
            const res = await fetch('/api/clear_database', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                setMessages({ success: data.message, error: '', info: '' });
                setClearPassword('');
            } else {
                setMessages({ success: '', error: data.error || "Error limpiando base de datos", info: '' });
            }
        } catch (err) {
            setMessages({ success: '', error: err.message, info: '' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleBackup = async (e) => {
        e.preventDefault();
        setMessages({ success: '', error: '', info: '' });
        setIsLoading(true);

        const formData = new FormData();
        formData.append('password', backupPassword);

        try {
            const res = await fetch('/api/export_all_log', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setMessages({ success: "Backup generado correctamente", error: '', info: '' });
            } else {
                const data = await res.json();
                setMessages({ success: '', error: data.error || "Error generando backup", info: '' });
            }
        } catch (err) {
            setMessages({ success: '', error: err.message, info: '' });
        } finally {
            setIsLoading(false);
        }
    };

    const [isRobotRunning, setIsRobotRunning] = useState(false);

    // Polling effect para revisar el estado del robot
    useEffect(() => {
        let interval;
        if (isRobotRunning) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch('/api/po_robot_status');
                    if (res.ok) {
                        const data = await res.json();
                        if (data.status === 'success') {
                            setMessages({ success: data.message, error: '', info: '' });
                            setIsRobotRunning(false);
                        } else if (data.status === 'error') {
                            setMessages({ success: '', error: data.message, info: '' });
                            setIsRobotRunning(false);
                        } else if (data.status === 'running') {
                            setMessages({ success: '', error: '', info: data.message || 'Ejecutando robot en segundo plano, por favor espere...' });
                        }
                    }
                } catch (err) {
                    console.error("Error consultando estado del robot:", err);
                }
            }, 10000);
        }
        return () => clearInterval(interval);
    }, [isRobotRunning]);

    const [selectedRobotCountries, setSelectedRobotCountries] = useState(['CO']); // Por defecto Colombia

    const toggleRobotCountry = (code) => {
        setSelectedRobotCountries(prev => 
            prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
        );
    };

    const handleRunRobot = async () => {
        if (selectedRobotCountries.length === 0) {
            alert("Por favor, seleccione al menos un país.");
            return;
        }
        if (!window.confirm(`¿Deseas iniciar el robot para ${selectedRobotCountries.join(', ')}? Esto tomará unos minutos.`)) return;

        setIsRobotRunning(true);
        setMessages({ success: '', error: '', info: 'Enviando petición al servidor...' });

        // Reformatear a DD/MM/YYYY para Sandvik
        const formatForSandvik = (isoDate) => {
            if (!isoDate) return "";
            const [year, month, day] = isoDate.split('-');
            return `${day}/${month}/${year}`;
        };

        try {
            const res = await fetch('/api/run_po_robot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_date: formatForSandvik(robotStartDate),
                    end_date: formatForSandvik(robotEndDate),
                    countries: selectedRobotCountries
                })
            });
            if (!res.ok) {
                const data = await res.json();
                setMessages({ success: '', error: data.error || "Error al activar el robot", info: '' });
                setIsRobotRunning(false);
            }
        } catch (err) {
            setMessages({ success: '', error: "Error de conexión con el servidor", info: '' });
            setIsRobotRunning(false);
        }
    };

    return (
        <div className="container-wrapper max-w-4xl mx-auto px-4 py-8">

            {messages.error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 shadow-sm flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {messages.error}
            </div>}
            {messages.info && <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4 shadow-sm flex items-center gap-2 animate-pulse">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {messages.info}
            </div>}
            {messages.success && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 shadow-sm flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                {messages.success}
            </div>}

            {/* Purchase Order Robot Section */}
            <div className="bg-[#f0f7ff] shadow rounded-lg overflow-hidden mb-8 border border-blue-200">
                <div className="bg-[#e1effe] px-6 py-2 border-b border-blue-200 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <svg className="w-6 h-6 text-[#1e73be]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                        <h2 className="text-lg font-bold text-blue-900">Automatización</h2>
                    </div>
                </div>
                <div className="p-4">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex-1">
                            <p className="text-blue-800 font-medium text-sm leading-tight">Actualización automática de Import reference y waybill.</p>
                            <p className="text-blue-600 text-xs mt-0.5 mb-3 leading-tight">
                                Seleccione los países y el rango de fechas para que el robot descargue los datos desde el portal oficial.
                            </p>

                            <div className="flex flex-col gap-3">
                                {/* Date Inputs */}
                                <div className="flex items-center gap-4 bg-white px-3 py-2 rounded border border-blue-100 w-fit shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-semibold text-blue-800 whitespace-nowrap">Fecha Inicio:</label>
                                        <input
                                            type="date"
                                            value={robotStartDate}
                                            onChange={(e) => setRobotStartDate(e.target.value)}
                                            className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-700 bg-gray-50"
                                        />
                                    </div>
                                    <div className="text-gray-400 font-bold">-</div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-semibold text-blue-800 whitespace-nowrap">Fecha Fin:</label>
                                        <input
                                            type="date"
                                            value={robotEndDate}
                                            onChange={(e) => setRobotEndDate(e.target.value)}
                                            className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-700 bg-gray-50"
                                        />
                                    </div>
                                </div>

                                {/* Country Checkboxes (NEW) */}
                                <div className="flex items-center gap-4 bg-white/50 px-3 py-2 rounded border border-blue-50 w-fit">
                                    <span className="text-xs font-bold text-blue-800 mr-1 uppercase">Países:</span>
                                    {['AR', 'BR', 'CL', 'CO', 'PE'].map(code => (
                                        <label key={code} className="flex items-center gap-1.5 cursor-pointer group">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedRobotCountries.includes(code)}
                                                onChange={() => toggleRobotCountry(code)}
                                                className="w-4 h-4 text-[#1e73be] border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <span className={`text-sm font-bold ${selectedRobotCountries.includes(code) ? 'text-blue-700' : 'text-gray-400'}`}>{code}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        
                        <button
                            onClick={handleRunRobot}
                            disabled={isRobotRunning || isLoading}
                            className={`flex items-center justify-center gap-2 px-6 py-3 rounded font-bold transition-all shadow-sm whitespace-nowrap mt-2 ${isRobotRunning ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#1e73be] hover:bg-[#1a62a3] text-white'}`}
                        >
                            {isRobotRunning ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Robot en Marcha...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Actualizar desde Portal
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* File Upload Section */}
            <div className="bg-white shadow rounded-lg overflow-hidden mb-8 border border-gray-200">
                <div className="bg-gray-100 px-6 py-2 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-800">Actualización de Archivos</h2>
                </div>

                <div className="p-2">
                    <p className="text-gray-600 mb-6 text-sm">Suba los ficheros para actualizar la base de datos maestra y de GRN.</p>

                    <form onSubmit={handleFileUpdate}>

                        {/* Drag and Drop Zone */}
                        <div
                            className={`border-2 border-dashed rounded-lg py-5 px-10 text-center transition-colors cursor-pointer mb-5 ${dragActive ? 'border-[#285f94] bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => document.getElementById('file-upload').click()}
                        >
                            <input
                                id="file-upload"
                                type="file"
                                multiple
                                accept=".csv"
                                className="hidden"
                                onChange={handleChange}
                            />

                            <div className="flex flex-col items-center justify-center">
                                <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <p className="text-gray-600 font-medium mb-1">
                                    <span className="font-bold text-gray-700">Click to upload</span> or drag and drop
                                </p>
                                <p className="text-gray-400 text-sm">CSV files (250, 280, 240), Excel (.xlsx) & PO Extractor</p>
                            </div>
                        </div>

                        {/* Selected Files List */}
                        {files.length > 0 && (
                            <div className="mb-6 space-y-2">
                                <h4 className="text-sm font-bold text-gray-700">Archivos seleccionados:</h4>
                                {files.map((file, index) => (
                                    <div key={index} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded border border-gray-200">
                                        <span className="flex items-center gap-2 text-gray-700">
                                            <svg className="w-4 h-4 text-[#285f94]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>
                                            {file.name}
                                        </span>
                                        <button type="button" onClick={() => removeFile(index)} className="text-red-500 hover:text-red-700">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Update Options (Only visible if GRN file present) */}
                        {availableGrns.length > 0 && (
                            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                                <p className="font-medium text-gray-700 mb-3">Opción de actualización para el archivo 280:</p>
                                <div className="flex items-center gap-6 mb-4">
                                    <label className="inline-flex items-center cursor-pointer">
                                        <input type="radio" value="combine" checked={updateOption === 'combine'} onChange={(e) => setUpdateOption(e.target.value)} className="form-radio text-[#285f94] h-4 w-4" />
                                        <span className="ml-2 text-sm text-gray-700">Combinar (Agregar nuevas)</span>
                                    </label>
                                    <label className="inline-flex items-center cursor-pointer">
                                        <input type="radio" value="replace" checked={updateOption === 'replace'} onChange={(e) => setUpdateOption(e.target.value)} className="form-radio text-[#285f94] h-4 w-4" />
                                        <span className="ml-2 text-sm text-gray-700">Reemplazar Todo</span>
                                    </label>
                                </div>

                                <div className="border-t border-gray-200 pt-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="font-medium text-gray-700 text-sm">Seleccionar GRNs a importar:</p>
                                        <div className="text-xs">
                                            <button type="button" onClick={() => setSelectedGrns([...availableGrns])} className="text-[#285f94] hover:underline mr-2">Seleccionar Todas</button>
                                            <span className="text-gray-300">|</span>
                                            <button type="button" onClick={() => setSelectedGrns([])} className="text-[#285f94] hover:underline ml-2">Deseleccionar Todas</button>
                                        </div>
                                    </div>

                                    <div className="max-h-48 overflow-y-auto bg-white p-3 rounded border border-gray-200 grid grid-cols-2 gap-2">
                                        {availableGrns.map(grn => (
                                            <div key={grn} className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    id={`grn-${grn}`}
                                                    checked={selectedGrns.includes(grn)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedGrns(prev => [...prev, grn]);
                                                        else setSelectedGrns(prev => prev.filter(g => g !== grn));
                                                    }}
                                                    className="h-4 w-4 text-[#285f94] rounded border-gray-300 focus:ring-[#285f94]"
                                                />
                                                <label htmlFor={`grn-${grn}`} className="ml-2 text-xs text-gray-700 truncate cursor-pointer" title={grn}>
                                                    {grn}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">Solo se importarán las filas correspondientes a las GRNs marcadas.</p>
                                </div>
                            </div>
                        )}

                        <button disabled={isLoading || files.length === 0} type="submit" className="w-full bg-[#1e73be] hover:bg-[#1e4a74] text-white font-medium py-3 px-4 rounded transition-colors flex items-center justify-center gap-2 shadow-sm">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                            {isLoading ? 'Procesando...' : 'Subir y Actualizar Archivos'}
                        </button>
                    </form>
                </div>
            </div>

            {/* Database Maintenance Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Clear DB */}
                <div className="bg-red-50 shadow rounded-lg p-4 border border-red-200 flex flex-col justify-between">
                    <div>
                        <h2 className="text-lg font-bold mb-2 text-red-800 flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            Zona de Peligro
                        </h2>
                        <p className="text-xs text-gray-600 mb-3">Ingrese la contraseña administrativa para borrar TODO el historial.</p>
                    </div>
                    <form onSubmit={handleClearDB}>
                        <input
                            type="password"
                            placeholder="Contraseña Admin"
                            value={clearPassword}
                            onChange={(e) => setClearPassword(e.target.value)}
                            className="w-full text-sm border p-2 rounded mb-3"
                            required
                        />
                        <button disabled={isLoading} type="submit" className="w-full text-sm bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 font-bold">
                            Limpiar Base de Datos
                        </button>
                    </form>
                </div>

                {/* Backup */}
                <div className="bg-green-50 shadow rounded-lg p-4 border border-green-200 flex flex-col justify-between">
                    <div>
                        <h2 className="text-lg font-bold mb-2 text-green-800 flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Backup Completo
                        </h2>
                        <p className="text-xs text-gray-600 mb-3">Exportar todo el historial de logs (activo + archivado).</p>
                    </div>
                    <form onSubmit={handleBackup}>
                        <input
                            type="password"
                            placeholder="Contraseña Admin"
                            value={backupPassword}
                            onChange={(e) => setBackupPassword(e.target.value)}
                            className="w-full text-sm border p-2 rounded mb-3"
                            required
                        />
                        <button disabled={isLoading} type="submit" className="w-full text-sm bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 font-bold">
                            Descargar Backup
                        </button>
                    </form>
                </div>

            </div>
        </div>
    );
};

export default Update;
