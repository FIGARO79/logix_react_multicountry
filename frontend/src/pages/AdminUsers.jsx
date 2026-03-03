import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
import { useNavigate } from 'react-router-dom';

const AdminUsers = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/admin/users');
            if (res.status === 401) {
                navigate('/admin/login');
                return;
            }
            if (!res.ok) throw new Error("Error loading users");
            const data = await res.json();
            setUsers(data);
        } catch (err) {
            setError(err.message);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleApprove = async (id) => {
        if (!window.confirm("¿Aprobar este usuario?")) return;
        try {
            const res = await fetch(`/api/admin/approve/${id}`, { method: 'POST' });
            if (!res.ok) throw new Error("Failed to approve");
            setMessage(`Usuario ${id} aprobado`);
            fetchUsers();
        } catch (e) { setError(e.message); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿ELIMINAR este usuario permanentemente?")) return;
        try {
            const res = await fetch(`/api/admin/delete/${id}`, { method: 'POST' });
            if (!res.ok) throw new Error("Failed to delete");
            setMessage(`Usuario ${id} eliminado`);
            fetchUsers();
        } catch (e) { setError(e.message); }
    };

    const handleResetPassword = async (id) => {
        const newPass = prompt("Ingrese nueva contraseña:");
        if (!newPass) return;

        try {
            const formData = new FormData();
            formData.append('new_password', newPass);
            const res = await fetch(`/api/admin/reset_password/${id}`, {
                method: 'POST',
                body: formData
            });
            if (!res.ok) throw new Error("Failed to reset password");
            setMessage(`Contraseña restablecida para usuario ${id}`);
        } catch (e) { setError(e.message); }
    };

    const MODULES = ['stock', 'inbound', 'picking', 'inventory', 'planner'];

    const handlePermissionChange = async (userId, module) => {
        const user = users.find(u => u.id === userId);
        if (!user) return;

        // Clean split: handle null, undefined, and empty strings correctly
        const currentPerms = user.permissions
            ? user.permissions.split(',').map(p => p.trim()).filter(p => p !== '')
            : [];

        let newPerms;
        if (currentPerms.includes(module)) {
            newPerms = currentPerms.filter(p => p !== module);
        } else {
            newPerms = [...currentPerms, module];
        }

        // Optimistic update
        const updatedUsers = users.map(u => {
            if (u.id === userId) {
                return { ...u, permissions: newPerms.join(',') };
            }
            return u;
        });
        setUsers(updatedUsers);

        try {
            const res = await fetch(`/api/admin/permissions/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ permissions: newPerms })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.error("Permission save error:", errData);
                throw new Error(errData.detail || "Error saving permissions");
            }
        } catch (e) {
            console.error(e);
            setError(e.message);
            // Revert on error
            fetchUsers();
        }
    };

    return (
        <AdminLayout title="Gestión de Usuarios">
            {message && (
                <div className="mb-6 p-4 border-l-4 border-green-600 bg-green-50 text-green-800 rounded-r shadow-sm flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {message}
                </div>
            )}
            {error && (
                <div className="mb-6 p-4 border-l-4 border-red-600 bg-red-50 text-red-800 rounded-r shadow-sm flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                </div>
            )}

            {/* Users Tile */}
            <div className="bg-white rounded shadow-sm border border-transparent hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="flex justify-between items-center p-6 bg-gray-50 border-b border-gray-200">
                    <h2 className="text-xl font-normal text-gray-800">Usuarios Registrados</h2>
                    <span className="text-sm text-gray-500">{users.length} Usuarios</span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="uppercase font-normal text-xs border-b border-gray-200 bg-gray-50/50">
                            <tr>
                                <th className="px-4 py-3 text-center w-16">ID</th>
                                <th className="px-4 py-3 font-medium">Usuario</th>
                                <th className="px-4 py-3 font-medium">País</th>
                                <th className="px-4 py-3 font-medium">Estado</th>
                                {MODULES.map(m => (
                                    <th key={m} className="px-2 py-3 text-center font-medium text-[10px]">{m.toUpperCase()}</th>
                                ))}
                                <th className="px-4 py-3 text-center font-medium">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {users.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                                    <td className="px-4 py-4 text-center text-gray-500 font-mono">{u.id}</td>
                                    <td className="px-4 py-4 font-medium text-gray-900">{u.username}</td>
                                    <td className="px-4 py-4 text-gray-600">
                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold">
                                            {u.country_code || '??'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        {u.is_approved ? (
                                            <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-green-100 text-green-700 border border-green-200/50">
                                                APROBADO
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-700 border border-orange-200/50">
                                                PENDIENTE
                                            </span>
                                        )}
                                    </td>
                                    {MODULES.map(m => {
                                        const perms = u.permissions
                                            ? u.permissions.split(',').map(p => p.trim()).filter(p => p !== '')
                                            : [];
                                        const hasPerm = perms.includes(m);
                                        return (
                                            <td key={m} className="px-2 py-4 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={hasPerm}
                                                    onChange={() => handlePermissionChange(u.id, m)}
                                                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                                />
                                            </td>
                                        );
                                    })}
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex justify-center items-center gap-2">
                                            <button
                                                className="px-3 py-1 border border-blue-500 text-blue-600 rounded text-xs hover:bg-blue-50 transition-colors"
                                                onClick={() => { alert('Verificar contraseña (no implementado en React aún)'); }}
                                            >
                                                Verificar
                                            </button>

                                            {!u.is_approved && (
                                                <button
                                                    onClick={() => handleApprove(u.id)}
                                                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors border border-blue-600"
                                                >
                                                    Aprobar
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleResetPassword(u.id)}
                                                className="px-3 py-1 border border-blue-500 text-blue-600 rounded text-xs hover:bg-blue-50 transition-colors"
                                            >
                                                Reset Pass
                                            </button>

                                            <button
                                                onClick={() => handleDelete(u.id)}
                                                className="p-1 text-red-600 hover:bg-red-50 rounded border border-red-200 ml-1"
                                                title="Eliminar"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan="10" className="text-center py-8 text-gray-400 italic">
                                        No hay usuarios registrados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-8 text-center">
                <button
                    onClick={() => navigate('/')}
                    className="text-sm text-gray-500 hover:text-gray-800 flex items-center justify-center gap-2 mx-auto"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Volver a la aplicación principal
                </button>
            </div>
        </AdminLayout>
    );
};

export default AdminUsers;
