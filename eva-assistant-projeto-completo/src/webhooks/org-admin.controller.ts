import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { getOrgPlanLimits } from '../middleware/organization-resolver';
import * as crypto from 'crypto';

// ============================================
// AUTH MIDDLEWARE
// ============================================

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

// ============================================
// HELPERS
// ============================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

// Hash simples para senhas (bcrypt seria melhor, mas mantemos leve)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'eva-salt-2026').digest('hex');
}

// ============================================
// ROTAS DA API ADMIN MULTI-EMPRESA
// ============================================

export async function orgAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authGuard);

  // ============================
  // ORGANIZATIONS CRUD
  // ============================

  /**
   * GET /api/org/organizations — Listar todas as organizações
   */
  app.get('/organizations', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { page?: string; limit?: string; plan?: string };
    const page = Math.max(1, parseInt(query.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.plan) where.plan = query.plan.toUpperCase();

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              instances: true,
              members: true,
              knowledgeDocs: true,
            },
          },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    reply.send({
      data: orgs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  /**
   * POST /api/org/organizations — Criar nova organização
   */
  const createOrgSchema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    phone: z.string().optional(),
    plan: z.enum(['STARTER', 'BUSINESS', 'ENTERPRISE']).default('STARTER'),
    systemPrompt: z.string().optional(),
    welcomeMessage: z.string().optional(),
    businessHours: z.record(z.string()).optional(),
    // Dados do primeiro membro (dono)
    ownerName: z.string().min(2),
    ownerEmail: z.string().email(),
    ownerPassword: z.string().min(8),
  });

  app.post('/organizations', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createOrgSchema.safeParse(request.body);
    if (!body.success) {
      reply.status(400).send({ error: 'Invalid request', details: body.error.format() });
      return;
    }

    const { ownerName, ownerEmail, ownerPassword, ...orgData } = body.data;

    // Gerar slug único
    let slug = generateSlug(orgData.name);
    const existingSlug = await prisma.organization.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    try {
      // Criar organização + membro dono em transação
      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            ...orgData,
            slug,
            businessHours: orgData.businessHours || undefined,
          },
        });

        const member = await tx.orgMember.create({
          data: {
            orgId: org.id,
            name: ownerName,
            email: ownerEmail,
            passwordHash: hashPassword(ownerPassword),
            role: 'OWNER',
          },
        });

        return { org, member };
      });

      reply.status(201).send({
        data: {
          organization: result.org,
          owner: {
            id: result.member.id,
            name: result.member.name,
            email: result.member.email,
            role: result.member.role,
          },
        },
      });
    } catch (error: unknown) {
      const prismaError = error as { code?: string; meta?: { target?: string[] } };
      if (prismaError.code === 'P2002') {
        reply.status(409).send({ error: `Já existe uma organização com este ${prismaError.meta?.target?.[0] || 'campo'}` });
      } else {
        throw error;
      }
    }
  });

  /**
   * GET /api/org/organizations/:id — Detalhes de uma organização
   */
  app.get('/organizations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        instances: {
          select: {
            id: true,
            instanceName: true,
            phone: true,
            displayName: true,
            status: true,
            createdAt: true,
          },
        },
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
          },
        },
        _count: {
          select: {
            knowledgeDocs: true,
          },
        },
      },
    });

    if (!org) {
      reply.status(404).send({ error: 'Organization not found' });
      return;
    }

    // Adicionar limites do plano
    const planLimits = getOrgPlanLimits(org.plan);

    reply.send({
      data: {
        ...org,
        planLimits,
      },
    });
  });

  /**
   * PATCH /api/org/organizations/:id — Atualizar organização
   */
  const updateOrgSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    plan: z.enum(['STARTER', 'BUSINESS', 'ENTERPRISE']).optional(),
    planExpiresAt: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
    systemPrompt: z.string().optional(),
    welcomeMessage: z.string().optional(),
    businessHours: z.record(z.string()).optional(),
  });

  app.patch('/organizations/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateOrgSchema.safeParse(request.body);
    if (!body.success) {
      reply.status(400).send({ error: 'Invalid request', details: body.error.format() });
      return;
    }

    try {
      const data: Record<string, unknown> = { ...body.data };
      if (body.data.planExpiresAt) {
        data.planExpiresAt = new Date(body.data.planExpiresAt);
      }
      if (body.data.businessHours) {
        data.businessHours = body.data.businessHours;
      }

      const org = await prisma.organization.update({
        where: { id },
        data,
      });

      reply.send({ data: org });
    } catch {
      reply.status(404).send({ error: 'Organization not found' });
    }
  });

  // ============================
  // INSTANCES CRUD
  // ============================

  /**
   * POST /api/org/organizations/:orgId/instances — Adicionar instância WhatsApp
   */
  const createInstanceSchema = z.object({
    instanceName: z.string().min(1).max(50),
    phone: z.string().min(10),
    displayName: z.string().optional(),
  });

  app.post('/organizations/:orgId/instances', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.params as { orgId: string };
    const body = createInstanceSchema.safeParse(request.body);
    if (!body.success) {
      reply.status(400).send({ error: 'Invalid request', details: body.error.format() });
      return;
    }

    // Verificar se a organização existe
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      reply.status(404).send({ error: 'Organization not found' });
      return;
    }

    // Verificar limite de instâncias do plano
    const limits = getOrgPlanLimits(org.plan);
    const currentInstances = await prisma.instance.count({ where: { orgId } });

    if (currentInstances >= limits.maxInstances) {
      reply.status(403).send({
        error: `Plano ${org.plan} permite no máximo ${limits.maxInstances} instância(s). Faça upgrade para adicionar mais.`,
      });
      return;
    }

    try {
      const instance = await prisma.instance.create({
        data: {
          orgId,
          instanceName: body.data.instanceName,
          phone: body.data.phone,
          displayName: body.data.displayName,
          status: 'DISCONNECTED',
        },
      });

      reply.status(201).send({ data: instance });
    } catch (error: unknown) {
      const prismaError = error as { code?: string; meta?: { target?: string[] } };
      if (prismaError.code === 'P2002') {
        reply.status(409).send({ error: `Já existe uma instância com este ${prismaError.meta?.target?.[0] || 'campo'}` });
      } else {
        throw error;
      }
    }
  });

  /**
   * GET /api/org/organizations/:orgId/instances — Listar instâncias
   */
  app.get('/organizations/:orgId/instances', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.params as { orgId: string };

    const instances = await prisma.instance.findMany({
      where: { orgId },
      include: {
        _count: {
          select: { tenants: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    reply.send({ data: instances });
  });

  /**
   * PATCH /api/org/instances/:id — Atualizar instância
   */
  app.patch('/instances/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const updateSchema = z.object({
      displayName: z.string().optional(),
      status: z.enum(['CONNECTED', 'DISCONNECTED', 'CONNECTING', 'BANNED']).optional(),
      webhookUrl: z.string().url().optional(),
    });
    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      reply.status(400).send({ error: 'Invalid request' });
      return;
    }

    try {
      const instance = await prisma.instance.update({
        where: { id },
        data: body.data,
      });
      reply.send({ data: instance });
    } catch {
      reply.status(404).send({ error: 'Instance not found' });
    }
  });

  /**
   * DELETE /api/org/instances/:id — Remover instância
   */
  app.delete('/instances/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.instance.delete({ where: { id } });
      reply.send({ message: 'Instance removed' });
    } catch {
      reply.status(404).send({ error: 'Instance not found' });
    }
  });

  // ============================
  // MEMBERS CRUD
  // ============================

  /**
   * POST /api/org/organizations/:orgId/members — Adicionar membro
   */
  const createMemberSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).default('OPERATOR'),
  });

  app.post('/organizations/:orgId/members', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.params as { orgId: string };
    const body = createMemberSchema.safeParse(request.body);
    if (!body.success) {
      reply.status(400).send({ error: 'Invalid request', details: body.error.format() });
      return;
    }

    // Verificar limite de membros
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      reply.status(404).send({ error: 'Organization not found' });
      return;
    }

    const limits = getOrgPlanLimits(org.plan);
    const currentMembers = await prisma.orgMember.count({ where: { orgId } });

    if (currentMembers >= limits.membersMax) {
      reply.status(403).send({
        error: `Plano ${org.plan} permite no máximo ${limits.membersMax} membros.`,
      });
      return;
    }

    try {
      const member = await prisma.orgMember.create({
        data: {
          orgId,
          name: body.data.name,
          email: body.data.email,
          passwordHash: hashPassword(body.data.password),
          role: body.data.role,
        },
      });

      reply.status(201).send({
        data: {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
        },
      });
    } catch (error: unknown) {
      const prismaError = error as { code?: string };
      if (prismaError.code === 'P2002') {
        reply.status(409).send({ error: 'Este email já está cadastrado nesta organização' });
      } else {
        throw error;
      }
    }
  });

  /**
   * GET /api/org/organizations/:orgId/members — Listar membros
   */
  app.get('/organizations/:orgId/members', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.params as { orgId: string };

    const members = await prisma.orgMember.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    reply.send({ data: members });
  });

  // ============================
  // KNOWLEDGE DOCS CRUD
  // ============================

  /**
   * POST /api/org/organizations/:orgId/knowledge — Adicionar documento de conhecimento
   */
  const createKnowledgeSchema = z.object({
    title: z.string().min(2).max(200),
    content: z.string().min(10),
    category: z.string().default('geral'),
    tags: z.array(z.string()).default([]),
  });

  app.post('/organizations/:orgId/knowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.params as { orgId: string };
    const body = createKnowledgeSchema.safeParse(request.body);
    if (!body.success) {
      reply.status(400).send({ error: 'Invalid request', details: body.error.format() });
      return;
    }

    // Verificar limite de docs
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      reply.status(404).send({ error: 'Organization not found' });
      return;
    }

    const limits = getOrgPlanLimits(org.plan);
    const currentDocs = await prisma.knowledgeDoc.count({ where: { orgId } });

    if (currentDocs >= limits.knowledgeDocsMax) {
      reply.status(403).send({
        error: `Plano ${org.plan} permite no máximo ${limits.knowledgeDocsMax} documentos na base de conhecimento.`,
      });
      return;
    }

    const doc = await prisma.knowledgeDoc.create({
      data: {
        orgId,
        title: body.data.title,
        content: body.data.content,
        category: body.data.category,
        tags: body.data.tags,
      },
    });

    reply.status(201).send({ data: doc });
  });

  /**
   * GET /api/org/organizations/:orgId/knowledge — Listar documentos
   */
  app.get('/organizations/:orgId/knowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orgId } = request.params as { orgId: string };
    const query = request.query as { category?: string; page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));

    const where: Record<string, unknown> = { orgId, isActive: true };
    if (query.category) where.category = query.category;

    const [docs, total] = await Promise.all([
      prisma.knowledgeDoc.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.knowledgeDoc.count({ where }),
    ]);

    reply.send({
      data: docs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  });

  /**
   * PATCH /api/org/knowledge/:id — Atualizar documento
   */
  app.patch('/knowledge/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const updateSchema = z.object({
      title: z.string().min(2).optional(),
      content: z.string().min(10).optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
    });
    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      reply.status(400).send({ error: 'Invalid request' });
      return;
    }

    try {
      const doc = await prisma.knowledgeDoc.update({
        where: { id },
        data: body.data,
      });
      reply.send({ data: doc });
    } catch {
      reply.status(404).send({ error: 'Knowledge doc not found' });
    }
  });

  /**
   * DELETE /api/org/knowledge/:id — Desativar documento (soft delete)
   */
  app.delete('/knowledge/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.knowledgeDoc.update({
        where: { id },
        data: { isActive: false },
      });
      reply.send({ message: 'Knowledge doc deactivated' });
    } catch {
      reply.status(404).send({ error: 'Knowledge doc not found' });
    }
  });

  // ============================
  // ANALYTICS MULTI-EMPRESA
  // ============================

  /**
   * GET /api/org/analytics/overview — Visão geral de todas as organizações
   */
  app.get('/analytics/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrgs,
      activeOrgs,
      totalInstances,
      totalMembers,
      planDistribution,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { isActive: true } }),
      prisma.instance.count(),
      prisma.orgMember.count(),
      prisma.organization.groupBy({
        by: ['plan'],
        _count: true,
        where: { isActive: true },
      }),
    ]);

    reply.send({
      data: {
        organizations: {
          total: totalOrgs,
          active: activeOrgs,
          byPlan: planDistribution.reduce((acc, p) => {
            acc[p.plan] = p._count;
            return acc;
          }, {} as Record<string, number>),
        },
        instances: { total: totalInstances },
        members: { total: totalMembers },
      },
    });
  });

  /**
   * GET /api/org/analytics/organization/:id — Analytics de uma organização
   */
  app.get('/analytics/organization/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        instances: { select: { id: true } },
      },
    });

    if (!org) {
      reply.status(404).send({ error: 'Organization not found' });
      return;
    }

    const instanceIds = org.instances.map((i) => i.id);

    // Buscar tenants vinculados
    const tenants = await prisma.tenant.findMany({
      where: { instanceId: { in: instanceIds } },
      select: { id: true },
    });
    const tenantIds = tenants.map((t) => t.id);

    const [
      messagesThisMonth,
      totalConversations,
      knowledgeDocs,
    ] = await Promise.all([
      prisma.messageLog.count({
        where: {
          tenantId: { in: tenantIds },
          createdAt: { gte: startOfMonth },
        },
      }),
      prisma.conversation.count({
        where: {
          config: { tenantId: { in: tenantIds } },
        },
      }),
      prisma.knowledgeDoc.count({
        where: { orgId: id, isActive: true },
      }),
    ]);

    const planLimits = getOrgPlanLimits(org.plan);

    reply.send({
      data: {
        organization: { id: org.id, name: org.name, plan: org.plan },
        thisMonth: {
          messages: messagesThisMonth,
          messageLimit: planLimits.messagesPerMonth,
          messageUsagePercent: planLimits.messagesPerMonth === Infinity
            ? 0
            : Math.round((messagesThisMonth / planLimits.messagesPerMonth) * 100),
        },
        totals: {
          instances: instanceIds.length,
          customers: tenantIds.length,
          conversations: totalConversations,
          knowledgeDocs,
        },
      },
    });
  });
}
