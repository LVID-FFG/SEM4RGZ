import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../App';
import Spinner from '../components/Spinner';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import '../index.css';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#6b7280'];

const AdminPanel = () => {
    const { users, auditLog, doors, seals, isAdmin, adminPath } = useData();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalUsers: 0,
        pendingUsers: 0,
        totalDoors: 0,
        installedSeals: 0,
        brokenSeals: 0,
        disabledSeals: 0,
        removedSeals: 0,
        totalEvents: 0,
        sealActions: {}
    });

    useEffect(() => {
        if (!isAdmin) {
            navigate('/');
            return;
        }
        calculateStats();
    }, [users, auditLog, doors, seals, isAdmin, navigate]);

    function calculateStats() {
        const totalUsers = users.length;
        const pendingUsers = users.filter(u => !u.approved).length;
        const totalDoors = doors.length;
        
        const installedSeals = seals.filter(s => s.status === 'installed').length;
        const brokenSeals = seals.filter(s => s.status === 'broken').length;
        const disabledSeals = seals.filter(s => s.status === 'disabled').length;
        const removedSeals = seals.filter(s => s.status === 'removed').length;
        const totalEvents = auditLog.length;

        // Статистика по действиям с пломбами
        const sealActions = {
            'install': 0,
            'remove': 0,
            'break': 0,
            'disable': 0,
            'enable': 0
        };
        auditLog.forEach(log => {
            if (log.action === 'install_seal') sealActions.install++;
            else if (log.action === 'remove_seal') sealActions.remove++;
            else if (log.action === 'break_seal') sealActions.break++;
            else if (log.action === 'disable_seal') sealActions.disable++;
            else if (log.action === 'enable_seal') sealActions.enable++;
        });

        setStats({
            totalUsers,
            pendingUsers,
            totalDoors,
            installedSeals,
            brokenSeals,
            disabledSeals,
            removedSeals,
            totalEvents,
            sealActions
        });
        setLoading(false);
    }

    const basePath = adminPath ? `/${adminPath}` : '';

    // Данные для графика действий с пломбами
    const sealActionData = Object.entries(stats.sealActions)
        .filter(([_, count]) => count > 0)
        .map(([action, count]) => ({
            name: action === 'install' ? 'Установка' :
                  action === 'remove' ? 'Снятие' :
                  action === 'break' ? 'Взлом' :
                  action === 'disable' ? 'Отключение' : 'Включение',
            count
        }));

    // Данные для круговой диаграммы статусов пломб
    const sealStatusData = [
        { name: 'Установлены', value: stats.installedSeals },
        { name: 'Сняты', value: stats.removedSeals },
        { name: 'Взломаны', value: stats.brokenSeals },
        { name: 'Отключены', value: stats.disabledSeals }
    ].filter(item => item.value > 0);

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "50px" }}>
                <div className="spinner" style={{ width: '3rem', height: '3rem', borderWidth: '3px' }}></div>
                <span style={{ color: 'var(--gray-500)', fontSize: '1rem', marginLeft: '0.5rem' }}>Загрузка...</span>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <h1>Панель управления</h1>
            
            <div className="stats-grid">
                <div className="stat-card">
                    <h3>Пользователи</h3>
                    <div className="stat-number">{stats.totalUsers}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                        {stats.pendingUsers} ожидают утверждения
                    </div>
                </div>
                <div className="stat-card">
                    <h3>Двери</h3>
                    <div className="stat-number">{stats.totalDoors}</div>
                </div>
                <div className="stat-card">
                    <h3>Пломбы</h3>
                    <div className="stat-number">{stats.installedSeals}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                        {stats.brokenSeals} взломано, {stats.disabledSeals} отключено
                    </div>
                </div>
                <div className="stat-card">
                    <h3>Журнал</h3>
                    <div className="stat-number">{stats.totalEvents}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                        событий зафиксировано
                    </div>
                </div>
            </div>

            {/* Графики */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                {sealActionData.length > 0 && (
                    <div className="card">
                        <div className="card-header">
                            <div className="card-title">Действия с пломбами</div>
                        </div>
                        <div style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={sealActionData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#4f46e5" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {sealStatusData.length > 0 && (
                    <div className="card">
                        <div className="card-header">
                            <div className="card-title">Статус пломб</div>
                        </div>
                        <div style={{ height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={sealStatusData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {sealStatusData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPanel;