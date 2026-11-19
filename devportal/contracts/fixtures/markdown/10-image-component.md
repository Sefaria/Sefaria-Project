Centered, no other attributes:

<Image align="center" src="https://files.readme.io/a-centered.png" />

Width with live's trailing space, and pixels:

<Image align="center" width="70% " src="https://files.readme.io/b-width.png" />

<Image src="https://files.readme.io/c-px.png" align="center" width="500px" />

Border true and false:

<Image src="https://files.readme.io/d-border.png" align="center" width="60% " border={true} />

<Image alt="No border" border={false} src="https://files.readme.io/e-noborder.png" />

Alt without caption (the button is still labelled "Expand image"):

<Image src="https://files.readme.io/f-alt.png" alt="Annotated response of the Shape API" align="center" width="500px" />

Caption without alt:

<Image src="https://files.readme.io/g-caption.png" align="center" caption="Middleware implementation example" />

Caption and alt (the button is labelled with the alt):

<Image align="center" alt="A Single-Node-Tree for a Simple Text" caption="A Single-Node Tree for a *Simple* Text" src="https://files.readme.io/h-both.png" width="50% " />

Framed, bordered, captioned:

<Image src="https://files.readme.io/i-framed.png" align="center" caption="Reader sidebar view BEFORE launch" border={true} framed={true} />

Left and right alignment, a bad width, and a multi-line tag:

<Image align="left" src="https://files.readme.io/j-left.png" />

<Image
  align="right"
  width="calc(100% - 1px)"
  src="https://files.readme.io/k-right.png"
/>
