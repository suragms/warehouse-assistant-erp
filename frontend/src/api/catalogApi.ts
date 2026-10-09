import apiClient from './apiClient';

export interface CatalogItem {
  id: string;
  itemCode: string;
  barcode?: string;
  name: string;
  categoryId: string;
  categoryName: string;
  typeId?: string;
  typeName?: string;
  defaultUnit: string;
  kgPerUnit?: number;
  reorderLevel: number;
  currentStock: number;
  isActive: boolean;
  rowVersion: string;
}

export interface CatalogItemDetail extends CatalogItem {
  variants?: CatalogVariant[];
  lastSupplierId?: string;
  lastSupplierName?: string;
  lastBrokerId?: string;
  lastBrokerName?: string;
}

export interface CatalogVariant {
  id: string;
  name: string;
  kgPerUnit?: number | null;
  rowVersion: string;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  itemCount: number;
}

export interface CategoryType {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  itemCount: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  linkedItemsCount: number;
}

export interface SupplierItem {
  id: string;
  supplierId: string;
  catalogItemId: string;
  itemCode: string;
  itemName: string;
  supplierItemCode?: string | null;
  isDefault: boolean;
  notes?: string | null;
}

export interface SupplierItemInput {
  catalogItemId?: string;
  supplierItemCode?: string;
  isDefault: boolean;
  notes?: string;
}

export interface Broker {
  imageUrl?: string;
  id: string;
  name: string;
  isActive: boolean;
  linkedSuppliersCount: number;
}

export interface GlobalSearchResponse {
  items: CatalogItem[];
  suppliers: Supplier[];
  brokers: Broker[];
  categories: Category[];
}

export interface DuplicateCandidate {
  itemAId: string;
  itemAName: string;
  itemACode: string;
  itemABarcode?: string;
  itemACategoryId: string;
  itemACategoryName: string;
  itemATypeName?: string;
  itemBId: string;
  itemBName: string;
  itemBCode: string;
  itemBBarcode?: string;
  itemBCategoryId: string;
  itemBCategoryName: string;
  itemBTypeName?: string;
  similarityScore: number;
  matchReasons: string[];
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export const catalogApi = {
  // Catalog Items
  getItems: async (page = 1, pageSize = 50, search?: string, categoryId?: string): Promise<PaginatedResult<CatalogItem>> => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('pageSize', pageSize.toString());
    if (search) params.append('search', search);
    if (categoryId) params.append('categoryId', categoryId);

    const res = await apiClient.get(`/catalog/items?${params.toString()}`);
    return res.data;
  },

  getItemById: async (id: string): Promise<CatalogItemDetail> => {
    const res = await apiClient.get(`/catalog/items/${id}`);
    return res.data;
  },

  lookupByBarcode: async (barcode: string): Promise<CatalogItem> => {
    const res = await apiClient.get(`/catalog/items/by-barcode/${encodeURIComponent(barcode)}`);
    return res.data;
  },

  createItem: async (item: Partial<CatalogItem>): Promise<CatalogItem> => {
    const res = await apiClient.post('/catalog/items', item);
    return res.data;
  },

  updateItem: async (id: string, item: Partial<CatalogItem>): Promise<CatalogItem> => {
    const res = await apiClient.put(`/catalog/items/${id}`, item);
    return res.data;
  },

  deleteItem: async (id: string): Promise<void> => {
    await apiClient.delete(`/catalog/items/${id}`);
  },
  archiveItem: async (id: string, rowVersion: string): Promise<void> => {
    await apiClient.patch(`/catalog/items/${id}/archive`, { rowVersion });
  },

  // Categories
  createVariant: async (itemId: string, variant: { name: string; kgPerUnit: number | null }): Promise<CatalogVariant> => {
    const res = await apiClient.post(`/catalog/items/${itemId}/variants`, variant);
    return res.data;
  },
  updateVariant: async (itemId: string, variant: CatalogVariant): Promise<CatalogVariant> => {
    const res = await apiClient.put(`/catalog/items/${itemId}/variants/${variant.id}`, variant);
    return res.data;
  },
  deleteVariant: async (itemId: string, variant: CatalogVariant): Promise<void> => {
    await apiClient.delete(`/catalog/items/${itemId}/variants/${variant.id}?expectedVersion=${encodeURIComponent(variant.rowVersion)}`);
  },

