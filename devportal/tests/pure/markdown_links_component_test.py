"""Link rewriting inside components follows the renderer's parsing (regression: links in indented table cells)."""

from devportal.markdown import rewrite_markdown_links

TABLE = """<Table align={["left","left"]}>
  <tbody>
    <tr>
      <td>
        ```json
        {"see": "[not a link](doc:inside-code)"}
        ```
      </td>

      <td>
        A description (see [Titles](doc:node-titles). More text.

        * `text` : The title string
      </td>
    </tr>
  </tbody>
</Table>
"""


def test_link_in_indented_table_cell_is_rewritten():
    out, _ = rewrite_markdown_links(TABLE)
    assert "[Titles](/docs/node-titles)" in out


def test_code_fence_inside_table_cell_is_left_alone():
    out, _ = rewrite_markdown_links(TABLE)
    assert "(doc:inside-code)" in out


def test_callout_body_is_parsed_dedented():
    src = '<Callout icon="📘" theme="info">\n        See [Shape](ref:get-shape) for details.\n</Callout>\n'
    out, _ = rewrite_markdown_links(src)
    assert "[Shape](/reference/get-shape)" in out


def test_top_level_indented_code_is_still_code():
    src = "Intro.\n\n    [x](doc:inside-indented-code)\n"
    out, _ = rewrite_markdown_links(src)
    assert "(doc:inside-indented-code)" in out
