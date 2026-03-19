"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================
// SUPABASE CLIENT — Single instance
// ============================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { headers: { "x-app-name": "kitbag" } },
  }
);

// ============================================
// TYPES
// ============================================
type School = { id: number; name: string; board: string; logo_url?: string | null };
type Branch = { id: number; school_id: number; area: string; pincode: string; address: string };
type Grade = { id: number; grade_name: string; display_order: number };
type Category = { id: number; name: string; icon: string; display_order: number };
type SupplyItem = { id: number; item_name: string; quantity_required: number; unit: string | null; mandatory: boolean; category_id: number };
type VendorInfo = { id: number; vendor_name: string; rating: number | null; area: string; avg_delivery_time: number | null; logo_url: string | null };
type ProductImage = { image_url: string; is_primary: boolean };
type VendorProduct = { id: number; vendor_id: number; product_name: string; price: number; mrp: number | null; stock_quantity: number; vendors: VendorInfo; product_images: ProductImage[] };
type CartItem = { vendorProductId: number; itemName: string; vendorName: string; price: number; qty: number; image?: string | null };
type AppError = { message: string; retryFn?: () => void };

// ============================================
// CONSTANTS
// ============================================
const boardColors: Record<string, string> = {
  CBSE: "#3b82f6", ICSE: "#8b5cf6", SSC: "#10b981", IB: "#f59e0b"
};

// ============================================
// CACHE — TTL based with scoped keys
// Prevents cache collisions between different
// branches/grades/items
// ============================================
type CacheEntry<T> = { data: T; timestamp: number; ttl: number };
const cacheStore = new Map<string, CacheEntry<unknown>>();

function getCache<T>(key: string): T | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) { cacheStore.delete(key); return null; }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMinutes = 30): void {
  cacheStore.set(key, { data, timestamp: Date.now(), ttl: ttlMinutes * 60 * 1000 });
}

// Scoped cache keys — prevents collisions
const cacheKeys = {
  schools: () => "schools",
  grades: () => "grades",
  categories: () => "categories",
  branches: (schoolId: number) => `branches:school_${schoolId}`,
  supplyItems: (branchId: number, gradeId: number) => `supply:branch_${branchId}:grade_${gradeId}`,
  vendorProducts: (itemId: number) => `vendors:item_${itemId}`,
};

