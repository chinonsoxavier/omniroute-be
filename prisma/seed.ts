import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const NOW = Date.now();
const DAY = 86400000;
const days = (n: number) => new Date(NOW + n * DAY);
const hours = (n: number) => new Date(NOW + n * 3600000);

function margin(retail: number, cost: number): number {
  if (retail <= 0) return 0;
  return Math.round(((retail - cost) / retail) * 10000) / 100;
}

const FACILITIES = [
  { code: '104', name: '#104 Flagship', address: '1200 Market Street, San Francisco, CA 94103' },
  { code: '108', name: '#108 Supercenter', address: '450 Commerce Blvd, San Jose, CA 95110' },
  { code: '202', name: '#202 Express Metro', address: '88 Transit Plaza, Oakland, CA 94612' },
];

const SUPPLIERS = [
  { key: 'supp-1', name: 'Valley Orchards & Farms', contactPerson: 'Marcus Vance', email: 'marcus@valleyorchards.com', phone: '+1 (555) 342-8901', category: ['Produce'], leadTimeHours: 18, reliabilityRating: 98.4, paymentTerms: 'Net 15', address: '450 Agro Ridge Road, Salinas, CA 93901' },
  { key: 'supp-2', name: 'Organic Valley Dairy Coop', contactPerson: 'Elena Rostova', email: 'orders@organicvalleydairy.com', phone: '+1 (555) 781-9920', category: ['Dairy & Eggs'], leadTimeHours: 24, reliabilityRating: 99.1, paymentTerms: 'Net 30', address: '120 Pasture Way, La Farge, WI 54639' },
  { key: 'supp-3', name: 'Pacific Ranch & Meats', contactPerson: 'David Chen', email: 'logistics@pacificranch.com', phone: '+1 (555) 620-4491', category: ['Meat & Seafood'], leadTimeHours: 12, reliabilityRating: 97.6, paymentTerms: 'Net 14', address: '88 Harbor Pier Dock, Seattle, WA 98104' },
  { key: 'supp-4', name: 'Wonder Bakeries Co.', contactPerson: 'Claire Bennett', email: 'claire@wonderbakeries.com', phone: '+1 (555) 902-1134', category: ['Bakery & Artisan'], leadTimeHours: 8, reliabilityRating: 99.8, paymentTerms: 'Daily DSD', address: '304 Flour Mill Ave, Portland, OR 97201' },
  { key: 'supp-5', name: 'Nestlé Waters & Beverages Corp', contactPerson: 'Alex Rivera', email: 'distrib@nestlewaters.com', phone: '+1 (555) 441-2098', category: ['Beverages'], leadTimeHours: 36, reliabilityRating: 96.2, paymentTerms: 'Net 45', address: '900 Blue Spring Blvd, Stamford, CT 06902' },
  { key: 'supp-6', name: 'Kraft Heinz Global Pantry', contactPerson: 'Samantha Miller', email: 'retailops@kraftheinz.com', phone: '+1 (555) 312-7788', category: ['Pantry & Dry Goods', 'Snacks & Confectionery'], leadTimeHours: 48, reliabilityRating: 95.8, paymentTerms: 'Net 60', address: '200 E Randolph St, Chicago, IL 60601' },
  { key: 'supp-7', name: 'Horizon Organic & Dairy', contactPerson: 'Tom Gallagher', email: 'orders@horizonorganic.com', phone: '+1 (555) 234-9081', category: ['Dairy & Eggs'], leadTimeHours: 20, reliabilityRating: 98.7, paymentTerms: 'Net 30', address: '142 Farmstead Lane, Boulder, CO 80301' },
  { key: 'supp-8', name: 'Cal-Growers Fresh Citrus & Greens', contactPerson: 'Rosa Gutierrez', email: 'ops@calgrowers.com', phone: '+1 (555) 554-1290', category: ['Produce'], leadTimeHours: 16, reliabilityRating: 99.3, paymentTerms: 'Net 14', address: '77 Valley Blvd, Fresno, CA 93706' },
];

interface SeedProduct {
  key: string;
  supplierKey: string;
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  packageType: string;
  department: string;
  aisle: string;
  bay: string;
  shelfPlacement: string;
  storageTemp?: string;
  unit: string;
  retailPrice: number;
  wholesaleCost: number;
  currentStock: number;
  reorderPoint: number;
  criticalThreshold: number;
  maxCapacity: number;
  transitStock?: number;
  transitPO?: string;
  transitETAHours?: number;
  expiryInDays?: number;
  unitsSoldToday: number;
  unitsSoldWeek: number;
  unitsSoldMonth: number;
  unitsSoldYear: number;
  revenueMonth: number;
  turnoverRate: number;
  daysIdle: number;
  eslSyncStatus: string;
  eslChannel?: string;
}

