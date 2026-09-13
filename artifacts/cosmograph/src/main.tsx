import { createRoot } from "react-dom/client";
import App from "./App";
import { setBaseUrl } from "@workspace/api-client-react";
import "./index.css";

const apiBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
setBaseUrl(apiBasePath || null);

createRoot(document.getElementById("root")!).render(<App />);
