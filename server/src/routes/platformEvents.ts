import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../db/database.js';

export const platformEventsRouter = Router();

type Envelope = {
  eventId: string;
  eventType: 'contract.signed.v1' | 'payment.confirmed.v1';
  occurredAt: string;
  sourceApp: 'sales';
  actorId: string;
  entity: { entityType: 'contract'; entityId: string };
  payload: Record<string, unknown>;
  traceId: string;
};

function requestId(): string {
  return `req_${Date.now().toString(36)}`;
}

function sendError(res: import('express').Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message }, requestId: requestId() });
}

function matchesPrefix(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && value.startsWith(prefix);
}

function isFiniteAmount(value: unknown): value is { currency: string; value: number } {
  return Boolean(value) && typeof value === 'object'
    && typeof (value as { currency?: unknown }).currency === 'string'
    && Number.isFinite((value as { value?: unknown }).value)
    && (value as { value: number }).value >= 0;
}

function requireWorkbenchToken(req: import('express').Request, res: import('express').Response): boolean {
  const expected = process.env.WORKBENCH_API_TOKEN;
  if (!expected) {
    sendError(res, 503, 'INTEGRATION_NOT_CONFIGURED', '未配置 WORKBENCH_API_TOKEN，拒绝接收工作台事件');
    return false;
  }
  const received = req.header('X-Workbench-Token') || '';
  const sameLength = Buffer.byteLength(received) === Buffer.byteLength(expected);
  if (!sameLength || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    sendError(res, 401, 'UNAUTHENTICATED', '工作台事件凭据无效');
    return false;
  }
  return true;
}

function validateEvent(raw: unknown): Envelope | string {
  const event = raw as Partial<Envelope>;
  if (!matchesPrefix(event.eventId, 'evt_') || !matchesPrefix(event.traceId, 'req_') || !matchesPrefix(event.actorId, 'usr_')) {
    return '事件 ID、追踪 ID 或操作者 ID 格式无效';
  }
  if (event.sourceApp !== 'sales' || !event.entity || event.entity.entityType !== 'contract' || !matchesPrefix(event.entity.entityId, 'ctr_')) {
    return '仅接受销售模块发送的合同事件';
  }
  if (event.eventType !== 'contract.signed.v1' && event.eventType !== 'payment.confirmed.v1') return '不支持的事件类型';
  if (!event.payload || typeof event.payload !== 'object' || typeof event.occurredAt !== 'string') return '事件字段不完整';
  return event as Envelope;
}

/**
 * 工作台到财务提成系统的唯一写入口：只创建同步快照，不触碰财务核算主表。
 */
platformEventsRouter.post('/events', (req, res) => {
  if (!requireWorkbenchToken(req, res)) return;
  const event = validateEvent(req.body);
  if (typeof event === 'string') return sendError(res, 422, 'VALIDATION_ERROR', event);

  const db = getDb();
  const inserted = db.prepare(
    'INSERT OR IGNORE INTO platform_event_inbox (event_id, event_type, payload_json) VALUES (?, ?, ?)'
  ).run(event.eventId, event.eventType, JSON.stringify(event));
  if (inserted.changes === 0) {
    return res.json({ data: { accepted: true, duplicate: true }, requestId: requestId() });
  }

  try {
    const payload = event.payload;
    if (event.eventType === 'contract.signed.v1') {
      if (!matchesPrefix(payload.contractId, 'ctr_') || !matchesPrefix(payload.customerId, 'cus_')
        || !matchesPrefix(payload.ownerId, 'usr_') || typeof payload.contractNumber !== 'string'
        || typeof payload.signedAt !== 'string' || !isFiniteAmount(payload.amount)) {
        throw new Error('合同签订事件缺少有效的合同、客户、负责人或金额信息');
      }
      if (payload.contractId !== event.entity.entityId) throw new Error('合同事件实体与 payload.contractId 不一致');
      db.prepare(
        `INSERT INTO platform_contract_snapshots
          (platform_contract_id, contract_no, customer_id, owner_id, currency, amount, signed_at, source_event_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
         ON CONFLICT(platform_contract_id) DO UPDATE SET
           contract_no = excluded.contract_no, customer_id = excluded.customer_id, owner_id = excluded.owner_id,
           currency = excluded.currency, amount = excluded.amount, signed_at = excluded.signed_at,
           source_event_id = excluded.source_event_id, updated_at = datetime('now','localtime')`
      ).run(payload.contractId, payload.contractNumber.trim(), payload.customerId, payload.ownerId,
        payload.amount.currency, payload.amount.value, payload.signedAt, event.eventId);
    } else {
      if (!matchesPrefix(payload.contractId, 'ctr_') || typeof payload.paymentId !== 'string'
        || typeof payload.confirmedAt !== 'string' || !isFiniteAmount(payload.amount)) {
        throw new Error('回款确认事件缺少有效的合同、回款或金额信息');
      }
      if (payload.contractId !== event.entity.entityId) throw new Error('回款事件实体与 payload.contractId 不一致');
      db.prepare(
        `INSERT INTO platform_payment_snapshots
          (payment_id, platform_contract_id, currency, amount, confirmed_at, source_event_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
         ON CONFLICT(payment_id) DO UPDATE SET
           platform_contract_id = excluded.platform_contract_id, currency = excluded.currency, amount = excluded.amount,
           confirmed_at = excluded.confirmed_at, source_event_id = excluded.source_event_id,
           updated_at = datetime('now','localtime')`
      ).run(payload.paymentId, payload.contractId, payload.amount.currency, payload.amount.value, payload.confirmedAt, event.eventId);
    }
  } catch (error) {
    db.prepare('DELETE FROM platform_event_inbox WHERE event_id = ?').run(event.eventId);
    return sendError(res, 422, 'VALIDATION_ERROR', error instanceof Error ? error.message : '事件处理失败');
  }

  return res.status(202).json({ data: { accepted: true, duplicate: false }, requestId: requestId() });
});

// 此查询仅用于工作台联调/审计；它读取同步快照，不读取或改变提成核算数据。
platformEventsRouter.get('/snapshots', (req, res) => {
  if (!requireWorkbenchToken(req, res)) return;
  const db = getDb();
  const contracts = db.prepare('SELECT * FROM platform_contract_snapshots ORDER BY updated_at DESC').all();
  const payments = db.prepare('SELECT * FROM platform_payment_snapshots ORDER BY confirmed_at DESC').all();
  return res.json({ data: { contracts, payments }, requestId: requestId() });
});
