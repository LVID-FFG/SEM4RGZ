import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { auditApi, doorApi, userApi } from '../api';
import Spinner from '../components/Spinner';
import { useData } from '../App';
import '../index.css';

const HistoryDetail = () => {
    const { type, id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [logs, setLogs] = useState([]);
    const [entityName, setEntityName] = useState("");
    const [doorMap, setDoorMap] = useState({});
    const { isAdmin, isAuditor, adminPath } = useData();
    
    // Состояния для фильтрации
    const [filterAction, setFilterAction] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOrder, setSortOrder] = useState('desc');

    const basePath = adminPath ? `/${adminPath}` : '';

    // Список действий, которые показываем в истории
    const relevantActions = [
        'install_seal', 'remove_seal', 'break_seal', 'disable_seal', 'enable_seal'
    ];

    // Загружаем информацию о дверях для отображения названий
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

    useEffect(() => {
        loadHistory();
    }, [type, id]);

    async function loadHistory() {
        setLoading(true);
        const auditResult = await auditApi.getAll();
        if (auditResult.error) {
            setError(auditResult.error);
            setLoading(false);
            return;
        }

        let filtered = auditResult.data || [];
        let name = "";

        if (type === 'door') {
            const doorResult = await doorApi.getOne(id);
            if (!doorResult.error && doorResult.data) {
                name = doorResult.data.name;
                setEntityName(`Дверь: ${name} (${doorResult.data.location}, этаж ${doorResult.data.floor})`);
            } else {
                setEntityName(`Дверь (ID: ${id})`);
            }
            // Только события с этой дверью
            filtered = filtered.filter(log => log.doorId === id);
        } else if (type === 'user') {
            const userResult = await userApi.getOne(id);
            if (!userResult.error && userResult.data) {
                name = userResult.data.fullName || userResult.data.username;
                setEntityName(`Пользователь: ${name}`);
            } else {
                setEntityName(`Пользователь (ID: ${id})`);
            }
            // Только события от этого пользователя
            filtered = filtered.filter(log => log.userId === id);
        } else {
            setError('Неизвестный тип');
            setLoading(false);
            return;
        }

        // Фильтруем только действия с пломбами
        filtered = filtered.filter(log => relevantActions.includes(log.action));

        setLogs(filtered);
        setLoading(false);
    }

    // Фильтрация логов на клиенте
    const filteredLogs = useMemo(() => {
        let filtered = [...logs];
        
        // Фильтр по действию
        if (filterAction !== 'all') {
            filtered = filtered.filter(log => log.action === filterAction);
        }
        
        // Поиск по названию двери или ID пломбы
        if (searchTerm.trim()) {
            const searchLower = searchTerm.toLowerCase();
            filtered = filtered.filter(log => {
                // Ищем в названии двери (doorName из БД)
                const doorNameMatch = log.doorName?.toLowerCase().includes(searchLower) || false;
                // Ищем в ID пломбы (в деталях)
                const sealIdMatch = log.details?.toLowerCase().includes(searchLower) || false;
                return doorNameMatch || sealIdMatch;
            });
        }
        
        // Сортировка
        filtered.sort((a, b) => {
            const comparison = new Date(b.timestamp) - new Date(a.timestamp);
            return sortOrder === 'desc' ? comparison : -comparison;
        });
        
        return filtered;
    }, [logs, filterAction, searchTerm, sortOrder, doorMap]);

    const actionLabels = {
        'install_seal': 'Установка пломбы',
        'remove_seal': 'Снятие пломбы',
        'break_seal': 'Взлом пломбы',
        'disable_seal': 'Отключение пломбы',
        'enable_seal': 'Включение пломбы'
    };

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "50px" }}>
                <div className="spinner" style={{ width: '3rem', height: '3rem', borderWidth: '3px' }}></div>
                <span style={{ color: 'var(--gray-500)', fontSize: '1rem', marginLeft: '0.5rem' }}>Загрузка истории...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <div className="alert alert-error">
                    {error}
                </div>
                <button onClick={() => navigate(basePath || '/')} className="btn btn-secondary" style={{ marginTop: "20px" }}>
                    Вернуться
                </button>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <h1>История: {entityName}</h1>
            
            <div className="filters">
                <div className="filter-group">
                    <label>Действие</label>
                    <select 
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value)}
                    >
                        <option value="all">Все</option>
                        <option value="install_seal">Установка пломбы</option>
                        <option value="remove_seal">Снятие пломбы</option>
                        <option value="break_seal">Взлом пломбы</option>
                        <option value="disable_seal">Отключение пломбы</option>
                        <option value="enable_seal">Включение пломбы</option>
                    </select>
                </div>
                
                <div className="filter-group" style={{ flex: 2 }}>
                    <label>Поиск по названию двери</label>
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Введите название двери..."
                    />
                </div>
                
                <div className="filter-group">
                    <label>Сортировка</label>
                    <button 
                        onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                        className="btn btn-secondary"
                        style={{ width: '100%' }}
                    >
                        {sortOrder === 'desc' ? 'Новые сверху' : 'Старые сверху'}
                    </button>
                </div>
                
                <button 
                    onClick={() => {
                        setFilterAction('all');
                        setSearchTerm('');
                    }}
                    className="btn btn-secondary"
                >
                    Сбросить фильтры
                </button>
            </div>

            {filteredLogs.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon"></div>
                    <p>Нет записей, соответствующих фильтрам.</p>
                </div>
            ) : (
                <div className="table-wrapper">
                    <table>
			<thead>
    				<tr>
     	   				<th>Дата и время</th>
        				{type === 'door' ? (
            				<th>Пользователь</th>
        				) : (
            					<th>Дверь</th>
        				)}
        				<th>Действие</th>
        				<th>Детали</th>
    				</tr>
			</thead>
                        <tbody>
                            {filteredLogs.map(log => {
                                return (
                                    <tr key={log.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            {new Date(log.timestamp).toLocaleString('ru-RU')}
                                        </td>
                                        	<td>
                					{type === 'door' ? (
                    					// Для истории двери показываем пользователя
                    					log.userName || 'Система'
                					) : (
                    					// Для истории пользователя показываем дверь
                    					log.doorName ? (
                        				<Link to={`${basePath}/doors/${log.doorId}`} className="table-link">
                            					{log.doorName}
                        				</Link>
                    					) : (
                        				log.doorId || '—'
                   	 					)
                					)}
           					</td>
                                        <td>
                                            <span style={{
                                                color: log.action === 'break_seal' ? 'var(--danger-color)' : 'inherit',
                                                fontWeight: log.action === 'break_seal' ? 'bold' : 'normal'
                                            }}>
                                                {actionLabels[log.action] || log.action}
                                            </span>
                                        </td>
                                        <td>{log.details}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            
            <div className="page-footer">
                <button onClick={() => navigate(basePath || '/')} className="btn btn-secondary">
                    Вернуться
                </button>
            </div>
        </div>
    );
};

export default HistoryDetail;
