const request = require('supertest');
const app = require('../server');

describe('API Endpoints', () => {
    // ===== Auth =====
    describe('POST /api/login', () => {
        it('should return 400 with missing credentials', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({});
            expect(res.statusCode).toBe(400);
        });
    });

    describe('POST /api/register', () => {
        it('should return 400 with missing fields', async () => {
            const res = await request(app)
                .post('/api/register')
                .send({});
            expect(res.statusCode).toBe(400);
        });
    });

    describe('POST /api/refresh', () => {
        it('should return 403 without refresh token', async () => {
            const res = await request(app)
                .post('/api/refresh')
                .send({});
            expect(res.statusCode).toBe(403);
        });
    });

    describe('POST /api/logout', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/logout');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/forgot-password', () => {
        it('should return 400 without username', async () => {
            const res = await request(app)
                .post('/api/forgot-password')
                .send({});
            expect(res.statusCode).toBe(400);
        });
    });

    describe('POST /api/reset-password', () => {
        it('should return 400 with missing fields', async () => {
            const res = await request(app)
                .post('/api/reset-password')
                .send({});
            expect(res.statusCode).toBe(400);
        });
    });

    describe('POST /api/2fa/verify-code', () => {
        it('should return 400 with missing fields', async () => {
            const res = await request(app)
                .post('/api/2fa/verify-code')
                .send({});
            expect(res.statusCode).toBe(400);
        });
    });

    // ===== Doors =====
    describe('GET /api/doors', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .get('/api/doors');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('GET /api/doors/:id', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .get('/api/doors/1');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/doors', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/doors')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('PUT /api/doors/:id', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .put('/api/doors/1')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('DELETE /api/doors/:id', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .delete('/api/doors/1');
            expect(res.statusCode).toBe(401);
        });
    });

    // ===== Seals =====
    describe('GET /api/seals', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .get('/api/seals');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('GET /api/seals/:doorId', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .get('/api/seals/1');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/seals/install', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/seals/install')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/seals/remove', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/seals/remove')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/seals/break', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/seals/break')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/seals/disable', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/seals/disable')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/seals/enable', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/seals/enable')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    // ===== Audit =====
    describe('GET /api/audit-log', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .get('/api/audit-log');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('GET /api/audit-log/verify', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .get('/api/audit-log/verify');
            expect(res.statusCode).toBe(401);
        });
    });

    // ===== Users =====
    describe('GET /api/users', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .get('/api/users');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('GET /api/users/:id', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .get('/api/users/1');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/users', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('PUT /api/users/:id', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .put('/api/users/1')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('DELETE /api/users/:id', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .delete('/api/users/1');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/users/:id/approve', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/users/1/approve')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/users/:id/2fa/enable', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/users/1/2fa/enable')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('POST /api/users/:id/2fa/disable', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/users/1/2fa/disable')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });

    describe('GET /api/users/:id/2fa/status', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .get('/api/users/1/2fa/status');
            expect(res.statusCode).toBe(401);
        });
    });

    // ===== Alerts =====
    describe('POST /api/alert', () => {
        it('should return 401 without authorization', async () => {
            const res = await request(app)
                .post('/api/alert')
                .send({});
            expect(res.statusCode).toBe(401);
        });
    });
});
