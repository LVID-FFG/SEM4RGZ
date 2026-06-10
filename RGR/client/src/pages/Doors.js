import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useData } from "../App";
import "../index.css";

const Doors = () => {
    const { doors, deleteDoor, isAdmin, isOperator, isAuditor, adminPath } = useData();
    const [deletingId, setDeletingId] = useState(null);
    const [error, setError] = useState("");
    
    const [searchTerm, setSearchTerm] = useState('');
    const [filterFloor, setFilterFloor] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    async function handleDelete(id) {
        if (window.confirm("Удалить эту дверь?")) {
            setDeletingId(id);
            setError("");
            try {
                await deleteDoor(id);
            } catch (error) {
                setError(error.message || "Ошибка при удалении");
            } finally {
                setDeletingId(null);
            }
        }
    }

    const floors = useMemo(() => {
        const uniqueFloors = [...new Set(doors.map(d => d.floor).filter(Boolean))];
        return uniqueFloors;
    }, [doors]);

    const filteredDoors = useMemo(() => {
        return doors.filter(door => {
            if (searchTerm && !door.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                return false;
            }
            if (filterFloor !== 'all' && door.floor !== filterFloor) {
                return false;
            }
            if (filterStatus !== 'all') {
                if (filterStatus === 'hasSeal' && !door.hasSeal) return false;
                if (filterStatus === 'noSeal' && door.hasSeal) return false;
            }
            return true;
        });
    }, [doors, searchTerm, filterFloor, filterStatus]);

    const typeLabels = {
        'server': 'Серверная',
        'electrical': 'Электрощитовая',
        'storage': 'Склад',
        'office': 'Офис',
        'other': 'Другое'
    };

    const basePath = isAdmin && adminPath ? `/${adminPath}` : '';

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h1 style={{ marginBottom: 0 }}>Список дверей</h1>
                {isAdmin && (
                    <Link to={`${basePath}/add-door`}>
                        <button className="btn btn-primary"> Добавить дверь</button>
                    </Link>
                )}
            </div>
            
            {error && (
                <div className="alert alert-error">
                    <span>{error}</span>
                    <button onClick={() => setError('')}>×</button>
                </div>
            )}

            <div className="filters">
                <div className="filter-group">
                    <label>Поиск</label>
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Введите название..."
                    />
                </div>
                
                <div className="filter-group">
                    <label>Этаж</label>
                    <select 
                        value={filterFloor}
                        onChange={(e) => setFilterFloor(e.target.value)}
                    >
                        <option value="all">Все этажи</option>
                        {floors.map(floor => (
                            <option key={floor} value={floor}>{floor}</option>
                        ))}
                    </select>
                </div>
                
                <div className="filter-group">
                    <label>Статус пломбы</label>
                    <select 
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Все</option>
                        <option value="hasSeal">Установлена</option>
                        <option value="noSeal">Отсутствует</option>
                    </select>
                </div>
                
                <button 
                    onClick={() => {
                        setSearchTerm('');
                        setFilterFloor('all');
                        setFilterStatus('all');
                    }}
                    className="btn btn-secondary"
                >
                    Сбросить
                </button>
            </div>

            {filteredDoors.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon"></div>
                    <p>Нет дверей, соответствующих фильтрам.</p>
                </div>
            ) : (
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>Этаж</th>
                                <th>Расположение</th>
                                <th>Тип</th>
                                <th>Статус пломбы</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDoors.map(door => (
                                <tr key={door.id}>
                                    <td>
                                        {(isAdmin || isOperator || isAuditor) ? (
                                            <Link to={`${basePath}/doors/${door.id}`} className="table-link">
                                                {door.name}
                                            </Link>
                                        ) : (
                                            door.name
                                        )}
                                    </td>
                                    <td>{door.floor || '—'}</td>
                                    <td>{door.location || '—'}</td>
                                    <td>{typeLabels[door.type] || door.type || '—'}</td>
                                    <td>
                                        <span className={`seal-status ${door.hasSeal ? 'seal-status-installed' : 'seal-status-absent'}`}>
                                            {door.hasSeal ? 'Установлена' : 'Отсутствует'}
                                        </span>
                                    </td>
                                    <td style={{ whiteSpace: "nowrap" }}>
                                        {(isAdmin || isOperator) && (
                                            <Link to={`${basePath}/doors/${door.id}`} style={{ marginRight: "5px" }}>
                                                <button className="btn btn-primary btn-sm">Подробнее</button>
                                            </Link>
                                        )}
                                        {isAuditor && (
                                            <Link to={`${basePath}/history/door/${door.id}`} style={{ marginRight: "5px" }}>
                                                <button className="btn btn-secondary btn-sm">История</button>
                                            </Link>
                                        )}
                                        {isAdmin && (
                                            <button 
                                                onClick={() => handleDelete(door.id)} 
                                                disabled={deletingId === door.id}
                                                className="btn btn-danger btn-sm"
                                            >
                                                {deletingId === door.id ? "..." : "Удалить"}
                                            </button>
                                        )}
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

export default Doors;