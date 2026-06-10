// client/src/pages/AuditLog.js
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useData } from '../App';
import { auditApi, doorApi } from '../api';
import '../index.css';

const AuditLog = () => {
    const { auditLog, isAdmin, isAuditor, adminPath } = useData();
    const [localLogs, setLocalLogs] = useState([]);
    const [filterAction, setFilterAction] = useState('all');
    const [filterUser, setFilterUser] = useState('');
    const [sortOrder, setSortOrder] = useState('desc');
    const [isAutoRefresh, setIsAutoRefresh] = useState(true);
    const [chainStatus, setChainStatus] = useState(null);
    const [verifying, setVerifying] = useState(false);
    const [chainError, setChainError] = useState("");
    const [doorMap, setDoorMap] = useState({});

    const basePath = adminPath ? `/${adminPath}` : '';

    // Действия, которые может видеть аудитор (только с пломбами)
    const auditorActions = [
        'install_seal', 'remove_seal', 'break_seal', 'disable_seal', 'enable_seal'
    ];

    // Загрузка дверей один раз
    useEffect(() => {
        const loadDoors = async () => {
            const result = await doorApi.getAll();
            if (!result.error && result.data) {
                const map = {};
                result.data.forEach(door => {
                    map[door.id] = door;
                });
                setDoorMap(map);
            }
        };
        loadDoors();
    }, []);

    // Загрузка логов
    useEffect(() => {
        const loadLogs = async () => {
            const result = await auditApi.getAll();
            if (!result.error && result.data) {
                let filtered = result.data;
                if (isAuditor && !isAdmin) {
                    // Аудитор видит только действия с пломбами
                    filtered = result.data.filter(log => 
                        auditorActions.includes(log.action)
                    );
                }
                setLocalLogs(filtered);
            }
        };
        loadLogs();
    }, [isAuditor, isAdmin]);

    // Проверка цепочки хешей (только для админа)
    useEffect(() => {
        if (!isAdmin) return;
        const verifyChain = async () => {
            setVerifying(true);
            setChainError("");
            const result = await auditApi.verify();
            if (!result.error) {
                setChainStatus(result.data.valid);
                if (!result.data.valid && result.data.error) {
                    setChainError(result.data.error);
                }
            }
            setVerifying(false);
        };
        verifyChain();
    }, [isAdmin]);

    // Автообновление
    useEffect(() => {
        if (!isAutoRefresh) return;
        
        const intervalId = setInterval(() => {
            auditApi.getAll().then(result => {
                if (!result.error && result.data) {
                    let filtered = result.data;
                    if (isAuditor && !isAdmin) {
                        filtered = result.data.filter(log => 
                            auditorActions.includes(log.action)
                        );
                    }
                    setLocalLogs(filtered);
                }
            });
            
            if (isAdmin) {
                auditApi.verify().then(result => {
                    if (!result.error) {
                        setChainStatus(result.data.valid);
                        if (!result.data.valid && result.data.error) {
                            setChainError(result.data.error);
                        }
                    }
                });
            }
        }, 10000);
        
        return () => clearInterval(intervalId);
    }, [isAutoRefresh, isAuditor, isAdmin]);

    // Обновление логов при изменении auditLog из контекста
    useEffect(() => {
        if (auditLog.length > 0) {
            setLocalLogs(prev => {
                const existingIds = new Set(prev.map(e => e.id));
                const newEvents = auditLog.filter(e => !existingIds.has(e.id));
                if (isAuditor && !isAdmin) {
                    return [...newEvents.filter(log => 
                        auditorActions.includes(log.action)
                    ), ...prev];
                }
                return [...newEvents, ...prev];
            });
        }
    }, [auditLog, isAuditor, isAdmin]);

    const filteredLogs = useMemo(() => {
        let filtered = [...localLogs];
        
        if (filterAction !== 'all') {
            filtered = filtered.filter(e => e.action === filterAction);
        }
        
        if (filterUser.trim()) {
            filtered = filtered.filter(e => 
                e.userName.toLowerCase().includes(filterUser.toLowerCase())
            );
        }
        
        filtered.sort((a, b) => {
            const comparison = new Date(b.timestamp) - new Date(a.timestamp);
            return sortOrder === 'desc' ? comparison : -comparison;
        });
        
        return filtered;
    }, [localLogs, filterAction, filterUser, sortOrder]);

    const actionLabels = {
        'install_seal': 'Установка пломбы',
        'remove_seal': 'Снятие пломбы',
        'break_seal': 'Взлом пломбы',
        'disable_seal': 'Отключение пломбы',
        'enable_seal': 'Включение пломбы',
        'door_created': 'Дверь создана',
        'door_updated': 'Дверь обновлена',
        'door_deleted': 'Дверь удалена',
        'user_registered': 'Регистрация пользователя',
        'user_created': 'Пользователь создан',
        'user_approved': 'Пользователь утверждён',
        'user_updated': 'Пользователь обновлён',
        'user_deleted': 'Пользователь удалён',
        'user_login': 'Вход пользователя',
        'user_login_failed': 'Неудачный вход'
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>{isAuditor && !isAdmin ? 'Журнал событий с пломбами' : 'Журнал аудита'}</h1>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input 
                            type="checkbox" 
                            checked={isAutoRefresh} 
                            onChange={(e) => setIsAutoRefresh(e.target.checked)} 
                        />
                        Автообновление (10 сек)
                    </label>
                    {isAdmin && (
                        <button 
                            onClick={() => {
                                setVerifying(true);
                                setChainError("");
                                auditApi.verify().then(result => {
                                    if (!result.error) {
                                        setChainStatus(result.data.valid);
                                        if (!result.data.valid && result.data.error) {
                                            setChainError(result.data.error);
                                        }
                                    }
                                    setVerifying(false);
                                });
                            }} 
                            disabled={verifying}
                            style={{ padding: '5px 10px', cursor: 'pointer' }}
                        >
                            {verifying ? 'Проверка...' : 'Проверить цепочку'}
                        </button>
                    )}
                </div>
            </div>

            {isAdmin && chainStatus !== null && (
                <div style={{ 
                    padding: '10px', 
                    backgroundColor: chainStatus ? '#d4edda' : '#f8d7da',
                    color: chainStatus ? '#155724' : '#721c24',
                    borderRadius: '4px',
                    marginBottom: '15px'
                }}>
                    <strong>Целостность цепочки хешей:</strong> 
                    {chainStatus ? ' Нарушений не обнаружено' : ' Обнаружено нарушение!'}
                    {chainError && (
                        <div style={{ marginTop: '5px', fontSize: '0.9em' }}>
                            <strong>Детали:</strong> {chainError}
                        </div>
                    )}
                </div>
            )}

            <div style={{ 
                display: 'flex', 
                gap: '10px', 
                marginBottom: '20px',
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '5px',
                border: '1px solid #dee2e6',
                flexWrap: 'wrap',
                alignItems: 'flex-end'
            }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '3px', fontSize: '14px' }}>
                        Действие:
                    </label>
                    <select 
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value)}
                        style={{ padding: '6px' }}
                    >
                        <option value="all">Все</option>
                        {Object.keys(actionLabels).map(action => (
                            <option key={action} value={action}>
                                {actionLabels[action]}
                            </option>
                        ))}
                    </select>
                </div>
                
                <div>
                    <label style={{ display: 'block', marginBottom: '3px', fontSize: '14px' }}>
                        Пользователь:
                    </label>
                    <input 
                        type="text"
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                        placeholder="Поиск по имени..."
                        style={{ padding: '6px' }}
                    />
                </div>
                
                <div>
                    <label style={{ display: 'block', marginBottom: '3px', fontSize: '14px' }}>
                        Сортировка:
                    </label>
                    <button 
                        onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                        style={{ padding: '6px 12px', cursor: 'pointer' }}
                    >
                        {sortOrder === 'desc' ? 'Новые сверху' : 'Старые сверху'}
                    </button>
                </div>
                
                <button 
                    onClick={() => {
                        setFilterAction('all');
                        setFilterUser('');
                    }}
                    style={{ padding: '6px 12px', cursor: 'pointer' }}
                >
                    Сбросить фильтры
                </button>
            </div>

            {filteredLogs.length === 0 ? (
                <div style={{ 
                    textAlign: 'center', 
                    padding: '40px', 
                    color: '#666',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '5px'
                }}>
                    {localLogs.length === 0 
                        ? (isAuditor && !isAdmin ? 'Журнал событий с пломбами пуст' : 'Журнал аудита пуст')
                        : 'Нет записей, соответствующих фильтрам.'}
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8f9fa' }}>
                                <th>Дата и время</th>
                                <th>Пользователь</th>
                                <th>Действие</th>
                                <th>{isAdmin ? 'Дверь' : 'Дверь (название)'}</th>
                                <th>Детали</th>
                                {isAdmin && (
                                    <th>Хеш (первые 8 символов)</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map(log => {
                                const door = doorMap[log.doorId];
                                return (
                                    <tr key={log.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            {new Date(log.timestamp).toLocaleString('ru-RU')}
                                        </td>
                                        <td>{log.userName || 'Система'}</td>
                                        <td>
                                            <span style={{
                                                color: log.action === 'break_seal' ? 'red' : 
                                                       log.action === 'user_login_failed' ? 'red' : 'inherit',
                                                fontWeight: (log.action === 'break_seal' || log.action === 'user_login_failed') ? 'bold' : 'normal'
                                            }}>
                                                {actionLabels[log.action] || log.action}
                                            </span>
                                        </td>
                                        <td>
                                            {isAdmin ? (
                                                log.doorId || '—'
                                            ) : (
                                                log.doorName || (door ? door.name : log.doorId || '—')
                                            )}
                                        </td>
                                        <td>{log.details}</td>
                                        {isAdmin && (
                                            <td style={{ fontFamily: 'monospace' }}>
                                                {log.hash ? log.hash.substring(0, 8) + '...' : '—'}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AuditLog;
