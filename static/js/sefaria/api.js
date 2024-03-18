// export default async function read(url, headers = {}) {
//     const response = await fetch(url, {
//         method: 'GET',
//         headers: headers,
//         credentials: 'include',
//     });
//     return response.json();
// }

import Sefaria from "./sefaria";

export default async function read(url) {
    const r = await Sefaria._ApiPromise(url);
    return r;
}