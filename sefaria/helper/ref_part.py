from sefaria.model.ref_part import ResolvedRawRef
from sefaria.model import text
from typing import List
from collections import defaultdict


def make_html(bulk_resolved: List[List[ResolvedRawRef]], output_filename, lang='he'):
    from sefaria.utils.util import wrap_chars_with_overlaps

    def get_wrapped_text(mention, metadata):
        """

        """
        inspect_window = f'''
        <span id="inspect-window-{metadata['i']}" class="hidden inspect-window">
            <b>Input:</b>
            {mention}
            </br>
            <b>Context Ref</b>
            <table>
                <tr><td>Ref</td><td>{metadata['context_ref']}</td></tr>
                <tr><td>Type</td><td>{metadata['context_type']}</td></tr>          
            </table>
            <b>Input Ref Parts</b>
            <table>
                <tr><td>Text</td><td>{'</td><td>'.join(metadata['orig_part_strs'])}</td></tr>
                <tr><td>Type</td><td>{'</td><td>'.join(metadata['orig_part_types'])}</td></tr>
            </table>
            <b>Final Ref Parts</b>
            <table>
                <tr><td>Text</td><td>{'</td><td>'.join(metadata['final_part_strs'])}</td></tr>
                <tr><td>Type</td><td>{'</td><td>'.join(metadata['final_part_types'])}</td></tr>
            </table>
            <b>Resolved Parts</b>
            <table>
                <tr><td>Text</td><td>{'</td><td>'.join(metadata['resolved_part_strs'])}</td></tr>
                <tr><td>Type</td><td>{'</td><td>'.join(metadata['resolved_part_types'])}</td></tr>
                <tr><td>Class</td><td>{'</td><td>'.join(metadata['resolved_part_classes'])}</td></tr>
            </table>
            <button onclick="toggleWindow({metadata['i']})">Close</button>
        </span>
        '''
        start = f'<span class="{metadata["true condition"]} tag">'
        end = f'<span class="label">{metadata["label"]}</span><button class="inspect-btn" data-id="{metadata["i"]}" onclick="onInspectClick(this)">Inspect</button>{inspect_window}</span>'
        if metadata['ref'] is not None:
            ref = metadata["ref"]
            start += f'<a href="https://www.sefaria.org/{ref.url()}" target="_blank">'
            end = '</a>' + end
        return f'{start}{mention}{end}', len(start), len(end)

    html = """
    <html>
      <head>
        <style>
        body { max-width: 800px; margin-right: auto; margin-left: auto; }
        .doc { line-height: 200%; border-bottom: 2px black solid; padding-bottom: 20px; }
        .tag { padding: 5px; }
        .tp { background-color: greenyellow; border: 5px lightgreen solid; }
        .fp { background-color: pink; border: 5px lightgreen solid; }
        .fn { background-color: greenyellow; border: 5px pink solid; }
        .label { font-weight: bold; font-size: 75%; color: #666; padding-right: 5px; }
        .inspect-btn { margin: 0 5px; }
        .hidden { display: none; }
        td { border: 1px solid black; padding: 5px }
        table { margin-bottom: 20px; }
        .inspect-window {
            position: fixed;
            direction: ltr;
            top: 10px;
            right: 10px;
            background-color: #eee;
            border: 3px solid black;
            padding: 10px;
        }
        </style>
        <script>
          function onInspectClick(element) {
            closeAll();
            const i = element.getAttribute("data-id");
            toggleWindow(i);
          }
          function toggleWindow(i) {
           const curr_window = document.getElementById("inspect-window-" + i);
            if (curr_window.classList.contains("hidden")) {
                curr_window.classList.remove("hidden");
            } else {
                curr_window.classList.add("hidden");
            }
          }
          function closeAll() {
            let i = 0;
            let curr_window = null;
            while (true) {
                curr_window = document.getElementById("inspect-window-" + i);
                if (!curr_window) { break; }
                if (!curr_window.classList.contains("hidden")) {
                    curr_window.classList.add("hidden");
                }
                i++;
            }
          }
        </script>
      </head>
      <body>
    """

    for temp_resolved_list in bulk_resolved:
        chars_to_wrap = []
        if len(temp_resolved_list) == 0: continue

        input_text = temp_resolved_list[0].raw_ref.span.doc.text
        context_ref = temp_resolved_list[0].context_ref

        iwrapped = 0
        for resolved in temp_resolved_list:
            if resolved.ambiguous: continue
            start_char, end_char = resolved.raw_ref.char_indices
            metadata = {
                "label": "מקור",
                "true condition": "tp",
                "ref": resolved.ref,
                "i": iwrapped,
                "orig_part_strs": [p.text for p in resolved.raw_ref.raw_ref_parts],
                "orig_part_types": [p.type.name for p in resolved.raw_ref.raw_ref_parts],
                "final_part_strs": [p.text for p in resolved.raw_ref.parts_to_match],
                "final_part_types": [p.type.name for p in resolved.raw_ref.parts_to_match],
                "resolved_part_strs": [p.text for p in resolved.resolved_parts],
                "resolved_part_types": [p.type.name for p in resolved.resolved_parts],
                "resolved_part_classes": [p.__class__.__name__ for p in resolved.resolved_parts],
                "context_ref": resolved.context_ref.normal() if resolved.context_ref else "N/A",
                "context_type": resolved.context_type.name if resolved.context_type else "N/A",
            }
            chars_to_wrap += [(start_char, end_char, metadata)]
            iwrapped += 1
        wrapped_text = wrap_chars_with_overlaps(input_text, chars_to_wrap, get_wrapped_text)
        if context_ref is not None:
            html += f'<p class="ref">{context_ref.normal()}</p>'
        html += f"""
        <p dir="{'rtl' if lang == 'he' else 'ltr'}" class="doc">{wrapped_text}</p>
        """
    html += """
      </body>
    </html>
    """
    with open(output_filename, "w") as fout:
        fout.write(html)
