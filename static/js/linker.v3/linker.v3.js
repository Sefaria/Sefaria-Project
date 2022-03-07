import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
const SEFARIA_BASE_URL = 'http://localhost:8000'

const documentClone = document.cloneNode(true);
for (let tableEl of documentClone.getElementsByTagName('table')) {
    tableEl.remove();
}
const article = new Readability(documentClone).parse();
const cleanedArticleHTML = DOMPurify.sanitize(article.content, { USE_PROFILES: { html: true } });
const cleanedArticle = document.createElement("div");
cleanedArticle.innerHTML = cleanedArticleHTML;

console.log(cleanedArticle.textContent);
const postData = {
    text: cleanedArticle.textContent,
    url: window.location.href,
    title: article.title,
}
console.log('hello', postData);

fetch(`${SEFARIA_BASE_URL}/api/wrap-refs`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(postData)
}).then(() => alert("Linker results are ready!"))