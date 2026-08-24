import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/fredoka/wght.css";
import "@fontsource-variable/nunito-sans/wght.css";
import App from "./App.jsx";
import { I18nProvider } from "./i18n/I18n.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <I18nProvider><App /></I18nProvider>
  </StrictMode>,
);
