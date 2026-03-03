import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), basicSsl()],
    server: {
        host: '0.0.0.0', // Expose to network if needed
        proxy: {
            // API routes
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                secure: false,
            },
            // Static files (Images, etc)
            '/static': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                secure: false,
            },
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    // Separar React y React Router
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    // Separar bibliotecas de UI y utilidades
                    'ui-vendor': ['react-toastify', 'react-to-print'],
                    // Separar QR Code (librería grande)
                    'qrcode-vendor': ['html5-qrcode', 'qrcode'],
                    // Separar Axios (HTTP client)
                    'http-vendor': ['axios']
                }
            }
        },
        // Aumentar el límite de advertencia a 600kb para chunks individuales
        chunkSizeWarningLimit: 600,
        // Minificación mejorada
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true, // Eliminar console.log en producción
                drop_debugger: true
            }
        }
    }
})
