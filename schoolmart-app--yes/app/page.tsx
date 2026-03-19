"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

type School = { id: number; name: string; board: string; logo_url?: string };
type Branch = { id: number; school_id: number; area: string; pincode: string; address: string };
type Grade = { id: number; grade_name: string; display_order: number };
type Category = { id: number; name: string; icon: string };
type SupplyItem = { id: number; item_name: string; quantity_required: number; unit: string; mandatory: boolean; category_id: number };
type Vendor = { id: number; vendor_name: string; rating: number; area: string; avg_delivery_time: number; logo_url?: string; banner_url?: string };
type VendorProduct = { id: number; vendor_id: number; product_name: string; price: number; mrp: number; stock_quantity: number; vendor?: Vendor; images?: {image_url: string}[] };
type CartItem = { productId: number; vendorProductId: number; itemName: string; vendorName: string; price: number; qty: number; image?: string };

const boardColors: Record<string, string> = { CBSE: "#3b82f6", ICSE: "#8b5cf6", SSC: "#10b981", IB: "#f59e0b" };

export default function SchoolMart() {
  const [screen, setScreen] = useState("home");
  const [search, setSearch] = useState("");
  const [boardFilter, setBoardFilter] = useState("All");
  const [schools, setSchools] = useState<School[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplyItems, setSupplyItems] = useState<SupplyItem[]>([]);
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedItem, setSelectedItem] = useState<SupplyItem | null>(null);
  const [selectedVendorProduct, setSelectedVendorProduct] = useState<VendorProduct | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load schools on start
  useEffect(() => { loadSchools(); }, []);

  const loadSchools = async () => {
    setLoading(true);
    const { data } = await supabase.from("schools").select("*").eq("is_active", true).order("name");
    if (data) setSchools(data);
    setLoading(false);
  };

  const loadBranches = async (schoolId: number) => {
    setLoading(true);
    const { data } = await supabase.from("branches").select("*").eq("school_id", schoolId).eq("is_active", true);
    if (data) setBranches(data);
    setLoading(false);
  };

  const loadGrades = async () => {
    const { data } = await supabase.from("grades").select("*").order("display_order");
    if (data) setGrades(data);
  };

  const loadCategories = async () => {
    const { data } = await supabase.from("categories").select("*").order("display_order");
    if (data) setCategories(data);
  };

  const loadSupplyItems = async (branchId: number, gradeId: number) => {
    setLoading(true);
    // Get supply list for this branch + grade
    const { data: supplyList } = await supabase
      .from("supply_lists")
      .select("id")
      .eq("branch_id", branchId)
      .eq("grade_id", gradeId)
      .eq("is_published", true)
      .single();

    if (supplyList) {
      const { data: items } = await supabase
        .from("supply_items")
        .select("*, categories(name, icon)")
        .eq("supply_list_id", supplyList.id);
      if (items) setSupplyItems(items);
    } else {
      setSupplyItems([]);
    }
    setLoading(false);
  };

  const loadVendorProducts = async (supplyItemId: number, pincode: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("vendor_products")
      .select(`
        *,
        vendors!inner(id, vendor_name, rating, area, avg_delivery_time, logo_url, banner_url),
        product_images(image_url, is_primary)
      `)
      .eq("supply_item_id", supplyItemId)
      .eq("is_active", true)
      .gt("stock_quantity", 0);
    if (data) setVendorProducts(data);
    setLoading(false);
  };

  const addToCart = (vp: VendorProduct, item: SupplyItem) => {
    setCart(prev => {
      const exists = prev.find(c => c.vendorProductId === vp.id);
      if (exists) return prev.map(c => c.vendorProductId === vp.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, {
        productId: item.id,
        vendorProductId: vp.id,
        itemName: item.item_name,
        vendorName: (vp as any).vendors?.vendor_name || "Vendor",
        price: vp.price,
        qty: 1,
        image: (vp as any).product_images?.[0]?.image_url
      }];
    });
    setCartOpen(true);
  };

  const total = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  const filteredSchools = schools.filter(s =>
    (s.name.toLowerCase().includes(search.toLowerCase())) &&
    (boardFilter === "All" || s.board === boardFilter)
  );

  const itemsByCategory = selectedCategory
    ? supplyItems.filter(i => i.category_id === selectedCategory.id)
    : [];

  if (orderPlaced) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ background: "white", borderRadius: 24, padding: 40, textAlign: "center", maxWidth: 380, width: "100%" }}>
        <div style={{ fontSize: 72 }}>🎉</div>
        <h2 style={{ fontWeight: 900, color: "#1e1b4b" }}>Order Placed!</h2>
        <p style={{ color: "#6b7280" }}>Your school supplies are on the way!</p>
        <div style={{ background: "#f0fdf4", borderRadius: 12, padding: 16, margin: "16px 0" }}>
          <p style={{ color: "#16a34a", fontWeight: 700, margin: 0 }}>✅ ₹{total.toLocaleString()} Paid via Razorpay</p>
        </div>
        <button onClick={() => { setOrderPlaced(false); setCart([]); setScreen("home"); }}
          style={{ width: "100%", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", border: "none", padding: 14, borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          Back to Home
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#f8fafc" }}>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg, #667eea, #764ba2)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 4px 20px rgba(102,126,234,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => { setScreen("home"); setSelectedSchool(null); setSelectedBranch(null); setSelectedGrade(null); setSelectedCategory(null); }}>
          <div style={{ background: "white", borderRadius: 10, padding: "6px 10px", fontSize: 20 }}>🎒</div>
          <div>
            <div style={{ color: "white", fontWeight: 800, fontSize: 18 }}>KitBag</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 10 }}>School Supplies · Mumbai</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {screen !== "home" && (
            <button onClick={() => {
              if (screen === "vendor-detail") setScreen("vendors");
              else if (screen === "vendors") { setScreen("items"); setSelectedItem(null); }
              else if (screen === "items") { setScreen("categories"); setSelectedCategory(null); }
              else if (screen === "categories") { setScreen("grade"); setSelectedGrade(null); }
              else if (screen === "grade") { setScreen("branches"); setSelectedBranch(null); }
              else if (screen === "branches") { setScreen("home"); setSelectedSchool(null); }
            }} style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "none", padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 600 }}>← Back</button>
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
                  <p style={{ color: "#9ca3af" }}>Cart is empty</p>
                </div>
              ) : cart.map((c, i) => (
                <div key={i} style={{ background: "#f8fafc", borderRadius: 12, padding: 14, marginBottom: 10, border: "1px solid #e2e8f0" }}>
                  {c.image && <img src={c.image} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />}
                  <p style={{ margin: "0 0 2px", fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{c.itemName}</p>
                  <p style={{ margin: "0 0 6px", color: "#64748b", fontSize: 12 }}>{c.vendorName}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ margin: 0, fontWeight: 800, color: "#667eea" }}>₹{c.price} × {c.qty} = ₹{c.price * c.qty}</p>
                    <button onClick={() => setCart(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>Remove</button>
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

        {/* HOME — School Search */}
        {screen === "home" && (
          <>
            <div style={{ textAlign: "center", padding: "24px 0 20px" }}>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#1e1b4b", margin: "0 0 8px" }}>Find Your School 🏫</h1>
              <p style={{ color: "#6b7280", margin: 0 }}>All Mumbai school supplies in one place</p>
            </div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search school name..."
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
            {loading ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 40 }}>⏳</div>
                <p style={{ color: "#64748b" }}>Loading schools...</p>
              </div>
            ) : filteredSchools.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 40 }}>🏫</div>
                <p style={{ color: "#64748b" }}>No schools found</p>
              </div>
            ) : filteredSchools.map(school => (
              <div key={school.id} onClick={() => { setSelectedSchool(school); loadBranches(school.id); loadGrades(); setScreen("branches"); }}
                style={{ background: "white", borderRadius: 14, padding: 18, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", border: "2px solid #f1f5f9", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: `${boardColors[school.board] || "#667eea"}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                    {school.logo_url ? <img src={school.logo_url} style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} /> : "🏫"}
                  </div>
                  <div>
                    <p style={{ margin: "0 0 4px", fontWeight: 800, fontSize: 15, color: "#1e293b" }}>{school.name}</p>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>{school.board} Board</p>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span style={{ background: boardColors[school.board] || "#667eea", color: "white", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{school.board}</span>
                  <span style={{ color: "#667eea", fontSize: 13, fontWeight: 600 }}>View →</span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* BRANCHES */}
        {screen === "branches" && selectedSchool && (
          <>
            <div style={{ background: "white", borderRadius: 14, padding: 18, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 900, color: "#1e1b4b" }}>{selectedSchool.name}</h2>
              <p style={{ margin: 0, color: "#64748b" }}>Select your child's branch</p>
            </div>
            {branches.map(branch => (
              <div key={branch.id} onClick={() => { setSelectedBranch(branch); setScreen("grade"); }}
                style={{ background: "white", borderRadius: 14, padding: 18, marginBottom: 10, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", border: "2px solid #f1f5f9" }}>
                <p style={{ margin: "0 0 4px", fontWeight: 800, fontSize: 16, color: "#1e293b" }}>📍 {branch.area}</p>
                <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: 13 }}>{branch.address}</p>
                <p style={{ margin: 0, color: "#667eea", fontSize: 13, fontWeight: 600 }}>Pincode: {branch.pincode}</p>
              </div>
            ))}
          </>
        )}

        {/* GRADE SELECTION */}
        {screen === "grade" && (
          <>
            <div style={{ background: "white", borderRadius: 14, padding: 18, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: "#1e1b4b" }}>{selectedSchool?.name}</h2>
              <p style={{ margin: 0, color: "#64748b" }}>📍 {selectedBranch?.area} · Select grade</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {grades.map(g => (
                <button key={g.id} onClick={() => { setSelectedGrade(g); loadSupplyItems(selectedBranch!.id, g.id); loadCategories(); setScreen("categories"); }}
                  style={{ background: "white", color: "#1e293b", border: "2px solid #e2e8f0", borderRadius: 12, padding: "16px 8px", cursor: "pointer", fontWeight: 800, fontSize: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  {g.grade_name}
                </button>
              ))}
            </div>
          </>
        )}

        {/* CATEGORIES */}
        {screen === "categories" && (
          <>
            <div style={{ background: "linear-gradient(135deg, #667eea11, #764ba211)", borderRadius: 14, padding: 14, marginBottom: 20, border: "1px solid #667eea22" }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#1e1b4b" }}>🏫 {selectedSchool?.name} · {selectedBranch?.area}</p>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{selectedGrade?.grade_name} · Select a category</p>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40 }}><p style={{ color: "#64748b" }}>⏳ Loading...</p></div>
            ) : supplyItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, background: "white", borderRadius: 14 }}>
                <div style={{ fontSize: 48 }}>📋</div>
                <p style={{ color: "#64748b", fontWeight: 600 }}>Supply list not published yet</p>
                <p style={{ color: "#94a3b8", fontSize: 13 }}>Check back soon!</p>
              </div>
            ) : categories.filter(c => supplyItems.some(i => i.category_id === c.id)).map(cat => {
              const catItems = supplyItems.filter(i => i.category_id === cat.id);
              return (
                <div key={cat.id} onClick={() => { setSelectedCategory(cat); setScreen("items"); }}
                  style={{ background: "white", borderRadius: 14, padding: 18, marginBottom: 10, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: "#667eea22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{cat.icon}</div>
                    <div>
                      <p style={{ margin: "0 0 4px", fontWeight: 800, fontSize: 15, color: "#1e293b" }}>{cat.name}</p>
                      <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>{catItems.length} items required</p>
                    </div>
                  </div>
                  <span style={{ color: "#667eea", fontWeight: 700, fontSize: 20 }}>›</span>
                </div>
              );
            })}
          </>
        )}

        {/* ITEMS LIST */}
        {screen === "items" && selectedCategory && (
          <>
            <div style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: "#1e1b4b" }}>{selectedCategory.icon} {selectedCategory.name}</h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>{selectedGrade?.grade_name} · {selectedBranch?.area}</p>
            </div>
            {itemsByCategory.map(item => (
              <div key={item.id} onClick={() => { setSelectedItem(item); loadVendorProducts(item.id, selectedBranch?.pincode || ""); setScreen("vendors"); }}
                style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 10, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1e293b" }}>{item.item_name}</p>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Qty: {item.quantity_required} {item.unit}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: item.mandatory ? "#fef3c7" : "#f0fdf4", color: item.mandatory ? "#d97706" : "#16a34a", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                    {item.mandatory ? "Required" : "Optional"}
                  </span>
                  <span style={{ color: "#667eea", fontWeight: 700, fontSize: 18 }}>›</span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* VENDORS — Zomato style */}
        {screen === "vendors" && selectedItem && (
          <>
            <div style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 900, color: "#1e1b4b" }}>{selectedItem.item_name}</h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Qty needed: {selectedItem.quantity_required} {selectedItem.unit}</p>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40 }}><p>⏳ Finding vendors near you...</p></div>
            ) : vendorProducts.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, background: "white", borderRadius: 14 }}>
                <div style={{ fontSize: 48 }}>🏪</div>
                <p style={{ color: "#64748b", fontWeight: 600 }}>No vendors available yet</p>
                <p style={{ color: "#94a3b8", fontSize: 13 }}>We're onboarding vendors in your area</p>
              </div>
            ) : vendorProducts.map(vp => {
              const vendor = (vp as any).vendors;
              const images = (vp as any).product_images || [];
              const primaryImage = images.find((i: any) => i.is_primary)?.image_url || images[0]?.image_url;
              const discount = vp.mrp ? Math.round((vp.mrp - vp.price) / vp.mrp * 100) : 0;
              return (
                <div key={vp.id} style={{ background: "white", borderRadius: 16, marginBottom: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden", border: "2px solid #f1f5f9" }}>
                  {primaryImage && (
                    <img src={primaryImage} style={{ width: "100%", height: 160, objectFit: "cover" }} />
                  )}
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <p style={{ margin: "0 0 2px", fontWeight: 800, fontSize: 16, color: "#1e293b" }}>{vendor?.vendor_name}</p>
                        <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: 13 }}>📍 {vendor?.area} · ⭐ {vendor?.rating || "New"} · 🚚 {vendor?.avg_delivery_time || 30} mins</p>
                        <p style={{ margin: 0, color: "#475569", fontSize: 13 }}>{vp.product_name}</p>
                      </div>
                      {vendor?.logo_url && <img src={vendor.logo_url} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <span style={{ fontSize: 22, fontWeight: 900, color: "#667eea" }}>₹{vp.price}</span>
                      {vp.mrp && <span style={{ fontSize: 13, color: "#94a3b8", textDecoration: "line-through" }}>₹{vp.mrp}</span>}
                      {discount > 0 && <span style={{ background: "#dcfce7", color: "#16a34a", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{discount}% OFF</span>}
                    </div>
                    <button onClick={() => addToCart(vp, selectedItem)}
                      style={{ width: "100%", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", border: "none", padding: 14, borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                      + Add to Cart
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #e2e8f0", display: "flex", padding: "10px 0", boxShadow: "0 -4px 20px rgba(0,0,0,0.08)", zIndex: 90 }}>
        {[["🏠", "Home"], ["🔍", "Search"], ["📦", "Orders"], ["👤", "Profile"]].map(([icon, label], i) => (
          <button key={label} onClick={() => i === 0 ? (setScreen("home"), setSelectedSchool(null)) : null}
            style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: i === 0 && screen === "home" ? "#667eea" : "#94a3b8" }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
