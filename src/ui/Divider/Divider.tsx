export function Divider({ strong }: { strong?: boolean }) {
  return (
    <hr
      style={{
        border: 0,
        borderTop: `1px solid var(--sefaria-color-${strong ? "border-strong" : "border"})`,
        margin: "var(--sefaria-space-4) 0",
        width: "100%",
      }}
    />
  );
}
