import { createFileRoute } from "@tanstack/react-router";
import { Link } from "~/ui/Link/Link";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";

export const Route = createFileRoute("/")({ component: Home });

const SAMPLES: [string, string, string][] = [
  ["Genesis.1", "Genesis 1", "Tanakh · Torah (parasha headers)"],
  ["Psalms.23", "Psalms 23", "Poetry"],
  ["Berakhot.2a", "Berakhot 2a", "Talmud Bavli (continuous)"],
  ["Jerusalem_Talmud_Berakhot.1.1", "Jerusalem Talmud Berakhot 1:1", "Yerushalmi (3 levels, page overlays)"],
  ["Mishnah_Berakhot.1", "Mishnah Berakhot 1", "Mishnah"],
  ["Rashi_on_Genesis.1.1", "Rashi on Genesis 1:1", "Commentary"],
  ["Shulchan_Arukh,_Orach_Chayim.1", "Shulchan Arukh, Orach Chayim 1", "Code of law (itags)"],
  ["Pesach_Haggadah,_Kadesh", "Pesach Haggadah, Kadesh", "Liturgy (complex schema)"],
  ["Jastrow,_אַבָּא_I.1", "Jastrow, אַבָּא I", "Dictionary"],
];

function Home() {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--sefaria-space-8) var(--sefaria-space-4)" }}>
      <h1><InterfaceText en="Sefaria Reader" he="קורא ספריא" /></h1>
      <ul>
        {SAMPLES.map(([path, label, note]) => (
          <li key={path}>
            <Link href={`/${path}`}>{label}</Link> <small style={{ color: "var(--sefaria-color-text-secondary)" }}>{note}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
