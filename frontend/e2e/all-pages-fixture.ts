import type { Page } from '@playwright/test';
import { navigationFixture, type NavigationRole } from './navigation-fixture';

export const allPagesViewports = [[320,700],[360,800],[390,844],[427,952],[768,1024],[1024,768],[1366,768],[1920,1080]] as const;

export async function allPagesFixture(page: Page, theme: 'light' | 'dark' = 'light', role: NavigationRole = 'Owner') {
 const calls = await navigationFixture(page, role); await page.addInitScript(value => localStorage.setItem('warehouse-theme', value), theme);
  const item = { id:'c1', itemCode:'RICE-001', barcode:'00123456789', name:'Premium Kerala rice with a long descriptive warehouse item name മലയാളം', categoryId:'cat1', categoryName:'Grains', defaultUnit:'KG', currentStock:10, systemStock:10, physicalStock:9, reservedStock:1, availableStock:9, reorderLevel:2, isActive:true, rowVersion:'v1', variants:[], lastSupplierId:'s1', lastSupplierName:'Supplier A', lastBrokerId:'b2', lastBrokerName:'Broker A' };
  const order = {id:'p1',orderNumber:'PO-2026-LONG-WAREHOUSE-ORDER',supplierId:'s1',supplierName:'Supplier A · Kerala Agricultural Wholesale Distribution Cooperative',status:2,paymentState:1,deliveryState:1,version:1,createdAt:'2026-10-02T00:00:00Z',subtotal:1234567.89,taxTotal:0,grandTotal:1234567.89,paidAmount:200,remainingAmount:1234367.89,items:[{id:'pi1',purchaseOrderId:'p1',catalogItemId:'c1',catalogItemName:item.name,itemCode:item.itemCode,orderedQuantity:12345.75,receivedQuantity:2,unit:'KG',unitPrice:100,lineTotal:1234567.89}]};
  const paged = (data: unknown[]) => ({ data, meta:{ page:1, pageSize:50, totalCount:data.length, totalPages:1 } });
  await page.route('**/api/v1/**', async route => {
   const path = new URL(route.request().url()).pathname.replace('/api/v1',''); let data: unknown;
   if (path === '/catalog/items/c1' || path === '/stock/c1' || path.startsWith('/catalog/items/by-barcode')) data = item;
   else if (path === '/catalog/items' || ['/stock','/stock/low-stock','/stock/out-of-stock'].includes(path)) data = paged([item]);
   else if (path === '/stock/c1/activity') data = paged([{ id:'m1', movementType:'PhysicalCount', quantityBefore:10, quantityAfter:9, quantityDelta:-1, reason:'Confirmed physical count', createdByName:'Warehouse colleague', createdAt:'2026-10-02T10:00:00Z' }]);
   else if (path === '/catalog/categories') data = [{ id:'cat1', name:'Grains', itemCount:1 }];
   else if (path === '/catalog/categories/cat1/types') data = [{ id:'t1', categoryId:'cat1', name:'Rice', categoryName:'Grains', itemCount:1 }];
   else if (path === '/catalog/suppliers/s1/history') data = { items:[], totalCount:0 };
   else if (path === '/catalog/suppliers' || path === '/catalog/suppliers/s1') { const supplier={ id:'s1', name:'Supplier A · Kerala Agricultural Wholesale Distribution Cooperative', phone:'1234567890', address:'Warehouse road', isActive:true, linkedItemsCount:1 }; data=path.endsWith('/s1') ? supplier : [supplier]; }
   else if (path === '/catalog/brokers' || path === '/catalog/brokers/b2') { const broker={ id:'b2', name:'Broker A · Southern Regional Purchasing and Transport Agency', isActive:true, linkedSuppliersCount:1 }; data=path.endsWith('/b2') ? broker : [broker]; }
   else if (path === '/purchases') data = paged([order]);
   else if (path === '/purchases/p1') data = order;
   else if (path === '/reports/spend') data = [{periodLabel:'2026-10-01',totalSpend:1234567.89,purchaseCount:150},{periodLabel:'2026-10-02',totalSpend:89012.5,purchaseCount:8}];
   else if (path === '/reports/comparison') data = {currentPeriodSpend:1323580.39,previousPeriodSpend:1000000,spendChangePercentage:32.36,currentPeriodOrders:158,previousPeriodOrders:100,ordersChangePercentage:58,currentPeriodAvgOrderValue:1323580.39/158,previousPeriodAvgOrderValue:10000,avgOrderValueChangePercentage:-16.23};
   else if (path === '/reports/stock-analytics') data = {totalCatalogItems:12345,lowStockCount:234,outOfStockCount:12,estimatedInventoryValue:12345678.9,totalMovementsCount:123456};
   else if (path === '/reports/purchases-summary') data = {bySupplier:[{key:order.supplierName,totalSpend:order.grandTotal,count:150}],byCategory:[{key:'Grains and regional agricultural supplies',totalSpend:order.grandTotal,count:150}],byStatus:[{key:'Dispatched',totalSpend:order.grandTotal,count:150}]};
   else if (path === '/operations/usage/today') data = {lines:[{catalogItemId:item.id,itemName:item.name,unit:'KG',openingQty:12345.75,purchasedQty:10,quantityUsed:2,closingQty:12353.75,expectedVersion:'v1',notes:'Confirmed warehouse record'}]};
   else if (path === '/operations/snapshots') data = [{catalogItemId:item.id,itemName:item.name,unit:'KG',openingQty:12345.75,purchasedQty:10,quantityUsed:2,closingQty:12353.75,expectedVersion:'v1',date:'2026-10-02'}];
   else if (path === '/operations/reports/summary') data = {method:'RULE-BASED',items:[{id:item.id,name:item.name,used7d:100.25,used30d:500.5,movementStatus:'slow_moving',agingBucket:'30_to_60_days',lastMovementAt:'2026-10-02T10:00:00Z'}],supplierFrequency:[{supplierId:'s1',supplierName:order.supplierName,purchaseCount:150}]};
   else if (path === '/ml/items') data = { items:[{ id:'c1', name:item.name, itemCode:item.itemCode, unit:'KG' }], totalCount:1 };
   else if (path === '/ml/items/c1') data = {itemId:'c1',itemName:item.name,unit:'KG',currentStock:12345.75,status:'ready',message:'Fixture model output for client layout verification only.',generatedAt:'2026-10-10T00:00:00Z',model:'Consumption baseline',modelVersion:'warehouse-model-2026-long-version',trainedAt:'2026-10-09T00:00:00Z',metrics:{mae:1.25,rmse:2.5,wape:0.05},history:[{date:'2026-10-01',quantity:12.3456},{date:'2026-10-02',quantity:23.4567}],forecast:[{date:'2026-10-11',quantity:1234.5678,lower:1000.125,upper:1500.5},{date:'2026-10-12',quantity:1345.6789,lower:1100.25,upper:1600.75}],reorder:{quantity:10,reorderDate:'2026-10-20',riskCategory:'low',reason:'Review available stock before ordering.'},anomalies:[]};
   else if (path === '/ml/items/c1/monitoring') data = [{id:'pred1',modelVersion:'warehouse-model-2026-long-version',inputVersion:'v1',createdAt:'2026-10-01',startDate:'2026-10-02',horizon:7,predictedQuantity:12345.6789,actualQuantity:12300.5678,observedDays:7}];
   else if (path === '/ml/items/c1/monitoring-summary') data = [{modelVersion:'warehouse-model-2026-long-version',horizon:7,completedForecasts:12,mae:1.25,rmse:2.5,wape:0.05,mape:0.05,recentMae:1.25,previousMae:1.5,reviewAlert:false,message:'Fixture monitoring results.'}];
   else if (path === '/audit') data = { items:[{ id:'a1', userId:'u1', eventType:'catalog_updated', description:'Saved item details', createdAt:'2026-10-02T10:00:00Z', metadataJson:null }], totalCount:1 };
   else if (path === '/users') data = [{ id:'u2', name:'Warehouse Staff Member with a long descriptive name', email:'warehouse.staff.member.long@example.test', role:4, status:0, roleName:'Staff', createdAt:'2026-10-02T00:00:00Z' }];
   else if (path.startsWith('/users/u2/permissions')) data = { permissions:['stock.view'], defaultPermissions:['stock.view'] };
   else if (path === '/dashboard') data = { purchaseMetrics:{ todayPurchasesCount:3, pendingPurchasesCount:140, activePurchasesCount:120, completedPurchasesCount:30, totalPurchaseSpend:1323580.39 }, stockMetrics:{ totalCatalogItems:301, lowStockCount:4, outOfStockCount:2, itermsWithPhysicalVariance:1 }, deliveryMetrics:{ draftPurchases:5, confirmedPurchases:12, dispatchedPurchases:6, arrivedPurchases:2, verificationPending:2 }, operationalAlerts:[], recentPurchases:[{id:'p1',orderNumber:'PO-NAV',supplierName:'Supplier A · Kerala Agricultural Wholesale Distribution Cooperative',status:2,deliveryState:1,paymentState:0,grandTotal:1234567.89,createdAt:'2026-10-02T00:00:00Z'}], recentStockActivity:[{id:'m1',itemCode:'RICE-001',catalogItemName:item.name,movementType:'PhysicalCount',quantityDelta:-1,beforeQuantity:10,afterQuantity:9,reason:'Confirmed physical count after warehouse review',date:'2026-10-02T00:00:00Z',userId:'u1'}] };
   if (data !== undefined) return route.fulfill({ json:data });
   return route.fallback();
  });
 return { item, order, calls };
}
