import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

// Lazy load de páginas principales
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const Reconciliation = lazy(() => import('./pages/Reconciliation'));
const StockSearch = lazy(() => import('./pages/StockSearch'));
const PickingAuditHistory = lazy(() => import('./pages/PickingAuditHistory'));
const Inbound = lazy(() => import('./pages/Inbound'));
const CycleCounts = lazy(() => import('./pages/CycleCounts'));
const LabelPrinting = lazy(() => import('./pages/LabelPrinting'));
const Planner = lazy(() => import('./pages/Planner'));
const PlannerExecution = lazy(() => import('./pages/PlannerExecution'));
const PickingAudit = lazy(() => import('./pages/PickingAudit'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminInventory = lazy(() => import('./pages/AdminInventory'));
const ManageCounts = lazy(() => import('./pages/ManageCounts'));
const ViewCounts = lazy(() => import('./pages/ViewCounts'));
const EditCount = lazy(() => import('./pages/EditCount'));
const InboundHistory = lazy(() => import('./pages/InboundHistory'));
const Update = lazy(() => import('./pages/Update'));
const Register = lazy(() => import('./pages/Register'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const PackingListPrint = lazy(() => import('./pages/PackingListPrint'));
const CycleCountHistory = lazy(() => import('./pages/CycleCountHistory'));
const ManageCountDifferences = lazy(() => import('./pages/ManageCountDifferences'));
const ManageCycleCountDifferences = lazy(() => import('./pages/ManageCycleCountDifferences'));
const WaybillGRN = lazy(() => import('./pages/WaybillGRN'));
const Shipments = lazy(() => import('./pages/Shipments'));
const ConsolidatedPackingList = lazy(() => import('./pages/ConsolidatedPackingList'));
const ErrorPage = lazy(() => import('./pages/Error'));

// Componente de carga
const LoadingFallback = () => (
    <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '1.2rem',
        color: '#0070f3'
    }}>
        Cargando...
    </div>
);

// Protected Route Component
const ProtectedRoute = ({ children, requiredPermission }) => {
    // Basic auth check
    const userJson = localStorage.getItem('user');
    const isAuthenticated = !!userJson;

    if (!isAuthenticated) return <Navigate to="/login" replace />;

    // Permission check
    if (requiredPermission) {
        try {
            const user = JSON.parse(userJson);
            // If admin, allow everything
            if (user.username === 'admin') return children;

            const perms = user.permissions ? user.permissions.split(',') : [];
            const hasPermission = Array.isArray(requiredPermission)
                ? requiredPermission.some(p => perms.includes(p))
                : perms.includes(requiredPermission);

            if (!hasPermission) {
                // Determine where to redirect if unauthorized
                return <Navigate to="/dashboard" replace />; // Or an Unauthorized page
            }
        } catch (e) {
            console.error("Error parsing user data", e);
            return <Navigate to="/login" replace />;
        }
    }

    return children;
};

function App() {
    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Suspense fallback={<LoadingFallback />}>
                <Routes>
                    {/* Redirigir raíz a login */}
                    <Route path="/" element={<Navigate to="/login" replace />} />

                    {/* Rutas públicas */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/set_password" element={<SetPassword />} />

                    {/* Protected Routes wrapped in Layout */}
                    {/* Protected Routes wrapped in Layout */}
                    <Route element={
                        <ProtectedRoute>
                            <Layout />
                        </ProtectedRoute>
                    }>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/inbound" element={
                            <ProtectedRoute requiredPermission="inbound">
                                <Inbound />
                            </ProtectedRoute>
                        } />
                        <Route path="/waybill-grn" element={
                            <ProtectedRoute requiredPermission="inbound">
                                <WaybillGRN />
                            </ProtectedRoute>
                        } />
                        <Route path="/label" element={<LabelPrinting />} />
                        <Route path="/stock" element={
                            <ProtectedRoute requiredPermission={['stock', 'inbound']}>
                                <StockSearch />
                            </ProtectedRoute>
                        } />
                        <Route path="/view_picking_audits" element={
                            <ProtectedRoute requiredPermission="picking">
                                <PickingAuditHistory />
                            </ProtectedRoute>
                        } />

                        <Route path="/reconciliation" element={
                            <ProtectedRoute requiredPermission="inbound">
                                <Reconciliation />
                            </ProtectedRoute>
                        } />
                        <Route path="/update" element={
                            <ProtectedRoute>
                                <Update />
                            </ProtectedRoute>
                        } />
                        <Route path="/counts" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <CycleCounts />
                            </ProtectedRoute>
                        } />
                        <Route path="/counts/manage" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <ManageCounts />
                            </ProtectedRoute>
                        } />
                        <Route path="/view_counts" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <ViewCounts />
                            </ProtectedRoute>
                        } />
                        <Route path="/counts/manage_differences" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <ManageCountDifferences />
                            </ProtectedRoute>
                        } />
                        <Route path="/counts/edit/:id" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <EditCount />
                            </ProtectedRoute>
                        } />
                        <Route path="/view_counts/recordings" element={
                            <ProtectedRoute requiredPermission="inventory">
                                <CycleCountHistory />
                            </ProtectedRoute>
                        } />
                        <Route path="/planner" element={
                            <ProtectedRoute requiredPermission="planner">
                                <Planner />
                            </ProtectedRoute>
                        } />
                        <Route path="/planner/execution" element={
                            <ProtectedRoute requiredPermission="planner">
                                <PlannerExecution />
                            </ProtectedRoute>
                        } />
                        <Route path="/planner/manage_differences" element={
                            <ProtectedRoute requiredPermission="planner">
                                <ManageCycleCountDifferences />
                            </ProtectedRoute>
                        } />
                        <Route path="/picking" element={
                            <ProtectedRoute requiredPermission="picking">
                                <PickingAudit />
                            </ProtectedRoute>
                        } />
                        <Route path="/view_logs" element={
                            <ProtectedRoute requiredPermission="inbound">
                                <InboundHistory />
                            </ProtectedRoute>
                        } />


                        {/* Admin Routes */}
                        <Route path="/admin/login" element={<AdminLogin />} />
                        <Route path="/admin/users" element={<AdminUsers />} />
                        <Route path="/admin/inventory" element={<AdminInventory />} />
                        <Route path="/shipments" element={
                            <ProtectedRoute requiredPermission="picking">
                                <Shipments />
                            </ProtectedRoute>
                        } />
                    </Route>

                    {/* Standalone Protected Routes (No Layout) */}
                    <Route path="/packing_list/print/:id" element={
                        <ProtectedRoute>
                            <PackingListPrint />
                        </ProtectedRoute>
                    } />
                    <Route path="/shipments/print/:id" element={
                        <ProtectedRoute>
                            <ConsolidatedPackingList />
                        </ProtectedRoute>
                    } />

                    {/* Catch-all for 404 */}
                    <Route path="*" element={<ErrorPage />} />
                </Routes>
            </Suspense>
        </Router>
    );
}

export default App;