const PRODUCTS: SeedProduct[] = [
  { key: 'prod-1', supplierKey: 'supp-1', sku: '#PROD-7729', barcode: '071844901234', name: 'Honeycrisp Apples', brand: 'Valley Orchards', packageType: 'Bulk / Lb', department: 'Produce', aisle: 'Aisle 1-A', bay: 'Bay 3', shelfPlacement: 'Ambient Wet Rack', storageTemp: 'Ambient 58°F', unit: 'lbs', retailPrice: 2.49, wholesaleCost: 1.42, currentStock: 340, reorderPoint: 100, criticalThreshold: 50, maxCapacity: 400, expiryInDays: 10, unitsSoldToday: 62, unitsSoldWeek: 412, unitsSoldMonth: 1840, unitsSoldYear: 21900, revenueMonth: 4581.6, turnoverRate: 11.2, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Aisle 1-A Node 04' },
  { key: 'prod-2', supplierKey: 'supp-2', sku: '#DAIR-4102', barcode: '093966000142', name: 'Organic Valley Whole Milk 1 Gal', brand: 'Organic Valley', packageType: '1 Gallon Jug', department: 'Dairy & Eggs', aisle: 'Aisle 2-B', bay: 'Vault 4', shelfPlacement: 'Cooler Display Tier 1', storageTemp: '34°F Optimal', unit: 'units', retailPrice: 5.49, wholesaleCost: 3.8, currentStock: 18, reorderPoint: 40, criticalThreshold: 15, maxCapacity: 60, expiryInDays: 4, unitsSoldToday: 38, unitsSoldWeek: 260, unitsSoldMonth: 1120, unitsSoldYear: 14200, revenueMonth: 6148.8, turnoverRate: 14.5, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Aisle 2-B Node 12' },
  { key: 'prod-3', supplierKey: 'supp-3', sku: '#MEAT-8819', barcode: '023456789012', name: 'Grass-Fed Ribeye Steak 12oz', brand: 'Pacific Ranch', packageType: 'Tray Pack', department: 'Meat & Seafood', aisle: 'Aisle 3-C', bay: 'Butcher Case 12', shelfPlacement: 'Cold-chain Display', storageTemp: '32°F Cold-chain', unit: 'units', retailPrice: 16.99, wholesaleCost: 10.5, currentStock: 12, reorderPoint: 30, criticalThreshold: 10, maxCapacity: 35, expiryInDays: 3, unitsSoldToday: 19, unitsSoldWeek: 115, unitsSoldMonth: 480, unitsSoldYear: 5800, revenueMonth: 8155.2, turnoverRate: 9.8, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Aisle 3-C Node 08' },
  { key: 'prod-4', supplierKey: 'supp-4', sku: '#BAKE-1940', barcode: '072220001948', name: 'Wonder Classic White Bread 20oz', brand: 'Wonder Bakeries', packageType: 'Daily DSD Loaf', department: 'Bakery & Artisan', aisle: 'Aisle 4-A', bay: 'Shelf 2', shelfPlacement: 'Direct Store Delivery Stand', storageTemp: 'Ambient', unit: 'units', retailPrice: 3.29, wholesaleCost: 1.85, currentStock: 64, reorderPoint: 25, criticalThreshold: 12, maxCapacity: 80, expiryInDays: 5, unitsSoldToday: 42, unitsSoldWeek: 280, unitsSoldMonth: 1210, unitsSoldYear: 15400, revenueMonth: 3980.9, turnoverRate: 16.2, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Aisle 4-A Node 02' },
  { key: 'prod-5', supplierKey: 'supp-2', sku: '#DAIR-6601', barcode: '894700010045', name: 'Chobani Greek Yogurt Strawberry 5.3oz', brand: 'Chobani LLC', packageType: 'Single Cup', department: 'Dairy & Eggs', aisle: 'Aisle 2-C', bay: 'Shelf 3', shelfPlacement: 'Cooler Display Tier 2', storageTemp: '34°F Optimal', unit: 'units', retailPrice: 1.49, wholesaleCost: 0.82, currentStock: 4, reorderPoint: 35, criticalThreshold: 10, maxCapacity: 90, expiryInDays: 18, unitsSoldToday: 51, unitsSoldWeek: 340, unitsSoldMonth: 1450, unitsSoldYear: 18200, revenueMonth: 2160.5, turnoverRate: 18.0, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Aisle 2-C Node 05' },
  { key: 'prod-6', supplierKey: 'supp-6', sku: '#PANT-3011', barcode: '013000006408', name: 'Heinz Tomato Ketchup 32oz', brand: 'Kraft Heinz Co.', packageType: 'Squeeze Bottle', department: 'Pantry & Dry Goods', aisle: 'Aisle 7-B', bay: 'Bay 2', shelfPlacement: 'Condiments Section', storageTemp: 'Ambient', unit: 'units', retailPrice: 4.29, wholesaleCost: 2.35, currentStock: 88, reorderPoint: 30, criticalThreshold: 15, maxCapacity: 120, expiryInDays: 568, unitsSoldToday: 26, unitsSoldWeek: 160, unitsSoldMonth: 690, unitsSoldYear: 8400, revenueMonth: 2960.1, turnoverRate: 7.8, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Aisle 7-B Node 14' },
  { key: 'prod-7', supplierKey: 'supp-7', sku: '#BEV-9014', barcode: '190646630044', name: 'Oatly Barista Edition Oat Milk 32oz', brand: 'Oatly AB', packageType: 'Tetrapak 6-ct', department: 'Dairy & Eggs', aisle: 'Aisle 2-D', bay: 'Shelf 1', shelfPlacement: 'Alternative Milks Rack', storageTemp: '36°F Chilled', unit: 'units', retailPrice: 5.29, wholesaleCost: 3.1, currentStock: 0, reorderPoint: 24, criticalThreshold: 8, maxCapacity: 60, transitStock: 48, transitPO: 'PO #4489', transitETAHours: 16, expiryInDays: 57, unitsSoldToday: 0, unitsSoldWeek: 94, unitsSoldMonth: 410, unitsSoldYear: 5300, revenueMonth: 2168.9, turnoverRate: 8.9, daysIdle: 1, eslSyncStatus: 'pending', eslChannel: 'Aisle 2-D Node 09' },
  { key: 'prod-8', supplierKey: 'supp-5', sku: '#BEV-1188', barcode: '041570054321', name: 'San Pellegrino Sparkling 750ml', brand: 'Nestlé Waters', packageType: 'Glass Bottle', department: 'Beverages', aisle: 'Aisle 8-A', bay: 'Shelf 1', shelfPlacement: 'Imported Sparkling Rack', storageTemp: 'Ambient', unit: 'units', retailPrice: 2.99, wholesaleCost: 1.48, currentStock: 115, reorderPoint: 40, criticalThreshold: 20, maxCapacity: 150, expiryInDays: 705, unitsSoldToday: 34, unitsSoldWeek: 210, unitsSoldMonth: 920, unitsSoldYear: 11500, revenueMonth: 2750.8, turnoverRate: 8.0, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Aisle 8-A Node 01' },
  { key: 'prod-9', supplierKey: 'supp-8', sku: '#AVO-04', barcode: '033104998201', name: 'Hass Avocado 4-Pack Bag', brand: 'Cal-Growers', packageType: 'Mesh Bag 4-ct', department: 'Produce', aisle: 'Aisle 2', bay: 'Bay 1', shelfPlacement: 'Fresh Produce Island', storageTemp: 'Ambient 60°F', unit: 'bags', retailPrice: 4.99, wholesaleCost: 2.6, currentStock: 8, reorderPoint: 25, criticalThreshold: 10, maxCapacity: 50, expiryInDays: 2, unitsSoldToday: 28, unitsSoldWeek: 640, unitsSoldMonth: 2840, unitsSoldYear: 32000, revenueMonth: 14171.6, turnoverRate: 8.4, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Aisle 2 Node 03' },
  { key: 'prod-10', supplierKey: 'supp-8', sku: '#BAN-FT', barcode: '040110000000', name: 'Bananas Fair Trade (lbs)', brand: 'Cal-Growers', packageType: 'Cluster Bulk', department: 'Produce', aisle: 'Front Stand', bay: 'Table 1', shelfPlacement: 'Front Produce Entrance', storageTemp: 'Ambient 62°F', unit: 'lbs', retailPrice: 0.69, wholesaleCost: 0.41, currentStock: 280, reorderPoint: 80, criticalThreshold: 30, maxCapacity: 350, expiryInDays: 4, unitsSoldToday: 110, unitsSoldWeek: 580, unitsSoldMonth: 2250, unitsSoldYear: 29000, revenueMonth: 1552.5, turnoverRate: 14.6, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Front Stand Node 01' },
  { key: 'prod-11', supplierKey: 'supp-3', sku: '#SEA-SAL', barcode: '028901234509', name: 'Fresh Atlantic Salmon Fillet', brand: 'Pacific Ranch', packageType: 'Seafood Tray', department: 'Meat & Seafood', aisle: 'Counter 3', bay: 'Seafood Case', shelfPlacement: 'Ice Bed Display', storageTemp: '30°F Crushed Ice', unit: 'lbs', retailPrice: 11.99, wholesaleCost: 7.68, currentStock: 45, reorderPoint: 20, criticalThreshold: 8, maxCapacity: 60, expiryInDays: 2, unitsSoldToday: 94, unitsSoldWeek: 310, unitsSoldMonth: 1180, unitsSoldYear: 13900, revenueMonth: 14148.2, turnoverRate: 7.2, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Counter 3 Node 07' },
  { key: 'prod-12', supplierKey: 'supp-2', sku: '#EGG-L12', barcode: '090142345678', name: 'Cage-Free Large Brown Eggs 12ct', brand: 'Dairy / Poultry Co-op', packageType: 'Carton 12-pk', department: 'Dairy & Eggs', aisle: 'Aisle 17', bay: 'Cooler 2', shelfPlacement: 'Dairy Coolers Tier 2', storageTemp: '34°F Chilled', unit: 'cartons', retailPrice: 3.99, wholesaleCost: 2.83, currentStock: 5, reorderPoint: 25, criticalThreshold: 8, maxCapacity: 50, expiryInDays: 24, unitsSoldToday: 48, unitsSoldWeek: 250, unitsSoldMonth: 1040, unitsSoldYear: 12800, revenueMonth: 4149.6, turnoverRate: 10.3, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Aisle 17 Node 04' },
  { key: 'prod-13', supplierKey: 'supp-4', sku: '#BAKE-SD24', barcode: '010944882190', name: 'Artisan Sourdough Loaf 24oz', brand: 'In-Store Bakery', packageType: 'Paper Sleeved Loaf', department: 'Bakery & Artisan', aisle: 'Bakery Hearth', bay: 'Shelf 1', shelfPlacement: 'Fresh Baked Island', storageTemp: 'Ambient', unit: 'loaves', retailPrice: 5.49, wholesaleCost: 2.1, currentStock: 4, reorderPoint: 15, criticalThreshold: 5, maxCapacity: 30, expiryInDays: 1, unitsSoldToday: 26, unitsSoldWeek: 168, unitsSoldMonth: 720, unitsSoldYear: 8900, revenueMonth: 3952.8, turnoverRate: 15.1, daysIdle: 0, eslSyncStatus: 'synced', eslChannel: 'Bakery Hearth Node 01' },
  { key: 'prod-14', supplierKey: 'supp-6', sku: '#GOUR-TRUF', barcode: '088192300145', name: 'Truffle Infused Olive Oil 250ml', brand: 'Gourmet Pantry', packageType: 'Glass Bottle w/ Cork', department: 'Pantry & Dry Goods', aisle: 'Aisle 4-B', bay: 'Shelf G4', shelfPlacement: 'Specialty Condiments', storageTemp: 'Ambient', unit: 'units', retailPrice: 18.99, wholesaleCost: 12.2, currentStock: 24, reorderPoint: 10, criticalThreshold: 4, maxCapacity: 30, expiryInDays: 508, unitsSoldToday: 0, unitsSoldWeek: 1, unitsSoldMonth: 3, unitsSoldYear: 45, revenueMonth: 56.97, turnoverRate: 0.4, daysIdle: 38, eslSyncStatus: 'synced', eslChannel: 'Aisle 4-B Node 18' },
  { key: 'prod-15', supplierKey: 'supp-4', sku: '#SPEC-AMAR', barcode: '077291004123', name: 'Organic Amaranth Flour 16oz', brand: 'Bakery Specialty', packageType: 'Resealable Pouch', department: 'Bakery & Artisan', aisle: 'Aisle 4-C', bay: 'Shelf 3', shelfPlacement: 'Gluten-Free Baking', storageTemp: 'Ambient', unit: 'units', retailPrice: 7.95, wholesaleCost: 4.8, currentStock: 18, reorderPoint: 8, criticalThreshold: 3, maxCapacity: 25, expiryInDays: 473, unitsSoldToday: 0, unitsSoldWeek: 0, unitsSoldMonth: 2, unitsSoldYear: 28, revenueMonth: 15.9, turnoverRate: 0.3, daysIdle: 29, eslSyncStatus: 'synced', eslChannel: 'Aisle 4-C Node 06' },
  { key: 'prod-16', supplierKey: 'supp-1', sku: '#PROD-DRAG', barcode: '099182344510', name: 'Exotic Dragonfruit Imported', brand: 'Tropical Farms', packageType: 'Individual Piece', department: 'Produce', aisle: 'Aisle 1-B', bay: 'Bay 2', shelfPlacement: 'Exotics Tier 3', storageTemp: 'Ambient 55°F', unit: 'units', retailPrice: 5.99, wholesaleCost: 3.85, currentStock: 32, reorderPoint: 15, criticalThreshold: 5, maxCapacity: 40, expiryInDays: 6, unitsSoldToday: 1, unitsSoldWeek: 4, unitsSoldMonth: 12, unitsSoldYear: 180, revenueMonth: 71.88, turnoverRate: 0.8, daysIdle: 6, eslSyncStatus: 'synced', eslChannel: 'Aisle 1-B Node 04' },
  { key: 'prod-17', supplierKey: 'supp-6', sku: '#SNK-MINT', barcode: '034000129840', name: 'Sugar-Free Mint Chews 6pk', brand: 'Confection Co', packageType: 'Pocket Pack', department: 'Snacks & Confectionery', aisle: 'Front Registers', bay: 'Impulse #4', shelfPlacement: 'Front Impulse Rack', storageTemp: 'Ambient', unit: 'units', retailPrice: 2.49, wholesaleCost: 1.25, currentStock: 45, reorderPoint: 20, criticalThreshold: 10, maxCapacity: 60, expiryInDays: 644, unitsSoldToday: 0, unitsSoldWeek: 2, unitsSoldMonth: 8, unitsSoldYear: 140, revenueMonth: 19.92, turnoverRate: 0.5, daysIdle: 24, eslSyncStatus: 'synced', eslChannel: 'Impulse 4 Node 01' },
  { key: 'prod-18', supplierKey: 'supp-6', sku: '#SNK-QUIN', barcode: '048190234110', name: 'Gluten-Free Quinoa Crisps 5oz', brand: 'Artisan Snacks', packageType: 'Foil Bag', department: 'Snacks & Confectionery', aisle: 'Aisle 8-A', bay: 'Shelf 4', shelfPlacement: 'Snack Aisle High Shelf', storageTemp: 'Ambient', unit: 'units', retailPrice: 5.49, wholesaleCost: 3.1, currentStock: 28, reorderPoint: 12, criticalThreshold: 5, maxCapacity: 35, expiryInDays: 542, unitsSoldToday: 0, unitsSoldWeek: 1, unitsSoldMonth: 6, unitsSoldYear: 90, revenueMonth: 32.94, turnoverRate: 0.6, daysIdle: 19, eslSyncStatus: 'synced', eslChannel: 'Aisle 8-A Node 11' },
];

const AUDIT_LOGS = [
  { sku: '#PROD-7729', productName: 'Honeycrisp Apples', actionType: 'Stock Intake', previousValue: '220 lbs', newValue: '340 lbs', delta: 120, reason: 'PO #8832 Received & verified at Dock Bay 2', user: 'J. Martinez', financialImpact: 170.4, hoursAgo: 6 },
  { sku: '#BAKE-SD24', productName: 'Artisan Sourdough Loaf 24oz', actionType: 'Markdown Applied', previousValue: '$5.49', newValue: '$4.39 (-20%)', reason: 'OmniStock AI marked down artisanal bakery items before shelf-life threshold', user: 'OmniStock AI Copilot', financialImpact: 84.5, hoursAgo: 3 },
  { sku: '#DAIR-6601', productName: 'Chobani Greek Yogurt Strawberry 5.3oz', actionType: 'Spoilage Write-Off', previousValue: '6 units', newValue: '4 units', delta: -2, reason: 'Handheld tablet #03 scanned 2 punctured yogurt tubs', user: 'K. Larson', financialImpact: -1.64, hoursAgo: 2 },
  { sku: '#BEV-1188', productName: 'San Pellegrino Sparkling 750ml', actionType: 'ESL Sync', previousValue: 'Synced (v2.1)', newValue: 'Synced (v2.2)', reason: 'Electronic shelf label refresh on Aisle 8-A Node 01', user: 'System Telemetry', financialImpact: 0, hoursAgo: 1 },
];

const FORECASTS = [
  { title: 'Artisan Baking & Fresh Poultry Surge', tag: 'HOLIDAY WEEKEND SURGE', changePercentage: '+42% Expected', isPositive: true, description: 'High probability of early stockout on Cranberry Compote, Fresh Turkeys, and Dinner Rolls by Friday 18:00.', supplierLead: '48 hrs', actionText: 'Auto-PO Intake', actionType: 'auto_po', telemetryNote: 'Lead Time Model Active • Confidence Score 94.2%' },
  { title: 'Cooler Temps Forecast (52°F Avg)', tag: 'WEATHER SHIFT IMPACT', changePercentage: '-12% Cold Drinks', isPositive: false, description: 'Cold brew and carbonated beverage sales shift towards ready-to-heat soups, herbal teas, and hot cider mix.', supplierLead: 'Immediate', actionText: 'View Planogram', actionType: 'planogram', telemetryNote: 'End-cap re-slot scheduled for Aisle 5 & 6' },
  { title: 'California Berry Shipments', tag: 'REPLENISHMENT PACING', changePercentage: 'Optimal Safety', isPositive: true, description: 'Organic Strawberries & Blueberries running at standard 1.2 day inventory. 18 crates arrived this morning.', supplierLead: '24 hrs', actionText: 'Verify Cold-Chain', actionType: 'spec_check', telemetryNote: 'Cold-chain telemetry: 36.2°F • In Spec' },
];

async function seedFacility(facility: (typeof FACILITIES)[number], isPrimary: boolean) {
  const created = await prisma.facility.create({
    data: {
      code: facility.code,
      name: facility.name,
      address: facility.address,
      settings: {
        create: {
          safetyBufferDays: 3,
          posSyncRateSeconds: 30,
          coldChainMinTempF: 34,
          coldChainMaxTempF: 40,
          taxRate: 0.08,
          eslProtocol: '2.4GHz',
          eslChannel: 'Auto',
        },
      },
      telemetry: {
        create: {
          shiftNumber: 1,
          activeRegisters: '14/14',
          handheldUnitsOnline: '8/8 Online',
          telemetryStatus: 'Sync OK',
          weather: '71°F Clear Sky',
          peakFootTraffic: '4:30 PM - 7:00 PM (+38% checkout load)',
          todayTargetSales: new Prisma.Decimal(58000),
          salesGrowthVsYest: 14.2,
          coldChainTempAvg: '37.8°F Avg',
        },
      },
    },
  });

  if (!isPrimary) return { facility: created, supplierMap: new Map<string, string>(), productMap: new Map<string, string>() };

  const supplierMap = new Map<string, string>();
  for (const supplier of SUPPLIERS) {
    const createdSupplier = await prisma.supplier.create({
      data: {
        facilityId: created.id,
        name: supplier.name,
        contactPerson: supplier.contactPerson,
        email: supplier.email,
        phone: supplier.phone,
        category: supplier.category,
        leadTimeHours: supplier.leadTimeHours,
        reliabilityRating: supplier.reliabilityRating,
        paymentTerms: supplier.paymentTerms,
        address: supplier.address,
      },
    });
    supplierMap.set(supplier.key, createdSupplier.id);
  }

  const productMap = new Map<string, string>();
  for (const product of PRODUCTS) {
    const supplierId = supplierMap.get(product.supplierKey)!;
    const tiedCapital = Math.round(product.currentStock * product.wholesaleCost * 100) / 100;
    const createdProduct = await prisma.product.create({
      data: {
        facilityId: created.id,
        supplierId,
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        brand: product.brand,
        packageType: product.packageType,
        department: product.department,
        aisle: product.aisle,
        bay: product.bay,
        shelfPlacement: product.shelfPlacement,
        storageTemp: product.storageTemp,
        unit: product.unit,
        retailPrice: new Prisma.Decimal(product.retailPrice),
        wholesaleCost: new Prisma.Decimal(product.wholesaleCost),
        grossMargin: margin(product.retailPrice, product.wholesaleCost),
        currentStock: new Prisma.Decimal(product.currentStock),
        reorderPoint: new Prisma.Decimal(product.reorderPoint),
        criticalThreshold: new Prisma.Decimal(product.criticalThreshold),
        maxCapacity: new Prisma.Decimal(product.maxCapacity),
        transitStock: product.transitStock ? new Prisma.Decimal(product.transitStock) : null,
        transitPO: product.transitPO,
        transitETA: product.transitETAHours ? hours(product.transitETAHours) : null,
        expiryDate: product.expiryInDays ? days(product.expiryInDays) : null,
        unitsSoldToday: product.unitsSoldToday,
        unitsSoldWeek: product.unitsSoldWeek,
        unitsSoldMonth: product.unitsSoldMonth,
        unitsSoldYear: product.unitsSoldYear,
        revenueMonth: new Prisma.Decimal(product.revenueMonth),
        turnoverRate: product.turnoverRate,
        daysIdle: product.daysIdle,
        tiedCapital: new Prisma.Decimal(tiedCapital),
        eslSyncStatus: product.eslSyncStatus,
        eslChannel: product.eslChannel,
        lastSoldAt: product.daysIdle > 0 ? days(-product.daysIdle) : new Date(),
      },
    });
    productMap.set(product.key, createdProduct.id);
  }

  await prisma.purchaseOrder.create({
    data: {
      facilityId: created.id,
      supplierId: supplierMap.get('supp-1')!,
      poNumber: 'PO #8832',
      status: 'Received',
      orderDate: days(-2),
      expectedDelivery: days(-1),
      receivedDate: days(-1),
      totalAmount: new Prisma.Decimal(231.9),
      coldChainVerified: true,
      temperatureReading: '58.4°F Ambient Checked',
      dockNumber: 'Dock Bay 2',
      verifiedBy: 'J. Martinez (Floor Lead)',
      notes: `Pacific Produce truck: 120 crates fresh produce checked.`,
      items: {
        create: [
          { productId: productMap.get('prod-1')!, sku: '#PROD-7729', name: 'Honeycrisp Apples', orderedQty: new Prisma.Decimal(120), receivedQty: new Prisma.Decimal(120), unitCost: new Prisma.Decimal(1.42), totalCost: new Prisma.Decimal(170.4), unit: 'lbs' },
          { productId: productMap.get('prod-10')!, sku: '#BAN-FT', name: 'Bananas Fair Trade (lbs)', orderedQty: new Prisma.Decimal(150), receivedQty: new Prisma.Decimal(150), unitCost: new Prisma.Decimal(0.41), totalCost: new Prisma.Decimal(61.5), unit: 'lbs' },
        ],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      facilityId: created.id,
      supplierId: supplierMap.get('supp-7')!,
      poNumber: 'PO #4489',
      status: 'In Transit',
      orderDate: days(-1),
      expectedDelivery: hours(16),
      totalAmount: new Prisma.Decimal(285.6),
      dockNumber: 'Bay 1 (Chilled)',
      notes: 'Refrigerated transit carrier on route. Pre-alert logged in EDI.',
      items: {
        create: [
          { productId: productMap.get('prod-7')!, sku: '#BEV-9014', name: 'Oatly Barista Edition Oat Milk 32oz', orderedQty: new Prisma.Decimal(48), unitCost: new Prisma.Decimal(3.1), totalCost: new Prisma.Decimal(148.8), unit: 'units' },
          { productId: productMap.get('prod-2')!, sku: '#DAIR-4102', name: 'Organic Valley Whole Milk 1 Gal', orderedQty: new Prisma.Decimal(36), unitCost: new Prisma.Decimal(3.8), totalCost: new Prisma.Decimal(136.8), unit: 'units' },
        ],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      facilityId: created.id,
      supplierId: supplierMap.get('supp-3')!,
      poNumber: 'PO #9104',
      status: 'Draft',
      orderDate: days(0),
      expectedDelivery: days(2),
      totalAmount: new Prisma.Decimal(569.7),
      notes: 'Auto-drafted by AI Copilot to replenish safety threshold buffer for weekend surge.',
      items: {
        create: [
          { productId: productMap.get('prod-3')!, sku: '#MEAT-8819', name: 'Grass-Fed Ribeye Steak 12oz', orderedQty: new Prisma.Decimal(25), unitCost: new Prisma.Decimal(10.5), totalCost: new Prisma.Decimal(262.5), unit: 'units' },
          { productId: productMap.get('prod-11')!, sku: '#SEA-SAL', name: 'Fresh Atlantic Salmon Fillet', orderedQty: new Prisma.Decimal(40), unitCost: new Prisma.Decimal(7.68), totalCost: new Prisma.Decimal(307.2), unit: 'lbs' },
        ],
      },
    },
  });

  const saleDefs = [
    { receiptNumber: 'REC-90821', registerId: 'REG-03', cashierName: 'Elena Ramos', customerType: 'Loyalty Member', paymentMethod: 'Apple Pay / Contactless', items: [{ key: 'prod-1', quantity: 3.2, discount: 0 }, { key: 'prod-2', quantity: 1, discount: 0 }, { key: 'prod-4', quantity: 1, discount: 0 }] },
    { receiptNumber: 'REC-90822', registerId: 'REG-07', cashierName: 'Marco Bell', customerType: 'VIP SuperClub', paymentMethod: 'Credit / Debit Card', items: [{ key: 'prod-3', quantity: 2, discount: 5 }, { key: 'prod-8', quantity: 4, discount: 0 }] },
    { receiptNumber: 'REC-90823', registerId: 'REG-01', cashierName: 'Sarah Jenkins', customerType: 'Regular', paymentMethod: 'Cash', items: [{ key: 'prod-11', quantity: 2.5, discount: 0 }, { key: 'prod-9', quantity: 1, discount: 0 }] },
  ];

  const productByKey = new Map(PRODUCTS.map((p) => [p.key, p]));

  for (const sale of saleDefs) {
    let subtotal = 0;
    let totalMargin = 0;
    const itemData = sale.items.map((item) => {
      const product = productByKey.get(item.key)!;
      const gross = product.retailPrice * item.quantity;
      const totalPrice = Math.round((gross - (gross * item.discount) / 100) * 100) / 100;
      const marginAmount = Math.round((totalPrice - product.wholesaleCost * item.quantity) * 100) / 100;
      subtotal += totalPrice;
      totalMargin += marginAmount;
      return {
        productId: productMap.get(item.key)!,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        quantity: new Prisma.Decimal(item.quantity),
        unitPrice: new Prisma.Decimal(product.retailPrice),
        discount: item.discount,
        totalPrice: new Prisma.Decimal(totalPrice),
        unitCost: new Prisma.Decimal(product.wholesaleCost),
        marginAmount: new Prisma.Decimal(marginAmount),
      };
    });
    subtotal = Math.round(subtotal * 100) / 100;
    const tax = Math.round(subtotal * 0.08 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    await prisma.saleTransaction.create({
      data: {
        facilityId: created.id,
        receiptNumber: sale.receiptNumber,
        registerId: sale.registerId,
        cashierName: sale.cashierName,
        customerType: sale.customerType,
        paymentMethod: sale.paymentMethod,
        subtotal: new Prisma.Decimal(subtotal),
        tax: new Prisma.Decimal(tax),
        total: new Prisma.Decimal(total),
        totalMargin: new Prisma.Decimal(Math.round(totalMargin * 100) / 100),
        status: 'Completed',
        createdAt: hours(-4),
        items: { create: itemData },
      },
    });
  }

  for (const log of AUDIT_LOGS) {
    await prisma.auditLog.create({
      data: {
        facilityId: created.id,
        sku: log.sku,
        productName: log.productName,
        actionType: log.actionType,
        previousValue: log.previousValue,
        newValue: log.newValue,
        delta: log.delta ?? null,
        reason: log.reason,
        user: log.user,
        financialImpact: new Prisma.Decimal(log.financialImpact),
        createdAt: hours(-log.hoursAgo),
      },
    });
  }

  const deadStockDefs = [
    { key: 'prod-14', shelfLocation: 'Gourmet Pantry • Shelf G4', daysIdle: 38, actionType: 'markdown_30', recommendedAction: 'Mark down 30% or Bundle' },
    { key: 'prod-15', shelfLocation: 'Bakery / Specialty Baking', daysIdle: 29, actionType: 'reallocate', recommendedAction: 'Reallocate to Health Aisle' },
    { key: 'prod-16', shelfLocation: 'Fresh Produce • Aisle 1-B', daysIdle: 6, actionType: 'flash_50', recommendedAction: 'Flash 50% discount' },
    { key: 'prod-17', shelfLocation: 'Front Impulse Registers', daysIdle: 24, actionType: 'move_endcap', recommendedAction: 'Move to checkout shelf #2' },
  ];

  for (const dead of deadStockDefs) {
    const product = productByKey.get(dead.key)!;
    await prisma.deadStockAlert.create({
      data: {
        facilityId: created.id,
        productId: productMap.get(dead.key)!,
        sku: product.sku,
        productName: product.name,
        department: product.department,
        shelfLocation: dead.shelfLocation,
        daysIdle: dead.daysIdle,
        stock: new Prisma.Decimal(product.currentStock),
        unit: product.unit,
        tiedCapital: new Prisma.Decimal(Math.round(product.currentStock * product.wholesaleCost * 100) / 100),
        recommendedAction: dead.recommendedAction,
        actionType: dead.actionType,
      },
    });
  }

  for (const forecast of FORECASTS) {
    await prisma.demandForecast.create({ data: { facilityId: created.id, ...forecast } });
  }

  return { facility: created, supplierMap, productMap };
}

async function main() {
  console.log('Seeding OmniStock database...');

  await prisma.stockMovement.deleteMany();
  await prisma.deadStockAlert.deleteMany();
  await prisma.demandForecast.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.saleTransaction.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.product.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.shiftTelemetry.deleteMany();
  await prisma.facilitySettings.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.facility.deleteMany();

  const primary = await seedFacility(FACILITIES[0]!, true);
  await seedFacility(FACILITIES[1]!, false);
  await seedFacility(FACILITIES[2]!, false);

  const passwordHash = await bcrypt.hash('Password1!', 12);

  await prisma.user.create({
    data: { email: 'director@omnistock.dev', passwordHash, fullName: 'Jordan Avery', role: 'STORE_DIRECTOR', facilityId: primary.facility.id },
  });
  await prisma.user.create({
    data: { email: 'manager@omnistock.dev', passwordHash, fullName: 'Casey Nguyen', role: 'STORE_MANAGER', facilityId: primary.facility.id },
  });
  await prisma.user.create({
    data: { email: 'staff@omnistock.dev', passwordHash, fullName: 'Sam Rivera', role: 'STORE_STAFF', facilityId: primary.facility.id },
  });

  console.log('Seed complete.');
  console.log('Demo accounts (password: Password1!):');
  console.log('  director@omnistock.dev  (Store Director)');
  console.log('  manager@omnistock.dev   (Store Manager)');
  console.log('  staff@omnistock.dev     (Store Staff)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
