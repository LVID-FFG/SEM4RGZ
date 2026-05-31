// src/pages/FloorMap.js
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../App';
import '../index.css';

const FloorMap = () => {
    const { doors, isAdmin, isOperator, isAuditor, adminPath } = useData();
    const navigate = useNavigate();
    const [selectedFloor, setSelectedFloor] = useState('1');
    const [hoveredDoor, setHoveredDoor] = useState(null);
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [selectedDoor, setSelectedDoor] = useState(null);

    // Базовый путь для ссылок
    const basePath = isAdmin && adminPath ? `/${adminPath}` : '';

    // Получить все этажи из дверей
    const floors = useMemo(() => {
        return [...new Set(doors.map(d => d.floor).filter(Boolean))].sort();
    }, [doors]);

    // Двери на выбранном этаже
    const floorDoors = useMemo(() => {
        return doors.filter(d => d.floor === selectedFloor);
    }, [doors, selectedFloor]);

    // Если нет дверей на этаже, показываем сообщение
    if (floors.length === 0) {
        return (
            <div className="fade-in">
                <h1>Карта помещений</h1>
                <div className="empty-state">
                    <div className="empty-icon"></div>
                    <p>Нет данных о расположении дверей.</p>
                </div>
            </div>
        );
    }

    // Обработчики масштабирования
    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 2));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
    const handleReset = () => {
        setScale(1);
        setPan({ x: 0, y: 0 });
    };

    const handleMouseDown = (e) => {
        const startX = e.clientX - pan.x;
        const startY = e.clientY - pan.y;
        
        const handleMouseMove = (e) => {
            setPan({
                x: e.clientX - startX,
                y: e.clientY - startY
            });
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleDoorClick = (door) => {
        setSelectedDoor(door);
    };

    const handleCloseModal = () => {
        setSelectedDoor(null);
    };

    const typeLabels = {
        'server': 'Серверная',
        'electrical': 'Электрощитовая',
        'storage': 'Склад',
        'office': 'Офис',
        'other': 'Другое'
    };

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h1 style={{ marginBottom: 0 }}>Карта помещений</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleZoomIn} className="btn btn-secondary btn-sm">Zoom+</button>
                    <button onClick={handleZoomOut} className="btn btn-secondary btn-sm">Zoom-</button>
                    <button onClick={handleReset} className="btn btn-secondary btn-sm">Reset</button>
                </div>
            </div>

            {/* Селектор этажа */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {floors.map(floor => (
                    <button
                        key={floor}
                        onClick={() => setSelectedFloor(floor)}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: selectedFloor === floor ? '#4f46e5' : '#e5e7eb',
                            color: selectedFloor === floor ? 'white' : '#374151',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: selectedFloor === floor ? '600' : '400'
                        }}
                    >
                        Этаж {floor}
                    </button>
                ))}
            </div>

            {/* Статистика этажа */}
            <div style={{ 
                display: 'flex', 
                gap: '20px', 
                marginBottom: '15px', 
                padding: '10px 15px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: 'var(--shadow)'
            }}>
                <span>Дверей на этаже: <strong>{floorDoors.length}</strong></span>
                <span>С пломбами: <strong style={{ color: '#10b981' }}>{floorDoors.filter(d => d.hasSeal).length}</strong></span>
                <span>Без пломб: <strong style={{ color: '#f59e0b' }}>{floorDoors.filter(d => !d.hasSeal).length}</strong></span>
            </div>

            {/* Карта */}
            <div 
                style={{ 
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'white',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-lg)',
                    cursor: 'grab'
                }}
                onMouseDown={handleMouseDown}
            >
                <div style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: 'center',
                    transition: 'transform 0.1s ease'
                }}>
                    <svg viewBox="0 0 800 600" style={{ width: '100%', height: 'auto', maxWidth: '800px', margin: '0 auto' }}>
                        {/* Фон этажа */}
                        <rect x="0" y="0" width="800" height="600" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2"/>
                        
                        {/* Сетка */}
                        {Array.from({ length: 9 }).map((_, i) => (
                            <line key={`h${i}`} x1="0" y1={i * 75} x2="800" y2={i * 75} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="5,5"/>
                        ))}
                        {Array.from({ length: 11 }).map((_, i) => (
                            <line key={`v${i}`} x1={i * 80} y1="0" x2={i * 80} y2="600" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="5,5"/>
                        ))}
                        
                        {/* Заголовок этажа */}
                        <text x="400" y="30" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1e293b">
                            Этаж {selectedFloor}
                        </text>
                        
                        {/* Коридор - центральная линия */}
                        <line x1="0" y1="150" x2="800" y2="150" stroke="#94a3b8" strokeWidth="2" strokeDasharray="10,5"/>
                        <line x1="0" y1="350" x2="800" y2="350" stroke="#94a3b8" strokeWidth="2" strokeDasharray="10,5"/>
                        <text x="400" y="140" textAnchor="middle" fontSize="14" fill="#64748b" fontWeight="500">КОРИДОР</text>
                        <text x="400" y="340" textAnchor="middle" fontSize="14" fill="#64748b" fontWeight="500">КОРИДОР</text>
                        
                        {/* Двери */}
                        {floorDoors.map(door => {
                            const isHovered = hoveredDoor === door.id;
                            const sealColor = door.hasSeal ? '#10b981' : '#f59e0b';
                            const sealLabel = door.hasSeal ? 'Y' : 'N';
                            
                            return (
                                <g 
                                    key={door.id} 
                                    onClick={() => handleDoorClick(door)}
                                    onMouseEnter={() => setHoveredDoor(door.id)}
                                    onMouseLeave={() => setHoveredDoor(null)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {/* Тень при наведении */}
                                    {isHovered && (
                                        <rect
                                            x={(door.x || 100) - 5}
                                            y={(door.y || 200) - 5}
                                            width={(door.width || 80) + 10}
                                            height={(door.height || 40) + 10}
                                            fill="rgba(79, 70, 229, 0.1)"
                                            rx="6"
                                        />
                                    )}
                                    
                                    {/* Комната/дверь */}
                                    <rect
                                        x={door.x || 100}
                                        y={door.y || 200}
                                        width={door.width || 80}
                                        height={door.height || 40}
                                        fill={isHovered ? '#818cf8' : sealColor}
                                        stroke="#1e293b"
                                        strokeWidth="2"
                                        rx="4"
                                        style={{ 
                                            transition: 'all 0.2s ease',
                                            filter: isHovered ? 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                                        }}
                                    />
                                    
                                    {/* Название двери */}
                                    <text
                                        x={(door.x || 100) + (door.width || 80) / 2}
                                        y={(door.y || 200) + (door.height || 40) / 2 + 5}
                                        textAnchor="middle"
                                        fontSize="12"
                                        fontWeight="600"
                                        fill="#1e293b"
                                    >
                                        {door.name}
                                    </text>
                                    
                                    {/* Индикатор пломбы */}
                                    <circle
                                        cx={(door.x || 100) + (door.width || 80) - 12}
                                        cy={(door.y || 200) + 12}
                                        r="6"
                                        fill={door.hasSeal ? '#10b981' : '#f59e0b'}
                                        stroke="#047857"
                                        strokeWidth="1"
                                    />
                                    
                                    {/* Метка расположения */}
                                    <text
                                        x={(door.x || 100) + (door.width || 80) / 2}
                                        y={(door.y || 200) + (door.height || 40) + 20}
                                        textAnchor="middle"
                                        fontSize="10"
                                        fill="#64748b"
                                    >
                                        {door.location}
                                    </text>
                                    
                                    {/* Подсказка при наведении */}
                                    {isHovered && (
                                        <foreignObject
                                            x={(door.x || 100) + (door.width || 80) / 2 - 80}
                                            y={(door.y || 200) - 30}
                                            width="160"
                                            height="25"
                                        >
                                            <div style={{
                                                background: '#1e293b',
                                                color: 'white',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                textAlign: 'center',
                                                width: '100%'
                                            }}>
                                                {door.name} — {sealLabel} {door.hasSeal ? 'Пломба есть' : 'Нет пломбы'}
                                            </div>
                                        </foreignObject>
                                    )}
                                </g>
                            );
                        })}
                        
                        {/* Легенда на карте */}
                        <g transform="translate(620, 520)">
                            <rect x="0" y="0" width="160" height="60" fill="white" rx="4" stroke="#94a3b8" strokeWidth="1"/>
                            <text x="10" y="15" fontSize="10" fontWeight="600" fill="#1e293b">Легенда</text>
                            <rect x="10" y="22" width="12" height="12" fill="#10b981" rx="2"/>
                            <text x="28" y="32" fontSize="10" fill="#374151">Пломба есть</text>
                            <rect x="10" y="40" width="12" height="12" fill="#f59e0b" rx="2"/>
                            <text x="28" y="50" fontSize="10" fill="#374151">Нет пломбы</text>
                        </g>
                    </svg>
                </div>
            </div>

            {/* Легенда вне карты */}
            <div style={{ 
                marginTop: '20px', 
                display: 'flex', 
                gap: '20px', 
                flexWrap: 'wrap',
                padding: '10px 15px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: 'var(--shadow)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', backgroundColor: '#10b981', borderRadius: '4px' }}></div>
                    <span>Пломба установлена</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', backgroundColor: '#f59e0b', borderRadius: '4px' }}></div>
                    <span>Пломба отсутствует</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', backgroundColor: '#818cf8', borderRadius: '4px' }}></div>
                    <span>При наведении</span>
                </div>
            </div>

            {/* Кнопка добавления двери для админа */}
            {isAdmin && (
                <div style={{ marginTop: '20px' }}>
                    <button 
                        onClick={() => navigate(`${basePath}/add-door`)}
                        className="btn btn-primary"
                    >
                         Добавить дверь на этаж {selectedFloor}
                    </button>
                </div>
            )}

            {/* Модальное окно */}
            {selectedDoor && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000,
                    padding: '20px'
                }} onClick={handleCloseModal}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '2rem',
                        maxWidth: '500px',
                        width: '100%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        maxHeight: '90vh',
                        overflow: 'auto'
                    }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ marginBottom: 0 }}>{selectedDoor.name}</h2>
                            <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>×</button>
                        </div>
                        
                        <div style={{ marginBottom: '1rem' }}>
                            <p style={{ margin: '0.25rem 0' }}><strong>Расположение:</strong> {selectedDoor.location}</p>
                            <p style={{ margin: '0.25rem 0' }}><strong>Этаж:</strong> {selectedDoor.floor}</p>
                            <p style={{ margin: '0.25rem 0' }}><strong>Тип:</strong> {typeLabels[selectedDoor.type] || selectedDoor.type || '—'}</p>
                            <p style={{ margin: '0.25rem 0' }}><strong>Описание:</strong> {selectedDoor.description || '—'}</p>
                            <p style={{ margin: '0.25rem 0' }}><strong>Ответственный:</strong> {selectedDoor.responsible || '—'}</p>
                            <p style={{ margin: '0.25rem 0' }}>
                                <strong>Статус пломбы:</strong> 
                                <span style={{ 
                                    color: selectedDoor.hasSeal ? '#10b981' : '#f59e0b',
                                    fontWeight: 'bold',
                                    marginLeft: '5px'
                                }}>
                                    {selectedDoor.hasSeal ? 'Установлена' : 'Отсутствует'}
                                </span>
                            </p>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {(isAdmin || isOperator || isAuditor) && (
                                <button 
                                    onClick={() => {
                                        handleCloseModal();
                                        navigate(`${basePath}/doors/${selectedDoor.id}`);
                                    }}
                                    className="btn btn-primary"
                                >
                                    Подробнее
                                </button>
                            )}
                            {isAuditor && (
                                <button 
                                    onClick={() => {
                                        handleCloseModal();
                                        navigate(`${basePath}/history/door/${selectedDoor.id}`);
                                    }}
                                    className="btn btn-secondary"
                                >
                                    История
                                </button>
                            )}
                            <button onClick={handleCloseModal} className="btn btn-secondary">
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FloorMap;