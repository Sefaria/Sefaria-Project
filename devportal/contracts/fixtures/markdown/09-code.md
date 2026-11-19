A fence without a language has no tab chrome:

```
"title": "Ramban on Genesis"
"base_text_titles": ["Genesis"]
```

A fence with a language gets one tab, labelled with the language's display name:

```python
import django

django.setup()
```

```json
{"title": "Genesis"}
```

```javascript
const x = 1;
```

```typescript
let y: number = 2;
```

```bash
./cli -i
```

```curl
curl https://www.sefaria.org/api/v3/texts/Genesis.1
```

```text
plain text
```

```html
<p>escaped &amp; shown as text</p>
```

An unknown language is its own label:

```elixir
IO.puts("hi")
```

A word after the language is the tab label:

```text JSON
{"a": 1}
```

```html OPML
<opml version="2.0"></opml>
```

```javascript React
export default App;
```

```Text React
<App />
```

```python python
print("label keeps its case")
```

~~~json
{"tilde": true}
~~~

Indented code:

    def indented():
        return True

Inline `<code>` with `&amp;` stays literal.
