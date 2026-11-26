<script>alert(1)</script>

<img src="x" onerror="alert(2)">

[click](javascript:alert(3)) and [data](data:text/html;base64,PHNjcmlwdD5hbGVydCg0KTwvc2NyaXB0Pg==) and <a href="javascript:alert(5)">raw</a> and <a href="JaVaScRiPt:alert(6)">mixed case</a>.

<p style="position:fixed;top:0" onclick="alert(7)" class="evil dp-ok">styled</p>

<iframe src="https://evil.example/"></iframe>

<iframe src="/_portal/htmlblock/1/0" sandbox="allow-scripts allow-same-origin"></iframe>

<iframe src="https://www.youtube-nocookie.com/embed/abc" sandbox="allow-scripts allow-top-navigation" onload="alert(8)"></iframe>

<object data="x.swf"></object><embed src="x.swf"><form action="https://evil.example"><input name="q"></form>

<style>body { display: none }</style>

<Cards columns={3}><Accordion title="Unknown component">text survives, tags do not</Accordion></Cards>

<Callout icon="🚧" theme="warn">
  <script>alert(9)</script>
  <a href="javascript:alert(10)" onmouseover="alert(11)">nested in a callout</a>
</Callout>

<Table align={["left"]}>
  <tbody>
    <tr>
      <td>
        <img src=x onerror=alert(12)> <span style="color:red">cell</span>
      </td>
    </tr>
  </tbody>
</Table>

<Image src="javascript:alert(13)" caption="<img src=x onerror=alert(14)>" />

<svg onload="alert(15)"><circle r="1"/></svg>

<h2 id="forged" onclick="alert(16)">Raw heading</h2>

<a href="https://www.sefaria.org" target="_blank" rel="opener">target and rel are dropped</a>
