"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function VendorLogin() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!phone || phone.length !== 10) { setError("Enter valid 10-digit phone number"); return; }
    if (!password) { setError("Password is required"); return; }

    setLoading(true);
    try {
      // Find vendor by phone
      const { data: vendor, error: fetchError } = await supabase
        .from("vendors")
        .select("id, vendor_name, phone, is_verified, is_active, password_hash")
        .eq("phone", phone)
        .maybeSingle();

      if (fetchError) throw new Error(fetchError.message);
      if (!vendor) { setError("No vendor found with this phone number"); setLoading(false); return; }
      if (!vendor.is_verified) { setError("Your account is pending approval. We will contact you within 24-48 hours."); setLoading(false); return; }
      if (!vendor.is_active) { setError("Your account has been deactivated. Please contact support."); setLoading(false); return; }

      // Simple password check (in production use bcrypt)
      if (vendor.password_hash && vendor.password_hash !== password) {
        setError("Incorrect password"); setLoading(false); return;
      }

      // Store vendor session
      localStorage.setItem("vendor_id", vendor.id);
      localStorage.setItem("vendor_name", vendor.vendor_name);
      localStorage.setItem("vendor_phone", vendor.phone);

      // Redirect to dashboard
      window.location.href = "/vendor/dashboard";

    } catch (err) {
      console.error("[login]", err);
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#667eea,#764ba2)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",padding:24}}>
      <div style={{background:"white",borderRadius:24,padding:40,width:"100%",maxWidth:400,boxShadow:"0 25px 50px rgba(0,0,0,0.2)"}}>

        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:48,marginBottom:8}}>🛒</div>
          <h1 style={{fontSize:24,fontWeight:900,color:"#1e1b4b",margin:"0 0 4px"}}>mySchoolKart</h1>
          <p style={{color:"#64748b",margin:0,fontSize:14}}>Vendor Login</p>
        </div>

        {error && (
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:12,marginBottom:20,color:"#dc2626",fontSize:14,textAlign:"center",fontWeight:600}}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:"#374151",marginBottom:6}}>Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="10-digit mobile number"
              maxLength={10}
              style={{width:"100%",padding:"12px 16px",borderRadius:10,border:"2px solid #e2e8f0",fontSize:15,outline:"none",boxSizing:"border-box"}}
            />
          </div>

          <div style={{marginBottom:24}}>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:"#374151",marginBottom:6}}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              style={{width:"100%",padding:"12px 16px",borderRadius:10,border:"2px solid #e2e8f0",fontSize:15,outline:"none",boxSizing:"border-box"}}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{width:"100%",background:loading?"#94a3b8":"linear-gradient(135deg,#667eea,#764ba2)",color:"white",border:"none",padding:"14px",borderRadius:12,fontSize:16,fontWeight:800,cursor:loading?"not-allowed":"pointer"}}>
            {loading ? "Logging in..." : "Login →"}
          </button>
        </form>

        <div style={{marginTop:24,textAlign:"center"}}>
          <p style={{color:"#64748b",fontSize:14,margin:"0 0 8px"}}>New vendor?</p>
          <a href="/vendor/register"
            style={{color:"#667eea",fontWeight:700,textDecoration:"none",fontSize:14}}>
            Register your shop →
          </a>
        </div>

        <div style={{marginTop:16,padding:14,background:"#f8fafc",borderRadius:10,textAlign:"center"}}>
          <p style={{color:"#94a3b8",fontSize:12,margin:0}}>
            Having trouble logging in? Contact us on WhatsApp
          </p>
        </div>
      </div>
    </div>
  );
}