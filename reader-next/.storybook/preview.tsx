import type { Preview } from "@storybook/react-vite";
import { InterfaceLangProvider, type InterfaceLang } from "../src/lib/i18n/interface-lang";
import "../src/ui/tokens/fonts.css";
import "../src/ui/tokens/tokens.css";
import "../src/ui/tokens/base.css";

const preview: Preview = {
  globalTypes: {
    interfaceLang: {
      description: "Interface language",
      toolbar: { title: "Interface", icon: "globe", items: [{ value: "english", title: "English" }, { value: "hebrew", title: "עברית (RTL)" }], dynamicTitle: true },
    },
    theme: {
      description: "Theme",
      toolbar: { title: "Theme", icon: "circlehollow", items: [{ value: "light", title: "Light" }, { value: "dark", title: "Dark" }, { value: "sepia", title: "Sepia" }], dynamicTitle: true },
    },
  },
  // The story tests run as a matrix (CODE_REVIEW §3.8): `npm run test:stories` (English, light), `test:stories:hebrew` (Hebrew, RTL)
  // and `test:stories:dark` (dark theme; not yet a gate until every colour is a token). A story can pin its own globals.
  initialGlobals: { interfaceLang: import.meta.env.VITE_SB_LANG ?? "english", theme: import.meta.env.VITE_SB_THEME ?? "light" },
  decorators: [
    (Story, ctx) => {
      const lang = (ctx.globals.interfaceLang ?? "english") as InterfaceLang;
      document.documentElement.dataset.theme = ctx.globals.theme ?? "light";
      document.documentElement.lang = lang === "hebrew" ? "he" : "en";
      document.documentElement.dir = lang === "hebrew" ? "rtl" : "ltr";
      return (
        <InterfaceLangProvider lang={lang}>
          <Story />
        </InterfaceLangProvider>
      );
    },
  ],
  parameters: {
    layout: "centered",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: "error" },
    backgrounds: { disable: true },
    viewport: {
      options: {
        mobile: { name: "Mobile (375)", styles: { width: "375px", height: "812px" } },
        tablet: { name: "Tablet (768)", styles: { width: "768px", height: "1024px" } },
        desktop: { name: "Desktop (1280)", styles: { width: "1280px", height: "860px" } },
      },
    },
  },
};
export default preview;
