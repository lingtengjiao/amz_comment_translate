
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { initAnalytics } from "./utils/analytics";

  // 初始化用户行为分析 SDK
  initAnalytics();

  createRoot(document.getElementById("root")!).render(<App />);
  