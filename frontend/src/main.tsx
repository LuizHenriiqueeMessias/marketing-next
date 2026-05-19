import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--dialog-bg)",
              border: "1px solid var(--border)",
              color: "var(--text-1)",
              fontSize: "13px",
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
