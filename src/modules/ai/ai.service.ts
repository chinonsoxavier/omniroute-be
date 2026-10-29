import { type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { round2, round3, toNumber } from '../../common/money';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { TelemetryService, type LiveTelemetry } from '../telemetry/telemetry.service';
import type { CopilotInput, ReportInput } from './ai.schemas';

type StructuredType =
  | 'products'
  | 'items'
  | 'kpis'
  | 'po_draft'
  | 'markdown_plan'
  | 'audit_report'
  | 'chart';

interface StructuredAction {
  label: string;
  actionId: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

interface StructuredData {
  type: StructuredType;
  title?: string;
  items?: unknown[];
  metrics?: Record<string, string | number>;
  actions?: StructuredAction[];
}

export interface CopilotResponse {
  id: string;
  sender: 'ai';
  text: string;
  timestamp: string;
  structuredData?: StructuredData;
}

interface CopilotContext {
  facilityName: string;
  kpis: LiveTelemetry;
  lowStock: Array<{ sku: string; name: string; currentStock: number; reorderPoint: number; unit: string }>;
  expiring: Array<{ sku: string; name: string; daysUntilExpiry: number; currentStock: number; unit: string }>;
  deadStock: Array<{ sku: string; name: string; daysIdle: number; stock: number; unit: string; tiedCapital: number }>;
  topProducts: Array<{ name: string; revenueMonth: number; unitsSoldMonth: number }>;
}

export class AiService {
  private readonly telemetry: TelemetryService;

  constructor(private readonly db: PrismaClient) {
    this.telemetry = new TelemetryService(db);
  }

  private async buildContext(facilityId: string): Promise<CopilotContext> {
    const soon = new Date(Date.now() + 3 * 86400000);
    const [live, facility, products, deadStock, topProducts] = await Promise.all([
      this.telemetry.computeLive(facilityId),
      this.db.facility.findUnique({ where: { id: facilityId } }),
      this.db.product.findMany({
        where: { facilityId, active: true },
        select: {
          sku: true,
          name: true,
          currentStock: true,
          reorderPoint: true,
          criticalThreshold: true,
          unit: true,
          expiryDate: true,
        },
      }),
      this.db.deadStockAlert.findMany({
        where: { facilityId },
        orderBy: { daysIdle: 'desc' },
        take: 10,
      }),
      this.db.product.findMany({
        where: { facilityId, active: true },
        orderBy: { revenueMonth: 'desc' },
        take: 6,
        select: { name: true, revenueMonth: true, unitsSoldMonth: true },
      }),
    ]);

    const lowStock = products
      .filter((p) => toNumber(p.currentStock) <= toNumber(p.reorderPoint))
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        currentStock: round3(toNumber(p.currentStock)),
        reorderPoint: round3(toNumber(p.reorderPoint)),
        unit: p.unit,
      }));

    const expiring = products
      .filter((p) => p.expiryDate && p.expiryDate <= soon)
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        daysUntilExpiry: Math.max(
          0,
          Math.ceil((p.expiryDate!.getTime() - Date.now()) / 86400000),
        ),
        currentStock: round3(toNumber(p.currentStock)),
        unit: p.unit,
      }));

    return {
      facilityName: facility?.name ?? 'Facility',
      kpis: {
        todayGrossSales: live.todayGrossSales,
        todayTargetSales: live.todayTargetSales,
        totalTransactions: live.totalTransactions,
        avgBasketSize: live.avgBasketSize,
        totalSKUs: live.totalSKUs,
        storeLedgerValue: live.storeLedgerValue,
        inStockFillRate: live.inStockFillRate,
        stockoutsCount: live.stockoutsCount,
        lowBufferCount: live.lowBufferCount,
        shrinkageRiskAmount: live.shrinkageRiskAmount,
        perishablesAtRiskCount: live.perishablesAtRiskCount,
        salesGrowthVsYest: live.salesGrowthVsYest,
      },
      lowStock: lowStock.slice(0, 12),
      expiring: expiring.slice(0, 12),
      deadStock: deadStock.map((d) => ({
        sku: d.sku,
        name: d.productName,
        daysIdle: d.daysIdle,
        stock: round3(toNumber(d.stock)),
        unit: d.unit,
        tiedCapital: round2(toNumber(d.tiedCapital)),
      })),
      topProducts: topProducts.map((p) => ({
        name: p.name,
        revenueMonth: round2(toNumber(p.revenueMonth)),
        unitsSoldMonth: p.unitsSoldMonth,
      })),
    };
  }

  private detectIntent(message: string) {
    const m = message.toLowerCase();
    return {
      greeting: /^(hi|hello|hey|good (morning|afternoon|evening))/.test(m),
      lowStock: /(low stock|reorder|replenish|restock|out of stock|below|buffer|threshold)/.test(m),
      deadStock: /(dead stock|slow mov|idle|tied capital|markdown|mark down|stagnant)/.test(m),
      expiring: /(expir|perishable|spoil|shelf.?life|fresh)/.test(m),
      sales: /(sales|revenue|sold|today|turnover|basket|transaction)/.test(m),
      margin: /(margin|profit|cost|gross)/.test(m),
      audit: /(audit|floor|count|cycle|discrepanc)/.test(m),
      purchaseOrder: /(purchase order|auto.?po|draft po|\bpo\b|replenish)/.test(m),
      supplier: /(supplier|vendor|lead time)/.test(m),
    };
  }

  private ruleResponse(context: CopilotContext, message: string): CopilotResponse {
    const intent = this.detectIntent(message);
    const timestamp = new Date().toISOString();
    const id = randomUUID();

    if (intent.greeting) {
      return {
        id,
        sender: 'ai',
        timestamp,
        text: `Hello — I'm your OmniStock copilot for ${context.facilityName}. I can review stock health, draft replenishment orders, flag expiring inventory, and break down sales and margin performance. What would you like to explore?`,
        structuredData: {
          type: 'kpis',
          title: 'Shift snapshot',
          metrics: {
            'Gross sales today': `$${context.kpis.todayGrossSales.toLocaleString()}`,
            Transactions: context.kpis.totalTransactions,
            'In-stock fill rate': `${context.kpis.inStockFillRate}%`,
            'Low buffer SKUs': context.kpis.lowBufferCount,
          },
        },
      };
    }

    if (intent.lowStock) {
      const items = context.lowStock.map((p) => ({
        sku: p.sku,
        name: p.name,
        currentStock: p.currentStock,
        reorderPoint: p.reorderPoint,
        unit: p.unit,
      }));
      return {
        id,
        sender: 'ai',
        timestamp,
        text: items.length
          ? `I found ${items.length} SKU${items.length === 1 ? '' : 's'} at or below reorder thresholds. I can draft purchase orders to restore full buffer automatically.`
          : 'Good news — every SKU is currently above its reorder threshold. No replenishment required right now.',
        structuredData: {
          type: 'products',
          title: 'Replenishment candidates',
          items,
          actions: items.length
            ? [{ label: 'Auto-draft POs', actionId: 'auto_draft_po', variant: 'primary' }]
            : undefined,
        },
      };
    }

    if (intent.deadStock) {
      const items = context.deadStock.map((d) => ({
        sku: d.sku,
        name: d.name,
        daysIdle: d.daysIdle,
        stock: d.stock,
        unit: d.unit,
        tiedCapital: d.tiedCapital,
      }));
      const tied = round2(items.reduce((sum, i) => sum + i.tiedCapital, 0));
      return {
        id,
        sender: 'ai',
        timestamp,
        text: items.length
          ? `${items.length} SKU${items.length === 1 ? '' : 's'} are flagged as dead stock, tying up $${tied.toLocaleString()} in capital. I recommend markdowns or reallocation to free working capital.`
          : 'No dead stock detected. Inventory velocity looks healthy.',
        structuredData: {
          type: 'markdown_plan',
          title: 'Dead stock markdown plan',
          items,
          metrics: { 'Tied capital': `$${tied.toLocaleString()}`, 'SKUs flagged': items.length },
          actions: items.length
            ? [{ label: 'Resolve dead stock', actionId: 'resolve_dead_stock', variant: 'primary' }]
            : undefined,
        },
      };
    }

    if (intent.expiring) {
      const items = context.expiring.map((p) => ({
        sku: p.sku,
        name: p.name,
        daysUntilExpiry: p.daysUntilExpiry,
        currentStock: p.currentStock,
        unit: p.unit,
      }));
      return {
        id,
        sender: 'ai',
        timestamp,
        text: items.length
          ? `${items.length} perishable SKU${items.length === 1 ? '' : 's'} expire within 3 days. A timely markdown protects margin and reduces spoilage.`
          : 'No perishable SKUs are within the 3-day expiry window.',
        structuredData: {
          type: 'products',
          title: 'Expiring soon',
          items,
          actions: items.length
            ? [{ label: 'Apply perishable markdown', actionId: 'apply_perishable_markdown', variant: 'primary' }]
            : undefined,
        },
      };
    }

    if (intent.sales) {
      return {
        id,
        sender: 'ai',
        timestamp,
        text: `Today ${context.facilityName} has done $${context.kpis.todayGrossSales.toLocaleString()} across ${context.kpis.totalTransactions} transactions (avg basket $${context.kpis.avgBasketSize}). Sales are ${context.kpis.salesGrowthVsYest >= 0 ? 'up' : 'down'} ${Math.abs(context.kpis.salesGrowthVsYest)}% vs yesterday.`,
        structuredData: {
          type: 'kpis',
          title: 'Sales performance',
          metrics: {
            'Gross sales': `$${context.kpis.todayGrossSales.toLocaleString()}`,
            Transactions: context.kpis.totalTransactions,
            'Avg basket': `$${context.kpis.avgBasketSize}`,
            'Vs yesterday': `${context.kpis.salesGrowthVsYest}%`,
          },
          items: context.topProducts,
        },
      };
    }

    if (intent.margin) {
      return {
        id,
        sender: 'ai',
        timestamp,
        text: `Store ledger value is $${context.kpis.storeLedgerValue.toLocaleString()}. Shrinkage risk sits at $${context.kpis.shrinkageRiskAmount.toLocaleString()} across ${context.kpis.perishablesAtRiskCount} perishable SKUs.`,
        structuredData: {
          type: 'audit_report',
          title: 'Margin & capital audit',
          metrics: {
            'Ledger value': `$${context.kpis.storeLedgerValue.toLocaleString()}`,
            'Shrinkage risk': `$${context.kpis.shrinkageRiskAmount.toLocaleString()}`,
            'Perishables at risk': context.kpis.perishablesAtRiskCount,
            'Fill rate': `${context.kpis.inStockFillRate}%`,
          },
          actions: [{ label: 'Run margin audit', actionId: 'resolve_dead_stock', variant: 'secondary' }],
        },
      };
    }

    if (intent.audit) {
      return {
        id,
        sender: 'ai',
        timestamp,
        text: `I can run an automated floor audit across all aisles. It reconciles shelf counts against system inventory, flags discrepancies, and logs every adjustment to the audit trail.`,
        structuredData: {
          type: 'audit_report',
          title: 'Floor audit ready',
          metrics: {
            'SKUs scanned': context.kpis.totalSKUs,
            'Stockouts': context.kpis.stockoutsCount,
            'Low buffer': context.kpis.lowBufferCount,
          },
          actions: [{ label: 'Run floor audit', actionId: 'run_floor_audit', variant: 'primary' }],
        },
      };
    }

    if (intent.purchaseOrder) {
      return {
        id,
        sender: 'ai',
        timestamp,
        text: `I can build purchase orders from every SKU at or below its reorder point, grouped by supplier with lead-time-aware ETAs.`,
        structuredData: {
          type: 'po_draft',
          title: 'Suggested replenishment',
          items: context.lowStock,
          actions: [{ label: 'Auto-draft POs', actionId: 'auto_draft_po', variant: 'primary' }],
        },
      };
    }

    return {
      id,
      sender: 'ai',
      timestamp,
      text: `Here's the current operational snapshot for ${context.facilityName}. Ask me about low stock, dead stock, expiring perishables, sales performance, or margin.`,
      structuredData: {
        type: 'kpis',
        title: 'Operations overview',
        metrics: {
          'Gross sales': `$${context.kpis.todayGrossSales.toLocaleString()}`,
          'Total SKUs': context.kpis.totalSKUs,
          'Fill rate': `${context.kpis.inStockFillRate}%`,
          'Stockouts': context.kpis.stockoutsCount,
          'Low buffer': context.kpis.lowBufferCount,
          'Shrinkage risk': `$${context.kpis.shrinkageRiskAmount.toLocaleString()}`,
        },
        actions: [
          { label: 'Auto-draft POs', actionId: 'auto_draft_po', variant: 'primary' },
          { label: 'Run floor audit', actionId: 'run_floor_audit', variant: 'secondary' },
        ],
      },
    };
  }

  private async openAiAnswer(context: CopilotContext, input: CopilotInput): Promise<string | null> {
    if (!env.OPENAI_API_KEY) return null;
    try {
      const systemPrompt =
        'You are OmniStock Copilot, an expert grocery retail operations assistant. Answer concisely (max 3 sentences) using ONLY the provided store data. Be specific with numbers.';
      const contextMessage = `Store data (JSON):\n${JSON.stringify(context)}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          temperature: 0.3,
          max_tokens: 300,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'system', content: contextMessage },
            ...(input.history ?? []).map((h) => ({
              role: h.sender === 'user' ? 'user' : 'assistant',
              content: h.text,
            })),
            { role: 'user', content: input.message },
          ],
        }),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'openai request failed');
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      logger.warn({ err }, 'openai call error');
      return null;
    }
  }

  async copilot(facilityId: string, input: CopilotInput): Promise<CopilotResponse> {
    const context = await this.buildContext(facilityId);
    const base = this.ruleResponse(context, input.message);
    const aiText = await this.openAiAnswer(context, input);
    if (aiText) base.text = aiText;
    return base;
  }

  async report(facilityId: string, input: ReportInput): Promise<CopilotResponse> {
    const context = await this.buildContext(facilityId);
    const timestamp = new Date().toISOString();
    const id = randomUUID();

    if (input.type === 'shift_brief') {
      return {
        id,
        sender: 'ai',
        timestamp,
        text: `Executive shift brief for ${context.facilityName}: $${context.kpis.todayGrossSales.toLocaleString()} in gross sales, ${context.kpis.inStockFillRate}% fill rate, ${context.kpis.stockoutsCount} stockouts, and $${context.kpis.shrinkageRiskAmount.toLocaleString()} in at-risk perishable capital.`,
        structuredData: {
          type: 'kpis',
          title: 'Executive shift brief',
          metrics: { ...context.kpis },
          items: context.topProducts,
        },
      };
    }

    if (input.type === 'floor_audit') {
      return {
        id,
        sender: 'ai',
        timestamp,
        text: `Floor audit: ${context.lowStock.length} SKUs at or below reorder threshold, ${context.expiring.length} expiring within 3 days, and ${context.deadStock.length} dead-stock flags across all aisles.`,
        structuredData: {
          type: 'audit_report',
          title: '18-aisle floor audit',
          items: [...context.lowStock, ...context.expiring],
          metrics: {
            'Low stock SKUs': context.lowStock.length,
            Expiring: context.expiring.length,
            'Dead stock': context.deadStock.length,
          },
          actions: [{ label: 'Auto-draft POs', actionId: 'auto_draft_po', variant: 'primary' }],
        },
      };
    }

    const tied = round2(context.deadStock.reduce((sum, d) => sum + d.tiedCapital, 0));
    return {
      id,
      sender: 'ai',
      timestamp,
      text: `Margin audit: $${context.kpis.storeLedgerValue.toLocaleString()} in ledger value, $${tied.toLocaleString()} tied up in dead stock, and $${context.kpis.shrinkageRiskAmount.toLocaleString()} at spoilage risk.`,
      structuredData: {
        type: 'markdown_plan',
        title: 'Margin audit',
        items: context.deadStock,
        metrics: {
          'Ledger value': `$${context.kpis.storeLedgerValue.toLocaleString()}`,
          'Dead stock capital': `$${tied.toLocaleString()}`,
          'Shrinkage risk': `$${context.kpis.shrinkageRiskAmount.toLocaleString()}`,
        },
        actions: [{ label: 'Resolve dead stock', actionId: 'resolve_dead_stock', variant: 'primary' }],
      },
    };
  }
}
