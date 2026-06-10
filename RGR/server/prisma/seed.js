const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('Заполнение БД начальными данными...');

    // ===== Пользователи =====
    const users = [
        {
            username: 'admin',
            password: 'admin123',
            role: 'admin',
            fullName: 'Игорь гофман',
            approved: true
        },
        {
            username: 'operator',
            password: '123456',
            role: 'operator',
            fullName: 'Оператор',
            approved: true
        },
        {
            username: 'auditor',
            password: '123456',
            role: 'auditor',
            fullName: 'Аудитор',
            approved: true
        }
    ];

    for (const user of users) {
        const salt = bcrypt.genSaltSync(10);
        await prisma.user.upsert({
            where: { username: user.username },
            update: {},
            create: {
                username: user.username,
                password: bcrypt.hashSync(user.password, salt),
                role: user.role,
                fullName: user.fullName,
                approved: user.approved,
                isDeleted: false
            }
        });
        console.log(`Пользователь ${user.username} создан`);
    }

    // ===== Двери =====
    const doors = [
        { id: '1', name: 'Серверная А', floor: '1', location: 'кабинет 101', type: 'server', x: 50, y: 50, width: 100, height: 50 },
        { id: '2', name: 'Электрощитовая 1', floor: '1', location: 'кабинет 102', type: 'electrical', x: 200, y: 50, width: 100, height: 50 },
        { id: '3', name: 'Склад 1', floor: '1', location: 'кабинет 103', type: 'storage', x: 350, y: 50, width: 100, height: 50 },
        { id: '4', name: 'Офис 101', floor: '1', location: 'кабинет 104', type: 'office', x: 500, y: 50, width: 100, height: 50 },
        { id: '5', name: 'Офис 102', floor: '1', location: 'кабинет 105', type: 'office', x: 650, y: 50, width: 100, height: 50 },
        { id: '6', name: 'Офис 103', floor: '1', location: 'кабинет 106', type: 'office', x: 50, y: 250, width: 100, height: 50 },
        { id: '7', name: 'Офис 104', floor: '1', location: 'кабинет 107', type: 'office', x: 200, y: 250, width: 100, height: 50 },
        { id: '8', name: 'Склад 2', floor: '1', location: 'кабинет 108', type: 'storage', x: 350, y: 250, width: 100, height: 50 },
        { id: '9', name: 'Офис 105', floor: '1', location: 'кабинет 109', type: 'office', x: 500, y: 250, width: 100, height: 50 },
        { id: '10', name: 'Офис 106', floor: '1', location: 'кабинет 110', type: 'office', x: 650, y: 250, width: 100, height: 50 },
        { id: '11', name: 'Серверная Б', floor: '2', location: 'кабинет 201', type: 'server', x: 50, y: 50, width: 100, height: 50 },
        { id: '12', name: 'Электрощитовая 2', floor: '2', location: 'кабинет 202', type: 'electrical', x: 200, y: 50, width: 100, height: 50 },
        { id: '13', name: 'Склад 3', floor: '2', location: 'кабинет 203', type: 'storage', x: 350, y: 50, width: 100, height: 50 },
        { id: '14', name: 'Офис 201', floor: '2', location: 'кабинет 204', type: 'office', x: 500, y: 50, width: 100, height: 50 },
        { id: '15', name: 'Офис 202', floor: '2', location: 'кабинет 205', type: 'office', x: 650, y: 50, width: 100, height: 50 },
        { id: '16', name: 'Офис 203', floor: '2', location: 'кабинет 206', type: 'office', x: 50, y: 250, width: 100, height: 50 },
        { id: '17', name: 'Офис 204', floor: '2', location: 'кабинет 207', type: 'office', x: 200, y: 250, width: 100, height: 50 },
        { id: '18', name: 'Склад 4', floor: '2', location: 'кабинет 208', type: 'storage', x: 350, y: 250, width: 100, height: 50 },
        { id: '19', name: 'Офис 205', floor: '2', location: 'кабинет 209', type: 'office', x: 500, y: 250, width: 100, height: 50 },
        { id: '20', name: 'Офис 206', floor: '2', location: 'кабинет 210', type: 'office', x: 650, y: 250, width: 100, height: 50 },
        { id: '21', name: 'Серверная В', floor: '3', location: 'кабинет 301', type: 'server', x: 50, y: 50, width: 100, height: 50 },
        { id: '22', name: 'Электрощитовая 3', floor: '3', location: 'кабинет 302', type: 'electrical', x: 200, y: 50, width: 100, height: 50 },
        { id: '23', name: 'Склад 5', floor: '3', location: 'кабинет 303', type: 'storage', x: 350, y: 50, width: 100, height: 50 },
        { id: '24', name: 'Офис 301', floor: '3', location: 'кабинет 304', type: 'office', x: 500, y: 50, width: 100, height: 50 },
        { id: '25', name: 'Офис 302', floor: '3', location: 'кабинет 305', type: 'office', x: 650, y: 50, width: 100, height: 50 },
        { id: '26', name: 'Офис 303', floor: '3', location: 'кабинет 306', type: 'office', x: 50, y: 250, width: 100, height: 50 },
        { id: '27', name: 'Офис 304', floor: '3', location: 'кабинет 307', type: 'office', x: 200, y: 250, width: 100, height: 50 },
        { id: '28', name: 'Склад 6', floor: '3', location: 'кабинет 308', type: 'storage', x: 350, y: 250, width: 100, height: 50 },
        { id: '29', name: 'Офис 305', floor: '3', location: 'кабинет 309', type: 'office', x: 500, y: 250, width: 100, height: 50 },
        { id: '30', name: 'Офис 306', floor: '3', location: 'кабинет 310', type: 'office', x: 650, y: 250, width: 100, height: 50 }
    ];

    for (const door of doors) {
        await prisma.door.upsert({
            where: { id: door.id },
            update: {},
            create: {
                id: door.id,
                name: door.name,
                floor: door.floor,
                location: door.location,
                type: door.type,
                x: door.x,
                y: door.y,
                width: door.width,
                height: door.height,
                hasSeal: false,
                description: '',
                responsible: '',
                isDeleted: false
            }
        });
        console.log(`Дверь ${door.name} создана`);
    }

    console.log('БД заполнена!');
}

main()
    .catch(e => {
        console.error('Ошибка:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
