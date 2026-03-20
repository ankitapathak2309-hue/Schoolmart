"use client";
import { useEffect } from "react";
export default function TestAuth() {
  useEffect(() => {
    localStorage.setItem("vendor_id", "1");
    window.location.href = "/vendor/products";
  }, []);
  return <div style={{padding:40,fontFamily:"system-ui"}}>Setting up vendor session...</div>;
}
