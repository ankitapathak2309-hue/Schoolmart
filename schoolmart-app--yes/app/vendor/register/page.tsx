"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Category = { id: number; name: string; icon: string };
type School = { id: number; name: string; board: string };

const STEPS = ["Shop Details", "What You Sell", "Schools You Serve", "Review & Submit"];

function validatePhone(phone: string): string | null {
  const cleaned = phone.replace(/\s/g, "");
  if (!cleaned) return "Phone number is required";
  if (!/^\d{10}$/.test(cleaned)) return "Phone must be exactly 10 digits";
  return null;
}

function validatePincode(pincode: string): string | null {
  if (!pincode) return "Pincode is required";
  if (!/^\d{6}$/.test(pincode)) return "Pincode must be exactly 6 digits";
  return null;
}

export default function VendorRegister() {
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    business_name: "",
    owner_name: "",
    phone: "",
    email: "",
    address: "",
    area: "",
    pincode: "",
    selectedCategories: [] as number[],
    selectedSchools: [] as number[],
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
      setCategories(cats ?? []);
      setSchools(schs ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load data";
      console.error("[loadData]", msg);
      setLoadError("Could not load registration data. Please refresh the page.");
    }
  };

  const toggleCategory = (id: number) => {
    setForm(prev => ({
      ...prev,
      selectedCategories: prev.selectedCategories.includes(id)
        ? prev.selectedCategories.filter(c => c !== id)
        : [...prev.selectedCategories, id]
    }));
  };

  const toggleSchool = (id: number) => {
    setForm(prev => ({
      ...prev,
      selectedSchools: prev.selectedSchools.includes(id)
        ? prev.selectedSchools.filter(s => s !== id)
        : [...prev.selectedSchools, id]
    }));
  };

  const validateStep = (): boolean => {
    setError("");
    if (step === 0) {
      if (!form.business_name.trim()) { setError("Shop name is required"); return false; }
      const phoneErr = validatePhone(form.phone);
      if (phoneErr) { setError(phoneErr); return false; }
      if (!form.area.trim()) { setError("Area is required"); return false; }
      const pincodeErr = validatePincode(form.pincode);
      if (pincodeErr) { setError(pincodeErr); return false; }
    }
    if (step === 1 && form.selectedCategories.length === 0) {
      setError("Please select at least one category"); return false;
    }
    if (step === 2 && form.selectedSchools.length === 0) {
      setError("Please select at least one school"); return false;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const cleanPhone = form.phone.replace(/\s/g, "");

      const { data: existing, error: checkError } = await supabase
        .from("vendors")
        .select("id")
        .eq("phone", cleanPhone)
        .maybeSingle();

      if (checkError) throw new Error(checkError.message);
      if (existing) {
        setError("A vendor with this phone number is already registered.");
        setSubmitting(false);
        return;
      }

      const { data: vendor, error: vendorError } = await supabase
        .from("vendors")
        .insert({
          vendor_name: form.business_name.trim(),
          owner_name: form.owner_name.trim() || null,
          phone: cleanPhone,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          area: form.area.trim(),
          pincode: form.pincode.trim(),
          is_verified: false,
          is_active: false,
        })
        .select("id")
        .single();

      if (vendorError) throw new Error(vendorError.message);
      const vendorId = vendor.id;

      await supabase.from("vendor_service_areas").insert({
        vendor_id: vendorId,
        pincode: form.pincode.trim(),
        delivery_charge: 0,
        estimated_minutes: 30,
      });

      const { data: branches } = await supabase
        .from("branches")
        .select("id, school_id")
        .in("school_id", form.selectedSchools)
        .eq("is_active", true);

      if (branches && branches.length > 0) {
        const approvals = branches.map(branch => ({
          vendor_id: vendorId,
          branch_id: branch.id,
          status: "pending",
        }));
        await supabase.from("school_vendor_approvals").insert(approvals);
      }

      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please try again.";
      console.error("[handleSubmit]", msg);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <p style={{ color: "#dc2626", fontWeight: 700, marginBottom: 16 }}>{loadError}</p>
        <button onClick={loadData}
          style={{ background: "#667eea", color: "white", border: "none", padding: "12px 24px", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>
          Retry
        </button>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea, #764ba2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", padding: 24 }}>
      <div style={{ background: "white", borderRadius: 24, padding: 40, textAlign: "center", maxWidth: 400, width: "100%" }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: "#1e1b4b", marginBottom: 8 }}>Registration Submitted!</h2>
        <p style={{ color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
          Thank you for registering with <strong>mySchoolKart</strong>. Our team will review your application and activate your account within <strong>24-48 hours</strong>.
        </p>
        <div style={{ background: "#f0fdf4", borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <p style={{ color: "#16a34a", fontWeight: 700, margin: 0, fontSize: 14 }}>
            ✅ You will be contacted on {form.phone}
          </p>
        </div>
        <a href="/"
          style={{ display: "block", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", padding: "14px", borderRadius: 12, fontWeight: 800, textDecoration: "none", fontSize: 16 }}>
          Back to Home
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#f8fafc" }}>

      <div style={{ background: "linear-gradient(135deg, #667eea, #764ba2)", padding: "16px 24px", boxShadow: "0 4px 20px rgba(102,126,234,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 600, margin: "0 auto" }}>
          <div style={{ background: "white", borderRadius: 10, padding: "6px 10px", fontSize: 20 }}>🛒</div>
          <div>
            <div style={{ color: "white", fontWeight: 800, fontSize: 18 }}>mySchoolKart</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}>Vendor Registration</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 80px" }}>

        <div style={{ display: "flex", marginBottom: 28, gap: 4 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 4, borderRadius: 4, marginBottom: 6, background: i <= step ? "#667eea" : "#e2e8f0", transition: "background 0.3s" }} />
              <span style={{ fontSize: 10, color: i <= step ? "#667eea" : "#94a3b8", fontWeight: i === step ? 800 : 500 }}>
                {s}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 12, marginBottom: 16, color: "#dc2626", fontSize: 14, textAlign: "center", fontWeight: 600 }}>
            {error}
          </div>
        )}

        {step === 0 && (
          <div style={{ background: "white", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <h2 style={{ margin: "0 0 6px", fontWeight: 900, color: "#1e1b4b", fontSize: 20 }}>🏪 Shop Details</h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>Tell us about your business</p>
            {[
              { label: "Shop / Business Name *", key: "business_name", placeholder: "e.g. Good Luck Stationery", type: "text" },
              { label: "Owner Name", key: "owner_name", placeholder: "Your full name", type: "text" },
              { label: "Phone Number *", key: "phone", placeholder: "10-digit mobile number", type: "tel" },
              { label: "Email Address", key: "email", placeholder: "shop@example.com (optional)", type: "email" },
              { label: "Shop Address", key: "address", placeholder: "Full shop address", type: "text" },
              { label: "Area / Locality *", key: "area", placeholder: "e.g. Andheri West", type: "text" },
              { label: "Pincode *", key: "pincode", placeholder: "6-digit pincode", type: "tel" },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{field.label}</label>
                <input
                  type={field.type}
                  value={(form as any)[field.key]}
                  onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  maxLength={field.key === "phone" ? 10 : field.key === "pincode" ? 6 : undefined}
                  style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            ))}
          </div>
        )}

        {step === 1 && (
          <div style={{ background: "white", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <h2 style={{ margin: "0 0 6px", fontWeight: 900, color: "#1e1b4b", fontSize: 20 }}>📦 What Do You Sell?</h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>Select all categories you offer</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {categories.map(cat => {
                const selected = form.selectedCategories.includes(cat.id);
                return (
                  <div key={cat.id} onClick={() => toggleCategory(cat.id)}
                    style={{ padding: 16, borderRadius: 12, border: "2px solid", borderColor: selected ? "#667eea" : "#e2e8f0", background: selected ? "#667eea11" : "white", cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
                    <div style={{ fontSize: 32, marginBottom: 6 }}>{cat.icon}</div>
                    <div style={{ fontWeight: 700, color: selected ? "#667eea" : "#374151", fontSize: 13 }}>{cat.name}</div>
                    {selected && <div style={{ color: "#667eea", fontSize: 18, fontWeight: 900, marginTop: 4 }}>✓</div>}
                  </div>
                );
              })}
            </div>
            <p style={{ color: "#94a3b8", fontSize: 12, textAlign: "center", marginTop: 12 }}>
              {form.selectedCategories.length} categories selected
            </p>
          </div>
        )}

        {step === 2 && (
          <div style={{ background: "white", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <h2 style={{ margin: "0 0 6px", fontWeight: 900, color: "#1e1b4b", fontSize: 20 }}>🏫 Which Schools Do You Serve?</h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>Select schools you supply to</p>
            <div onClick={() => setForm(p => ({
              ...p,
              selectedSchools: p.selectedSchools.length === schools.length ? [] : schools.map(s => s.id)
            }))}
              style={{ padding: "12px 16px", borderRadius: 10, border: "2px solid #667eea", background: "#667eea11", cursor: "pointer", marginBottom: 12, textAlign: "center", fontWeight: 700, color: "#667eea" }}>
              {form.selectedSchools.length === schools.length ? "✓ Deselect All" : "Select All Schools"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {schools.map(school => {
                const selected = form.selectedSchools.includes(school.id);
                return (
                  <div key={school.id} onClick={() => toggleSchool(school.id)}
                    style={{ padding: "12px 16px", borderRadius: 12, border: "2px solid", borderColor: selected ? "#667eea" : "#e2e8f0", background: selected ? "#667eea11" : "white", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ margin: "0 0 2px", fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{school.name}</p>
                      <span style={{ background: selected ? "#667eea" : "#f1f5f9", color: selected ? "white" : "#64748b", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                        {school.board}
                      </span>
                    </div>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid", borderColor: selected ? "#667eea" : "#e2e8f0", background: selected ? "#667eea" : "white", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 14, fontWeight: 900, flexShrink: 0 }}>
                      {selected ? "✓" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ color: "#94a3b8", fontSize: 12, textAlign: "center", marginTop: 12 }}>
              {form.selectedSchools.length} schools selected
            </p>
          </div>
        )}

        {step === 3 && (
          <div style={{ background: "white", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <h2 style={{ margin: "0 0 6px", fontWeight: 900, color: "#1e1b4b", fontSize: 20 }}>✅ Review & Submit</h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>Confirm your details before submitting</p>
            {[
              { label: "Shop Name", value: form.business_name },
              { label: "Owner", value: form.owner_name || "—" },
              { label: "Phone", value: form.phone },
              { label: "Email", value: form.email || "—" },
              { label: "Area", value: `${form.area}, ${form.pincode}` },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ color: "#64748b", fontSize: 14 }}>{row.label}</span>
                <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{row.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <p style={{ fontWeight: 700, color: "#374151", marginBottom: 8, fontSize: 14 }}>Categories:</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {form.selectedCategories.map(id => {
                  const cat = categories.find(c => c.id === id);
                  return cat ? (
                    <span key={id} style={{ background: "#667eea22", color: "#667eea", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                      {cat.icon} {cat.name}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <p style={{ fontWeight: 700, color: "#374151", marginBottom: 8, fontSize: 14 }}>Schools ({form.selectedSchools.length}):</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {form.selectedSchools.slice(0, 5).map(id => {
                  const school = schools.find(s => s.id === id);
                  return school ? (
                    <span key={id} style={{ background: "#f0fdf4", color: "#16a34a", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                      {school.name}
                    </span>
                  ) : null;
                })}
                {form.selectedSchools.length > 5 && (
                  <span style={{ background: "#f1f5f9", color: "#64748b", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                    +{form.selectedSchools.length - 5} more
                  </span>
                )}
              </div>
            </div>
            <div style={{ marginTop: 20, padding: 14, background: "#fef9ec", borderRadius: 10, border: "1px solid #fde68a" }}>
              <p style={{ color: "#92400e", fontSize: 13, margin: 0, fontWeight: 600 }}>
                ℹ️ After submission, our team will verify your details and activate your account within 24-48 hours.
              </p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          {step > 0 && (
            <button onClick={() => { setStep(s => s - 1); setError(""); }}
              style={{ flex: 1, background: "white", color: "#667eea", border: "2px solid #667eea", padding: "14px", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
              ← Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={handleNext}
              style={{ flex: 1, background: "linear-gradient(135deg, #667eea, #764ba2)", color: "white", border: "none", padding: "14px", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
              Next →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}
              style={{ flex: 1, background: submitting ? "#94a3b8" : "linear-gradient(135deg, #16a34a, #15803d)", color: "white", border: "none", padding: "14px", borderRadius: 12, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer", fontSize: 15 }}>
              {submitting ? "Submitting..." : "🚀 Submit Registration"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
