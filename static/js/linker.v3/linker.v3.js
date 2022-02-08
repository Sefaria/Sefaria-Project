import { Readability } from '@mozilla/readability';
const SEFARIA_BASE_URL = 'http://localhost:8000'

const documentClone = document.cloneNode(true);
const article = new Readability(documentClone).parse();

console.log(article.textContent);
const postData = {
    text: article.textContent,
    url: window.location.href,
    title: article.title,
}
console.log('hello', postData);

fetch(`${SEFARIA_BASE_URL}/api/wrap-refs`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(postData)
})