"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function AddProduct() {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [filteredSubs, setFilteredSubs] = useState([]);
  const [schools, setSchools] = useState([]);
  const [grades, setGrades] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [vendorId, setVendorId] = useState(null);

  const [form, setForm] = useState({
    category_id: "", subcategory_id: "",
    product_name: "", description: "",
    price: "", mrp: "", stock_quantity: "1",
    unit: "pieces", school_id: "", grade_id: "",
  });

  useEffect(() => {
    // FIX 1 — Read vendor_id from localStorage
    const storedVendorId = localStorage.getItem("vendor_id");
      setError("Vendor not authenticated. Please login first.");
    } else {
      setVendorId(Number(storedVendorId));
    }
    loadData();
  }, []);

  useEffect(() => {
    if (form.category_id) {
      setFilteredSubs(subcategories.filter(s => s.category_id === Number(form.category_id)));
      setForm(p => ({ ...p, subcategory_id: "" }));
    } else {
      setFilteredSubs([]);
    }
  }, [form.category_id, subcategories]);

  const loadData = async () => {
    try {
      const [
        { data: cats, error: e1 },
        { data: subs, error: e2 },
        { data: schs, error: e3 },
        { data: grs, error: e4 },
        { data: prods, error: e5 },
      ] = await Promise.all([
        supabase.from("categories").select("id, name, icon").order("display_order"),
        supabase.from("subcategories").select("id, category_id, name, icon").order("display_order"),
        supabase.from("schools").select("id, name").eq("is_active", true).order("name"),
        supabase.from("grades").select("id, grade_name").order("display_order"),
        supabase.from("vendor_products").select("id, product_name, price, mrp, stock_quantity, unit").order("id", { ascending: false }).limit(20),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      setCategories(cats || []);
      setSubcategories(subs || []);
      setSchools(schs || []);
      setGrades(grs || []);
      setProducts(prods || []);
    } catch (err) {
      console.error("[loadData]", err);
      setError("Failed to load data. Please refresh.");
    }
  };

  const validate = () => {
    setError("");

    // FIX 3 — Safety checks before insert
      setError("Vendor not authenticated. Please login first.");
      return false;
    }
      setError("Please select a category");
      return false;
    }
      setError("Please select a subcategory");
      return false;
    }
      setError("Product name is required");
      return false;
    }
      setError("Valid price is required");
      return false;
    }
      setError("Valid stock quantity required");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    try {
      const { error: insertError } = await supabase.from("vendor_products").insert({
        vendor_id: vendorId,                          // FIX 1 — dynamic vendor_id
        category_id: Number(form.category_id),        // FIX 2 — save category_id
        subcategory_id: Number(form.subcategory_id),
        product_name: form.product_name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        mrp: form.mrp ? Number(form.mrp) : null,
        stock_quantity: Number(form.stock_quantity),
        school_id: form.school_id ? Number(form.school_id) : null,
        grade_id: form.grade_id ? Number(form.grade_id) : null,
        unit: form.unit,
        is_active: true,
      });
      if (insertError) throw new Error(insertError.message);
      setSaved(true);
      setForm(p => ({
        ...p,
        product_name: "", description: "",
        price: "", mrp: "", stock_quantity: "1",
        subcategory_id: "", school_id: "", grade_id: "",
      }));
      await loadData();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("[handleSubmit]", err);
      setError(err.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  const inp = { width:"100%", padding:"11px 14px", borderRadius:10, border:"2px solid #e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" };
  const sel = { ...inp, background:"white" };
  const lbl = { display:"block", fontSize:13, fontWeight:700, color:"#374151", marginBottom:6 };

  return (
    <div style={{fontFamily:"system-ui",minHeight:"100vh",background:"#f8fafc"}}>
      <div style={{background:"linear-gradient(135deg,#667eea,#764ba2)",padding:"16px 24px",boxShadow:"0 4px 20px rgba(102,126,234,0.4)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,maxWidth:700,margin:"0 auto"}}>
          <div style={{background:"white",borderRadius:10,padding:"6px 10px",fontSize:20}}>🛒</div>
          <div>
            <div style={{color:"white",fontWeight:800,fontSize:18}}>Add Product</div>
            <div style={{color:"rgba(255,255,255,0.75)",fontSize:11}}>mySchoolKart Vendor Panel</div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:700,margin:"0 auto",padding:"24px 16px 80px"}}>

        {saved && (
          <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:12,marginBottom:16,color:"#16a34a",fontWeight:700,textAlign:"center"}}>
            ✅ Product added successfully!
          </div>
        )}

        {error && (
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:12,marginBottom:16,color:"#dc2626",fontWeight:600,textAlign:"center"}}>
            {error}
          </div>
        )}

          <div style={{background:"#fef9ec",border:"1px solid #fde68a",borderRadius:10,padding:16,marginBottom:16,textAlign:"center"}}>
            <p style={{color:"#92400e",fontWeight:700,margin:"0 0 8px"}}>⚠️ Vendor not authenticated</p>
            <p style={{color:"#92400e",fontSize:13,margin:0}}>Please login to your vendor account first.</p>
          </div>
        )}

        <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,0.08)",marginBottom:24}}>
          <h2 style={{fontWeight:900,color:"#1e1b4b",marginBottom:4,fontSize:20}}>📦 Product Details</h2>
          <p style={{color:"#64748b",fontSize:14,marginBottom:20}}>Add a product to your catalogue</p>

          <div style={{marginBottom:14}}>
            <label style={lbl}>Category *</label>
            <select value={form.category_id} onChange={e=>setForm(p=>({...p,category_id:e.target.value}))} style={sel}>
              <option value="">Select category</option>
              {categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>

          <div style={{marginBottom:14}}>
            <label style={lbl}>Subcategory *</label>
            <select value={form.subcategory_id} onChange={e=>setForm(p=>({...p,subcategory_id:e.target.value}))}
              style={{...sel,opacity:form.category_id?1:0.6,background:form.category_id?"white":"#f8fafc"}}>
              <option value="">{form.category_id?"Select subcategory":"Select category first"}</option>
              {filteredSubs.map(s=><option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          </div>

          <div style={{marginBottom:14}}>
            <label style={lbl}>Product Name *</label>
            <input value={form.product_name} onChange={e=>setForm(p=>({...p,product_name:e.target.value}))}
              placeholder="e.g. Apsara HB Pencils Pack of 10" style={inp}/>
          </div>

          <div style={{marginBottom:14}}>
            <label style={lbl}>Description (optional)</label>
            <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}
              placeholder="Brief product description" rows={2}
              style={{...inp,resize:"none"}}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div>
              <label style={lbl}>Selling Price ₹ *</label>
              <input type="number" value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))} placeholder="e.g. 45" style={inp}/>
            </div>
            <div>
              <label style={lbl}>MRP ₹ (optional)</label>
              <input type="number" value={form.mrp} onChange={e=>setForm(p=>({...p,mrp:e.target.value}))} placeholder="e.g. 60" style={inp}/>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div>
              <label style={lbl}>Stock Quantity *</label>
              <input type="number" value={form.stock_quantity} onChange={e=>setForm(p=>({...p,stock_quantity:e.target.value}))} placeholder="e.g. 100" style={inp}/>
            </div>
            <div>
              <label style={lbl}>Unit</label>
              <select value={form.unit} onChange={e=>setForm(p=>({...p,unit:e.target.value}))} style={sel}>
                <option value="pieces">Pieces</option>
                <option value="pairs">Pairs</option>
                <option value="sets">Sets</option>
                <option value="boxes">Boxes</option>
                <option value="bottles">Bottles</option>
                <option value="books">Books</option>
              </select>
            </div>
          </div>

          <div style={{background:"#f8fafc",borderRadius:12,padding:16,marginBottom:16,border:"1px solid #e2e8f0"}}>
            <p style={{fontWeight:700,color:"#374151",margin:"0 0 4px",fontSize:14}}>🏫 School Specific (Optional)</p>
            <p style={{color:"#94a3b8",fontSize:12,margin:"0 0 12px"}}>Leave blank to show for ALL schools and grades</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={lbl}>School</label>
                <select value={form.school_id} onChange={e=>setForm(p=>({...p,school_id:e.target.value}))} style={{...sel,fontSize:13}}>
                  <option value="">All Schools</option>
                  {schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Grade</label>
                <select value={form.grade_id} onChange={e=>setForm(p=>({...p,grade_id:e.target.value}))} style={{...sel,fontSize:13}}>
                  <option value="">All Grades</option>
                  {grades.map(g=><option key={g.id} value={g.id}>{g.grade_name}</option>)}
                </select>
              </div>
            </div>
          </div>

            {saving?"Saving...":"✅ Add Product"}
          </button>
        </div>

        {products.length > 0 && (
          <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"}}>
            <h3 style={{fontWeight:800,color:"#1e1b4b",marginBottom:16,fontSize:18}}>
              Products Added
              <span style={{marginLeft:8,background:"#667eea",color:"white",padding:"2px 10px",borderRadius:20,fontSize:12}}>{products.length}</span>
            </h3>
            {products.map((p,i) => (
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderTop:i>0?"1px solid #f1f5f9":"none"}}>
                <div>
                  <p style={{margin:"0 0 2px",fontWeight:700,color:"#1e293b",fontSize:14}}>{p.product_name}</p>
                  <p style={{margin:0,color:"#64748b",fontSize:12}}>{p.unit} · Stock: {p.stock_quantity}</p>
                </div>
                <div style={{textAlign:"right"}}>
                  <p style={{margin:"0 0 2px",fontWeight:800,color:"#667eea",fontSize:16}}>₹{p.price}</p>
                  {p.mrp && <p style={{margin:0,color:"#94a3b8",fontSize:11,textDecoration:"line-through"}}>₹{p.mrp}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