// ============================================
// DATA LAYER — All Supabase queries here
// UI never calls supabase directly
// Easy to swap for API calls later
// ============================================
async function querySchools(): Promise<School[]> {
  const { data, error } = await supabase
    .from("schools")
    .select("id, name, board, logo_url")
    .eq("is_active", true)
    .order("name")
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function queryBranches(schoolId: number): Promise<Branch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, school_id, area, pincode, address")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .order("area");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function queryGrades(): Promise<Grade[]> {
  const { data, error } = await supabase
    .from("grades")
    .select("id, grade_name, display_order")
    .order("display_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function queryCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, icon, display_order")
    .order("display_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function querySupplyItems(branchId: number, gradeId: number): Promise<SupplyItem[]> {
  const { data: supplyList, error: listError } = await supabase
    .from("supply_lists")
    .select("id")
    .eq("branch_id", branchId)
    .eq("grade_id", gradeId)
    .eq("is_published", true)
    .maybeSingle();
  if (listError) throw new Error(listError.message);
  if (!supplyList) return [];
  const { data: items, error: itemsError } = await supabase
    .from("supply_items")
    .select("id, item_name, quantity_required, unit, mandatory, category_id")
    .eq("supply_list_id", supplyList.id)
    .order("item_name");
  if (itemsError) throw new Error(itemsError.message);
  return items ?? [];
}

async function queryVendorProducts(supplyItemId: number): Promise<VendorProduct[]> {
  const { data, error } = await supabase
    .from("vendor_products")
    .select(`
      id, vendor_id, product_name, price, mrp, stock_quantity,
      vendors!inner(id, vendor_name, rating, area, avg_delivery_time, logo_url),
      product_images(image_url, is_primary)
    `)
    .eq("supply_item_id", supplyItemId)
    .eq("is_active", true)
    .gt("stock_quantity", 0)
    .order("price", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data as unknown as VendorProduct[]) ?? [];
}

// ============================================
// DEBOUNCE HOOK
// Prevents filtering on every keystroke
// ============================================
function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ============================================
// DATA LOADER HOOK
// Handles:
// ✅ Cache check before every API call
// ✅ Request deduplication (no double calls)
// ✅ Race condition prevention (requestId pattern)
// ============================================
function useDataLoader() {
  const inProgressRef = useRef<Set<string>>(new Set());
  const requestIdRef = useRef<Map<string, number>>(new Map());

  const load = useCallback(async <T>({
    cacheKey,
    cacheTtlMinutes = 30,
    fetcher,
    onSuccess,
    onError,
    onLoadingChange,
  }: {
    cacheKey: string;
    cacheTtlMinutes?: number;
    fetcher: () => Promise<T>;
    onSuccess: (data: T) => void;
    onError: (msg: string) => void;
    onLoadingChange: (loading: boolean) => void;
  }) => {
    // Check cache first
    const cached = getCache<T>(cacheKey);
    if (cached) { onSuccess(cached); return; }

    // Deduplication — skip if already loading same key
    if (inProgressRef.current.has(cacheKey)) return;

    // Race condition — assign unique ID
    const requestId = Date.now();
    requestIdRef.current.set(cacheKey, requestId);
    inProgressRef.current.add(cacheKey);
    onLoadingChange(true);

    try {
      const data = await fetcher();
      // Only update if still the latest request for this key
      if (requestIdRef.current.get(cacheKey) !== requestId) return;
      setCache(cacheKey, data, cacheTtlMinutes);
      onSuccess(data);
    } catch (err) {
      if (requestIdRef.current.get(cacheKey) !== requestId) return;
      const msg = err instanceof Error ? err.message : "Request failed";
      console.error(`[${cacheKey}]`, msg);
      onError(msg);
    } finally {
      inProgressRef.current.delete(cacheKey);
      onLoadingChange(false);
    }
  }, []);

  return { load };
}

// ============================================
// SKELETON LOADER — better than spinner
// Shows shape of content while loading
// ============================================
function SkeletonCard() {
  return (
    <div style={{ background: "white", borderRadius: 14, padding: 18, marginBottom: 10, boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 16, borderRadius: 6, marginBottom: 8, background: "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", width: "70%" }} />
          <div style={{ height: 12, borderRadius: 6, background: "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", width: "40%" }} />
        </div>
      </div>
    </div>
  );
}

function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </>
  );
}

