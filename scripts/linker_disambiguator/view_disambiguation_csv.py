"""
Streamlit viewer for disambiguation CSV exported by export_disambiguation_tmp_to_csv.py

Run:
    streamlit run scripts/view_disambiguation_csv.py -- --csv output.csv
or drop a file via the sidebar uploader.

Annotations are written to the 'correcness' column (preserving original typo)
and saved back to the same file (or a download button if loaded via upload).
"""
import argparse
import sys
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Disambiguation Viewer", layout="wide")

parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--csv", default=None)
args, _ = parser.parse_known_args(sys.argv[1:])

st.sidebar.header("Data source")
uploaded = st.sidebar.file_uploader("Upload CSV", type="csv")

def load(path_or_buf):
    return pd.read_csv(path_or_buf, dtype=str).fillna("")

# ── Session-state dataframe (mutable, survives reruns) ────────────────────────
if "df" not in st.session_state:
    if uploaded:
        st.session_state.df = load(uploaded)
        st.session_state.csv_path = None
    elif args.csv:
        st.session_state.df = load(args.csv)
        st.session_state.csv_path = args.csv
    else:
        st.info("Pass `-- --csv <path>` on the command line or upload a file in the sidebar.")
        st.stop()

df = st.session_state.df

# ── Filters ───────────────────────────────────────────────────────────────────
st.sidebar.header("Filters")

case_types = ["(all)"] + sorted(df["case_type"].unique().tolist())
case_type = st.sidebar.selectbox("case_type", case_types)

success_vals = ["(all)"] + sorted(df["success"].unique().tolist())
success = st.sidebar.selectbox("success", success_vals)

methods = ["(all)"] + sorted(df["result_method"].unique().tolist())
method = st.sidebar.selectbox("result_method", methods)

correctness_opts = ["(all)", "(unannotated)", "correct", "incorrect"]
correctness_filter = st.sidebar.selectbox("correcness", correctness_opts)

search = st.sidebar.text_input("Search payload_text")

mask = pd.Series(True, index=df.index)
if case_type != "(all)":
    mask &= df["case_type"] == case_type
if success != "(all)":
    mask &= df["success"] == success
if method != "(all)":
    mask &= df["result_method"] == method
if correctness_filter == "(unannotated)":
    mask &= df["correcness"] == ""
elif correctness_filter in ("correct", "incorrect"):
    mask &= df["correcness"] == correctness_filter
if search:
    mask &= df["payload_text"].str.contains(search, case=False, na=False)

filtered_idx = df.index[mask].tolist()
total = len(filtered_idx)

# ── Summary ───────────────────────────────────────────────────────────────────
n_true = (df.loc[filtered_idx, "success"].str.upper() == "TRUE").sum()
n_annotated = (df["correcness"] != "").sum()
n_correct = (df["correcness"] == "correct").sum()

st.title("Disambiguation Results")
c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Rows (filtered)", total)
c2.metric("Success=TRUE", n_true)
c3.metric("Success rate", f"{n_true/total:.1%}" if total else "—")
c4.metric("Annotated", f"{n_annotated}/{len(df)}")
c5.metric("Marked correct", n_correct)

display_cols = ["case_type", "success", "correcness", "result_method",
                "payload_ref", "payload_text", "result_matched_segment", "result_resolved_ref"]
st.dataframe(df.loc[filtered_idx, display_cols], use_container_width=True, height=280)

# ── Row detail + annotation ───────────────────────────────────────────────────
st.subheader("Row detail")

if not total:
    st.warning("No rows match the current filters.")
    st.stop()

if "row_pos" not in st.session_state:
    st.session_state.row_pos = 0
st.session_state.row_pos = min(st.session_state.row_pos, total - 1)

nav_col, _, save_col = st.columns([2, 4, 2])
with nav_col:
    pos = st.number_input("Row (0-based in filtered set)", 0, total - 1,
                          value=st.session_state.row_pos, step=1)

real_idx = filtered_idx[int(pos)]
row = df.loc[real_idx]

left, right = st.columns(2)
with left:
    st.markdown("**Payload ref:** " + row["payload_ref"])
    st.markdown("**Citation text:** " + row["payload_text"])
    st.markdown("**Hebrew context** (`{{ }}` = citation span):")
    st.text(row["payload_ref_he"])
    st.markdown("**English context:**")
    st.text(row["payload_ref_en"])

with right:
    result_ref = row["result_matched_segment"] or row["result_resolved_ref"]
    st.markdown("**Result ref:** " + result_ref)
    st.markdown("**Method:** " + row["result_method"])
    st.markdown("**LLM phrase:** " + row["result_llm_resolved_phrase"])
    st.markdown("**Result Hebrew:**")
    st.text(row["result_ref_he"])
    st.markdown("**Result English:**")
    st.text(row["result_ref_en"])
    st.markdown(f"**Success:** `{row['success']}`")
    if row["error"]:
        st.error(row["error"])

# ── Annotation buttons ────────────────────────────────────────────────────────
current = df.at[real_idx, "correcness"]
label = f"Current annotation: **{current}**" if current else "Not yet annotated"
st.markdown(label)

a1, a2, a3 = st.columns([1, 1, 4])
if a1.button("✓ Correct", type="primary"):
    df.at[real_idx, "correcness"] = "correct"
    st.session_state.row_pos = min(int(pos) + 1, total - 1)
    st.rerun()
if a2.button("✗ Incorrect", type="secondary"):
    df.at[real_idx, "correcness"] = "incorrect"
    st.session_state.row_pos = min(int(pos) + 1, total - 1)
    st.rerun()
if current and a3.button("Clear annotation"):
    df.at[real_idx, "correcness"] = ""
    st.rerun()

# ── Save ──────────────────────────────────────────────────────────────────────
st.divider()
csv_path = st.session_state.get("csv_path")
if csv_path:
    if st.button(f"Save annotations to {csv_path}"):
        df.to_csv(csv_path, index=False)
        st.success("Saved.")
else:
    csv_bytes = df.to_csv(index=False).encode()
    st.download_button("Download annotated CSV", csv_bytes, "annotated.csv", "text/csv")
