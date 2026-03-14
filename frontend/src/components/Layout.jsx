import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import '../styles/Layout.css';

// Check if user is on specific path for active styling
const MenuItem = ({ to, icon, label, onClick }) => {
    const location = useLocation();
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

    return (
        <Link
            to={to}
            className={`flex items-center px-4 py-1 text-white transition-colors border-l-[4px] 
            ${isActive ? 'bg-white/10 border-[var(--sap-primary)]' : 'hover:bg-white/10 border-transparent hover:border-[var(--sap-primary)]'}`}
            onClick={onClick}
        >
            <div className="w-8 flex justify-center opacity-80">
                {icon}
            </div>
            <span className="text-sm font-medium tracking-wide ml-2">{label}</span>
        </Link>
    );
};

// Icons as components for reusable clean code
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
const DownloadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>;
const TagIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5z" /></svg>;
const DocumentIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
const EyeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

const LogoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" /></svg>;
const CartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ChartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>;
const ChecklistIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>;
const CalculatorIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" /></svg>;
const CheckSquareIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375M9 15l2.25 2.25L15 12" /></svg>;
const ArrowRepeatIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>;

const Layout = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [title, setTitle] = useState('Logix - Inicio');

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    return (
        <div className="flex flex-col min-h-screen bg-[var(--sap-bg)] text-[var(--sap-text)] font-sans print:block print:h-auto print:overflow-visible">
            {/* Rotate Overlay (Mobile) */}
            <div id="rotate-overlay" className="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 text-white p-4">
                <div className="max-w-sm text-center">
                    <h2 className="text-xl font-semibold">Gira el dispositivo</h2>
                </div>
            </div>

            {/* Top Header */}
            <header className="top-header bg-[var(--sap-shell-bg)] text-white h-[48px] px-4 flex items-center gap-4 shadow-md sticky top-0 z-50 print:hidden">
                <button
                    className="menu-toggle p-2 rounded hover:bg-white/10 active:bg-white/20 transition-all cursor-pointer z-[1001]"
                    onClick={toggleMenu}
                    aria-label="Abrir menú"
                    type="button"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                </button>
                <h1 className="header-title flex-grow tracking-wide">{title}</h1>
                <div className="header-actions flex gap-2">
                    <Link to="/admin/login" className="text-sm font-medium px-3 py-1 hover:bg-white/15 rounded transition-all">Admin</Link>
                </div>
            </header>

            {/* Sidebar Menu (SAP Fiori Style) */}
            <div
                className={`dropdown-menu ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} fixed left-0 w-64 bg-[var(--sap-shell-bg)] shadow-xl z-[999] overflow-y-auto transform transition-transform duration-200 ease-in-out`}
                style={{ top: '48px', height: 'calc(100vh - 48px)' }}
            >
                <nav className="py-1">
                    {/* GENERAL */}
                    <MenuItem to="/dashboard" icon={<HomeIcon />} label="Inicio" onClick={toggleMenu} />
                    <MenuItem to="/stock" icon={<SearchIcon />} label="Consultar Stock" onClick={toggleMenu} />

                    {/* Separator */}
                    <div className="h-px bg-white/10 my-1 mx-4"></div>

                    {/* INBOUND (RECEPCIÓN) */}
                    <div className="px-4 py-1 text-xs font-semibold text-white/50 uppercase tracking-wider">Recepción</div>
                    <MenuItem to="/inbound" icon={<DownloadIcon />} label="Inbound" onClick={toggleMenu} />
                    <MenuItem to="/reconciliation" icon={<EyeIcon />} label="Ver conciliación" onClick={toggleMenu} />
                    <MenuItem to="/view_logs" icon={<DocumentIcon />} label="Ver Logs" onClick={toggleMenu} />

                    {/* Separator */}
                    <div className="h-px bg-white/10 my-1 mx-4"></div>

                    {/* OUTBOUND (DESPACHO) */}
                    <div className="px-4 py-1 text-xs font-semibold text-white/50 uppercase tracking-wider">Despacho</div>
                    <MenuItem to="/picking" icon={<CartIcon />} label="Chequeo de Picking" onClick={toggleMenu} />
                    <MenuItem to="/view_picking_audits" icon={<CheckCircleIcon />} label="Pickings empacados" onClick={toggleMenu} />
                    <MenuItem to="/shipments" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} label="Envíos" onClick={toggleMenu} />
                    <MenuItem to="/label" icon={<TagIcon />} label="Etiquetado" onClick={toggleMenu} />

                    {/* Separator */}
                    <div className="h-px bg-white/10 my-1 mx-4"></div>

                    {/* INVENTARIO (CONTEOS) */}
                    <div className="px-4 py-1 text-xs font-semibold text-white/50 uppercase tracking-wider">Inventario</div>
                    <MenuItem to="/inventory-dashboard" icon={<ChartIcon />} label="Dashboard Inventario" onClick={toggleMenu} />
                    <MenuItem to="/planner" icon={<ChartIcon />} label="Plan Cíclico" onClick={toggleMenu} />
                    <MenuItem to="/view_counts/recordings" icon={<CheckSquareIcon />} label="Reporte Cíclicos" onClick={toggleMenu} />
                    <MenuItem to="/planner/manage_differences" icon={<ChecklistIcon />} label="Diferencias Cíclicos" onClick={toggleMenu} />
                    <MenuItem to="/counts" icon={<ChecklistIcon />} label="Conteo W2W" onClick={toggleMenu} />
                    <MenuItem to="/view_counts" icon={<CalculatorIcon />} label="Conteo General" onClick={toggleMenu} />

                    {/* Separator */}
                    <div className="h-px bg-white/10 my-1 mx-4"></div>

                    {/* ADMINISTRACIÓN */}
                    <div className="px-4 py-1 text-xs font-semibold text-white/50 uppercase tracking-wider">Administración</div>
                    <MenuItem to="/admin/slotting" icon={<ChartIcon />} label="Config. Slotting" onClick={toggleMenu} />
                    <MenuItem to="/admin/inventory" icon={<CheckSquareIcon />} label="Admin Inventario" onClick={toggleMenu} />
                    <MenuItem to="/counts/manage" icon={<ChecklistIcon />} label="Gestionar Conteos" onClick={toggleMenu} />
                    <MenuItem to="/update" icon={<ArrowRepeatIcon />} label="Actualizar Ficheros" onClick={toggleMenu} />

                    {/* Separator */}
                    <div className="h-px bg-white/10 my-1 mx-4"></div>

                    <Link
                        to="#"
                        className="flex items-center px-4 py-1 text-white hover:bg-white/10 border-l-[4px] border-transparent hover:border-[var(--sap-error)] transition-colors"
                        onClick={async (e) => {
                            e.preventDefault();
                            try {
                                await fetch('/api/logout', { method: 'POST', credentials: 'include' });
                            } catch (err) {
                                console.error('Logout failed', err);
                            } finally {
                                window.location.href = '/login';
                            }
                        }}
                    >
                        <div className="w-8 flex justify-center opacity-80">
                            <LogoutIcon />
                        </div>
                        <span className="text-sm font-medium tracking-wide ml-2">Cerrar Sesión</span>
                    </Link>
                </nav>
            </div>

            {/* Overlay */}
            <div
                className={`menu-overlay fixed top-[48px] left-0 w-full h-[calc(100vh-48px)] bg-black/40 transition-opacity z-[998] print:hidden ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
                onClick={toggleMenu}
            ></div>

            {/* Main Content */}
            <main className="main-content flex-grow overflow-y-auto overflow-x-hidden print:overflow-visible print:h-auto">
                <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
                    <Outlet context={{ setTitle }} /> {/* Renders the child route (e.g. Dashboard) */}
                </div>
            </main>
        </div>
    );
};

export default Layout;

