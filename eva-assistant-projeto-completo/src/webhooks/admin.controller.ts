import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { env } from '../config/env';

/**
 * Middleware de autenticação para Admin API.
 * Exige header: Authorization: Bearer <ADMIN_API_KEY>
 */
async function authGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Authorization header required' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  if (token !== env.ADMIN_API_KEY) {
    reply.status(403).send({ error: 'Invalid API key' });
    return;
  }
}

/**
 * Admin API routes — gestão de tenants e analytics.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Aplicar auth guard em todas as rotas admin
  app.addHook('onRequest', authGuard);

  // ============================
  // TENANT MANAGEMENT
  // ============================

  /**
   * GET /api/admin/tenants — Listar todos os tenants
   */
  app.get('/tenants', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { page?: string; limit?: string; plan?: string; active?: string };
    const page = Math.max(1, parseInt(query.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.plan) where.plan = query.plan.toUpperCase();
    if (query.active !== undefined) where.isActive = query.active === 'true';

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          plan: true,
          planExpiresAt: true,
          isActive: true,
          timezone: true,
          createdAt: true,
          _count: {
            select: {
              events: true,
              transactions: true,
              notes: true,
            },
          },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    reply.send({
      data: tenants,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  });

  /**
   * GET /api/admin/tenants/:id — Detalhes de um tenant
   */
  app.get('/tenants/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            events: true,
            transactions: true,
            notes: true,
            budgets: true,
          },
        },
      },
    });

    if (!tenant) {
      reply.status(404).send({ error: 'Tenant not found' });
      return;
    }

    reply.send({ data: tenant });
  });

  /**
   * PATCH /api/admin/tenants/:id — Atualizar tenant (plano, status, etc.)
   */
  const updateTenantSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    plan: z.enum(['BASIC', 'PROFESSIONAL', 'ENTERPRISE']).optional(),
    planExpiresAt: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
    timezone: z.string().optional(),
  });

  app.patch('/tenants/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateTenantSchema.safeParse(request.body);

    if (!body.success) {
      reply.status(400).send({ error: 'Invalid request body', details: body.error.format() });
      return;
    }

    try {
      const data: Record<string, unknown> = { ...body.data };
      if (body.data.planExpiresAt) {
        data.planExpiresAt = new Date(body.data.planExpiresAt);
      }

      const tenant = await prisma.tenant.update({
        where: { id },
        data,
      });

      reply.send({ data: tenant });
    } catch {
      reply.status(404).send({ error: 'Tenant not found' });
    }
  });

  /**
   * DELETE /api/admin/tenants/:id — Desativar tenant (soft delete)
   */
  app.delete('/tenants/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      await prisma.tenant.update({
        where: { id },
        data: { isActive: false },
      });

      reply.send({ message: 'Tenant deactivated' });
    } catch {
      reply.status(404).send({ error: 'Tenant not found' });
    }
  });

  // ============================
  // ANALYTICS
  // ============================

  /**
   * GET /api/admin/analytics/overview — Resumo geral do sistema
   */
  app.get('/analytics/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalTenants,
      activeTenants,
      tenantsThisMonth,
      totalMessages,
      messagesToday,
      messagesThisMonth,
      totalTransactions,
      classifierStats,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { isActive: true } }),
      prisma.tenant.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.messageLog.count(),
      prisma.messageLog.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.messageLog.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.transaction.count(),
      prisma.messageLog.groupBy({
        by: ['classifierSource'],
        _count: true,
        where: { createdAt: { gte: startOfMonth } },
      }),
    ]);

    // Plan distribution
    const planDistribution = await prisma.tenant.groupBy({
      by: ['plan'],
      _count: true,
      where: { isActive: true },
    });

    // Avg processing time
    const avgProcessing = await prisma.messageLog.aggregate({
      _avg: { processingTimeMs: true },
      where: { createdAt: { gte: startOfMonth } },
    });

    // Top intents this month
    const topIntents = await prisma.messageLog.groupBy({
      by: ['classifiedIntent'],
      _count: true,
      where: {
        createdAt: { gte: startOfMonth },
        classifiedIntent: { not: null },
      },
      orderBy: { _count: { classifiedIntent: 'desc' } },
      take: 10,
    });

    reply.send({
      data: {
        tenants: {
          total: totalTenants,
          active: activeTenants,
          newThisMonth: tenantsThisMonth,
          byPlan: planDistribution.reduce((acc, p) => {
            acc[p.plan] = p._count;
            return acc;
          }, {} as Record<string, number>),
        },
        messages: {
          total: totalMessages,
          today: messagesToday,
          thisMonth: messagesThisMonth,
          avgProcessingMs: Math.round(avgProcessing._avg.processingTimeMs || 0),
          classifierUsage: classifierStats.reduce((acc, s) => {
            if (s.classifierSource) acc[s.classifierSource] = s._count;
            return acc;
          }, {} as Record<string, number>),
        },
        transactions: {
          total: totalTransactions,
        },
        topIntents: topIntents.map(i => ({
          intent: i.classifiedIntent,
          count: i._count,
        })),
      },
    });
  });

  /**
   * GET /api/admin/analytics/tenant/:id — Analytics por tenant
   */
  app.get('/analytics/tenant/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      reply.status(404).send({ error: 'Tenant not found' });
      return;
    }

    const [
      messagesThisMonth,
      eventsActive,
      transactionsThisMonth,
      notesTotal,
      intentBreakdown,
    ] = await Promise.all([
      prisma.messageLog.count({
        where: { tenantId: id, createdAt: { gte: startOfMonth } },
      }),
      prisma.event.count({
        where: { tenantId: id, status: 'ACTIVE', deletedAt: null },
      }),
      prisma.transaction.count({
        where: { tenantId: id, date: { gte: startOfMonth } },
      }),
      prisma.note.count({
        where: { tenantId: id, deletedAt: null },
      }),
      prisma.messageLog.groupBy({
        by: ['classifiedIntent'],
        _count: true,
        where: {
          tenantId: id,
          createdAt: { gte: startOfMonth },
          classifiedIntent: { not: null },
        },
        orderBy: { _count: { classifiedIntent: 'desc' } },
      }),
    ]);

    // Financial summary
    const income = await prisma.transaction.aggregate({
      where: { tenantId: id, type: 'INCOME', date: { gte: startOfMonth } },
      _sum: { amount: true },
    });

    const expense = await prisma.transaction.aggregate({
      where: { tenantId: id, type: 'EXPENSE', date: { gte: startOfMonth } },
      _sum: { amount: true },
    });

    reply.send({
      data: {
        tenant: { id: tenant.id, name: tenant.name, phone: tenant.phone, plan: tenant.plan },
        thisMonth: {
          messages: messagesThisMonth,
          events: eventsActive,
          transactions: transactionsThisMonth,
          notes: notesTotal,
          income: Number(income._sum.amount || 0),
          expense: Number(expense._sum.amount || 0),
          balance: Number(income._sum.amount || 0) - Number(expense._sum.amount || 0),
        },
        intentBreakdown: intentBreakdown.map(i => ({
          intent: i.classifiedIntent,
          count: i._count,
        })),
      },
    });
  });
}
