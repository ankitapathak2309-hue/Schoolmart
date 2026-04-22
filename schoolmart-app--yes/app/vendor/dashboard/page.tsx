"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function VendorDashboard() {
  const [vendor, setVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, outOfStock: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const vendorId = localStorage.getItem("vendor_id");
    const vendorName = localStorage.getItem("vendor_name");
    if (!vendorId) { window.location.href = "/vendor/login"; return; }
    setVendor({ id: vendorId, name: vendorName });
    loadProducts(vendorId);
  }, []);

  const loadProducts = async (vendorId) => {
    try {
      const { data, error } = await supabase
        .from("vendor_products")
        .select("id, product_name, price, mrp, stock_quantity, unit, is_active, created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      const prods = data || [];
      setProducts(prods);
      setStats({
        total: prods.length,
        active: prods.filter(p => p.is_active && p.stock_quantity > 0).length,
        outOfStock: prods.filter(p => p.stock_quantity === 0).length,
      });
    } catch (err) {
      console.error("[loadProducts]", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleProduct = async (productId, currentStatus) => {
    const { error } = await supabase
      .from("vendor_products")
      .update({ is_active: !currentStatus })
      .eq("id", productId);
    if (!error) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, is_active: !currentStatus } : p));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("vendor_id");
    localStorage.removeItem("vendor_name");
    localStorage.removeItem("vendor_phone");
    window.location.href = "/vendor/login";
  };

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>⏳</div>
        <p style={{color:"#64748b"}}>Loading dashboard...</p>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"system-ui",minHeight:"100vh",background:"#f8fafc"}}>

      {/* HEADER */}
      <div style={{background:"linear-gradient(135deg,#667eea,#764ba2)",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 4px 20px rgba(102,126,234,0.4)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{background:"white",borderRadius:10,padding:"6px 10px",fontSize:20}}>🛒</div>
          <div>
            <div style={{color:"white",fontWeight:800,fontSize:18}}>mySchoolKart</div>
            <div style={{color:"rgba(255,255,255,0.75)",fontSize:11}}>Vendor Dashboard</div>
          </div>
        </div>
        <button onClick={handleLogout}
          style={{background:"rgba(255,255,255,0.2)",color:"white",border:"none",padding:"8px 16px",borderRadius:10,cursor:"pointer",fontWeight:600,fontSize:13}}>
          Logout
        </button>
      </div>

      <div style={{maxWidth:700,margin:"0 auto",padding:"24px 16px 80px"}}>

        {/* WELCOME */}
        <div style={{background:"white",borderRadius:16,padding:20,marginBottom:20,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"}}>
          <h2 style={{margin:"0 0 4px",fontSize:20,fontWeight:900,color:"#1e1b4b"}}>
            Welcome back! 👋
          </h2>
          <p style={{margin:0,color:"#64748b",fontSize:14}}>{vendor?.name}</p>
        </div>

        {/* STATS */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
          {[
            { icon:"📦", label:"Total Products", value: stats.total, color:"#667eea" },
            { icon:"✅", label:"Active", value: stats.active, color:"#16a34a" },
            { icon:"❌", label:"Out of Stock", value: stats.outOfStock, color:"#dc2626" },
          ].map(s => (
            <div key={s.label} style={{background:"white",borderRadius:14,padding:16,textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:28,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:24,fontWeight:900,color:s.color}}>{s.value}</div>
              <div style={{fontSize:11,color:"#94a3b8",fontWeight:600}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* QUICK ACTIONS */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
          <a href="/vendor/products"
            style={{background:"linear-gradient(135deg,#667eea,#764ba2)",color:"white",borderRadius:14,padding:20,textDecoration:"none",display:"block",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:8}}>➕</div>
            <div style={{fontWeight:800,fontSize:16}}>Add Product</div>
            <div style={{fontSize:12,opacity:0.8,marginTop:4}}>List new items</div>
          </a>
          <a href="/vendor/register"
            style={{background:"white",color:"#667eea",borderRadius:14,padding:20,textDecoration:"none",display:"block",textAlign:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.08)",border:"2px solid #667eea22"}}>
            <div style={{fontSize:32,marginBottom:8}}>✏️</div>
            <div style={{fontWeight:800,fontSize:16}}>Edit Profile</div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Update shop info</div>
          </a>
        </div>

        {/* PRODUCTS LIST */}
        <div style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h3 style={{margin:0,fontWeight:800,color:"#1e1b4b",fontSize:18}}>
              Your Products
              <span style={{marginLeft:8,background:"#667eea",color:"white",padding:"2px 10px",borderRadius:20,fontSize:12}}>{products.length}</span>
            </h3>
            <a href="/vendor/products" style={{color:"#667eea",fontWeight:700,fontSize:13,textDecoration:"none"}}>+ Add New</a>
          </div>

          {products.length === 0 ? (
            <div style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:12}}>📦</div>
              <p style={{color:"#64748b",fontWeight:600}}>No products yet</p>
              <p style={{color:"#94a3b8",fontSize:13}}>Add your first product to start selling</p>
              <a href="/vendor/products"
                style={{display:"inline-block",marginTop:16,background:"linear-gradient(135deg,#667eea,#764ba2)",color:"white",padding:"12px 24px",borderRadius:10,fontWeight:700,textDecoration:"none"}}>
                Add First Product
              </a>
            </div>
          ) : products.map((p, i) => (
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderTop:i>0?"1px solid #f1f5f9":"none"}}>
              <div style={{flex:1}}>
                <p style={{margin:"0 0 4px",fontWeight:700,color:"#1e293b",fontSize:14}}>{p.product_name}</p>
                <p style={{margin:0,color:"#64748b",fontSize:12}}>
                  ₹{p.price} · Stock: {p.stock_quantity} {p.unit}
                  {p.stock_quantity === 0 && <span style={{color:"#dc2626",fontWeight:700,marginLeft:6}}>· Out of stock</span>}
                </p>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{background:p.is_active?"#f0fdf4":"#fef2f2",color:p.is_active?"#16a34a":"#dc2626",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700}}>
                  {p.is_active ? "Active" : "Hidden"}
                </span>
                <button onClick={() => toggleProduct(p.id, p.is_active)}
                  style={{background:"#f1f5f9",color:"#64748b",border:"none",padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600}}>
                  {p.is_active ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}