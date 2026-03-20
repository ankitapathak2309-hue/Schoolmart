"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const STEPS = ["Shop Details", "What You Sell", "Schools You Serve", "Review & Submit"];

export default function VendorRegister() {
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [schools, setSchools] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    business_name: "", owner_name: "", phone: "",
    email: "", address: "", area: "", pincode: "",
    selectedCategories: [], selectedSchools: [],
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [{ data: cats, error: catError }, { data: schs, error: schError }] =
        await Promise.all([
          supabase.from("categories").select("id, name, icon").order("display_order"),
          supabase.from("schools").select("id, name, board").eq("is_active", true).order("name"),
        ]);
      if (catError) throw new Error(catError.message);
      if (schError) throw new Error(schError.message);
      setCategories(cats || []);
      setSchools(schs || []);
    } catch (err) {
      console.error("[loadData]", err);
      setError("Failed to load data. Please refresh the page.");
    }
  };

  const toggle = (key, id) => setForm(p => ({
    ...p, [key]: p[key].includes(id) ? p[key].filter(x => x !== id) : [...p[key], id]
  }));

  const validate = () => {
    setError("");
    if (step === 0) {
    }
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const { data: existing, error: checkError } = await supabase
        .from("vendors").select("id").eq("phone", form.phone).maybeSingle();
      if (checkError) throw new Error(checkError.message);
      if (existing) {
        setError("A vendor with this phone number already exists.");
        setSubmitting(false);
        return;
      }

      const { data: vendor, error: ve } = await supabase
        .from("vendors")
        .insert({
          vendor_name: form.business_name.trim(),
          owner_name: form.owner_name || null,
          phone: form.phone,
          email: form.email || null,
          address: form.address || null,
          area: form.area.trim(),
          pincode: form.pincode,
          is_verified: false,
          is_active: false,
          notes: JSON.stringify({ categories: form.selectedCategories }),
        })
        .select("id")
        .single();
      if (ve) throw new Error(ve.message);

      await supabase.from("vendor_service_areas").insert({
        vendor_id: vendor.id, pincode: form.pincode,
        delivery_charge: 0, estimated_minutes: 30,
      });

      const { data: branches } = await supabase
        .from("branches").select("id")
        .in("school_id", form.selectedSchools)
        .eq("is_active", true);

      if (branches?.length) {
        const { error: approvalError } = await supabase
          .from("school_vendor_approvals")
          .insert(branches.map(b => ({
            vendor_id: vendor.id, branch_id: b.id, status: "pending"
          })));
        if (approvalError) {
          console.error("[approvals]", approvalError.message);
          await supabase.from("vendors").delete().eq("id", vendor.id);
          throw new Error("Failed to complete registration. Please try again.");
        }
      }

      setSubmitted(true);
    } catch (err) {
      console.error("[handleSubmit]", err);
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#667eea,#764ba2)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",padding:24}}>
      <div style={{background:"white",borderRadius:24,padding:40,textAlign:"center",maxWidth:400,width:"100%"}}>
        <div style={{fontSize:72}}>🎉</div>
        <p style={{color:"#6b7280",lineHeight:1.6}}>Thank you for registering with <strong>mySchoolKart</strong>. We will activate your account within 24-48 hours.</p>
        <p style={{background:"#f0fdf4",padding:12,borderRadius:10,color:"#16a34a",fontWeight:700,marginTop:16}}>✅ We will contact you on {form.phone}</p>
        <a href="/" style={{display:"block",background:"linear-gradient(135deg,#667eea,#764ba2)",color:"white",padding:14,borderRadius:12,fontWeight:800,textDecoration:"none",marginTop:16,fontSize:16}}>Back to Home</a>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"system-ui",minHeight:"100vh",background:"#f8fafc"}}>
      <div style={{background:"linear-gradient(135deg,#667eea,#764ba2)",padding:"16px 24px",boxShadow:"0 4px 20px rgba(102,126,234,0.4)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,maxWidth:600,margin:"0 auto"}}>
          <div style={{background:"white",borderRadius:10,padding:"6px 10px",fontSize:20}}>🛒</div>
          <div>
            <div style={{color:"white",fontWeight:800,fontSize:18}}>mySchoolKart</div>
            <div style={{color:"rgba(255,255,255,0.75)",fontSize:11}}>Vendor Registration</div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:600,margin:"0 auto",padding:"24px 16px 80px"}}>
        <div style={{display:"flex",gap:4,marginBottom:24}}>
          {STEPS.map((s,i) => (
            <div key={s} style={{flex:1,textAlign:"center"}}>
              <div style={{height:4,borderRadius:4,background:i<=step?"#667eea":"#e2e8f0",marginBottom:4}}/>
              <span style={{fontSize:10,color:i<=step?"#667eea":"#94a3b8",fontWeight:i===step?800:500}}>{s}</span>
            </div>
          ))}
        </div>

        {error && <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:12,marginBottom:16,color:"#dc2626",fontWeight:600,textAlign:"center",fontSize:14}}>{error}</div>}

        {step === 0 && (
          <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"}}>
            <h2 style={{fontWeight:900,color:"#1e1b4b",marginBottom:4,fontSize:20}}>🏪 Shop Details</h2>
            <p style={{color:"#64748b",fontSize:14,marginBottom:20}}>Tell us about your business</p>
            {[
              ["Shop Name *","business_name","e.g. Good Luck Stationery","text"],
              ["Owner Name","owner_name","Your full name","text"],
              ["Email","email","Optional","email"],
              ["Address","address","Shop address","text"],
              ["Area *","area","e.g. Andheri West","text"],
            ].map(([label,key,ph,type]) => (
              <div key={key} style={{marginBottom:14}}>
                <label style={{display:"block",fontSize:13,fontWeight:700,color:"#374151",marginBottom:6}}>{label}</label>
                <input type={type} value={form[key]}
                  onChange={e => setForm(p=>({...p,[key]:e.target.value}))}
                  placeholder={ph}
                  style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"2px solid #e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
              </div>
            ))}
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:13,fontWeight:700,color:"#374151",marginBottom:6}}>Phone Number *</label>
              <input type="tel" value={form.phone} maxLength={10}
                onChange={e => setForm(p=>({...p,phone:e.target.value.replace(/D/g,"")}))}
                placeholder="10-digit mobile number"
                style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"2px solid #e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:13,fontWeight:700,color:"#374151",marginBottom:6}}>Pincode *</label>
              <input type="tel" value={form.pincode} maxLength={6}
                onChange={e => setForm(p=>({...p,pincode:e.target.value.replace(/D/g,"")}))}
                placeholder="6-digit pincode"
                style={{width:"100%",padding:"11px 14px",borderRadius:10,border:"2px solid #e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"}}>
            <h2 style={{fontWeight:900,color:"#1e1b4b",marginBottom:4,fontSize:20}}>📦 What Do You Sell?</h2>
            <p style={{color:"#64748b",fontSize:14,marginBottom:20}}>Select all categories you offer</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {categories.map(cat => {
                const sel = form.selectedCategories.includes(cat.id);
                return (
                  <div key={cat.id} onClick={()=>toggle("selectedCategories",cat.id)}
                    style={{padding:16,borderRadius:12,border:"2px solid",borderColor:sel?"#667eea":"#e2e8f0",background:sel?"#667eea11":"white",cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:32,marginBottom:6}}>{cat.icon}</div>
                    <div style={{fontWeight:700,color:sel?"#667eea":"#374151",fontSize:13}}>{cat.name}</div>
                    {sel&&<div style={{color:"#667eea",fontWeight:900,marginTop:4}}>✓</div>}
                  </div>
                );
              })}
            </div>
            <p style={{color:"#94a3b8",fontSize:12,textAlign:"center",marginTop:12}}>{form.selectedCategories.length} categories selected</p>
          </div>
        )}

        {step === 2 && (
          <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"}}>
            <h2 style={{fontWeight:900,color:"#1e1b4b",marginBottom:4,fontSize:20}}>🏫 Schools You Serve?</h2>
            <p style={{color:"#64748b",fontSize:14,marginBottom:16}}>Select all schools you supply to</p>
            <div onClick={()=>setForm(p=>({...p,selectedSchools:p.selectedSchools.length===schools.length?[]:schools.map(s=>s.id)}))}
              style={{padding:"10px 16px",borderRadius:10,border:"2px solid #667eea",background:"#667eea11",cursor:"pointer",marginBottom:12,textAlign:"center",fontWeight:700,color:"#667eea"}}>
              {form.selectedSchools.length===schools.length?"✓ Deselect All":"Select All Schools"}
            </div>
            {schools.map(school => {
              const sel = form.selectedSchools.includes(school.id);
              return (
                <div key={school.id} onClick={()=>toggle("selectedSchools",school.id)}
                  style={{padding:"12px 16px",borderRadius:12,border:"2px solid",borderColor:sel?"#667eea":"#e2e8f0",background:sel?"#667eea11":"white",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div>
                    <p style={{margin:"0 0 2px",fontWeight:700,fontSize:14,color:"#1e293b"}}>{school.name}</p>
                    <span style={{background:sel?"#667eea":"#f1f5f9",color:sel?"white":"#64748b",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{school.board}</span>
                  </div>
                  <div style={{width:24,height:24,borderRadius:"50%",background:sel?"#667eea":"white",border:"2px solid",borderColor:sel?"#667eea":"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:900,flexShrink:0}}>
                    {sel?"✓":""}
                  </div>
                </div>
              );
            })}
            <p style={{color:"#94a3b8",fontSize:12,textAlign:"center",marginTop:8}}>{form.selectedSchools.length} schools selected</p>
          </div>
        )}

        {step === 3 && (
          <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"}}>
            <h2 style={{fontWeight:900,color:"#1e1b4b",marginBottom:4,fontSize:20}}>✅ Review & Submit</h2>
            <p style={{color:"#64748b",fontSize:14,marginBottom:20}}>Confirm your details before submitting</p>
            {[
              ["Shop Name",form.business_name],
              ["Owner",form.owner_name||"—"],
              ["Phone",form.phone],
              ["Email",form.email||"—"],
              ["Area",form.area+", "+form.pincode],
            ].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
                <span style={{color:"#64748b",fontSize:14}}>{l}</span>
                <span style={{fontWeight:700,color:"#1e293b",fontSize:14}}>{v}</span>
              </div>
            ))}
            <div style={{marginTop:16}}>
              <p style={{fontWeight:700,color:"#374151",marginBottom:8,fontSize:14}}>Categories:</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {form.selectedCategories.map(id=>{
                  const c=categories.find(x=>x.id===id);
                  return c?<span key={id} style={{background:"#667eea22",color:"#667eea",padding:"4px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>{c.icon} {c.name}</span>:null;
                })}
              </div>
            </div>
            <div style={{marginTop:16}}>
              <p style={{fontWeight:700,color:"#374151",marginBottom:8,fontSize:14}}>Schools ({form.selectedSchools.length}):</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {form.selectedSchools.slice(0,5).map(id=>{
                  const s=schools.find(x=>x.id===id);
                  return s?<span key={id} style={{background:"#f0fdf4",color:"#16a34a",padding:"4px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>{s.name}</span>:null;
                })}
                {form.selectedSchools.length>5&&<span style={{background:"#f1f5f9",color:"#64748b",padding:"4px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>+{form.selectedSchools.length-5} more</span>}
              </div>
            </div>
            <div style={{marginTop:16,padding:14,background:"#fef9ec",borderRadius:10,border:"1px solid #fde68a"}}>
              <p style={{color:"#92400e",fontSize:13,margin:0,fontWeight:600}}>ℹ️ Our team will verify and activate your account within 24-48 hours.</p>
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:12,marginTop:20}}>
          {step>0&&(
            <button onClick={()=>{setStep(s=>s-1);setError("");}}
              style={{flex:1,background:"white",color:"#667eea",border:"2px solid #667eea",padding:14,borderRadius:12,fontWeight:800,cursor:"pointer",fontSize:15}}>
              ← Back
            </button>
          )}
          {step<3
            ?<button onClick={()=>{if(validate())setStep(s=>s+1);}}
              style={{flex:1,background:"linear-gradient(135deg,#667eea,#764ba2)",color:"white",border:"none",padding:14,borderRadius:12,fontWeight:800,cursor:"pointer",fontSize:15}}>
              Next →
            </button>
            :<button onClick={handleSubmit} disabled={submitting}
              style={{flex:1,background:submitting?"#94a3b8":"linear-gradient(135deg,#16a34a,#15803d)",color:"white",border:"none",padding:14,borderRadius:12,fontWeight:800,cursor:submitting?"not-allowed":"pointer",fontSize:15}}>
              {submitting?"Submitting...":"🚀 Submit Registration"}
            </button>
          }
        </div>
      </div>
    </div>
  );
}