  getCategories: async (): Promise<Category[]> => {
    const res = await apiClient.get('/catalog/categories');
    return res.data;
  },

  createCategory: async (name: string): Promise<Category> => {
    const res = await apiClient.post(`/catalog/categories?name=${encodeURIComponent(name)}`);
    return res.data;
  },

  updateCategory: async (id: string, name: string): Promise<Category> => {
    const res = await apiClient.put(`/catalog/categories/${id}?name=${encodeURIComponent(name)}`);
    return res.data;
  },

  deleteCategory: async (id: string): Promise<void> => {
    await apiClient.delete(`/catalog/categories/${id}`);
  },

  // Category Types
  getTypesByCategory: async (categoryId: string): Promise<CategoryType[]> => {
    const res = await apiClient.get(`/catalog/categories/${categoryId}/types`);
    return res.data;
  },

  createType: async (categoryId: string, name: string): Promise<CategoryType> => {
    const res = await apiClient.post(`/catalog/categories/${categoryId}/types`, JSON.stringify(name), {
      headers: { 'Content-Type': 'application/json' }
    });
    return res.data;
  },

  updateType: async (categoryId: string, id: string, name: string): Promise<CategoryType> => {
    const res = await apiClient.put(`/catalog/categories/${categoryId}/types/${id}`, JSON.stringify(name), {
      headers: { 'Content-Type': 'application/json' }
    });
    return res.data;
  },

  deleteType: async (categoryId: string, id: string): Promise<void> => {
    await apiClient.delete(`/catalog/categories/${categoryId}/types/${id}`);
  },

  // Suppliers
  getSuppliers: async (params?: { search?: string; page?: number; pageSize?: number }): Promise<Supplier[]> => {
    const res = await apiClient.get('/catalog/suppliers', { params });
    return res.data;
  },

  createSupplier: async (supplier: Partial<Supplier>): Promise<Supplier> => {
    const res = await apiClient.post('/catalog/suppliers', supplier);
    return res.data;
  },

  updateSupplier: async (id: string, supplier: Partial<Supplier>): Promise<Supplier> => {
    const res = await apiClient.put(`/catalog/suppliers/${id}`, supplier);
    return res.data;
  },

  deleteSupplier: async (id: string): Promise<void> => {
    await apiClient.delete(`/catalog/suppliers/${id}`);
  },

  getSupplierItems: async (supplierId: string): Promise<SupplierItem[]> => {
    const res = await apiClient.get(`/catalog/suppliers/${supplierId}/items`);
    return res.data;
  },
  addSupplierItem: async (supplierId: string, input: SupplierItemInput): Promise<SupplierItem> => {
    const res = await apiClient.post(`/catalog/suppliers/${supplierId}/items`, input);
    return res.data;
  },
  updateSupplierItem: async (supplierId: string, linkId: string, input: SupplierItemInput): Promise<SupplierItem> => {
    const res = await apiClient.put(`/catalog/suppliers/${supplierId}/items/${linkId}`, input);
    return res.data;
  },
  removeSupplierItem: async (supplierId: string, linkId: string): Promise<void> => {
    await apiClient.delete(`/catalog/suppliers/${supplierId}/items/${linkId}`);
  },

  // Brokers
  getBrokers: async (params?: { search?: string; page?: number; pageSize?: number }): Promise<Broker[]> => {
    const res = await apiClient.get('/catalog/brokers', { params });
    return res.data;
  },

  createBroker: async (broker: Partial<Broker>): Promise<Broker> => {
    const res = await apiClient.post('/catalog/brokers', broker);
    return res.data;
  },

  updateBroker: async (id: string, broker: Partial<Broker>): Promise<Broker> => {
    const res = await apiClient.put(`/catalog/brokers/${id}`, broker);
    return res.data;
  },

  deleteBroker: async (id: string): Promise<void> => {
    await apiClient.delete(`/catalog/brokers/${id}`);
  },

  // Search
  search: async (query: string): Promise<GlobalSearchResponse> => {
    const res = await apiClient.get(`/catalog/search?q=${encodeURIComponent(query)}`);
    return res.data;
  },

  // Duplicate Detection
  getDuplicateCandidates: async (minSimilarity?: number): Promise<DuplicateCandidate[]> => {
    const params = new URLSearchParams();
    if (minSimilarity !== undefined) {
      params.append('minSimilarity', minSimilarity.toString());
    }
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get(`/catalog/items/duplicates${queryString}`);
    return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  }
};
