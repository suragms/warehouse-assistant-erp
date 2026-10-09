-- ==============================================================================
-- Seed Mock Data for Harisree Agency (Warehouse ERP)
-- BusinessId: ebf95c3a-05c4-477f-8f32-bd23b94d87f6
-- ==============================================================================

BEGIN;

-- 1. Ensure Harisree Agency business profile is fully populated
UPDATE "Businesses"
SET "Address" = 'Plot 42, Central Logistics Park, Industrial Corridor, Ernakulam, Kerala 682024',
    "Phone" = '+91 484 255 1234',
    "ContactEmail" = 'contact@harisreeagency.com',
    "GstNumber" = '32AAACH1234F1Z5',
    "BrandingTitle" = 'Harisree Agency - Warehouse ERP'
WHERE "Id" = 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6';

-- Update Owner membership permissions
UPDATE "Memberships"
SET "PermissionsJson" = '["catalog.view","catalog.create","catalog.edit","catalog.archive","supplier.view","supplier.create","supplier.edit","supplier.delete","broker.view","broker.create","broker.edit","broker.delete","purchase.view","purchase.create","purchase.edit","purchase.delete","purchase.payment","purchase.delivery","purchase.verify","purchase.commit","purchase.damage_report","purchase.damage_approve","stock.view","stock.adjust","stock.physical","stock.system","reports.view","users.view","users.manage","roles.manage","settings.manage","providers.manage"]'
WHERE "BusinessId" = 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6' AND "UserId" = '53cc6489-b7d9-456a-a52c-a283f323f5d5';

-- UserSettings for Owner
INSERT INTO "UserSettings" ("Id", "UserId", "BusinessId", "NotificationsEnabled", "NotificationKindsJson", "CreatedAt")
VALUES (
    'b0000001-0000-0000-0000-000000000001',
    '53cc6489-b7d9-456a-a52c-a283f323f5d5',
    'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
    true,
    '["LowStock","OutOfStock","StockVariance","PurchasePending","VerificationRequired","PaymentPending","DeliveryPending"]',
    NOW()
)
ON CONFLICT ("Id") DO NOTHING;

