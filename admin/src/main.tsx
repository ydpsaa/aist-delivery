import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { getAuthToken } from "./lib/auth";

import { setAuthTokenGetter } from "@workspace/api-client-react";
setAuthTokenGetter(getAuthToken);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
