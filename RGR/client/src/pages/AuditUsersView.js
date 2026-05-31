import React, { useState, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useData } from '../App';
import Spinner from '../components/Spinner';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import '../index.css';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#6b7280'];

const AuditUsersView = () => {
    const { users, loading, isAuditor, adminPath } = useData();

    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    // Статистика по пломбам для аудитора
    const [sealStats, setSealStats] = useState({
        installed: 0,
        removed: 0,
        broken: 0,
        disabled: 0,
        enabled: 0
    });

    // Получаем данные о пломбах из контекста
    const { seals, auditLog } = useData();

    // Вычисляем статистику по пломбам
    useMemo(() => {
        const stats = {
            installed: 0,
            removed: 0,
            broken: 0,
            disabled: 0,
            enabled: 0
        };
        
        seals.forEach(seal => {
            if (seal.status === 'installed') stats.installed++;
            else if (seal.status === 'removed') stats.removed++;
            else if (seal.status === 'broken') stats.broken++;
            else if (seal.status === 'disabled') stats.disabled++;
        });

        // Также считаем включенные пломбы из auditLog
        auditLog.forEach(log => {
            if (log.action === 'enable_seal') stats.enabled++;
        });

        setSealStats(stats);
    }, [seals, auditLog]);

    // Фильтрация пользователей
    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                const matchName = user.username.toLowerCase().includes(searchLower);
                const matchFullName = user.fullName?.toLowerCase().includes(searchLower);
                if (!matchName && !matchFullName) return false;
            }
            if (filterRole !== 'all' && user.role !== filterRole) {
                return false;
            }
            if (filterStatus !== 'all') {
                if (filterStatus === 'approved' && !user.approved) return false;
                if (filterStatus === 'pending' && user.approved) return false;
            }
            return true;
        });
    }, [users, searchTerm, filterRole, filterStatus]);

    // Данные для круговой диаграммы
    const sealStatusData = [
        { name: 'Установлены', value: sealStats.installed },
        { name: 'Сняты', value: sealStats.removed },
        { name: 'Взломаны', value: sealStats.broken },
        { name: 'Отключены', value: sealStats.disabled },
        { name: 'Включены', value: sealStats.enabled }
    ].filter(item => item.value > 0);

    // Данные для столбчатой диаграммы по ролям
    const roleData = useMemo(() => {
        const roles = {};
        filteredUsers.forEach(user => {
            if (user.approved) {
                if (roles[user.role]) roles[user.role]++;
                else roles[user.role] = 1;
            }
        });
        return Object.entries(roles).map(([role, count]) => ({
            name: role === 'admin' ? 'Администратор' :
                  role === 'operator' ? 'Оператор' : 'Аудитор',
            count
        }));
    }, [filteredUsers]);

    if (!isAuditor) {
        return <Navigate to="/" replace />;
    }

    const roleLabels = {
        'admin': 'Администратор',
        'operator': 'Оператор',
        'auditor': 'Аудитор'
    };

    const approvedUsers = filteredUsers.filter(u => u.approved);
    const pendingUsers = filteredUsers.filter(u => !u.approved);
    
    const basePath = adminPath ? `/${adminPath}` : '';

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "50px" }}>
                <div className="spinner" style={{ width: '3rem', height: '3rem', borderWidth: '3px' }}></div>
                <span style={{ color: 'var(--gray-500)', fontSize: '1rem', marginLeft: '0.5rem' }}>Загрузка пользователей...</span>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <h1>Пользователи</h1>

            {/* Статистика по пломбам для аудитора */}
            <div className="card" style={{ marginBottom: '2rem' }}>
                <div className="card-header">
                    <div className="card-title">Статистика пломб</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>{sealStats.installed}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Установлены</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{sealStats.broken}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Взломаны</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6b7280' }}>{sealStats.removed}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Сняты</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{sealStats.disabled}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Отключены</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{sealStats.enabled}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Включены</div>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {sealStatusData.length > 0 && (
                        <div style={{ height: '250px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={sealStatusData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={70}
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
                    )}
                    {roleData.length > 0 && (
                        <div style={{ height: '250px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={roleData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#4f46e5" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* Фильтры */}
            <div className="filters">
                <div className="filter-group">
                    <label>Поиск</label>
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Поиск по имени или логину..."
                    />
                </div>
                
                <div className="filter-group">
                    <label>Роль</label>
                    <select 
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                    >
                        <option value="all">Все роли</option>
                        <option value="admin">Администратор</option>
                        <option value="operator">Оператор</option>
                        <option value="auditor">Аудитор</option>
                    </select>
                </div>
                
                <div className="filter-group">
                    <label>Статус</label>
                    <select 
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Все</option>
                        <option value="approved">Утверждённые</option>
                        <option value="pending">Ожидающие</option>
                    </select>
                </div>
                
                <button 
                    onClick={() => {
                        setSearchTerm('');
                        setFilterRole('all');
                        setFilterStatus('all');
                    }}
                    className="btn btn-secondary"
                >
                    Сбросить
                </button>
            </div>

            {/* Ожидающие пользователи */}
            {pendingUsers.length > 0 && (
                <>
                    <h3 style={{ color: 'var(--warning-color)', marginBottom: '1rem' }}>
                        Заявки на регистрацию ({pendingUsers.length})
                    </h3>
                    <div className="table-wrapper" style={{ marginBottom: '2rem' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Логин</th>
                                    <th>Полное имя</th>
                                    <th>Роль</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingUsers.map(user => (
                                    <tr key={user.id} style={{ backgroundColor: '#fffbeb' }}>
                                        <td>{user.username}</td>
                                        <td>{user.fullName || '—'}</td>
                                        <td>
                                            <span className={`role-badge ${
                                                user.role === 'admin' ? 'role-badge-admin' :
                                                user.role === 'operator' ? 'role-badge-operator' : 'role-badge-auditor'
                                            }`}>
                                                {roleLabels[user.role] || user.role}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Утверждённые пользователи */}
            <h3 style={{ color: 'var(--success-color)', marginBottom: '1rem' }}>
                Утверждённые пользователи ({approvedUsers.length})
            </h3>
            
            {approvedUsers.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">👤</div>
                    <p>Нет утверждённых пользователей</p>
                </div>
            ) : (
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Логин</th>
                                <th>Полное имя</th>
                                <th>Роль</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {approvedUsers.map(user => (
                                <tr key={user.id}>
                                    <td>{user.username}</td>
                                    <td>{user.fullName || '—'}</td>
                                    <td>
                                        <span className={`role-badge ${
                                            user.role === 'admin' ? 'role-badge-admin' :
                                            user.role === 'operator' ? 'role-badge-operator' : 'role-badge-auditor'
                                        }`}>
                                            {roleLabels[user.role] || user.role}
                                        </span>
                                    </td>
                                    <td>
                                        <Link to={`${basePath}/history/user/${user.id}`}>
                                            <button className="btn btn-secondary btn-sm">
                                                История действий
                                            </button>
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AuditUsersView;