-- 2. Categories
INSERT INTO "Categories" ("Id", "BusinessId", "Name", "CreatedAt")
VALUES
    ('b1000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Grains & Cereals', NOW()),
    ('b1000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Edible Oils & Ghee', NOW()),
    ('b1000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Pulses & Lentils', NOW()),
    ('b1000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Spices & Seasonings', NOW()),
    ('b1000001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Beverages', NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 3. Category Types
INSERT INTO "CategoryTypes" ("Id", "BusinessId", "CategoryId", "Name", "CreatedAt")
VALUES
    ('b2000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b1000001-0000-0000-0000-000000000001', 'Basmati Rice', NOW()),
    ('b2000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b1000001-0000-0000-0000-000000000001', 'Non-Basmati Rice', NOW()),
    ('b2000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b1000001-0000-0000-0000-000000000001', 'Wheat Flour', NOW()),
    ('b2000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b1000001-0000-0000-0000-000000000002', 'Refined Oils', NOW()),
    ('b2000001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b1000001-0000-0000-0000-000000000002', 'Cold Pressed / Ghee', NOW()),
    ('b2000001-0000-0000-0000-000000000006', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b1000001-0000-0000-0000-000000000003', 'Whole Pulses', NOW()),
    ('b2000001-0000-0000-0000-000000000007', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b1000001-0000-0000-0000-000000000003', 'Split Dals', NOW()),
    ('b2000001-0000-0000-0000-000000000008', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b1000001-0000-0000-0000-000000000004', 'Powdered Spices', NOW()),
    ('b2000001-0000-0000-0000-000000000009', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b1000001-0000-0000-0000-000000000004', 'Whole Spices', NOW()),
    ('b2000001-0000-0000-0000-000000000010', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b1000001-0000-0000-0000-000000000005', 'Tea & Coffee', NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 4. Suppliers
INSERT INTO "Suppliers" ("Id", "BusinessId", "Name", "Phone", "Address", "Notes", "IsActive", "CreatedAt")
VALUES
    ('b3000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Deccan Agro Traders', '+91 98765 43210', 'APMC Grain Market Yard, Sector 19, Vashi, Navi Mumbai 400705', 'Primary supplier for North Indian premium basmati rice and wheat flour. GST: 27AABBD1234E1Z1', true, NOW()),
    ('b3000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Godavari Agro Mills Ltd', '+91 98220 11223', 'Industrial Growth Centre, NH-16, Rajahmundry, Andhra Pradesh 533101', 'Direct mill supplier for Sona Masoori and South Indian rice varieties. Fast road transit.', true, NOW()),
    ('b3000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Shanti Oil Refineries', '+91 91234 56789', 'Plot 88, GIDC Industrial Estate, Sachin, Surat, Gujarat 394230', 'Wholesale refiner of sunflower and mustard oils; 15-day credit cycle. GST: 24AACCS9988G1Z3', true, NOW()),
    ('b3000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Golden Harvest Pulses', '+91 97654 32109', 'Mandi Gate No. 3, Grain Market, Indore, Madhya Pradesh 452001', 'A-Grade pulse cleaning and grading facility. Direct farmer procurement.', true, NOW()),
    ('b3000001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Malabar Spice Plantation Co', '+91 94471 99887', 'Spices Board Complex, Willingdon Island, Kochi, Kerala 682003', 'Origin-direct Cardamom, Black Pepper, Turmeric and spices.', true, NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 5. Brokers
INSERT INTO "Brokers" ("Id", "BusinessId", "Name", "ImageUrl", "IsActive", "CreatedAt")
VALUES
    ('b4000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Ramesh Bhai Mandi Broker', NULL, true, NOW()),
    ('b4000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'V. K. Agency Intermediaries', NULL, true, NOW()),
    ('b4000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'Rajesh Patel Commodity Brokers', NULL, true, NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 6. Broker Suppliers
INSERT INTO "BrokerSuppliers" ("Id", "BusinessId", "BrokerId", "SupplierId", "CreatedAt")
VALUES
    ('b4100001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b4000001-0000-0000-0000-000000000001', 'b3000001-0000-0000-0000-000000000001', NOW()),
    ('b4100001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b4000001-0000-0000-0000-000000000001', 'b3000001-0000-0000-0000-000000000004', NOW()),
    ('b4100001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b4000001-0000-0000-0000-000000000002', 'b3000001-0000-0000-0000-000000000002', NOW()),
    ('b4100001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b4000001-0000-0000-0000-000000000002', 'b3000001-0000-0000-0000-000000000005', NOW()),
    ('b4100001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b4000001-0000-0000-0000-000000000003', 'b3000001-0000-0000-0000-000000000003', NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 7. Catalog Items
INSERT INTO "CatalogItems" (
    "Id", "BusinessId", "ItemCode", "Barcode", "Name", "CategoryId", "TypeId",
    "DefaultUnit", "KgPerUnit", "ReorderLevel", "CurrentStock", "PhysicalStock", "ReservedStock",
    "IsActive", "LastSupplierId", "LastBrokerId", "RowVersion", "CreatedAt"
)
VALUES
    ('b5000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'RIC-BAS-01', '8901030012341', 'Royal Daawat Basmati Rice 1121', 'b1000001-0000-0000-0000-000000000001', 'b2000001-0000-0000-0000-000000000001', 'KG', 1.0, 400.0, 1850.0, 1850.0, 0.0, true, 'b3000001-0000-0000-0000-000000000001', 'b4000001-0000-0000-0000-000000000001', gen_random_uuid(), NOW()),
    ('b5000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'RIC-SON-02', '8901030012342', 'Godavari Premium Sona Masoori', 'b1000001-0000-0000-0000-000000000001', 'b2000001-0000-0000-0000-000000000002', 'KG', 1.0, 300.0, 920.0, 920.0, 0.0, true, 'b3000001-0000-0000-0000-000000000002', 'b4000001-0000-0000-0000-000000000002', gen_random_uuid(), NOW()),
    ('b5000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'FLR-ATT-01', '8901030012343', 'Golden MP Sharbati Atta', 'b1000001-0000-0000-0000-000000000001', 'b2000001-0000-0000-0000-000000000003', 'KG', 1.0, 250.0, 720.0, 720.0, 0.0, true, 'b3000001-0000-0000-0000-000000000001', 'b4000001-0000-0000-0000-000000000001', gen_random_uuid(), NOW()),
    ('b5000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'OIL-SUN-01', '8901030012344', 'Shanti Pure Sunflower Oil (15x1L Box)', 'b1000001-0000-0000-0000-000000000002', 'b2000001-0000-0000-0000-000000000004', 'BOX', 14.5, 25.0, 60.0, 60.0, 0.0, true, 'b3000001-0000-0000-0000-000000000003', 'b4000001-0000-0000-0000-000000000003', gen_random_uuid(), NOW()),
    ('b5000001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'OIL-MUS-02', '8901030012345', 'Kachi Ghani Mustard Oil (12x1L Box)', 'b1000001-0000-0000-0000-000000000002', 'b2000001-0000-0000-0000-000000000004', 'BOX', 11.5, 20.0, 8.0, 8.0, 0.0, true, 'b3000001-0000-0000-0000-000000000003', 'b4000001-0000-0000-0000-000000000003', gen_random_uuid(), NOW()), -- LOW STOCK
    ('b5000001-0000-0000-0000-000000000006', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'GHE-COW-01', '8901030012346', 'Pure Vedic Cow Bilona Ghee 500ml', 'b1000001-0000-0000-0000-000000000002', 'b2000001-0000-0000-0000-000000000005', 'PCS', 0.5, 40.0, 140.0, 140.0, 0.0, true, 'b3000001-0000-0000-0000-000000000003', NULL, gen_random_uuid(), NOW()),
    ('b5000001-0000-0000-0000-000000000007', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'PUL-TOO-01', '8901030012347', 'Indore Unpolished Toor Dal', 'b1000001-0000-0000-0000-000000000003', 'b2000001-0000-0000-0000-000000000007', 'KG', 1.0, 150.0, 0.0, 0.0, 0.0, true, 'b3000001-0000-0000-0000-000000000004', 'b4000001-0000-0000-0000-000000000001', gen_random_uuid(), NOW()), -- OUT OF STOCK
    ('b5000001-0000-0000-0000-000000000008', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'PUL-MOO-02', '8901030012348', 'Select Yellow Moong Dal', 'b1000001-0000-0000-0000-000000000003', 'b2000001-0000-0000-0000-000000000007', 'KG', 1.0, 100.0, 340.0, 355.0, 0.0, true, 'b3000001-0000-0000-0000-000000000004', 'b4000001-0000-0000-0000-000000000001', gen_random_uuid(), NOW()), -- VARIANCE
    ('b5000001-0000-0000-0000-000000000009', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'SPC-TUR-01', '8901030012349', 'Alleppey Finger Turmeric Powder', 'b1000001-0000-0000-0000-000000000004', 'b2000001-0000-0000-0000-000000000008', 'KG', 1.0, 50.0, 180.0, 180.0, 0.0, true, 'b3000001-0000-0000-0000-000000000005', 'b4000001-0000-0000-0000-000000000002', gen_random_uuid(), NOW()),
    ('b5000001-0000-0000-0000-000000000010', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'SPC-PEP-02', '8901030012350', 'Malabar Tellicherry Black Pepper', 'b1000001-0000-0000-0000-000000000004', 'b2000001-0000-0000-0000-000000000009', 'KG', 1.0, 30.0, 85.0, 85.0, 0.0, true, 'b3000001-0000-0000-0000-000000000005', 'b4000001-0000-0000-0000-000000000002', gen_random_uuid(), NOW()),
    ('b5000001-0000-0000-0000-000000000011', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'BEV-TEA-01', '8901030012351', 'Assam CTC Premium Dust Tea', 'b1000001-0000-0000-0000-000000000005', 'b2000001-0000-0000-0000-000000000010', 'KG', 1.0, 50.0, 130.0, 130.0, 0.0, true, 'b3000001-0000-0000-0000-000000000001', NULL, gen_random_uuid(), NOW()),
    ('b5000001-0000-0000-0000-000000000012', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'BEV-COF-02', '8901030012352', 'Chikmagalur Plantation Roasted Coffee', 'b1000001-0000-0000-0000-000000000005', 'b2000001-0000-0000-0000-000000000010', 'KG', 1.0, 25.0, 55.0, 55.0, 0.0, true, 'b3000001-0000-0000-0000-000000000005', NULL, gen_random_uuid(), NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 8. Catalog Variants
INSERT INTO "CatalogVariants" ("Id", "BusinessId", "CatalogItemId", "Name", "Code", "Barcode", "IsActive", "KgPerUnit", "RowVersion", "CreatedAt")
VALUES
    ('b5100001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b5000001-0000-0000-0000-000000000001', '10 Kg Consumer Jute Bag', 'RIC-BAS-10K', '8901030012401', true, 10.0, gen_random_uuid(), NOW()),
    ('b5100001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b5000001-0000-0000-0000-000000000001', '25 Kg Master Polybag', 'RIC-BAS-25K', '8901030012402', true, 25.0, gen_random_uuid(), NOW()),
    ('b5100001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b5000001-0000-0000-0000-000000000003', '5 Kg Fresh Pack', 'FLR-ATT-05K', '8901030012403', true, 5.0, gen_random_uuid(), NOW()),
    ('b5100001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b5000001-0000-0000-0000-000000000003', '10 Kg Fresh Pack', 'FLR-ATT-10K', '8901030012404', true, 10.0, gen_random_uuid(), NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 9. Supplier Items
INSERT INTO "SupplierItems" ("Id", "BusinessId", "SupplierId", "CatalogItemId", "SupplierItemCode", "IsDefault", "Notes", "CreatedAt")
VALUES
    ('b5200001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000001', 'b5000001-0000-0000-0000-000000000001', 'DEC-BAS-1121', true, 'Primary sourcing partner', NOW()),
    ('b5200001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000002', 'b5000001-0000-0000-0000-000000000002', 'GOD-SONA-M', true, 'Direct from Godavari mill', NOW()),
    ('b5200001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000001', 'b5000001-0000-0000-0000-000000000003', 'DEC-SHARBATI', true, 'Standard MP wheat batch', NOW()),
    ('b5200001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000003', 'b5000001-0000-0000-0000-000000000004', 'SHA-SUN-15L', true, 'Packaged cartons', NOW()),
    ('b5200001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000003', 'b5000001-0000-0000-0000-000000000005', 'SHA-MUS-12L', true, 'Bottled mustard oil cartons', NOW()),
    ('b5200001-0000-0000-0000-000000000006', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000004', 'b5000001-0000-0000-0000-000000000007', 'GOLD-TOOR-IND', true, 'Indore mandi clean pulse', NOW()),
    ('b5200001-0000-0000-0000-000000000007', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000004', 'b5000001-0000-0000-0000-000000000008', 'GOLD-MOONG-SPL', true, 'Yellow split dal', NOW()),
    ('b5200001-0000-0000-0000-000000000008', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000005', 'b5000001-0000-0000-0000-000000000009', 'MAL-TUR-ALP', true, 'Alleppey turmeric source', NOW()),
    ('b5200001-0000-0000-0000-000000000009', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000005', 'b5000001-0000-0000-0000-000000000010', 'MAL-PEP-TEL', true, 'Tellicherry graded pepper', NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 10. Supplier Item Prices
INSERT INTO "SupplierItemPrices" ("Id", "BusinessId", "SupplierId", "CatalogItemId", "Unit", "Price", "PricePerKg", "EffectiveDate", "CreatedAt")
VALUES
    ('b5300001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000001', 'b5000001-0000-0000-0000-000000000001', 'KG', 85.00, 85.00, NOW() - INTERVAL '30 days', NOW()),
    ('b5300001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000002', 'b5000001-0000-0000-0000-000000000002', 'KG', 52.00, 52.00, NOW() - INTERVAL '30 days', NOW()),
    ('b5300001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000001', 'b5000001-0000-0000-0000-000000000003', 'KG', 38.50, 38.50, NOW() - INTERVAL '30 days', NOW()),
    ('b5300001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000003', 'b5000001-0000-0000-0000-000000000004', 'BOX', 1650.00, 113.79, NOW() - INTERVAL '30 days', NOW()),
    ('b5300001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000003', 'b5000001-0000-0000-0000-000000000005', 'BOX', 1820.00, 158.26, NOW() - INTERVAL '30 days', NOW()),
    ('b5300001-0000-0000-0000-000000000006', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000004', 'b5000001-0000-0000-0000-000000000007', 'KG', 135.00, 135.00, NOW() - INTERVAL '30 days', NOW()),
    ('b5300001-0000-0000-0000-000000000007', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000004', 'b5000001-0000-0000-0000-000000000008', 'KG', 110.00, 110.00, NOW() - INTERVAL '30 days', NOW()),
    ('b5300001-0000-0000-0000-000000000008', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000005', 'b5000001-0000-0000-0000-000000000009', 'KG', 180.00, 180.00, NOW() - INTERVAL '30 days', NOW()),
    ('b5300001-0000-0000-0000-000000000009', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b3000001-0000-0000-0000-000000000005', 'b5000001-0000-0000-0000-000000000010', 'KG', 580.00, 580.00, NOW() - INTERVAL '30 days', NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 11. Purchases (Purchase Orders across lifecycle stages)
-- Status: 0=Draft, 1=Confirmed, 2=Dispatched, 3=Arrived, 4=Verified, 5=Completed, 6=Cancelled
-- Payment: 0=Pending, 1=Partial, 2=Paid, 3=Overdue, 4=DueSoon
-- Delivery: 0=Pending, 1=Partial, 2=Delivered
INSERT INTO "Purchases" (
    "Id", "BusinessId", "OrderNumber", "SupplierId", "BrokerId",
    "Status", "PaymentState", "DeliveryState", "Notes",
    "Subtotal", "TaxTotal", "GrandTotal", "PaidAmount", "PaidAt", "PaymentDays",
    "BilltyCharge", "CommissionAmount", "CommissionMode", "CommissionPercent",
    "DeliveredCharge", "FreightAmount", "FreightType", "HeaderDiscountPercent",
    "ConfirmedAt", "DispatchedAt", "ArrivedAt", "VerifiedAt", "VerifiedById", "CompletedAt",
    "CreatedAt"
)
VALUES
    -- PO 1: Completed / Stock Committed
    ('b6000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'PO-2026-001',
     'b3000001-0000-0000-0000-000000000001', 'b4000001-0000-0000-0000-000000000001',
     5, 2, 2, 'Monthly bulk grains consignment delivered via Vashi APMC railhead',
     100500.00, 5025.00, 105525.00, 105525.00, NOW() - INTERVAL '20 days', 15,
     150.00, 1055.25, 'percent', 1.0, 0.0, 2500.00, 'separate', 0.0,
     NOW() - INTERVAL '25 days', NOW() - INTERVAL '23 days', NOW() - INTERVAL '22 days', NOW() - INTERVAL '21 days', '53cc6489-b7d9-456a-a52c-a283f323f5d5', NOW() - INTERVAL '21 days',
     NOW() - INTERVAL '25 days'),

    -- PO 2: Completed / Stock Committed
    ('b6000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'PO-2026-002',
     'b3000001-0000-0000-0000-000000000003', 'b4000001-0000-0000-0000-000000000003',
     5, 2, 2, 'Direct factory shipment of edible oil cartons',
     104800.00, 5240.00, 110040.00, 110040.00, NOW() - INTERVAL '10 days', 15,
     200.00, 1100.40, 'percent', 1.0, 0.0, 1800.00, 'separate', 0.0,
     NOW() - INTERVAL '14 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '11 days', NOW() - INTERVAL '11 days', '53cc6489-b7d9-456a-a52c-a283f323f5d5', NOW() - INTERVAL '10 days',
     NOW() - INTERVAL '14 days'),

    -- PO 3: Verified (Awaiting Owner Commit)
    ('b6000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'PO-2026-003',
     'b3000001-0000-0000-0000-000000000002', 'b4000001-0000-0000-0000-000000000002',
     4, 1, 2, 'Sona Masoori truck arrival. Count verified by staff, advance 15000 paid',
     25500.00, 1275.00, 26775.00, 15000.00, NOW() - INTERVAL '2 days', 30,
     100.00, 267.75, 'percent', 1.0, 0.0, 1200.00, 'separate', 0.0,
     NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', 'e0f383e3-ff92-4fd0-a9f5-2955752cd733', NULL,
     NOW() - INTERVAL '4 days'),

    -- PO 4: Arrived (At unloading bay)
    ('b6000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'PO-2026-004',
     'b3000001-0000-0000-0000-000000000005', 'b4000001-0000-0000-0000-000000000002',
     3, 0, 2, 'Spices arrived at Dock 2 from Kochi warehouse. Moisture check required.',
     39900.00, 1995.00, 41895.00, 0.0, NULL, 15,
     100.00, 418.95, 'percent', 1.0, 0.0, 950.00, 'separate', 0.0,
     NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '4 hours', NULL, NULL, NULL,
     NOW() - INTERVAL '3 days'),

    -- PO 5: Dispatched (In Transit)
    ('b6000001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'PO-2026-005',
     'b3000001-0000-0000-0000-000000000004', 'b4000001-0000-0000-0000-000000000001',
     2, 0, 0, 'Indore to Ernakulam container truck dispatched with pulses. LR No: MP-IND-8821',
     61200.00, 3060.00, 64260.00, 0.0, NULL, 20,
     250.00, 642.60, 'percent', 1.0, 0.0, 3200.00, 'separate', 0.0,
     NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NULL, NULL, NULL, NULL,
     NOW() - INTERVAL '2 days'),

    -- PO 6: Confirmed
    ('b6000001-0000-0000-0000-000000000006', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'PO-2026-006',
     'b3000001-0000-0000-0000-000000000003', 'b4000001-0000-0000-0000-000000000003',
     1, 0, 0, 'Urgent replenishment for Kachi Ghani Mustard Oil. Supplier confirmed loading date.',
     54000.00, 2700.00, 56700.00, 0.0, NULL, 15,
     150.00, 567.00, 'percent', 1.0, 0.0, 1500.00, 'separate', 0.0,
     NOW() - INTERVAL '1 day', NULL, NULL, NULL, NULL, NULL,
     NOW() - INTERVAL '1 day'),

    -- PO 7: Draft
    ('b6000001-0000-0000-0000-000000000007', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'PO-2026-007',
     'b3000001-0000-0000-0000-000000000001', NULL,
     0, 0, 0, 'Draft order for Assam Tea stock replenishment proposal',
     20400.00, 1020.00, 21420.00, 0.0, NULL, 30,
     0.0, 0.0, 'percent', 0.0, 0.0, 800.00, 'separate', 0.0,
     NULL, NULL, NULL, NULL, NULL, NULL,
     NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 12. Purchase Items
INSERT INTO "PurchaseItems" (
    "Id", "BusinessId", "PurchaseOrderId", "CatalogItemId",
    "OrderedQuantity", "ReceivedQuantity", "UnitPrice", "LineTotal",
    "DiscountPercent", "TaxPercent", "FreightAmount", "FreightType", "Unit", "CreatedAt"
)
VALUES
    -- Items for PO 1
    ('b6100001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000001', 'b5000001-0000-0000-0000-000000000001', 1000.0, 1000.0, 82.00, 82000.00, 0.0, 5.0, 1500.0, 'separate', 'KG', NOW() - INTERVAL '25 days'),
    ('b6100001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000001', 'b5000001-0000-0000-0000-000000000003', 500.0, 500.0, 37.00, 18500.00, 0.0, 5.0, 1000.0, 'separate', 'KG', NOW() - INTERVAL '25 days'),

    -- Items for PO 2
    ('b6100001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000002', 'b5000001-0000-0000-0000-000000000004', 40.0, 40.0, 1620.00, 64800.00, 0.0, 5.0, 1000.0, 'separate', 'BOX', NOW() - INTERVAL '14 days'),
    ('b6100001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000002', 'b5000001-0000-0000-0000-000000000006', 100.0, 100.0, 400.00, 40000.00, 0.0, 5.0, 800.0, 'separate', 'PCS', NOW() - INTERVAL '14 days'),

    -- Items for PO 3
    ('b6100001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000003', 'b5000001-0000-0000-0000-000000000002', 500.0, 0.0, 51.00, 25500.00, 0.0, 5.0, 1200.0, 'separate', 'KG', NOW() - INTERVAL '4 days'),

    -- Items for PO 4
    ('b6100001-0000-0000-0000-000000000006', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000004', 'b5000001-0000-0000-0000-000000000009', 100.0, 0.0, 175.00, 17500.00, 0.0, 5.0, 450.0, 'separate', 'KG', NOW() - INTERVAL '3 days'),
    ('b6100001-0000-0000-0000-000000000007', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000004', 'b5000001-0000-0000-0000-000000000010', 40.0, 0.0, 560.00, 22400.00, 0.0, 5.0, 500.0, 'separate', 'KG', NOW() - INTERVAL '3 days'),

    -- Items for PO 5
    ('b6100001-0000-0000-0000-000000000008', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000005', 'b5000001-0000-0000-0000-000000000007', 300.0, 0.0, 132.00, 39600.00, 0.0, 5.0, 2000.0, 'separate', 'KG', NOW() - INTERVAL '2 days'),
    ('b6100001-0000-0000-0000-000000000009', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000005', 'b5000001-0000-0000-0000-000000000008', 200.0, 0.0, 108.00, 21600.00, 0.0, 5.0, 1200.0, 'separate', 'KG', NOW() - INTERVAL '2 days'),

    -- Items for PO 6
    ('b6100001-0000-0000-0000-000000000010', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000006', 'b5000001-0000-0000-0000-000000000005', 30.0, 0.0, 1800.00, 54000.00, 0.0, 5.0, 1500.0, 'separate', 'BOX', NOW() - INTERVAL '1 day'),

    -- Items for PO 7
    ('b6100001-0000-0000-0000-000000000011', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b6000001-0000-0000-0000-000000000007', 'b5000001-0000-0000-0000-000000000011', 80.0, 0.0, 255.00, 20400.00, 0.0, 5.0, 800.0, 'separate', 'KG', NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 13. Stock Movements (Ledger activity)
INSERT INTO "StockMovements" (
    "Id", "BusinessId", "CatalogItemId", "MovementType",
    "QuantityDelta", "QuantityBefore", "QuantityAfter",
    "ReferenceType", "ReferenceId", "Reason", "Notes", "CreatedById", "CreatedAt"
)
VALUES
    ('b7000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b5000001-0000-0000-0000-000000000001',
     'PurchaseArrived', 1000.0, 850.0, 1850.0, 'Purchase', 'b6000001-0000-0000-0000-000000000001', 'PO-2026-001 stock commitment', 'Received into Bay A-12', '53cc6489-b7d9-456a-a52c-a283f323f5d5', NOW() - INTERVAL '21 days'),

    ('b7000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b5000001-0000-0000-0000-000000000003',
     'PurchaseArrived', 500.0, 220.0, 720.0, 'Purchase', 'b6000001-0000-0000-0000-000000000001', 'PO-2026-001 stock commitment', 'Palletised in Bay B-04', '53cc6489-b7d9-456a-a52c-a283f323f5d5', NOW() - INTERVAL '21 days'),

    ('b7000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b5000001-0000-0000-0000-000000000004',
     'PurchaseArrived', 40.0, 20.0, 60.0, 'Purchase', 'b6000001-0000-0000-0000-000000000002', 'PO-2026-002 stock commitment', 'Racked on Level 2 Oil Section', '53cc6489-b7d9-456a-a52c-a283f323f5d5', NOW() - INTERVAL '10 days'),

    ('b7000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b5000001-0000-0000-0000-000000000006',
     'PurchaseArrived', 100.0, 40.0, 140.0, 'Purchase', 'b6000001-0000-0000-0000-000000000002', 'PO-2026-002 stock commitment', 'Stored in temperature control cabinet', '53cc6489-b7d9-456a-a52c-a283f323f5d5', NOW() - INTERVAL '10 days'),

    ('b7000001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b5000001-0000-0000-0000-000000000005',
     'AdjustmentDecrease', -4.0, 12.0, 8.0, 'ManualAdjustment', NULL, 'Seal damage in warehouse transport', '4 bottles leaking, rejected from saleable inventory', '53cc6489-b7d9-456a-a52c-a283f323f5d5', NOW() - INTERVAL '2 days'),

    ('b7000001-0000-0000-0000-000000000006', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'b5000001-0000-0000-0000-000000000008',
     'PhysicalCount', 15.0, 340.0, 355.0, 'CycleCount', NULL, 'Cycle count variance adjustment', 'Physical recount by staff showed +15 KG surplus in bin 18', '53cc6489-b7d9-456a-a52c-a283f323f5d5', NOW() - INTERVAL '1 day')
ON CONFLICT ("Id") DO NOTHING;

-- 14. Notifications
INSERT INTO "Notifications" (
    "Id", "BusinessId", "UserId", "Type", "Title", "Message",
    "IsRead", "ReferenceType", "ReferenceId", "DedupeKey", "CreatedAt"
)
VALUES
    ('b8000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     '53cc6489-b7d9-456a-a52c-a283f323f5d5', 'OutOfStock', 'Critical Stock Alert: Toor Dal Out of Stock',
     'Indore Unpolished Toor Dal is completely OUT OF STOCK (0 KG). Minimum reorder level is 150 KG. Please issue emergency order.',
     false, 'CatalogItem', 'b5000001-0000-0000-0000-000000000007', 'oos-b5000001-0000-0000-0000-000000000007', NOW() - INTERVAL '2 hours'),

    ('b8000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     '53cc6489-b7d9-456a-a52c-a283f323f5d5', 'LowStock', 'Low Stock Warning: Mustard Oil 1L',
     'Kachi Ghani Mustard Oil has fallen to 8 BOX (Reorder threshold is 20 BOX). Reorder PO-2026-006 is pending dispatch.',
     false, 'CatalogItem', 'b5000001-0000-0000-0000-000000000005', 'low-b5000001-0000-0000-0000-000000000005', NOW() - INTERVAL '5 hours'),

    ('b8000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     '53cc6489-b7d9-456a-a52c-a283f323f5d5', 'DeliveryPending', 'Purchase Order Dispatched: PO-2026-005',
     'Consignment of 500 KG pulses from Golden Harvest Pulses has departed Indore (LR: MP-IND-8821). Expected arrival in 48h.',
     false, 'Purchase', 'b6000001-0000-0000-0000-000000000005', 'disp-b6000001-0000-0000-0000-000000000005', NOW() - INTERVAL '1 day'),

    ('b8000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     '53cc6489-b7d9-456a-a52c-a283f323f5d5', 'VerificationRequired', 'Delivery Arrived at Dock 2: PO-2026-004',
     'PO-2026-004 from Malabar Spice Plantation Co has arrived. Staff physical count and seal verification required.',
     false, 'Purchase', 'b6000001-0000-0000-0000-000000000004', 'arr-b6000001-0000-0000-0000-000000000004', NOW() - INTERVAL '4 hours'),

    ('b8000001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     '53cc6489-b7d9-456a-a52c-a283f323f5d5', 'StockVariance', 'Physical Count Variance Noted: Yellow Moong Dal',
     'Cycle audit recorded physical stock of 355 KG against system ledger 340 KG (+15 KG variance). Audit log generated.',
     true, 'CatalogItem', 'b5000001-0000-0000-0000-000000000008', 'var-b5000001-0000-0000-0000-000000000008', NOW() - INTERVAL '1 day')
ON CONFLICT ("Id") DO NOTHING;

-- 15. Checklist Templates
INSERT INTO "ChecklistTemplate" ("Id", "BusinessId", "Slot", "Key", "Description", "Priority", "IsActive", "CreatedAt")
VALUES
    ('b9000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'morning', 'cold_chain_check', 'Inspect temperature and humidity sensors in Grain & Spice bays', 1, true, NOW()),
    ('b9000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'morning', 'forklift_safety', 'Check battery charge, hydraulic fluid, and horn on Forklifts FL-1 & FL-2', 2, true, NOW()),
    ('b9000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'morning', 'dock_hazard_sweep', 'Clear debris, wrap plastics, and oil spills from loading bays 1-3', 3, true, NOW()),
    ('b9000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'midday', 'incoming_truck_survey', 'Inspect vehicle seal numbers and billty match on all afternoon trucks', 1, true, NOW()),
    ('b9000001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'midday', 'aisle_clearance_audit', 'Ensure 2.5m forklift corridor clearance along aisles 1 to 8', 2, true, NOW()),
    ('b9000001-0000-0000-0000-000000000006', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'evening', 'daily_usage_audit', 'Verify and tally physical issue slips with daily usage consumption log', 1, true, NOW()),
    ('b9000001-0000-0000-0000-000000000007', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', 'evening', 'bay_lockdown_security', 'Lock motorized dock shutters and inspect CCTV perimeter cameras', 2, true, NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 16. Checklist Completions for Today
INSERT INTO "ChecklistCompletion" (
    "Id", "BusinessId", "Date", "Slot", "TaskKey", "CompletedAt", "CompletedByUserId", "Notes", "CreatedAt"
)
VALUES
    ('b9100001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     CURRENT_DATE, 'morning', 'cold_chain_check',
     NOW() - INTERVAL '7 hours', 'e0f383e3-ff92-4fd0-a9f5-2955752cd733', 'Grain bay temp: 24°C, humidity 62%. Normal.', NOW()),

    ('b9100001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     CURRENT_DATE, 'morning', 'forklift_safety',
     NOW() - INTERVAL '6 hours', 'e0f383e3-ff92-4fd0-a9f5-2955752cd733', 'FL-1 charged to 98%, all hydraulic lines inspected.', NOW()),

    ('b9100001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     CURRENT_DATE, 'morning', 'dock_hazard_sweep',
     NOW() - INTERVAL '5 hours', 'e0f383e3-ff92-4fd0-a9f5-2955752cd733', 'Docks swept and pallet staging area cleared.', NOW()),

    ('b9100001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     CURRENT_DATE, 'midday', 'incoming_truck_survey',
     NOW() - INTERVAL '2 hours', 'e0f383e3-ff92-4fd0-a9f5-2955752cd733', 'PO-2026-004 seal verified against transport bilti.', NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 17. Daily Usage Logs (Item consumption over past 3 days)
INSERT INTO "DailyUsageLogs" (
    "Id", "BusinessId", "Date", "CatalogItemId",
    "OpeningQty", "PurchasedQty", "UsedQty", "ClosingQty",
    "Notes", "LoggedByUserId", "LoggedAt", "IsConfirmed", "CreatedAt"
)
VALUES
    -- Basmati Rice
    ('ba000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     CURRENT_DATE, 'b5000001-0000-0000-0000-000000000001',
     1970.0, 0.0, 120.0, 1850.0, 'Dispatched to retail distribution chain', 'e0f383e3-ff92-4fd0-a9f5-2955752cd733', NOW(), true, NOW()),

    -- Sona Masoori
    ('ba000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     CURRENT_DATE, 'b5000001-0000-0000-0000-000000000002',
     1000.0, 0.0, 80.0, 920.0, 'Catering orders fulfilled', 'e0f383e3-ff92-4fd0-a9f5-2955752cd733', NOW(), true, NOW()),

    -- Sharbati Atta
    ('ba000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     CURRENT_DATE, 'b5000001-0000-0000-0000-000000000003',
     795.0, 0.0, 75.0, 720.0, 'Wholesale distributor dispatch', 'e0f383e3-ff92-4fd0-a9f5-2955752cd733', NOW(), true, NOW()),

    -- Sunflower Oil
    ('ba000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     CURRENT_DATE, 'b5000001-0000-0000-0000-000000000004',
     66.0, 0.0, 6.0, 60.0, '6 cartons issued to grocery marts', 'e0f383e3-ff92-4fd0-a9f5-2955752cd733', NOW(), true, NOW()),

    -- Toor Dal (depleted yesterday)
    ('ba000001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     CURRENT_DATE - INTERVAL '1 day', 'b5000001-0000-0000-0000-000000000007',
     85.0, 0.0, 85.0, 0.0, 'Stock completely exhausted by midday rush', 'e0f383e3-ff92-4fd0-a9f5-2955752cd733', NOW() - INTERVAL '1 day', true, NOW() - INTERVAL '1 day')
ON CONFLICT ("Id") DO NOTHING;

-- 18. Daily Operation Snapshots (Last 7 Days)
INSERT INTO "DailyOperationSnapshots" (
    "Id", "BusinessId", "Date",
    "TotalChecklistTasks", "CompletedChecklistTasks", "ChecklistCompletionRate",
    "TotalItemsUsed", "TotalQuantityUsed", "DeadStockItems", "FastMovingItems", "SlowMovingItems",
    "MaterializedAt", "CreatedAt"
)
VALUES
    ('bb000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', CURRENT_DATE - 6, 7, 7, 100.00, 8, 480.00, 0, 3, 2, NOW(), NOW() - INTERVAL '6 days'),
    ('bb000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', CURRENT_DATE - 5, 7, 6, 85.71, 9, 520.00, 0, 4, 1, NOW(), NOW() - INTERVAL '5 days'),
    ('bb000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', CURRENT_DATE - 4, 7, 7, 100.00, 8, 510.00, 0, 3, 2, NOW(), NOW() - INTERVAL '4 days'),
    ('bb000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', CURRENT_DATE - 3, 7, 7, 100.00, 9, 590.00, 0, 4, 2, NOW(), NOW() - INTERVAL '3 days'),
    ('bb000001-0000-0000-0000-000000000005', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', CURRENT_DATE - 2, 7, 6, 85.71, 8, 460.00, 0, 3, 2, NOW(), NOW() - INTERVAL '2 days'),
    ('bb000001-0000-0000-0000-000000000006', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', CURRENT_DATE - 1, 7, 7, 100.00, 9, 610.00, 1, 4, 1, NOW(), NOW() - INTERVAL '1 day'),
    ('bb000001-0000-0000-0000-000000000007', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6', CURRENT_DATE, 7, 4, 57.14, 4, 281.00, 1, 3, 1, NOW(), NOW())
ON CONFLICT ("Id") DO NOTHING;

-- 19. ML Prediction Logs (7-day demand forecasts for key items)
INSERT INTO "MlPredictionLogs" (
    "Id", "BusinessId", "CatalogItemId", "UserId",
    "ModelVersion", "InputVersion", "StartDate", "Horizon",
    "PredictedQuantity", "DailyPredictionsJson", "CreatedAt"
)
VALUES
    ('bc000001-0000-0000-0000-000000000001', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     'b5000001-0000-0000-0000-000000000001', '53cc6489-b7d9-456a-a52c-a283f323f5d5',
     'v1.2-lightgbm-quantile', 'hash-v1-inp-8821', CURRENT_DATE, 7,
     875.0000,
     '[{"day":1,"quantity":125.0},{"day":2,"quantity":130.0},{"day":3,"quantity":115.0},{"day":4,"quantity":140.0},{"day":5,"quantity":120.0},{"day":6,"quantity":110.0},{"day":7,"quantity":135.0}]'::jsonb,
     NOW()),

    ('bc000001-0000-0000-0000-000000000002', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     'b5000001-0000-0000-0000-000000000003', '53cc6489-b7d9-456a-a52c-a283f323f5d5',
     'v1.2-lightgbm-quantile', 'hash-v1-inp-8821', CURRENT_DATE, 7,
     560.0000,
     '[{"day":1,"quantity":80.0},{"day":2,"quantity":85.0},{"day":3,"quantity":75.0},{"day":4,"quantity":90.0},{"day":5,"quantity":80.0},{"day":6,"quantity":70.0},{"day":7,"quantity":80.0}]'::jsonb,
     NOW()),

    ('bc000001-0000-0000-0000-000000000003', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     'b5000001-0000-0000-0000-000000000004', '53cc6489-b7d9-456a-a52c-a283f323f5d5',
     'v1.2-lightgbm-quantile', 'hash-v1-inp-8821', CURRENT_DATE, 7,
     49.0000,
     '[{"day":1,"quantity":7.0},{"day":2,"quantity":8.0},{"day":3,"quantity":6.0},{"day":4,"quantity":8.0},{"day":5,"quantity":7.0},{"day":6,"quantity":6.0},{"day":7,"quantity":7.0}]'::jsonb,
     NOW()),

    ('bc000001-0000-0000-0000-000000000004', 'ebf95c3a-05c4-477f-8f32-bd23b94d87f6',
     'b5000001-0000-0000-0000-000000000007', '53cc6489-b7d9-456a-a52c-a283f323f5d5',
     'v1.2-lightgbm-quantile', 'hash-v1-inp-8821', CURRENT_DATE, 7,
     630.0000,
     '[{"day":1,"quantity":90.0},{"day":2,"quantity":95.0},{"day":3,"quantity":85.0},{"day":4,"quantity":100.0},{"day":5,"quantity":90.0},{"day":6,"quantity":80.0},{"day":7,"quantity":90.0}]'::jsonb,
     NOW())
ON CONFLICT ("Id") DO NOTHING;

COMMIT;
