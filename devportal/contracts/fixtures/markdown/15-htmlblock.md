Before the block.

<HTMLBlock>{`
<style>
  .pbs-cta { display: flex; }
</style>
<div class="pbs-cta" style="background: #653259">
  <a class="pbs-cta-btn" href="https://powered-by.sefaria.org" target="_blank" rel="noopener">See the projects</a>
  <span>Escaped \`backtick\` and \${template}</span>
</div>
<script>alert("never runs: the frame has no allow-scripts")</script>
`}</HTMLBlock>

## A heading between two blocks

<HTMLBlock>{`
<div dir="rtl">
  <h2>איך ליצור מראי מקורות להפניה</h2>
</div>
`}</HTMLBlock>

After the blocks.
