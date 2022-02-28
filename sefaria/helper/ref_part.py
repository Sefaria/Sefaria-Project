from sefaria.model.ref_part import ResolvedRawRef
from sefaria.model import text
from typing import List
from collections import defaultdict


def make_html(bulk_resolved: List[List[ResolvedRawRef]], output_filename, lang='he'):
    from sefaria.utils.util import wrap_chars_with_overlaps

    def get_wrapped_text(mention, metadata):
        start = f'<span class="{metadata["true condition"]} tag">'
        end = f'<span class="label">{metadata["label"]}</span></span>'
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
        </style>
      </head>
      <body>
    """

    for temp_resolved_list in bulk_resolved:
        chars_to_wrap = []
        if len(temp_resolved_list) == 0: continue

        input_text = temp_resolved_list[0].raw_ref.span.doc.text
        context_ref = temp_resolved_list[0].context_ref

        for resolved in temp_resolved_list:
            if resolved.ambiguous: continue  # TODO maybe just default to bavli here
            start_char, end_char = resolved.raw_ref.char_indices
            chars_to_wrap += [(start_char, end_char, {"label": "מקור", "true condition": "tp", "ref": resolved.ref})]
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
