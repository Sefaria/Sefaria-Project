These attributes are elaborated in the following table:

<Table align={["left","left","left"]}>
  <thead>
    <tr>
      <th>
        Attribute
      </th>

      <th>
        Value in

        `Genesis`
      </th>

      <th>
        Description
      </th>
    </tr>
  </thead>

  <tbody>
    <tr>
      <td>
        `dependence`
      </td>

      <td>
        `String`
      </td>

      <td>
        Generally `Commentary` or `Targum`.
      </td>
    </tr>

    <tr>
      <td>
        `titles`
      </td>

      <td>
        ```
        [
           {"lang" : "en"}
        ]
        ```
      </td>

      <td>
        An array of dictionaries (see [Node Titles](doc:node-titles)):

        * `text` : The title string
        * `lang`: Either `"en"` or `"he"`
      </td>
    </tr>

    <tr>
      <td>
        `toc_zoom`
      </td>

      <td>
        `2`
      </td>

      <td>
        Usually, a commentary is organized by segments.

        `toc_zoom` sets the depth:\
        `0` will display segments.

        An example can be found [here](https://www.sefaria.org/Genesis).
      </td>
    </tr>
  </tbody>
</Table>

<Table align={["center","right"]}>
  <tbody>
    <tr>
      <td>
        No thead; centered
      </td>
      <td>
        right
      </td>
      <td>
        third column has no alignment
      </td>
    </tr>
  </tbody>
</Table>