// ============================================
// REUSABLE UI COMPONENTS
// ============================================
function ErrorCard({ error }: { error: AppError }) {
  return (
    <div style={{ background: "#fef2f2", border: "2px solid #fecaca", borderRadius: 14, padding: 20, textAlign: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
      <p style={{ color: "#dc2626", fontWeight: 700, margin: "0 0 8px" }}>Something went wrong</p>
      <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 16px" }}>{error.message}</p>
      {error.retryFn && (
        <button onClick={error.retryFn}
          style={{ background: "#dc2626", color: "white", border: "none", padding: "10px 24px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
          Try Again
        </button>
      )}
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div style={{ textAlign: "center", padding: 48, background: "white", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>{icon}</div>
      <p style={{ color: "#374151", fontWeight: 700, fontSize: 16, margin: "0 0 6px" }}>{title}</p>
      {subtitle && <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>{subtitle}</p>}
    </div>
  );
}

// ============================================
// MAIN APP
// ============================================
export default function SchoolMart() {

  // UI state
  const [screen, setScreen] = useState("home");
  const [search, setSearch] = useState("");
  const [boardFilter, setBoardFilter] = useState("All");
  const [cartOpen, setCartOpen] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  // Data state
  const [schools, setSchools] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplyItems, setSupplyItems] = useState<SupplyItem[]>([]);
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Selection state
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedItem, setSelectedItem] = useState<SupplyItem | null>(null);

  // Debounced search
  const debouncedSearch = useDebounce(search, 300);

  // Data loader with deduplication + race condition handling
  const { load } = useDataLoader();

  // ============================================
  // DATA FETCHING — all through data loader
  // ============================================
  const loadSchools = useCallback(async () => {
    await load<School[]>({
      cacheKey: cacheKeys.schools(),
      cacheTtlMinutes: 60,
      fetcher: querySchools,
      onSuccess: setSchools,
      onError: (msg) => setError({ message: "Could not load schools. Please try again.", retryFn: loadSchools }),
      onLoadingChange: setLoading,
    });
  }, [load]);

  const loadBranches = useCallback(async (schoolId: number) => {
    setBranches([]);
    await load<Branch[]>({
      cacheKey: cacheKeys.branches(schoolId),
      cacheTtlMinutes: 30,
      fetcher: () => queryBranches(schoolId),
      onSuccess: setBranches,
      onError: (msg) => setError({ message: "Could not load branches.", retryFn: () => loadBranches(schoolId) }),
      onLoadingChange: setLoading,
    });
  }, [load]);

  const loadGrades = useCallback(async () => {
    await load<Grade[]>({
      cacheKey: cacheKeys.grades(),
      cacheTtlMinutes: 120,
      fetcher: queryGrades,
      onSuccess: setGrades,
      onError: (msg) => console.error("[grades]", msg),
      onLoadingChange: () => {}, // silent — no spinner for grades
    });
  }, [load]);

  const loadCategories = useCallback(async () => {
    await load<Category[]>({
      cacheKey: cacheKeys.categories(),
      cacheTtlMinutes: 120,
      fetcher: queryCategories,
      onSuccess: setCategories,
      onError: (msg) => console.error("[categories]", msg),
      onLoadingChange: () => {}, // silent
    });
  }, [load]);

  const loadSupplyItems = useCallback(async (branchId: number, gradeId: number) => {
    setSupplyItems([]);
    await load<SupplyItem[]>({
      cacheKey: cacheKeys.supplyItems(branchId, gradeId),
      cacheTtlMinutes: 15,
      fetcher: () => querySupplyItems(branchId, gradeId),
      onSuccess: setSupplyItems,
      onError: (msg) => setError({ message: "Could not load supply list.", retryFn: () => loadSupplyItems(branchId, gradeId) }),
      onLoadingChange: setLoading,
    });
  }, [load]);

  const loadVendorProducts = useCallback(async (supplyItemId: number) => {
    setVendorProducts([]);
    await load<VendorProduct[]>({
      cacheKey: cacheKeys.vendorProducts(supplyItemId),
      cacheTtlMinutes: 10,
      fetcher: () => queryVendorProducts(supplyItemId),
      onSuccess: setVendorProducts,
      onError: (msg) => setError({ message: "Could not load vendors.", retryFn: () => loadVendorProducts(supplyItemId) }),
      onLoadingChange: setLoading,
    });
  }, [load]);

  // Load schools once on mount
  useEffect(() => { loadSchools(); }, [loadSchools]);

  // ============================================
  // MEMOIZED DERIVED STATE
  // Only recalculates when dependencies change
  // ============================================
  const filteredSchools = useMemo(() =>
    schools.filter(s =>
      s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
      (boardFilter === "All" || s.board === boardFilter)
    ),
    [schools, debouncedSearch, boardFilter]
  );

  const visibleCategories = useMemo(() =>
    categories.filter(c => supplyItems.some(i => i.category_id === c.id)),
    [categories, supplyItems]
  );

  const itemsByCategory = useMemo(() =>
    selectedCategory ? supplyItems.filter(i => i.category_id === selectedCategory.id) : [],
    [supplyItems, selectedCategory]
  );

  const { total, cartCount } = useMemo(() => ({
    total: cart.reduce((sum, c) => sum + c.price * c.qty, 0),
    cartCount: cart.reduce((s, c) => s + c.qty, 0),
  }), [cart]);

  // ============================================
  // NAVIGATION — parallel data loading
  // ============================================
  const handleSchoolSelect = useCallback(async (school: School) => {
    if (loading) return;
    setSelectedSchool(school);
    setScreen("branches");
    setError(null);
    // Load branches + grades in parallel — 2x faster
    await Promise.all([loadBranches(school.id), loadGrades()]);
  }, [loading, loadBranches, loadGrades]);

  const handleBranchSelect = useCallback((branch: Branch) => {
    if (loading) return;
    setSelectedBranch(branch);
    setScreen("grade");
    setError(null);
  }, [loading]);

  const handleGradeSelect = useCallback(async (grade: Grade) => {
    if (!selectedBranch || loading) return;
    setSelectedGrade(grade);
    setScreen("categories");
    setError(null);
    // Load supply items + categories in parallel
    await Promise.all([
      loadSupplyItems(selectedBranch.id, grade.id),
      loadCategories(),
    ]);
  }, [selectedBranch, loading, loadSupplyItems, loadCategories]);

  const handleCategorySelect = useCallback((category: Category) => {
    setSelectedCategory(category);
    setScreen("items");
    setError(null);
  }, []);

  const handleItemSelect = useCallback(async (item: SupplyItem) => {
    if (loading) return;
    setSelectedItem(item);
    setScreen("vendors");
    setError(null);
    await loadVendorProducts(item.id);
  }, [loading, loadVendorProducts]);

  const goBack = useCallback(() => {
    setError(null);
    const transitions: Record<string, () => void> = {
      vendors: () => { setScreen("items"); setSelectedItem(null); setVendorProducts([]); },
      items: () => { setScreen("categories"); setSelectedCategory(null); },
      categories: () => { setScreen("grade"); setSelectedGrade(null); setSupplyItems([]); },
      grade: () => { setScreen("branches"); setSelectedBranch(null); },
      branches: () => { setScreen("home"); setSelectedSchool(null); setBranches([]); },
    };
    transitions[screen]?.();
  }, [screen]);

  // ============================================
  // CART LOGIC
  // ============================================
  const addToCart = useCallback((vp: VendorProduct, item: SupplyItem) => {
    const primaryImage = vp.product_images?.find(i => i.is_primary)?.image_url
      ?? vp.product_images?.[0]?.image_url ?? null;
    setCart(prev => {
      const exists = prev.find(c => c.vendorProductId === vp.id);
      if (exists) return prev.map(c => c.vendorProductId === vp.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, {
        vendorProductId: vp.id,
        itemName: item.item_name,
        vendorName: vp.vendors?.vendor_name ?? "Unknown Vendor",
        price: vp.price,
        qty: 1,
        image: primaryImage,
      }];
    });
    setCartOpen(true);
  }, []);

  const removeFromCart = useCallback((vendorProductId: number) => {
    setCart(prev => prev.filter(c => c.vendorProductId !== vendorProductId));
  }, []);

  // ============================================
  // ORDER SUCCESS
  // ============================================
  if (orderPlaced) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ background: "white", borderRadius: 24, padding: 40, textAlign: "center", maxWidth: 380, width: "100%" }}>
        <div style={{ fontSize: 72 }}>🎉</div>
        <h2 style={{ fontWeight: 900, color: "#1e1b4b", marginBottom: 8 }}>Order Placed!</h2>
        <p style={{ color: "#6b7280", marginBottom: 20 }}>Your school supplies are on the way!</p>
        <div style={{ background: "#f0fdf4", borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <p style={{ color: "#16a34a", fontWeight: 700, margin: 0 }}>✅ ₹{total.toLocaleString()} Paid via Razorpay</p>
        </div>
        <button onClick={() => { setOrderPlaced(false); setCart([]); setScreen("home"); setError(null); }}
          style={{ width: "100%", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", border: "none", padding: 14, borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          Back to Home
        </button>
      </div>
    </div>
  );

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#f8fafc" }}>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg, #667eea, #764ba2)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 4px 20px rgba(102,126,234,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => { setScreen("home"); setSelectedSchool(null); setSelectedBranch(null); setSelectedGrade(null); setSelectedCategory(null); setSelectedItem(null); setError(null); setSupplyItems([]); setVendorProducts([]); }}>
          <div style={{ background: "white", borderRadius: 10, padding: "6px 10px", fontSize: 20 }}>🎒</div>
          <div>
            <div style={{ color: "white", fontWeight: 800, fontSize: 18 }}>KitBag</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 10 }}>School Supplies · Mumbai</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {screen !== "home" && (
            <button onClick={goBack} disabled={loading}
              style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "none", padding: "8px 14px", borderRadius: 10, cursor: loading ? "not-allowed" : "pointer", fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
              ← Back
            </button>
          )}
          <button onClick={() => setCartOpen(true)}
            style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "none", padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            🛒 {cartCount > 0 && <span style={{ background: "#ef4444", borderRadius: "50%", padding: "1px 6px", fontSize: 11 }}>{cartCount}</span>}
          </button>
        </div>
      </div>

      {/* CART DRAWER */}
      {cartOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setCartOpen(false)} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 340, background: "white", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 20px", background: "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, color: "white", fontWeight: 800 }}>🛒 Cart ({cartCount})</h3>
              <button onClick={() => setCartOpen(false)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", cursor: "pointer", borderRadius: 8, padding: "4px 10px" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <div style={{ fontSize: 48 }}>🛒</div>
                  <p style={{ color: "#9ca3af" }}>Your cart is empty</p>
                </div>
              ) : cart.map(c => (
                <div key={c.vendorProductId} style={{ background: "#f8fafc", borderRadius: 12, padding: 14, marginBottom: 10, border: "1px solid #e2e8f0" }}>
                  {c.image && (
                    <img src={c.image} alt={c.itemName}
                      style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8, marginBottom: 8 }}
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  )}
                  <p style={{ margin: "0 0 2px", fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{c.itemName}</p>
                  <p style={{ margin: "0 0 6px", color: "#64748b", fontSize: 12 }}>{c.vendorName}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ margin: 0, fontWeight: 800, color: "#667eea" }}>₹{c.price} × {c.qty} = ₹{c.price * c.qty}</p>
                    <button onClick={() => removeFromCart(c.vendorProductId)}
                      style={{ background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div style={{ padding: 16, borderTop: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, padding: "10px 14px", background: "#f0f9ff", borderRadius: 10 }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: "#667eea" }}>₹{total.toLocaleString()}</span>
                </div>
                <button onClick={() => { setCartOpen(false); setOrderPlaced(true); }}
                  style={{ width: "100%", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", border: "none", padding: 14, borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
                  Pay ₹{total.toLocaleString()} via Razorpay
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px 80px" }}>

        {/* GLOBAL ERROR */}
        {error && <ErrorCard error={error} />}

        {/* HOME */}
        {screen === "home" && (
          <>
            <div style={{ textAlign: "center", padding: "24px 0 20px" }}>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#1e1b4b", margin: "0 0 8px" }}>Find Your School 🏫</h1>
              <p style={{ color: "#6b7280", margin: 0 }}>All Mumbai school supplies in one place</p>
            </div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search school name..."
                disabled={loading}
                style={{ width: "100%", padding: "14px 14px 14px 42px", borderRadius: 14, border: "2px solid #e2e8f0", fontSize: 15, outline: "none", boxSizing: "border-box", background: "white", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {["All", "CBSE", "ICSE", "SSC", "IB"].map(b => (
                <button key={b} onClick={() => setBoardFilter(b)}
                  style={{ padding: "7px 14px", borderRadius: 20, border: "2px solid", borderColor: boardFilter === b ? (boardColors[b] || "#667eea") : "#e2e8f0", background: boardFilter === b ? (boardColors[b] || "#667eea") : "white", color: boardFilter === b ? "white" : "#374151", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                  {b}
                </button>
              ))}
            </div>
            {loading ? <SkeletonList count={6} /> :
              filteredSchools.length === 0 ? (
                <EmptyState icon="🏫"
                  title={debouncedSearch ? `No schools found for "${debouncedSearch}"` : "No schools available"}
                  subtitle="Try a different search or board filter" />
              ) : filteredSchools.map(school => (
                <div key={school.id} onClick={() => handleSchoolSelect(school)}
                  style={{ background: "white", borderRadius: 14, padding: 18, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", border: "2px solid #f1f5f9", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: `${boardColors[school.board] ?? "#667eea"}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
                      {school.logo_url
                        ? <img src={school.logo_url} alt={school.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        : "🏫"}
                    </div>
                    <div>
                      <p style={{ margin: "0 0 4px", fontWeight: 800, fontSize: 15, color: "#1e293b" }}>{school.name}</p>
                      <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>{school.board} Board</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <span style={{ background: boardColors[school.board] ?? "#667eea", color: "white", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{school.board}</span>
                    <span style={{ color: "#667eea", fontSize: 13, fontWeight: 600 }}>View →</span>
                  </div>
                </div>
              ))
            }
          </>
        )}

        {/* BRANCHES */}
        {screen === "branches" && selectedSchool && (
          <>
            <div style={{ background: "white", borderRadius: 14, padding: 18, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 900, color: "#1e1b4b" }}>{selectedSchool.name}</h2>
              <p style={{ margin: 0, color: "#64748b" }}>Select your child's branch</p>
            </div>
            {loading ? <SkeletonList count={3} /> :
              branches.length === 0 ? <EmptyState icon="📍" title="No branches found" subtitle="This school has no active branches listed" /> :
              branches.map(branch => (
                <div key={branch.id} onClick={() => handleBranchSelect(branch)}
                  style={{ background: "white", borderRadius: 14, padding: 18, marginBottom: 10, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", border: "2px solid #f1f5f9" }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 800, fontSize: 16, color: "#1e293b" }}>📍 {branch.area}</p>
                  <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: 13 }}>{branch.address}</p>
                  <p style={{ margin: 0, color: "#667eea", fontSize: 13, fontWeight: 600 }}>Pincode: {branch.pincode}</p>
                </div>
              ))
            }
          </>
        )}

        {/* GRADE */}
        {screen === "grade" && selectedSchool && selectedBranch && (
          <>
            <div style={{ background: "white", borderRadius: 14, padding: 18, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: "#1e1b4b" }}>{selectedSchool.name}</h2>
              <p style={{ margin: 0, color: "#64748b" }}>📍 {selectedBranch.area} · Select your child's grade</p>
            </div>
            {grades.length === 0 ? <SkeletonList count={5} /> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {grades.map(g => (
                  <button key={g.id} onClick={() => handleGradeSelect(g)} disabled={loading}
                    style={{ background: "white", color: "#1e293b", border: "2px solid #e2e8f0", borderRadius: 12, padding: "16px 8px", cursor: loading ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", opacity: loading ? 0.6 : 1 }}>
                    {g.grade_name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* CATEGORIES */}
        {screen === "categories" && selectedSchool && selectedBranch && selectedGrade && (
          <>
            <div style={{ background: "linear-gradient(135deg, #667eea11, #764ba211)", borderRadius: 14, padding: 14, marginBottom: 20, border: "1px solid #667eea22" }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#1e1b4b" }}>🏫 {selectedSchool.name} · {selectedBranch.area}</p>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{selectedGrade.grade_name} · Select a category</p>
            </div>
            {loading ? <SkeletonList count={4} /> :
              supplyItems.length === 0 ? <EmptyState icon="📋" title="Supply list not published yet" subtitle="The school hasn't uploaded this grade's list yet." /> :
              visibleCategories.length === 0 ? <EmptyState icon="📂" title="No categories found" /> :
              visibleCategories.map(cat => {
                const catItems = supplyItems.filter(i => i.category_id === cat.id);
                return (
                  <div key={cat.id} onClick={() => handleCategorySelect(cat)}
                    style={{ background: "white", borderRadius: 14, padding: 18, marginBottom: 10, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 12, background: "#667eea22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{cat.icon}</div>
                      <div>
                        <p style={{ margin: "0 0 4px", fontWeight: 800, fontSize: 15, color: "#1e293b" }}>{cat.name}</p>
                        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>{catItems.length} item{catItems.length !== 1 ? "s" : ""} required</p>
                      </div>
                    </div>
                    <span style={{ color: "#667eea", fontWeight: 700, fontSize: 20 }}>›</span>
                  </div>
                );
              })
            }
          </>
        )}

        {/* ITEMS */}
        {screen === "items" && selectedCategory && selectedGrade && selectedBranch && (
          <>
            <div style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: "#1e1b4b" }}>{selectedCategory.icon} {selectedCategory.name}</h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>{selectedGrade.grade_name} · {selectedBranch.area}</p>
            </div>
            {itemsByCategory.length === 0
              ? <EmptyState icon="📦" title="No items in this category" />
              : itemsByCategory.map(item => (
                <div key={item.id} onClick={() => handleItemSelect(item)}
                  style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 10, cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: loading ? 0.7 : 1 }}>
                  <div>
                    <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1e293b" }}>{item.item_name}</p>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Qty: {item.quantity_required} {item.unit ?? ""}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ background: item.mandatory ? "#fef3c7" : "#f0fdf4", color: item.mandatory ? "#d97706" : "#16a34a", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                      {item.mandatory ? "Required" : "Optional"}
                    </span>
                    <span style={{ color: "#667eea", fontWeight: 700, fontSize: 18 }}>›</span>
                  </div>
                </div>
              ))
            }
          </>
        )}

        {/* VENDORS */}
        {screen === "vendors" && selectedItem && (
          <>
            <div style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: "#1e1b4b" }}>{selectedItem.item_name}</h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Qty needed: {selectedItem.quantity_required} {selectedItem.unit ?? ""}</p>
            </div>
            {loading ? <SkeletonList count={3} /> :
              vendorProducts.length === 0 ? (
                <EmptyState icon="🏪" title="No vendors available yet" subtitle="We're onboarding vendors in your area. Check back soon!" />
              ) : vendorProducts.map(vp => {
                const vendor = vp.vendors;
                const primaryImage = vp.product_images?.find(i => i.is_primary)?.image_url ?? vp.product_images?.[0]?.image_url;
                const discount = (vp.mrp && vp.mrp > vp.price) ? Math.round((vp.mrp - vp.price) / vp.mrp * 100) : 0;
                return (
                  <div key={vp.id} style={{ background: "white", borderRadius: 16, marginBottom: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden", border: "2px solid #f1f5f9" }}>
                    {primaryImage && (
                      <img src={primaryImage} alt={vp.product_name}
                        style={{ width: "100%", height: 160, objectFit: "cover" }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    )}
                    <div style={{ padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: "0 0 2px", fontWeight: 800, fontSize: 16, color: "#1e293b" }}>{vendor?.vendor_name ?? "Unknown Vendor"}</p>
                          <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: 13 }}>
                            📍 {vendor?.area ?? "—"} · ⭐ {vendor?.rating ?? "New"} · 🚚 {vendor?.avg_delivery_time ?? 30} mins
                          </p>
                          <p style={{ margin: 0, color: "#475569", fontSize: 13 }}>{vp.product_name}</p>
                        </div>
                        {vendor?.logo_url && (
                          <img src={vendor.logo_url} alt={vendor.vendor_name}
                            style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0, marginLeft: 10 }}
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                        <span style={{ fontSize: 22, fontWeight: 900, color: "#667eea" }}>₹{vp.price}</span>
                        {vp.mrp && vp.mrp > vp.price && <span style={{ fontSize: 13, color: "#94a3b8", textDecoration: "line-through" }}>₹{vp.mrp}</span>}
                        {discount > 0 && <span style={{ background: "#dcfce7", color: "#16a34a", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{discount}% OFF</span>}
                      </div>
                      <button onClick={() => addToCart(vp, selectedItem)} disabled={loading}
                        style={{ width: "100%", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", border: "none", padding: 14, borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
                        + Add to Cart
                      </button>
                    </div>
                  </div>
                );
              })
            }
          </>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #e2e8f0", display: "flex", padding: "10px 0", boxShadow: "0 -4px 20px rgba(0,0,0,0.08)", zIndex: 90 }}>
        {([["🏠", "Home"], ["🔍", "Search"], ["📦", "Orders"], ["👤", "Profile"]] as [string, string][]).map(([icon, label], i) => (
          <button key={label}
            onClick={() => { if (i === 0) { setScreen("home"); setSelectedSchool(null); setError(null); } }}
            style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: i === 0 && screen === "home" ? "#667eea" : "#94a3b8" }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}