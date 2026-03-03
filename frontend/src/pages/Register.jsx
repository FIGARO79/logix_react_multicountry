import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Register = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        confirmPassword: '',
        country: 'CL'
    });
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage(null);
        setError(null);

        if (formData.password !== formData.confirmPassword) {
            setError("Las contraseñas no coinciden.");
            return;
        }

        try {
            const body = new FormData();
            body.append('username', formData.username);
            body.append('password', formData.password);
            body.append('country', formData.country);

            const res = await fetch('/api/register', {
                method: 'POST',
                body: body
            });
            const data = await res.json();

            if (res.ok) {
                setMessage(data.message);
                // Redirect to login after a delay? Or just show message.
                setTimeout(() => navigate('/login'), 3000);
            } else {
                setError(data.error || "Error en el registro.");
            }
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="px-8 py-6 mt-4 text-left bg-white shadow-lg rounded-lg w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                </div>
                <h3 className="text-2xl font-bold text-center text-gray-800">Registro de Cuenta</h3>
                <p className="mt-2 text-sm text-center text-gray-600">Únete al sistema Logix</p>

                {message && <div className="mt-4 p-3 bg-green-100 text-green-700 rounded text-sm">{message}</div>}
                {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

                <form onSubmit={handleSubmit} className="mt-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700">País</label>
                        <select
                            name="country"
                            className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                            value={formData.country}
                            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        >
                            <option value="CL">Chile (CL)</option>
                            <option value="AR">Argentina (AR)</option>
                            <option value="BR">Brasil (BR)</option>
                            <option value="CO">Colombia (CO)</option>
                        </select>
                    </div>
                    <div className="mt-4">
                        <label className="block text-sm font-semibold text-gray-700">Usuario</label>
                        <input
                            type="text"
                            name="username"
                            required
                            className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        />
                    </div>
                    <div className="mt-4">
                        <label className="block text-sm font-semibold text-gray-700">Contraseña</label>
                        <input
                            type="password"
                            name="password"
                            required
                            className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>
                    <div className="mt-4">
                        <label className="block text-sm font-semibold text-gray-700">Confirmar Contraseña</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            required
                            className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        />
                    </div>
                    <div className="flex items-center justify-between mt-6">
                        <button type="submit" className="w-full px-6 py-2 leading-5 text-white transition-colors duration-200 transform bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:bg-blue-700">
                            Registrarse
                        </button>
                    </div>
                </form>
                <div className="mt-6 text-center">
                    <a href="/login" className="text-sm text-blue-600 hover:underline">¿Ya tienes cuenta? Inicia sesión</a>
                </div>
            </div>
        </div>
    );
};

export default Register;
